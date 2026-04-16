import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";

// Loaded once at module init. Fail-fast if missing — there is no sane
// fallback for a super-admin credential in production.
const SUPER_ADMIN_PASSWORD = (process.env.SUPER_ADMIN_PASSWORD ?? "").trim();
if (!SUPER_ADMIN_PASSWORD) {
  throw new Error(
    "SUPER_ADMIN_PASSWORD env var is required. " +
    "The old fallback 'superadmin123' has been removed."
  );
}

// Pre-encode once to avoid re-allocating on every request.
const EXPECTED_PASSWORD_BYTES = Buffer.from(SUPER_ADMIN_PASSWORD, "utf8");

// Constant-time password check. Naive `a !== b` short-circuits on the first
// byte that differs, which lets a network attacker time-probe the password
// byte-by-byte. We compare fixed-length byte buffers via crypto's
// timingSafeEqual, falling back to an always-false comparison when the
// length itself differs (which is safe to reveal — the attacker already
// knows the length from their own attempt).
function passwordsMatchConstantTime(candidate: string): boolean {
  const candidateBytes = Buffer.from(candidate, "utf8");
  if (candidateBytes.length !== EXPECTED_PASSWORD_BYTES.length) {
    // Still perform a comparable-cost compare so the error path itself
    // isn't distinguishable from a same-length wrong password.
    timingSafeEqual(EXPECTED_PASSWORD_BYTES, EXPECTED_PASSWORD_BYTES);
    return false;
  }
  return timingSafeEqual(candidateBytes, EXPECTED_PASSWORD_BYTES);
}

export { SUPER_ADMIN_PASSWORD };

/**
 * Extract the super-admin password from a request.
 *
 * Preferred: `X-Admin-Password` header. Never logged by Railway/CDN request
 * logs, not retained in browser history, not leaked via Referer.
 *
 * Legacy (kept for existing front-end callers that still pass it in the
 * query string or JSON body): `?adminPassword=…` and `{ adminPassword }`
 * in the POST body. These paths emit a warning so they can be migrated
 * off. Do NOT add new callers that rely on the legacy paths.
 */
function readCandidate(req: Request): { value: string; source: "header" | "body" | "query" | "none" } {
  const headerVal = req.header("x-admin-password");
  if (typeof headerVal === "string" && headerVal.length > 0) {
    return { value: headerVal.trim(), source: "header" };
  }

  const bodyVal = (req.body as any)?.adminPassword;
  if (typeof bodyVal === "string" && bodyVal.length > 0) {
    return { value: bodyVal.trim(), source: "body" };
  }

  const queryVal = (req.query as any)?.adminPassword;
  if (typeof queryVal === "string" && queryVal.length > 0) {
    return { value: queryVal.trim(), source: "query" };
  }

  return { value: "", source: "none" };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const { value, source } = readCandidate(req);

  if (source === "none") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!passwordsMatchConstantTime(value)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (source === "query") {
    // Query-string credentials get persisted in server logs, proxies, CDNs,
    // browser history and the Referer header. Flag for migration.
    console.warn(
      "[super-admin] credential received via query string — migrate caller to X-Admin-Password header",
      { path: req.path, method: req.method }
    );
  }

  next();
}
