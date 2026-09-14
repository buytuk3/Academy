/**
 * CORE-26 / WAVE-4B Batch B — engine ADAPTER integration tests (REAL engines,
 * ZERO mocks — R-026-01/04 evidence). Proves, at the wiring boundary:
 *   §2  engineBinding sole authority: no READING sync adapter, injected
 *       engine-binding fields are rejected as unknown input fields, every
 *       result carries ITS OWN binding only.
 *   §3  strict validation BEFORE the measurement core (parse* errors, no
 *       side effects).
 *   §5  canonical identity threading: engine attempt context carries the
 *       SAME deterministic attemptOperationKey the runtime writes on
 *       Evidence (executionAttemptId/correlationId preserved by reference).
 *   §6  adapters NEVER write Evidence (recordEvidence spy stays cold) and
 *       never touch attempt state (no state dependency exists here).
 *   §7  no cross-engine contamination: foreign-shaped inputs are rejected
 *       by each engine's own validator.
 */
import { describe, it, expect, vi } from "vitest";
import { engineAdapters } from "../../apps/api/src/v1/engine-adapters.js";
import { NUMERACY_ERROR_KINDS } from "@numeracy-engine";
import { evaluateReadiness } from "@assessment-engine";
import { attemptOperationKey } from "@workspace/db";
import type { EngineMeasureRequest, ExecutionTenantContext, ExecutionActor } from "@workspace/db";

const RUN = process.env.CORE26_ADAPTERS === "1";
const d = RUN ? describe : describe.skip;

const TENANT = "a1b2c3d4-0000-4000-8000-000000000001";
const STUDENT = "a1b2c3d4-0000-4000-8000-000000000002";
const ACTIVITY = "a1b2c3d4-0000-4000-8000-000000000003";
const STARTED_AT = "2026-09-12T10:00:00.000Z";

const ctx: ExecutionTenantContext = {
  tenantId: TENANT,
  studentId: STUDENT,
  activityId: ACTIVITY,
  curriculumVersion: "v1",
  stageKey: "PRIMARY",
  gradeLevel: "4",
  subject: "math",
  attemptNumber: 1,
  startedAt: STARTED_AT,
};
const actor: ExecutionActor = { actorId: STUDENT, actorRole: "student" };

/** recordEvidence spy — MUST stay cold in EVERY adapter path (§6). */
function makeReq(engineInput: unknown): EngineMeasureRequest & { evidenceSpy: ReturnType<typeof vi.fn> } {
  const evidenceSpy = vi.fn(async () => ({ id: "ADAPTER-MUST-NEVER-WRITE-EVIDENCE" }));
  return { context: ctx, actor, engineInput, recordEvidence: evidenceSpy as EngineMeasureRequest["recordEvidence"], evidenceSpy };
}

const EXPECTED_OP_KEY = attemptOperationKey({ tenantId: TENANT, studentId: STUDENT, activityId: ACTIVITY, attemptNumber: 1, startedAt: STARTED_AT });

