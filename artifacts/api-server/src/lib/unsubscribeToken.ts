/**
 * Broadcast unsubscribe tokens — short random strings backed by a DB row.
 *
 * Each bulk SMS we send out includes a "להסרה <url>" footer that points at
 * `https://<host>/api/u/<token>`. The token is a 6-character base62 string
 * that maps to a `broadcast_opt_out_tokens` row holding (businessId, phone).
 *
 * Why DB-backed instead of a signed HMAC:
 *   · SMS URLs cost money per 160 chars. 6 chars beats any signed-payload
 *     scheme (which needs at least ~20 chars just for the signature).
 *   · The audit trail is the DB row. No secret-rotation anxiety if we ever
 *     change JWT_SECRET.
 *   · Tokens are single-use — once clicked, the row is deleted, so
 *     guessing an already-used token buys nothing.
 *
 * 6 chars of base62 = 62^6 ≈ 5.7×10^10 combinations. At 300 messages/
 * month × 1000 businesses × 5 years = 1.8×10^7 rows ever. Birthday
 * collision probability is vanishingly small and each insert is
 * protected by the PRIMARY KEY anyway — on a collision we just retry.
 */

import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { JWT_SECRET } from "./auth";

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const TOKEN_LEN = 6;

function generateRandomToken(): string {
  // Buffer of exactly TOKEN_LEN bytes. We use `% 62` per byte — the
  // modulo bias is ~1.5% which is negligible for our volume.
  const buf = randomBytes(TOKEN_LEN);
  let out = "";
  for (let i = 0; i < TOKEN_LEN; i++) {
    out += ALPHABET[buf[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Normalise an Israeli phone to the canonical local form ("0501234567").
 *
 * The broadcast subscriber table stores phones in whatever shape the
 * booking endpoint first received them — that has historically meant
 * a mix of 0-prefixed, 972-prefixed, and +972-prefixed rows for the
 * same real phone. Without normalisation, the unsubscribe flow writes
 * a token with "972...", tries to DELETE a subscriber row that's
 * stored as "05...", finds no match, and the "active" row stays put.
 *
 * Every write into broadcast_opt_out_tokens / broadcast_subscribers /
 * broadcast_unsubscribes runs through this helper so every comparison
 * downstream can do an exact string match on the normalised form.
 */
export function normalizeSubscriberPhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  return digits;
}

/**
 * Allocate a fresh opt-out token for the given (businessId, phone) pair.
 *
 * Writes a row to `broadcast_opt_out_tokens` and returns the token string
 * for embedding in the SMS URL. If we ever hit a token collision (cosmic
 * bad luck) we retry up to 5 times.
 */
export async function allocateUnsubscribeToken(
  businessId: number,
  phone: string,
): Promise<string> {
  const normalized = normalizeSubscriberPhone(phone);
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateRandomToken();
    try {
      await db.execute(sql`
        INSERT INTO broadcast_opt_out_tokens (token, business_id, phone_number)
        VALUES (${token}, ${businessId}, ${normalized})
      `);
      return token;
    } catch (e: any) {
      // Duplicate-key error → retry with a fresh token.
      // Postgres error code 23505 = unique_violation.
      const code = (e?.code ?? e?.cause?.code ?? "").toString();
      if (code === "23505") continue;
      throw e;
    }
  }
  throw new Error("allocateUnsubscribeToken: ran out of retries");
}

/**
 * Batch-allocate tokens for an entire broadcast at once — saves N round
 * trips when a campaign has hundreds of recipients. Returns the tokens in
 * the same order as the input phones.
 */
export async function allocateUnsubscribeTokensBulk(
  businessId: number,
  phones: string[],
): Promise<string[]> {
  if (phones.length === 0) return [];
  // Normalise every phone before storage so the /u/ handler has a
  // consistent key to DELETE against broadcast_subscribers downstream.
  const normalisedPhones = phones.map(normalizeSubscriberPhone);
  // Try once with all unique tokens. If we collide (which is rare) we
  // fall back to the per-row path for just the collisions. Keeps the
  // happy path a single INSERT per broadcast.
  const tokens = phones.map(() => generateRandomToken());
  try {
    // Parameterised VALUES list — replaces the previous sql.raw quote-
    // escape dance. Drizzle binds each (token, businessId, phone) tuple
    // as placeholder args, so even a normaliser regression that lets
    // through backslashes or quotes can't break out into SQL.
    const tuples = tokens.map((t, i) => sql`(${t}, ${businessId}, ${normalisedPhones[i]})`);
    await db.execute(sql`
      INSERT INTO broadcast_opt_out_tokens (token, business_id, phone_number)
      VALUES ${sql.join(tuples, sql`, `)}
    `);
    return tokens;
  } catch {
    // Collision or malformed input — do it the slow reliable way.
    const out: string[] = [];
    for (const p of phones) out.push(await allocateUnsubscribeToken(businessId, p));
    return out;
  }
}

/**
 * Look up an opt-out token. Returns null if unknown (bad / already-used
 * link). Does NOT delete the row — caller does that after committing
 * the opt-out so a DB failure on INSERT broadcast_unsubscribes doesn't
 * lose the token in a way that prevents retry.
 */
export async function peekUnsubscribeToken(token: string): Promise<{ businessId: number; phone: string } | null> {
  if (typeof token !== "string" || token.length !== TOKEN_LEN) return null;
  const rows = await db.execute(sql`
    SELECT business_id, phone_number FROM broadcast_opt_out_tokens
    WHERE token = ${token}
    LIMIT 1
  `);
  const row = ((rows as any).rows ?? [])[0];
  if (!row) return null;
  return { businessId: Number(row.business_id), phone: String(row.phone_number) };
}

/**
 * Delete a consumed token so refreshing the page doesn't re-trigger the
 * write path. Safe to call even if the token is already gone.
 */
export async function consumeUnsubscribeToken(token: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM broadcast_opt_out_tokens WHERE token = ${token}
  `);
}

// ─── Invite-back tokens (stateless HMAC, no DB) ─────────────────────────
// Used when the OWNER sends an invite SMS to a customer who previously
// opted out. The customer clicks the tokenised link, we decode the
// token, and they re-subscribe in ONE click — no additional SMS OTP,
// because receipt of our invite SMS already proves they hold the phone.
//
// Stateless HMAC (not DB-backed) because:
//   · Volume is low enough we don't want another DB round-trip
//   · Tokens are single-purpose; invalidating isn't needed
//   · Keeps the URL compact (2+ chars shorter than DB-backed)
//
// Payload shape: "<businessId>|<canonicalPhone>". The signature is
// 10 bytes of HMAC-SHA256 prefixed with a domain tag so these tokens
// cannot be confused with the opt-out ones.
function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str: string): Buffer {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}
function inviteSignature(payloadB64: string): Buffer {
  return createHmac("sha256", JWT_SECRET)
    .update(`kavati-invite:${payloadB64}`)
    .digest();
}

export function signInviteBackToken(businessId: number, phone: string): string {
  const canonical = String(phone ?? "").replace(/\D/g, "").replace(/^972/, "0");
  const payloadStr = `${businessId}|${canonical}`;
  const payloadB64 = b64urlEncode(Buffer.from(payloadStr, "utf8"));
  const sigB64 = b64urlEncode(inviteSignature(payloadB64).subarray(0, 10));
  return `${payloadB64}.${sigB64}`;
}

export function verifyInviteBackToken(token: string): { businessId: number; phone: string } | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;
  const expectedSig = inviteSignature(payloadB64).subarray(0, 10);
  let gotSig: Buffer;
  try { gotSig = b64urlDecode(sigB64); } catch { return null; }
  if (expectedSig.length !== gotSig.length) return null;
  if (!timingSafeEqual(expectedSig, gotSig)) return null;
  let payloadStr: string;
  try { payloadStr = b64urlDecode(payloadB64).toString("utf8"); } catch { return null; }
  const sep = payloadStr.indexOf("|");
  if (sep <= 0) return null;
  const businessId = Number(payloadStr.slice(0, sep));
  const phone = payloadStr.slice(sep + 1);
  if (!Number.isInteger(businessId) || businessId <= 0 || !phone) return null;
  return { businessId, phone };
}
