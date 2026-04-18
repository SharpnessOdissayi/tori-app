import axios from "axios";

const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.META_WHATSAPP_TOKEN;

// Convert Israeli phone to E.164 without leading +
function toE164(phone: string): string {
  const p = phone.trim().replace(/\D/g, "");
  if (p.startsWith("0")) return "972" + p.slice(1);
  if (p.startsWith("972")) return p;
  return p;
}

// Per-business daily WhatsApp cap is temporarily DISABLED — the schema columns
// (whatsapp_sent_today / _date) didn't migrate cleanly and were rolled back
// to keep login working. Wrappers still accept an optional businessId so the
// guard can be re-introduced without changing callers when the migration
// path is fixed.
async function callMetaAPI(
  payload: object,
  _opts?: { businessId?: number }
): Promise<void> {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.log(`[WhatsApp Meta] credentials not set — payload:`, JSON.stringify(payload));
    return;
  }
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (e: any) {
    console.error("[WhatsApp Meta] Send failed:", e?.response?.data ?? e.message);
    throw e;
  }
}

// Send an approved template message
// Pass buttonUrlSuffix to include a dynamic URL button component (index 0)
// Pass businessId to enforce the per-business daily WhatsApp cap.
export async function sendTemplate(
  phone: string,
  templateName: string,
  parameters: string[],
  buttonUrlSuffix?: string,
  businessId?: number
): Promise<void> {
  const components: object[] = [];

  if (parameters.length) {
    components.push({
      type: "body",
      parameters: parameters.map((text) => ({ type: "text", text: text || "-" })),
    });
  }

  if (buttonUrlSuffix) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: buttonUrlSuffix }],
    });
  }

  await callMetaAPI({
    messaging_product: "whatsapp",
    to: toE164(phone),
    type: "template",
    template: {
      name: templateName,
      language: { code: "he" },
      components,
    },
  }, { businessId });
}

// Send an AUTHENTICATION template (requires code in both body and copy-code button)
export async function sendAuthTemplate(
  phone: string,
  templateName: string,
  bodyParams: string[],
  copyCode: string
): Promise<void> {
  await callMetaAPI({
    messaging_product: "whatsapp",
    to: toE164(phone),
    type: "template",
    template: {
      name: templateName,
      language: { code: "he" },
      components: [
        {
          type: "body",
          parameters: bodyParams.map((text) => ({ type: "text", text })),
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: copyCode }],
        },
      ],
    },
  });
}

// Send a free-form text message (only within 24h customer-initiated window)
// Pass businessId to enforce the per-business daily WhatsApp cap.
export async function sendWhatsApp(phone: string, message: string, businessId?: number): Promise<void> {
  await callMetaAPI({
    messaging_product: "whatsapp",
    to: toE164(phone),
    type: "text",
    text: { body: message },
  }, { businessId });
}

// ── OTP (in-memory, 5 minutes) ──────────────────────────────────────────────
//
// Purpose-tagged OTPs. An OTP minted for "client_login" CANNOT be consumed
// by a "password_reset" verifier — without this, a client-portal login OTP
// sent to a business-owner's phone could be used by the same actor to take
// over the business owner's account at /auth/reset-password.
export type OtpPurpose = "client_login" | "password_reset" | "booking_verify" | "generic";

const otpStore = new Map<string, { code: string; expiresAt: number; purpose: OtpPurpose }>();

// Per-phone rate limiter. Stops an attacker from spamming /send-otp to
// flood a victim's WhatsApp with verification codes (SMS cost + harassment).
// Allows RATE_LIMIT_MAX codes per RATE_LIMIT_WINDOW_MS for a single phone.
// Counters live alongside the OTP store and get swept by the periodic
// cleanup below so we don't accumulate stale entries forever.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const otpRateLimit = new Map<string, { count: number; windowStart: number }>();

function checkOtpRateLimit(phone: string): boolean {
  const now = Date.now();
  const existing = otpRateLimit.get(phone);
  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    otpRateLimit.set(phone, { count: 1, windowStart: now });
    return true;
  }
  if (existing.count >= RATE_LIMIT_MAX) return false;
  existing.count += 1;
  return true;
}

// Periodic sweep: both otpStore and otpRateLimit are in-memory Maps. Without
// cleanup they grow monotonically — an attacker could exhaust memory by
// sending fake OTP requests to random phone numbers. Every 5 minutes we
// drop expired entries. The server runs for weeks on Railway; without this
// we'd OOM long before a restart.
const OTP_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of otpStore.entries()) {
    if (now > entry.expiresAt) otpStore.delete(phone);
  }
  for (const [phone, entry] of otpRateLimit.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) otpRateLimit.delete(phone);
  }
}, OTP_CLEANUP_INTERVAL_MS).unref(); // .unref so it doesn't keep the process alive on shutdown.

export class OtpRateLimitError extends Error {
  constructor() {
    super("OTP rate limit exceeded");
    this.name = "OtpRateLimitError";
  }
}

export async function sendOtp(phone: string, purpose: OtpPurpose = "generic"): Promise<void> {
  if (!checkOtpRateLimit(phone)) {
    throw new OtpRateLimitError();
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(phone, { code, expiresAt: Date.now() + 5 * 60 * 1000, purpose });

  // Authentication template: verify_code_1 — body + copy-code button both receive the OTP code
  await sendAuthTemplate(phone, "verify_code_1", [code], code);
}

export async function verifyOtp(phone: string, code: string, purpose: OtpPurpose = "generic"): Promise<boolean> {
  const entry = otpStore.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    return false;
  }
  if (entry.code !== String(code)) return false;
  if (entry.purpose !== purpose) return false;
  otpStore.delete(phone);
  return true;
}

