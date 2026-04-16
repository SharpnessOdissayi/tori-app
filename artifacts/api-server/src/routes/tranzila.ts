import { Router } from "express";
import { db, appointmentsTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { createStandingOrder } from "../lib/tranzilaSto";

const router = Router();

// Single terminal — lilash2. Used for both deposits and subscription
// iframe. Tokenization (tranmode=AK) returns TranzilaTK usable for STO.
const SUPPLIER   = process.env.TRANZILA_SUPPLIER ?? "";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

const TEST_MODE                = process.env.TRANZILA_TEST_MODE === "true";
const SUBSCRIPTION_FIRST_ILS   = TEST_MODE ? 1 : 50;
const SUBSCRIPTION_MONTHLY_ILS = TEST_MODE ? 1 : 100;

// Per iframe docs: base URL is direct.tranzila.com/<terminal>/iframenew.php.
const IFRAME_BASE = `https://direct.tranzila.com/${SUPPLIER}/iframenew.php`;

// ─── Appointment deposit iframe URL (one-time charge) ───────────────────────

export function buildTranzilaUrl(params: {
  appointmentId:    number;
  sum:              number;
  description:      string;
  clientName:       string;
  requiresApproval?: boolean;
}): string {
  const successUrl = `https://www.kavati.net/payment/success?appt=${params.appointmentId}${params.requiresApproval ? "&approval=1" : ""}`;
  const p = new URLSearchParams({
    sum:                 params.sum.toFixed(2),
    currency:            "1",
    cred_type:           "1",
    tranmode:            "A",                           // standard charge
    lang:                "il",
    pdesc:               params.description,
    contact:             params.clientName,
    myid:                String(params.appointmentId),
    success_url_address: successUrl,
    fail_url_address:    `https://www.kavati.net/payment/fail?appt=${params.appointmentId}`,
    notify_url_address:  `https://www.kavati.net/api/tranzila/notify`,
    nologo:              "1",
  });
  return `${IFRAME_BASE}?${p.toString()}`;
}

// ─── Subscription iframe URL (first charge + tokenize) ──────────────────────
// tranmode=AK → standard charge + tokenize. Token is delivered to our
// notify endpoint as TranzilaTK. We then call /v1/sto/create to set up
// the monthly recurring charge on Tranzila's side.

function buildSubscriptionUrl(params: {
  businessId: number;
  ownerName:  string;
  email:      string;
}): string {
  const p = new URLSearchParams({
    sum:                 SUBSCRIPTION_FIRST_ILS.toFixed(2),
    currency:            "1",
    cred_type:           "1",
    tranmode:            "AK",                          // charge + tokenize
    lang:                "il",
    buttonLabel:         "שלם והפעל מנוי",
    contact:             params.ownerName,
    email:               params.email,
    pdesc:               `מנוי פרו קבעתי - ${params.businessId}`,
    success_url_address: `https://www.kavati.net/payment/success?type=subscription`,
    fail_url_address:    `https://www.kavati.net/payment/fail?type=subscription`,
    notify_url_address:  `https://www.kavati.net/api/tranzila/notify`,
    nologo:              "1",
  });
  return `${IFRAME_BASE}?${p.toString()}`;
}

// ─── POST /api/tranzila/notify ──────────────────────────────────────────────

router.post("/tranzila/notify", async (req, res): Promise<void> => {
  try {
    const body         = req.body ?? {};
    const responsecode = String(body.Response ?? body.responsecode ?? "");
    const pdesc        = String(body.pdesc ?? "");

    console.log("[Tranzila] Notify received:", { responsecode, pdesc, body });

    // ── Subscription payment ─────────────────────────────────────────────
    // Initial iframe charge (tranmode=AK) → no sto_external_id yet.
    //   Store token + call /v1/sto/create. Tranzila then auto-charges monthly.
    // Recurring STO charge → body includes sto_external_id. Just extend renewal.
    const subscriptionMatch = pdesc.match(/מנוי פרו קבעתי - (\d+)/);
    if (subscriptionMatch) {
      const businessId    = parseInt(subscriptionMatch[1]);
      const stoExternalId = body.sto_external_id ? parseInt(String(body.sto_external_id)) : null;

      if (responsecode === "000") {
        const renewDate = new Date();
        renewDate.setDate(renewDate.getDate() + 30);

        if (stoExternalId) {
          // Recurring STO charge — Tranzila handled the charge, extend renewal.
          await db
            .update(businessesTable)
            .set({ subscriptionRenewDate: renewDate } as any)
            .where(eq(businessesTable.id, businessId));
          console.log(`[Tranzila] Recurring STO charge business=${businessId} sto=${stoExternalId}`);
        } else {
          // Initial iframe charge. Store token, mark Pro, create STO.
          const token   = String(body.TranzilaTK ?? body.tranzilatk ?? body.token ?? "").trim();
          const mm      = String(body.expmonth ?? "").padStart(2, "0").slice(0, 2);
          const yy      = String(body.expyear  ?? "").padStart(2, "0").slice(-2);
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

          // Create STO so Tranzila handles all future monthly charges.
          if (token && mm && yy) {
            const [biz] = await db
              .select({
                ownerName:     businessesTable.ownerName,
                email:         businessesTable.email,
                existingStoId: (businessesTable as any).tranzilaStorId,
              })
              .from(businessesTable)
              .where(eq(businessesTable.id, businessId));

            if (biz && !biz.existingStoId) {
              const sto = await createStandingOrder({
                token,
                expireMonth: parseInt(mm, 10),
                expireYear:  2000 + parseInt(yy, 10),
                clientName:  biz.ownerName,
                clientEmail: biz.email,
                businessId,
                amountILS:   SUBSCRIPTION_MONTHLY_ILS,
              });

              if (sto.success && sto.stoId) {
                await db
                  .update(businessesTable)
                  .set({ tranzilaStorId: sto.stoId } as any)
                  .where(eq(businessesTable.id, businessId));
                console.log(`[Tranzila] STO created business=${businessId} stoId=${sto.stoId}`);
              } else {
                console.warn(`[Tranzila] STO creation failed business=${businessId}: ${sto.error}`);
              }
            }
          }
        }
      } else {
        console.log(`[Tranzila] Subscription payment failed business=${businessId} code=${responsecode} sto=${stoExternalId ?? "n/a"}`);
      }

      res.status(200).send("OK");
      return;
    }

    // ── Appointment deposit ──────────────────────────────────────────────
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
        console.log(`[Tranzila] Appointment ${apptId} payment rejected (${responsecode})`);
      }
    }

    res.status(200).send("OK");
  } catch (e) {
    console.error("[Tranzila] Notify error:", e);
    res.status(200).send("OK");
  }
});

