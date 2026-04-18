/**
 * Bulk SMS routes — Pro / עסקי feature, consumed from the
 * "הודעות ותזכורות" tab in the dashboard.
 *
 * Routes:
 *   GET  /api/sms/balance                   — quota snapshot for UI
 *   GET  /api/sms/history                   — recent sent messages
 *   POST /api/sms/send-bulk                 — compose + send a campaign
 *   POST /api/sms/purchase-pack             — start a Tranzila charge for
 *                                             a 250 / 500 top-up pack
 *   POST /api/sms/inforu-webhook/delivery   — Inforu delivery-report
 *                                             webhook (NO auth — Inforu
 *                                             hits it directly; we only
 *                                             update known message rows)
 *
 * Auth: standard business JWT except the inforu-webhook which is
 *       authenticated by having the matching customerMessageId UUID in
 *       the payload — effectively an unguessable shared secret per send.
 */

import { Router } from "express";
import { db, businessesTable, smsMessagesTable, smsPackPurchasesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { JWT_SECRET } from "../lib/auth";
import { logger } from "../lib/logger";
import { sendSms as inforuSendSms, parseDeliveryReport } from "../lib/inforu";
import {
  getQuotaSnapshot,
  reserveQuota,
  refundQuota,
  addExtraBalance,
} from "../lib/smsQuota";
// NOTE: no `chargeToken` import — that existing helper creates an STO
// (recurring), not a one-off. SMS pack purchases should be one-off
// charges, which require hooking into Tranzila's iframe flow like the
// initial subscription signup (see tranzila.ts). For now the route below
// stubs the charge and returns a "payment-not-wired" error so the UI can
// render a proper CTA; real purchase flow lands in a follow-up.

const router = Router();

// ─── auth helper ───────────────────────────────────────────────────────────

function getBusinessId(authHeader: string): number | null {
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { businessId?: number; id?: number };
    return payload.businessId ?? payload.id ?? null;
  } catch {
    return null;
  }
}

async function loadBusiness(businessId: number) {
  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
  return biz ?? null;
}

function isBulkSmsAllowed(plan: string): boolean {
  // Bulk SMS is a Pro / Pro-Plus feature. Free tier can't send even if
  // they somehow hit the endpoint.
  return plan === "pro" || plan === "pro-plus";
}

// ─── GET /api/sms/balance ──────────────────────────────────────────────────
// Small read-only snapshot for the UI. Includes a derived `allowed` flag so
// the frontend can render a "not available on your plan" state without
// having to duplicate the tier logic.
router.get("/sms/balance", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const biz = await loadBusiness(businessId);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const snapshot = await getQuotaSnapshot(businessId);
  res.json({
    plan: biz.subscriptionPlan,
    allowed: isBulkSmsAllowed(biz.subscriptionPlan),
    monthlyQuota:    snapshot.monthlyQuota,
    monthlyUsed:     snapshot.monthlyUsed,
    monthlyRemaining: snapshot.monthlyRemaining,
    extraBalance:    snapshot.extraBalance,
    totalAvailable:  snapshot.totalAvailable,
    resetDate:       snapshot.resetDate?.toISOString() ?? null,
  });
});

// ─── GET /api/sms/history ──────────────────────────────────────────────────
// Last N outbound messages for the owner to see what they sent + status.
router.get("/sms/history", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const rows = await db
    .select()
    .from(smsMessagesTable)
    .where(eq(smsMessagesTable.businessId, businessId))
    .orderBy(desc(smsMessagesTable.createdAt))
    .limit(limit);

  res.json(rows.map(r => ({
    id: r.id,
    recipient: r.recipientPhone,
    message: r.message,
    status: r.status,
    reason: r.statusReason,
    fromSource: r.fromSource,
    createdAt: r.createdAt.toISOString(),
    deliveredAt: r.deliveredAt?.toISOString() ?? null,
  })));
});

