/**
 * Self-contained unsubscribe-token signer/verifier.
 *
 * Each bulk SMS we send out includes a "להסרה <url>" footer that points at
 * `https://<host>/u/<token>`. The token encodes `(businessId, phone)` so the
 * handler can resolve exactly which subscriber to drop without needing a
 * database lookup to identify the recipient — just a signature check.
 *
 * Why not JWT: a JWT header alone is ~30 chars before any payload, and the
 * default "jsonwebtoken" encoding tacks on issuer/aud/etc. in a ~150-char
 * string. SMS billing is per 160 chars, so we want the URL as short as we
 * can make it while keeping cryptographic integrity. This uses a compact
 * custom scheme:
 *
 *   payload = `${businessId}|${phone}`   (e.g. "1|0501234567")
 *   sig     = first 10 bytes of HMAC-SHA256(JWT_SECRET, base64url(payload))
 *   token   = base64url(payload) + "." + base64url(sig)
 *
 * Net URL length for a 10-digit phone + 1-digit business id:
 *   ~46 characters for the token → ~70 including https://kavati.net/u/.
 *
 * 10-byte / 80-bit signature is plenty — attackers only get one guess per
 * click before the URL 400s. Brute-forcing a valid signature via rate-
 * limited HTTP requests is infeasible.
 *
 * Note: tokens DO NOT expire. The law (תיקון 40) grants the user a
 * permanent right to opt out; a year-old SMS should still work.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { JWT_SECRET } from "./auth";

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Buffer {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

function computeSignature(payloadB64: string): Buffer {
  // Domain-separate the HMAC with a fixed prefix so an attacker can't take
  // a signature produced by another caller of JWT_SECRET (e.g. the phone-
  // verification JWT) and reuse it here.
  return createHmac("sha256", JWT_SECRET)
    .update(`kavati-unsub:${payloadB64}`)
    .digest();
}

export function signUnsubscribeToken(businessId: number, phone: string): string {
  if (!Number.isInteger(businessId) || businessId <= 0) {
    throw new Error("signUnsubscribeToken: invalid businessId");
  }
  if (!phone || phone.includes("|")) {
    // "|" is the payload separator — strip it defensively. A normal Israeli
    // phone string never contains it, so this branch is a guard rail.
    throw new Error("signUnsubscribeToken: invalid phone");
  }
  const payloadStr = `${businessId}|${phone}`;
  const payloadB64 = b64urlEncode(Buffer.from(payloadStr, "utf8"));
  const sigB64 = b64urlEncode(computeSignature(payloadB64).subarray(0, 10));
  return `${payloadB64}.${sigB64}`;
}

export function verifyUnsubscribeToken(token: string): { businessId: number; phone: string } | null {
  if (typeof token !== "string" || token.length === 0) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = computeSignature(payloadB64).subarray(0, 10);
  let gotSig: Buffer;
  try { gotSig = b64urlDecode(sigB64); } catch { return null; }
  if (expectedSig.length !== gotSig.length) return null;
  if (!timingSafeEqual(expectedSig, gotSig)) return null;

  let payloadStr: string;
  try { payloadStr = b64urlDecode(payloadB64).toString("utf8"); } catch { return null; }
  const sep = payloadStr.indexOf("|");
  if (sep <= 0) return null;
  const bidStr = payloadStr.slice(0, sep);
  const phone  = payloadStr.slice(sep + 1);
  const businessId = Number(bidStr);
  if (!Number.isInteger(businessId) || businessId <= 0 || !phone) return null;
  return { businessId, phone };
}
