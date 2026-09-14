/**
 * CORE-08 — Teacher Decision Contract (Canonical, Core Platform).
 *
 * A teacher decision is a DOMAIN capability, not a table of evidence. The
 * contract below is the single canonical shape for every human decision in
 * the platform:
 *
 *   Proposal → Evidence → Teacher Review → APPROVED | MODIFIED | REJECTED
 *            → Delivery Authorization → Delivery → Outcome / Reassessment
 *
 * PENDING is NOT approval and can never auto-transition to delivery.
 * The learner profile stays multidimensional: this contract NEVER carries an
 * overall student score.
 */
import type { DecisionState } from "./state-machine.js";

export interface DeliveryAuthorization {
  /** stable id: `delivery:{proposalId}:{decisionId}` */
  authorizationId: string;
  decisionId: string;
  proposalId: string;
  tenantId: string;
  studentId: string;
  /** the FINAL approved plan's activity — after any teacher modification */
  activityType: string;
  grantedBy: { actorId: string; actorRole: string };
  grantedAt: string; // ISO-8601
}

export interface TeacherDecisionContract {
  decisionId: string;
  tenantId: string;
  studentId: string;
  proposalId: string;
  actorId: string;
  actorRole: string;
  decision: DecisionState; // PENDING | APPROVED | MODIFIED | REJECTED
  occurredAt: string; // decisionAt (time evidence is preserved)
  reason?: string;
  modifications?: Record<string, unknown>; // teacherModification (originalProposal stays untouched)
  evidenceRefs: string[]; // refs to canonical evidence the decision relied on — never copies
  deliveryAuthorization: DeliveryAuthorization | null;
}
