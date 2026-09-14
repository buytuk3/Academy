/**
 * CORE-19 — Organization & Staff Membership lifecycle (19-A…19-J, 19-U, 19-X).
 *
 * Deterministic, idempotent (operationKey, 19-X), audited (existing audit_logs
 * — 19-U), DB-enforced tenant integrity (composite FKs — 19-J). No AI, no
 * analytics, no global score (19-AF/19-AG). Ownership ≠ Authorization stays a
 * fixed rule: this layer resolves SCOPE; evidence/data ownership never moves.
 *
 * Ownership: core-platform (OWNERSHIP["organization" / "school" /
 * "staff-membership" / "authorization-scope"]).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  auditLogsTable,
  organizationsTable,
  schoolsTable,
  staffMembershipsTable,
} from "../schema/index.js";
import type { Organization, School, StaffMembership } from "../schema/index.js";
import { db } from "../client.js";
import { createLogger, getMetrics, recordSecurityEvent } from "@workspace/observability";
import { validateOrganizationType, MAX_HIERARCHY_DEPTH } from "./contracts.js";
import type {
  AttachParentInput,
  AttachSchoolToOrganizationInput,
  ChangeStaffScopeInput,
  CreateOrganizationInput,
  CreateSchoolInput,
  ScopeCheckInput,
  ScopeDecision,
  StaffMembershipInput,
} from "./contracts.js";

const log = createLogger({ name: "@workspace/db/org" });

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** 19-U: audit via the EXISTING audit_logs (no new audit system). */
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

function securityEvent(type: "cross-tenant-attempt" | "authorization-failure", tenantId: string, detail: Record<string, unknown>): void {
  recordSecurityEvent(log, getMetrics(), type, { tenantId, detail });
}

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

// ===== 19-C: organization create / hierarchy =====

export async function createOrganization(input: CreateOrganizationInput): Promise<{ organization: Organization; created: boolean }> {
  validateOrganizationType(input.type, input.allowedTypes);
  if (!input.operationKey?.trim()) throw new Error("OPERATION_KEY_REQUIRED");
  try {
    const [row] = await db
      .insert(organizationsTable)
      .values({
        tenantId: input.tenantId,
        type: (input.type ?? "").trim().toUpperCase(),
        name: input.name,
        code: input.code,
        country: input.country,
        educationSystem: input.educationSystem,
        parentOrganizationId: input.parentOrganizationId,
        operationKey: input.operationKey,
      })
      .returning();
    await audit("organization.created", input.tenantId, input.actorId, "organization", row.id, { type: row.type, parentOrganizationId: input.parentOrganizationId });
    return { organization: row, created: true };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === UNIQUE_VIOLATION) {
      const [existing] = await db
        .select()
        .from(organizationsTable)
        .where(and(eq(organizationsTable.tenantId, input.tenantId), eq(organizationsTable.operationKey, input.operationKey)))
        .limit(1);
      if (existing) return { organization: existing, created: false }; // 19-X retry
    }
    throw err;
  }
}

export async function attachParent(input: AttachParentInput): Promise<Organization> {
  if (input.organizationId === input.parentOrganizationId) {
    securityEvent("authorization-failure", input.tenantId, { reason: "ORG_SELF_PARENT" });
    throw new AuthorizationError("ORG_SELF_PARENT");
  }
  // Cycle detection on the CURRENT chain (defensive; DB CHECK blocks self-parent).
  const chain = await ancestorChain(input.tenantId, input.parentOrganizationId);
  if (chain.some((o) => o.id === input.organizationId)) {
    securityEvent("authorization-failure", input.tenantId, { reason: "ORG_CYCLE_DETECTED", organizationId: input.organizationId, parentOrganizationId: input.parentOrganizationId });
    throw new AuthorizationError("ORG_CYCLE_DETECTED");
  }
  const [row] = await db
    .update(organizationsTable)
    .set({ parentOrganizationId: input.parentOrganizationId, updatedAt: new Date() })
    .where(and(eq(organizationsTable.id, input.organizationId), eq(organizationsTable.tenantId, input.tenantId)))
    .returning();
  if (!row) throw new AuthorizationError("ORG_NOT_FOUND_IN_TENANT");
  await audit("organization.parent_attached", input.tenantId, input.actorId, "organization", row.id, { parentOrganizationId: input.parentOrganizationId });
  return row;
}

