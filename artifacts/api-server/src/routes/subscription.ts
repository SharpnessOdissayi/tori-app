/**
 * Subscription management routes (authenticated — business JWT required).
 *
 * POST /api/subscription/cancel   — cancel renewal (Pro stays until renewDate)
 * GET  /api/subscription/status   — return current subscription info
 */

import { Router } from "express";
import { db, businessesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { getSto, updateSto } from "../lib/tranzilaCharge";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

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

// GET /api/subscription/status
// Live status includes the STO info pulled from Tranzila when available
// (next_charge_date_time + charge_amount + sto_status).
router.get("/subscription/status", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [biz] = await db
    .select({
      subscriptionPlan:        businessesTable.subscriptionPlan,
      subscriptionRenewDate:   (businessesTable as any).subscriptionRenewDate,
      subscriptionCancelledAt: (businessesTable as any).subscriptionCancelledAt,
      tranzilaStorId:          (businessesTable as any).tranzilaStorId,
    })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));

  if (!biz) { res.status(404).json({ error: "Not found" }); return; }

  // Best-effort: fetch live STO info from Tranzila if we have an ID.
  // If it fails we just omit the stoInfo field — the rest still works.
  let stoInfo = null;
  if (biz.tranzilaStorId) {
    stoInfo = await getSto(biz.tranzilaStorId);
  }

  res.json({
    plan:        biz.subscriptionPlan,
    renewDate:   biz.subscriptionRenewDate ?? null,
    cancelledAt: biz.subscriptionCancelledAt ?? null,
    willRenew:   !!biz.subscriptionRenewDate && !biz.subscriptionCancelledAt,
    stoId:       biz.tranzilaStorId ?? null,
    stoInfo,
  });
});

// POST /api/subscription/cancel
// Cancels both sides:
//   1. Mark STO inactive on Tranzila (via /v1/sto/update) so no more auto-charges.
//   2. Record cancelledAt in our DB so the UI shows the countdown to expiry.
router.post("/subscription/cancel", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [biz] = await db
    .select({
      subscriptionPlan:        businessesTable.subscriptionPlan,
      subscriptionCancelledAt: (businessesTable as any).subscriptionCancelledAt,
      tranzilaStorId:          (businessesTable as any).tranzilaStorId,
    })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));

  if (!biz) { res.status(404).json({ error: "Not found" }); return; }
  if (biz.subscriptionPlan !== "pro") {
    res.status(400).json({ error: "No active Pro subscription" }); return;
  }
  if (biz.subscriptionCancelledAt) {
    res.status(400).json({ error: "Already cancelled" }); return;
  }

  // Stop future charges on Tranzila's side first.
  if (biz.tranzilaStorId) {
    const ok = await updateSto(biz.tranzilaStorId, "inactive");
    if (!ok) {
      res.status(502).json({
        error:   "sto_update_failed",
        message: "לא הצלחנו לבטל את ההו\"ק בצד של טרנזילה — נסה שוב או פנה לתמיכה",
      });
      return;
    }
  }

  await db
    .update(businessesTable)
    .set({ subscriptionCancelledAt: new Date() } as any)
    .where(eq(businessesTable.id, businessId));

  res.json({ success: true, message: "מנוי בוטל — גישה לפרו נשמרת עד תאריך החידוש הקרוב" });
});

export default router;