// ─── POST /api/sms/send-bulk ───────────────────────────────────────────────
// Body: { recipients: string[], message: string }
//
// Flow:
//   1. Validate tier + recipient list + message length
//   2. Reserve quota — hard stop if insufficient (owner is supposed to
//      hit the warning in the UI before even pressing send; this is the
//      server-side guard for direct API calls + race conditions)
//   3. Call Inforu with the business name as sender + per-send UUID
//   4. Write one sms_messages row per recipient with the reservation bucket
//   5. On Inforu failure: refund quota, mark rows as failed, return 502
router.post("/sms/send-bulk", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const biz = await loadBusiness(businessId);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  if (!isBulkSmsAllowed(biz.subscriptionPlan)) {
    res.status(403).json({ error: "bulk_sms_plan_gated", plan: biz.subscriptionPlan });
    return;
  }

  const recipientsRaw: unknown = (req.body as any)?.recipients;
  const messageRaw:    unknown = (req.body as any)?.message;

  if (!Array.isArray(recipientsRaw) || recipientsRaw.length === 0) {
    res.status(400).json({ error: "recipients must be a non-empty array" });
    return;
  }
  if (typeof messageRaw !== "string" || !messageRaw.trim()) {
    res.status(400).json({ error: "message must be a non-empty string" });
    return;
  }
  const recipients = (recipientsRaw as unknown[])
    .map(r => String(r ?? "").trim())
    .filter(r => r.length > 0);
  if (recipients.length === 0) {
    res.status(400).json({ error: "recipients must be a non-empty array" });
    return;
  }
  // Cap per request so a typo doesn't drain the whole balance and so we
  // stay under Inforu's per-request recipient limit.
  if (recipients.length > 1000) {
    res.status(400).json({ error: "too_many_recipients", limit: 1000 });
    return;
  }
  const message = (messageRaw as string).trim();

  // ─── Reserve quota BEFORE calling Inforu ────────────────────────────────
  const count = recipients.length;
  const reservation = await reserveQuota(businessId, count);
  if (!reservation.ok) {
    res.status(402).json({
      error: "insufficient_sms_credits",
      required: count,
      available: reservation.available,
      // Link the UI to the purchase modal. The UI already knows this path
      // but we include it in the error body for clarity.
      purchaseUrl: "/dashboard#sms-purchase",
    });
    return;
  }

  // Per-send UUID — echoed back in Inforu DLR so we can match webhooks to rows.
  const customerMessageId = crypto.randomUUID();
  const deliveryReportUrl = `${(process.env.PUBLIC_API_BASE_URL ?? "https://www.kavati.net/api").replace(/\/$/, "")}/sms/inforu-webhook/delivery`;

  // Send via Inforu. Sender = business name (must be pre-registered with
  // Inforu + the Israeli carriers before going live).
  const inforuResult = await inforuSendSms({
    recipients,
    message,
    senderName: biz.name,
    customerMessageId,
    deliveryReportUrl,
  });

  if (!inforuResult.ok) {
    // Refund — we never actually spent the credits.
    await refundQuota(businessId, reservation.reservations);
    if (!inforuResult.configured) {
      // Pre-launch mode: no Inforu account yet. Still record the intent so
      // the owner sees their composed message in history and we can
      // retrofit real sends later.
      await db.insert(smsMessagesTable).values(
        recipients.map(phone => ({
          businessId,
          recipientPhone: phone,
          message,
          status: "failed" as const,
          statusReason: "inforu not configured (pre-launch)",
          customerMessageId,
          chargedCredits: 0,
          fromSource: reservation.reservations[0]?.fromSource ?? "monthly",
        })),
      );
      res.status(503).json({
        error: "inforu_not_configured",
        message: "SMS gateway not yet connected — contact support.",
      });
      return;
    }
    res.status(502).json({
      error: "sms_gateway_failed",
      reason: inforuResult.statusText ?? "unknown",
    });
    return;
  }

  // Persist one row per recipient. `fromSource` needs to reflect the
  // bucket we actually drew from per-message, not globally; for most sends
  // there's a single bucket but when the reservation spans buckets we
  // assign per position.
  const rowsToInsert = recipients.map((phone, i) => {
    const bucketForIndex = pickBucketForIndex(reservation.reservations, i);
    const r = inforuResult.recipients.find(x => x.phone.endsWith(phone.replace(/^0/, "")));
    return {
      businessId,
      recipientPhone: phone,
      message,
      status: (r?.status === "queued" ? "queued" : "failed") as "queued" | "failed",
      inforuMessageId: inforuResult.messageId,
      customerMessageId,
      chargedCredits: 1,
      fromSource: bucketForIndex,
      statusReason: r?.error ?? null,
    };
  });
  await db.insert(smsMessagesTable).values(rowsToInsert);

  res.json({
    ok: true,
    sent: recipients.length,
    inforuMessageId: inforuResult.messageId,
    remainingMonthly: (await getQuotaSnapshot(businessId)).monthlyRemaining,
    remainingExtra:   (await getQuotaSnapshot(businessId)).extraBalance,
  });
});

/** Helper: given ordered bucket reservations, return the bucket that
 *  covers message index `i`. Monthly is drawn from first, then extra. */
function pickBucketForIndex(
  reservations: Array<{ fromSource: "monthly" | "extra"; reservedCount: number }>,
  i: number,
): "monthly" | "extra" {
  let cursor = 0;
  for (const r of reservations) {
    cursor += r.reservedCount;
    if (i < cursor) return r.fromSource;
  }
  return "extra"; // fallback — shouldn't happen
}

