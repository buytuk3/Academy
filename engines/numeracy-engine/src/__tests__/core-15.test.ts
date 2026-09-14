/**
 * CORE-15 — Numeracy Engine Foundation behavioral test suite.
 * Proves real behavior: deterministic comparison, error model, time,
 * digit policies, evidence via canonical writer, tenant/student isolation,
 * architecture guards. No formal/empty tests.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RecordEvidenceInput } from "@workspace/db";
import type { CurriculumContext } from "@workspace/curriculum";
import {
  analyzeNumeracy,
  assertNumeracyContext,
  recordNumeracyEvidence,
  digitPolicyFor,
} from "../index.js";
import type { NumeracyActivityPolicy } from "../index.js";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STUDENT_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STUDENT_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ATTEMPT_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const curriculum = {
  tenantId: TENANT_A,
  studentId: STUDENT_A,
  country: "EG",
  language: "ar",
  educationSystem: "EG-NATIONAL",
  educationStage: "primary",
  grade: "Grade 4",
  gradeKey: "EG-PR-04",
  subject: "mathematics",
  curriculum: { curriculumId: "cur-eg-math", version: "2026", title: "EG Math 2026" },
  book: { bookId: "book-4" },
  unit: { unitId: "unit-4-1" },
  lesson: { lessonId: "lesson-4-1-2" },
  objective: { objectiveId: "obj-4-1-2-3" },
  skills: ["mathematics.numeracy"],
  dimensions: ["numeracy"],
} as CurriculumContext;

const basePolicy: NumeracyActivityPolicy = { language: "en", digitSet: "western", feedbackMode: "none", hintPolicy: "none" };

function attempt(over: Partial<Record<string, unknown>> = {}) {
  return {
    attemptId: ATTEMPT_1,
    tenantId: TENANT_A,
    studentId: STUDENT_A,
    activityId: "act-num-001",
    sessionId: "ses-1",
    actorId: STUDENT_A,
    actorRole: "student",
    occurredAt: "2026-09-09T10:00:00.000Z",
    startedAt: "2026-09-09T10:00:00.000Z",
    submittedAt: "2026-09-09T10:00:05.000Z",
    durationMs: 5000,
    thinkingTimeMs: 2500,
    responseDurationMs: 1700,
    attemptCount: 1,
    hintCount: 0,
    feedbackCount: 0,
    retryCount: 0,
    ...over,
  } as any;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

describe("CORE-15 contracts", () => {
  it("final-answer-only activity: correct and no steps forced", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92" },
      response: { finalAnswer: "92" },
      policy: basePolicy,
    });
    expect(r.comparison.finalCorrect).toBe(true);
    expect(r.comparison.stepCount).toBe(0);
    expect(r.comparison.errorRecords.length).toBe(0);
    expect(r.measurements.accuracy).toBe(1);
    expect(r.measurements.totalSteps).toBe(0);
    expect(r.measurements.dimensionMeasurements.length).toBeGreaterThanOrEqual(3);
  });

  it("step-aware activity: all steps correct -> stepAccuracy 1", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: {
        expression: "23*4", domain: "arithmetic", expectedAnswer: "92",
        expectedSteps: [
          { position: 1, expression: "20*4", result: "80" },
          { position: 2, expression: "3*4", result: "12" },
          { position: 3, expression: "80+12", result: "92" },
        ],
      },
      response: {
        finalAnswer: "92",
        steps: [
          { position: 1, expression: "20*4", result: "80" },
          { position: 2, expression: "3*4", result: "12" },
          { position: 3, expression: "80+12", result: "92" },
        ],
      },
      policy: basePolicy,
    });
    expect(r.comparison.finalCorrect).toBe(true);
    expect(r.comparison.stepCount).toBe(3);
    expect(r.measurements.correctSteps).toBe(3);
    expect(r.measurements.stepAccuracy).toBe(1);
  });

  it("attempt context carries into measurements (multi-attempt, hints, time fields)", () => {
    const r = analyzeNumeracy({
      attempt: attempt({ attemptCount: 2, hintCount: 1, feedbackCount: 3, retryCount: 4, thinkingTimeMs: 900, responseDurationMs: 600 }),
      task: { expression: "3+5", domain: "arithmetic", expectedAnswer: "8" },
      response: { finalAnswer: "8" },
      policy: basePolicy,
    });
    expect(r.measurements.attemptCount).toBe(2);
    expect(r.measurements.hintCount).toBe(1);
    expect(r.measurements.feedbackCount).toBe(3);
    expect(r.measurements.retryCount).toBe(4);
    expect(r.measurements.thinkingTimeMs).toBe(900);
    expect(r.measurements.responseDurationMs).toBe(600);
  });

  it("curriculum context is reference-only (never copied into measurements)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "7+6", domain: "arithmetic", expectedAnswer: "13" },
      response: { finalAnswer: "13" },
      policy: { ...basePolicy, curriculum, language: "ar" },
    });
    expect(r.measurements).not.toHaveProperty("curriculum");
    expect(r.measurements).not.toHaveProperty("country");
    expect(r.measurements).not.toHaveProperty("grade");
  });
});

describe("CORE-15 numeracy domains", () => {
  it("number sense: estimation within tolerance is accepted (deterministic rule)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "est: 48*3", domain: "number-sense", expectedAnswer: "144", estimationTolerance: 0.1 },
      response: { finalAnswer: "150" },
      policy: basePolicy,
    });
    expect(r.comparison.finalCorrect).toBe(true);
    expect(r.comparison.errorRecords.length).toBe(0);
    expect(r.measurements.accuracy).toBe(1);
  });

  it("number sense: beyond tolerance is incorrect", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "est: 48*3", domain: "number-sense", expectedAnswer: "144", estimationTolerance: 0.02 },
      response: { finalAnswer: "150" },
      policy: basePolicy,
    });
    expect(r.comparison.finalCorrect).toBe(false);
    expect(r.comparison.primaryError).toBeDefined();
  });

  it("counting: correct sequence has no errors", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "count", domain: "counting", expectedAnswer: "1,2,3,4,5" },
      response: { finalAnswer: "1,2,3,4,5" },
      policy: basePolicy,
    });
    expect(r.comparison.finalCorrect).toBe(true);
    expect(r.comparison.errorRecords.length).toBe(0);
  });

  it("counting: gap detected (1,2,4,5)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "count", domain: "counting", expectedAnswer: "1,2,3,4,5" },
      response: { finalAnswer: "1,2,4,5" },
      policy: basePolicy,
    });
    expect(r.comparison.primaryError?.type).toBe("COUNTING_GAP");
    expect(r.comparison.errorRecords.some((e) => e.type === "COUNTING_GAP")).toBe(true);
  });

  it("counting: repetition detected (1,2,2,3)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "count", domain: "counting", expectedAnswer: "1,2,3" },
      response: { finalAnswer: "1,2,2,3" },
      policy: basePolicy,
    });
    expect(r.comparison.primaryError?.type).toBe("COUNTING_REPETITION");
  });

  it("comparison: correct and wrong operator", () => {
    const ok = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "14>9", domain: "comparison", expectedAnswer: "14>9" },
      response: { finalAnswer: "14>9" },
      policy: basePolicy,
    });
    expect(ok.comparison.finalCorrect).toBe(true);
    const bad = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "14>9", domain: "comparison", expectedAnswer: "14>9" },
      response: { finalAnswer: "14<9" },
      policy: basePolicy,
    });
    expect(bad.comparison.primaryError?.type).toBe("COMPARISON_ERROR");
    expect(bad.comparison.primaryError?.expected).toBe(">");
    expect(bad.comparison.primaryError?.actual).toBe("<");
  });

  it("arithmetic: addition correct; carry error (27+18 -> 35)", () => {
    const ok = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "27+18", domain: "arithmetic", expectedAnswer: "45" },
      response: { finalAnswer: "45" },
      policy: basePolicy,
    });
    expect(ok.comparison.finalCorrect).toBe(true);
    const carry = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "27+18", domain: "arithmetic", expectedAnswer: "45" },
      response: { finalAnswer: "35" },
      policy: basePolicy,
    });
    expect(carry.comparison.primaryError?.type).toBe("CARRY_ERROR");
  });

  it("subtraction: borrow error (53-17 -> 46)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "53-17", domain: "arithmetic", expectedAnswer: "36" },
      response: { finalAnswer: "46" },
      policy: basePolicy,
    });
    expect(r.comparison.primaryError?.type).toBe("BORROW_ERROR");
  });

  it("place value: 10x drift detected (92 -> 920)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92" },
      response: { finalAnswer: "920" },
      policy: basePolicy,
    });
    expect(r.comparison.primaryError?.type).toBe("PLACE_VALUE_ERROR");
  });

  it("digit translocation detected (92 -> 29)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92" },
      response: { finalAnswer: "29" },
      policy: basePolicy,
    });
    expect(r.comparison.primaryError?.type).toBe("DIGIT_TRANSLOCATION");
  });

  it("multiplication fact error (7*8 -> 54)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "7*8", domain: "arithmetic", expectedAnswer: "56" },
      response: { finalAnswer: "54" },
      policy: basePolicy,
    });
    expect(r.comparison.primaryError?.type).toBe("MULTIPLICATION_FACT_ERROR");
  });

  it("division remainder error (17/5 -> 3 r 1)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "17/5", domain: "arithmetic", expectedAnswer: "3 r 2" },
      response: { finalAnswer: "3 r 1" },
      policy: basePolicy,
    });
    expect(r.comparison.primaryError?.type).toBe("DIVISION_REMAINDER_ERROR");
  });

  it("sign error (23-15 -> -8)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "23-15", domain: "arithmetic", expectedAnswer: "8" },
      response: { finalAnswer: "-8" },
      policy: basePolicy,
    });
    expect(r.comparison.primaryError?.type).toBe("SIGN_ERROR");
  });

  it("patterns: wrong rule (2,4,8,? -> 14)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "2,4,8,?", domain: "patterns", expectedAnswer: "16" },
      response: { finalAnswer: "14" },
      policy: basePolicy,
    });
    expect(r.comparison.primaryError?.type).toBe("SEQUENCE_RULE_ERROR");
  });

  it("fractions: correct, denominator error, numerator error", () => {
    const ok = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "1/2+1/4", domain: "fractions", expectedAnswer: "3/4" },
      response: { finalAnswer: "3/4" },
      policy: basePolicy,
    });
    expect(ok.comparison.finalCorrect).toBe(true);
    const den = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "1/2", domain: "fractions", expectedAnswer: "1/2" },
      response: { finalAnswer: "1/3" },
      policy: basePolicy,
    });
    expect(den.comparison.primaryError?.type).toBe("FRACTION_DENOMINATOR_ERROR");
    const num = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "1/2", domain: "fractions", expectedAnswer: "1/2" },
      response: { finalAnswer: "2/2" },
      policy: basePolicy,
    });
    expect(num.comparison.primaryError?.type).toBe("FRACTION_NUMERATOR_ERROR");
  });

  it("steps: wrong operation detected (3*5 -> 3+5)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: {
        expression: "3 pens * 5 each", domain: "problem-solving", expectedAnswer: "15",
        expectedSteps: [{ position: 1, expression: "3*5", result: "15" }],
      },
      response: { finalAnswer: "8", steps: [{ position: 1, expression: "3+5", result: "8" }] },
      policy: basePolicy,
    });
    expect(r.comparison.errorRecords.some((e) => e.type === "WRONG_OPERATION")).toBe(true);
    expect(r.comparison.primaryError?.type).toBe("WRONG_OPERATION");
  });

  it("steps: order swap detected (STEP_ORDER_ERROR)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: {
        expression: "23*4", domain: "arithmetic", expectedAnswer: "92",
        expectedSteps: [
          { position: 1, expression: "20*4", result: "80" },
          { position: 2, expression: "3*4", result: "12" },
          { position: 3, expression: "80+12", result: "92" },
        ],
      },
      response: {
        finalAnswer: "92",
        steps: [
          { position: 1, expression: "3*4", result: "12" },
          { position: 2, expression: "20*4", result: "80" },
          { position: 3, expression: "80+12", result: "92" },
        ],
      },
      policy: basePolicy,
    });
    expect(r.comparison.finalCorrect).toBe(true);
    expect(r.comparison.errorRecords.some((e) => e.type === "STEP_ORDER_ERROR")).toBe(true);
  });

  it("error records carry only type+position+expected+actual+confidence+evidenceRef (no copies)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "27+18", domain: "arithmetic", expectedAnswer: "45" },
      response: { finalAnswer: "35" },
      policy: basePolicy,
    });
    const rec = r.comparison.primaryError!;
    expect(Object.keys(rec).every((k) => ["type", "position", "expected", "actual", "confidence", "evidenceRef"].includes(k))).toBe(true);
    expect(rec.type).toBe("CARRY_ERROR");
    expect(rec.expected).toBe("45");
    expect(rec.actual).toBe("35");
    expect(rec.confidence).toBe(0.95);
  });
});

describe("CORE-15 time model", () => {
  it("duration derives from timestamps when durationMs absent", () => {
    const r = analyzeNumeracy({
      attempt: attempt({ durationMs: undefined }),
      task: { expression: "2+2", domain: "arithmetic", expectedAnswer: "4" },
      response: { finalAnswer: "4" },
      policy: basePolicy,
    });
    expect(r.measurements.durationMs).toBe(5000);
  });

  it("explicit durationMs overrides timestamps", () => {
    const r = analyzeNumeracy({
      attempt: attempt({ durationMs: 4200 }),
      task: { expression: "2+2", domain: "arithmetic", expectedAnswer: "4" },
      response: { finalAnswer: "4" },
      policy: basePolicy,
    });
    expect(r.measurements.durationMs).toBe(4200);
  });
});

describe("CORE-15 number/digit policies", () => {
  it("western operator forms normalize (23 × 4 = 92)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "23 × 4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" },
      response: { finalAnswer: "92" },
      policy: basePolicy,
    });
    expect(r.comparison.finalCorrect).toBe(true);
  });

  it("arabic-indic digits fold deterministically (٢٣ × ٤ = ٩٢)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "٢٣ × ٤", domain: "arithmetic", expectedAnswer: "٩٢", digitSet: "arabic-indic" },
      response: { finalAnswer: "٩٢" },
      policy: basePolicy,
    });
    expect(r.comparison.finalCorrect).toBe(true);
  });

  it("mixed scripts compare equal (expected ٩٢, actual 92)", () => {
    const r = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "٢٣ × ٤", domain: "arithmetic", expectedAnswer: "٩٢", digitSet: "arabic-indic" },
      response: { finalAnswer: "92" },
      policy: basePolicy,
    });
    expect(r.comparison.finalCorrect).toBe(true);
  });

  it("digit policies are injectable and registry-driven (third system = new pack)", () => {
    const w = digitPolicyFor("western");
    const a = digitPolicyFor("arabic-indic");
    expect(w.normalize("٢٣")).toBe("23");
    expect(a.normalize("٩٢")).toBe("92");
    expect(() => digitPolicyFor("unknown" as any)).toThrow("UNKNOWN_DIGIT_SET");
  });
});

describe("CORE-15 evidence (canonical writer only)", () => {
  it("emits through the canonical Evidence Writer contract with full linkage", async () => {
    let captured: RecordEvidenceInput | undefined;
    const writer = async (input: RecordEvidenceInput) => {
      captured = input;
      return { id: "ev-1" };
    };
    const analysis = analyzeNumeracy({
      attempt: attempt(),
      task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92" },
      response: { finalAnswer: "92" },
      policy: { ...basePolicy, curriculum, language: "ar" },
    });
    const { evidenceInput } = await recordNumeracyEvidence({
      attempt: attempt(),
      measurements: analysis.measurements,
      policy: { ...basePolicy, curriculum, language: "ar" },
      comparison: analysis.comparison,
      area: "arithmetic",
      evidenceWriter: writer,
    });
    expect(captured).toBe(evidenceInput);
    expect(evidenceInput.sourceEngine).toBe("numeracy-engine");
    expect(evidenceInput.evidenceType).toBe("attempt");
    expect(evidenceInput.operationKey).toBe("numeracy:attempt:" + ATTEMPT_1);
    expect(evidenceInput.subject).toBe("mathematics");
    expect(evidenceInput.result).toBe("1");
    expect(evidenceInput.durationMs).toBe(5000);
    const m = evidenceInput.response as any;
    expect(m.accuracy).toBe(1);
    expect(m).not.toHaveProperty("overallScore");
    expect(m).not.toHaveProperty("numeracyScore");
    expect(m).not.toHaveProperty("studentLevel");
    expect(m).not.toHaveProperty("steps");
    expect(m.dimensionMeasurements.length).toBeGreaterThanOrEqual(3);
    const meta = evidenceInput.metadata as any;
    expect(meta.source).toBe("RULE");
    expect(meta.area).toBe("arithmetic");
    expect(meta.digitSet).toBe("western");
    expect(meta.language).toBe("ar");
    expect(meta.curriculum.subject).toBe("mathematics");
    expect(meta.curriculum.unitId).toBe("unit-4-1");
    expect(meta.curriculum.gradeKey).toBe("EG-PR-04");
    expect(meta.time.thinkingTimeMs).toBe(2500);
  });

  it("no second store: no numeracy table name anywhere in engine src", () => {
    const hits: string[] = [];
    for (const f of listFiles(join(process.cwd(), "engines/numeracy-engine/src"))) {
      if (f.includes("__tests__")) continue;
      const t = readFileSync(f, "utf8");
      if (/numeracy_evidence|numeracy_records|numeracy_table/i.test(t)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });

  it("tenant isolation: canonical guard errors", () => {
    expect(() => assertNumeracyContext(undefined, STUDENT_A)).toThrow("TENANT_CONTEXT_MISSING");
    expect(() => assertNumeracyContext("not-a-uuid", STUDENT_A)).toThrow("INVALID_TENANT_ID");
    expect(() => assertNumeracyContext(TENANT_A, undefined)).toThrow("STUDENT_CONTEXT_MISSING");
    expect(() => assertNumeracyContext(TENANT_A, "not-a-uuid")).toThrow("INVALID_STUDENT_ID");
  });

  it("tenant isolation: cross-tenant write is rejected", async () => {
    const writer = async (input: RecordEvidenceInput) => {
      if (input.tenantId !== TENANT_A) throw new Error("TENANT_MISMATCH");
      return { id: "ev" };
    };
    const analysis = analyzeNumeracy({
      attempt: attempt({ tenantId: TENANT_B }),
      task: { expression: "2+2", domain: "arithmetic", expectedAnswer: "4" },
      response: { finalAnswer: "4" },
      policy: basePolicy,
    });
    await expect(
      recordNumeracyEvidence({
        attempt: attempt({ tenantId: TENANT_B }),
        measurements: analysis.measurements,
        policy: basePolicy,
        comparison: analysis.comparison,
        area: "arithmetic",
        evidenceWriter: writer,
      }),
    ).rejects.toThrow("TENANT_MISMATCH");
  });

  it("student isolation: cross-student write is rejected", async () => {
    const writer = async (input: RecordEvidenceInput) => {
      if (input.studentId !== STUDENT_A) throw new Error("STUDENT_MISMATCH");
      return { id: "ev" };
    };
    const analysis = analyzeNumeracy({
      attempt: attempt({ studentId: STUDENT_B }),
      task: { expression: "2+2", domain: "arithmetic", expectedAnswer: "4" },
      response: { finalAnswer: "4" },
      policy: basePolicy,
    });
    await expect(
      recordNumeracyEvidence({
        attempt: attempt({ studentId: STUDENT_B }),
        measurements: analysis.measurements,
        policy: basePolicy,
        comparison: analysis.comparison,
        area: "arithmetic",
        evidenceWriter: writer,
      }),
    ).rejects.toThrow("STUDENT_MISMATCH");
  });
});

describe("CORE-15 architecture guards", () => {
  it("deterministic: same input -> same measurement (twice)", () => {
    const args = {
      attempt: attempt(),
      task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", expectedSteps: [{ position: 1, expression: "20*4", result: "80" }] },
      response: { finalAnswer: "92", steps: [{ position: 1, expression: "20*4", result: "80" }] },
      policy: basePolicy,
    };
    const a = JSON.stringify(analyzeNumeracy(args));
    const b = JSON.stringify(analyzeNumeracy(args));
    expect(a).toBe(b);
  });

  it("no DB client at module scope: import works without DATABASE_URL", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const mod = await import("../index.js");
      expect(mod.analyzeNumeracy).toBeTypeOf("function");
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });

  it("evidence module: @workspace/db is type-only or lazy dynamic import", () => {
    const src = readFileSync(join(process.cwd(), "engines/numeracy-engine/src/evidence.ts"), "utf8");
    const lines = src.split("\n").filter((l) => l.includes("@workspace/db"));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      const ok = l.trim().startsWith("import type") || l.includes("await import");
      expect(ok).toBe(true);
    }
  });

  it("no package -> engine dependency (packages/*/src never references engines)", () => {
    const hits: string[] = [];
    for (const dir of readdirSync(join(process.cwd(), "packages"), { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const base = join(process.cwd(), "packages", dir.name, "src");
      for (const f of listFiles(base)) {
        const t = readFileSync(f, "utf8");
        if (/numeracy-engine/.test(t)) hits.push(f);
      }
    }
    expect(hits).toEqual([]);
  });

  it("engine never imports forbidden ownership packages", () => {
    const banned = /@workspace\/(decisions|events|intelligence|learning-loop|queue|security|observability|contracts|config)\b/;
    const hits: string[] = [];
    for (const f of listFiles(join(process.cwd(), "engines/numeracy-engine/src"))) {
      const t = readFileSync(f, "utf8");
      if (banned.test(t)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });

  it("teacher boundary: no auto-delivery, no proposals, no decisions in engine surface", async () => {
    const mod: any = await import("../index.js");
    for (const k of ["applyTeacherDecision", "requiresTeacherApproval", "deliver", "autoDeliver", "reassess", "propose"]) {
      expect(mod).not.toHaveProperty(k);
    }
  });

  it("no AI/LLM dependency imports in engine src", () => {
    const hits: string[] = [];
    for (const f of listFiles(join(process.cwd(), "engines/numeracy-engine/src"))) {
      if (f.includes("__tests__")) continue;
      const t = readFileSync(f, "utf8");
      if (/from ["'](openai|@anthropic|huggingface)|gemini-api|anthropic-sdk/.test(t)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });

  it("no overall-score / student-level identifiers in engine src (excluding tests)", () => {
    const hits: string[] = [];
    for (const f of listFiles(join(process.cwd(), "engines/numeracy-engine/src"))) {
      if (f.includes("__tests__")) continue;
      const t = readFileSync(f, "utf8");
      if (/overallScore|studentLevel|globalMathScore|numeracyScore|averageScore/.test(t)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });
});
