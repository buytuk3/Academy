/**
 * CORE-27 / Batch 2 — Matrix A: GAP-PROOF tests (A1–A3).
 * Classification: Confirmed Code-Level Gap — Pending Runtime/Data-Shape Proof.
 * These tests are EXPECTED TO FAIL against the current code, each with a
 * declared predicted reason. A failure with the EXACT predicted reason is the
 * evidentiary SUCCESS. An unexpected PASS HALTS the batch (test/reality mismatch).
 *
 * IMPORTANT: this file performs NO fix. It only calls the untouched public
 * functions runLearningLoop / detectSignals and inspects their outputs.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { runLearningLoop, type LoopTrace } from "@workspace/learning-loop";
import type { TeacherDecision } from "@workspace/decisions";
import { makeStudent, evidenceRow, type StudentFixture } from "./_helpers.js";

/** Real teacher decision — APPROVED path so the loop proceeds past the gate. */
const DECISION: TeacherDecision = {
  action: "APPROVED",
  actorId: randomUUID(),
  actorRole: "teacher",
  reason: "c27-batch2-proof",
};

/** EmitFn spy: captures loop events without touching the real outbox. */
const events: unknown[] = [];
const emitSpy = async (ev: unknown) => { events.push(ev); return ev; };

async function expectPredictedFailure(
  id: string,
  predicted: string,
  run: () => Promise<LoopTrace>,
): Promise<{ id: string; predicted: string; actual: string; failedAsPredicted: boolean }> {
  try {
    const trace = await run();
    console.log(`EVIDENCE ${id} UNEXPECTED_PASS trace=${JSON.stringify(trace, null, 2)}`);
    return { id, predicted, actual: `PASSED (stopReason=${trace.stopReason ?? "none"})`, failedAsPredicted: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`EVIDENCE ${id} EXPECTED_FAILURE error=${msg}`);
    return { id, predicted, actual: msg, failedAsPredicted: true };
  }
}

