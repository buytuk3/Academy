/**
 * CORE-22 — Learning Content & Exercise Foundation. Contracts.
 *
 * THE FIVE-LAYER SEPARATION (owner decision — the platform's most important):
 *
 *   Content   = المادة نفسها (نص القراءة، قائمة الكلمات، الأسئلة، الوسائط)
 *   Exercise  = المهمة التعليمية المبنية على المحتوى (مرتبطة بمحرك قياس)
 *   Activity  = السياق التعليمي الذي يُقدَّم للطالب (CORE-21)
 *   Assignment= من يؤدي النشاط ومتى وتحت أي صلاحية (CORE-21)
 *   Attempt   = محاولة الطالب (CORE-21)
 *   Evidence  = ما تعلمناه من المحاولة (الكاتب القانوني — CORE-05)
 *
 *   Content ≠ Exercise ≠ Activity ≠ Assessment ≠ Evidence — never merged.
 *
 * REFERENCE-ONLY FOUNDATION (21-AF gate, owner-authorized): these contracts
 * are value objects + validation + deterministic resolvers. NO new tables —
 * a persisted content LIBRARY (store/search/reuse across schools) is a future
 * Architecture Change Request. Content bodies live in the definitions passed
 * by callers (teacher-created payloads / curriculum packs) — not in a new DB
 * store at this stage.
 *
 * 21-A: Curriculum remains canonical — every anchor below points into
 * packages/curriculum (structural compatibility, no import: packages/database
 * is a LOWER layer than packages/curriculum).
 *
 * Privacy: audio is NEVER inline (R-003/R-004) — audio lives only as bodyRef
 * (signed-URL territory). Religion rides on content classification for the
 * CORE-20 policy — never on students inside this layer.
 *
 * Ownership: core-platform ("content-foundation"). No UI, no AI generation,
 * no LLM, no microservices (22 exclusions).
 */

/** Open content-kind registry (extensible without core changes). */
export const KNOWN_CONTENT_KINDS = [
  "READING_TEXT",
  "WORD_LIST",
  "QUESTION_SET",
  "MEDIA_AUDIO",
  "MEDIA_IMAGE",
  "INSTRUCTIONS",
  "MIXED",
] as const;
export type ContentKind = string; // open — registry, not a straitjacket

/** Who created the content (21-Q sources: teacher-created / curriculum-required / reassessment / reinforcement). */
export const CONTENT_SOURCES = ["TEACHER_CREATED", "CURRICULUM", "SYSTEM", "REASSESSMENT", "REINFORCEMENT"] as const;
export type ContentSource = (typeof CONTENT_SOURCES)[number];

/** Engine measurement binding — ONLY the existing engines (no new engine). */
export const ENGINE_BINDINGS = ["READING", "DICTATION", "NUMERACY", "ASSESSMENT"] as const;
export type EngineBinding = (typeof ENGINE_BINDINGS)[number];

/** Curriculum chain anchor — structurally compatible with packages/curriculum (CORE-13). */
export interface ContentCurriculumAnchor {
  readonly country?: string;
  readonly educationSystem?: string;
  readonly stageKey: string;          // config reference (19-E)
  readonly gradeLevel: string;
  readonly gradeKey?: string;         // CORE-13 stable grade key
  readonly subject: string;           // SubjectKey (CORE-13)
  readonly curriculumId: string;
  readonly curriculumVersion: string; // MANDATORY — evidence is never reinterpreted under a new version (21-O)
  readonly bookId?: string;
  readonly unitId?: string;
  readonly lessonId?: string;
  readonly objectiveId?: string;
  readonly skill?: string;            // SkillKey
  readonly dimension?: string;        // DimensionKey
}

/**
 * 22-C: THE Content definition — المادة نفسها.
 * Exactly one body source is required: inlineText (small deterministic text)
 * OR bodyRef (media/large material — audio ALWAYS here, never inline).
 */
export interface ContentDefinition {
  readonly contentId: string;
  readonly tenantId: string;               // isolation boundary
  readonly schoolId?: string;              // school-scoped (teacher-created) when defined locally
  readonly kind: ContentKind;
  readonly language: string;               // "ar" | "en" | ... (config data)
  readonly mediaTypes: readonly string[];  // CORE-13 ContentDescriptor parity
  readonly inlineText?: string;            // small text material (prompt/word list/passage/question stems)
  readonly bodyRef?: string;               // media/material REFERENCE (signed-URL territory) — never audio inline
  readonly curriculum: ContentCurriculumAnchor;
  readonly source: ContentSource;          // teacher-created / curriculum / reassessment / reinforcement
  /** Content variants: same learning material, different form (A/B, dialect, difficulty twin). */
  readonly variantOf?: string;             // parent contentId reference — never a copy
  /** CORE-20 content-side religious classification (policy input, not student data). */
  readonly religiousContext?: string | null; // "ISLAMIC" | "CHRISTIAN" | other | null
  readonly status: "DRAFT" | "ACTIVE" | "RETIRED";
  readonly version: number;                // content version — immutable once referenced
  readonly createdBy?: { readonly actorId: string; readonly actorRole: string };
}

/** Expected-response configuration (unified across engines — 21-P non-conflation). */
export interface ExpectedResponseConfig {
  readonly type: "TYPED" | "VOICE" | "HANDWRITTEN" | "SELECTION" | "STEPS";
  readonly digitSet?: "western" | "arabic-indic";   // numeracy display authority
  readonly timeLimitMs?: number;
  readonly maxAttempts?: number;
  readonly replayAllowed?: boolean;                 // listening/reading replay policy
}

/**
 * 22-C: THE Exercise definition — المهمة المبنية على المحتوى.
 * Binds content(s) to EXACTLY ONE measuring engine. Practice-only by default;
 * assessment requires the Assessment Engine's own definition (21-E).
 */
export interface ExerciseDefinition {
  readonly exerciseId: string;
  readonly tenantId: string;
  readonly schoolId?: string;
  readonly engineBinding: EngineBinding;   // which engine measures — nothing else measures
  readonly contentRefs: readonly string[]; // Content references — material is NEVER copied here
  readonly expectedResponse: ExpectedResponseConfig;
  readonly difficulty?: string;            // easy|medium|hard|custom (config)
  readonly skill?: string;                 // SkillKey (CORE-13)
  readonly dimension?: string;             // DimensionKey (CORE-13)
  readonly curriculum: ContentCurriculumAnchor;  // same mandatory version anchor
  /** Assessment ONLY: reference to the Assessment Engine definition (21-E separation). */
  readonly assessmentPolicyRef?: string;
  readonly status: "DRAFT" | "ACTIVE" | "RETIRED";
  readonly version: number;
}

/** Stable idempotency identity of an exercise attempt submission (21-X pattern). */
export function exerciseSubmissionOperationKey(input: {
  tenantId: string; studentId: string; exerciseId: string; attemptNumber: number; startedAt: string;
}): string {
  return `exercise:submit:${input.tenantId}:${input.studentId}:${input.exerciseId}:${input.attemptNumber}:${input.startedAt}`;
}
