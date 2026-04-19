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

import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateRandomToken();
    try {
      await db.execute(sql`
        INSERT INTO broadcast_opt_out_tokens (token, business_id, phone_number)
        VALUES (${token}, ${businessId}, ${phone})
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
  // Try once with all unique tokens. If we collide (which is rare) we
  // fall back to the per-row path for just the collisions. Keeps the
  // happy path a single INSERT per broadcast.
  const tokens = phones.map(() => generateRandomToken());
  try {
    await db.execute(sql`
      INSERT INTO broadcast_opt_out_tokens (token, business_id, phone_number)
      SELECT * FROM UNNEST(
        ${sql.raw(`ARRAY[${tokens.map(t => `'${t}'`).join(",")}]`)}::TEXT[],
        ${sql.raw(`ARRAY[${phones.map(() => businessId).join(",")}]`)}::INTEGER[],
        ${sql.raw(`ARRAY[${phones.map(p => `'${p.replace(/'/g, "''")}'`).join(",")}]`)}::TEXT[]
      ) AS t(token, business_id, phone_number)
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