/** Walks ancestors upward; cycle-safe via depth guard + DB self-parent ban. */
export async function ancestorChain(tenantId: string, organizationId: string): Promise<Organization[]> {
  const chain: Organization[] = [];
  const seen = new Set<string>();
  let cursor: string | null = organizationId;
  let depth = 0;
  while (cursor && depth < MAX_HIERARCHY_DEPTH) {
    if (seen.has(cursor)) throw new AuthorizationError("ORG_CYCLE_DETECTED"); // defense-in-depth
    seen.add(cursor);
    const [row] = await db
      .select()
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, cursor), eq(organizationsTable.tenantId, tenantId)))
      .limit(1);
    if (!row) break; // cross-tenant parent is impossible (composite FK) → chain ends
    chain.push(row);
    cursor = row.parentOrganizationId;
    depth++;
  }
  if (depth >= MAX_HIERARCHY_DEPTH) throw new AuthorizationError("ORG_HIERARCHY_TOO_DEEP");
  return chain;
}

/** Descendants of an organization (scope resolution for 19-S, read-only). */
export async function descendantOrganizationIds(tenantId: string, organizationId: string, maxNodes = 100000): Promise<string[]> {
  const result: string[] = [];
  let frontier: string[] = [organizationId];
  let depth = 0;
  while (frontier.length && depth < MAX_HIERARCHY_DEPTH && result.length < maxNodes) {
    const childRows = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.tenantId, tenantId), inArray(organizationsTable.parentOrganizationId, frontier)));
    frontier = [];
    for (const c of childRows) {
      if (!seenOrPush(result, c.id) && result.length < maxNodes) frontier.push(c.id);
    }
    depth++;
  }
  return result;
}

function seenOrPush(list: string[], id: string): boolean {
  if (list.includes(id)) return true;
  list.push(id);
  return false;
}

// ===== 19-D: school create / attach =====

export async function createSchool(input: CreateSchoolInput): Promise<{ school: School; created: boolean }> {
  if (!input.operationKey?.trim()) throw new Error("OPERATION_KEY_REQUIRED");
  try {
    const [row] = await db
      .insert(schoolsTable)
      .values({
        tenantId: input.tenantId,
        name: input.name,
        code: input.code,
        country: input.country,
        educationSystem: input.educationSystem,
        organizationId: input.organizationId,
        operationKey: input.operationKey,
      })
      .returning();
    await audit("school.created", input.tenantId, input.actorId, "school", row.id, { organizationId: input.organizationId });
    return { school: row, created: true };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === UNIQUE_VIOLATION) {
      const [existing] = await db
        .select()
        .from(schoolsTable)
        .where(and(eq(schoolsTable.tenantId, input.tenantId), eq(schoolsTable.operationKey, input.operationKey)))
        .limit(1);
      if (existing) return { school: existing, created: false }; // 19-X retry
    }
    throw err;
  }
}

export async function attachSchoolToOrganization(input: AttachSchoolToOrganizationInput): Promise<School> {
  const [row] = await db
    .update(schoolsTable)
    .set({ organizationId: input.organizationId, updatedAt: new Date() })
    .where(and(eq(schoolsTable.id, input.schoolId), eq(schoolsTable.tenantId, input.tenantId)))
    .returning();
  if (!row) throw new AuthorizationError("SCHOOL_NOT_FOUND_IN_TENANT");
  await audit("school.organization_attached", input.tenantId, input.actorId, "school", row.id, { organizationId: input.organizationId });
  return row;
}

