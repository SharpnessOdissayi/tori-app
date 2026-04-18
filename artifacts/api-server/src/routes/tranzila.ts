import { Router } from "express";
import { db, appointmentsTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { chargeToken, getSto, updateSto } from "../lib/tranzilaCharge";
import { JWT_SECRET } from "../lib/auth";

const router = Router();

// Single terminal — lilash2. Used for both deposits and subscription
// iframe. Tokenization (tranmode=AK) returns TranzilaTK usable for STO.
const SUPPLIER = process.env.TRANZILA_SUPPLIER ?? "";

// Shared secret with Tranzila — configured in the Tranzila dashboard
// (Settings → Terminal → Notify → Notify Password). Tranzila echoes this
// value in the POST body on every /notify call.
//
// Soft check: if TRANZILA_NOTIFY_PASSWORD is set on Railway but NOT yet
// mirrored in the Tranzila dashboard, Tranzila's webhooks won't carry the
// password field — so we only REJECT when the password is explicitly WRONG
// (someone trying to forge), and log a warning when it's MISSING (likely
// a legit webhook before the dashboard config is complete). Flip to strict
// mode by setting TRANZILA_STRICT_NOTIFY=true once the dashboard is
// configured on both terminals.
const TRANZILA_NOTIFY_PASSWORD = (process.env.TRANZILA_NOTIFY_PASSWORD ?? "").trim();
const TRANZILA_STRICT_NOTIFY   = process.env.TRANZILA_STRICT_NOTIFY === "true";

// Subscription pricing:
//   First month:  ₪50 (50% opening discount, paid on the iframe at signup)
//   From month 2: ₪100/mo, auto-charged monthly by Tranzila via the STO
// The STO is created with the MONTHLY amount so recurring runs use 100,
// not the discounted first-month figure.
const SUBSCRIPTION_FIRST_ILS   = 50;
const SUBSCRIPTION_MONTHLY_ILS = 100;

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
  // Prefer an env-configured base URL (so dev/staging don't redirect back
  // to production), fall back to the production hostname.
  const baseUrl = (process.env.BOOKING_BASE_URL ?? "https://www.kavati.net").replace(/\/$/, "");
  const successUrl = `${baseUrl}/payment/success?appt=${params.appointmentId}${params.requiresApproval ? "&approval=1" : ""}`;
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
    fail_url_address:    `${baseUrl}/payment/fail?appt=${params.appointmentId}`,
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
    const body = req.body ?? {};

    // ── Authenticate webhook (soft by default) ───────────────────────────
    // Tranzila echoes the Notify Password in the POST body (param name
    // `notify_password` per the DirectNG/My-Billing spec). Any caller that
    // provides the WRONG password is clearly a forgery attempt and is
    // rejected. Missing password is only rejected when STRICT_NOTIFY is
    // explicitly enabled — otherwise we log a warning and accept, so
    // that legitimate webhooks don't drop while the Tranzila dashboard
    // config is still pending.
    const notifyPassword = String(
      body.notify_password ?? body.notifyPassword ?? ""
    ).trim();
    if (notifyPassword && TRANZILA_NOTIFY_PASSWORD && notifyPassword !== TRANZILA_NOTIFY_PASSWORD) {
      console.warn(
        "[Tranzila] Notify REJECTED — wrong notify_password (likely forgery)",
        { ip: req.ip, pdesc: body.pdesc }
      );
      res.status(403).send("forbidden");
      return;
    }
    if (!notifyPassword) {
      if (TRANZILA_STRICT_NOTIFY) {
        console.warn(
          "[Tranzila] Notify REJECTED — missing notify_password under STRICT mode",
          { ip: req.ip, pdesc: body.pdesc }
        );
        res.status(403).send("forbidden");
        return;
      }
      console.warn(
        "[Tranzila] Notify accepted WITHOUT password — configure the Tranzila dashboard and set TRANZILA_STRICT_NOTIFY=true to harden",
        { ip: req.ip, pdesc: body.pdesc }
      );
    }

    const responsecode = String(body.Response ?? body.responsecode ?? "");
    const pdesc        = String(body.pdesc ?? "");

    console.log("[Tranzila] Notify received:", { responsecode, pdesc, body });

    // ── Subscription payment (initial iframe charge, tranmode=AK) ────────
    // Monthly renewals are driven by subscriptionCron.ts using the stored
    // token via /v1/transaction/credit_card/create — not by this webhook.
    const subscriptionMatch = pdesc.match(/מנוי פרו קבעתי - (\d+)/);
    if (subscriptionMatch) {
      const businessId = parseInt(subscriptionMatch[1]);
      if (!businessId || isNaN(businessId)) {
        console.error(`[Tranzila] subscription webhook: invalid businessId in pdesc: ${pdesc}`);
        res.status(200).send("OK");
        return;
      }

      if (responsecode === "000") {
        const token   = String(body.TranzilaTK ?? body.tranzilatk ?? body.token ?? "").trim();
        const mm      = String(body.expmonth ?? "").padStart(2, "0").slice(0, 2);
        const yy      = String(body.expyear  ?? "").padStart(2, "0").slice(-2);
        const expdate = mm && yy ? `${mm}${yy}` : String(body.expdate ?? "").trim();

        const renewDate = new Date();
        renewDate.setDate(renewDate.getDate() + 30);

        // Trial → paid conversion: bump the bulk-SMS monthly quota from
        // the trial-time 50 up to the paid-tier allowance (100 for פרו,
        // 500 for עסקי). Don't touch if they've already paid — that
        // case re-enters this block from a recurring monthly charge and
        // the quota is already correct.
        const [bizBefore] = await db
          .select({ plan: businessesTable.subscriptionPlan, hadToken: businessesTable.tranzilaToken })
          .from(businessesTable)
          .where(eq(businessesTable.id, businessId));
        const isFirstPayment = !bizBefore?.hadToken;
        const paidQuota = bizBefore?.plan === "pro-plus" ? 500 : 100;

        await db
          .update(businessesTable)
          .set({
            // Preserve pro-plus if the business was on it; otherwise fall
            // back to Pro (the default paid tier for trial conversions).
            subscriptionPlan:        bizBefore?.plan === "pro-plus" ? "pro-plus" : "pro",
            maxServicesAllowed:      999,
            maxAppointmentsPerMonth: 9999,
            subscriptionStartDate:   new Date(),
            subscriptionRenewDate:   renewDate,
            subscriptionCancelledAt: null,
            tranzilaToken:           token   || null,
            tranzilaTokenExpiry:     expdate || null,
            ...(isFirstPayment ? { smsMonthlyQuota: paidQuota } : {}),
          } as any)
          .where(eq(businessesTable.id, businessId));

        console.log(`[Tranzila] Business ${businessId} upgraded to Pro, renews ${renewDate.toISOString()}`);

        // Issue a receipt from Kavati → business owner (fire-and-forget).
        // Distinguish initial vs. recurring via sto_external_id (presence
        // means recurring; absence means the first, iframe-driven charge).
        const isRecurring = !!(body.sto_external_id ?? body.stoExternalId);
        const sumAgorot = Math.round(Number(body.sum ?? body.Amount ?? 0) * 100);
        // Guard against malformed/negative/absurd amounts from the webhook
        // body — Tranzila always sends ≥ 0 but a spoofed request could
        // carry anything. Silently bail instead of writing garbage.
        if (!Number.isFinite(sumAgorot) || sumAgorot <= 0 || sumAgorot > 100_000_00) {
          console.warn(`[Tranzila] subscription webhook with invalid sum: ${body.sum ?? body.Amount}`);
          res.status(200).send("OK");
          return;
        }
        const confirmation = String(body.ConfirmationCode ?? body.confirmationCode ?? body.index ?? "").trim();

        (async () => {
          try {
            const [biz] = await db
              .select({
                name:  businessesTable.name,
                email: businessesTable.email,
                taxId: (businessesTable as any).businessTaxId,
              })
              .from(businessesTable)
              .where(eq(businessesTable.id, businessId));
            if (!biz) return;
            const { issueKavatiReceipt } = await import("../lib/receipts");
            await issueKavatiReceipt({
              businessId,
              businessName:     biz.name,
              businessEmail:    biz.email,
              businessTaxId:    biz.taxId ?? null,
              amountAgorot:     sumAgorot || (isRecurring ? SUBSCRIPTION_MONTHLY_ILS * 100 : SUBSCRIPTION_FIRST_ILS * 100),
              paymentMethod:    "credit_card",
              paymentReference: confirmation || undefined,
              purpose:          isRecurring ? "subscription_renewal" : "subscription_initial",
            });
          } catch (e) {
            console.error("[Tranzila] receipt issuance failed:", e);
          }
        })();

        // Now that we have the token, create an STO on Tranzila's side so
        // they auto-charge every month from here on out. Skip if the
        // business already has one (re-subscription after cancel).
        console.log(`[Tranzila] STO gate — token=${token ? "yes" : "NO"} expdate=${expdate || "NO"}`);

        if (token && expdate) {
          const [existing] = await db
            .select({ existingStoId: (businessesTable as any).tranzilaStorId })
            .from(businessesTable)
            .where(eq(businessesTable.id, businessId));

          console.log(`[Tranzila] STO check — existingStoId=${existing?.existingStoId ?? "null"}`);

          if (!existing?.existingStoId) {
            const sto = await chargeToken(
              token,
              expdate,
              SUBSCRIPTION_MONTHLY_ILS,
              businessId,
            );
            if (sto.success && sto.stoId) {
              await db
                .update(businessesTable)
                .set({ tranzilaStorId: sto.stoId } as any)
                .where(eq(businessesTable.id, businessId));
              console.log(`[Tranzila] STO ${sto.stoId} created for business ${businessId}`);
            } else {
              console.warn(`[Tranzila] STO create failed for business ${businessId}: ${sto.responseCode}`, sto.rawResponse.slice(0, 300));
            }
          } else {
            console.log(`[Tranzila] Skipping STO create — business ${businessId} already has STO ${existing.existingStoId}`);
          }
        }
      } else {
        console.log(`[Tranzila] Subscription payment failed business=${businessId} code=${responsecode}`);
      }

      res.status(200).send("OK");
      return;
    }

    // ── Appointment deposit ──────────────────────────────────────────────
    const pdescMatch = pdesc.match(/תור מספר (\d+)/);
    const apptIdRaw = pdescMatch
      ? parseInt(pdescMatch[1])
      : body.myid ? parseInt(String(body.myid)) : null;
    const apptId = apptIdRaw && !isNaN(apptIdRaw) ? apptIdRaw : null;

    if (apptId) {
      if (responsecode === "000") {
        // Look up whether this business requires manual approval. If yes,
        // the appointment should go deposit-paid → "pending" (waiting for
        // owner to approve), NOT directly to "confirmed". Earlier every
        // successful deposit auto-confirmed, which silently bypassed the
        // manual-approval toggle. Bug reported end-to-end.
        const [apptRow] = await db
          .select({ businessId: appointmentsTable.businessId })
          .from(appointmentsTable)
          .where(eq(appointmentsTable.id, apptId));
        let approvalActive = false;
        if (apptRow) {
          const [apptBiz] = await db
            .select({
              subscriptionPlan:           businessesTable.subscriptionPlan,
              requireAppointmentApproval: businessesTable.requireAppointmentApproval,
            })
            .from(businessesTable)
            .where(eq(businessesTable.id, apptRow.businessId));
          const isPaidPlan = apptBiz?.subscriptionPlan === "pro" || apptBiz?.subscriptionPlan === "pro-plus";
          approvalActive = !!(isPaidPlan && apptBiz?.requireAppointmentApproval);
        }
        await db
          .update(appointmentsTable)
          .set({ status: approvalActive ? "pending" : "confirmed" })
          .where(and(
            eq(appointmentsTable.id, apptId),
            eq(appointmentsTable.status, "pending_payment")
          ));
        console.log(`[Tranzila] Appointment ${apptId} deposit paid → ${approvalActive ? "pending (awaiting manual approval)" : "confirmed"}`);
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

// ─── Helper: require a valid business token on the request ──────────────────

function requireBusinessId(req: any): number | null {
  const authHeader = req.headers.authorization ?? "";
  const rawToken   = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!rawToken) return null;
  try {
    const payload = jwt.verify(rawToken, JWT_SECRET) as { businessId?: number; id?: number };
    return payload.businessId ?? payload.id ?? null;
  } catch {
    return null;
  }
}

// ─── GET /api/tranzila/subscription-status ──────────────────────────────────
// Pulls the live STO from Tranzila so we can show the owner:
//   - next_charge_date_time ("החיוב הבא: 16.05.2026")
//   - last_charge_date_time ("החיוב האחרון: 16.04.2026")
//   - charge_amount          (sum)
//   - sto_status             (active / inactive)
//
// Returns 404 if no STO is linked to the business yet.

router.get("/tranzila/subscription-status", async (req, res): Promise<void> => {
  const businessId = requireBusinessId(req);
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [biz] = await db
    .select({ stoId: (businessesTable as any).tranzilaStorId })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));

  if (!biz?.stoId) { res.status(404).json({ error: "no_sto" }); return; }

  const info = await getSto(biz.stoId);
  if (!info) { res.status(502).json({ error: "sto_fetch_failed" }); return; }

  res.json(info);
});

// ─── POST /api/tranzila/subscription-cancel ─────────────────────────────────
// Marks the STO inactive on Tranzila's side so they stop charging, AND
// flags the business as cancelled in our DB. Access stays Pro until the
// next renewal date (customer paid for the current period).

router.post("/tranzila/subscription-cancel", async (req, res): Promise<void> => {
  const businessId = requireBusinessId(req);
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [biz] = await db
    .select({ stoId: (businessesTable as any).tranzilaStorId })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));

  if (!biz?.stoId) { res.status(404).json({ error: "no_sto" }); return; }

  const ok = await updateSto(biz.stoId, "inactive");
  if (!ok) { res.status(502).json({ error: "sto_update_failed" }); return; }

  await db
    .update(businessesTable)
    .set({ subscriptionCancelledAt: new Date() } as any)
    .where(eq(businessesTable.id, businessId));

  res.json({ success: true });
});

export default router;
