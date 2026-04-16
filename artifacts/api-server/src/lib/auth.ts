import jwt from "jsonwebtoken";

// JWT_SECRET is required. No fallback — a weak/known fallback in production
// would allow anyone who reads the repo to forge tokens for any business.
// If this env var is missing the server must refuse to boot.
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) {
  throw new Error(
    "JWT_SECRET environment variable is required. Set it on Railway."
  );
}
export const JWT_SECRET: string = rawJwtSecret;

// ─── Legacy business token (kept for backward compatibility) ───────────────

export interface BusinessTokenPayload {
  businessId: number;
  email: string;
}

export function signBusinessToken(payload: BusinessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyBusinessToken(token: string): BusinessTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as BusinessTokenPayload;
  } catch {
    return null;
  }
}

// ─── Unified user token (phase 3 of auth rework) ───────────────────────────
//
// Single JWT carries the userId + role + optional businessId. The frontend
// stores ONE token (kavati_auth_token) regardless of whether the user is a
// client, a business owner, or a super admin — routing is derived from role.

export type UserRole = "client" | "business_owner" | "super_admin";

export interface UserTokenPayload {
  userId:      number;
  role:        UserRole;
  email?:      string | null;
  phone?:      string | null;
  businessId?: number | null;
}

export function signUserToken(payload: UserTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyUserToken(token: string): UserTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserTokenPayload;
  } catch {
    return null;
  }
}