// ===== 19-G: staff membership lifecycle =====

export async function addStaffMembership(input: StaffMembershipInput): Promise<StaffMembership> {
  if (!input.operationKey?.trim()) throw new Error("OPERATION_KEY_REQUIRED");
  if (!input.schoolId && !input.organizationId) throw new AuthorizationError("STAFF_MEMBERSHIP_ANCHOR_REQUIRED");
  try {
    const [row] = await db
      .insert(staffMembershipsTable)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        role: input.role,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        schoolId: input.schoolId,
        organizationId: input.organizationId,
        operationKey: input.operationKey,
      })
      .returning();
    await audit("staff_membership.created", input.tenantId, input.actorId, "staff_membership", row.id, { role: row.role, scopeType: row.scopeType, schoolId: row.schoolId, organizationId: row.organizationId });
    return row;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === UNIQUE_VIOLATION) {
      const [existing] = await db
        .select()
        .from(staffMembershipsTable)
        .where(and(eq(staffMembershipsTable.tenantId, input.tenantId), eq(staffMembershipsTable.operationKey, input.operationKey)))
        .limit(1);
      if (existing) return existing; // 19-X retry
    }
    throw err;
  }
}

/** 19-H/19-U: scope/role change — audited, membership history preserved. */
export async function changeStaffScope(input: ChangeStaffScopeInput): Promise<StaffMembership> {
  const [row] = await db
    .update(staffMembershipsTable)
    .set({
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.scopeType !== undefined ? { scopeType: input.scopeType } : {}),
      ...(input.scopeId !== undefined ? { scopeId: input.scopeId } : {}),
    })
    .where(and(eq(staffMembershipsTable.id, input.membershipId), eq(staffMembershipsTable.tenantId, input.tenantId)))
    .returning();
  if (!row) throw new AuthorizationError("STAFF_MEMBERSHIP_NOT_FOUND_IN_TENANT");
  await audit("staff_membership.scope_changed", input.tenantId, input.actorId, "staff_membership", row.id, { role: row.role, scopeType: row.scopeType, scopeId: row.scopeId });
  return row;
}

export async function endStaffMembership(tenantId: string, membershipId: string, actorId?: string): Promise<StaffMembership> {
  const [row] = await db
    .update(staffMembershipsTable)
    .set({ status: "ended", activeTo: new Date() })
    .where(and(eq(staffMembershipsTable.id, membershipId), eq(staffMembershipsTable.tenantId, tenantId)))
    .returning();
  if (!row) throw new AuthorizationError("STAFF_MEMBERSHIP_NOT_FOUND_IN_TENANT");
  await audit("staff_membership.ended", tenantId, actorId, "staff_membership", row.id, {});
  return row;
}

// ===== 19-I: scoped authorization gate (RBAC + Scope) =====

/**
 * The authorization chain (19-I): Role gate AND Scope gate.
 * Scope semantics:
 *  - TENANT: everything inside the tenant
 *  - ORGANIZATION: everything under that organization subtree (19-S)
 *  - SCHOOL: everything inside that school
 *  - GRADE: school scope narrowed to a gradeLevel
 *  - CLASS: school scope narrowed to one classId
 * Unknown scopeType → fail-closed DENY (19-H).
 * Organization scope NEVER grants History-Share audio (19-T: FULL ≠ audio —
 * sensitivity layer stays with CORE-18's grant scopes).
 */
