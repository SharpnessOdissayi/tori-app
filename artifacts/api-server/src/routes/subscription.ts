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
router.get("/subscription/status", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [biz] = await db
    .select({
      subscriptionPlan: businessesTable.subscriptionPlan,
      subscriptionRenewDate: (businessesTable as any).subscriptionRenewDate,
      subscriptionCancelledAt: (businessesTable as any).subscriptionCancelledAt,
    })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));

  if (!biz) { res.status(404).json({ error: "Not found" }); return; }

  res.json({
    plan: biz.subscriptionPlan,
    renewDate: biz.subscriptionRenewDate ?? null,
    cancelledAt: biz.subscriptionCancelledAt ?? null,
    willRenew: !!biz.subscriptionRenewDate && !biz.subscriptionCancelledAt,
  });
});

// POST /api/subscription/cancel
router.post("/subscription/cancel", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [biz] = await db
    .select({
      subscriptionPlan: businessesTable.subscriptionPlan,
      subscriptionCancelledAt: (businessesTable as any).subscriptionCancelledAt,
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

  await db
    .update(businessesTable)
    .set({ subscriptionCancelledAt: new Date() } as any)
    .where(eq(businessesTable.id, businessId));

  res.json({ success: true, message: "מנוי בוטל — גישה לפרו נשמרת עד תאריך החידוש הקרוב" });
});

export default router;
