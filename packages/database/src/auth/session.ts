/**
 * CORE-24 / Wave 3 — Canonical Auth Application Capability
 * (owner-approved AUTH/CONTRACT checkpoint decision, 2026-09-11).
 *
 * ONE owner of session/authentication logic. BOTH HTTP surfaces are thin
 * adapters that MUST NOT embed SQL or auth business rules:
 *   /v1/auth  — canonical (OpenAPI source of truth: lib/api-spec/v1.yaml)
 *   /api/auth — legacy transitional adapter (same capability, legacy shapes)
 *
 * Student login (CORE-20 20-N/20-O/20-P + checkpoint decision §1/§5):
 *   X-Tenant-Id is a CONTEXT SELECTOR, never an entitlement. The header value
 *   is forwarded to validateStudentLoginContext, which verifies
 *   Identity → Student → Membership → Class → School → Organization → Tenant
 *   against real DB records. NO tenant is ever auto-selected (multi-membership
 *   safe: each login EXPLICITLY names its tenant). Rejection is typed
 *   (LoginContextError reason) — adapters map LOGIN_CONTEXT_* → 403.
 *
 * Transitional (documented in the Wave-3 checkpoint report): student refresh
 * tokens are issued for contract conformance, but refreshSession() cannot
 * honor them — the D-03 rotation store (refresh_tokens.user_id → users) is
 * staff-scoped today and students have no users-row principal (18-A: identity
 * has no account fields). Fail-closed: a student refresh grants nothing;
 * student session persistence requires its own ADR (owner decision).
 */
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, gt } from "drizzle-orm";
import { db } from "../client.js";
import { passwordResetTokensTable, refreshTokensTable, usersTable, classesTable, schoolsTable, staffMembershipsTable, studentsTable } from "../schema/index.js";
import {
  createAccessToken,
  createRefreshToken,
  decodeRefreshToken,
  hashPassword,
  RefreshReuseError,
  RefreshRotator,
  verifyPassword,
  type RefreshTokenStore,
} from "@workspace/security";
import { config } from "@workspace/config";
import { validateStudentLoginContext, LoginContextError } from "../oversight/login-context.js";
import type { StudentLoginContextInput, StudentLoginContextResult } from "../oversight/contracts.js";

export { LoginContextError, RefreshReuseError };
export type { StudentLoginContextInput, StudentLoginContextResult };

/** Typed capability rejection — adapters map `status` directly to HTTP. */
export class AuthCapabilityError extends Error {
  constructor(
    public status: number,
    public reason: string,
    public detail?: unknown,
  ) {
    super(reason);
    this.name = "AuthCapabilityError";
  }
}

/** D-03 canonical token options — single owner: this capability. */
export const AUTH_TOKEN_OPTS = {
  secret: config.jwt.secret,
  issuer: config.jwt.issuer,
  audience: config.jwt.audience,
  algorithm: config.jwt.algorithm,
} as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function refreshExpiryDate(): Date {
  return new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 3600 * 1000);
}

function passwordResetExpiryDate(): Date {
  return new Date(Date.now() + config.security.passwordResetTtlMinutes * 60 * 1000);
}

/**
 * C-A3: DB-backed refresh store (packages/database is the source of truth).
 * Reuse detection: for a family, only the LATEST row's jti is valid.
 * (Extracted verbatim from the former routes/auth.ts logic.)
 */
export class DbRefreshStore implements RefreshTokenStore {
  async isRevoked(jti: string, familyId: string): Promise<boolean> {
    const [latest] = await db
      .select({ jti: refreshTokensTable.jti, revokedAt: refreshTokensTable.revokedAt })
      .from(refreshTokensTable)
      .where(eq(refreshTokensTable.familyId, familyId))
      .orderBy(desc(refreshTokensTable.createdAt));
    if (!latest) return true;
    if (latest.revokedAt) return true;
    return latest.jti !== jti;
  }
  async revoke(jti: string): Promise<void> {
    await db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokensTable.jti, jti));
  }
  async revokeFamily(familyId: string): Promise<void> {
    await db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokensTable.familyId, familyId));
  }
}

