import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "appointment-saas-secret-key-change-in-prod";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function signPhoneVerificationToken(phone: string): string {
  const phoneNorm = normalizePhone(phone);
  return jwt.sign({ typ: "phone_verify", phone: phoneNorm }, JWT_SECRET, { expiresIn: "15m" });
}

/** Returns normalized phone if token is valid and matches expected phone, else null */
export function verifyPhoneVerificationToken(token: string, expectedPhone: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { typ?: string; phone?: string };
    if (payload.typ !== "phone_verify" || typeof payload.phone !== "string") return null;
    const expected = normalizePhone(expectedPhone);
    if (!expected || payload.phone !== expected) return null;
    return payload.phone;
  } catch {
    return null;
  }
}
