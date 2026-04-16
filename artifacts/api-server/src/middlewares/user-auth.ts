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
 * Gates a route to one of the given roles. Super admins always have access
 * regardless of what's requested (business_owner routes are reachable by
 * super_admin too — handy for impersonation / support workflows).
 */
export function requireRole(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role === "super_admin" || allowed.includes(req.user.role)) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden", role: req.user.role });
  };
}