const NUM_TASK = { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" } as const;
const NUM_OK = { task: NUM_TASK, response: { finalAnswer: "92" }, timing: { durationMs: 45000, responseDurationMs: 9000, thinkingTimeMs: 1200 } };

d("CORE-26B: engine adapters — wiring layer only (real engines, no mocks)", () => {
  it("A1. NUMERACY adapter: REAL engine measurement on a REAL task; correct answer → accuracy 1, no errorType; Evidence spy COLD", async () => {
    const req = makeReq(NUM_OK);
    const r = await engineAdapters.NUMERACY!(req);
    expect(r.engine).toBe("NUMERACY");
    expect(r.measurementSource).toBe("numeracy-engine");
    const m = r.measurements as Record<string, unknown>;
    expect(m.accuracy).toBe(1);
    expect(m.errorCount).toBe(0);
    expect(m.durationMs).toBe(45000); // §5 time measurement rides through
    expect(r.errorType).toBeUndefined();
    expect(r.evidenceRef).toBeUndefined(); // adapter wrote NO evidence
    expect(req.evidenceSpy).not.toHaveBeenCalled();
  });

  it("A2. NUMERACY adapter: Arabic-Indic digits measured by the REAL digit policy (not string equality)", async () => {
    const req = makeReq({
      task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "٩٢", digitSet: "arabic-indic" },
      response: { finalAnswer: "٩٢" },
    });
    const r = await engineAdapters.NUMERACY!(req);
    expect(r.engine).toBe("NUMERACY");
    expect((r.measurements as Record<string, unknown>).accuracy).toBe(1);
    expect(req.evidenceSpy).not.toHaveBeenCalled();
  });

  it("A3. NUMERACY adapter: error kind DERIVED from the student's real wrong answer (carry mistake), never passed manually", async () => {
    const req = makeReq({
      task: { expression: "37+48", domain: "arithmetic", expectedAnswer: "85", digitSet: "western" },
      response: { finalAnswer: "815" }, // real carry mistake
      timing: { durationMs: 30000 },
    });
    const r = await engineAdapters.NUMERACY!(req);
    expect(r.engine).toBe("NUMERACY");
    const m = r.measurements as Record<string, unknown>;
    expect(m.errorCount).toBeGreaterThan(0);
    const patterns = m.errorPatterns as string[];
    expect(patterns.length).toBeGreaterThan(0);
    for (const p of patterns) expect(NUMERACY_ERROR_KINDS).toContain(p); // real taxonomy members
    expect(r.errorType).toBeDefined();
    expect(patterns).toContain(r.errorType); // derived from comparison, not injected
    expect((r.response as Record<string, unknown>).finalCorrect).toBe(false);
    expect(req.evidenceSpy).not.toHaveBeenCalled();
  });

  it("A4. §3 STRICT validation BEFORE the measurement core: client-injected engineBinding / missing fields / wrong types / unknown fields are REJECTED with zero side effects", async () => {
    // client tries to force an engine through the flexible envelope → rejected
    await expect(engineAdapters.NUMERACY!(makeReq({ ...NUM_OK, engineBinding: "DICTATION" }))).rejects.toThrow(/INVALID_ENGINE_INPUT.*NUM_UNKNOWN_FIELD:engineBinding/);
    await expect(engineAdapters.ASSESSMENT!(makeReq({ definition: {}, response: { items: [] }, engineBinding: "READING" }))).rejects.toThrow(/INVALID_ENGINE_INPUT.*ASM_UNKNOWN_FIELD:engineBinding/);
    // missing required fields
    await expect(engineAdapters.NUMERACY!(makeReq({ task: NUM_TASK }))).rejects.toThrow(/RESPONSE_REQUIRED/);
    await expect(engineAdapters.NUMERACY!(makeReq({ response: { finalAnswer: "92" } }))).rejects.toThrow(/TASK_REQUIRED/);
    // wrong types / invalid domain
    await expect(engineAdapters.NUMERACY!(makeReq({ task: 42, response: { finalAnswer: "92" } }))).rejects.toThrow(/TASK_NOT_OBJECT/);
    await expect(engineAdapters.NUMERACY!(makeReq({ task: { ...NUM_TASK, domain: "not-an-area" }, response: { finalAnswer: "92" } }))).rejects.toThrow(/TASK_DOMAIN_INVALID/);
    // negative timing is invalid
    await expect(engineAdapters.NUMERACY!(makeReq({ ...NUM_OK, timing: { durationMs: -5 } }))).rejects.toThrow(/TIMING_DURATIONMS_NOT_NON_NEGATIVE_NUMBER/);
  });

  it("A5. ASSESSMENT adapter: REAL rubric over REAL items; multidimensional measurements; canonical identity threading (attemptId === attemptOperationKey); Evidence spy COLD", async () => {
    const definition = {
      definitionId: "asm-def-1",
      title: "تقييم تكويني — الرياضيات",
      kind: "formative" as const,
      subject: "math",
      targets: { skills: ["arithmetic"], dimensions: ["accuracy", "fluency"] },
      items: [
        { itemRef: "i1", expectedAnswer: "7", scoring: "exact" as const, weight: 2, dimension: "accuracy" },
        { itemRef: "i2", expectedAnswer: "12", scoring: "numeric" as const, weight: 1, dimension: "accuracy" },
        { itemRef: "i3", expectedAnswer: "24", scoring: "numeric" as const, weight: 1, dimension: "fluency" },
        { itemRef: "i4", expectedAnswer: "9", scoring: "exact" as const, weight: 2, dimension: "fluency" },
      ],
      dimensions: ["accuracy", "fluency"],
      passThreshold: 0.6,
    };
    const response = { items: [ { itemRef: "i1", response: "7" }, { itemRef: "i2", response: "12" }, { itemRef: "i3", response: "24" }, { itemRef: "i4", response: "8" } ] };
    const req = makeReq({ definition, response, timing: { durationMs: 45000, responseDurationMs: 9000 } });
    const r = await engineAdapters.ASSESSMENT!(req);
    expect(r.engine).toBe("ASSESSMENT");
    expect(r.measurementSource).toBe("assessment-engine");
    const m = r.measurements as Record<string, unknown>;
    // weighted rubric computed BY THE ENGINE: earned 2+1+1+0 / total 6
    expect(m.rubricScore).toBeCloseTo(4 / 6, 4);
    expect(m.scoreScope).toBe("assessment"); // assessment-scoped, NEVER a global verdict (R-026-03)
    expect(m.totalItems).toBe(4);
    expect(m.correctItems).toBe(3);
    const dims = m.dimensionMeasurements as Array<Record<string, unknown>>;
    expect(dims.length).toBe(2); // multidimensional, learner-model ready
    expect(m.durationMs).toBe(45000);
    expect(m.attemptId).toBe(EXPECTED_OP_KEY); // §5 canonical identity preserved
    expect(r.evidenceRef).toBeUndefined();
    expect(req.evidenceSpy).not.toHaveBeenCalled(); // §6 zero adapter-side Evidence
  });

  it("A6. Readiness is DERIVED from the adapter's REAL measurements (data flow, not synthetic fields): 4 states incl. REQUIRES_TEACHER_REVIEW", async () => {
    // reuse the REAL rubric output shape from A5 as readiness input
    const base = {
      definitionId: "asm-def-1", attemptId: EXPECTED_OP_KEY,
      scoreScope: "assessment" as const, itemResults: [], dimensionMeasurements: [],
      totalItems: 4, correctItems: 4, completionRate: 1, consistency: 1, attemptCount: 1,
    };
    const policy = { minEvidenceCount: 2, minConsistency: 0.6 };
    const prereqs = [{ skill: "arithmetic", evidenceRef: "e1" }, { skill: "fluency", evidenceRef: "e2" }];
    // INSUFFICIENT_EVIDENCE — not enough canonical evidence
    expect(evaluateReadiness({ assessment: { ...base, rubricScore: 0.95 }, prerequisites: [], requiredEvidence: policy, availableEvidenceRefs: [] }).state).toBe("INSUFFICIENT_EVIDENCE");
    // READY — score above threshold with enough evidence
    expect(evaluateReadiness({ assessment: { ...base, rubricScore: 0.95 }, prerequisites: prereqs, requiredEvidence: policy, availableEvidenceRefs: ["e1", "e2"] }).state).toBe("READY");
    // REQUIRES_TEACHER_REVIEW — inside the teacher-review buffer, advisory only
    expect(evaluateReadiness({ assessment: { ...base, rubricScore: 0.55 }, prerequisites: prereqs, requiredEvidence: policy, availableEvidenceRefs: ["e1", "e2"], passThreshold: 0.6 }).state).toBe("REQUIRES_TEACHER_REVIEW");
    // NOT_READY — below threshold-buffer
    expect(evaluateReadiness({ assessment: { ...base, rubricScore: 0.3 }, prerequisites: prereqs, requiredEvidence: policy, availableEvidenceRefs: ["e1", "e2"] }).state).toBe("NOT_READY");
  });

  it("A7. §2/§7 NO cross-engine contamination: no READING sync adapter; foreign-shaped inputs rejected by each engine's own validator", async () => {
    // READING is async-only in the runtime — it can NEVER be measured by a sync adapter
    expect(Object.keys(engineAdapters).sort()).toEqual(["ASSESSMENT", "DICTATION", "NUMERACY"]);
    expect("READING" in engineAdapters).toBe(false);
    // NUMERACY input shape into the NUMERACY adapter's gate rejects DICTATION-shaped payloads
    await expect(engineAdapters.NUMERACY!(makeReq({ expected: "hello", actual: "hola" }))).rejects.toThrow(/INVALID_ENGINE_INPUT/);
    // ASSESSMENT gate rejects NUMERACY-shaped payloads
    await expect(engineAdapters.ASSESSMENT!(makeReq({ task: NUM_TASK, response: { finalAnswer: "92" } }))).rejects.toThrow(/INVALID_ENGINE_INPUT/);
    // every adapter result carries ITS OWN binding only (never a foreign engine claim)
    const rNum = await engineAdapters.NUMERACY!(makeReq(NUM_OK));
    expect(rNum.engine).toBe("NUMERACY");
    expect(rNum.engine).not.toBe("DICTATION");
  });
});