describe("CORE-27 Batch 2 — Matrix A: gap proofs (expected failures)", () => {
  // ────────────────────────────────────────────────────────────────────
  // A1 — R-027-01: numeracy evidence rows are written as evidenceType
  // "attempt" (engines/numeracy-engine/src/evidence.ts:48), while the
  // comparison stage filters evidenceType === "assessment" ONLY
  // (packages/learning-loop/src/loop.ts:415). So a diagnosed numeracy
  // skill can NEVER produce a comparison — the loop must stop at
  // "reassessment" with reason "insufficient-evidence-for-comparison"
  // even when real numeracy measurements exist in `response`.
  // PREDICTED: trace.stoppedAt === "reassessment" &&
  //            trace.stopReason === "insufficient-evidence-for-comparison"
  //            (i.e. NO comparison object on a numeracy skill)
  // ────────────────────────────────────────────────────────────────────
  it("A1 [R-027-01]: numeracy (attempt-type) evidence cannot produce a comparison", async () => {
    const s: StudentFixture = await makeStudent("A1");
    const skill = "mathematics.numeracy";
    // Real numeracy-shaped measurements, stored the way the real engine stores them.
    for (let i = 0; i < 2; i++) {
      await evidenceRow(s.tenantId, s.studentId, "attempt", "math", {
        skill, // not written by the real engine — but even WITH it, A1 must fail
        accuracy: 0.4 + i * 0.4, durationMs: 9000 + i, responseDurationMs: 5000,
        dimensionMeasurements: [
          { dimension: "accuracy", area: "accuracy", metric: "accuracy", value: 0.4 + i * 0.4, higherIsBetter: true, label: "Numeracy Accuracy" },
          { dimension: "response-speed", area: "response-time", metric: "durationMs", value: 9000 + i, higherIsBetter: false, label: "Math Response Speed" },
          { dimension: "problem-solving", area: "arithmetic", metric: "problem-solving", value: 0.5 + i * 0.25, higherIsBetter: true, label: "Problem Solving" },
        ],
      }, new Date(Date.UTC(2026, 8, 10 + i, 10, 0, 0)));
    }
    // One mistake row ×3 to guarantee a repeated-mistake signal on the skill.
    for (let i = 0; i < 3; i++) {
      await evidenceRow(s.tenantId, s.studentId, "mistake", "math", { skill, errorType: "CARRY_ERROR" }, new Date(Date.UTC(2026, 8, 12, i, 0, 0)));
    }
    const rows = await (await import("@workspace/db")).listEvidenceForStudent({ tenantId: s.tenantId, studentId: s.studentId });
    const trace = await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, teacherDecision: DECISION, emitEvent: emitSpy });
    console.log("EVIDENCE A1 result", JSON.stringify({ stoppedAt: trace.stoppedAt, stopReason: trace.stopReason, hasComparison: !!trace.comparison }, null, 2));
    // GAP PROOF: with real numeracy data present, a correct system would compare.
    expect(trace.comparison).toBeDefined(); // ← FAILS = gap proven
  });

  // ────────────────────────────────────────────────────────────────────
  // A2 — R-027-01 (metric-extraction layer): even when two ASSESSMENT rows
  // with numeracy-shaped numeric fields exist, toMetrics only extracts
  // ["accuracy","fluency","prosody","wpm","comprehension"]
  // (packages/learning-loop/src/loop.ts:424-429) — so numeracy's
  // durationMs and problem-solving are dropped and the comparison
  // indicators can never contain them.
  // PREDICTED: comparison produced, but indicators contain NEITHER
  //            "durationMs" NOR "problem-solving" (and fluency never
  //            exists for numeracy).
  // ────────────────────────────────────────────────────────────────────
  it("A2 [R-027-01]: numeracy metrics (durationMs/problem-solving) are dropped by toMetrics", async () => {
    const s: StudentFixture = await makeStudent("A2");
    const skill = "mathematics.numeracy";
    // REAL engine response contract (V-2-documented): the numeracy engine writes
    // the full measurements object — accuracy flat + durationMs flat + metrics
    // inside dimensionMeasurements (engines/numeracy-engine/src/evidence.ts:62,
    // measure.ts:66-69). Synthetic flat-only keys replaced with the real shape.
    for (const acc of [0.4, 0.8]) {
      await evidenceRow(s.tenantId, s.studentId, "assessment", "math", {
        skill, accuracy: acc, durationMs: 12_345,
        dimensionMeasurements: [
          { dimension: "accuracy", area: "accuracy", metric: "accuracy", value: acc, higherIsBetter: true, label: "Numeracy Accuracy" },
          { dimension: "response-speed", area: "response-time", metric: "durationMs", value: 12_345, higherIsBetter: false, label: "Math Response Speed" },
          { dimension: "problem-solving", area: "arithmetic", metric: "problem-solving", value: 0.7, higherIsBetter: true, label: "Problem Solving" },
        ],
      }, new Date(Date.UTC(2026, 8, 10, acc === 0.4 ? 9 : 15, 0, 0)));
    }
    for (let i = 0; i < 3; i++) {
      await evidenceRow(s.tenantId, s.studentId, "mistake", "math", { skill, errorType: "CARRY_ERROR" }, new Date(Date.UTC(2026, 8, 11, i, 0, 0)));
    }
    const rows = await (await import("@workspace/db")).listEvidenceForStudent({ tenantId: s.tenantId, studentId: s.studentId });
    const trace = await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, teacherDecision: DECISION, emitEvent: emitSpy });
    console.log("EVIDENCE A2 indicators", JSON.stringify(trace.comparison?.indicators ?? null));
    const ind = trace.comparison?.indicators ?? {};
    // GAP PROOF: numeracy-native metrics must survive into the comparison.
    expect(Object.keys(ind)).toContain("durationMs"); // ← FAILS = gap proven
    expect(Object.keys(ind)).toContain("problem-solving"); // ← FAILS = gap proven
  });

  // ────────────────────────────────────────────────────────────────────
  // A3 — R-027-02: the comparison stage filters ONLY on evidenceType,
  // never on skill (packages/learning-loop/src/loop.ts:415), and the
  // evidence table has NO skill column (skill is DERIVED via skillOf,
  // detection.ts:56-59). Two skills with CONFLICTING results can
  // therefore mix: baseline from one skill, current from the other.
  // PREDICTED: reassessment/comparison built from rows of TWO different
  //            skills (baselineEvidenceRef ≠ same-skill) — i.e. a
  //            cross-skill comparison is produced at all.
  // ────────────────────────────────────────────────────────────────────
  it("A3 [R-027-02]: baseline/current can mix two different skills", async () => {
    const s: StudentFixture = await makeStudent("A3");
    const skillA = "reading.comprehension";
    const skillB = "mathematics.numeracy";
    // skill A rows: low accuracy → then skill B row: high accuracy.
    await evidenceRow(s.tenantId, s.studentId, "assessment", "reading", { skill: skillA, accuracy: 0.30 }, new Date(Date.UTC(2026, 8, 9, 9, 0, 0)));
    await evidenceRow(s.tenantId, s.studentId, "assessment", "reading", { skill: skillA, accuracy: 0.32 }, new Date(Date.UTC(2026, 8, 9, 12, 0, 0)));
    await evidenceRow(s.tenantId, s.studentId, "assessment", "math", { skill: skillB, accuracy: 0.95 }, new Date(Date.UTC(2026, 8, 10, 9, 0, 0)));
    await evidenceRow(s.tenantId, s.studentId, "assessment", "math", { skill: skillB, accuracy: 0.96 }, new Date(Date.UTC(2026, 8, 10, 15, 0, 0)));
    // Drive a diagnosis on skillA via repeated mistakes.
    for (let i = 0; i < 3; i++) {
      await evidenceRow(s.tenantId, s.studentId, "mistake", "reading", { skill: skillA, errorType: "SUBSTITUTION" }, new Date(Date.UTC(2026, 8, 9, i + 1, 0, 0)));
    }
    const rows = await (await import("@workspace/db")).listEvidenceForStudent({ tenantId: s.tenantId, studentId: s.studentId });
    const trace = await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, teacherDecision: { ...DECISION, actorId: randomUUID() }, emitEvent: emitSpy });
    const reassessed = trace.reassessment;
    console.log("EVIDENCE A3", JSON.stringify({
      stoppedAt: trace.stoppedAt, stopReason: trace.stopReason,
      baselineEvidenceRef: reassessed?.baselineEvidenceRef, reassessmentEvidenceRef: reassessed?.reassessmentEvidenceRef,
      indicators: trace.comparison?.indicators,
    }, null, 2));
    const usedRows = rows.filter((r) => r.id === reassessed?.baselineEvidenceRef || r.id === reassessed?.reassessmentEvidenceRef);
    const skillsUsed = new Set(usedRows.map((r) => (r.response as Record<string, unknown>)?.skill ?? r.subject));
    console.log("EVIDENCE A3 skillsUsed", JSON.stringify([...skillsUsed]));
    // GAP PROOF: the two compared refs must belong to ONE skill. Mixed = proven.
    expect(skillsUsed.size).toBe(1); // ← FAILS = gap proven
  });
});
