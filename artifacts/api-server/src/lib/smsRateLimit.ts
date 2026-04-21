// Per-IP rate limiter for SMS-sending routes.
//
// Complements the per-phone OTP rate limiter in whatsapp.ts. That one
// stops an attacker from flooding a *single victim's* phone; this one
// stops one attacker from cycling through many victim numbers to burn
// our Inforu credit or harass arbitrary people.
//
// 5 sends per IP per 30 minutes. In-memory Map, swept every 5 minutes
// to avoid unbounded growth.

const MAX_PER_IP = 3;
const WINDOW_MS = 30 * 60 * 1000;

type Entry = { count: number; windowStart: number };
const ipLimits = new Map<string, Entry>();

export type SmsIpLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

export function checkIpSmsLimit(ip: string | undefined | null): SmsIpLimitResult {
  const key = (ip && ip.trim()) || "unknown";
  const now = Date.now();
  const existing = ipLimits.get(key);
  if (!existing || now - existing.windowStart > WINDOW_MS) {
    ipLimits.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (existing.count >= MAX_PER_IP) {
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - existing.windowStart)) / 1000));
    return { ok: false, retryAfterSec };
  }
  existing.count += 1;
  return { ok: true };
}

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipLimits.entries()) {
    if (now - entry.windowStart > WINDOW_MS) ipLimits.delete(ip);
  }
}, SWEEP_INTERVAL_MS).unref();
