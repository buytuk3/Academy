/**
 * CORE-21 — Learning Delivery & Activity Foundation. Contracts (21-B…21-E, 21-G, 21-O, 21-Q).
 *
 * CURRICULUM REMAINS CANONICAL (21-A): every reference below points into
 * packages/curriculum (CurriculumContext / ActivityDescriptor / hierarchy
 * keys). No curriculum is created, copied, or reinterpreted here.
 *
 * Activity ≠ Content ≠ Lesson ≠ Assessment (21-B/21-E):
 *   Activity    = WHAT the student does now (this contract)
 *   Assessment  = HOW we judge performance (Assessment Engine owns that)
 *   An Activity MAY be practice-only (no assessment attached).
 *
 * 21-C: reference-only — NO Evidence rows, NO student results, NO curriculum
 * text inside an Activity. 21-G: attempts carry REFERENCES ONLY.
 * 21-O: curriculumVersion is MANDATORY (historical evidence is never
 * reinterpreted under a new curriculum version).
 * 21-D/21-Q: activityType and assignmentSource are OPEN vocabularies —
 * delivery decisions come from Teacher / Learning Loop / Intelligence, never
 * from the Activity itself (no adaptive AI in CORE-21).
 *
 * Ownership: core-platform ("activity-foundation"). No UI, no AI, no
 * microservices, no new event bus, no new evidence store.
 */
// Dependency direction (ARCHITECTURE_CONTRACT): packages/database is a LOWER
// layer than packages/curriculum, so curriculum types are NOT imported here.
// ActivityCurriculumAnchor is STRUCTURAL and must stay type-compatible with
// packages/curriculum's CurriculumContext (checked in tests).

/** 21-D: OPEN activity-type vocabulary (extensible without core changes). */
export const KNOWN_ACTIVITY_TYPES = [
  "READING", "DICTATION", "LISTENING", "WRITING", "SPELLING", "VOCABULARY",
  "GRAMMAR", "MATHEMATICS", "SCIENCE", "COMPREHENSION", "QUESTION",
  "PRACTICE", "ASSESSMENT_ACTIVITY",
] as const;
export type ActivityType = string; // open — KNOWN_ACTIVITY_TYPES is a registry, not a straitjacket

/** 21-Q: who/what drove this delivery. The DECIDER is always external. */
export const ASSIGNMENT_SOURCES = ["teacherAssigned", "recommended", "curriculumRequired", "reassessment", "reinforcement"] as const;
export type AssignmentSource = (typeof ASSIGNMENT_SOURCES)[number];

/** 21-B: the full curriculum chain an activity anchors into (all references). */
export interface ActivityCurriculumAnchor {
  readonly country?: string;
  readonly educationSystem?: string;
  readonly stageKey: string;          // configuration reference (CORE-19 19-E)
  readonly gradeLevel: string;        // contextual grade (e.g. "4")
  readonly gradeKey?: string;         // stable curriculum grade key (CORE-13)
  readonly subject: string;           // SubjectKey (CORE-13)
  readonly curriculumId: string;      // CurriculumVersionRef (CORE-13)
  readonly curriculumVersion: string; // 21-O: MANDATORY
  readonly bookId?: string;
  readonly unitId?: string;
  readonly lessonId?: string;
  readonly objectiveId?: string;
  readonly skill?: string;            // SkillKey (CORE-13)
  readonly dimension?: string;        // DimensionKey (CORE-13)
}

/** 21-C: THE Activity contract. Facts about students NEVER live here. */
export interface ActivityDefinition {
  readonly activityId: string;
  readonly tenantId: string;              // scope context (isolation boundary)
  readonly organizationId?: string;       // 21-N institutional context (reference)
  readonly schoolId?: string;             // school-scoped activity when defined locally
  readonly curriculum: ActivityCurriculumAnchor; // 21-O mandatory version inside
  readonly activityType: ActivityType;    // open vocabulary
  readonly level?: string;                // difficulty/level when defined (config)
  readonly instructionsRef?: string;      // content REFERENCE — never inline content
  readonly expectedResponseType: string;  // e.g. TYPED | VOICE | SELECTION | STEPS
  readonly assessmentPolicyRef?: string;  // 21-E: reference to HOW it may be judged
  readonly status: "DRAFT" | "ACTIVE" | "RETIRED";
  readonly version: number;               // activity version (distinct from curriculum version)
}

/** 21-F/21-M: an assignment (Student|Class|Grade|Stage|School scope, references only). */
export interface ActivityAssignment {
  readonly assignmentId: string;
  readonly tenantId: string;
  readonly activityId: string;            // reference — no activity copy
  readonly assignedTo: {
    readonly studentId?: string;
    readonly classId?: string;
    readonly gradeLevel?: string;
    readonly stageKey?: string;
    readonly schoolId?: string;
  };
  readonly assignedBy: { readonly actorId: string; readonly actorRole: string };
  readonly source: AssignmentSource;      // 21-Q — decision made OUTSIDE the activity
  readonly assignedAt: string;            // ISO-8601
  readonly dueAt?: string;
}

/** 21-G: THE Attempt — references + time evidence, nothing copied. */
export interface ActivityAttemptContext {
  readonly tenantId: string;
  readonly studentId: string;
  readonly identityId?: string;           // reference to the global identity (CORE-18)
  readonly activityId: string;
  readonly assignmentId?: string;         // reference
  readonly lessonId?: string;             // reference
  readonly curriculum: ActivityCurriculumAnchor; // same mandatory version (21-O)
  readonly startedAt: string;             // ISO-8601
  readonly submittedAt?: string;          // ISO-8601
  readonly durationMs?: number;           // 21-P: time AS EVIDENCE
  readonly responseType: string;
  readonly attemptNumber: number;
}

/** 21-X: stable logical identity of a submission (idempotency anchor). */
export function submissionOperationKey(input: {
  tenantId: string; studentId: string; activityId: string; attemptNumber: number; startedAt: string;
}): string {
  return `activity:submit:${input.tenantId}:${input.studentId}:${input.activityId}:${input.attemptNumber}:${input.startedAt}`;
}
