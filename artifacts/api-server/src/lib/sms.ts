// In-memory OTP store: phone → { code, expiresAt, verified }
export const otpStore = new Map<string, { code: string; expiresAt: number; verified: boolean }>();

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function toE164(phone: string): string {
  const p = phone.trim();
  if (p.startsWith("0")) return "+972" + p.slice(1);
  if (!p.startsWith("+")) return "+" + p;
  return p;
}

export async function sendSms(phone: string, body: string, creds?: { instanceId: string; token: string }): Promise<void> {
  const instanceId = creds?.instanceId ?? process.env.GREEN_API_INSTANCE_ID;
  const apiToken = creds?.token ?? process.env.GREEN_API_TOKEN;

  if (instanceId && apiToken) {
    const to = toE164(phone).replace("+", "") + "@c.us";
    const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiToken}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: to, message: body }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error((err as any).message ?? "WhatsApp sending failed");
    }
  } else {
    console.log(`[WhatsApp] To: ${phone}\n${body}`);
  }
}

export async function sendOtp(phone: string, creds?: { instanceId: string; token: string }): Promise<void> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const key = normalizePhone(phone);
  otpStore.set(key, { code, expiresAt: Date.now() + 10 * 60 * 1000, verified: false });
  await sendSms(phone, `קוד האימות שלך לתורי: ${code}\nהקוד תקף ל-10 דקות.`, creds);
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
