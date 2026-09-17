/**
 * packages/database — single source of truth for the database.
 * (ARCHITECTURE_CONTRACT.md §6 Data Ownership.)
 * Exposes the UNIFIED client + UNIFIED schema only.
 * Legacy engine reading schema is reachable via the transitional engine shim.
 */
export * from "./client.js";
export { withTenant, isValidTenantId, TenantContextError } from "./tenancy.js";
export * from "./schema/index.js";
export { recordEvidence } from "./evidence/evidence-writer.js";
export type { RecordEvidenceInput } from "./evidence/evidence-writer.js";
export { listEvidenceForStudent, countEvidenceForStudent, getEvidenceChain, findEvidenceByOperationKey } from "./evidence/evidence-reader.js";
export type { EvidenceQuery } from "./evidence/evidence-reader.js";
export { OWNERSHIP } from "./evidence/ownership.js";
// CORE-21 — Learning Delivery & Activity Foundation (reference-only contracts + delivery capability).
export { KNOWN_ACTIVITY_TYPES, ASSIGNMENT_SOURCES, submissionOperationKey } from "./activity/contracts.js";
export type { ActivityType, AssignmentSource, ActivityCurriculumAnchor, ActivityDefinition, ActivityAssignment, ActivityAttemptContext } from "./activity/contracts.js";
export { validateActivityDefinition, isAssessmentActivity, assignActivity, assertActivityAccess, resolveStudentContext, validateAttempt, attemptEvidenceInput, auditActivityEvent, ActivityAccessError } from "./activity/delivery.js";
export type { AssignActivityInput, ActivityAccessSubject } from "./activity/delivery.js";
// CORE-22 — Learning Content & Exercise Foundation (reference-only; five-layer separation).
export { KNOWN_CONTENT_KINDS, CONTENT_SOURCES, ENGINE_BINDINGS, exerciseSubmissionOperationKey } from "./content/contracts.js";
export type { ContentKind, ContentSource, EngineBinding, ContentCurriculumAnchor, ContentDefinition, ExerciseDefinition, ExpectedResponseConfig } from "./content/contracts.js";
export { validateContentDefinition, validateExerciseDefinition, validateExpectedResponse, assertExerciseCompatibleWithActivity, resolveDictationInput, resolveReadingInput, resolveNumeracyInput, resolveAssessmentInput, contentPolicyRef, checkContentAccessForStudent, ContentFoundationError } from "./content/foundation.js";
export type { ContentAuditFn, DictationExerciseInput, ReadingExerciseInput, NumeracyExerciseInput, AssessmentExerciseInput } from "./content/foundation.js";
// CORE-20 — National Educational Oversight + Aggregation + Access Policy foundation.
export { canAccessContent, DEFAULT_RELIGIOUS_ACCESS_POLICY } from "./oversight/access-policy.js";
export type { ReligiousAccessPolicyConfig, StudentReligiousContext, EducationalAccessContext, CanAccessContentDeps } from "./oversight/access-policy.js";
export { validateStudentLoginContext, LoginContextError } from "./oversight/login-context.js";
export { aggregateEvidence, assertStudentDetailAccess } from "./oversight/aggregation.js";
export { assertParentStudentAccess, listParentChildren } from "./parents/visibility.js";
export type { ParentChildSummary } from "./parents/visibility.js";
export { SENSITIVITY_LEVELS, OVERSIGHT_SCOPE_TYPES, DEFAULT_MIN_AGGREGATION_SIZE, DEFAULT_MIN_SAMPLES_HIGH, DEFAULT_MIN_SAMPLES_MEDIUM } from "./oversight/contracts.js";
export type { AggregateRequest, AggregateResult, AggregateMetric, SensitivityLevel, OversightScopeType, ConfidenceBand, TrendDirection, EducationalContentRef, ContentAccessDecision, StudentLoginContextInput, StudentLoginContextResult } from "./oversight/contracts.js";
export { createOrganization, attachParent, ancestorChain, descendantOrganizationIds, createSchool, attachSchoolToOrganization, addStaffMembership, changeStaffScope, endStaffMembership, checkScope } from "./org/organization.js";
export { AuthorizationError as OrgAuthorizationError } from "./org/organization.js";
export { validateOrganizationType, DEFAULT_ORGANIZATION_TYPES, DEFAULT_STAFF_SCOPE_TYPES, MAX_HIERARCHY_DEPTH } from "./org/contracts.js";
export type { CreateOrganizationInput, CreateSchoolInput, StaffMembershipInput, ChangeStaffScopeInput, ScopeCheckInput, ScopeDecision, ResourceRef } from "./org/contracts.js";
export { createIdentity, startMembership, transferStudent, returnStudent, getActiveMembership, getMembershipHistory, createHistoryShare, revokeHistoryShare, assertGrantAuthorized, isSameTenantAccess, AuthorizationError } from "./identity/membership.js";
export type { CreateIdentityInput, CreateIdentityResult, StartMembershipInput, TransferInput, CreateShareInput, HistoryAccessContext, HistoryAccessResult } from "./identity/membership.js";
export type { OwnershipKey, OwnershipOwner } from "./evidence/ownership.js";
export { buildStudentTimeline } from "./slr/slr.js";
export { buildLearnerModel, LEARNER_DIMENSION_REGISTRY } from "./learner/index.js";
export type { LearnerModel, LearnerSubject, LearnerContextSegment, DimensionInterpretation, ExternalInterpretation, Trend, DimensionLevel, InterpretationSource, LearnerModelConfig, DimensionDefinition, BuildLearnerModelArgs } from "./learner/index.js";
export type {
  StudentTimeline,
  SlrEvent,
  ContextSegment,
  SkillStrand,
  StrandProgress,
  StrandIndicator,
  StrandReferences,
  BuildTimelineArgs,
} from "./slr/slr.js";
export { SKILL_REGISTRY, skillDefinitionFor } from "./slr/skills.js";
export type { SkillDefinition } from "./slr/skills.js";

