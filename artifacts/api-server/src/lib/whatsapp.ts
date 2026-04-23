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
  const to = (payload as any)?.to;
  const tmpl = (payload as any)?.template?.name;
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
    // Per-send success log so we can confirm "WhatsApp actually went out
    // to this number" vs. "Meta accepted it but never delivered" in
    // production diagnostics. Includes the destination and template so
    // we can search Railway logs by phone number.
    console.log(`[WhatsApp Meta] sent template=${tmpl ?? "(none)"} to=${to}`);
  } catch (e: any) {
    // Enrich the error log — Meta returns a structured error with
    // `error.code` (e.g. 131026 = phone not on WhatsApp, 131047 =
    // re-engagement window expired) + `error.message`. Logging these
    // verbatim is the only way to diagnose "customer X didn't get any
    // WhatsApp" reports without attaching a debugger.
    const metaErr = e?.response?.data?.error ?? null;
    console.error(
      "[WhatsApp Meta] Send failed:",
      JSON.stringify({
        to,
        template: tmpl,
        httpStatus: e?.response?.status ?? null,
        metaErrorCode: metaErr?.code ?? null,
        metaErrorSubcode: metaErr?.error_subcode ?? null,
        metaErrorMessage: metaErr?.message ?? null,
        metaErrorDetails: metaErr?.error_data?.details ?? null,
      }),
    );
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
export type OtpPurpose = "client_login" | "password_reset" | "booking_verify" | "broadcast_optin" | "generic";

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

  // OTP channel moved from WhatsApp → SMS (Inforu) per owner's decision:
  //   · SMS arrives instantly without requiring a WhatsApp account
  //   · not subject to Meta template-quality throttling
  //   · no 24-hour session window to worry about
  // Meta's "verify_code_1" template stays registered in our account but is
  // no longer hit from this path. WhatsApp remains the channel for
  // appointment confirmations / reminders / cancellation / reschedule.
  const { sendSms, isInforuConfigured } = await import("./inforu");
  if (isInforuConfigured()) {
    // Last line `@host #code` is the WebOTP API binding — Android Chrome
    // reads it and auto-fills the <input autocomplete="one-time-code"> when
    // the page calls navigator.credentials.get({ otp: ... }). iOS Safari
    // auto-fills from any 4–8 digit sequence regardless of footer.
    // Host must match the production origin exactly or Chrome ignores it.
    const webOtpHost = (process.env.WEB_OTP_HOST ?? "kavati.net").trim() || "kavati.net";
    const message = `קוד הכניסה שלך ל-Kavati: ${code}\nהקוד בתוקף ל-5 דקות.\n\n@${webOtpHost} #${code}`;
    const senderName = (process.env.INFORU_SENDER_NAME ?? "Kavati").trim() || "Kavati";
    const result = await sendSms({
      recipients: [phone],
      message,
      senderName,
      customerMessageId: `otp-${purpose}-${Date.now()}`,
    });
    if (result.ok) return;
    // If Inforu explicitly rejected the send (not configured ≠ rejected),
    // log and fall through to the WhatsApp template so the user still gets
    // a code. Missing credentials handled below.
    if (result.configured) {
      console.warn("[OTP] Inforu send rejected, falling back to WhatsApp template:", result.statusText);
    }
  }

  // Fallback: if Inforu isn't configured yet (missing INFORU_USERNAME /
  // INFORU_API_TOKEN env vars) keep the WhatsApp template path alive so
  // logins don't break during the switchover window.
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
    const allowed = row.receiveNotifications !== false;
    if (!allowed) {
      console.log(`[WhatsApp] skipped — client ${phone} has opted out (clientSessions.receiveNotifications=false)`);
    }
    return allowed;
  } catch (err) {
    // Fail open — don't block notifications because of a DB hiccup.
    console.warn(`[WhatsApp] clientWantsNotifications check failed for ${phone}:`, (err as any)?.message ?? err);
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
  businessId?: number,
  appointmentId?: number,
): Promise<void> {
  if (!(await clientWantsNotifications(phone))) return;
  await sendTemplate(phone, "appointment_confirmation_12", [
    clientName,
    businessName,
    serviceName,
    date,
    time,
  ], businessSlug, businessId);
  if (appointmentId) await markWhatsappSent(appointmentId, "confirmation");
}

