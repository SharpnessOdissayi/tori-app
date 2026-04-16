import { Router } from "express";
import { db, appointmentsTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";

const router = Router();

const SUPPLIER   = process.env.TRANZILA_SUPPLIER ?? "";   // lilash2  — iframe (charge + tokenize)
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

// TRANZILA_TEST_MODE=true → 1 ILS (the minimum most Tranzila terminals accept).
const TEST_MODE              = process.env.TRANZILA_TEST_MODE === "true";
const SUBSCRIPTION_FIRST_ILS = TEST_MODE ? 1 : 50;

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
// v1 flow: charge via lilash2 iframe with tranmode=AK (charge + tokenize).
// The lilash2 and lilash2tok terminals are synced in Tranzila's DB — the
// TranzilaTK token returned here is valid for recurring charges on lilash2tok
// without ID or CVV (see tranzilaCharge.ts).
// Cancel = set subscriptionCancelledAt → cron stops charging. Period.

function buildSubscriptionUrl(params: {
  businessId: number;
  ownerName:  string;
  email:      string;
}): string {
  const base = `https://directng.tranzila.com/${SUPPLIER}/iframenew.php`;
  const p = new URLSearchParams({
    sum:                 SUBSCRIPTION_FIRST_ILS.toFixed(2),
    currency:            "1",
    cred_type:           "1",
    tranmode:            "AK",                                // charge + tokenize
    lang:                "il",
    buttonLabel:         "שלם והפעל מנוי",
    contact:             params.ownerName,
    email:               params.email,
    pdesc:               `מנוי פרו קבעתי - ${params.businessId}`,
    success_url_address: `https://www.kavati.net/payment/success?type=subscription`,
    fail_url_address:    `https://www.kavati.net/payment/fail?type=subscription`,
    notify_url_address:  `https://www.kavati.net/api/tranzila/notify`,
    nologo:              "1",
    newprocess:          "1",
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

    // ── Subscription payment (initial charge + tokenization, tranmode=AK) ──
    // pdesc = "מנוי פרו קבעתי - {businessId}". Monthly renewals don't go through
    // this webhook — they are driven by subscriptionCron.ts using the stored token.
    const subscriptionMatch = pdesc.match(/מנוי פרו קבעתי - (\d+)/);
    if (subscriptionMatch) {
      const businessId = parseInt(subscriptionMatch[1]);

      if (responsecode === "000") {
        // body.TranzilaTK = card token (e.g. "n861981937dbfca7985")
        // body.expmonth   = "09"  | body.expyear = "28"  → expdate MMYY for CGI charges
        const token   = String(body.TranzilaTK ?? body.tranzilatk ?? body.token ?? "").trim();
        const mm      = String(body.expmonth ?? "").padStart(2, "0").slice(0, 2);
        const yy      = String(body.expyear  ?? "").padStart(2, "0").slice(-2);
        const expdate = mm && yy ? `${mm}${yy}` : String(body.expdate ?? "").trim();

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

        console.log(`[Tranzila] Business ${businessId} upgraded to Pro, renews ${renewDate.toISOString()} — monthly cron will charge token`);
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
