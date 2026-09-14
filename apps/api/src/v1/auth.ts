/**
 * CORE-24 / Wave 3 — /v1/auth canonical adapter (owner-approved AUTH/CONTRACT
 * checkpoint decision, 2026-09-11).
 * THIN ADAPTER ONLY: validates the OpenAPI-generated request shapes and maps
 * typed capability results/errors — ZERO SQL, ZERO auth business rules.
 * The Auth Application Capability (packages/database/src/auth/session.ts)
 * owns ALL logic. Student login: X-Tenant-Id = context SELECTOR forwarded to
 * validateStudentLoginContext (Identity → Membership → Class → School → Org →
 * Tenant verified in DB) — never an entitlement; no membership → 403; the
 * server NEVER auto-selects a tenant (multi-membership safe).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  LoginRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
  StudentLoginRequestSchema,
  type LoginRequest,
  type RefreshRequest,
  type LogoutRequest,
  type StudentLoginRequest,
} from "@workspace/api-zod";
import {
  loginWithPassword,
  refreshSession,
  logoutSession,
  requestPasswordReset,
  resetPasswordWithToken,
  getCurrentUser,
  getStudentMe,
  studentLoginWithIdentity,
} from "@workspace/db";
import { authenticate, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, validateBody } from "./errors.js";

const router: IRouter = Router();

const ForgotPasswordRequestSchema = z.object({ email: z.string().email() });
const ResetPasswordRequestSchema = z.object({ resetToken: z.string().min(1), newPassword: z.string().min(8) });

type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;
type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

const TOKEN_USER_FIELDS = (u: {
  id: string; tenantId: string; role: string; email: string; firstName: string; lastName: string;
}) => ({ id: u.id, tenantId: u.tenantId, role: u.role, email: u.email, firstName: u.firstName, lastName: u.lastName });

router.post("/auth/login", async (req: Request, res: Response) => {
  const body = validateBody<LoginRequest>(LoginRequestSchema, req, res);
  if (!body) return;
  try {
    const { user, tokens } = await loginWithPassword(body.email, body.password);
    res.json({ user: TOKEN_USER_FIELDS(user), ...tokens });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

router.post("/auth/refresh", async (req: Request, res: Response) => {
  const body = validateBody<RefreshRequest>(RefreshRequestSchema, req, res);
  if (!body) return;
  try {
    const { user, tokens } = await refreshSession(body.refreshToken);
    res.json({ user: TOKEN_USER_FIELDS(user), ...tokens });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  const body = validateBody<LogoutRequest>(LogoutRequestSchema, req, res);
  if (!body) return;
  try {
    await logoutSession(body.refreshToken);
    res.status(200).json({ ok: true });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  const body = validateBody<ForgotPasswordRequest>(ForgotPasswordRequestSchema, req, res);
  if (!body) return;
  try {
    const result = await requestPasswordReset(body.email);
    res.status(200).json(result);
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

router.post("/auth/reset-password", async (req: Request, res: Response) => {
  const body = validateBody<ResetPasswordRequest>(ResetPasswordRequestSchema, req, res);
  if (!body) return;
  try {
    const result = await resetPasswordWithToken(body.resetToken, body.newPassword);
    res.status(200).json(result);
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

router.get("/auth/me", authenticate, async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  try {
    if (user.studentId && user.tenantId) {
      const me = await getStudentMe(user.tenantId, user.studentId);
      res.json(me);
      return;
    }
    const found = await getCurrentUser(user.sub);
    res.json({
      user: {
        id: found.id,
        tenantId: found.tenantId,
        role: found.role,
        email: found.email,
        firstName: found.firstName,
        lastName: found.lastName,
      },
    });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

router.post("/auth/student-login", async (req: Request, res: Response) => {
  const tenantId = typeof req.headers["x-tenant-id"] === "string" ? (req.headers["x-tenant-id"] as string).trim() : "";
  if (!tenantId) {
    apiError(res, 400, "TENANT_CONTEXT_REQUIRED", "X-Tenant-Id header is required (context selector, not an entitlement)");
    return;
  }
  const body = validateBody<StudentLoginRequest>(StudentLoginRequestSchema, req, res);
  if (!body) return;
  try {
    const { context, tokens } = await studentLoginWithIdentity({
      tenantId,
      identityId: body.identityId,
      claimed: body.claimed,
    });
    res.json({ context, ...tokens });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

export default router;