export interface SessionUser {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface PasswordResetRequestResult {
  ok: boolean;
  resetToken?: string;
  expiresAt?: string;
}

/** Issues the D-03 token pair and persists the rotating refresh family. */
export async function issueTokenPair(user: {
  id: string;
  tenantId: string;
  role: string;
  email: string;
}): Promise<TokenPair> {
  const accessToken = createAccessToken(
    { sub: user.id, role: user.role, tenantId: user.tenantId, email: user.email },
    AUTH_TOKEN_OPTS,
    config.jwt.accessTtlSeconds,
  );
  const familyId = randomUUID();
  const refreshToken = createRefreshToken(user.id, familyId, AUTH_TOKEN_OPTS, config.jwt.refreshTtlDays);
  const payload = decodeRefreshToken(refreshToken, AUTH_TOKEN_OPTS);

  await db.insert(refreshTokensTable).values({
    userId: user.id,
    tenantId: user.tenantId,
    tokenHash: sha256(refreshToken),
    familyId,
    jti: payload.jti,
    tokenVersion: 2,
    expiresAt: refreshExpiryDate(),
  });

  return { accessToken, refreshToken };
}

export interface RegisterInput {
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
}

/** Registration (legacy-only surface): unique email, hashed password, token pair. */
export async function registerUser(input: RegisterInput): Promise<{ user: SessionUser; tokens: TokenPair }> {
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, input.email))
    .limit(1);
  if (existing.length > 0) {
    throw new AuthCapabilityError(409, "EMAIL_IN_USE");
  }

  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(usersTable)
    .values({
      tenantId: input.tenantId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      passwordHash,
      role: input.role as typeof usersTable.$inferInsert.role,
    })
    .returning({
      id: usersTable.id,
      tenantId: usersTable.tenantId,
      role: usersTable.role,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    });
  if (!user) {
    throw new AuthCapabilityError(500, "USER_CREATION_FAILED");
  }
  const tokens = await issueTokenPair(user);
  return { user, tokens };
}

/** Staff/user password login (D-03): verify → issue pair. */
export async function loginWithPassword(email: string, password: string): Promise<{ user: SessionUser; tokens: TokenPair }> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.email, email), eq(usersTable.isActive, true)))
    .limit(1);
  if (!user) {
    throw new AuthCapabilityError(401, "INVALID_CREDENTIALS");
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AuthCapabilityError(401, "INVALID_CREDENTIALS");
  }
  const tokens = await issueTokenPair(user);
  return {
    user: {
      id: user.id,
      tenantId: user.tenantId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    },
    tokens,
  };
}

/**
 * Rotating refresh (D-03): rotate + persist + fresh access token.
 * Students have no users-row principal (18-A) → their refresh tokens resolve
 * to no user → 401 (fail-closed; see module header).
 */
export async function refreshSession(refreshToken: string): Promise<{ user: SessionUser; tokens: TokenPair }> {
  const store = new DbRefreshStore();
  const rotator = new RefreshRotator(store);
  let rotated: { token: string; userId: string; familyId: string };
  try {
    rotated = await rotator.rotate(refreshToken, AUTH_TOKEN_OPTS, config.jwt.refreshTtlDays);
  } catch (e) {
    if (e instanceof RefreshReuseError) {
      throw new AuthCapabilityError(401, "REFRESH_REUSE_DETECTED");
    }
    throw new AuthCapabilityError(401, "INVALID_REFRESH_TOKEN");
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      tenantId: usersTable.tenantId,
      role: usersTable.role,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(and(eq(usersTable.id, rotated.userId), eq(usersTable.isActive, true)))
    .limit(1);
  if (!user) {
    throw new AuthCapabilityError(401, "USER_NOT_FOUND_OR_INACTIVE");
  }

  const payload = decodeRefreshToken(rotated.token, AUTH_TOKEN_OPTS);
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    tenantId: user.tenantId,
    tokenHash: sha256(rotated.token),
    familyId: payload.familyId,
    jti: payload.jti,
    tokenVersion: 2,
    expiresAt: refreshExpiryDate(),
  });

  const accessToken = createAccessToken(
    { sub: user.id, role: user.role, tenantId: user.tenantId, email: user.email },
    AUTH_TOKEN_OPTS,
    config.jwt.accessTtlSeconds,
  );
  return {
    user: {
      id: user.id,
      tenantId: user.tenantId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    },
    tokens: { accessToken, refreshToken: rotated.token },
  };
}

