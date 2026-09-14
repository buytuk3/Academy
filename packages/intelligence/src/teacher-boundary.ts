/**
 * CORE-11 - THE canonical Teacher Decision Boundary, REUSED.
 * This file only re-exports @workspace/decisions - it implements NO decision
 * logic of its own. There is exactly one decision system in the platform
 * (CORE-08) and Teacher Intelligence is a consumer of it.
 */
export { applyTeacherDecision, issueDeliveryAuthorization, assertDeliveryAuthorized, assertActorCanDecide } from "@workspace/decisions";
export type { TeacherDecision, TeacherDecisionAction, DeliveryAuthorization, TeacherDecisionContract, ApplyDecisionResult, DecisionState } from "@workspace/decisions";
