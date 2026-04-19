/**
 * Single-source-of-truth helpers for broadcast subscriber management.
 *
 * Previous design had TWO tables (broadcast_subscribers +
 * broadcast_unsubscribes) reconciled via UNION on every read. Owner hit
 * too many bugs — format drift, stale rows blocking sends, legacy data
 * that only existed in one table and 404'd the other.
 *
 * v2 stores everything in broadcast_contacts (one row per
 * (business_id, phone_number)) with a `subscribed` boolean. The row
 * is created on first contact (booking, manual add, public opt-in)
 * and flips between subscribed=true/false forever after.
 *
 * Phone is stored in CANONICAL form ("0501234567") — every write
 * passes through `toCanonical` so exact-string comparisons always work.
 * No more regexp_replace-everywhere.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Normalise an Israeli phone to the canonical local form.
 * Duplicates the function in lib/unsubscribeToken.ts intentionally —
 * imports between lib files cause circular resolution in a few spots,
 * and the logic is trivially short to repeat.
 */
export function toCanonical(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  return digits;
}

// ── Source tags ────────────────────────────────────────────────────────────
// Kept as string-typed helpers so new sources can be added without a
// type-system change. The two lists drive the UI's "can the owner
// reverse this opt-out?" decision: owner-initiated → yes, everything
// else → no (תיקון 40).

export const OWNER_INITIATED_OUT_SOURCES = new Set(["manual_remove"]);
export const CUSTOMER_INITIATED_OUT_SOURCES = new Set([
  "unsub_link",       // clicked our /api/u/<token> link
  "reply",            // replied "הסר" to an Inforu SMS
  "reply_legacy",     // legacy-migrated reply
  "inforu_self_link", // clicked the Inforu account-level unsub link
]);

export function isCustomerOptOut(source: string | null | undefined): boolean {
  return typeof source === "string" && CUSTOMER_INITIATED_OUT_SOURCES.has(source);
}

// ── Writes ─────────────────────────────────────────────────────────────────

/**
 * Mark a contact as subscribed. Creates the row if missing, flips an
 * existing row back to subscribed=true and clears the opt-out metadata.
 *
 * Does NOT check the legal guard — callers must separately verify that
 * the re-subscribe is legitimate (e.g., customer's own positive action,
 * or owner reversing their own manual_remove). The guard lives in the
 * endpoint layer, not here.
 */
export async function upsertSubscribed(opts: {
  businessId: number;
  phone: string;
  source: string;
}): Promise<void> {
  const canonical = toCanonical(opts.phone);
  if (!canonical) return;
  await db.execute(sql`
    INSERT INTO broadcast_contacts (business_id, phone_number, subscribed, opt_in_source)
    VALUES (${opts.businessId}, ${canonical}, TRUE, ${opts.source})
    ON CONFLICT (business_id, phone_number)
    DO UPDATE SET
      subscribed      = TRUE,
      opt_in_source   = ${opts.source},
      opt_out_source  = NULL,
      opt_out_at      = NULL,
      updated_at      = NOW()
  `);
}

/**
 * Auto-subscribe on a new booking — same write as upsertSubscribed but
 * DOES check the current opt-out source, so a returning customer who
 * previously opted out doesn't get re-added behind their back.
 */
export async function autoSubscribeFromBooking(opts: {
  businessId: number;
  phone: string;
}): Promise<void> {
  const canonical = toCanonical(opts.phone);
  if (!canonical) return;
  // Only write a row if one doesn't already exist. Returning customers
  // who opted out stay opted out; first-time bookers get a fresh
  // subscribed row.
  await db.execute(sql`
    INSERT INTO broadcast_contacts (business_id, phone_number, subscribed, opt_in_source)
    VALUES (${opts.businessId}, ${canonical}, TRUE, 'booking')
    ON CONFLICT (business_id, phone_number) DO NOTHING
  `);
}

/**
 * Flip a contact to unsubscribed. If `upgradeOwnerOut` is true, a
 * customer-initiated source overrides an existing owner-initiated row —
 * the customer's positive signal wins. If false (owner initiating
 * removal), an existing customer opt-out stays untouched.
 */
export async function markUnsubscribed(opts: {
  businessId: number;
  phone: string;
  source: string;
}): Promise<void> {
  const canonical = toCanonical(opts.phone);
  if (!canonical) return;
  const isCustomer = isCustomerOptOut(opts.source);
  // Customer-initiated unsubscribes fully overwrite any existing state.
  // Owner-initiated ones only take effect if no customer opt-out exists.
  if (isCustomer) {
    await db.execute(sql`
      INSERT INTO broadcast_contacts (
        business_id, phone_number, subscribed, opt_out_source, opt_out_at
      )
      VALUES (${opts.businessId}, ${canonical}, FALSE, ${opts.source}, NOW())
      ON CONFLICT (business_id, phone_number)
      DO UPDATE SET
        subscribed     = FALSE,
        opt_out_source = ${opts.source},
        opt_out_at     = NOW(),
        updated_at     = NOW()
    `);
  } else {
    // Owner-initiated: only set opt-out if no customer source is
    // already recorded. Keeps the customer's stronger signal intact.
    await db.execute(sql`
      INSERT INTO broadcast_contacts (
        business_id, phone_number, subscribed, opt_out_source, opt_out_at
      )
      VALUES (${opts.businessId}, ${canonical}, FALSE, ${opts.source}, NOW())
      ON CONFLICT (business_id, phone_number)
      DO UPDATE SET
        subscribed     = FALSE,
        opt_out_source = CASE
          WHEN broadcast_contacts.opt_out_source IS NULL THEN ${opts.source}
          ELSE broadcast_contacts.opt_out_source
        END,
        opt_out_at     = COALESCE(broadcast_contacts.opt_out_at, NOW()),
        updated_at     = NOW()
    `);
  }
}