// CORE-23 — Learning Execution & Real Student Learning Flow foundation.
// Reference-only orchestrator: no new tables, no new stores, engines injected.
export { attemptOperationKey, ExecutionError, ATTEMPT_STATES, ATTEMPT_TERMINAL_STATE } from "./execution/contracts.js";
export type { AttemptState, TimeEvidence, ExecutionTenantContext, ExecutionActor, ExecutionErrorCode, ExerciseResolution, EngineMeasureRequest, EngineMeasureResult, EngineMeasureAdapter, EngineAdapterRegistry } from "./execution/contracts.js";
export { applyAttemptEvent, lifecycleStates, validateExecutionContext, assertExecutionAccess, resolveExerciseBinding, assertCurriculumAlignment, assertContentPolicyAllowed, executeAttempt } from "./execution/orchestrator.js";
export type { AttemptEvent, ExecuteAttemptArgs, ExecutionTrace } from "./execution/orchestrator.js";

// CORE-24 / Wave 1 — Persistent Content & Exercise Library (ACR-24/001, ADR-004).
// Definitions ONLY — never Evidence, never attempt results, never student data.
export { createContentDefinition, createExerciseDefinition, publishContent, publishExercise, supersedeContent, supersedeExercise, listContentVersions, listExerciseVersions, getContentDefinition, getExerciseDefinition, searchContent, searchExercises, getPublishedExerciseContract, ContentLibraryError } from "./content/library.js";
export type { CreateContentInput, CreateExerciseInput, SupersedeContentInput, SupersedeExerciseInput, ContentSearchFilters, ExerciseSearchFilters, LibraryCurriculumAnchor } from "./content/library.js";
export { contentDefinitionsTable, exerciseDefinitionsTable } from "./schema/content-library.js";
export type { ContentDefinitionRow, ExerciseDefinitionRow } from "./schema/content-library.js";

