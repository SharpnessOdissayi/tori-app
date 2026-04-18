/**
 * Inforu SMS gateway — bulk marketing SMS.
 *
 * Distinct from `lib/sms.ts`, which (despite the name) actually sends
 * WhatsApp via Green-API for OTPs and appointment reminders. This file
 * handles real SMS over the Israeli cellular network, used for:
 *
 *   - Bulk marketing campaigns the owner composes from the dashboard
 *     ("הודעות ותזכורות" → bulk sender), gated behind Pro/עסקי.
 *   - Re-engagement blasts to clients who haven't booked in N days.
 *
 * WhatsApp reminders stay on Green-API — different product, unlimited
 * under Meta template rules. This file never sends reminders.
 *
 * Credentials layout (populate in Railway env AFTER signing up at inforu.co.il):
 *   INFORU_USERNAME   — account username (one per Kavati, not per business)
 *   INFORU_API_TOKEN  — API token from Inforu dashboard
 *   INFORU_BASE_URL   — optional override, defaults to https://capi.inforu.co.il
 *
 * Sender name is per-business: each API call passes the business name as
 * the SMS "from" (e.g. "LilashByGal"). Inforu requires sender names be
 * pre-registered with the Israeli carriers — the onboarding-to-production
 * step (done manually with Inforu support) is to register every business's
 * name. For new businesses we can fall back to a shared, pre-approved name
 * like "Kavati" until their own is registered.
 *
 * Docs: https://docs.inforu.co.il  (Inforu JSON API v2)
 *
 * Graceful degradation: when env vars are missing the client logs a warning
 * and returns a `{ configured: false }` result object instead of throwing.
 * Nothing else in the stack should break while we wait for the real account.
 */

import { logger } from "./logger";

const BASE_URL =
  process.env.INFORU_BASE_URL?.replace(/\/$/, "") ?? "https://capi.inforu.co.il";
const USERNAME  = process.env.INFORU_USERNAME  ?? "";
const API_TOKEN = process.env.INFORU_API_TOKEN ?? "";

/** True iff the account credentials are present. Callers may branch on this. */
export function isInforuConfigured(): boolean {
  return USERNAME.length > 0 && API_TOKEN.length > 0;
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
 * Inforu expects Israeli phones in MSISDN format without a leading +:
 *     0521234567  → 972521234567
 *     +972521234567 → 972521234567
 *     972521234567 → 972521234567
 *
 * Non-digit characters are stripped first. Non-IL numbers are passed through
 * as-is (digits only) since Inforu does support international routing, but
 * the sender-name rules differ — that's for the caller to decide.
 */
export function normalizeIsraeliPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("+972")) return digits.slice(1);
  return digits;
}

// ─────────────────────────────────────────────────────────────────────────────
// Send SMS
// ─────────────────────────────────────────────────────────────────────────────

export interface SendSmsOptions {
  /** One or more recipients. Will be normalized to 972XXXXXXXXX. */
  recipients: string[];
  /** SMS body. 160 chars = 1 credit (GSM-7). Longer splits into parts. */
  message: string;
  /** The "from" the customer sees. Must be pre-registered with Inforu. */
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

  if (!isInforuConfigured()) {
    logger.warn(
      { recipientCount: dedup.length, senderName: opts.senderName },
      "[inforu] skipping send — INFORU_USERNAME / INFORU_API_TOKEN not set",
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

  // Inforu JSON API v2 body shape. See docs link at top of file.
  const body = {
    Data: {
      Message: opts.message,
      Recipients: dedup.map(Phone => ({ Phone })),
      Settings: {
        Sender: opts.senderName,
        ...(opts.customerMessageId ? { CustomerMessageId: opts.customerMessageId } : {}),
        ...(opts.deliveryReportUrl ? { DeliveryNotificationUrl: opts.deliveryReportUrl } : {}),
      },
    },
    User: { Username: USERNAME, ApiToken: API_TOKEN },
  };

  try {
    const res = await fetch(`${BASE_URL}/api/v2/SMS/SendSms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));

    // Inforu returns { Status: <number>, StatusDescription, DetailedDescription, Data: {...} }
    // Status === 1 = accepted, anything else = failure. Code per recipient
    // lives under json.Data.Response[] in some variants — keeping the shape
    // permissive so we don't over-fit to undocumented corners.
    const statusCode = typeof json?.Status === "number" ? json.Status : null;
    const statusText = json?.StatusDescription ?? json?.DetailedDescription ?? null;
    const ok         = res.ok && statusCode === 1;
    const messageId  = json?.Data?.MessageId ?? json?.Data?.BatchId ?? null;

    if (!ok) {
      logger.warn({ statusCode, statusText, responseBody: json }, "[inforu] SMS send rejected");
    }

    return {
      configured: true,
      ok,
      messageId: ok ? String(messageId ?? "") : null,
      recipients: dedup.map(p => ({ phone: p, status: ok ? "queued" : "failed", error: ok ? undefined : statusText ?? "send failed" })),
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
 */
export async function getInforuBalance(): Promise<InforuBalanceResult> {
  if (!isInforuConfigured()) {
    return { configured: false, credits: null, statusCode: null, statusText: null };
  }
  try {
    const res = await fetch(`${BASE_URL}/api/v2/Account/GetBalance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ User: { Username: USERNAME, ApiToken: API_TOKEN } }),
    });
    const json: any = await res.json().catch(() => ({}));
    const statusCode = typeof json?.Status === "number" ? json.Status : null;
    const ok = res.ok && statusCode === 1;
    const credits = typeof json?.Data?.Balance === "number" ? json.Data.Balance : null;
    return {
      configured: true,
      credits: ok ? credits : null,
      statusCode,
      statusText: json?.StatusDescription ?? null,
    };
  } catch (err) {
    logger.error({ err }, "[inforu] network error fetching balance");
    return { configured: true, credits: null, statusCode: null, statusText: (err as Error).message };
  }
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
  const customerId = body?.CustomerMessageId ?? body?.customerMessageId ?? null;
  const messageId  = body?.MessageId ?? body?.messageId ?? null;
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
