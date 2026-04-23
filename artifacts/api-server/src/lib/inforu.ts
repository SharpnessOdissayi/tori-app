/**
 * Inforu SMS gateway — bulk + transactional SMS over the Israeli network.
 *
 * Two channels live in this file:
 *
 *   - Bulk marketing campaigns the owner composes from the dashboard
 *     ("הודעות ותזכורות" → bulk sender), gated behind Pro/עסקי.
 *   - Transactional OTP / login codes routed here when sendOtp() picks
 *     SMS over WhatsApp (cheaper + arrives without a WA account).
 *
 * Per the official Inforu docs (https://apidoc.inforu.co.il), authentication
 * is HTTP Basic over header — `Authorization: Basic <base64(Username:Token)>`.
 * The legacy `{ User: { Username, ApiToken } }` body field is NOT used; the
 * docs only show the header form. The token dialog in Inforu's portal also
 * offers a JWT Bearer mode, which we honour automatically when only a token
 * (no username) is set — see resolveAuthHeader() below.
 *
 * Credentials layout (populate in Railway env AFTER signing up at inforu.co.il):
 *   INFORU_USERNAME   — account username (one per Kavati). Required for Basic.
 *   INFORU_API_TOKEN  — API token from the Inforu dashboard.
 *   INFORU_AUTH_MODE  — optional override: "basic" | "bearer".
 *                       Defaults to "basic" when INFORU_USERNAME is set,
 *                       "bearer" when only INFORU_API_TOKEN is set.
 *   INFORU_BASE_URL   — optional override, defaults to https://capi.inforu.co.il
 *
 * Sender name is per-business: each API call passes the business name as
 * the SMS "from" (e.g. "LilashByGal"). Inforu requires sender names be
 * pre-registered with the Israeli carriers — the onboarding-to-production
 * step (done manually with Inforu support) is to register every business's
 * name. For new businesses we fall back to the shared "Kavati" sender
 * until their own is registered.
 *
 * Graceful degradation: when env vars are missing the client logs a warning
 * and returns a `{ configured: false }` result object instead of throwing.
 * Nothing else in the stack should break while we wait for the real account.
 */

import { logger } from "./logger";

const BASE_URL =
  process.env.INFORU_BASE_URL?.replace(/\/$/, "") ?? "https://capi.inforu.co.il";
const USERNAME    = process.env.INFORU_USERNAME    ?? "";
const API_TOKEN   = process.env.INFORU_API_TOKEN   ?? "";
const AUTH_MODE_RAW = (process.env.INFORU_AUTH_MODE ?? "").toLowerCase().trim();

type AuthMode = "basic" | "bearer";

function effectiveAuthMode(): AuthMode {
  if (AUTH_MODE_RAW === "basic" || AUTH_MODE_RAW === "bearer") return AUTH_MODE_RAW;
  // Auto-detect: a token alone defaults to Bearer (modern JWT-token flow);
  // username + token together default to Basic (the docs' default).
  return USERNAME.length > 0 ? "basic" : "bearer";
}

function resolveAuthHeader(): string | null {
  if (!API_TOKEN) return null;
  const mode = effectiveAuthMode();
  if (mode === "bearer") {
    return `Bearer ${API_TOKEN}`;
  }
  // Basic auth needs a username. Without one we can't form the header.
  if (!USERNAME) return null;
  const credentials = Buffer.from(`${USERNAME}:${API_TOKEN}`, "utf8").toString("base64");
  return `Basic ${credentials}`;
}

/** True iff the account credentials are present. Callers may branch on this. */
export function isInforuConfigured(): boolean {
  return resolveAuthHeader() !== null;
}

/**
 * Resolve the "from" label to use for a given business.
 *
 * Priority:
 *   1. businesses.sms_sender_name  (explicit per-business override, must be
 *      pre-registered with Inforu)
 *   2. businesses.slug             (public URL handle — ASCII + hyphens by
 *      design, a much better fit than the business name, which is usually
 *      Hebrew and degenerates to a random Latin substring after cleaning)
 *   3. process.env.INFORU_SENDER_NAME (platform-wide default)
 *   4. "Kavati"                    (hard fallback so we never fail to send)
 *
 * Note: previously fell back to businesses.name, but Hebrew names get
 * stripped down to whatever Latin characters happen to appear inside —
 * e.g. "תיקון ומכירת רחפני FPV" → "FPV", which confused recipients.
 * The slug is the owner-chosen, ASCII-safe public handle and is the
 * right choice for a sender label.
 */
