/**
 * CORE-16 — Evidence emission. The ONLY evidence path is the canonical
 * Evidence Writer (packages/database). No assessment-owned-store store,
 * no assessment-owned-store, no assessment-owned-store, no second SLR.
 * Writer is injectable for tests; default is the canonical recordEvidence
 * via LAZY dynamic import (no DB client at module scope).
 */
import type { RecordEvidenceInput } from "@workspace/db";
import { curriculumEvidenceLink } from "@workspace/curriculum";
import type { AssessmentAttemptContext, AssessmentDefinition, AssessmentMeasurements } from "./contracts.js";
import { assertAssessmentContext } from "./context.js";
import { ASSESSMENT_MEASUREMENT_SOURCE } from "./inference.js";

export type EvidenceWriterLike = (input: RecordEvidenceInput) => Promise<unknown>;

const canonicalWriter: EvidenceWriterLike = async (input) => {
  const mod = await import("@workspace/db");
  return mod.recordEvidence(input);
};

export interface RecordAssessmentEvidenceArgs {
  readonly definition: AssessmentDefinition;
  readonly attempt: AssessmentAttemptContext;
  readonly measurements: AssessmentMeasurements;
  readonly evidenceWriter?: EvidenceWriterLike;
}

export interface RecordedEvidence {
  readonly evidenceInput: RecordEvidenceInput;
  readonly evidence: unknown;
}

export async function recordAssessmentEvidence(args: RecordAssessmentEvidenceArgs): Promise<RecordedEvidence> {
  assertAssessmentContext(args.attempt.tenantId, args.attempt.studentId);
  const link = args.attempt.curriculum !== undefined ? curriculumEvidenceLink(args.attempt.curriculum) : undefined;
  const writer = args.evidenceWriter ?? canonicalWriter;
  const evidenceInput: RecordEvidenceInput = {
    tenantId: args.attempt.tenantId,
    studentId: args.attempt.studentId,
    actorId: args.attempt.actorId ?? args.attempt.studentId,
    actorRole: args.attempt.actorRole ?? "student",
    occurredAt: new Date(args.attempt.submittedAt),
    evidenceType: "assessment",
    subject: link?.subject ?? args.definition.subject,
    grade: link?.grade,
    curriculumBook: link?.bookId,
    unitId: link?.unitId,
    lessonId: link?.lessonId,
    objectiveId: link?.objectiveId,
    activityId: args.attempt.activityId,
    sessionId: args.attempt.sessionId,
    attemptId: args.attempt.attemptId,
    result: String(args.measurements.rubricScore),
    durationMs: args.measurements.durationMs,
    sourceEngine: "assessment-engine",
    tool: "assessment-engine/1.0",
    response: args.measurements,
    metadata: {
      definitionId: args.definition.definitionId,
      kind: args.definition.kind,
      scoreScope: args.measurements.scoreScope,
      dimensions: args.definition.dimensions,
      time: {
        thinkingTimeMs: args.measurements.thinkingTimeMs ?? null,
        responseDurationMs: args.measurements.responseTimeMs ?? null,
        attemptCount: args.measurements.attemptCount,
      },
      source: ASSESSMENT_MEASUREMENT_SOURCE,
      curriculum: link ?? undefined,
      previousEvidenceRefs: args.attempt.previousEvidenceRefs ?? [],
      priorContext: args.attempt.priorContext ?? undefined,
    },
    operationKey: `assessment:attempt:${args.attempt.attemptId}`,
  };
  const evidence = await writer(evidenceInput);
  return { evidenceInput, evidence };
}
