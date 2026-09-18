/**
 * PHASE-15 — canonical SCHOOL-ONBOARDING-AND-TEACHER-ASSIGNMENT capability
 * (governing doc v2.1 §3.1 + §3.2). ALL SQL lives here (Architecture Contract).
 *
 * §3.1 school requests: PENDING by default; activation ONLY via an explicit
 *      decision by a principal/admin — no auto-activation path exists.
 * §3.2 claim engine: canonical subject×school slots; the UNIQUE constraint
 *      (tenant, school, subject) + a single-statement conditional UPDATE
 *      (compare-and-swap on claim_status='OPEN') form the real atomic lock —
 *      two concurrent claims can never both win. Teachers stay multi-school
 *      (a teacher may hold slots in many schools; only the won SLOT is locked).
 *      Principal override (second/assistant teacher on a claimed slot) is an
 *      explicitly-flagged, audited exception row — never a silent bypass.
 *
 * Every function runs inside withTenant (0007 RLS mechanism, fail-closed).
 */
import { and, asc, eq } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import {
  schoolRequestsTable,
  schoolsTable,
  teachingSlotOverridesTable,
  teachingSlotsTable,
} from "../schema/index.js";

/** Typed capability error → mapped to HTTP by the /v1 adapter. */
export class OnboardingCapabilityError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "OnboardingCapabilityError";
    this.code = code;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, code: string): void {
  if (!UUID_RE.test(value)) throw new OnboardingCapabilityError(code);
}

// ==================== §3.1 school requests ====================

export interface CreateSchoolRequestInput {
  tenantId: string;
  requestedBy: string;
  schoolName: string;
  governorate?: string;
  stageKey: "PRIMARY" | "PREPARATORY" | "SECONDARY";
  operationKey: string;
}

/** Student/member requests a school that does not exist → PENDING, always. */
export async function createSchoolRequest(
  input: CreateSchoolRequestInput,
): Promise<{ existed: boolean; id: string; status: string }> {
  return withTenant(input.tenantId, async (tx) => {
    const dup = await tx
      .select({ id: schoolRequestsTable.id, status: schoolRequestsTable.status })
      .from(schoolRequestsTable)
      .where(
        and(
          eq(schoolRequestsTable.tenantId, input.tenantId),
          eq(schoolRequestsTable.operationKey, input.operationKey),
        ),
      );
    if (dup.length > 0) return { existed: true, id: dup[0].id, status: dup[0].status };
    const [row] = await tx
      .insert(schoolRequestsTable)
      .values({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        requestedBy: input.requestedBy,
        schoolName: input.schoolName,
        governorate: input.governorate ?? null,
        stageKey: input.stageKey,
        status: "PENDING",
        operationKey: input.operationKey,
      })
      .returning({ id: schoolRequestsTable.id });
    return { existed: false, id: row.id, status: "PENDING" };
  });
}

/** Approver list (principal/admin). status filter optional. */
export async function listSchoolRequests(
  tenantId: string,
  status?: "PENDING" | "APPROVED" | "REJECTED",
): Promise<Array<{
  id: string; schoolName: string; stageKey: string; status: string;
  requestedBy: string; decidedBy: string | null; schoolId: string | null;
}>> {
  return withTenant(tenantId, async (tx) => {
    const where = status
      ? and(eq(schoolRequestsTable.tenantId, tenantId), eq(schoolRequestsTable.status, status))
      : eq(schoolRequestsTable.tenantId, tenantId);
    return tx
      .select({
        id: schoolRequestsTable.id,
        schoolName: schoolRequestsTable.schoolName,
        stageKey: schoolRequestsTable.stageKey,
        status: schoolRequestsTable.status,
        requestedBy: schoolRequestsTable.requestedBy,
        decidedBy: schoolRequestsTable.decidedBy,
        schoolId: schoolRequestsTable.schoolId,
      })
      .from(schoolRequestsTable)
      .where(where)
      .orderBy(asc(schoolRequestsTable.createdAt));
  });
}

export interface DecideSchoolRequestInput {
  tenantId: string;
  requestId: string;
  decidedBy: string;
  decision: "APPROVED" | "REJECTED";
  note?: string;
}

/**
 * Explicit decision (principal/admin). APPROVED creates the school in the same
 * transaction (idempotent via operation_key) and links it. The CAS on
 * status='PENDING' makes a concurrent second decision impossible.
 */
