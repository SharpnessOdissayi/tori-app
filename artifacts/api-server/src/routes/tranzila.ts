import { Router } from "express";
import { db, appointmentsTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";

const router = Router();

const SUPPLIER = process.env.TRANZILA_SUPPLIER ?? "";
const NOTIFY_PASSWORD = process.env.TRANZILA_NOTIFY_PASSWORD ?? "";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

const SUBSCRIPTION_FIRST_ILS = 50;   // first month promo
const SUBSCRIPTION_MONTHLY_ILS = 100; // all months after

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build Tranzila iframe URL for appointment deposit */
export function buildTranzilaUrl(params: {
  appointmentId: number;
  sum: number;
  description: string;
  clientName: string;
}): string {
  const base = `https://direct.tranzila.com/${SUPPLIER}/iframenew.php`;
  const successUrl = `https://kavati.net/payment/success?appt=${params.appointmentId}`;
  const failUrl = `https://kavati.net/payment/fail?appt=${params.appointmentId}`;
  const notifyUrl = `https://kavati.net/api/tranzila/notify`;

  const p = new URLSearchParams({
    sum: params.sum.toFixed(2),
    currency: "1",
    cred_type: "1",
    lang: "il",
    pdesc: params.description,
    contact: params.clientName,
    myid: String(params.appointmentId),
    success_url_address: successUrl,
    fail_url_address: failUrl,
    notify_url_address: notifyUrl,
    TranzilaTK: NOTIFY_PASSWORD,
    nologo: "1",
    new_process: "1",
  });

  return `${base}?${p.toString()}`;
}

/**
 * Build Tranzila iframe URL for subscription.
 * Uses lilash2 (SUPPLIER) which has recurring billing configured.
 * recur_transaction=4_approved → Tranzila auto-charges monthly without asking the customer.
 * First charge = 50 NIS, every month after = 100 NIS.
 */
function buildSubscriptionUrl(params: {
  businessId: number;
  ownerName: string;
  email: string;
}): string {
  const base = `https://direct.tranzila.com/${SUPPLIER}/iframenew.php`;

  const p = new URLSearchParams({
    sum: SUBSCRIPTION_FIRST_ILS.toFixed(2),
    currency: "1",
    cred_type: "1",
    lang: "il",
    buttonLabel: "שלם והפעל מנוי",
    contact: params.ownerName,
    email: params.email,
    pdesc: `מנוי פרו קבעתי - ${params.businessId}`,
    // Recurring: Tranzila charges 100 NIS monthly automatically
    recur_transaction: "4_approved",
    recur_sum: SUBSCRIPTION_MONTHLY_ILS.toFixed(2),
    TranzilaTK: NOTIFY_PASSWORD,
    nologo: "1",
    new_process: "1",
  });

  return `${base}?${p.toString()}`;
}

// ─── POST /api/tranzila/notify ─────────────────────────────────────────────

router.post("/tranzila/notify", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};

    // Verify notify password
    const receivedPw = body.TranzilaTK ?? body.tranzilatk ?? "";
    if (NOTIFY_PASSWORD && receivedPw !== NOTIFY_PASSWORD) {
      console.warn("[Tranzila] Notify password mismatch");
      res.status(200).send("OK");
      return;
    }

    const responsecode = String(body.Response ?? body.responsecode ?? "");
    const pdesc = String(body.pdesc ?? "");

    console.log("[Tranzila] Notify received:", { responsecode, pdesc, body });

    // ── Subscription payment / monthly recurring charge ───────────────────
    // Tranzila sends this for BOTH the first payment and every monthly auto-charge.
    const subscriptionMatch = pdesc.match(/מנוי פרו קבעתי - (\d+)/);
    if (subscriptionMatch) {
      const businessId = parseInt(subscriptionMatch[1]);

      if (responsecode === "000") {
        // Fetch current business state to check cancellation
        const [biz] = await db
          .select({
            subscriptionPlan: businessesTable.subscriptionPlan,
            subscriptionCancelledAt: (businessesTable as any).subscriptionCancelledAt,
            subscriptionRenewDate: (businessesTable as any).subscriptionRenewDate,
          })
          .from(businessesTable)
          .where(eq(businessesTable.id, businessId));

        const isCancelled = !!biz?.subscriptionCancelledAt;

        if (isCancelled) {
          // Business cancelled — this is a post-cancellation charge from Tranzila's recurring.
          // Do NOT extend. Log it. (Manual refund may be needed — future: auto-refund via API)
          console.log(`[Tranzila] Post-cancellation charge for business ${businessId} — ignoring renewal`);
        } else {
          // Activate or extend Pro by 30 days
          const renewDate = new Date();
          renewDate.setDate(renewDate.getDate() + 30);

          const isFirstTime = !biz || biz.subscriptionPlan !== "pro";
          await db
            .update(businessesTable)
            .set({
              subscriptionPlan: "pro",
              maxServicesAllowed: 999,
              maxAppointmentsPerMonth: 9999,
              ...(isFirstTime ? { subscriptionStartDate: new Date() } : {}),
              subscriptionRenewDate: renewDate,
            } as any)
            .where(eq(businessesTable.id, businessId));

          console.log(`[Tranzila] Business ${businessId} ${isFirstTime ? "subscribed" : "renewed"} Pro until ${renewDate.toISOString()}`);
        }
      } else {
        console.log(`[Tranzila] Subscription charge failed for business ${businessId} (code: ${responsecode})`);
      }

      res.status(200).send("OK");
      return;
    }

    // ── Appointment deposit ───────────────────────────────────────────────
    const pdescMatch = pdesc.match(/תור מספר (\d+)/);
    const apptId = pdescMatch
      ? parseInt(pdescMatch[1])
      : body.myid ? parseInt(String(body.myid)) : null;

    if (apptId) {
      if (responsecode === "000") {
        await db
          .update(appointmentsTable)
          .set({ status: "confirmed" })
          .where(and(
            eq(appointmentsTable.id, apptId),
            eq(appointmentsTable.status, "pending_payment")
          ));
        console.log(`[Tranzila] Appointment ${apptId} confirmed after payment`);
      } else {
        await db
          .update(appointmentsTable)
          .set({ status: "cancelled" })
          .where(and(
            eq(appointmentsTable.id, apptId),
            eq(appointmentsTable.status, "pending_payment")
          ));
        console.log(`[Tranzila] Appointment ${apptId} cancelled — payment rejected (code: ${responsecode})`);
      }
    }

    res.status(200).send("OK");
  } catch (e) {
    console.error("[Tranzila] Notify error:", e);
    res.status(200).send("OK");
  }
});