// ─── GET /api/tranzila/payment-url/:appointmentId ───────────────────────────

router.get("/tranzila/payment-url/:appointmentId", async (req, res): Promise<void> => {
  const apptId = parseInt(req.params.appointmentId);
  if (isNaN(apptId)) { res.status(400).json({ error: "Invalid appointment ID" }); return; }

  const [appt] = await db
    .select({
      id:          appointmentsTable.id,
      clientName:  appointmentsTable.clientName,
      serviceName: appointmentsTable.serviceName,
      status:      appointmentsTable.status,
      businessId:  appointmentsTable.businessId,
    })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, apptId));

  if (!appt) { res.status(404).json({ error: "Appointment not found" }); return; }

  const [business] = await db
    .select({
      depositAmountAgorot:        (businessesTable as any).depositAmountAgorot,
      requireAppointmentApproval: businessesTable.requireAppointmentApproval,
    })
    .from(businessesTable)
    .where(eq(businessesTable.id, appt.businessId));

  if (!business?.depositAmountAgorot) { res.status(400).json({ error: "No deposit required" }); return; }

  const sumILS = business.depositAmountAgorot / 100;
  const url    = buildTranzilaUrl({
    appointmentId:    appt.id,
    sum:              sumILS,
    description:      `${appt.serviceName} - תור מספר ${appt.id}`,
    clientName:       appt.clientName,
    requiresApproval: !!business.requireAppointmentApproval,
  });

  res.json({ url, sum: sumILS, appointmentId: appt.id });
});

// ─── GET /api/tranzila/subscription-url (authenticated) ─────────────────────

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