// ── Reschedule notification to client ──────────────────────────────────────
// Pre-approved template: appointment_rescheduled — 4 params per Meta console:
//   "היי {{1}}, הפגישה שלך נדחתה ל{{2}}. שירות: {{3}} מספר אישור: {{4}}"
// Call sites were passing 3 params which made the Cloud API 400 silently —
// the param-count mismatch is the single most common reason rescheduled
// notifications "disappeared" in the logs.
export async function sendClientReschedule(
  phone: string,
  clientName: string,
  newDateTimeLabel: string,   // {{2}} — freeform "21/04 ב-15:00" style label
  serviceName: string,        // {{3}}
  confirmationCode: string,   // {{4}} — appointment id or tranzila ref
  businessId?: number,
  appointmentId?: number,
): Promise<void> {
  if (!(await clientWantsNotifications(phone))) return;
  await sendTemplate(phone, "appointment_rescheduled", [
    clientName,
    newDateTimeLabel,
    serviceName,
    confirmationCode,
  ], undefined, businessId);
  if (appointmentId) await markWhatsappSent(appointmentId, "reschedule");
}

// ── Cancellation notification to client ────────────────────────────────────
// Pre-approved template: appointment_cancelled — 2 params per Meta console:
//   "היי {{1}}, הפגישה שלך ב{{2}} בוטלה. מקווים לראות אותך בפעם אחרת."
// Previously this helper sent 4 params (clientName, businessName, date, time)
// which caused Meta's Cloud API to reject the send with a
// "Invalid Parameter count" error — the owner saw every cancellation go
// through silently without the client ever receiving a WhatsApp.
export async function sendClientCancellation(
  phone: string,
  clientName: string,
  businessName: string,        // no longer injected into the template body
  date: string,
  time: string,
  businessId?: number,
  appointmentId?: number,
): Promise<void> {
  if (!(await clientWantsNotifications(phone))) return;
  const dateTimeLabel = `${date} בשעה ${time}${businessName ? ` (${businessName})` : ""}`;
  await sendTemplate(phone, "appointment_cancelled", [
    clientName,
    dateTimeLabel,
  ], undefined, businessId);
  if (appointmentId) await markWhatsappSent(appointmentId, "cancellation");
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
  businessId?: number,
  appointmentId?: number,
): Promise<void> {
  if (!(await clientWantsNotifications(phone))) return;
  await sendTemplate(phone, "appointment_reminder_2", [clientName, businessName, date, time], businessSlug, businessId);
  if (appointmentId) await markWhatsappSent(appointmentId, "reminder24h");
}

export async function sendReminder1h(
  phone: string,
  clientName: string,
  businessName: string,
  date: string,
  time: string,
  businessSlug: string,
  businessId?: number,
  appointmentId?: number,
): Promise<void> {
  if (!(await clientWantsNotifications(phone))) return;
  await sendTemplate(phone, "appointment_reminder_2", [clientName, businessName, date, time], businessSlug, businessId);
  if (appointmentId) await markWhatsappSent(appointmentId, "reminder1h");
}

export async function sendReminderMorning(
  phone: string,
  clientName: string,
  businessName: string,
  date: string,
  time: string,
  businessSlug: string,
  businessId?: number,
  appointmentId?: number,
): Promise<void> {
  if (!(await clientWantsNotifications(phone))) return;
  await sendTemplate(phone, "appointment_reminder_2", [clientName, businessName, date, time], businessSlug, businessId);
  if (appointmentId) await markWhatsappSent(appointmentId, "reminderMorning");
}

// Stamps the appointment's "sent at" column for the given message kind.
// Called after successful WhatsApp dispatch. Best-effort — if the DB
// write fails we log and move on (the message was already delivered).
async function markWhatsappSent(
  appointmentId: number,
  kind: "confirmation" | "reschedule" | "cancellation" | "reminder24h" | "reminder1h" | "reminderMorning",
): Promise<void> {
  try {
    const { db, appointmentsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const col = {
      confirmation:    "confirmation_sent_at",
      reschedule:      "reschedule_sent_at",
      cancellation:    "cancellation_sent_at",
      reminder24h:     "reminder_24h_sent_at",
      reminder1h:      "reminder_1h_sent_at",
      reminderMorning: "reminder_morning_sent_at",
    }[kind];
    await db.execute(
      (await import("drizzle-orm")).sql.raw(
        `UPDATE appointments SET ${col} = NOW() WHERE id = ${Number(appointmentId)}`
      )
    );
    void eq; void appointmentsTable;
  } catch (err) {
    console.error(`[whatsapp] markWhatsappSent(${appointmentId}, ${kind}) failed:`, err);
  }
}
