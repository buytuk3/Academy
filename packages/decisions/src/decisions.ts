/**
 * CORE-08 — Canonical Teacher Decision capability (Core Platform).
 *
 * Applies a human decision to an intervention proposal:
 *  - validates actor (RBAC), tenant/student/proposal binding, state machine;
 *  - records the decision as EVIDENCE via recordEvidence() (the ONLY writer —
 *    no decision-specific evidence storage);
 *  - issues a BOUND Delivery Authorization (proposal+student+tenant+activity)
 *    for APPROVED/MODIFIED — this is NOT a general permission for any engine;
 *  - emits InterventionAssigned only on a real authorized transition;
 *  - idempotent: same operation key (teacher:decision:{proposal}:{actor}:{decision})
 *    re-application returns the existing decision — no duplicate decision, no
 *    duplicate evidence, no duplicate event.
 */
import { db, interventionProposalsTable, recordEvidence } from "@workspace/db";
import type { InterventionProposal } from "@workspace/db";
import { publishEvent } from "@workspace/events";
import { ClassifiedError, recordSecurityEvent, createLogger, safeLog, getMetrics } from "@workspace/observability";
import type { LearningEvent } from "@buytuk/contracts";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { assertActorCanDecide } from "./rbac.js";
import { assertValidDecisionTransition } from "./state-machine.js";
import type { DecisionState } from "./state-machine.js";
import type { DeliveryAuthorization, TeacherDecisionContract } from "./contract.js";

const log = createLogger({ name: "teacher-decision" });
type EmitFn = (ev: LearningEvent) => Promise<unknown>;

export type TeacherDecisionAction = "APPROVED" | "MODIFIED" | "REJECTED";

export interface TeacherDecision {
  action: TeacherDecisionAction;
  actorId: string;
  actorRole: string;
  decidedAt?: string;
  reason?: string;
  modifications?: Record<string, unknown>; // teacherModification — original proposal is never replaced
  rejectionReason?: string; // when provided
}

export interface ApplyDecisionResult {
  proposal: InterventionProposal;
  decisionId: string;
  authorization: DeliveryAuthorization | null;
  existed: boolean; // true when the same logical decision was already applied (retry)
}

/** Stable logical identity (CORE-08 idempotency key). */
export function decisionOperationKey(proposalId: string, actorId: string, decision: TeacherDecisionAction): string {
  return `teacher:decision:${proposalId}:${actorId}:${decision}`;
}

function assertSameTenant(expected: string | undefined, actual: string, what: string): void {
  if (expected !== undefined && expected !== actual) {
    recordSecurityEvent(log, getMetrics(), "cross-tenant-attempt", {
      tenantId: actual,
      detail: { what, expectedTenant: expected },
    });
    throw new ClassifiedError("authorization", `CROSS_TENANT_${what.toUpperCase()}`);
  }
}

async function publishSafely(ev: LearningEvent, emitFn?: EmitFn): Promise<void> {
  try {
    await (emitFn ?? publishEvent)(ev);
  } catch (err) {
    log.error(safeLog({ eventType: ev.type, error: err instanceof Error ? err.message : String(err) }), "Event publish failed");
  }
}

