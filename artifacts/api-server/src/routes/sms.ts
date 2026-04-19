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
import { eq, and, desc, sql } from "drizzle-orm";
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
import { chargeTokenOneOff } from "../lib/tranzilaCharge";
import { allocateUnsubscribeTokensBulk } from "../lib/unsubscribeToken";

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
  const recipientsBeforeFilter = (recipientsRaw as unknown[])
    .map(r => String(r ?? "").trim())
    .filter(r => r.length > 0);
  if (recipientsBeforeFilter.length === 0) {
    res.status(400).json({ error: "recipients must be a non-empty array" });
    return;
  }

  // Block ONLY recipients who explicitly unsubscribed (replied 'הסר',
  // clicked Inforu's opt-out link, or were removed manually by the owner).
  // The opt-out audit lives in broadcast_unsubscribes (rows persist even
  // after we hard-delete the subscriber row, so recent opt-outs still
  // block sends). Missing rows → implicitly allowed — existing customer
  // relationship provides legal basis under תיקון 40 for relationship
  // marketing.
  const normalizeForSub = (p: string) => p.replace(/\D/g, "").replace(/^972/, "0");
  const unsubRows = await db.execute(sql`
    SELECT phone_number FROM broadcast_unsubscribes
    WHERE business_id = ${businessId}
  `);
  const unsubSet = new Set<string>();
  for (const r of ((unsubRows as any).rows ?? [])) {
    const norm = normalizeForSub(String((r as any).phone_number ?? ""));
    if (norm) unsubSet.add(norm);
  }
  const recipients = recipientsBeforeFilter.filter(
    p => !unsubSet.has(normalizeForSub(p)),
  );
  const droppedForOptOut = recipientsBeforeFilter.length - recipients.length;

  if (recipients.length === 0) {
    res.status(400).json({
      error: "all_recipients_opted_out",
      message: "כל הנמענים הוסרו מהרשימה בעבר — לא בוצעה שליחה",
      droppedForOptOut,
    });
    return;
  }
  // Cap per request so a typo doesn't drain the whole balance and so we
  // stay under Inforu's per-request recipient limit.
  if (recipients.length > 1000) {
    res.status(400).json({ error: "too_many_recipients", limit: 1000 });
    return;
  }

  // Compose the SMS: business name first, owner's message in the middle,
  // our own per-recipient opt-out footer at the end. Each recipient gets
  // a short DB-backed token baked into /api/u/<token> — the /api/ prefix
  // is required because only /api/* is routed to this server on Railway.
  const ownerMessage  = (messageRaw as string).trim();
  const businessLabel = (biz.name ?? "").trim();
  const host = (process.env.KAVATI_HOST ?? "www.kavati.net").replace(/^https?:\/\//, "").replace(/\/$/, "");
  // Bulk-allocate one token per recipient in a single INSERT so we don't
  // do N round trips before the first SMS even goes out.
  const tokens = await allocateUnsubscribeTokensBulk(businessId, recipients);
  const composeMessage = (recipientPhone: string, token: string): string =>
    [
      businessLabel ? `${businessLabel}:` : null,
      ownerMessage,
      "",
      `להסרה https://${host}/api/u/${token}`,
    ].filter(Boolean).join("\n");

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

  // Per-send id prefix — echoed back in Inforu DLR + reply webhooks so we
  // can match them to rows AND extract the originating business. The
  // "broadcast-<businessId>-<uuid>" prefix is parsed by
  // /sms/inforu-webhook/reply to know which business to opt-out
  // the replier from.
  const customerMessageIdBase = `broadcast-${businessId}-${crypto.randomUUID()}`;
  const deliveryReportUrl = `${(process.env.PUBLIC_API_BASE_URL ?? "https://www.kavati.net/api").replace(/\/$/, "")}/sms/inforu-webhook/delivery`;

  // Sender: prefer the account-level INFORU_SENDER_NAME (pre-registered
  // with the Israeli carriers) over the business name. See comment in
  // the previous version of this file.
  const senderName = (process.env.INFORU_SENDER_NAME ?? biz.name).trim();

  // Per-recipient parallel send. One SMS per recipient, each carrying its
  // own tokenised opt-out URL. Promise.allSettled so a single failure
  // doesn't abort the others mid-flight.
  type PerSend = {
    phone: string;
    bodyId: string;
    message: string;
    ok: boolean;
    messageId: string | null;
    status: "queued" | "failed";
    reason: string | null;
    statusCode: number | null;
    statusText: string | null;
    configured: boolean;
  };
  const sendResults: PerSend[] = await Promise.all(
    recipients.map(async (phone, i): Promise<PerSend> => {
      const body = composeMessage(phone, tokens[i]);
      const bodyId = `${customerMessageIdBase}-${i}`;
      try {
        const r = await inforuSendSms({
          recipients: [phone],
          message: body,
          senderName,
          customerMessageId: bodyId,
          deliveryReportUrl,
        });
        const firstRec = r.recipients[0];
        return {
          phone,
          bodyId,
          message: body,
          ok: r.ok && firstRec?.status === "queued",
          messageId: r.messageId,
          status: (firstRec?.status === "queued" ? "queued" : "failed"),
          reason: firstRec?.error ?? r.statusText ?? null,
          statusCode: r.statusCode,
          statusText: r.statusText,
          configured: r.configured,
        };
      } catch (err: any) {
        return {
          phone, bodyId, message: body, ok: false, messageId: null,
          status: "failed",
          reason: err?.message ?? "send_threw",
          statusCode: null,
          statusText: err?.message ?? "send_threw",
          configured: true,
        };
      }
    }),
  );

  const anyConfigured = sendResults.some(r => r.configured);
  if (!anyConfigured) {
    // Pre-launch mode: no Inforu account yet. Record intent + refund
    // credits so the owner can retry when Inforu is live.
    await refundQuota(businessId, reservation.reservations);
    await db.insert(smsMessagesTable).values(
      sendResults.map((r, i) => ({
        businessId,
        recipientPhone: r.phone,
        message: r.message,
        status: "failed" as const,
        statusReason: "inforu not configured (pre-launch)",
        customerMessageId: r.bodyId,
        chargedCredits: 0,
        fromSource: pickBucketForIndex(reservation.reservations, i),
      })),
    );
    res.status(503).json({
      error: "inforu_not_configured",
      message: "SMS gateway not yet connected — contact support.",
    });
    return;
  }

  const queuedCount = sendResults.filter(r => r.ok).length;
  const failedCount = recipients.length - queuedCount;

  // Refund credits for the failed sends only — successes ate their credit.
  if (failedCount > 0) {
    const partialRefund = reservation.reservations
      .map(r => ({ ...r, reservedCount: 0 })); // build zero-copy to mutate safely
    let toRefund = failedCount;
    for (const b of partialRefund) {
      if (toRefund <= 0) break;
      const original = reservation.reservations.find(x => x.fromSource === b.fromSource)?.reservedCount ?? 0;
      const take = Math.min(original, toRefund);
      b.reservedCount = take;
      toRefund -= take;
    }
    await refundQuota(businessId, partialRefund.filter(b => b.reservedCount > 0));
  }

  // Persist one row per recipient with its individual Inforu result.
  await db.insert(smsMessagesTable).values(
    sendResults.map((r, i) => ({
      businessId,
      recipientPhone: r.phone,
      message: r.message,
      status: r.status,
      inforuMessageId: r.messageId,
      customerMessageId: r.bodyId,
      chargedCredits: r.ok ? 1 : 0,
      fromSource: pickBucketForIndex(reservation.reservations, i),
      statusReason: r.reason,
    })),
  );

  // If ALL failed, surface the first failure reason so the owner sees
  // something actionable (same shape as the batched version used).
  if (queuedCount === 0) {
    const first = sendResults.find(r => !r.ok);
    logger.warn({
      businessId,
      firstReason: first?.reason,
      firstStatusCode: first?.statusCode,
      sender: senderName,
    }, "[sms/send-bulk] all recipients failed");
    res.status(502).json({
      error: "sms_gateway_failed",
      reason: first?.statusText ?? first?.reason ?? "unknown",
    });
    return;
  }

  // Sync back any per-recipient opt-outs Inforu surfaced in per-send
  // Errors[]. A recipient who's on Inforu's account-level blacklist
  // (from the old Inforu-hosted link era) still trips this — we translate
  // it into our own broadcast_unsubscribes so next campaign filters them
  // out without another round trip.
  try {
    const optOutMarkers = ["unsubscr", "blacklist", "optout", "הסיר", "לא לשלוח"];
    const normalizeForSync = (p: string) => p.replace(/\D/g, "").replace(/^972/, "0");
    for (const r of sendResults) {
      if (r.ok) continue;
      const lower = String(r.reason ?? "").toLowerCase();
      const looksLikeOptOut = optOutMarkers.some(k => lower.includes(k));
      if (!looksLikeOptOut) continue;
      const normPhone = normalizeForSync(r.phone);
      if (!normPhone) continue;
      await db.execute(sql`
        INSERT INTO broadcast_unsubscribes (business_id, phone_number, source)
        VALUES (${businessId}, ${normPhone}, 'inforu_self_link')
        ON CONFLICT (business_id, phone_number) DO NOTHING
      `);
      await db.execute(sql`
        DELETE FROM broadcast_subscribers
        WHERE business_id = ${businessId} AND phone_number = ${normPhone}
      `);
      logger.info({ businessId, phone: normPhone }, "[send-bulk] synced Inforu-side opt-out to local list");
    }
  } catch (syncErr) {
    logger.warn({ err: syncErr }, "[send-bulk] opt-out sync failed");
  }

  res.json({
    ok: true,
    sent: queuedCount,
    failed: failedCount,
    inforuMessageId: sendResults.find(r => r.ok)?.messageId ?? null,
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

  // Business must have a saved Tranzila token (= they've completed their
  // first subscription payment through the iframe). If not, surface a
  // clear error so the UI can route them to the "add payment method"
  // flow first.
  if (!biz.tranzilaToken || !biz.tranzilaTokenExpiry) {
    res.status(400).json({
      error: "no_payment_method",
      message: "עליך להוסיף אמצעי תשלום לפני רכישת חבילה.",
      purchaseUrl: "/dashboard#payment-method",
    });
    return;
  }

  // 1. Create pending pack row FIRST so failed charges are still visible
  //    in the audit trail. DCdisable uses this row id so a retry of this
  //    request within 24h won't double-charge (Tranzila deduplicates).
  const [purchase] = await db
    .insert(smsPackPurchasesTable)
    .values({
      businessId,
      packSize,
      pricePaidAgorot: priceAgorot,
      status: "pending",
    })
    .returning();

  // 2. Charge the token.
  const chargeResult = await chargeTokenOneOff(
    biz.tranzilaToken,
    biz.tranzilaTokenExpiry,
    priceAgorot / 100, // Tranzila wants ILS, not agorot
    `קבעתי — חבילת ${packSize} SMS`,
    businessId,
    `sms-pack-${purchase.id}`, // DCdisable unique id
  );

  if (!chargeResult.success) {
    await db
      .update(smsPackPurchasesTable)
      .set({ status: "failed" })
      .where(eq(smsPackPurchasesTable.id, purchase.id));
    res.status(402).json({
      error: "charge_failed",
      responseCode: chargeResult.responseCode,
      message: chargeResult.message ?? "החיוב נדחה. בדוק את כרטיס האשראי או נסה שוב.",
    });
    return;
  }

  // 3. Mark completed + top up the extra balance atomically.
  await db
    .update(smsPackPurchasesTable)
    .set({
      status: "completed",
      tranzilaTransactionId: chargeResult.transactionId ? String(chargeResult.transactionId) : null,
      completedAt: new Date(),
    })
    .where(eq(smsPackPurchasesTable.id, purchase.id));
  await addExtraBalance(businessId, packSize);

  const snap = await getQuotaSnapshot(businessId);
  res.json({
    ok: true,
    purchaseId:     purchase.id,
    creditsAdded:   packSize,
    transactionId:  chargeResult.transactionId,
    authNumber:     chargeResult.authNumber,
    totalAvailable: snap.totalAvailable,
    extraBalance:   snap.extraBalance,
  });
});

// ─── POST /api/sms/test-charge ────────────────────────────────────────────
// Dev/diagnostic endpoint — charges ₪1 to the caller's saved Tranzila
// token and returns the full result. Used by "🧪 בדיקת חיוב ₪1" buttons
// in the dashboard so the owner can verify the one-off charge flow works
// against THEIR real token before relying on it for SMS pack purchases.
// Remove the button + this endpoint once we're confident the flow is
// stable in production.
//
// Logging is verbose here on purpose — when this endpoint returns an
// error to the owner, the Railway logs need to tell us exactly what
// happened. Earlier test-runs returned "unknown error" with nothing in
// logs; added explicit entry/auth/token/result logs to fix that.
router.post("/sms/test-charge", async (req, res): Promise<void> => {
  // ALWAYS log entry — even if auth rejects, we want proof the endpoint
  // is reachable on Railway. Without this, a missing-deploy 404 was
  // indistinguishable from an auth failure.
  const hasAuthHeader = typeof req.headers.authorization === "string" && req.headers.authorization.length > 0;
  console.log("[test-charge] ENTRY", { hasAuthHeader, ip: req.ip });
  logger.info({ hasAuthHeader }, "[test-charge] entry");

  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) {
    console.log("[test-charge] REJECTED — no valid JWT");
    res.status(401).json({ error: "Unauthorized", message: "אסימון הזדהות לא תקף — התנתק והיכנס שוב." });
    return;
  }
  console.log("[test-charge] authed", { businessId });

  const biz = await loadBusiness(businessId);
  if (!biz) {
    console.log("[test-charge] business not found", { businessId });
    res.status(404).json({ error: "Business not found", message: "העסק לא נמצא." });
    return;
  }
  if (!biz.tranzilaToken || !biz.tranzilaTokenExpiry) {
    console.log("[test-charge] no saved token", {
      businessId,
      hasToken: !!biz.tranzilaToken,
      hasExpiry: !!biz.tranzilaTokenExpiry,
    });
    res.status(400).json({
      error: "no_payment_method",
      message: "אין טוקן שמור. סיים קודם את תשלום המנוי הראשון דרך ה-iframe.",
    });
    return;
  }

  console.log("[test-charge] calling chargeTokenOneOff", {
    businessId,
    tokenPreview: biz.tranzilaToken.slice(0, 4) + "***",
    expiry: biz.tranzilaTokenExpiry,
  });

  const result = await chargeTokenOneOff(
    biz.tranzilaToken,
    biz.tranzilaTokenExpiry,
    1, // ₪1 test charge
    "קבעתי — בדיקת חיוב",
    businessId,
    // No DCdisable here — each click should create a new transaction so
    // we can trigger multiple tests in a session without Tranzila
    // rejecting for duplication.
  );

  console.log("[test-charge] result", {
    businessId,
    success:        result.success,
    responseCode:   result.responseCode,
    message:        result.message,
    transactionId:  result.transactionId,
    rawPreview:     result.rawResponse.slice(0, 200),
  });

  res.json({
    ok:             result.success,
    transactionId:  result.transactionId,
    authNumber:     result.authNumber,
    responseCode:   result.responseCode,
    message:        result.message ?? (result.success ? "חיוב הצליח" : "החיוב נדחה"),
    // The raw response is useful for debugging during the wiring phase;
    // we'll remove it from the response once we're confident.
    rawSnippet:     result.rawResponse.slice(0, 500),
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

// ─── POST /api/sms/inforu-webhook/reply ───────────────────────────────────
// Inforu's inbound-SMS webhook. When a recipient replies to one of our
// broadcast messages, Inforu posts the reply here. If the reply body (after
// trimming + lower-casing) contains any of the opt-out keywords below we
// add the sender's phone to broadcast_unsubscribes for the originating
// business, so the next campaign skips them automatically.
//
// Auth: NO bearer header. Inforu's webhook config doesn't let us send one,
// and the opt-out table key is (businessId, phone) — we can't write a row
// without knowing the exact business, so an anonymous caller can't forge a
// useful entry.
const OPT_OUT_KEYWORDS = [
  "הסר", "הסרה", "הסירו", "הסירי", "מהסרה",
  "stop", "unsubscribe", "remove",
];

router.post("/sms/inforu-webhook/reply", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};
    // Inforu's reply webhook body isn't pinned in the public docs — parse
    // defensively so a key rename doesn't silently break opt-outs.
    const rawPhone    = String(body?.Phone ?? body?.phone ?? body?.From ?? body?.from ?? "");
    const rawMessage  = String(body?.Message ?? body?.message ?? body?.Text ?? body?.text ?? body?.Body ?? "").trim();
    const rawCustomer = body?.CustomerMessageID ?? body?.CustomerMessageId ?? body?.customerMessageId ?? null;

    if (!rawPhone || !rawMessage) {
      logger.warn({ body }, "[inforu-reply] missing phone or message");
      res.json({ ok: true });
      return;
    }

    const lower = rawMessage.toLowerCase();
    const isOptOut = OPT_OUT_KEYWORDS.some(k => lower === k || lower.startsWith(k + " ") || lower.endsWith(" " + k) || lower.includes(k));
    if (!isOptOut) {
      // Not an opt-out — just log and drop. Future: could forward to the
      // business owner as an in-app notification so they see the reply.
      logger.info({ phone: rawPhone, preview: rawMessage.slice(0, 40) }, "[inforu-reply] ignoring non-opt-out reply");
      res.json({ ok: true });
      return;
    }

    // Find which business this phone last got a broadcast from. We stored
    // customerMessageId as `broadcast-<businessId>-<timestamp>` for every
    // send, so the reply's echoed CustomerMessageID (if Inforu returns it)
    // gives us the business immediately. Otherwise we fall back to the
    // most recent sms_messages row for this recipient.
    let businessId: number | null = null;
    if (typeof rawCustomer === "string") {
      const m = rawCustomer.match(/^broadcast-(\d+)-/);
      if (m) businessId = parseInt(m[1], 10);
    }
    if (!businessId || isNaN(businessId)) {
      const [row] = await db
        .select({ businessId: smsMessagesTable.businessId })
        .from(smsMessagesTable)
        .where(eq(smsMessagesTable.recipientPhone, rawPhone))
        .orderBy(desc(smsMessagesTable.createdAt))
        .limit(1);
      businessId = row?.businessId ?? null;
    }

    if (!businessId) {
      logger.warn({ rawPhone }, "[inforu-reply] opt-out reply but no originating business — dropping");
      res.json({ ok: true });
      return;
    }

    // Normalise to Israeli local form to match what we store elsewhere.
    const normalizedPhone = rawPhone.replace(/\D/g, "").replace(/^972/, "0");

    // Audit the opt-out in broadcast_unsubscribes first (checked by send
    // filters), then hard-delete the subscriber row so the owner's UI
    // stops showing the number. Per owner's request: "תסיר את מי שעשה
    // unsubscribe מהרשימת תפוצה שלנו".
    await db.execute(sql`
      INSERT INTO broadcast_unsubscribes (business_id, phone_number, source)
      VALUES (${businessId}, ${normalizedPhone}, 'reply')
      ON CONFLICT (business_id, phone_number) DO NOTHING
    `);
    await db.execute(sql`
      DELETE FROM broadcast_subscribers
      WHERE business_id = ${businessId} AND phone_number = ${normalizedPhone}
    `);
    logger.info({ businessId, phone: normalizedPhone }, "[inforu-reply] opt-out recorded");

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, body: req.body }, "[inforu-reply] webhook handler error");
    res.json({ ok: true });
  }
});

export default router;