export function resolveSenderName(biz: { smsSenderName?: string | null; slug?: string | null; name?: string | null } | null | undefined): string {
  const clean = (s: string | null | undefined) =>
    (s ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 11);
  const override = clean(biz?.smsSenderName);
  if (override) return override;
  const fromSlug = clean(biz?.slug);
  if (fromSlug) return fromSlug;
  const envDefault = clean(process.env.INFORU_SENDER_NAME);
  if (envDefault) return envDefault;
  return "Kavati";
}

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

export interface InforuSendResult {
  /** False when INFORU_USERNAME / INFORU_API_TOKEN are missing. */
  configured: boolean;
  /** True iff Inforu confirmed the message was accepted for delivery. */
  ok: boolean;
  /** Inforu's internal id — null on failure or when unconfigured. */
  messageId: string | null;
  /** Per-recipient status rows (populated on multi-recipient sends). */
  recipients: Array<{
    phone: string;
    status: "queued" | "failed";
    error?: string;
  }>;
  /** Raw Inforu response code + message for logging / debugging. */
  statusCode: number | null;
  statusText: string | null;
}

export interface InforuBalanceResult {
  configured: boolean;
  /** Remaining SMS credits at the Inforu account level. Null on failure. */
  credits: number | null;
  /** Raw response code + text. */
  statusCode: number | null;
  statusText: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phone normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inforu's documented format for Israeli phones is the LOCAL form
 * (e.g. "0541234567") — see the curl examples in the v2 SMS docs. Strip
 * non-digits, drop the +972 country prefix back to a leading zero.
 *
 *     0521234567   → 0521234567
 *     +972521234567 → 0521234567
 *     972521234567 → 0521234567
 *     521234567    → 0521234567   (assume IL when bare 9-digit mobile)
 *
 * Non-IL numbers (anything else after stripping) are passed through digits-
 * only so international routing through Inforu still works for callers that
 * pre-format E.164.
 */
export function normalizeIsraeliPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  if (digits.startsWith("0"))   return digits;
  if (digits.length === 9 && digits.startsWith("5")) return "0" + digits;
  return digits;
}

// ─────────────────────────────────────────────────────────────────────────────
// Send SMS
// ─────────────────────────────────────────────────────────────────────────────

export interface SendSmsOptions {
  /** One or more recipients. Will be normalized to 0XXXXXXXXX (IL local). */
  recipients: string[];
  /** SMS body. 160 chars = 1 credit (GSM-7). Longer splits into parts. */
  message: string;
  /** The "from" the customer sees. Must be pre-registered with Inforu.
   *  Max 11 chars (no spaces) OR a phone number up to 14 digits. */
  senderName: string;
  /** Optional URL Inforu POSTs delivery reports to. */
  deliveryReportUrl?: string;
  /** Optional caller-supplied reference id, echoed back in DLR webhooks. */
  customerMessageId?: string;
}

/**
 * Send a single SMS message to one or many recipients.
 *
 * Inforu's JSON API v2 accepts an array of recipients in one request —
 * this is what their dashboard calls a "bulk send" under the hood. We
 * don't need a separate endpoint for single vs. bulk.
 *
 * Returns a structured result — never throws on API failure. Throws only on
 * programming errors (missing recipients, empty message).
 */