/**
 * Update the last_invite_sent_at timestamp for rate-limiting the
 * owner's "send invite" clicks. Single source of truth so the cooldown
 * survives server restarts (was an in-memory Map before).
 */
export async function recordInviteSent(opts: {
  businessId: number;
  phone: string;
}): Promise<void> {
  const canonical = toCanonical(opts.phone);
  if (!canonical) return;
  await db.execute(sql`
    UPDATE broadcast_contacts
    SET last_invite_sent_at = NOW(), updated_at = NOW()
    WHERE business_id = ${opts.businessId} AND phone_number = ${canonical}
  `);
}

// ── Reads ──────────────────────────────────────────────────────────────────

export type BroadcastContact = {
  phoneNumber: string;
  subscribed: boolean;
  optInSource: string | null;
  optOutSource: string | null;
  optOutAt: Date | null;
  lastInviteSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Single-row fetch. Returns null if no contact exists for this pair.
 */
export async function getContact(opts: {
  businessId: number;
  phone: string;
}): Promise<BroadcastContact | null> {
  const canonical = toCanonical(opts.phone);
  if (!canonical) return null;
  const rows = await db.execute(sql`
    SELECT
      phone_number,
      subscribed,
      opt_in_source,
      opt_out_source,
      opt_out_at,
      last_invite_sent_at,
      created_at,
      updated_at
    FROM broadcast_contacts
    WHERE business_id = ${opts.businessId} AND phone_number = ${canonical}
    LIMIT 1
  `);
  const r = ((rows as any).rows ?? [])[0];
  if (!r) return null;
  return {
    phoneNumber: r.phone_number,
    subscribed: r.subscribed,
    optInSource: r.opt_in_source ?? null,
    optOutSource: r.opt_out_source ?? null,
    optOutAt: r.opt_out_at ?? null,
    lastInviteSentAt: r.last_invite_sent_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * List all contacts for a business, joined with the most recent client
 * name we have (appointments first, then client_sessions). Returned in
 * the shape the Dashboard's BroadcastSubscriberPanel consumes.
 */
export async function listContactsWithNames(businessId: number): Promise<Array<{
  phoneNumber: string;
  clientName: string | null;
  subscribed: boolean;
  optInSource: string | null;
  optOutSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}>> {
  const rows = await db.execute(sql`
    SELECT
      c.phone_number,
      c.subscribed,
      c.opt_in_source,
      c.opt_out_source,
      c.created_at,
      c.updated_at,
      COALESCE(
        (SELECT a.client_name
           FROM appointments a
          WHERE a.business_id = ${businessId}
            AND regexp_replace(regexp_replace(a.phone_number, '\\D', '', 'g'), '^972', '0') = c.phone_number
          ORDER BY a.appointment_date DESC
          LIMIT 1),
        (SELECT s.client_name
           FROM client_sessions s
          WHERE regexp_replace(regexp_replace(s.phone_number, '\\D', '', 'g'), '^972', '0') = c.phone_number
          ORDER BY s.created_at DESC
          LIMIT 1)
      ) AS client_name
    FROM broadcast_contacts c
    WHERE c.business_id = ${businessId}
    ORDER BY c.created_at DESC
  `);
  return ((rows as any).rows ?? []).map((r: any) => ({
    phoneNumber: r.phone_number,
    clientName:  r.client_name ?? null,
    subscribed:  r.subscribed,
    optInSource: r.opt_in_source ?? null,
    optOutSource: r.opt_out_source ?? null,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  }));
}

/**
 * Return the phones of unsubscribed contacts for a business — used by
 * send paths (/business/broadcast, /sms/send-bulk) to filter recipient
 * lists. Canonical form; caller normalises inputs before `.has()`.
 */
export async function getUnsubscribedPhoneSet(businessId: number): Promise<Set<string>> {
  const rows = await db.execute(sql`
    SELECT phone_number FROM broadcast_contacts
    WHERE business_id = ${businessId} AND subscribed = FALSE
  `);
  const set = new Set<string>();
  for (const r of ((rows as any).rows ?? [])) {
    const phone = String((r as any).phone_number ?? "");
    if (phone) set.add(phone);
  }
  return set;
}
