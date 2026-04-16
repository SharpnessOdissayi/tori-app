import { Request, Response, NextFunction } from "express";
import { verifyUserToken, UserTokenPayload, UserRole } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      user?: UserTokenPayload;
    }
  }
}

/**
 * Unified auth middleware — verifies the Bearer token, attaches the
 * decoded payload to req.user. Does not check role; use requireRole for
 * that on specific routes.
 */
export function requireUserAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token   = authHeader.slice(7);
  const payload = verifyUserToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.user = payload;
  next();
}

/**
 * Gates a route to one of the given roles.
 *
 * Super admins are NOT auto-admitted to business_owner/client routes — a
 * super-admin JWT has `businessId: null`, and handlers that derive the
 * tenant from `req.user.businessId` would either crash or silently
 * read/write across tenants. If a super-admin needs to act on a specific
 * business they should go through a dedicated "impersonate" endpoint
 * that sets businessId explicitly.
 *
 * Callers that want to allow both roles should list them explicitly:
 *   router.get(..., requireUserAuth, requireRole("business_owner", "super_admin"), handler)
 * — and in that case the handler MUST null-check req.user.businessId.
 */
export function requireRole(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (allowed.includes(req.user.role)) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden", role: req.user.role });
  };
}
