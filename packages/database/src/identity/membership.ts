/**
 * CORE-18 (ADR-002 / R-009) — Deterministic identity & membership lifecycle.
 *
 * No AI/LLM, no smart matching (18-W). All operations are deterministic,
 * idempotent (operationKey pattern, 18-M), audited (18-L), and emit Security
 * Events on any authorization failure (18-I). Evidence is NEVER moved, copied,
 * or re-owned (18-E/18-J) — a History Share is AUTHORIZATION TO READ, not a
 * transfer of ownership.
 *
 * Ownership: core-platform (OWNERSHIP["student-identity" / "student-membership"
 * / "student-history-share"]). Identity/Membership own NO educational data
 * (18-S) and add NO global score (18-T).
 */
import { and, eq, isNull } from "drizzle-orm";
import {
  auditLogsTable,
  studentHistorySharesTable,
  studentIdentitiesTable,
  studentMembershipsTable,
} from "../schema/index.js";
import type {
  HistoryShareScope,
  StudentHistoryShare,
  StudentMembership,
} from "../schema/index.js";
import { db } from "../client.js";
import { createLogger, getMetrics, recordSecurityEvent } from "@workspace/observability";

const log = createLogger({ name: "@workspace/db/identity" });

/** Authorization failure with canonical classification (maps to "authorization"). */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** 18-L: audit rows NEVER contain audio refs, tokens, passwords, or raw sensitive student content. */
async function audit(action: string, tenantId: string, actorId: string | undefined, entity: string, entityId: string, metadata?: Record<string, unknown>): Promise<void> {
  await db.insert(auditLogsTable).values({
    id: crypto.randomUUID(),
    tenantId,
    actorId,
    action,
    entity,
    entityId,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
  });
}

function securityEvent(type: "cross-tenant-attempt" | "authorization-failure" | "suspicious-access", tenantId: string, detail: Record<string, unknown>): void {
  recordSecurityEvent(log, getMetrics(), type, { tenantId, detail });
}

// ===== 18-A: identity creation (minimal, deterministic, idempotent) =====

export interface CreateIdentityInput {
  operationKey: string;
}

export interface CreateIdentityResult {
  identityId: string;
  created: boolean; // false → replay of the same operationKey (18-M)
}

const UNIQUE_VIOLATION = "23505";

export async function createIdentity(input: CreateIdentityInput): Promise<CreateIdentityResult> {
  if (!input.operationKey?.trim()) throw new Error("OPERATION_KEY_REQUIRED");
  try {
    const [row] = await db
      .insert(studentIdentitiesTable)
      .values({ operationKey: input.operationKey })
      .returning();
    // Identity creation is PRE-TENANT (global, tenant-free): the audit_logs
    // table is tenant-scoped by schema, so the audit trail here is the
    // structured log channel (no tenant id exists yet). The FIRST membership
    // of this identity is tenant-scoped and audited in audit_logs.
    log.info({ event: "audit", action: "identity.created", entity: "student_identity", entityId: row.id }, "identity created");
    return { identityId: row.id, created: true };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === UNIQUE_VIOLATION) {
      const [existing] = await db
        .select()
        .from(studentIdentitiesTable)
        .where(eq(studentIdentitiesTable.operationKey, input.operationKey))
        .limit(1);
      if (existing) return { identityId: existing.id, created: false };
    }
    throw err;
  }
}

// ===== 18-B: membership lifecycle (append-only history) =====

export type MembershipStatus = "active" | "transferred" | "returned";

export interface StartMembershipInput {
  identityId: string;
  tenantId: string;
  studentId: string;
  schoolId: string;
  classId: string;
  operationKey: string;
  actorId?: string;
}

export interface TransferInput {
  identityId: string;
  fromTenantId: string;
  toTenantId: string;
  toStudentId: string;
  toSchoolId: string;
  toClassId: string;
  operationKey: string;
  actorId?: string;
}

async function endActiveMemberships(identityId: string, status: MembershipStatus, actorId?: string): Promise<StudentMembership[]> {
  const now = new Date();
  const active = await db
    .select()
    .from(studentMembershipsTable)
    .where(and(
      eq(studentMembershipsTable.identityId, identityId),
      eq(studentMembershipsTable.status, "active"),
      isNull(studentMembershipsTable.activeTo),
    ));
  for (const m of active) {
    await db
      .update(studentMembershipsTable)
      .set({ status, activeTo: now })
      .where(eq(studentMembershipsTable.id, m.id));
    m.status = status; // reflect the closed state on the returned snapshot
    m.activeTo = now;
    await audit(`membership.${status}`, m.tenantId, actorId, "student_membership", m.id, { identityId });
  }
  return active;
}

