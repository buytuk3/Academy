/**
 * CORE-19 — Education Organization & Multi-Tenant Scope Foundation.
 * Contracts (19-C/19-D/19-G/19-H/19-V): canonical TS contracts in core-platform.
 * API layer (apps/api) stays orchestration/transport only — no business logic.
 * OpenAPI (19-W) applies when /v1 endpoints are implemented; these types are
 * the single source those schemas must be derived from (no duplicate DTOs).
 *
 * SCALE (19-K/19-AS): designed for 15,000+ schools / millions of students —
 * future-ready structure, current-day simplicity. No sharding, no
 * microservices, no premature distribution.
 */

/**
 * 19-A/19-C: hierarchy levels are CONFIGURATION, never hardcoded columns and
 * never a closed DB enum. Open default registry — a deployment may extend it
 * (e.g. "SCHOOL_SYSTEM", "CLUSTER") without any core change.
 */
export const DEFAULT_ORGANIZATION_TYPES = [
  "MINISTRY",
  "AUTHORITY",
  "REGION",
  "GOVERNORATE",
  "DIRECTORATE",
  "SCHOOL",
  "BRANCH",
  "OTHER",
] as const;

/** 19-H: scope types (open set — fail-closed for unknown values). */
export const DEFAULT_STAFF_SCOPE_TYPES = [
  "TENANT",
  "ORGANIZATION",
  "SCHOOL",
  "GRADE",
  "CLASS",
] as const;

/** Depth guard for hierarchy walks (defense-in-depth with the DB CHECK). */
export const MAX_HIERARCHY_DEPTH = 32;

/** Config-driven validation. Unknown types are rejected ONLY when a
 * deployment passes an explicit `allowed` list; the default list is a
 * registry, not a straitjacket. */
export function validateOrganizationType(
  type: string,
  allowed: readonly string[] = DEFAULT_ORGANIZATION_TYPES,
): string {
  const t = (type ?? "").trim().toUpperCase();
  if (!t) throw new Error("ORG_TYPE_REQUIRED");
  if (!allowed.includes(t)) throw new Error(`ORG_TYPE_NOT_ALLOWED:${t}`);
  return t;
}

export interface CreateOrganizationInput {
  tenantId: string;
  type: string; // open registry — see validateOrganizationType
  name: string;
  code?: string;
  country?: string;
  educationSystem?: string;
  parentOrganizationId?: string;
  /** 19-X: retry-safe identity of the logical operation. */
  operationKey: string;
  actorId?: string;
  allowedTypes?: readonly string[];
}

export interface AttachParentInput {
  tenantId: string;
  organizationId: string;
  parentOrganizationId: string; // null not allowed here — use create for roots
  actorId?: string;
}

export interface CreateSchoolInput {
  tenantId: string;
  name: string;
  code?: string;
  country?: string;
  educationSystem?: string;
  organizationId?: string;
  /** 19-X: retry-safe identity of the logical operation. */
  operationKey: string;
  actorId?: string;
}

export interface AttachSchoolToOrganizationInput {
  tenantId: string;
  schoolId: string;
  organizationId: string;
  actorId?: string;
}

export interface StaffMembershipInput {
  tenantId: string;
  userId: string;
  /** Open role vocabulary — reuses the existing auth roles, extensible. */
  role: string;
  scopeType: string; // DEFAULT_STAFF_SCOPE_TYPES or deployment extension
  scopeId?: string;
  schoolId?: string;
  organizationId?: string;
  /** 19-X: retry-safe identity of the logical operation. */
  operationKey: string;
  actorId?: string;
}

export interface ChangeStaffScopeInput {
  tenantId: string;
  membershipId: string;
  role?: string;
  scopeType?: string;
  scopeId?: string;
  actorId?: string;
}

/** 19-I: the resource being accessed. Scoped, never "by knowing the id". */
export interface ResourceRef {
  tenantId: string;
  schoolId?: string;
  classId?: string;
  organizationId?: string;
  gradeLevel?: string;
  studentId?: string;
}

export interface ScopeCheckInput {
  tenantId: string;
  userId: string;
  resource: ResourceRef;
  /** Optional role gate ON TOP of the scope gate (RBAC + Scope, 19-H). */
  allowedRoles?: readonly string[];
}

export interface ScopeDecision {
  authorized: true;
  membershipId: string;
  scopeType: string;
  scopeId: string | null;
}
