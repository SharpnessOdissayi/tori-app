// In-memory OTP store: phone → { code, expiresAt, verified }
export const otpStore = new Map<string, { code: string; expiresAt: number; verified: boolean }>();

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function sendOtp(phone: string): Promise<void> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const key = normalizePhone(phone);
  otpStore.set(key, { code, expiresAt: Date.now() + 10 * 60 * 1000, verified: false });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;

  if (accountSid && authToken && fromPhone) {
    const body = `קוד האימות שלך לתורי: ${code}\nהקוד תקף ל-10 דקות.`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const creds = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    let toPhone = phone.trim();
    // Convert Israeli local number to E.164
    if (toPhone.startsWith("0")) toPhone = "+972" + toPhone.slice(1);
    else if (!toPhone.startsWith("+")) toPhone = "+" + toPhone;

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: fromPhone, To: toPhone, Body: body }).toString(),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error((err as any).message ?? "SMS sending failed");
    }
  } else {
    // Dev mode — log the code
    console.log(`[SMS OTP] Phone: ${phone} → Code: ${code}`);
  }
}

export function verifyOtp(phone: string, code: string): boolean {
  const key = normalizePhone(phone);
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { otpStore.delete(key); return false; }
  if (entry.code !== code) return false;
  // Mark as verified (valid for 15 minutes to complete booking)
  otpStore.set(key, { ...entry, verified: true, expiresAt: Date.now() + 15 * 60 * 1000 });
  return true;
}

export function isPhoneVerified(phone: string): boolean {
  const key = normalizePhone(phone);
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { otpStore.delete(key); return false; }
  return entry.verified === true;
}

export function consumeVerification(phone: string): void {
  otpStore.delete(normalizePhone(phone));
}
