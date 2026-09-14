import type { Request, Response, NextFunction } from "express";
import { config } from "@workspace/config";
import {
  verifyAccessToken,
  hasRole,
  type Role,
  ROLES,
} from "@workspace/security";

export interface AuthUser {
  sub: string;
  role: string;
  tenantId?: string;
  schoolId?: string;
  organizationId?: string;
  email?: string;
  /** CORE-24 Wave 3 (additive): verified student claim from unified login (20-O). */
  studentId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export { ROLES };
export type { Role };

/** D-03: validates the Bearer token with the canonical verifier (C-A2 grace for legacy tokens). */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  try {
    const p = verifyAccessToken(header.slice(7), { secret: config.jwt.secret });
    req.user = {
      sub: p.sub,
      role: p.role,
      tenantId: p.tenantId,
      schoolId: p.schoolId,
      organizationId: p.organizationId,
      email: p.email,
      // CORE-24 Wave 3 (additive): verified student identity claim (20-O binding)
      studentId: p.studentId,
    };
    next();
  } catch {
    res.status(401).json({ error: "Token expired or invalid" });
  }
}

/** D-03 RBAC: platform-wide roles (packages/security), detached from any engine. */
export function authorize(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    if (!hasRole(req.user.role, roles)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
