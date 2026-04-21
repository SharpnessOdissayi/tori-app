// Israeli mobile number validation for OTP/SMS sending paths.
//
// Strictly rejects anything that isn't a real Israeli cell phone —
// short codes, landlines (02/03/04/08/09), junk digit strings.
// Accepts the common input shapes users actually type:
//   "0501234567"      → 972501234567
//   "050-123-4567"    → 972501234567
//   "+972501234567"   → 972501234567
//   "972 50 1234567"  → 972501234567
//
// `normalizePhone` in otpStore.ts keeps the lenient "just-strip-non-digits"
// behavior for customer records (which may legitimately hold landlines);
// this module is only for routes that actually send an SMS.

export type PhoneValidation =
  | { ok: true; normalized: string }
  | { ok: false; error: string };

const MOBILE_PREFIXES = ["50", "51", "52", "53", "54", "55", "56", "57", "58", "59"];

export function validateIsraeliMobile(phone: unknown): PhoneValidation {
  if (typeof phone !== "string" || !phone.trim()) {
    return { ok: false, error: "מספר טלפון נדרש" };
  }
  const digits = phone.replace(/\D/g, "");

  let local: string;
  if (digits.startsWith("972") && digits.length === 12) {
    local = digits.slice(3);
  } else if (digits.startsWith("0") && digits.length === 10) {
    local = digits.slice(1);
  } else {
    return { ok: false, error: "יש להזין מספר נייד ישראלי תקין (לדוגמה 0501234567)" };
  }

  const prefix = local.slice(0, 2);
  if (!MOBILE_PREFIXES.includes(prefix) || local.length !== 9) {
    return { ok: false, error: "יש להזין מספר נייד ישראלי תקין (05X-XXXXXXX)" };
  }

  return { ok: true, normalized: "972" + local };
}