async function findMembershipByOperationKey(operationKey: string): Promise<StudentMembership | undefined> {
  const [m] = await db
    .select()
    .from(studentMembershipsTable)
    .where(eq(studentMembershipsTable.operationKey, operationKey))
    .limit(1);
  return m;
}

export async function startMembership(input: StartMembershipInput): Promise<StudentMembership> {
  if (!input.operationKey?.trim()) throw new Error("OPERATION_KEY_REQUIRED");
  const dupe = await findMembershipByOperationKey(input.operationKey);
  if (dupe) return dupe; // 18-M idempotent replay
  await endActiveMemberships(input.identityId, "transferred", input.actorId);
  const [row] = await db
    .insert(studentMembershipsTable)
    .values({
      identityId: input.identityId,
      tenantId: input.tenantId,
      studentId: input.studentId,
      schoolId: input.schoolId,
      classId: input.classId,
      status: "active",
      operationKey: input.operationKey,
    })
    .returning();
  await audit("membership.created", input.tenantId, input.actorId, "student_membership", row.id, { identityId: input.identityId });
  return row;
}

/** 18-E: transfer = close membership A (transferred) + open membership B (active). NO data move. */
export async function transferStudent(input: TransferInput): Promise<{ from: StudentMembership | undefined; to: StudentMembership }> {
  if (!input.operationKey?.trim()) throw new Error("OPERATION_KEY_REQUIRED");
  const dupe = await findMembershipByOperationKey(input.operationKey);
  if (dupe) {
    const current = await getActiveMembership(dupe.identityId);
    return { from: undefined, to: current ?? dupe }; // 18-M idempotent replay
  }
  const fromList = await db
    .select()
    .from(studentMembershipsTable)
    .where(and(eq(studentMembershipsTable.identityId, input.identityId), eq(studentMembershipsTable.status, "active")));
  if (fromList.length > 0 && fromList[0].tenantId !== input.fromTenantId) {
    securityEvent("cross-tenant-attempt", input.fromTenantId, { identityId: input.identityId, reason: "TRANSFER_SOURCE_TENANT_MISMATCH", actualTenantId: fromList[0].tenantId });
    throw new AuthorizationError("TRANSFER_SOURCE_TENANT_MISMATCH");
  }
  const closed = await endActiveMemberships(input.identityId, "transferred", input.actorId);
  const from = closed.find((m) => m.tenantId === input.fromTenantId) ?? fromList[0];
  const [row] = await db
    .insert(studentMembershipsTable)
    .values({
      identityId: input.identityId,
      tenantId: input.toTenantId,
      studentId: input.toStudentId,
      schoolId: input.toSchoolId,
      classId: input.toClassId,
      status: "active",
      operationKey: input.operationKey,
    })
    .returning();
  await audit("membership.transferred", input.toTenantId, input.actorId, "student_membership", row.id, { identityId: input.identityId, fromTenantId: from?.tenantId });
  return { from, to: row };
}

/**
 * 18-F: return to a previous school — the SAME global identity gets a NEW
 * membership row (status=active); the old history rows are never rewritten.
 */
export async function returnStudent(input: Omit<TransferInput, "fromTenantId">): Promise<StudentMembership> {
  if (!input.operationKey?.trim()) throw new Error("OPERATION_KEY_REQUIRED");
  const dupe = await findMembershipByOperationKey(input.operationKey);
  if (dupe) return dupe;
  await endActiveMemberships(input.identityId, "returned", input.actorId);
  const [row] = await db
    .insert(studentMembershipsTable)
    .values({
      identityId: input.identityId,
      tenantId: input.toTenantId,
      studentId: input.toStudentId,
      schoolId: input.toSchoolId,
      classId: input.toClassId,
      status: "active",
      operationKey: input.operationKey,
    })
    .returning();
  await audit("membership.returned", input.toTenantId, input.actorId, "student_membership", row.id, { identityId: input.identityId });
  return row;
}

export async function getActiveMembership(identityId: string): Promise<StudentMembership | undefined> {
  const [m] = await db
    .select()
    .from(studentMembershipsTable)
    .where(and(eq(studentMembershipsTable.identityId, identityId), eq(studentMembershipsTable.status, "active")))
    .limit(1);
  return m;
}

export async function getMembershipHistory(identityId: string): Promise<StudentMembership[]> {
  return db
    .select()
    .from(studentMembershipsTable)
    .where(eq(studentMembershipsTable.identityId, identityId))
    .orderBy(studentMembershipsTable.activeFrom);
}

// ===== 18-H/18-I: history sharing (authorization-only layer, 18-J) =====

export interface CreateShareInput {
  identityId: string;
  sourceTenantId: string;
  targetTenantId: string;
  scope: HistoryShareScope;
  grantedBy: string;
  consentRef?: string;
  operationKey: string;
  actorId?: string;
}

