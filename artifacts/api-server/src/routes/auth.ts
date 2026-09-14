import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable, refreshTokensTable } from "@workspace/db";
import { eq, and, isNull, gt } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
  type TokenPayload,
} from "../lib/auth.js";
import { authenticate, type AuthRequest } from "../middleware/authenticate.js";

const router: IRouter = Router();

// ─── Validation schemas (pure zod v3 — no drizzle-zod mixing) ────────────────

const ROLES = ["admin", "principal", "teacher", "student", "parent"] as const;

const registerSchema = z.object({
  tenantId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(ROLES).default("teacher"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ─── Helpers ─────────────────────────────────────────────────

async function issueTokenPair(user: {
  id: string;
  tenantId: string;
  role: string;
  email: string;
}) {
  const payload: TokenPayload = {
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  };

  const accessToken = signAccessToken(payload);
  const rawRefresh = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawRefresh);

  await db.insert(refreshTokensTable).values({
    userId: user.id,
    tenantId: user.tenantId,
    tokenHash,
    expiresAt: refreshTokenExpiresAt(),
  });

  return { accessToken, refreshToken: rawRefresh };
}

// ─── POST /api/auth/register ─────────────────────────────────

router.post("/auth/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const { email, password, tenantId, firstName, lastName, role } = parsed.data;

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(usersTable)
    .values({ tenantId, firstName, lastName, email, passwordHash, role })
    .returning({
      id: usersTable.id,
      tenantId: usersTable.tenantId,
      role: usersTable.role,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    });

  const tokens = await issueTokenPair(user);

  res.status(201).json({ user, ...tokens });
});

// ─── POST /api/auth/login ────────────────────────────────────

router.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.email, email), eq(usersTable.isActive, true)))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const tokens = await issueTokenPair(user);

  res.json({
    user: {
      id: user.id,
      tenantId: user.tenantId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    },
    ...tokens,
  });
});

// ─── POST /api/auth/refresh ──────────────────────────────────

router.post("/auth/refresh", async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }

  const tokenHash = hashRefreshToken(parsed.data.refreshToken);
  const now = new Date();

  const [stored] = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.tokenHash, tokenHash),
        isNull(refreshTokensTable.revokedAt),
        gt(refreshTokensTable.expiresAt, now)
      )
    )
    .limit(1);

  if (!stored) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }

  // Rotate: revoke old token
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: now })
    .where(eq(refreshTokensTable.id, stored.id));

  const [user] = await db
    .select({
      id: usersTable.id,
      tenantId: usersTable.tenantId,
      role: usersTable.role,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(usersTable)
    .where(and(eq(usersTable.id, stored.userId), eq(usersTable.isActive, true)))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  const tokens = await issueTokenPair(user);
  res.json(tokens);
});

// ─── POST /api/auth/logout ───────────────────────────────────

router.post(
  "/auth/logout",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await db
        .update(refreshTokensTable)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokensTable.tokenHash, tokenHash));
    }
    res.json({ ok: true });
  }
);

// ─── GET /api/auth/me ────────────────────────────────────────

router.get("/auth/me", authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;

  const [found] = await db
    .select({
      id: usersTable.id,
      tenantId: usersTable.tenantId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, user.sub))
    .limit(1);

  if (!found) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(found);
});

export default router;
