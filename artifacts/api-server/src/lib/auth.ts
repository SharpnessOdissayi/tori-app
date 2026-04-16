import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "appointment-saas-secret-key-change-in-prod";

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
