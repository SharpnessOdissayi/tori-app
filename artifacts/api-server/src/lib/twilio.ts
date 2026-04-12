import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifySid = process.env.TWILIO_VERIFY_SID;
const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";

function getClient() {
  if (!accountSid || !authToken) throw new Error("Twilio credentials not configured");
  return twilio(accountSid, authToken);
}

function toE164(phone: string): string {
  const p = phone.trim().replace(/\D/g, "");
  if (phone.trim().startsWith("0")) return "+972" + p.slice(1);
  if (!phone.trim().startsWith("+")) return "+" + p;
  return "+" + p;
}

// OTP — send via Twilio Verify (WhatsApp channel)
export async function sendOtp(phone: string): Promise<void> {
  if (!verifySid) {
    console.log(`[Twilio Verify] No TWILIO_VERIFY_SID, skipping OTP to ${phone}`);
    return;
  }
  const client = getClient();
  await client.verify.v2.services(verifySid).verifications.create({
    to: `whatsapp:${toE164(phone)}`,
    channel: "whatsapp",
  });
}

// OTP — verify code via Twilio Verify
export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  if (!verifySid) return false;
  try {
    const client = getClient();
    const check = await client.verify.v2.services(verifySid).verificationChecks.create({
      to: `whatsapp:${toE164(phone)}`,
      code,
    });
    return check.status === "approved";
  } catch {
    return false;
  }
}

// Send a regular WhatsApp message (confirmations, notifications, reminders)
export async function sendWhatsApp(phone: string, message: string): Promise<void> {
  if (!accountSid || !authToken) {
    console.log(`[Twilio WhatsApp] To: ${phone}\n${message}`);
    return;
  }
  const client = getClient();
  await client.messages.create({
    from: whatsappFrom,
    to: `whatsapp:${toE164(phone)}`,
    body: message,
  });
}
