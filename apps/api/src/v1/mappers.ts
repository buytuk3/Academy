/**
 * CORE-24 / Wave 3 — /v1 row→contract mappers.
 * Pure shape adapters (capability rows → OpenAPI-generated response types).
 * NO business rules, NO SQL.
 */
import type {
  ContentResponse,
  ExerciseResponse,
  AssignmentResponse,
  AttemptResponse,
  EvidenceResponse,
  InsightsResponse,
} from "@workspace/api-zod";
import type { ContentDefinitionRow, ExerciseDefinitionRow } from "@workspace/db";
import type { ActivityAssignmentRow, ActivityAttemptRow } from "@workspace/db";
import type { Evidence, LearnerModel } from "@workspace/db";

const iso = (v: Date | null | undefined): string | undefined =>
  v ? new Date(v).toISOString() : undefined;

const isoOrNull = (v: Date | null | undefined): string | null | undefined =>
  v === null || v === undefined ? v : new Date(v).toISOString();

export function toContentResponse(row: ContentDefinitionRow): ContentResponse {
  return {
    id: row.id,
    tenantId: row.tenantId,
    rootContentId: row.rootContentId,
    parentVersionId: row.parentVersionId ?? null,
    version: row.version,
    status: row.status as ContentResponse["status"],
    title: row.title,
    kind: row.kind,
    source: row.source,
    bodyRef: row.bodyRef ?? null,
    language: row.language,
    curriculum: {
      curriculumId: row.curriculumId,
      curriculumVersion: row.curriculumVersion,
      country: row.country ?? undefined,
      educationSystem: row.educationSystem ?? undefined,
      stageKey: row.stageKey,
      gradeKey: row.gradeKey ?? undefined,
      gradeLevel: row.gradeLevel,
      subject: row.subject,
      bookId: row.bookId ?? undefined,
      unitId: row.unitId ?? undefined,
      lessonId: row.lessonId ?? undefined,
      objectiveId: row.objectiveId ?? undefined,
      skill: row.skill ?? undefined,
      dimension: row.dimension ?? undefined,
    },
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    // ACR-E5-001 — additive: real question/activity payload authored by the
    // content owner lives here; the UI renders it verbatim or announces its
    // absence (never fabricates).
    metadata: (row.metadata ?? undefined) as Record<string, unknown> | undefined,
  };
}

export function toExerciseResponse(row: ExerciseDefinitionRow): ExerciseResponse {
  return {
    exerciseId: row.id,
    tenantId: row.tenantId,
    engineBinding: row.engineBinding as ExerciseResponse["engineBinding"],
    contentRefs: row.contentId ? [row.contentId] : [],
    expectedResponse: {
      type: row.expectedResponseType as ExerciseResponse["expectedResponse"]["type"],
      maxAttempts: row.maxAttempts ?? undefined,
      timeLimitMs: row.timeLimitMs ?? undefined,
    },
    curriculum: {
      curriculumId: row.curriculumId,
      curriculumVersion: row.curriculumVersion,
      country: row.country ?? undefined,
      educationSystem: row.educationSystem ?? undefined,
      stageKey: row.stageKey,
      gradeKey: row.gradeKey ?? undefined,
      gradeLevel: row.gradeLevel,
      subject: row.subject,
      bookId: row.bookId ?? undefined,
      unitId: row.unitId ?? undefined,
      lessonId: row.lessonId ?? undefined,
      objectiveId: row.objectiveId ?? undefined,
      skill: row.skill ?? undefined,
      dimension: row.dimension ?? undefined,
    },
    assessmentPolicyRef: row.assessmentRef ?? undefined,
    status: row.status as ExerciseResponse["status"],
    version: row.version,
    // ACR-E5-001 — additive: engine activity payload (e.g. numeracy task with
    // the real expression) for student-facing rendering — read-only pass-through.
    metadata: (row.metadata ?? undefined) as Record<string, unknown> | undefined,
  };
}

export function toAssignmentResponse(row: ActivityAssignmentRow): AssignmentResponse {
  return {
    id: row.id,
    tenantId: row.tenantId,
    activityId: row.activityId,
    activityVersion: row.activityVersion,
    exerciseId: row.exerciseId ?? null,
    curriculumVersion: row.curriculumVersion,
    targetSchoolId: row.targetSchoolId,
    targetStudentId: row.targetStudentId ?? null,
    targetClassId: row.targetClassId ?? null,
    assignedBy: row.assignedBy,
    assignedByRole: row.assignedByRole,
    source: row.source,
    status: row.status as AssignmentResponse["status"],
    dueAt: isoOrNull(row.dueAt),
    createdAt: iso(row.createdAt),
  };
}