// ─── GET /api/tranzila/payment-url/:appointmentId ────────────────────────────

router.get("/tranzila/payment-url/:appointmentId", async (req, res): Promise<void> => {
  const apptId = parseInt(req.params.appointmentId);
  if (isNaN(apptId)) { res.status(400).json({ error: "Invalid appointment ID" }); return; }

  const [appt] = await db
    .select({
      id: appointmentsTable.id,
      clientName: appointmentsTable.clientName,
      serviceName: appointmentsTable.serviceName,
      status: appointmentsTable.status,
      businessId: appointmentsTable.businessId,
    })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, apptId));

  if (!appt) { res.status(404).json({ error: "Appointment not found" }); return; }

  const [business] = await db
    .select({ depositAmountAgorot: (businessesTable as any).depositAmountAgorot })
    .from(businessesTable)
    .where(eq(businessesTable.id, appt.businessId));

  if (!business || !business.depositAmountAgorot) {
    res.status(400).json({ error: "No deposit required" });
    return;
  }

  const sumILS = business.depositAmountAgorot / 100;
  const url = buildTranzilaUrl({
    appointmentId: appt.id,
    sum: sumILS,
    description: `${appt.serviceName} - תור מספר ${appt.id}`,
    clientName: appt.clientName,
  });

  res.json({ url, sum: sumILS, appointmentId: appt.id });
});

// ─── GET /api/tranzila/subscription-url — authenticated ──────────────────────

router.get("/tranzila/subscription-url", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }

  let businessId: number;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { businessId?: number; id?: number };
    businessId = payload.businessId ?? payload.id ?? 0;
    if (!businessId) throw new Error("No businessId");
  } catch {
    res.status(401).json({ error: "Unauthorized" }); return;
  }

  const [biz] = await db
    .select({ id: businessesTable.id, ownerName: businessesTable.ownerName, email: businessesTable.email })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));

  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const url = buildSubscriptionUrl({
    businessId: biz.id,
    ownerName: biz.ownerName,
    email: biz.email,
  });

  res.json({ url, firstCharge: SUBSCRIPTION_FIRST_ILS, monthlyCharge: SUBSCRIPTION_MONTHLY_ILS });
});

export default router;
