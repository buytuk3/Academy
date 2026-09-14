/**
 * CORE-22 (22-C…22-F, 21-R reuse) — Content & Exercise Foundation capability.
 *
 * Deterministic validation + resolvers ONLY — a reference-only foundation
 * (21-AF gate honored: ZERO new tables; persistence of a content LIBRARY is a
 * future Architecture Change Request). Everything here is:
 *   - deterministic (no AI/LLM — 22 exclusions),
 *   - curriculum-anchored (packages/curriculum references — 21-A),
 *   - privacy-safe (audio NEVER inline — bodyRef only; R-003/R-004),
 *   - policy-aware (religious content gated by CORE-20 canAccessContent),
 *   - idempotency-ready (operationKey helper in contracts).
 *
 * The FIVE-LAYER SEPARATION is enforced here in code:
 *   Content (المادة) — this file validates it; bodies live in caller payloads.
 *   Exercise (المهمة) — binds content(s) to EXACTLY ONE measuring engine.
 *   Activity (السياق) — CORE-21; an exercise binds INTO an activity by reference.
 *   Assignment (المن يفعل) — CORE-21.
 *   Evidence (النتيجة) — canonical writer only; NO results live in content/exercise.
 *
 * Ownership: core-platform ("content-foundation").
 */
import { createLogger, getMetrics, recordSecurityEvent } from "@workspace/observability";
import { canAccessContent } from "../oversight/access-policy.js";
import type { EducationalContentRef } from "../oversight/contracts.js";
import type { StudentReligiousContext } from "../oversight/access-policy.js";
import type {
  ContentDefinition,
  ExerciseDefinition,
  ExpectedResponseConfig,
  EngineBinding,
} from "./contracts.js";
import {
  KNOWN_CONTENT_KINDS,
  CONTENT_SOURCES,
  ENGINE_BINDINGS,
} from "./contracts.js";
import type { ActivityDefinition } from "../activity/contracts.js";

const log = createLogger({ name: "@workspace/db/content" });

export class ContentFoundationError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "ContentFoundationError";
  }
}

/** 21-AJ audit via the EXISTING audit_logs — wired by callers with a tenant row; here we expose reason codes only. */
export type ContentAuditFn = (action: string, entity: "content" | "exercise", entityId: string, metadata?: Record<string, unknown>) => Promise<void>;

// ===== Content validation (22-C) =====

export function validateContentDefinition(c: ContentDefinition): void {
  if (!c.contentId?.trim()) throw new ContentFoundationError("CONTENT_ID_REQUIRED");
  if (!c.tenantId?.trim()) throw new ContentFoundationError("CONTENT_TENANT_REQUIRED");
  if (!c.language?.trim()) throw new ContentFoundationError("CONTENT_LANGUAGE_REQUIRED");
  // Kind: open registry — known kinds are validated, unknown kinds pass through
  // (registry semantics, 21-D parity). Empty kind is still invalid.
  if (!c.kind?.trim()) throw new ContentFoundationError("CONTENT_KIND_REQUIRED");
  const anchor = c.curriculum;
  if (!anchor) throw new ContentFoundationError("CONTENT_CURRICULUM_REQUIRED"); // 21-A/21-O
  for (const [k, v] of Object.entries({ stageKey: anchor.stageKey, gradeLevel: anchor.gradeLevel, subject: anchor.subject, curriculumId: anchor.curriculumId, curriculumVersion: anchor.curriculumVersion })) {
    if (!v || !String(v).trim()) throw new ContentFoundationError(`CONTENT_CURRICULUM_ANCHOR_MISSING:${k}`); // version MANDATORY (21-O)
  }
  // Body: exactly one source — inline text OR body reference. AUDIO media is
  // NEVER inline (R-003/R-004): it must arrive via bodyRef.
  const hasText = typeof c.inlineText === "string" && c.inlineText.trim().length > 0;
  const hasRef = typeof c.bodyRef === "string" && c.bodyRef.trim().length > 0;
  if (hasText === hasRef) throw new ContentFoundationError("CONTENT_BODY_SOURCE_MUST_BE_EXCLUSIVE");
  if (hasRef && typeof c.bodyRef === "string" && c.bodyRef.startsWith("data:")) {
    throw new ContentFoundationError("CONTENT_BODY_INLINE_DATA_FORBIDDEN"); // no media payloads inside contracts
  }
  if (hasText && c.kind === "MEDIA_AUDIO") {
    throw new ContentFoundationError("CONTENT_AUDIO_NEVER_INLINE"); // audio is bodyRef-only, always
  }
  // Source registry
  if (!(CONTENT_SOURCES as readonly string[]).includes(c.source)) throw new ContentFoundationError("CONTENT_SOURCE_INVALID");
  if (c.status !== "DRAFT" && c.status !== "ACTIVE" && c.status !== "RETIRED") throw new ContentFoundationError("CONTENT_STATUS_INVALID");
  if (!Number.isInteger(c.version) || c.version < 1) throw new ContentFoundationError("CONTENT_VERSION_INVALID");
  // Variants are references to a parent content — never embedded copies.
  if (c.variantOf !== undefined && c.variantOf === c.contentId) throw new ContentFoundationError("CONTENT_VARIANT_SELF_REFERENCE");
  // CORE-13 parity: mediaTypes non-empty
  if (!c.mediaTypes || c.mediaTypes.length === 0) throw new ContentFoundationError("CONTENT_MEDIA_TYPES_REQUIRED");
}

