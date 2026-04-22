/**
 * Push-notification endpoints.
 *
 * The Capacitor Android app registers here after the user grants
 * notification permission, and again whenever Firebase rotates the
 * device's FCM token. Tokens are keyed by the authenticated business
 * user (owner or staff) — one row per (device, user) pair.
 *
 * Routes:
 *   POST   /business/push-token      — register/refresh a device token
 *   DELETE /business/push-token      — unregister (logout / disable)
 *   GET    /business/push-prefs      — current user's per-kind opt-in
 *   PUT    /business/push-prefs      — update per-kind opt-in
 *
 * push_prefs is stored on `businesses.push_prefs` for owner sessions
 * and `staff_members.push_prefs` for staff sessions — the sender in
 * pushNotifications.ts reads the right one per recipient.
 */

import { Router } from "express";
import { db, pushTokensTable, businessesTable, staffMembersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireBusinessAuth } from "../middlewares/business-auth";
import { logger } from "../lib/logger";

const router = Router();

// Whitelist so clients can't pollute the column with garbage keys.
const PUSH_KINDS = [
  "new_booking",
  "pending_approval",
  "cancellation",
  "reschedule",
  "waitlist_join",
  "new_review",
  "system",
] as const;
type PushKind = typeof PUSH_KINDS[number];

function sanitizePrefs(raw: any): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of PUSH_KINDS) {
    if (typeof raw[k] === "boolean") out[k] = raw[k];
  }
  return out;
}

// ── POST /business/push-token ────────────────────────────────────────────────
// Body: { deviceToken: string, platform?: "android" | "ios" | "web" }
// Idempotent upsert keyed on the unique device_token index. If the same
// device signs in as a different user we overwrite the row so the old
// user stops receiving that device's pushes.
router.post("/business/push-token", requireBusinessAuth, async (req, res): Promise<void> => {
  const { deviceToken, platform } = req.body ?? {};
  if (typeof deviceToken !== "string" || deviceToken.length < 20) {
    res.status(400).json({ error: "deviceToken is required" });
    return;
  }
  const plat = platform === "ios" || platform === "web" ? platform : "android";
  const businessId    = req.business!.businessId;
  const staffMemberId = req.business!.staffMemberId ?? null;

  try {
    // Upsert by device_token. ON CONFLICT rewrites the owning user
    // association (reinstall, login-as-different-user) and bumps
    // last_seen_at so stale rows self-expire if we ever add pruning.
    await db.execute(sql`
      INSERT INTO push_tokens (business_id, staff_member_id, device_token, platform, last_seen_at)
      VALUES (${businessId}, ${staffMemberId}, ${deviceToken}, ${plat}, NOW())
      ON CONFLICT (device_token) DO UPDATE SET
        business_id     = EXCLUDED.business_id,
        staff_member_id = EXCLUDED.staff_member_id,
        platform        = EXCLUDED.platform,
        last_seen_at    = NOW()
    `);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err, businessId }, "[push-token] register failed");
    res.status(500).json({ error: "register failed" });
  }
});

// ── DELETE /business/push-token ──────────────────────────────────────────────
// Body: { deviceToken: string }
// Called by the app on explicit logout so the device stops receiving
// pushes for that account.
router.delete("/business/push-token", requireBusinessAuth, async (req, res): Promise<void> => {
  const { deviceToken } = req.body ?? {};
  if (typeof deviceToken !== "string" || !deviceToken) {
    res.status(400).json({ error: "deviceToken is required" });
    return;
  }
  await db.delete(pushTokensTable).where(eq(pushTokensTable.deviceToken, deviceToken));
  res.json({ success: true });
});

// ── GET /business/push-prefs ─────────────────────────────────────────────────
// Returns the current user's per-kind opt-in map. Missing keys = enabled.
router.get("/business/push-prefs", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId    = req.business!.businessId;
  const staffMemberId = req.business!.staffMemberId ?? null;

  if (staffMemberId) {
    const [row] = await db
      .select({ prefs: staffMembersTable.pushPrefs })
      .from(staffMembersTable)
      .where(and(eq(staffMembersTable.id, staffMemberId), eq(staffMembersTable.businessId, businessId)));
    res.json({ prefs: (row?.prefs ?? {}) as Record<string, boolean> });
    return;
  }

  const [row] = await db
    .select({ prefs: businessesTable.pushPrefs })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));
  res.json({ prefs: (row?.prefs ?? {}) as Record<string, boolean> });
});

// ── PUT /business/push-prefs ─────────────────────────────────────────────────
// Body: { prefs: Record<PushKind, boolean> }  (only whitelisted keys kept)
router.put("/business/push-prefs", requireBusinessAuth, async (req, res): Promise<void> => {
  const prefs = sanitizePrefs(req.body?.prefs);
  const businessId    = req.business!.businessId;
  const staffMemberId = req.business!.staffMemberId ?? null;

  if (staffMemberId) {
    await db
      .update(staffMembersTable)
      .set({ pushPrefs: prefs })
      .where(and(eq(staffMembersTable.id, staffMemberId), eq(staffMembersTable.businessId, businessId)));
  } else {
    await db
      .update(businessesTable)
      .set({ pushPrefs: prefs })
      .where(eq(businessesTable.id, businessId));
  }
  res.json({ success: true, prefs });
});

export default router;