export async function sendSms(opts: SendSmsOptions): Promise<InforuSendResult> {
  if (!opts.recipients.length) throw new Error("sendSms: no recipients");
  if (!opts.message.trim())    throw new Error("sendSms: empty message");
  if (!opts.senderName.trim()) throw new Error("sendSms: no senderName");

  const normalized = opts.recipients.map(normalizeIsraeliPhone);
  const dedup      = Array.from(new Set(normalized));

  const authHeader = resolveAuthHeader();
  if (!authHeader) {
    logger.warn(
      { recipientCount: dedup.length, senderName: opts.senderName },
      "[inforu] skipping send — credentials not set (need INFORU_USERNAME + INFORU_API_TOKEN, or INFORU_API_TOKEN with INFORU_AUTH_MODE=bearer)",
    );
    return {
      configured: false,
      ok: false,
      messageId: null,
      recipients: dedup.map(p => ({ phone: p, status: "failed", error: "inforu not configured" })),
      statusCode: null,
      statusText: null,
    };
  }

  // Inforu JSON API v2 body shape — header-only auth (no User block).
  // Sender name is enforced server-side at ≤11 chars (alphanumeric, no
  // spaces) so we trim defensively before send to avoid an obvious 4xx.
  const safeSender = opts.senderName.replace(/\s+/g, "").slice(0, 11);
  const body = {
    Data: {
      Message: opts.message,
      Recipients: dedup.map(Phone => ({ Phone })),
      Settings: {
        Sender: safeSender,
        ...(opts.customerMessageId ? { CustomerMessageID: opts.customerMessageId } : {}),
        ...(opts.deliveryReportUrl ? { DeliveryNotificationUrl: opts.deliveryReportUrl } : {}),
      },
    },
  };

  try {
    const res = await fetch(`${BASE_URL}/api/v2/SMS/SendSms`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json; charset=utf-8",
        "Authorization": authHeader,
      },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));

    // Always log the full Inforu request+response when debugging delivery
    // issues. Owner reports "says 1 sent but SMS never arrives" even when
    // StatusId=1 and no Errors[] — the cause is invisible without seeing
    // what Inforu actually returned. This is gated behind an env var so
    // we don't drown Railway logs in verbose traffic in normal operation;
    // flip INFORU_DEBUG_LOG=1 in Railway when tracing a specific issue.
    if (process.env.INFORU_DEBUG_LOG === "1") {
      logger.info({
        sentTo:    dedup,
        sender:    safeSender,
        messageLen: opts.message.length,
        httpStatus: res.status,
        responseBody: json,
      }, "[inforu] send verbose-dump");
    }

    // Per the docs, the success envelope is:
    //   { StatusId: 1, StatusDescription: "Success", DetailedDescription: "",
    //     FunctionName: "...", RequestId: "...", Data: { Recipients, Errors } }
    // StatusId === 1 = accepted. Anything else = failure; details in
    // StatusDescription / DetailedDescription. The legacy `Status` key from
    // the v1 API is kept here as a fallback only because some older Inforu
    // sub-accounts still echo it.
    const statusCode = typeof json?.StatusId === "number"
      ? json.StatusId
      : (typeof json?.Status === "number" ? json.Status : null);
    const statusText = json?.StatusDescription ?? json?.DetailedDescription ?? null;
    const requestOk  = res.ok && statusCode === 1;
    const messageId  = json?.RequestId ?? json?.Data?.MessageId ?? json?.Data?.BatchId ?? null;

    if (!requestOk) {
      logger.warn({ statusCode, statusText, responseBody: json }, "[inforu] SMS send rejected");
    }

    // Per-recipient status. Inforu accepts the overall request (StatusId=1)
    // even when individual phones fail — those show up in Data.Errors[]
    // with their own ErrorCode / ErrorDescription. Previously we ignored
    // the Errors array and reported every recipient as "queued", which
    // is why the owner saw "sent to 1" but the SMS never arrived: the
    // one recipient was actually rejected per-phone by Inforu (blocked
    // number, bad format, invalid sender for that carrier, etc).
    const errorsArr: Array<any> = Array.isArray(json?.Data?.Errors) ? json.Data.Errors : [];
    const errorsByPhone = new Map<string, string>();
    for (const err of errorsArr) {
      const phoneKey = normalizeIsraeliPhone(String(err?.Phone ?? err?.Recipient ?? ""));
      if (!phoneKey) continue;
      const desc = String(err?.ErrorDescription ?? err?.Description ?? err?.Message ?? "rejected");
      errorsByPhone.set(phoneKey, desc);
    }
    // Any recipient in a confirmed OK response that's NOT in Errors[] is
    // queued for delivery. If the whole request failed (StatusId != 1),
    // nothing was queued — everyone gets failed with the top-level reason.
    const recipients = dedup.map(p => {
      if (!requestOk) {
        return { phone: p, status: "failed" as const, error: statusText ?? "send failed" };
      }
      const perPhoneError = errorsByPhone.get(p);
      if (perPhoneError) {
        return { phone: p, status: "failed" as const, error: perPhoneError };
      }
      return { phone: p, status: "queued" as const, error: undefined };
    });

    // If every recipient ended up rejected per-phone, demote the overall
    // `ok` flag so callers see a failed send instead of thinking "0 sent"
    // was somehow a success. Happens e.g. when all recipients are on the
    // sender's blocklist.
    const anyQueued = recipients.some(r => r.status === "queued");
    const ok = requestOk && anyQueued;

    if (errorsArr.length > 0) {
      logger.warn({
        statusCode,
        totalRecipients: dedup.length,
        perPhoneRejectedCount: errorsArr.length,
        errorsSample: errorsArr.slice(0, 3),
      }, "[inforu] some recipients rejected per-phone");
    }

    return {
      configured: true,
      ok,
      messageId: ok ? String(messageId ?? "") : null,
      recipients,
      statusCode,
      statusText,
    };
  } catch (err) {
    logger.error({ err }, "[inforu] network error sending SMS");
    return {
      configured: true,
      ok: false,
      messageId: null,
      recipients: dedup.map(p => ({ phone: p, status: "failed", error: (err as Error).message })),
      statusCode: null,
      statusText: (err as Error).message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Account balance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inforu account-level credit balance. This is the GATEWAY-side balance
 * (i.e. how many SMS we can send before Inforu stops us), NOT the
 * per-business quota — that one lives in the businesses table and is
 * enforced by Layer 2 before we ever reach this client.
 *
 * Note: the public docs don't pin a specific balance endpoint. We try
 * v2/Account/GetBalance first, then v2/Account/Balance, and treat any
 * 404 as "endpoint changed" rather than a hard failure so callers can
 * still send messages even when the balance widget can't render a number.
 */
export async function getInforuBalance(): Promise<InforuBalanceResult> {
  const authHeader = resolveAuthHeader();
  if (!authHeader) {
    return { configured: false, credits: null, statusCode: null, statusText: null };
  }
  const candidatePaths = [
    "/api/v2/Account/GetBalance",
    "/api/v2/Account/Balance",
  ];
  for (const path of candidatePaths) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json; charset=utf-8",
          "Authorization": authHeader,
        },
        body: JSON.stringify({}),
      });
      if (res.status === 404) continue;
      const json: any = await res.json().catch(() => ({}));
      const statusCode = typeof json?.StatusId === "number"
        ? json.StatusId
        : (typeof json?.Status === "number" ? json.Status : null);
      const ok = res.ok && statusCode === 1;
      const credits = typeof json?.Data?.Balance === "number"
        ? json.Data.Balance
        : typeof json?.Data?.AccountBalance === "number"
        ? json.Data.AccountBalance
        : null;
      return {
        configured: true,
        credits: ok ? credits : null,
        statusCode,
        statusText: json?.StatusDescription ?? null,
      };
    } catch (err) {
      logger.error({ err, path }, "[inforu] network error fetching balance");
      // try the next candidate path
    }
  }
  return { configured: true, credits: null, statusCode: null, statusText: "balance endpoint unavailable" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Delivery report webhook parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse Inforu's delivery report (DLR) webhook body. We register this URL
 * at send-time via `deliveryReportUrl`; Inforu POSTs one request per status
 * change (queued → sent → delivered | failed). Layer 2 uses the result to
 * update the `sms_messages.status` column for analytics + debugging.
 *
 * Inforu's exact field names vary by account config — parsing defensively
 * so we don't break when they rename a key.
 */
export interface InforuDeliveryReport {
  phone: string;
  customerMessageId: string | null;
  inforuMessageId: string | null;
  status: "delivered" | "failed" | "pending" | "unknown";
  reason: string | null;
  deliveredAt: Date | null;
}

export function parseDeliveryReport(body: any): InforuDeliveryReport {
  const phone      = String(body?.Phone ?? body?.phone ?? "");
  const customerId = body?.CustomerMessageID ?? body?.CustomerMessageId ?? body?.customerMessageId ?? null;
  const messageId  = body?.MessageId ?? body?.messageId ?? body?.RequestId ?? null;
  const statusRaw  = String(body?.Status ?? body?.status ?? "").toUpperCase();
  const reason     = body?.StatusDescription ?? body?.statusDescription ?? null;
  const deliveredRaw = body?.DeliveryTime ?? body?.deliveryTime ?? null;

  let status: InforuDeliveryReport["status"] = "unknown";
  if (statusRaw.includes("DELIVER"))         status = "delivered";
  else if (statusRaw.includes("FAIL") || statusRaw.includes("REJECT")) status = "failed";
  else if (statusRaw.includes("PENDING") || statusRaw.includes("QUEUE")) status = "pending";

  return {
    phone: normalizeIsraeliPhone(phone),
    customerMessageId: customerId ? String(customerId) : null,
    inforuMessageId: messageId ? String(messageId) : null,
    status,
    reason: reason ? String(reason) : null,
    deliveredAt: deliveredRaw ? new Date(deliveredRaw) : null,
  };
}