export async function checkScope(input: ScopeCheckInput): Promise<ScopeDecision> {
  if (!input.resource || input.resource.tenantId !== input.tenantId) {
    securityEvent("cross-tenant-attempt", input.tenantId, { userId: input.userId, reason: "RESOURCE_TENANT_MISMATCH" });
    throw new AuthorizationError("SCOPE_TENANT_MISMATCH");
  }
  const memberships = await db
    .select()
    .from(staffMembershipsTable)
    .where(and(
      eq(staffMembershipsTable.tenantId, input.tenantId),
      eq(staffMembershipsTable.userId, input.userId),
      eq(staffMembershipsTable.status, "active"),
      isNull(staffMembershipsTable.activeTo),
    ));
  if (memberships.length === 0) {
    securityEvent("authorization-failure", input.tenantId, { userId: input.userId, reason: "NO_ACTIVE_MEMBERSHIP" });
    throw new AuthorizationError("SCOPE_NO_ACTIVE_MEMBERSHIP");
  }
  // Role gate (only when a role restriction is requested on top).
  if (input.allowedRoles && !memberships.some((m) => (input.allowedRoles as readonly string[]).includes(m.role))) {
    securityEvent("authorization-failure", input.tenantId, { userId: input.userId, reason: "ROLE_NOT_ALLOWED" });
    throw new AuthorizationError("SCOPE_ROLE_NOT_ALLOWED");
  }
  for (const m of memberships) {
    // TENANT scope covers everything in-tenant.
    if (m.scopeType === "TENANT") return { authorized: true, membershipId: m.id, scopeType: m.scopeType, scopeId: null };
    // ORGANIZATION scope covers the org subtree (including schools attached to it).
    if (m.scopeType === "ORGANIZATION" && m.organizationId) {
      if (input.resource.organizationId === m.organizationId) {
        return { authorized: true, membershipId: m.id, scopeType: m.scopeType, scopeId: m.organizationId };
      }
      const subtree = await descendantOrganizationIds(input.tenantId, m.organizationId);
      if (input.resource.organizationId && subtree.includes(input.resource.organizationId)) {
        return { authorized: true, membershipId: m.id, scopeType: m.scopeType, scopeId: m.organizationId };
      }
      if (input.resource.schoolId) {
        const [school] = await db
          .select()
          .from(schoolsTable)
          .where(and(eq(schoolsTable.id, input.resource.schoolId), eq(schoolsTable.tenantId, input.tenantId)))
          .limit(1);
        if (school?.organizationId && (school.organizationId === m.organizationId || subtree.includes(school.organizationId))) {
          return { authorized: true, membershipId: m.id, scopeType: m.scopeType, scopeId: m.organizationId };
        }
      }
    }
    // SCHOOL / GRADE / CLASS scopes. GRADE semantics: scopeId = gradeLevel,
    // anchored to the staff member's school (CORE-20 20-M alignment).
    if (input.resource.schoolId && m.scopeId === input.resource.schoolId) {
      if (m.scopeType === "SCHOOL") return { authorized: true, membershipId: m.id, scopeType: m.scopeType, scopeId: m.scopeId };
    }
    if (m.scopeType === "GRADE" && m.schoolId === input.resource.schoolId && input.resource.gradeLevel && m.scopeId === input.resource.gradeLevel) {
      return { authorized: true, membershipId: m.id, scopeType: m.scopeType, scopeId: m.scopeId };
    }
    if (m.scopeType === "CLASS" && input.resource.classId) {
      // Class scope: scopeId = classId (school anchored for tenant safety).
      if (m.scopeId === input.resource.classId) return { authorized: true, membershipId: m.id, scopeType: m.scopeType, scopeId: m.scopeId };
    }
    // CLASS scope may carry scopeId = classId directly.
    if (m.scopeType === "CLASS" && input.resource.classId && m.scopeId === input.resource.classId) {
      return { authorized: true, membershipId: m.id, scopeType: m.scopeType, scopeId: m.scopeId };
    }
  }
  securityEvent("cross-tenant-attempt", input.tenantId, { userId: input.userId, reason: "SCOPE_NOT_COVERING_RESOURCE", resource: { ...input.resource } });
  throw new AuthorizationError("SCOPE_NOT_COVERING_RESOURCE");
}
