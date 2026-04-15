import { Router } from "express";
import { db, appointmentsTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { createStandingOrder } from "../lib/tranzilaRestApi";

const router = Router();

const SUPPLIER     = process.env.TRANZILA_SUPPLIER ?? "";       // lilash2  — for appointment deposits
const SUPPLIER_TOK = process.env.TRANZILA_SUPPLIER_TOK ?? "";   // lilash2tok — for subscription (token service)
const NOTIFY_PASSWORD = process.env.TRANZILA_NOTIFY_PASSWORD ?? "";
const JWT_SECRET   = process.env.JWT_SECRET ?? "dev-secret";

// TRANZILA_TEST_MODE=true → 0.10 ILS (10 agorot) so you can verify the
// full flow end-to-end without spending real money.
const TEST_MODE = process.env.TRANZILA_TEST_MODE === "true";
const SUBSCRIPTION_FIRST_ILS   = TEST_MODE ? 0.10 : 50;
const SUBSCRIPTION_MONTHLY_ILS = TEST_MODE ? 0.10 : 100;

// ─── Appointment deposit iframe URL ──────────────────────────────────────────

export function buildTranzilaUrl(params: {
  appointmentId: number;
  sum: number;
  description: string;
  clientName: string;
  requiresApproval?: boolean;
}): string {
  const base = `https://direct.tranzila.com/${SUPPLIER}/iframenew.php`;
  const successUrl = `https://www.kavati.net/payment/success?appt=${params.appointmentId}${params.requiresApproval ? "&approval=1" : ""}`;
  const p = new URLSearchParams({
    sum: params.sum.toFixed(2),
    currency: "1",
    cred_type: "1",
    lang: "il",
    pdesc: params.description,
    contact: params.clientName,
    myid: String(params.appointmentId),
    success_url_address: successUrl,
    fail_url_address:    `https://www.kavati.net/payment/fail?appt=${params.appointmentId}`,
    notify_url_address:  `https://www.kavati.net/api/tranzila/notify`,
    TranzilaTK: NOTIFY_PASSWORD,
    nologo: "1",
    newprocess: "1",
  });
  return `${base}?${p.toString()}`;
}

// ─── Subscription iframe URL ─────────────────────────────────────────────────
//
// Uses lilash2tok (SUPPLIER_TOK) which has the token service.
// tranmode=AK → charges 50 NIS AND tokenizes the card.
// The token is returned in the notify callback so we can charge 100 NIS monthly.
// Cancel = set subscriptionCancelledAt → cron stops charging. Period.

function buildSubscriptionUrl(params: {
  businessId: number;
  ownerName: string;
  email: string;
}): string {
  // Use the main SUPPLIER terminal (lilash2) — the alternate "tok" path returns 404.
  // tranmode=AK still asks for tokenization; if the terminal is configured in
  // Tranzila admin to support tokens, notify will return token+expdate and an STO
  // is created. Otherwise the first charge succeeds and the business is upgraded
  // to Pro, but monthly renewal falls back to the cron job.
  const base = `https://direct.tranzila.com/${SUPPLIER}/iframenew.php`;
  const p = new URLSearchParams({
    sum: SUBSCRIPTION_FIRST_ILS.toFixed(2),
    currency: "1",
    cred_type: "1",
    tranmode: "AK",              // charge + tokenize card for future monthly charges
    lang: "il",
    buttonLabel: "שלם והפעל מנוי",
    contact: params.ownerName,
    email: params.email,
    pdesc: `מנוי פרו קבעתי - ${params.businessId}`,
    success_url_address: `https://www.kavati.net/payment/success?type=subscription`,
    fail_url_address:    `https://www.kavati.net/payment/fail?type=subscription`,
    notify_url_address:  `https://www.kavati.net/api/tranzila/notify`,
    TranzilaTK: NOTIFY_PASSWORD,
    nologo: "1",
    newprocess: "1",
  });
  return `${base}?${p.toString()}`;
}

// ─── POST /api/tranzila/notify ────────────────────────────────────────────────

router.post("/tranzila/notify", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};

    const receivedPw = body.TranzilaTK ?? body.tranzilatk ?? "";
    if (NOTIFY_PASSWORD && receivedPw !== NOTIFY_PASSWORD) {
      console.warn("[Tranzila] Notify password mismatch");
      res.status(200).send("OK");
      return;
    }

    const responsecode = String(body.Response ?? body.responsecode ?? "");
    const pdesc        = String(body.pdesc ?? "");

    console.log("[Tranzila] Notify received:", { responsecode, pdesc, body });

    // ── Subscription first payment ────────────────────────────────────────
    // pdesc = "מנוי פרו קבעתי - {businessId}"
    // tranmode=AK → body.token + body.expdate are populated
    const subscriptionMatch = pdesc.match(/מנוי פרו קבעתי - (\d+)/);
    if (subscriptionMatch) {
      const businessId = parseInt(subscriptionMatch[1]);

      if (responsecode === "000") {
        const token   = String(body.token   ?? body.Token   ?? "").trim();
        const expdate = String(body.expdate ?? body.ExpDate ?? "").trim();

        const renewDate = new Date();
        renewDate.setDate(renewDate.getDate() + 30);

        await db
          .update(businessesTable)
          .set({
            subscriptionPlan:        "pro",
            maxServicesAllowed:      999,
            maxAppointmentsPerMonth: 9999,
            subscriptionStartDate:   new Date(),
            subscriptionRenewDate:   renewDate,
            subscriptionCancelledAt: null,
            tranzilaToken:           token   || null,
            tranzilaTokenExpiry:     expdate || null,
          } as any)
          .where(eq(businessesTable.id, businessId));

        console.log(`[Tranzila] Business ${businessId} subscribed to Pro, token saved, renews ${renewDate.toISOString()}`);

        // Create Standing Order via REST API so Tranzila handles future monthly charges
        if (token && expdate) {
          const [biz] = await db
            .select({ ownerName: businessesTable.ownerName, email: businessesTable.email })
            .from(businessesTable)
            .where(eq(businessesTable.id, businessId));

          if (biz) {
            const stoResult = await createStandingOrder({
              token,
              expiry:      expdate,
              clientName:  biz.ownerName,
              clientEmail: biz.email,
              businessId,
              amountILS:   SUBSCRIPTION_MONTHLY_ILS,
            });

            if (stoResult.success && stoResult.stoId) {
              await db
                .update(businessesTable)
                .set({ tranzilaStorId: stoResult.stoId } as any)
                .where(eq(businessesTable.id, businessId));
              console.log(`[Tranzila] STO created for business ${businessId}, stoId=${stoResult.stoId}`);
            } else {
              console.warn(`[Tranzila] STO creation failed for business ${businessId}: ${stoResult.error} — cron fallback active`);
            }
          }
        }
      } else {
        console.log(`[Tranzila] Subscription payment failed for business ${businessId} (code: ${responsecode})`);
      }

      res.status(200).send("OK");
      return;
    }

    // ── Appointment deposit ───────────────────────────────────────────────
    // pdesc = "{serviceName} - תור מספר {id}"
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
        console.log(`[Tranzila] Appointment ${apptId} confirmed`);
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
    .select({ id: appointmentsTable.id, clientName: appointmentsTable.clientName, serviceName: appointmentsTable.serviceName, status: appointmentsTable.status, businessId: appointmentsTable.businessId })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, apptId));

  if (!appt) { res.status(404).json({ error: "Appointment not found" }); return; }

  const [business] = await db
    .select({ depositAmountAgorot: (businessesTable as any).depositAmountAgorot, requireAppointmentApproval: businessesTable.requireAppointmentApproval })
    .from(businessesTable)
    .where(eq(businessesTable.id, appt.businessId));

  if (!business?.depositAmountAgorot) { res.status(400).json({ error: "No deposit required" }); return; }

  const sumILS = business.depositAmountAgorot / 100;
  const url = buildTranzilaUrl({
    appointmentId: appt.id,
    sum: sumILS,
    description: `${appt.serviceName} - תור מספר ${appt.id}`,
    clientName: appt.clientName,
    requiresApproval: !!business.requireAppointmentApproval,
  });

  res.json({ url, sum: sumILS, appointmentId: appt.id });
});

// ─── GET /api/tranzila/subscription-url — authenticated ──────────────────────

router.get("/tranzila/subscription-url", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization ?? "";
  const rawToken   = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!rawToken) { res.status(401).json({ error: "Unauthorized" }); return; }

  let businessId: number;
  try {
    const payload = jwt.verify(rawToken, JWT_SECRET) as { businessId?: number; id?: number };
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

  const url = buildSubscriptionUrl({ businessId: biz.id, ownerName: biz.ownerName, email: biz.email });
  res.json({ url, firstCharge: SUBSCRIPTION_FIRST_ILS, monthlyCharge: SUBSCRIPTION_MONTHLY_ILS });
});

export default router;