// ===== Exercise validation (22-C/21-E) =====

export function validateExerciseDefinition(e: ExerciseDefinition): void {
  if (!e.exerciseId?.trim()) throw new ContentFoundationError("EXERCISE_ID_REQUIRED");
  if (!e.tenantId?.trim()) throw new ContentFoundationError("EXERCISE_TENANT_REQUIRED");
  if (!(ENGINE_BINDINGS as readonly string[]).includes(e.engineBinding)) throw new ContentFoundationError("EXERCISE_ENGINE_BINDING_INVALID");
  if (!e.contentRefs || e.contentRefs.length === 0) throw new ContentFoundationError("EXERCISE_CONTENT_REQUIRED"); // exercise is BUILT on content
  for (const r of e.contentRefs) if (!r?.trim()) throw new ContentFoundationError("EXERCISE_CONTENT_REF_EMPTY");
  const anchor = e.curriculum;
  if (!anchor) throw new ContentFoundationError("EXERCISE_CURRICULUM_REQUIRED");
  for (const [k, v] of Object.entries({ stageKey: anchor.stageKey, gradeLevel: anchor.gradeLevel, subject: anchor.subject, curriculumId: anchor.curriculumId, curriculumVersion: anchor.curriculumVersion })) {
    if (!v || !String(v).trim()) throw new ContentFoundationError(`EXERCISE_CURRICULUM_ANCHOR_MISSING:${k}`);
  }
  if (e.status !== "DRAFT" && e.status !== "ACTIVE" && e.status !== "RETIRED") throw new ContentFoundationError("EXERCISE_STATUS_INVALID");
  if (!Number.isInteger(e.version) || e.version < 1) throw new ContentFoundationError("EXERCISE_VERSION_INVALID");
  validateExpectedResponse(e.engineBinding, e.expectedResponse);
}

/** Expected-response config unified across engines (21-P: time never conflated). */
export function validateExpectedResponse(engine: EngineBinding, cfg: ExpectedResponseConfig): void {
  if (!cfg?.type) throw new ContentFoundationError("EXPECTED_RESPONSE_TYPE_REQUIRED");
  const allowed: Record<EngineBinding, string[]> = {
    READING: ["VOICE"],
    DICTATION: ["TYPED", "HANDWRITTEN", "VOICE"], // dictation ResponseType superset
    NUMERACY: ["TYPED", "STEPS", "SELECTION"],
    ASSESSMENT: ["TYPED", "SELECTION", "STEPS"],
  };
  if (!allowed[engine].includes(cfg.type)) {
    throw new ContentFoundationError(`EXPECTED_RESPONSE_TYPE_INCOMPATIBLE:${engine}:${cfg.type}`);
  }
  if (cfg.maxAttempts !== undefined && (!Number.isInteger(cfg.maxAttempts) || cfg.maxAttempts < 1)) {
    throw new ContentFoundationError("EXPECTED_RESPONSE_MAX_ATTEMPTS_INVALID");
  }
  if (cfg.timeLimitMs !== undefined && (!Number.isFinite(cfg.timeLimitMs) || (cfg.timeLimitMs as number) <= 0)) {
    throw new ContentFoundationError("EXPECTED_RESPONSE_TIME_LIMIT_INVALID");
  }
}

