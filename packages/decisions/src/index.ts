/**
 * CORE-08 — @workspace/decisions
 * Canonical Teacher Decision capability (Core Platform).
 * Single decision path: Proposal → Teacher Review → APPROVED/MODIFIED/REJECTED
 * → Delivery Authorization → Delivery → Outcome. No second decision system.
 */
export {
  applyTeacherDecision,
  decisionOperationKey,
  issueDeliveryAuthorization,
  assertDeliveryAuthorized,
  toDecisionContract,
  type TeacherDecision,
  type TeacherDecisionAction,
  type ApplyDecisionResult,
} from "./decisions.js";
export { DECISION_STATES, assertValidDecisionTransition, type DecisionState } from "./state-machine.js";
export { DECISION_ROLES, assertActorCanDecide } from "./rbac.js";
export type { DeliveryAuthorization, TeacherDecisionContract } from "./contract.js";
