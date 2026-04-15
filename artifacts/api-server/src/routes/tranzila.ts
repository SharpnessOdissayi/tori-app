import { Router } from "express";
import { db, appointmentsTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { createStandingOrder } from "../lib/tranzilaRestApi";

const router = Router();

const SUPPLIER     = process.env.TRANZILA_SUPPLIER ?? "";       // lilash2  — for appointment deposits
const SUPPLIER_TOK = process.env.TRANZILA_SUPPLIER_TOK ?? "";   // lilash2tok — for subscription (token service)
const JWT_SECRET   = process.env.JWT_SECRET ?? "dev-secret";

// TRANZILA_TEST_MODE=true → 1 ILS (the minimum most Tranzila terminals accept)
// so you can verify the full flow end-to-end with a near-zero charge.
// 0.10 ILS was previously used but many terminals reject sub-1-shekel charges
// with a generic 404/error-page response, masking the real issue.
const TEST_MODE = process.env.TRANZILA_TEST_MODE === "true";
const SUBSCRIPTION_FIRST_ILS   = TEST_MODE ? 1 : 50;
const SUBSCRIPTION_MONTHLY_ILS = TEST_MODE ? 1 : 100;

// ─── Appointment deposit iframe URL ──────────────────────────────────────────

export function buildTranzilaUrl(params: {
  appointmentId: number;
  sum: number;
  description: string;
  clientName: string;
  requiresApproval?: boolean;
}): string {
  // Per Tranzila docs: direct.tranzila.com is the OLD URL. The new one is directng.tranzila.com
  // ("new DirectNG"). The lilash2tok terminal is only reachable via the new URL.
  const base = `https://directng.tranzila.com/${SUPPLIER}/iframenew.php`;
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
  // Tokenize the card via the SUPPLIER iframe (lilash2), NOT SUPPLIER_TOK.
  // Tranzila support (ticket #211337802) confirmed: lilash2tok does not expose
  // an iframe endpoint. The correct flow is to tokenize on lilash2's iframe
  // (tranmode=AK returns TranzilaTK + expdate) and then create the STO on the
  // lilash2tok terminal — tokens are valid across sibling terminals in the
  // same Tranzila account.
  const base = `https://directng.tranzila.com/${SUPPLIER}/iframenew.php`;
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
    nologo: "1",
    newprocess: "1",
  });
  return `${base}?${p.toString()}`;
}

// ─── POST /api/tranzila/notify ────────────────────────────────────────────────

router.post("/tranzila/notify", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};

    // NOTE: we previously tried to echo NOTIFY_PASSWORD via the TranzilaTK
    // iframe param and verify it here, but TranzilaTK is a reserved field —
    // Tranzila overwrites it with the card token in the notify payload, so
    // the comparison always failed and every legitimate webhook was rejected
    // (see Railway logs 2026-04-15 "Notify password mismatch"). Correlation
    // now relies on pdesc matching "מנוי פרו קבעתי - {businessId}" plus the
    // Tranzila-side terminal authentication.

    const responsecode = String(body.Response ?? body.responsecode ?? "");
    const pdesc        = String(body.pdesc ?? "");

    console.log("[Tranzila] Notify received:", { responsecode, pdesc, body });

    // ── Subscription payment (initial or recurring STO monthly charge) ────
    // pdesc = "מנוי פרו קבעתי - {businessId}" (set when building the iframe URL and the STO item name)
    // Initial charge: body.token + body.expdate populated (tranmode=AK). No sto_external_id yet.
    // Recurring charge: Tranzila's My-Billing webhook includes sto_external_id and TranzilaTK (token
    //                   used for the charge). See: https://docs.tranzila.com/docs/payments-billing/wbvbx8p3i3pu4-sto-api-for-my-billing
    const subscriptionMatch = pdesc.match(/מנוי פרו קבעתי - (\d+)/);
    if (subscriptionMatch) {
      const businessId     = parseInt(subscriptionMatch[1]);
      const stoExternalId  = body.sto_external_id ? parseInt(String(body.sto_external_id)) : null;

      if (responsecode === "000") {
        const renewDate = new Date();
        renewDate.setDate(renewDate.getDate() + 30);

        if (stoExternalId) {
          // Recurring STO charge — extend renewal only; don't re-run first-payment setup.
          await db
            .update(businessesTable)
            .set({ subscriptionRenewDate: renewDate } as any)
            .where(eq(businessesTable.id, businessId));
          console.log(`[Tranzila] Recurring STO charge for business ${businessId} (sto=${stoExternalId}), renew=${renewDate.toISOString()}`);
        } else {
          // Initial subscription payment.
          // Tranzila's notify payload fields (confirmed from Railway logs 2026-04-15):
          //   body.TranzilaTK = card token (e.g. "n861981937dbfca7985")
          //   body.expmonth   = "09"
          //   body.expyear    = "28"   (2-digit)
          // We build expdate as MMYY since that's what tranzilaRestApi expects.
          const token = String(body.TranzilaTK ?? body.tranzilatk ?? body.token ?? "").trim();
          const mm    = String(body.expmonth   ?? "").padStart(2, "0").slice(0, 2);
          const yy    = String(body.expyear    ?? "").padStart(2, "0").slice(-2);
          const expdate = mm && yy ? `${mm}${yy}` : String(body.expdate ?? "").trim();

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

          console.log(`[Tranzila] Business ${businessId} upgraded to Pro, renews ${renewDate.toISOString()}`);

          // Create Standing Order via REST API so Tranzila handles future monthly charges.
          // Skip if the business already has an STO (re-subscribing after cancel).
          if (token && expdate) {
            const [biz] = await db
              .select({ ownerName: businessesTable.ownerName, email: businessesTable.email, existingStoId: (businessesTable as any).tranzilaStorId })
              .from(businessesTable)
              .where(eq(businessesTable.id, businessId));

            if (biz && !biz.existingStoId) {
              const stoResult = await createStandingOrder({
                token,
                expireMonth: parseInt(mm, 10),
                expireYear:  2000 + parseInt(yy, 10),
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
                console.warn(`[Tranzila] STO creation failed for business ${businessId}: ${stoResult.error}`);
              }
            }
          }
        }
      } else {
        // Charge failure — Tranzila sends a "Token Correction" email to the customer automatically
        // (enabled by default in My-Billing settings). We just log it; on card update they'll retry.
        console.log(`[Tranzila] Subscription payment failed for business ${businessId} (code: ${responsecode}, sto=${stoExternalId ?? "n/a"})`);
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