// ===== THE SEPARATION ENFORCER (Content ≠ Exercise ≠ Activity ≠ Assessment ≠ Evidence) =====

/**
 * Binds an exercise INTO an activity BY REFERENCE (22-C): compatibility means
 * same tenant + same curriculum chain (subject + curriculumId + version).
 * Nothing is copied; no student data is involved; an exercise never becomes
 * the activity and an activity never carries results.
 */
export function assertExerciseCompatibleWithActivity(exercise: ExerciseDefinition, activity: ActivityDefinition): void {
  if (exercise.tenantId !== activity.tenantId) throw new ContentFoundationError("BINDING_TENANT_MISMATCH");
  const a = activity.curriculum;
  const b = exercise.curriculum;
  for (const [label, x, y] of [
    ["subject", a.subject, b.subject],
    ["curriculumId", a.curriculumId, b.curriculumId],
    ["curriculumVersion", a.curriculumVersion, b.curriculumVersion],
    ["stageKey", a.stageKey, b.stageKey],
    ["gradeLevel", a.gradeLevel, b.gradeLevel],
  ] as const) {
    if (x !== y) throw new ContentFoundationError(`BINDING_CURRICULUM_MISMATCH:${label}`);
  }
}

// ===== Deterministic engine resolvers (22: existing engines ONLY) =====

export interface DictationExerciseInput {
  readonly prompt: { readonly text: string; readonly language: "ar" | "en"; readonly source: "TEACHER_TEXT" | "AUDIO_SOURCE" | "SYSTEM" };
  readonly responseSource: "keyboard" | "handwriting" | "voice";
}
export interface ReadingExerciseInput {
  readonly passageText?: string;      // from READING_TEXT content
  readonly passageRef?: string;       // from MEDIA_AUDIO content (bodyRef)
  readonly language: string;
}
export interface NumeracyExerciseInput {
  readonly task: { readonly expression: string; readonly domain: string; readonly expectedAnswer: string; readonly digitSet?: "western" | "arabic-indic" };
  readonly response: { readonly finalAnswer: string; readonly steps?: unknown };
}
export interface AssessmentExerciseInput {
  readonly assessmentPolicyRef: string; // reference into the Assessment Engine definition — REQUIRED for ASSESSMENT
}

function firstTextContent(contents: ContentDefinition[]): ContentDefinition | undefined {
  return contents.find((c) => typeof c.inlineText === "string" && c.inlineText.trim().length > 0);
}

function dictationLanguage(lang: string): "ar" | "en" {
  return lang.toLowerCase().startsWith("en") ? "en" : "ar";
}

/**
 * Resolves an exercise + its contents into the DICTATION engine input —
 * deterministic, no copies stored, content text flows through as the prompt.
 */
export function resolveDictationInput(exercise: ExerciseDefinition, contents: ContentDefinition[], opts?: { audioSource?: boolean }): DictationExerciseInput {
  if (exercise.engineBinding !== "DICTATION") throw new ContentFoundationError("RESOLVER_ENGINE_MISMATCH:DICTATION");
  const words = contents.filter((c) => c.kind === "WORD_LIST" || c.kind === "READING_TEXT" || c.kind === "MIXED");
  const text = firstTextContent(words);
  if (!text?.inlineText) throw new ContentFoundationError("DICTATION_PROMPT_TEXT_MISSING");
  return {
    prompt: {
      text: text.inlineText,
      language: dictationLanguage(text.language),
      source: opts?.audioSource ? "AUDIO_SOURCE" : (text.source === "TEACHER_CREATED" ? "TEACHER_TEXT" : "SYSTEM"),
    },
    responseSource: exercise.expectedResponse.type === "VOICE" ? "voice" : exercise.expectedResponse.type === "HANDWRITTEN" ? "handwriting" : "keyboard",
  };
}

