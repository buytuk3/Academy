/**
 * CORE-08 — Decision State Machine.
 * Only FOUR states. No invented extra states:
 *   PENDING → APPROVED | MODIFIED | REJECTED  (terminal; PENDING never delivers)
 */
import { ClassifiedError } from "@workspace/observability";

export const DECISION_STATES = ["PENDING", "APPROVED", "MODIFIED", "REJECTED"] as const;
export type DecisionState = (typeof DECISION_STATES)[number];

export function assertValidDecisionTransition(from: DecisionState, to: DecisionState): void {
  if (from !== "PENDING") throw new ClassifiedError("validation", "DECISION_ALREADY_FINAL");
  if (to === "PENDING") throw new ClassifiedError("validation", "DECISION_CANNOT_REMAIN_PENDING");
}
