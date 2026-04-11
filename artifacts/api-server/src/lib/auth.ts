import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "appointment-saas-secret-key-change-in-prod";

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