export async function decideSchoolRequest(
  input: DecideSchoolRequestInput,
): Promise<{ existed: boolean; status: string; schoolId: string | null }> {
  assertUuid(input.requestId, "REQUEST_NOT_FOUND");
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(schoolRequestsTable)
      .where(
        and(
          eq(schoolRequestsTable.tenantId, input.tenantId),
          eq(schoolRequestsTable.id, input.requestId),
        ),
      );
    if (rows.length === 0) throw new OnboardingCapabilityError("REQUEST_NOT_FOUND");
    const request = rows[0];
    if (request.status !== "PENDING") {
      if (request.status === input.decision) {
        return { existed: true, status: request.status, schoolId: request.schoolId };
      }
      throw new OnboardingCapabilityError("REQUEST_NOT_PENDING");
    }

    let schoolId: string | null = null;
    if (input.decision === "APPROVED") {
      const opKey = `p15-approve-${input.requestId}`;
      const inserted = await tx
        .insert(schoolsTable)
        .values({
          id: crypto.randomUUID(),
          tenantId: input.tenantId,
          name: request.schoolName,
          region: request.governorate ?? null,
          status: "active",
          operationKey: opKey,
        })
        .onConflictDoNothing()
        .returning({ id: schoolsTable.id });
      if (inserted.length > 0) {
        schoolId = inserted[0].id;
      } else {
        const existing = await tx
          .select({ id: schoolsTable.id })
          .from(schoolsTable)
          .where(
            and(eq(schoolsTable.tenantId, input.tenantId), eq(schoolsTable.operationKey, opKey)),
          );
        schoolId = existing[0]?.id ?? null;
      }
    }

    await tx
      .update(schoolRequestsTable)
      .set({
        status: input.decision,
        decidedBy: input.decidedBy,
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
        schoolId,
      })
      .where(
        and(
          eq(schoolRequestsTable.tenantId, input.tenantId),
          eq(schoolRequestsTable.id, input.requestId),
          eq(schoolRequestsTable.status, "PENDING"),
        ),
      );
    return { existed: false, status: input.decision, schoolId };
  });
}

// ==================== §3.2 claim engine ====================

/** Idempotently open subject slots for a school (the "عرض جماعي" board). */
export async function ensureTeachingSlots(
  tenantId: string,
  schoolId: string,
  subjects: string[],
  openedByRequestId?: string,
): Promise<{ schoolId: string; subjects: string[] }> {
  assertUuid(schoolId, "SCHOOL_NOT_FOUND");
  return withTenant(tenantId, async (tx) => {
    await tx
      .insert(teachingSlotsTable)
      .values(
        subjects.map((subject) => ({
          id: crypto.randomUUID(),
          tenantId,
          schoolId,
          subject,
          claimStatus: "OPEN" as const,
          openedByRequestId: openedByRequestId ?? null,
          operationKey: `p15-slot-${schoolId}-${subject}-${tenantId.slice(0, 8)}`,
        })),
      )
      .onConflictDoNothing({
        target: [teachingSlotsTable.tenantId, teachingSlotsTable.schoolId, teachingSlotsTable.subject],
      });
    return { schoolId, subjects };
  });
}

export async function listTeachingSlots(
  tenantId: string,
  schoolId?: string,
): Promise<Array<{
  id: string; schoolId: string; subject: string; claimStatus: string;
  claimedBy: string | null; claimedAt: Date | null;
}>> {
  return withTenant(tenantId, async (tx) => {
    const where = schoolId
      ? and(eq(teachingSlotsTable.tenantId, tenantId), eq(teachingSlotsTable.schoolId, schoolId))
      : eq(teachingSlotsTable.tenantId, tenantId);
    return tx
      .select({
        id: teachingSlotsTable.id,
        schoolId: teachingSlotsTable.schoolId,
        subject: teachingSlotsTable.subject,
        claimStatus: teachingSlotsTable.claimStatus,
        claimedBy: teachingSlotsTable.claimedBy,
        claimedAt: teachingSlotsTable.claimedAt,
      })
      .from(teachingSlotsTable)
      .where(where)
      .orderBy(asc(teachingSlotsTable.subject));
  });
}

export interface ClaimSlotInput {
  tenantId: string;
  teacherId: string;
  schoolId: string;
  subject: string;
  operationKey: string;
}