export async function applyTeacherDecision(
  input: {
    tenantId: string;
    proposal: InterventionProposal;
    decision: TeacherDecision;
    evidenceRefs?: string[];
  },
  emitFn?: EmitFn,
): Promise<ApplyDecisionResult> {
  const { tenantId, proposal, decision } = input;
  const decisionId = decisionOperationKey(proposal.id, decision.actorId, decision.action);
  const storedDecision = proposal.decision as { id?: string } | null | undefined;

  // Idempotency: same (proposal, actor, action) already applied → return as-is.
  // Retry/network/queue/UI retries must never create a second decision.
  if (storedDecision?.id === decisionId) {
    return {
      proposal,
      decisionId,
      authorization: (proposal.deliveryAuthorization as DeliveryAuthorization | null) ?? null,
      existed: true,
    };
  }

  assertSameTenant(proposal.tenantId, tenantId, "proposal");
  if (!decision.actorId || !decision.actorRole) throw new ClassifiedError("validation", "DECISION_ACTOR_REQUIRED");
  assertActorCanDecide(decision.actorRole);
  assertValidDecisionTransition(proposal.status as DecisionState, decision.action);

  const occurredAt = decision.decidedAt ?? new Date().toISOString();
  const decisionPayload = {
    id: decisionId,
    action: decision.action,
    actorId: decision.actorId,
    actorRole: decision.actorRole,
    decidedAt: occurredAt,
    ...(decision.reason ? { reason: decision.reason } : {}),
    ...(decision.modifications ? { modifications: decision.modifications } : {}),
    ...(decision.rejectionReason ? { rejectionReason: decision.rejectionReason } : {}),
  };
  const finalActivityType =
    decision.action === "MODIFIED"
      ? ((decision.modifications?.activityType as string) ?? proposal.activityType)
      : proposal.activityType;

  // ---- 1) The decision becomes EVIDENCE (canonical chain, CORE-05 writer only) ----
  const evidencePayload = {
    tenantId,
    studentId: proposal.studentId,
    actorId: decision.actorId,
    actorRole: decision.actorRole,
    occurredAt: new Date(occurredAt),
    evidenceType: "decision",
    subject: proposal.skill,
    action: "teacher.decision",
    response: {
      decision: decision.action,
      proposalId: proposal.id,
      diagnosisId: proposal.diagnosisId,
      reason: decision.reason,
      evidenceRefs: input.evidenceRefs ?? [],
      ...(decision.modifications ? { modifications: decision.modifications } : {}),
      ...(decision.rejectionReason ? { rejectionReason: decision.rejectionReason } : {}),
    },
    result: "completed",
    sourceEngine: "core-platform",
    tool: "teacher-decision",
    operationKey: decisionId, // DB-backed dedup on (tenant_id, operation_key)
  };
  await recordEvidence(evidencePayload as never);

  // ---- 2) Proposal state transition ----
  const updates: Record<string, unknown> = {
    status: decision.action,
    decision: decisionPayload,
    decidedAt: new Date(occurredAt),
  };
  if (decision.action === "MODIFIED") updates.activityType = finalActivityType;

  let authorization: DeliveryAuthorization | null = null;
  if (decision.action === "APPROVED" || decision.action === "MODIFIED") {
    // ---- 3) BOUND Delivery Authorization (not a general permission) ----
    authorization = issueDeliveryAuthorization({
      tenantId,
      studentId: proposal.studentId,
      proposalId: proposal.id,
      activityType: finalActivityType,
      decisionId,
      actorId: decision.actorId,
      actorRole: decision.actorRole,
      decidedAt: occurredAt,
    });
    updates.deliveryAuthorization = authorization;
  }
  await db.update(interventionProposalsTable).set(updates).where(eq(interventionProposalsTable.id, proposal.id));

  const merged: InterventionProposal = {
    ...proposal,
    status: decision.action as InterventionProposal["status"],
    decision: decisionPayload,
    decidedAt: new Date(occurredAt),
    ...(decision.action === "MODIFIED" ? { activityType: finalActivityType } : {}),
    ...(authorization ? { deliveryAuthorization: authorization } : {}),
  };

  // ---- 4) Domain event only on a REAL authorized transition ----
  if (decision.action === "APPROVED" || decision.action === "MODIFIED") {
    await publishSafely(
      {
        id: randomUUID(),
        type: "InterventionAssigned",
        version: 1,
        occurredAt: new Date().toISOString(),
        actor: { id: decision.actorId, role: decision.actorRole as "teacher" },
        tenantId,
        studentId: proposal.studentId,
        payload: { interventionId: proposal.id, planId: proposal.id, assignedTo: decision.actorId },
      } as LearningEvent,
      emitFn,
    );
  }

  return { proposal: merged, decisionId, authorization, existed: false };
}

/** ISSUES a delivery authorization bound to proposal+student+tenant+final activity. */
export function issueDeliveryAuthorization(input: {
  tenantId: string;
  studentId: string;
  proposalId: string;
  activityType: string;
  decisionId: string;
  actorId: string;
  actorRole: string;
  decidedAt: string;
}): DeliveryAuthorization {
  return {
    authorizationId: `delivery:${input.proposalId}:${input.decisionId}`,
    decisionId: input.decisionId,
    proposalId: input.proposalId,
    tenantId: input.tenantId,
    studentId: input.studentId,
    activityType: input.activityType,
    grantedBy: { actorId: input.actorId, actorRole: input.actorRole },
    grantedAt: input.decidedAt,
  };
}

/**
 * GATES DELIVERY. APPROVED ≠ general permission: an engine may deliver ONLY
 * when the authorization matches proposal, student, tenant AND the final
 * activity. Any mismatch → authorization failure + security event.
 */
export function assertDeliveryAuthorized(
  delivery: { tenantId: string; studentId: string; proposalId: string; activityType: string },
  auth: DeliveryAuthorization | null | undefined,
): void {
  if (!auth) throw new ClassifiedError("authorization", "DELIVERY_NOT_AUTHORIZED");
  if (
    delivery.tenantId !== auth.tenantId ||
    delivery.studentId !== auth.studentId ||
    delivery.proposalId !== auth.proposalId ||
    delivery.activityType !== auth.activityType
  ) {
    recordSecurityEvent(log, getMetrics(), "authorization-failure", {
      tenantId: delivery.tenantId,
      studentId: delivery.studentId,
      detail: {
        reason: "delivery-authorization-mismatch",
        expected: { proposal: auth.proposalId, student: auth.studentId, tenant: auth.tenantId, activity: auth.activityType },
      },
    });
    throw new ClassifiedError("authorization", "DELIVERY_AUTHORIZATION_MISMATCH");
  }
}

/** Builds the canonical TeacherDecisionContract view from a decision row (traceability). */
export function toDecisionContract(
  proposal: InterventionProposal & { decision?: Record<string, unknown> | null },
  evidenceRefs: string[] = [],
): TeacherDecisionContract {
  const d = proposal.decision as Record<string, unknown> | null | undefined ?? {};
  return {
    decisionId: (d.id as string) ?? "",
    tenantId: proposal.tenantId,
    studentId: proposal.studentId,
    proposalId: proposal.id,
    actorId: (d.actorId as string) ?? "",
    actorRole: (d.actorRole as string) ?? "",
    decision: (d.action as DecisionState) ?? proposal.status,
    occurredAt: (d.decidedAt as string) ?? "",
    reason: d.reason as string | undefined,
    modifications: d.modifications as Record<string, unknown> | undefined,
    evidenceRefs,
    deliveryAuthorization: (proposal.deliveryAuthorization as DeliveryAuthorization | null) ?? null,
  };
}