// CORE-24 / Wave 2 — Persistent Activity Assignment & Attempt STATE (ACR-24/002, ADR-004).
// Operational/administrative state ONLY — Evidence stays the single canonical learning
// fact; evidence_ref is a POINTER; no measurements/scores/responses are stored here.
export { createAssignment, cancelAssignment, closeAssignment, getAssignment, listAssignments, createAttempt, transitionAttempt, getAttempt, listStudentAttempts, ActivityStateError } from "./activity/state.js";
export type { CreateAssignmentInput, CreateAttemptInput, AttemptTransitionOpts, AssignmentListFilters } from "./activity/state.js";
export { activityAssignmentsTable, activityAttemptsTable } from "./schema/activity-state.js";
export type { ActivityAssignmentRow, ActivityAttemptRow } from "./schema/activity-state.js";

// CORE-24 / Wave 3 — Canonical Auth Application Capability (owner-approved
// AUTH/CONTRACT checkpoint decision, 2026-09-11). ONE owner of session logic;
// HTTP surfaces (/api legacy, /v1 canonical) are thin adapters only.
export { AuthCapabilityError, DbRefreshStore, AUTH_TOKEN_OPTS, issueTokenPair, registerUser, loginWithPassword, refreshSession, logoutSession, requestPasswordReset, resetPasswordWithToken, getCurrentUser, studentLoginWithIdentity, assertStaffScope, getStudentMe } from "./auth/session.js";
export type { SessionUser, TokenPair, RegisterInput, PasswordResetRequestResult } from "./auth/session.js";

// CORE-25 / WAVE-4A — Execution Application Capability (Runtime Productization).
// ONE runtime orchestrator: API → Execution → Activity/Assignment/Attempt →
// Exercise → Engine (INJECTED adapters) → canonical Evidence. Reuses CORE-23
// lifecycle gates + CORE-24 persistent attempts; no second state machine,
// no new tables, no engine imports (dependency inversion preserved).
export { startAttemptExecution, submitAttemptExecution, completeAsyncExecution } from "./execution/runtime.js";
export type { StartAttemptExecutionInput, StartAttemptExecutionResult, SubmitAttemptExecutionInput, SubmitAttemptExecutionResult, AsyncExecutionEnqueuer, PersistentAttempt } from "./execution/runtime.js";

// E1 — Teacher Runtime READ capabilities over Learning-Loop state (intervention_proposals).
// SELECT-only, tenant-scoped; Evidence untouched (single writer invariant preserved).
export { getTeacherProposal, listPendingProposals } from "./teacher/proposals.js";
export type { PendingProposalFilters } from "./teacher/proposals.js";

// E4/P0 — Mastery READ capability over the EXISTING mastery_records table
// (single writer today: reading analyze processor). SELECT-only; the write
// generalization to other engines is ACR-E4-001 (PENDING — not implemented).
export { listMasteryRecords } from "./reading/mastery-read.js";
export type { MasteryRecordView } from "./reading/mastery-read.js";

// PHASE-9 — Principal/Admin oversight READ capabilities (SELECT-only, tenant-scoped via withTenant → RLS).
export { listTenantStaff, listTenantClasses, listTenantUsers, listAuditEvents } from "./principal/admin.js";
export type { StaffRosterRow, ClassSummaryRow, TenantUserRow, AuditEventRow } from "./principal/admin.js";

// PHASE-11 — Engagement capabilities (wallet/points, messages, attendance; ADR-034).
export { getWalletView, creditWallet } from "./engagement/wallet.js";
export type { WalletView, CreditResult } from "./engagement/wallet.js";
export { sendMessage, listMessagesForUser } from "./engagement/messaging.js";
export type { MessageView } from "./engagement/messaging.js";
export { markAttendance, listAttendanceForStaff } from "./engagement/attendance.js";
export { rateStudent, listRatingsForStaff } from "./engagement/ratings.js";
export type { RatingView } from "./engagement/ratings.js";
export type { AttendanceView, AttendanceStatus } from "./engagement/attendance.js";
