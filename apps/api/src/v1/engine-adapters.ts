/**
 * CORE-25 / WAVE-4A — Engine adapter registry (wiring layer).
 * CORE-26B / WAVE-4B — NUMERACY + ASSESSMENT adapters added (owner-approved
 * scope, 2026-12-09-12 directive): adapters are a WIRING LAYER ONLY —
 *   • the engine is chosen from the CANONICAL exercise.engineBinding by the
 *     execution runtime; the client can NEVER name or override an engine
 *     (strict validators reject injected engine fields as unknown fields);
 *   • STRICT engine-owned input validation runs BEFORE the measurement core
 *     (parseNumeracyEngineInput / parseAssessmentEngineInput);
 *   • NO Evidence is written here and NO attempt state is touched here — the
 *     canonical Evidence Writer + lifecycle live in execution/runtime.ts;
 *   • attempt/correlation identity is PRESERVED by reference: the engine
 *     attempt context carries the canonical deterministic attemptOperationKey
 *     (the same identity the runtime writes on the Evidence row), and the
 *     tenant/school/student context rides through untouched.
 * CORE-15: the platform NEVER names engines here — each adapter delegates the
 * measurement to its OWN engine (real code, not mocks) and only adapts shapes.
 *   DICTATION  → compareDictation + computeMeasurements (deterministic, sync)
 *   NUMERACY   → analyzeNumeracy (compare → measurements; 16-kind taxonomy)
 *   ASSESSMENT → evaluateAssessment (rubric → multidimensional measurements)
 *   READING    → NO sync adapter: async queue path (enqueueAsync in the runtime).
 * Evidence: the canonical fallback path lives in the execution capability
 * (attemptEvidenceInput + attemptOperationKey); adapters that prefer their
 * engine-owned evidence writer may set result.evidenceRef.
 */
import { compareDictation } from "@dictation-engine/compare";
import { computeMeasurements } from "@dictation-engine/measure";
import { languagePackFor } from "@dictation-engine/language";
import { parseNumeracyEngineInput, analyzeNumeracy } from "@numeracy-engine";
import type { NumeracyActivityPolicy } from "@numeracy-engine";
import { parseAssessmentEngineInput, evaluateAssessment } from "@assessment-engine";
import type { AssessmentAttemptContext } from "@assessment-engine";
import { attemptOperationKey } from "@workspace/db";
import type { EngineAdapterRegistry, EngineMeasureResult } from "@workspace/db";

/** Canonical deterministic attempt identity — SAME key the runtime writes on the Evidence row. */
function canonicalAttemptRef(req: { context: { tenantId: string; studentId: string; activityId: string; attemptNumber: number; startedAt: string } }): string {
  return attemptOperationKey({
    tenantId: req.context.tenantId,
    studentId: req.context.studentId,
    activityId: req.context.activityId,
    attemptNumber: req.context.attemptNumber,
    startedAt: req.context.startedAt,
  });
}

