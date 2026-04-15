// Tracks phones that have been verified via Twilio Verify
// Verification is valid for 15 minutes after approval
const verifiedPhones = new Map<string, number>();

/**
 * Normalize Israeli phone to a canonical form: 972XXXXXXXXX (12 digits, no plus).
 * Accepts: "050-123-4567", "0501234567", "+972501234567", "972 50 123 4567" — all → "972501234567"
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
}

function normalize(phone: string): string {
  return normalizePhone(phone);
}

export function markPhoneVerified(phone: string): void {
  verifiedPhones.set(normalize(phone), Date.now() + 15 * 60 * 1000);
}

export function isPhoneVerified(phone: string): boolean {
  const expiresAt = verifiedPhones.get(normalize(phone));
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) { verifiedPhones.delete(normalize(phone)); return false; }
  return true;
}

export function consumeVerification(phone: string): void {
  verifiedPhones.delete(normalize(phone));
}