/**
 * THE atomic lock: one conditional UPDATE (claim_status='OPEN' → 'CLAIMED').
 * Postgres row-locks the slot; a concurrent second claim blocks, then sees 0
 * matching rows → SLOT_ALREADY_CLAIMED. Both-winning is structurally impossible.
 */
export async function claimTeachingSlot(
  input: ClaimSlotInput,
): Promise<{ id: string; subject: string; schoolId: string }> {
  assertUuid(input.schoolId, "SLOT_NOT_FOUND");
  return withTenant(input.tenantId, async (tx) => {
    const won = await tx
      .update(teachingSlotsTable)
      .set({ claimedBy: input.teacherId, claimStatus: "CLAIMED", claimedAt: new Date() })
      .where(
        and(
          eq(teachingSlotsTable.tenantId, input.tenantId),
          eq(teachingSlotsTable.schoolId, input.schoolId),
          eq(teachingSlotsTable.subject, input.subject),
          eq(teachingSlotsTable.claimStatus, "OPEN"),
        ),
      )
      .returning({ id: teachingSlotsTable.id });
    if (won.length > 0) {
      return { id: won[0].id, subject: input.subject, schoolId: input.schoolId };
    }
    const existing = await tx
      .select({ id: teachingSlotsTable.id })
      .from(teachingSlotsTable)
      .where(
        and(
          eq(teachingSlotsTable.tenantId, input.tenantId),
          eq(teachingSlotsTable.schoolId, input.schoolId),
          eq(teachingSlotsTable.subject, input.subject),
        ),
      );
    if (existing.length === 0) throw new OnboardingCapabilityError("SLOT_NOT_FOUND");
    throw new OnboardingCapabilityError("SLOT_ALREADY_CLAIMED");
  });
}

export interface GrantSlotOverrideInput {
  tenantId: string;
  slotId: string;
  grantedTo: string;
  grantedBy: string;
  roleLabel: "SECOND" | "ASSISTANT" | "SPECIALIST";
  reason: string;
  operationKey: string;
}

/** Principal-authorized exception to exclusivity (§3.2) — audited row, explicit. */
export async function grantSlotOverride(
  input: GrantSlotOverrideInput,
): Promise<{ existed: boolean; id: string }> {
  assertUuid(input.slotId, "SLOT_NOT_FOUND");
  return withTenant(input.tenantId, async (tx) => {
    const dup = await tx
      .select({ id: teachingSlotOverridesTable.id })
      .from(teachingSlotOverridesTable)
      .where(
        and(
          eq(teachingSlotOverridesTable.tenantId, input.tenantId),
          eq(teachingSlotOverridesTable.operationKey, input.operationKey),
        ),
      );
    if (dup.length > 0) return { existed: true, id: dup[0].id };
    const slot = await tx
      .select({ id: teachingSlotsTable.id, claimStatus: teachingSlotsTable.claimStatus })
      .from(teachingSlotsTable)
      .where(
        and(
          eq(teachingSlotsTable.tenantId, input.tenantId),
          eq(teachingSlotsTable.id, input.slotId),
        ),
      );
    if (slot.length === 0) throw new OnboardingCapabilityError("SLOT_NOT_FOUND");
    if (slot[0].claimStatus !== "CLAIMED") {
      throw new OnboardingCapabilityError("OVERRIDE_SLOT_NOT_CLAIMED");
    }
    const [row] = await tx
      .insert(teachingSlotOverridesTable)
      .values({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        slotId: input.slotId,
        grantedTo: input.grantedTo,
        grantedBy: input.grantedBy,
        roleLabel: input.roleLabel,
        reason: input.reason,
        operationKey: input.operationKey,
      })
      .returning({ id: teachingSlotOverridesTable.id });
    return { existed: false, id: row.id };
  });
}

/** Dropdown source for signup (§3.1): tenant schools (id, name). */
export async function listTenantSchools(
  tenantId: string,
): Promise<Array<{ id: string; name: string }>> {
  return withTenant(tenantId, async (tx) =>
    tx
      .select({ id: schoolsTable.id, name: schoolsTable.name })
      .from(schoolsTable)
      .where(eq(schoolsTable.tenantId, tenantId))
      .orderBy(asc(schoolsTable.name)),
  );
}
