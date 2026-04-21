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
 * Legacy (kept for existing POST callers only): `{ adminPassword }` in
 * the JSON body. The former `?adminPassword=…` query-string path is
 * now rejected outright — query strings land in every request log,
 * proxy, browser history, and Referer, so accepting them made a single
 * leaked log line equivalent to a full credential leak.
 */
function readCandidate(req: Request): { value: string; source: "header" | "body" | "none" } {
  const headerVal = req.header("x-admin-password");
  if (typeof headerVal === "string" && headerVal.length > 0) {
    return { value: headerVal.trim(), source: "header" };
  }

  const bodyVal = (req.body as any)?.adminPassword;
  if (typeof bodyVal === "string" && bodyVal.length > 0) {
    return { value: bodyVal.trim(), source: "body" };
  }

  return { value: "", source: "none" };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  // Refuse query-string credentials loudly so any remaining caller gets
  // an actionable 401 (instead of silently authenticating + a warn log).
  if (typeof (req.query as any)?.adminPassword === "string" && (req.query as any).adminPassword.length > 0) {
    console.warn("[super-admin] rejected query-string credential", { path: req.path, method: req.method });
    res.status(401).json({ error: "Unauthorized", message: "Use X-Admin-Password header" });
    return;
  }

  const { value, source } = readCandidate(req);

  if (source === "none") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!passwordsMatchConstantTime(value)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