export async function createHistoryShare(input: CreateShareInput): Promise<StudentHistoryShare> {
  if (!input.operationKey?.trim()) throw new Error("OPERATION_KEY_REQUIRED");
  if (input.sourceTenantId === input.targetTenantId) {
    securityEvent("authorization-failure", input.sourceTenantId, { identityId: input.identityId, reason: "HISTORY_SHARE_SAME_TENANT" });
    throw new AuthorizationError("HISTORY_SHARE_SAME_TENANT");
  }
  const [dupe] = await db
    .select()
    .from(studentHistorySharesTable)
    .where(eq(studentHistorySharesTable.operationKey, input.operationKey))
    .limit(1);
  if (dupe) return dupe; // 18-M
  const [row] = await db
    .insert(studentHistorySharesTable)
    .values({
      identityId: input.identityId,
      sourceTenantId: input.sourceTenantId,
      targetTenantId: input.targetTenantId,
      scope: input.scope,
      grantedBy: input.grantedBy,
      consentRef: input.consentRef,
      operationKey: input.operationKey,
    })
    .returning();
  await audit("history_share.created", input.sourceTenantId, input.actorId ?? input.grantedBy, "student_history_share", row.id, { identityId: input.identityId, targetTenantId: input.targetTenantId, scope: input.scope });
  return row;
}

export async function revokeHistoryShare(shareId: string, actorId?: string): Promise<StudentHistoryShare> {
  const [row] = await db
    .update(studentHistorySharesTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(studentHistorySharesTable.id, shareId), isNull(studentHistorySharesTable.revokedAt)))
    .returning();
  if (!row) throw new AuthorizationError("HISTORY_SHARE_ALREADY_REVOKED_OR_MISSING");
  await audit("history_share.revoked", row.sourceTenantId, actorId, "student_history_share", row.id, { identityId: row.identityId });
  return row;
}

export interface HistoryAccessContext {
  identityId: string;
  requestingTenantId: string;
  actorId?: string;
  requestedScope: HistoryShareScope | "audio";
}

export interface HistoryAccessResult {
  authorized: true;
  scope: HistoryShareScope;
  shareId: string;
}

/**
 * 18-I: the ONLY gate for cross-tenant history reads. No admin shortcut, no
 * system shortcut, no bypass. Revoked grants deny immediately (18-N case 6).
 * 18-H: Audio is NEVER shareable in this stage (FULL ≠ audio).
 */
export async function assertGrantAuthorized(ctx: HistoryAccessContext): Promise<HistoryAccessResult> {
  if (ctx.requestedScope === "audio") {
    securityEvent("authorization-failure", ctx.requestingTenantId, { identityId: ctx.identityId, reason: "AUDIO_NEVER_SHAREABLE" });
    throw new AuthorizationError("HISTORY_SHARE_AUDIO_FORBIDDEN");
  }
  const grants = await db
    .select()
    .from(studentHistorySharesTable)
    .where(and(
      eq(studentHistorySharesTable.identityId, ctx.identityId),
      eq(studentHistorySharesTable.targetTenantId, ctx.requestingTenantId),
      isNull(studentHistorySharesTable.revokedAt),
    ));
  if (grants.length === 0) {
    securityEvent("cross-tenant-attempt", ctx.requestingTenantId, { identityId: ctx.identityId, reason: "NO_ACTIVE_GRANT" });
    throw new AuthorizationError("HISTORY_SHARE_NOT_GRANTED");
  }
  const rank = { summary: 0, dimensions: 1, full: 2 } as const;
  const requested = ctx.requestedScope as "summary" | "dimensions" | "full";
  const eligible = grants.filter((g) => rank[g.scope] >= rank[requested]);
  if (eligible.length === 0) {
    securityEvent("authorization-failure", ctx.requestingTenantId, { identityId: ctx.identityId, reason: "GRANT_SCOPE_INSUFFICIENT" });
    throw new AuthorizationError("HISTORY_SHARE_SCOPE_INSUFFICIENT");
  }
  const best = eligible.reduce((a, b) => (rank[b.scope] > rank[a.scope] ? b : a));
  await audit("history_share.access_authorized", ctx.requestingTenantId, ctx.actorId, "student_history_share", best.id, { identityId: ctx.identityId, requestedScope: ctx.requestedScope });
  return { authorized: true, scope: best.scope, shareId: best.id };
}

/** Same-tenant reads bypass the grant layer (tenant isolation stays intact). */
export function isSameTenantAccess(requestingTenantId: string, evidenceTenantId: string): boolean {
  return requestingTenantId === evidenceTenantId;
}
