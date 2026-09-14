/**
 * Evidence emission (CORE-14J/K) — the ONLY evidence path is the canonical
 * Evidence Writer (packages/database). No engine-owned evidence store,
 * no second source of truth.
 * Engine -> Measurements -> Evidence Writer -> Evidence.
 * The writer is injectable for tests; default is the canonical recordEvidence.
 */
import type { RecordEvidenceInput } from "@workspace/db";
import { curriculumEvidenceLink } from "@workspace/curriculum";
import type { ActivityPolicy, AttemptContext, ComparisonDiff, DictationMeasurements } from "./contracts.js";
import { assertDictationContext } from "./context.js";
import { DICTATION_MEASUREMENT_SOURCE } from "./inference.js";

export type EvidenceWriterLike = (input: RecordEvidenceInput) => Promise<unknown>;

/**
 * Canonical writer via LAZY dynamic import: the database client is only loaded
 * when the writer is actually invoked (runtime). Tests inject their own writer,
 * so importing the engine never requires DATABASE_URL at module scope.
 */
const canonicalWriter: EvidenceWriterLike = async (input) => {
  const mod = await import("@workspace/db");
  return mod.recordEvidence(input);
};

export interface RecordDictationEvidenceArgs {
  readonly attempt: AttemptContext;
  readonly measurements: DictationMeasurements;
  readonly policy: ActivityPolicy;
  readonly diffs: readonly ComparisonDiff[];
  readonly evidenceWriter?: EvidenceWriterLike;
}

export interface RecordedEvidence {
  readonly evidenceInput: RecordEvidenceInput;
  readonly evidence: unknown;
}

export async function recordDictationEvidence(args: RecordDictationEvidenceArgs): Promise<RecordedEvidence> {
  assertDictationContext(args.attempt.tenantId, args.attempt.studentId);
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
    durationMs: args.measurements.responseTimeMs,
    sourceEngine: "dictation-engine",
    tool: "dictation-engine/1.0",
    response: args.measurements,
    metadata: {
      language: args.policy.language,
      inputType: args.policy.inputType,
      responseType: args.policy.responseType,
      responseSource: args.policy.responseSource,
      replayCount: args.attempt.replayCount,
      source: DICTATION_MEASUREMENT_SOURCE,
      curriculum: link ?? undefined,
      diffs: args.diffs.slice(0, 200).map((d) => ({
        kind: d.kind,
        expectedToken: d.expectedToken,
        actualToken: d.actualToken,
        position: d.position,
        confidence: d.confidence,
      })),
    },
    operationKey: `dictation:attempt:${args.attempt.attemptId}`,
  };
  const evidence = await writer(evidenceInput);
  return { evidenceInput, evidence };
}
