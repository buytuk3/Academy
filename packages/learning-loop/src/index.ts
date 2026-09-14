/** CORE-07 — Learning Loop public surface (Core Platform transitional home). */
export {
  detectSignals,
  makeSignalKey,
  skillOf,
  DEFAULT_DETECTION_RULES,
  type DetectionSignal,
  type DetectionKind,
  type DetectionRuleConfig,
  type EvidenceLike,
} from "./detection.js";
export {
  stageDetect,
  createDiagnosis,
  proposeIntervention,
  recordReassessment,
  compareBeforeAfter,
  recordOutcome,
  adaptNextAction,
  runLearningLoop,
  DEFAULT_ADAPT_RULES,
  type DiagnosisInput,
  type ProposalInput,
  type ReassessmentInput,
  type OutcomeInput,
  type ComparisonResult,
  type MetricIndicator,
  type AdaptDecision,
  type AdaptRules,
  type LoopTrace,
} from "./loop.js";
// CORE-08 — single canonical decision path lives in @workspace/decisions (re-exported for compat)
export {
  applyTeacherDecision,
  decisionOperationKey,
  assertDeliveryAuthorized,
  issueDeliveryAuthorization,
  toDecisionContract,
  DECISION_STATES,
  DECISION_ROLES,
  assertActorCanDecide,
  assertValidDecisionTransition,
} from "@workspace/decisions";
export type {
  TeacherDecision,
  TeacherDecisionAction,
  DeliveryAuthorization,
  TeacherDecisionContract,
  ApplyDecisionResult,
  DecisionState,
} from "@workspace/decisions";