/** Resolves an exercise + contents into the READING engine/queue path (passage text or audio ref). */
export function resolveReadingInput(exercise: ExerciseDefinition, contents: ContentDefinition[]): ReadingExerciseInput {
  if (exercise.engineBinding !== "READING") throw new ContentFoundationError("RESOLVER_ENGINE_MISMATCH:READING");
  const passage = firstTextContent(contents.filter((c) => c.kind === "READING_TEXT" || c.kind === "MIXED"));
  const audio = contents.find((c) => c.kind === "MEDIA_AUDIO");
  if (!passage?.inlineText && !audio?.bodyRef) throw new ContentFoundationError("READING_MATERIAL_MISSING");
  return {
    passageText: passage?.inlineText,
    passageRef: audio?.bodyRef, // audio stays a REFERENCE (signed-URL territory)
    language: (passage ?? audio)!.language,
  };
}

/** Resolves an exercise + contents into the NUMERACY engine input (expression/expectedAnswer). */
export function resolveNumeracyInput(exercise: ExerciseDefinition, contents: ContentDefinition[]): NumeracyExerciseInput {
  if (exercise.engineBinding !== "NUMERACY") throw new ContentFoundationError("RESOLVER_ENGINE_MISMATCH:NUMERACY");
  const q = firstTextContent(contents.filter((c) => c.kind === "QUESTION_SET" || c.kind === "MIXED"));
  if (!q?.inlineText) throw new ContentFoundationError("NUMERACY_QUESTION_MISSING");
  // content text convention: "expression::expectedAnswer" (e.g. "23*4::92")
  const [expression, expectedAnswer] = q.inlineText.split("::").map((s) => s.trim());
  if (!expression || !expectedAnswer) throw new ContentFoundationError("NUMERACY_QUESTION_MALFORMED");
  return {
    task: { expression, domain: exercise.skill?.split(".")[1] ?? "arithmetic", expectedAnswer, digitSet: exercise.expectedResponse.digitSet },
    response: { finalAnswer: "" }, // the student fills this — empty at definition time
  };
}

/** ASSESSMENT binding: the exercise MUST point at the Assessment Engine's own definition (21-E). */
export function resolveAssessmentInput(exercise: ExerciseDefinition): AssessmentExerciseInput {
  if (exercise.engineBinding !== "ASSESSMENT") throw new ContentFoundationError("RESOLVER_ENGINE_MISMATCH:ASSESSMENT");
  if (!exercise.assessmentPolicyRef) throw new ContentFoundationError("ASSESSMENT_DEFINITION_REF_REQUIRED");
  return { assessmentPolicyRef: exercise.assessmentPolicyRef };
}

// ===== Religious policy at content/exercise boundaries (21-R reuse — CORE-20) =====

/** Content-side classification → CORE-20 policy ref (never student data). */
export function contentPolicyRef(c: ContentDefinition): EducationalContentRef {
  return {
    subject: c.curriculum.subject,
    contentType: c.kind.toLowerCase(),
    religiousContext: c.religiousContext ?? null,
    country: c.curriculum.country,
    educationSystem: c.curriculum.educationSystem,
    stageKey: c.curriculum.stageKey,
    gradeKey: c.curriculum.gradeKey,
    curriculumId: c.curriculum.curriculumId,
    language: c.language,
  };
}

/** Checks content access for a student pathway via CORE-20 policy — audited, reason-codes only. */
export function checkContentAccessForStudent(args: {
  content: ContentDefinition;
  tenantId: string;
  studentReligiousContext?: StudentReligiousContext | null;
  audit?: ContentAuditFn;
}): { decision: "ALLOW" | "DENY"; reason: string } {
  const decision = canAccessContent(
    { tenantId: args.tenantId, studentReligiousContext: args.studentReligiousContext ?? null, stageKey: args.content.curriculum.stageKey, gradeKey: args.content.curriculum.gradeKey },
    contentPolicyRef(args.content),
  );
  void args.audit; // callers wire audit with their tenant-scoped writer
  if (decision.decision === "DENY") {
    recordSecurityEvent(log, getMetrics(), "authorization-failure", {
      tenantId: args.tenantId,
      detail: { reason: `CONTENT_POLICY:${decision.reason}`, contentId: args.content.contentId },
    });
  }
  return decision;
}

void KNOWN_CONTENT_KINDS; // registry parity anchor (kinds validated as open vocabulary)
