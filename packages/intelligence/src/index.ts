/**
 * CORE-10 - Learning Intelligence Foundation (Core Platform).
 * Evidence-backed, explainable, deterministic intelligence over
 * Evidence + Learner Model + Learning Loop. No overall score, no autonomous
 * delivery, no new decision boundary.
 */
export * from "./contracts.js";
export * from "./signals.js";
export * from "./history.js";
export * from "./insights.js";
export * from "./intelligence.js";
export * from "./pattern-contracts.js";
export * from "./student-pattern.js";
export * from "./path-contracts.js";
export * from "./learning-path.js";
// E1 — Teacher Runtime surface (read-only projections + feedback-through-Evidence).
// No new decision boundary: applyTeacherDecision stays the canonical @workspace/decisions path.
export {
  buildTeacherReviewQueue,
  buildTeacherStudentSummary,
  recordTeacherFeedback,
  priorityScoreFor,
  prioritizeInsights,
  type BuildTeacherArgs,
} from "./teacher.js";
export type {
  TeacherReviewItem,
  TeacherReviewKind,
  TeacherFeedbackInput,
  TeacherFeedbackDecision,
  TeacherStudentSummary,
} from "./teacher-contracts.js";
