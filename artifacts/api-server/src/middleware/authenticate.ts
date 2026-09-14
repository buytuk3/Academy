import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type TokenPayload } from "../lib/auth.js";

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

/** Validates the Bearer JWT. Attaches req.user on success. */
export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Token expired or invalid" });
  }
}

/** Role-based access control — use after authenticate() */
export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
