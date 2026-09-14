/**
 * LEGACY /api/auth — TRANSITIONAL adapter (owner-approved AUTH/CONTRACT
 * checkpoint decision, 2026-09-11).
 * ALL auth logic lives in the canonical Auth Application Capability
 * (packages/database/src/auth/session.ts). This file is a thin HTTP adapter:
 * Zod validation + capability calls + legacy response shapes. NO SQL,
 * NO auth business rules, NO duplication. /v1/auth shares the SAME capability.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  registerUser,
  loginWithPassword,
  refreshSession,
  logoutSession,
  requestPasswordReset,
  resetPasswordWithToken,
  getCurrentUser,
  AuthCapabilityError,
} from "@workspace/db";
import { authenticate, type AuthUser } from "../middleware/auth.js";

const router: IRouter = Router();

const ROLES = ["admin", "principal", "teacher", "student", "parent"] as const;

const registerSchema = z.object({
  tenantId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(ROLES).default("teacher"),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({ resetToken: z.string().min(1), newPassword: z.string().min(8) });

const fail = (res: Response, e: unknown): void => {
  if (e instanceof AuthCapabilityError) {
    res.status(e.status).json({ error: e.reason });
    return;
  }
  throw e;
};

router.post("/auth/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const { user, tokens } = await registerUser(parsed.data);
    res.status(201).json({ user, ...tokens });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const { user, tokens } = await loginWithPassword(parsed.data.email, parsed.data.password);
    res.json({ user, ...tokens });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/auth/refresh", async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }
  try {
    const { tokens } = await refreshSession(parsed.data.refreshToken);
    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/auth/logout", authenticate, async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  try {
    await logoutSession(refreshToken);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const result = await requestPasswordReset(parsed.data.email);
    res.status(200).json(result);
  } catch (e) {
    fail(res, e);
  }
});

router.post("/auth/reset-password", async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const result = await resetPasswordWithToken(parsed.data.resetToken, parsed.data.newPassword);
    res.status(200).json(result);
  } catch (e) {
    fail(res, e);
  }
});

router.get("/auth/me", authenticate, async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  try {
    const found = await getCurrentUser(user.sub);
    res.json(found);
  } catch (e) {
    fail(res, e);
  }
});

export default router;