/** Logout: revoke the presented refresh token (if any). */
export async function logoutSession(refreshToken?: string): Promise<{ ok: boolean }> {
  if (refreshToken) {
    await db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokensTable.tokenHash, sha256(refreshToken)));
  }
  return { ok: true };
}

export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  const [user] = await db
    .select({ id: usersTable.id, tenantId: usersTable.tenantId, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (!user || !user.isActive) {
    return { ok: true };
  }

  const resetToken = randomUUID();
  const expiresAt = passwordResetExpiryDate();
  await db
    .update(passwordResetTokensTable)
    .set({ consumedAt: new Date() })
    .where(and(eq(passwordResetTokensTable.userId, user.id), isNull(passwordResetTokensTable.consumedAt)));
  await db.insert(passwordResetTokensTable).values({
    userId: user.id,
    tenantId: user.tenantId,
    tokenHash: sha256(resetToken),
    expiresAt,
  });
  return { ok: true, resetToken, expiresAt: expiresAt.toISOString() };
}

export async function resetPasswordWithToken(resetToken: string, newPassword: string): Promise<{ ok: boolean }> {
  const [row] = await db
    .select({ id: passwordResetTokensTable.id, userId: passwordResetTokensTable.userId, expiresAt: passwordResetTokensTable.expiresAt, consumedAt: passwordResetTokensTable.consumedAt })
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.tokenHash, sha256(resetToken)))
    .limit(1);
  if (!row || row.consumedAt || row.expiresAt <= new Date()) {
    throw new AuthCapabilityError(400, "INVALID_RESET_TOKEN");
  }
  const passwordHash = await hashPassword(newPassword);
  await db.update(usersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(usersTable.id, row.userId));
  await db.update(passwordResetTokensTable).set({ consumedAt: new Date() }).where(eq(passwordResetTokensTable.id, row.id));
  await db.update(refreshTokensTable).set({ revokedAt: new Date() }).where(and(eq(refreshTokensTable.userId, row.userId), isNull(refreshTokensTable.revokedAt), gt(refreshTokensTable.expiresAt, new Date())));
  return { ok: true };
}

/** GET /auth/me — the safe user record only (never the hash). */
export async function getCurrentUser(userId: string): Promise<{
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
}> {
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
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!found) {
    throw new AuthCapabilityError(404, "USER_NOT_FOUND");
  }
  return found;
}

/**
 * Unified student login (20-N/20-O/20-P + checkpoint decision):
 *   X-Tenant-Id (selector) + identityId → validateStudentLoginContext
 *   (Identity → Student → Membership → Class → School → Organization → Tenant,
 *   ALL verified in DB) → token pair carrying ONLY verified claims:
 *   sub=identityId (global principal), studentId/classId/schoolId/organizationId
 *   = the DB-verified context, role="student", tenantId=the requested tenant.
 * Rejection: LoginContextError reason (adapters → 403). No session is issued.
 */