// ─── POST /api/sms/purchase-pack ──────────────────────────────────────────
// Body: { packSize: 250 | 500 }
//
// Starts a one-off Tranzila charge using the business's stored tranzilaToken
// (the same token the monthly subscription uses). On success we write a
// purchase row and bump the business's smsExtraBalance.
router.post("/sms/purchase-pack", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const biz = await loadBusiness(businessId);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  if (!isBulkSmsAllowed(biz.subscriptionPlan)) {
    res.status(403).json({ error: "purchase_plan_gated", plan: biz.subscriptionPlan });
    return;
  }

  const packSize = Number((req.body as any)?.packSize);
  const pricing: Record<number, number> = {
    250: 3900, // ₪39.00
    500: 5900, // ₪59.00
  };
  if (!pricing[packSize]) {
    res.status(400).json({ error: "invalid_pack_size", allowed: Object.keys(pricing) });
    return;
  }
  const priceAgorot = pricing[packSize];

  // Record the intent as a pending purchase so we have an audit trail and
  // so the UI can reflect "waiting for payment". The actual Tranzila
  // iframe wiring lives in a follow-up — once that ships we'll:
  //   1. return a Tranzila iframe URL from this endpoint
  //   2. let the frontend open the iframe in a modal
  //   3. on Tranzila's /notify webhook, look up the pending row by a ref
  //      we embed, flip status → completed, addExtraBalance(packSize)
  const [purchase] = await db
    .insert(smsPackPurchasesTable)
    .values({
      businessId,
      packSize,
      pricePaidAgorot: priceAgorot,
      status: "pending",
    })
    .returning();

  logger.info(
    { businessId, packSize, priceAgorot, purchaseId: purchase.id },
    "[sms] pack purchase intent recorded (Tranzila iframe flow not yet wired)",
  );

  // Return 501 + pending record so the UI can show "coming soon" messaging
  // until the real iframe wiring lands.
  res.status(501).json({
    error: "payment_not_wired",
    message: "SMS pack purchase flow is being finalized — coming soon.",
    purchaseId: purchase.id,
  });
});

// ─── POST /api/sms/inforu-webhook/delivery ────────────────────────────────
// Inforu hits this endpoint with a DLR (delivery report) when a message
// transitions between states. We look up the matching sms_messages row
// by customer_message_id (unguessable UUID set at send-time) and update
// the status field. No auth header required — the UUID is the shared
// secret.
router.post("/sms/inforu-webhook/delivery", async (req, res): Promise<void> => {
  try {
    const dlr = parseDeliveryReport(req.body);
    if (!dlr.customerMessageId) {
      // Inforu DLRs sometimes arrive without the customer id if we didn't
      // set one at send. Log and return 200 so Inforu doesn't keep retrying.
      logger.info({ body: req.body }, "[inforu-dlr] missing customerMessageId, skipping");
      res.json({ ok: true });
      return;
    }

    // Find the row(s) with this customerMessageId that matches the recipient.
    const rows = await db
      .select()
      .from(smsMessagesTable)
      .where(and(
        eq(smsMessagesTable.customerMessageId, dlr.customerMessageId),
      ));

    // One DLR per (campaign, recipient) — narrow by phone.
    const matching = rows.find(r => r.recipientPhone === dlr.phone || r.recipientPhone.endsWith(dlr.phone.replace(/^972/, "")));

    if (!matching) {
      logger.warn({ dlr }, "[inforu-dlr] no matching sms_messages row");
      res.json({ ok: true });
      return;
    }

    const nextStatus = dlr.status === "delivered" ? "delivered"
      : dlr.status === "failed" ? "failed"
      : dlr.status === "pending" ? "pending"
      : matching.status; // "unknown" = no-op

    await db
      .update(smsMessagesTable)
      .set({
        status: nextStatus,
        statusReason: dlr.reason ?? matching.statusReason,
        inforuMessageId: dlr.inforuMessageId ?? matching.inforuMessageId,
        deliveredAt: dlr.deliveredAt ?? matching.deliveredAt,
      })
      .where(eq(smsMessagesTable.id, matching.id));

    // If the send ultimately failed AFTER we debited the quota, refund it.
    // (The initial debit happens optimistically at send time.)
    if (nextStatus === "failed" && matching.status !== "failed") {
      await refundQuota(matching.businessId, [{
        fromSource: matching.fromSource as "monthly" | "extra",
        reservedCount: matching.chargedCredits,
      }]);
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, body: req.body }, "[inforu-dlr] webhook handler error");
    // Always 200 — Inforu retries on non-2xx and there's nothing they can
    // do differently to make a bug in our handler go away.
    res.json({ ok: true });
  }
});

export default router;