export const engineAdapters: EngineAdapterRegistry = {
  DICTATION: async (req): Promise<EngineMeasureResult> => {
    const input = (req.engineInput ?? {}) as {
      expected?: string;
      actual?: string;
      language?: "ar" | "en";
      timing?: { listeningDurationMs?: number; responseDurationMs?: number; totalActivityDurationMs?: number; replayCount?: number };
    };
    const pack = languagePackFor(input.language ?? "ar");
    const comp = compareDictation(input.expected ?? "", input.actual ?? "", pack);
    const timing = {
      listeningDurationMs: input.timing?.listeningDurationMs,
      responseDurationMs: input.timing?.responseDurationMs,
      totalActivityDurationMs: input.timing?.totalActivityDurationMs
        ?? req.context.time?.activityDurationMs
        ?? req.context.durationMs
        ?? 0,
      replayCount: input.timing?.replayCount ?? 0,
    };
    const measurements = computeMeasurements(comp, timing);
    return {
      engine: "DICTATION",
      measurementSource: "dictation-engine",
      measurements: { ...measurements },
      confidence: measurements.accuracy,
      durationMs: timing.totalActivityDurationMs,
      response: { expected: input.expected, actual: input.actual },
    };
  },

  NUMERACY: async (req): Promise<EngineMeasureResult> => {
    // STRICT engine-owned validation BEFORE the measurement core (CORE-26B §3):
    // unknown fields (incl. any client-injected engine binding) are rejected here.
    const input = parseNumeracyEngineInput(req.engineInput);
    const ctx = req.context;
    // Activity policy is ACTIVITY CONFIG (CORE-15) — defaults are wiring, never engine logic.
    const policy: NumeracyActivityPolicy = {
      language: input.policy?.language ?? "ar",
      digitSet: input.policy?.digitSet ?? "western",
      stepAware: input.policy?.stepAware ?? false,
      ...(input.policy?.estimationTolerance !== undefined ? { estimationTolerance: input.policy.estimationTolerance } : {}),
    };
    const attemptRef = canonicalAttemptRef(req);
    const submittedAt = input.timing?.submittedAt ?? ctx.submittedAt ?? ctx.startedAt;
    const { comparison, measurements } = analyzeNumeracy({
      attempt: {
        attemptId: attemptRef,
        tenantId: ctx.tenantId,
        studentId: ctx.studentId,
        activityId: ctx.activityId,
        occurredAt: submittedAt,
        startedAt: ctx.startedAt,
        submittedAt,
        ...(input.timing?.durationMs !== undefined || ctx.durationMs !== undefined
          ? { durationMs: input.timing?.durationMs ?? ctx.durationMs }
          : {}),
        ...(input.timing?.thinkingTimeMs !== undefined ? { thinkingTimeMs: input.timing.thinkingTimeMs } : {}),
        ...(input.timing?.responseDurationMs !== undefined ? { responseDurationMs: input.timing.responseDurationMs } : {}),
        attemptCount: input.timing?.attemptCount ?? ctx.attemptNumber,
        ...(input.timing?.hintCount !== undefined ? { hintCount: input.timing.hintCount } : {}),
        ...(input.timing?.feedbackCount !== undefined ? { feedbackCount: input.timing.feedbackCount } : {}),
        ...(input.timing?.retryCount !== undefined ? { retryCount: input.timing.retryCount } : {}),
      },
      task: input.task,
      response: input.response,
      policy,
    });
    return {
      engine: "NUMERACY",
      measurementSource: "numeracy-engine",
      // Real engine measurements (16-kind error taxonomy lives INSIDE the engine).
      measurements: { ...measurements },
      confidence: measurements.accuracy,
      durationMs: measurements.durationMs,
      ...(comparison.primaryError ? { errorType: comparison.primaryError.type } : {}),
      response: {
        finalAnswer: input.response.finalAnswer,
        finalCorrect: comparison.finalCorrect,
        primaryError: comparison.primaryError?.type ?? null,
      },
    };
  },

  ASSESSMENT: async (req): Promise<EngineMeasureResult> => {
    // STRICT engine-owned validation BEFORE the rubric core (CORE-26B §3):
    // unknown fields (incl. any client-injected engine binding) are rejected here.
    const input = parseAssessmentEngineInput(req.engineInput);
    const ctx = req.context;
    const attemptRef = canonicalAttemptRef(req);
    const submittedAt = input.timing?.submittedAt ?? ctx.submittedAt ?? ctx.startedAt;
    const attempt: AssessmentAttemptContext = {
      attemptId: attemptRef,
      tenantId: ctx.tenantId,
      studentId: ctx.studentId,
      activityId: ctx.activityId,
      occurredAt: submittedAt,
      startedAt: ctx.startedAt,
      submittedAt,
      ...(input.timing?.durationMs !== undefined || ctx.durationMs !== undefined
        ? { durationMs: input.timing?.durationMs ?? ctx.durationMs }
        : {}),
      ...(input.timing?.thinkingTimeMs !== undefined ? { thinkingTimeMs: input.timing.thinkingTimeMs } : {}),
      ...(input.timing?.responseDurationMs !== undefined ? { responseDurationMs: input.timing.responseDurationMs } : {}),
      attemptCount: input.timing?.attemptCount ?? 1,
    };
    // Rubric scoring + multidimensional measurements — ALL inside the engine.
    const m = evaluateAssessment(input.definition, input.response, attempt);
    return {
      engine: "ASSESSMENT",
      measurementSource: "assessment-engine",
      measurements: { ...m },
      confidence: m.consistency,
      durationMs: m.durationMs,
      response: { definitionId: m.definitionId, rubricScore: m.rubricScore, scoreScope: m.scoreScope },
    };
  },
};