export async function studentLoginWithIdentity(input: {
  tenantId: string;
  identityId: string;
  claimed?: StudentLoginContextInput["claimed"];
}): Promise<{ context: StudentLoginContextResult; tokens: TokenPair }> {
  const context = await validateStudentLoginContext({
    tenantId: input.tenantId,
    identityId: input.identityId,
    claimed: input.claimed,
  });

  const tokens: TokenPair = {
    accessToken: createAccessToken(
      {
        sub: input.identityId,
        role: "student",
        tenantId: input.tenantId,
        schoolId: context.schoolId,
        organizationId: context.organizationId ?? undefined,
        studentId: context.studentId,
      },
      AUTH_TOKEN_OPTS,
      config.jwt.accessTtlSeconds,
    ),
    refreshToken: createRefreshToken(input.identityId, randomUUID(), AUTH_TOKEN_OPTS, config.jwt.refreshTtlDays),
  };
  return { context, tokens };
}

export async function assertStaffScope(tenantId: string, userId: string, schoolId?: string): Promise<void> {
  const memberships = await db
    .select({
      scopeType: staffMembershipsTable.scopeType,
      scopeId: staffMembershipsTable.scopeId,
    })
    .from(staffMembershipsTable)
    .where(
      and(
        eq(staffMembershipsTable.tenantId, tenantId),
        eq(staffMembershipsTable.userId, userId),
        eq(staffMembershipsTable.status, "active"),
      ),
    );
  if (memberships.length === 0) {
    throw new AuthCapabilityError(403, "AUTHZ_NO_MEMBERSHIP");
  }
  if (!schoolId) return;
  const [school] = await db
    .select({ organizationId: schoolsTable.organizationId })
    .from(schoolsTable)
    .where(and(eq(schoolsTable.id, schoolId), eq(schoolsTable.tenantId, tenantId)))
    .limit(1);
  if (!school) {
    throw new AuthCapabilityError(404, "SCHOOL_NOT_FOUND_IN_TENANT");
  }
  const covered = memberships.some(
    (m) =>
      m.scopeType === "TENANT" ||
      (m.scopeType === "ORGANIZATION" && m.scopeId && m.scopeId === school.organizationId) ||
      (m.scopeType === "SCHOOL" && m.scopeId === schoolId),
  );
  if (!covered) {
    throw new AuthCapabilityError(403, "AUTHZ_NO_SCOPE");
  }
}

export async function getStudentMe(tenantId: string, studentId: string): Promise<{
  user: { id: string; tenantId: string; role: string; firstName: string; lastName: string };
  studentContext: StudentLoginContextResult;
}> {
  const [student] = await db
    .select({ id: studentsTable.id, tenantId: studentsTable.tenantId, firstName: studentsTable.firstName, lastName: studentsTable.lastName, classId: studentsTable.classId })
    .from(studentsTable)
    .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)))
    .limit(1);
  if (!student) {
    throw new AuthCapabilityError(403, "AUTHZ_NO_MEMBERSHIP");
  }
  const [cls] = await db
    .select({ id: classesTable.id, schoolId: classesTable.schoolId, stageKey: classesTable.stageKey, gradeLevel: classesTable.gradeLevel })
    .from(classesTable)
    .where(and(eq(classesTable.id, student.classId), eq(classesTable.tenantId, tenantId)))
    .limit(1);
  if (!cls) {
    throw new AuthCapabilityError(403, "AUTHZ_NO_SCOPE");
  }
  const [school] = await db
    .select({ id: schoolsTable.id, organizationId: schoolsTable.organizationId })
    .from(schoolsTable)
    .where(and(eq(schoolsTable.id, cls.schoolId), eq(schoolsTable.tenantId, tenantId)))
    .limit(1);
  if (!school) {
    throw new AuthCapabilityError(403, "AUTHZ_NO_SCOPE");
  }
  return {
    user: { id: student.id, tenantId, role: "student", firstName: student.firstName, lastName: student.lastName },
    studentContext: {
      allowed: true,
      studentId: student.id,
      classId: cls.id,
      schoolId: school.id,
      stageKey: cls.stageKey ?? null,
      gradeLevel: cls.gradeLevel,
      organizationId: school.organizationId ?? null,
    },
  };
}
