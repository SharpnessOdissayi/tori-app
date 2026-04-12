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

async function callMetaAPI(payload: object): Promise<void> {
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
export async function sendTemplate(
  phone: string,
  templateName: string,
  parameters: string[]
): Promise<void> {
  await callMetaAPI({
    messaging_product: "whatsapp",
    to: toE164(phone),
    type: "template",
    template: {
      name: templateName,
      language: { code: "he" },
      components: parameters.length
        ? [
            {
              type: "body",
              parameters: parameters.map((text) => ({ type: "text", text })),
            },
          ]
        : [],
    },
  });
}

// Send a free-form text message (only within 24h customer-initiated window)
export async function sendWhatsApp(phone: string, message: string): Promise<void> {
  await callMetaAPI({
    messaging_product: "whatsapp",
    to: toE164(phone),
    type: "text",
    text: { body: message },
  });
}

// ── OTP (in-memory, 5 minutes) ──────────────────────────────────────────────
const otpStore = new Map<string, { code: string; expiresAt: number }>();

export async function sendOtp(phone: string): Promise<void> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(phone, { code, expiresAt: Date.now() + 5 * 60 * 1000 });

  // Pre-approved template: verify_code_1 — "{{1}} הוא קוד האימות שלך."
  await sendTemplate(phone, "verify_code_1", [code]);
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const entry = otpStore.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    return false;
  }
  if (entry.code !== String(code)) return false;
  otpStore.delete(phone);
  return true;
}

// ── Notification to business owner ─────────────────────────────────────────
// Pre-approved template: appointment_confirmation_1
// "שלום {{1}}, תודה שהזמנתם עם {{2}}. התור שלך ל{{3}} ב{{4}} בשעה {{5}} אושר."
// We re-use this template to notify the business owner about a new booking.
export async function notifyBusinessOwner(
  phone: string,
  clientName: string,
  time: string,
  date: string,
  serviceName: string
): Promise<void> {
  // Template: appointment_confirmation_1
  // {{1}}=clientName, {{2}}=businessName(reuse as "קבעתי"), {{3}}=serviceName, {{4}}=date, {{5}}=time
  await sendTemplate(phone, "appointment_confirmation_1", [
    clientName,
    "קבעתי",
    serviceName,
    date,
    time,
  ]);
}

// ── Reminders ───────────────────────────────────────────────────────────────
// Pre-approved template: appointment_reminder_2
// "שלום {{1}}, זוהי תזכורת לגבי הפגישה הקרובה שלך עם {{2}} ב-{{3}} בשעה {{4}}. מצפים לראותכם!"
export async function sendReminder24h(
  phone: string,
  clientName: string,
  businessName: string,
  date: string,
  time: string
): Promise<void> {
  await sendTemplate(phone, "appointment_reminder_2", [clientName, businessName, date, time]);
}

export async function sendReminder1h(
  phone: string,
  clientName: string,
  businessName: string,
  date: string,
  time: string
): Promise<void> {
  await sendTemplate(phone, "appointment_reminder_2", [clientName, businessName, date, time]);
}
