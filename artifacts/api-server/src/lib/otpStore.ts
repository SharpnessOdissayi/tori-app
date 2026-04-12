// Tracks phones that have been verified via Twilio Verify
// Verification is valid for 15 minutes after approval
const verifiedPhones = new Map<string, number>();

function normalize(phone: string): string {
  return phone.replace(/\D/g, "");
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