export function toAttemptResponse(row: ActivityAttemptRow): AttemptResponse {
  return {
    id: row.id,
    tenantId: row.tenantId,
    studentId: row.studentId,
    assignmentId: row.assignmentId ?? null,
    activityId: row.activityId,
    exerciseId: row.exerciseId ?? null,
    curriculumVersion: row.curriculumVersion,
    attemptNumber: row.attemptNumber,
    state: row.state as AttemptResponse["state"],
    startedAt: isoOrNull(row.startedAt),
    submittedAt: isoOrNull(row.submittedAt),
    durationMs: row.durationMs ?? null,
    evidenceRef: row.evidenceRef ?? null,
    operationKey: row.operationKey,
  };
}

export function toEvidenceResponse(row: Evidence): EvidenceResponse {
  return {
    id: row.id,
    tenantId: row.tenantId,
    studentId: row.studentId,
    evidenceType: row.evidenceType,
    subject: row.subject ?? null,
    occurredAt: new Date(row.occurredAt).toISOString(),
    sourceEngine: row.sourceEngine,
    activityId: row.activityId ?? null,
    confidence: row.confidence ?? null,
    durationMs: row.durationMs ?? null,
  };
}

/** IntelligenceInsight → contract item (Decision Gate untouched — read-only). */
export function toInsightItem(i: {
  id: string;
  signal: string;
  confidence: number;
  explanation: string;
  evidenceRefs: string[];
  recommendation: unknown;
}): InsightsResponse["items"][number] {
  return {
    id: i.id,
    signal: i.signal,
    confidence: i.confidence,
    explanation: i.explanation,
    evidenceRefs: i.evidenceRefs,
    recommendation: (i.recommendation ?? null) as Record<string, unknown> | null,
  };
}

export const pagination = (q: { limit?: string; offset?: string }): { limit?: number; offset?: number } => ({
  limit: q.limit !== undefined ? Math.max(1, Math.min(200, parseInt(q.limit, 10) || 50)) : undefined,
  offset: q.offset !== undefined ? Math.max(0, parseInt(q.offset, 10) || 0) : undefined,
});

// ===== E3/P0 — Student Progress (SLR timeline) + Recommendations (learning path) =====
// Pure shape adapters over canonical READ-ONLY capabilities: dates → ISO;
// multidimensional strands ONLY — no overallScore anywhere in the response.
export interface ProgressResponse {
  tenantId: string;
  studentId: string;
  builtAt: string;
  contexts: Array<{ subject: string | null; grade: string | null; curriculumBook: string | null; from: string; to: string; evidenceCount: number }>;
  strands: Array<{
    subject: string;
    label: string;
    dimensions: string[];
    references: { evidenceIds: string[]; assessmentIds: string[]; diagnosisIds: string[]; interventionIds: string[]; masteryIds: string[]; outcomeIds: string[] };
    progress: { evidenceCount: number; firstOccurredAt: string | null; lastOccurredAt: string | null; trend: string; indicators: Array<{ metric: string; values: number[]; latest: number | null }> };
  }>;
  events: Array<{ evidenceId: string; occurredAt: string; evidenceType: string; subject: string | null; action: string | null; inResponseToId: string | null }>;
}

export function toProgressResponse(t: {
  tenantId: string;
  studentId: string;
  builtAt: Date;
  contexts: Array<{ subject: string | null; grade: string | null; curriculumBook: string | null; from: Date; to: Date; evidenceCount: number }>;
  strands: Array<{ subject: string; label: string; dimensions: string[]; references: { evidenceIds: string[]; assessmentIds: string[]; diagnosisIds: string[]; interventionIds: string[]; masteryIds: string[]; outcomeIds: string[] }; progress: { evidenceCount: number; firstOccurredAt: Date | null; lastOccurredAt: Date | null; trend: "up" | "down" | "flat" | "insufficient"; indicators: Array<{ metric: string; values: number[]; latest?: number }> } }>;
  events: Array<{ evidenceId: string; occurredAt: Date; evidenceType: string; subject: string | null; action: string | null; inResponseToId: string | null }>;
}): ProgressResponse {
  return {
    tenantId: t.tenantId,
    studentId: t.studentId,
    builtAt: new Date(t.builtAt).toISOString(),
    contexts: t.contexts.map((c) => ({ subject: c.subject, grade: c.grade, curriculumBook: c.curriculumBook, from: new Date(c.from).toISOString(), to: new Date(c.to).toISOString(), evidenceCount: c.evidenceCount })),
    strands: t.strands.map((s) => ({
      subject: s.subject,
      label: s.label,
      dimensions: s.dimensions,
      references: s.references,
      progress: {
        evidenceCount: s.progress.evidenceCount,
        firstOccurredAt: s.progress.firstOccurredAt ? new Date(s.progress.firstOccurredAt).toISOString() : null,
        lastOccurredAt: s.progress.lastOccurredAt ? new Date(s.progress.lastOccurredAt).toISOString() : null,
        trend: s.progress.trend,
        indicators: s.progress.indicators.map((i) => ({ metric: i.metric, values: i.values, latest: i.latest ?? null })),
      },
    })),
    events: t.events.map((e) => ({ evidenceId: e.evidenceId, occurredAt: new Date(e.occurredAt).toISOString(), evidenceType: e.evidenceType, subject: e.subject, action: e.action, inResponseToId: e.inResponseToId })),
  };
}

