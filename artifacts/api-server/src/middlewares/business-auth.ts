import { Request, Response, NextFunction } from "express";
import { verifyBusinessToken, BusinessTokenPayload } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      business?: BusinessTokenPayload;
    }
  }
}

export function requireBusinessAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyBusinessToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.business = payload;
  next();
}
