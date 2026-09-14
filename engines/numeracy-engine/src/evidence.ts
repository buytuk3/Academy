/**
 * CORE-15 — Evidence emission. The ONLY evidence path is the canonical
 * Evidence Writer (packages/database). No numeracy evidence store, no
 * second source of truth. Engine -> Measurements -> Evidence Writer.
 * Writer is injectable for tests; default is the canonical recordEvidence
 * via LAZY dynamic import (no DB client at module scope).
 */
import type { RecordEvidenceInput } from "@workspace/db";
import { curriculumEvidenceLink } from "@workspace/curriculum";
import type { NumeracyArea, NumeracyAttemptContext } from "./contracts.js";
import type { NumeracyComparisonResult } from "./compare.js";
import type { NumeracyMeasurements } from "./measure.js";
import type { NumeracyActivityPolicy } from "./policies.js";
import { assertNumeracyContext } from "./context.js";
import { NUMERACY_MEASUREMENT_SOURCE } from "./inference.js";

export type EvidenceWriterLike = (input: RecordEvidenceInput) => Promise<unknown>;

const canonicalWriter: EvidenceWriterLike = async (input) => {
  const mod = await import("@workspace/db");
  return mod.recordEvidence(input);
};

export interface RecordNumeracyEvidenceArgs {
  readonly attempt: NumeracyAttemptContext;
  readonly measurements: NumeracyMeasurements;
  readonly policy: NumeracyActivityPolicy;
  readonly comparison: NumeracyComparisonResult;
  readonly area: NumeracyArea;
  readonly evidenceWriter?: EvidenceWriterLike;
}

export interface RecordedEvidence {
  readonly evidenceInput: RecordEvidenceInput;
  readonly evidence: unknown;
}

export async function recordNumeracyEvidence(args: RecordNumeracyEvidenceArgs): Promise<RecordedEvidence> {
  assertNumeracyContext(args.attempt.tenantId, args.attempt.studentId);
  const link = args.policy.curriculum !== undefined ? curriculumEvidenceLink(args.policy.curriculum) : undefined;
  const writer = args.evidenceWriter ?? canonicalWriter;
  const evidenceInput: RecordEvidenceInput = {
    tenantId: args.attempt.tenantId,
    studentId: args.attempt.studentId,
    actorId: args.attempt.actorId ?? args.attempt.studentId,
    actorRole: args.attempt.actorRole ?? "student",
    occurredAt: new Date(args.attempt.submittedAt),
    evidenceType: "attempt",
    subject: link?.subject,
    grade: link?.grade,
    curriculumBook: link?.bookId,
    unitId: link?.unitId,
    lessonId: link?.lessonId,
    objectiveId: link?.objectiveId,
    activityId: args.attempt.activityId,
    sessionId: args.attempt.sessionId,
    attemptId: args.attempt.attemptId,
    result: String(args.measurements.accuracy),
    durationMs: args.measurements.durationMs,
    sourceEngine: "numeracy-engine",
    tool: "numeracy-engine/1.0",
    response: args.measurements,
    metadata: {
      language: args.policy.language,
      digitSet: args.policy.digitSet,
      area: args.area,
      stepAware: args.policy.stepAware,
      finalCorrect: args.comparison.finalCorrect,
      primaryError: args.comparison.primaryError ?? null,
      errorRecords: args.comparison.errorRecords.slice(0, 100).map((r) => ({
        type: r.type,
        position: r.position ?? null,
        expected: r.expected ?? null,
        actual: r.actual ?? null,
        confidence: r.confidence,
        evidenceRef: r.evidenceRef,
      })),
      time: {
        thinkingTimeMs: args.measurements.thinkingTimeMs ?? null,
        responseDurationMs: args.measurements.responseDurationMs ?? null,
        attemptCount: args.measurements.attemptCount,
        hintCount: args.measurements.hintCount ?? null,
        feedbackCount: args.measurements.feedbackCount ?? null,
        retryCount: args.measurements.retryCount ?? null,
      },
      source: NUMERACY_MEASUREMENT_SOURCE,
      curriculum: link ?? undefined,
      feedbackMode: args.policy.feedbackMode ?? "none",
      hintPolicy: args.policy.hintPolicy ?? "none",
    },
    operationKey: `numeracy:attempt:${args.attempt.attemptId}`,
  };
  const evidence = await writer(evidenceInput);
  return { evidenceInput, evidence };
}