export interface RecommendationItemResponse {
  proposalId: string;
  reason: string;
  evidenceRefs: string[];
  currentSkill: string;
  currentDimension: string;
  targetSkill: string;
  targetDimension: string;
  proposedActivityType: string;
  expectedOutcome: string;
  reassessmentCriteria: string;
  confidence: number;
  source: string;
  requiresTeacherApproval: boolean;
}

export function toRecommendationItem(p: RecommendationItemResponse): RecommendationItemResponse {
  return { ...p };
}

// ===== E2 — Learner Model response (READ-ONLY projection over canonical Evidence) =====
// Pure shape adapter over buildLearnerModel output: dates → ISO, no computed fields,
// NO overallScore and NO student_level anywhere (CORE-09 anti-score invariant —
// insufficient evidence stays a first-class value, never a guessed number).
export interface LearnerModelDimensionItem {
  subject: string;
  skill: string;
  dimension: string;
  level: string;
  trend: string;
  interpretationSource: string;
  confidence: number;
  evidenceRefs: string[];
  sampleCount: number;
  recentMean: number | null;
  olderMean: number | null;
  from: string | null;
  to: string | null;
  reason: string;
}

export interface LearnerModelResponse {
  tenantId: string;
  studentId: string;
  builtAt: string;
  interpretationSource: string;
  contexts: Array<{ grade: string | null; curriculumBook: string | null; from: string; to: string; evidenceCount: number }>;
  subjects: Array<{ subject: string; skills: string[]; dimensions: LearnerModelDimensionItem[] }>;
  dimensions: LearnerModelDimensionItem[];
  teacherInterpretations: Array<{ subject: string | null; skill: string | null; dimension: string | null; source: string; evidenceId: string; occurredAt: string; claimedLevel: string | null; value: number | null; confidence: number | null; note: string | null }>;
  aiInterpretations: Array<{ subject: string | null; skill: string | null; dimension: string | null; source: string; evidenceId: string; occurredAt: string; claimedLevel: string | null; value: number | null; confidence: number | null; note: string | null }>;
}

export function toLearnerModelResponse(m: LearnerModel): LearnerModelResponse {
  const dim = (d: LearnerModel["dimensions"][number]): LearnerModelDimensionItem => ({
    subject: d.subject,
    skill: d.skill,
    dimension: d.dimension,
    level: d.level,
    trend: d.trend,
    interpretationSource: d.interpretationSource,
    confidence: d.confidence,
    evidenceRefs: d.evidenceRefs,
    sampleCount: d.sampleCount,
    recentMean: d.recentMean,
    olderMean: d.olderMean,
    from: d.from ? new Date(d.from).toISOString() : null,
    to: d.to ? new Date(d.to).toISOString() : null,
    reason: d.reason,
  });
  const ext = (e: LearnerModel["teacherInterpretations"][number]) => ({
    subject: e.subject,
    skill: e.skill,
    dimension: e.dimension,
    source: e.source,
    evidenceId: e.evidenceId,
    occurredAt: new Date(e.occurredAt).toISOString(),
    claimedLevel: e.claimedLevel,
    value: e.value,
    confidence: e.confidence,
    note: e.note,
  });
  return {
    tenantId: m.tenantId,
    studentId: m.studentId,
    builtAt: new Date(m.builtAt).toISOString(),
    interpretationSource: m.interpretationSource,
    contexts: m.contexts.map((c) => ({
      grade: c.grade,
      curriculumBook: c.curriculumBook,
      from: new Date(c.from).toISOString(),
      to: new Date(c.to).toISOString(),
      evidenceCount: c.evidenceCount,
    })),
    subjects: m.subjects.map((s) => ({ subject: s.subject, skills: s.skills, dimensions: s.dimensions.map(dim) })),
    dimensions: m.dimensions.map(dim),
    teacherInterpretations: m.teacherInterpretations.map(ext),
    aiInterpretations: m.aiInterpretations.map(ext),
  };
}