// ── Notification to business owner ─────────────────────────────────────────
// Template: appointment_confirmation_12 (5 params + URL button)
// "שלום {{1}}, תודה שהזמנתם עם {{2}}. התור שלך ל{{3}} ב{{4}} בשעה {{5}} אושר."
// Button "הצגת פרטים" → https://kavati.app/book/{{slug}}
export async function notifyBusinessOwner(
  phone: string,
  clientName: string,
  businessName: string,
  serviceName: string,
  date: string,
  time: string,
  businessSlug: string,
  businessId?: number
): Promise<void> {
  await sendTemplate(phone, "appointment_confirmation_12", [
    clientName,
    businessName,
    serviceName,
    date,
    time,
  ], businessSlug, businessId);
}

// ── Client opt-out check ────────────────────────────────────────────────────
// Honours the "קבל/י התראות מעסקים — הודעות אישור ותזכורות תורים" toggle
// in the client portal. Returns FALSE only when a session row exists AND
// explicitly opts out. Missing session = default-on (we never spammed the
// phone before, so no prior consent to break).
export async function clientWantsNotifications(phone: string): Promise<boolean> {
  try {
    const { db, clientSessionsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ receiveNotifications: clientSessionsTable.receiveNotifications })
      .from(clientSessionsTable)
      .where(eq(clientSessionsTable.phoneNumber, phone))
      .limit(1);
    if (!row) return true;
    return row.receiveNotifications !== false;
  } catch {
    // Fail open — don't block notifications because of a DB hiccup.
    return true;
  }
}

// ── Confirmation to client ──────────────────────────────────────────────────
// Template: appointment_confirmation_12 (5 params + URL button)
// "שלום {{1}}, תודה שהזמנתם עם {{2}}. התור שלך ל{{3}} ב{{4}} בשעה {{5}} אושר."
export async function sendClientConfirmation(
  phone: string,
  clientName: string,
  businessName: string,
  serviceName: string,
  date: string,
  time: string,
  businessSlug: string,
  businessId?: number
): Promise<void> {
  if (!(await clientWantsNotifications(phone))) return;
  await sendTemplate(phone, "appointment_confirmation_12", [
    clientName,
    businessName,
    serviceName,
    date,
    time,
  ], businessSlug, businessId);
}

// ── Reschedule notification to client ──────────────────────────────────────
// Pre-approved template: appointment_rescheduled — 3 params: clientName, date, time
// "שלום {{1}}, התור שלך שונה לתאריך {{2}} בשעה {{3}}."
export async function sendClientReschedule(
  phone: string,
  clientName: string,
  date: string,
  time: string,
  businessId?: number
): Promise<void> {
  if (!(await clientWantsNotifications(phone))) return;
  await sendTemplate(phone, "appointment_rescheduled", [clientName, date, time], undefined, businessId);
}

// ── Cancellation notification to client ────────────────────────────────────
// Pre-approved template: appointment_cancelled
// "שלום {{1}}, התור שלך עם {{2}} ב{{3}} בשעה {{4}} בוטל."
export async function sendClientCancellation(
  phone: string,
  clientName: string,
  businessName: string,
  date: string,
  time: string,
  businessId?: number
): Promise<void> {
  if (!(await clientWantsNotifications(phone))) return;
  await sendTemplate(phone, "appointment_cancelled", [
    clientName,
    businessName,
    date,
    time,
  ], undefined, businessId);
}

// ── Reminders ───────────────────────────────────────────────────────────────
// Pre-approved template: appointment_reminder_2
// Body: "שלום {{1}}, זוהי תזכורת לגבי הפגישה הקרובה שלך עם {{2}} ב-{{3}} בשעה {{4}}. מצפים לראותכם!"
// Button URL: https://kavati.app/book/{{1}}  (dynamic suffix = businessSlug)
// All three reminder variants respect the per-client opt-out toggle.
// Previously only booking confirmations checked — the reminder cron kept
// sending to clients who turned notifications off in the portal.

export async function sendReminder24h(
  phone: string,
  clientName: string,
  businessName: string,
  date: string,
  time: string,
  businessSlug: string,
  businessId?: number
): Promise<void> {
  if (!(await clientWantsNotifications(phone))) return;
  await sendTemplate(phone, "appointment_reminder_2", [clientName, businessName, date, time], businessSlug, businessId);
}

export async function sendReminder1h(
  phone: string,
  clientName: string,
  businessName: string,
  date: string,
  time: string,
  businessSlug: string,
  businessId?: number
): Promise<void> {
  if (!(await clientWantsNotifications(phone))) return;
  await sendTemplate(phone, "appointment_reminder_2", [clientName, businessName, date, time], businessSlug, businessId);
}

export async function sendReminderMorning(
  phone: string,
  clientName: string,
  businessName: string,
  date: string,
  time: string,
  businessSlug: string,
  businessId?: number
): Promise<void> {
  if (!(await clientWantsNotifications(phone))) return;
  await sendTemplate(phone, "appointment_reminder_2", [clientName, businessName, date, time], businessSlug, businessId);
}
