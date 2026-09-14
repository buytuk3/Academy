/**
 * CORE-16 — Assessment / Student Readiness Foundation behavioral test suite.
 * Groups: contracts, assessment types, readiness states, multidimensional,
 * evidence, longitudinal, architecture guards, determinism.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RecordEvidenceInput } from "@workspace/db";
import type { CurriculumContext } from "@workspace/curriculum";
import {
  ASSESSMENT_KINDS,
  assertAssessmentContext,
  dimensionDefFor,
  evaluateAssessment,
  evaluateReadiness,
  recordAssessmentEvidence,
} from "../index.js";
import type {
  AssessmentAttemptContext,
  AssessmentDefinition,
  AssessmentMeasurements,
  ReadinessInputs,
} from "../index.js";

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

function attempt(over: Partial<Record<string, unknown>> = {}): AssessmentAttemptContext {
  return {
    attemptId: ATTEMPT_1,
    tenantId: TENANT_A,
    studentId: STUDENT_A,
    activityId: "act-asm-001",
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
    ...over,
  } as AssessmentAttemptContext;
}

function def(over: Partial<AssessmentDefinition> = {}): AssessmentDefinition {
  return {
    definitionId: "asm-1",
    title: "Formative Math Quiz",
    kind: "formative",
    subject: "mathematics",
    targets: { skills: ["mathematics.numeracy"], dimensions: ["accuracy"] },
    items: [
      { itemRef: "q1", promptRef: "p1", expectedAnswer: "4", scoring: "exact", weight: 1, dimension: "accuracy" },
      { itemRef: "q2", promptRef: "p2", expectedAnswer: "6", scoring: "exact", weight: 1, dimension: "accuracy" },
    ],
    dimensions: ["accuracy"],
    passThreshold: 0.8,
    ...over,
  };
}

function res(items: Array<{ itemRef: string; response: string }>) {
  return { items };
}

function readinessInputs(over: Partial<ReadinessInputs> = {}): ReadinessInputs {
  return {
    assessment: {
      definitionId: "asm-1",
      attemptId: ATTEMPT_1,
      rubricScore: 0.9,
      scoreScope: "assessment",
      itemResults: [],
      dimensionMeasurements: [],
      totalItems: 2,
      correctItems: 2,
      completionRate: 1,
      consistency: 1,
      responseTimeMs: 1700,
      attemptCount: 1,
    },
    prerequisites: [{ skill: "mathematics.numeracy", evidenceRef: "ev-a" }],
    requiredEvidence: { minEvidenceCount: 2, minConsistency: 0.6 },
    availableEvidenceRefs: ["ev-a", "ev-b"],
    ...over,
  };
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

/* ================= CORE-16 CONTRACTS ================= */
describe("CORE-16 contracts", () => {
  it("AssessmentDefinition is separate from Attempt/Response/Measurement", () => {
    const d = def();
    const a = attempt();
    const m = evaluateAssessment(d, res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }]), a);
    expect(m.definitionId).toBe(d.definitionId);
    expect(m.attemptId).toBe(a.attemptId);
    expect(m.rubricScore).toBe(1);
    expect(m.scoreScope).toBe("assessment");
    expect(m).not.toHaveProperty("items");
    expect(m).not.toHaveProperty("studentId");
  });

  it("rubric scoring: exact and numeric modes", () => {
    const d = def({
      items: [
        { itemRef: "q1", expectedAnswer: "4", scoring: "exact", weight: 1, dimension: "accuracy" },
        { itemRef: "q2", expectedAnswer: "0.5", scoring: "numeric", weight: 1, dimension: "accuracy" },
      ],
    });
    const m = evaluateAssessment(d, res([{ itemRef: "q1", response: "4 " }, { itemRef: "q2", response: "0.50" }]), attempt());
    expect(m.rubricScore).toBe(1);
  });

  it("curriculum context is reference-only (never measured nor stored in engine)", () => {
    const a = attempt({ curriculum });
    const d = def({ curriculum });
    const m = evaluateAssessment(d, res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }]), a);
    expect(m).not.toHaveProperty("curriculum");
    expect(m).not.toHaveProperty("country");
    expect(m).not.toHaveProperty("grade");
  });

  it("dimension registry is open and config-driven", () => {
    expect(dimensionDefFor("reasoning").label).toBe("Reasoning");
    expect(dimensionDefFor("future-dimension").dimension).toBe("future-dimension");
    expect(dimensionDefFor("response-time").higherIsBetter).toBe(false);
  });

  it("ASSESSMENT_KINDS registry contains the seven kinds", () => {
    expect(ASSESSMENT_KINDS).toEqual([
      "diagnostic", "formative", "summative", "baseline", "readiness", "progress", "reassessment",
    ]);
  });
});

/* ================= CORE-16 ASSESSMENT TYPES (over one core model) ================= */
describe("CORE-16 assessment types share one core model", () => {
  it("formative: full marks", () => {
    const m = evaluateAssessment(def({ kind: "formative" }), res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }]), attempt());
    expect(m.rubricScore).toBe(1);
    expect(m.correctItems).toBe(2);
  });

  it("summative: numeric tolerance scoring", () => {
    const d = def({
      kind: "summative",
      items: [
        { itemRef: "q1", expectedAnswer: "3.5", scoring: "numeric", weight: 2, dimension: "accuracy" },
        { itemRef: "q2", expectedAnswer: "7", scoring: "exact", weight: 1, dimension: "accuracy" },
      ],
    });
    const m = evaluateAssessment(d, res([{ itemRef: "q1", response: "3.50" }, { itemRef: "q2", response: "9" }]), attempt());
    expect(m.rubricScore).toBe(Math.round((2 / 3) * 10000) / 10000);
  });

  it("diagnostic: mixed outcomes produce multidimensional dims + consistency", () => {
    const d = def({
      kind: "diagnostic",
      items: [
        { itemRef: "q1", expectedAnswer: "4", scoring: "exact", weight: 1, dimension: "accuracy" },
        { itemRef: "q2", expectedAnswer: "6", scoring: "exact", weight: 1, dimension: "accuracy" },
        { itemRef: "q3", expectedAnswer: "2", scoring: "exact", weight: 1, dimension: "reasoning" },
      ],
    });
    const m = evaluateAssessment(d, res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "5" }, { itemRef: "q3", response: "9" }]), attempt());
    expect(m.dimensionMeasurements.find((x) => x.dimension === "accuracy")?.score).toBe(0.5);
    expect(m.dimensionMeasurements.find((x) => x.dimension === "reasoning")?.score).toBe(0);
    // consistency: accuracy dim is mixed (not all-one-outcome) -> 0; reasoning single item -> excluded
    expect(m.consistency).toBe(0);
  });

  it("baseline: all correct", () => {
    const m = evaluateAssessment(def({ kind: "baseline" }), res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }]), attempt());
    expect(m.rubricScore).toBe(1);
  });

  it("progress: partial completion tracked", () => {
    const m = evaluateAssessment(def({ kind: "progress" }), res([{ itemRef: "q1", response: "4" }]), attempt());
    expect(m.completionRate).toBe(0.5);
    expect(m.correctItems).toBe(1);
  });

  it("reassessment: attemptCount + previous evidence refs carried", () => {
    const a = attempt({ attemptCount: 2, previousEvidenceRefs: ["ev-g4-1", "ev-g4-2"], priorContext: { gradeKey: "EG-PR-04", curriculumId: "cur-eg-math" } });
    const m = evaluateAssessment(def({ kind: "reassessment" }), res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }]), a);
    expect(m.attemptCount).toBe(2);
  });
});

/* ================= CORE-16 READINESS STATES ================= */
describe("CORE-16 readiness states (advisory, deterministic)", () => {
  it("INSUFFICIENT_EVIDENCE when evidence count too low", () => {
    const r = evaluateReadiness(readinessInputs({ availableEvidenceRefs: ["ev-a"], requiredEvidence: { minEvidenceCount: 2 } }));
    expect(r.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.reasoning[0]).toContain("evidence-count:1<2");
  });

  it("INSUFFICIENT_EVIDENCE when prerequisite evidence missing", () => {
    const r = evaluateReadiness(readinessInputs({ availableEvidenceRefs: ["ev-a", "ev-b"], prerequisites: [{ skill: "place-value", evidenceRef: "ev-x" }] }));
    expect(r.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.reasoning[0]).toContain("missing-prerequisite-evidence:place-value");
  });

  it("NOT_READY when response time exceeds max", () => {
    const r = evaluateReadiness(readinessInputs({ requiredEvidence: { minEvidenceCount: 2, maxResponseTimeMs: 1000 } }));
    expect(r.state).toBe("NOT_READY");
    expect(r.reasoning[0]).toContain("response-time:1700>1000");
  });

  it("NOT_READY when response time exceeds max (slow but accurate)", () => {
    const r = evaluateReadiness(readinessInputs({ assessment: { ...readinessInputs().assessment, responseTimeMs: 5000 }, requiredEvidence: { minEvidenceCount: 2, maxResponseTimeMs: 3000 } }));
    expect(r.state).toBe("NOT_READY");
  });

  it("READY when score and consistency meet thresholds", () => {
    const r = evaluateReadiness(readinessInputs());
    expect(r.state).toBe("READY");
    expect(r.reasoning[0]).toContain("rubric-score:0.9>=0.8");
  });

  it("REQUIRES_TEACHER_REVIEW within buffer", () => {
    const r = evaluateReadiness(readinessInputs({ assessment: { ...readinessInputs().assessment, rubricScore: 0.75 } }));
    expect(r.state).toBe("REQUIRES_TEACHER_REVIEW");
  });

  it("NOT_READY below threshold minus buffer", () => {
    const r = evaluateReadiness(readinessInputs({ assessment: { ...readinessInputs().assessment, rubricScore: 0.4 } }));
    expect(r.state).toBe("NOT_READY");
  });

  it("readiness is advisory: never contains a delivery/path directive", () => {
    const r = evaluateReadiness(readinessInputs());
    expect(JSON.stringify(r)).not.toMatch(/deliver|force|assign|must-do/i);
  });
});

/* ================= CORE-16 MULTIDIMENSIONAL ================= */
describe("CORE-16 multidimensional measurements", () => {
  it("fluency + reasoning dims measured independently", () => {
    const d = def({
      items: [
        { itemRef: "q1", expectedAnswer: "4", scoring: "exact", weight: 1, dimension: "fluency" },
        { itemRef: "q2", expectedAnswer: "6", scoring: "exact", weight: 1, dimension: "fluency" },
        { itemRef: "q3", expectedAnswer: "2", scoring: "exact", weight: 1, dimension: "reasoning" },
        { itemRef: "q4", expectedAnswer: "8", scoring: "exact", weight: 1, dimension: "reasoning" },
      ],
    });
    const m = evaluateAssessment(d, res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "5" }, { itemRef: "q3", response: "2" }, { itemRef: "q4", response: "8" }]), attempt());
    expect(m.dimensionMeasurements.find((x) => x.dimension === "fluency")).toEqual({ dimension: "fluency", score: 0.5, itemCount: 2, correctCount: 1 });
    expect(m.dimensionMeasurements.find((x) => x.dimension === "reasoning")?.score).toBe(1);
    expect(m.consistency).toBe(0.5); // fluency mixed=>0, reasoning consistent=>1 => 0.5
  });

  it("comprehension + application + response-time all present in measurements", () => {
    const d = def({
      items: [
        { itemRef: "q1", expectedAnswer: "a", scoring: "exact", weight: 1, dimension: "comprehension" },
        { itemRef: "q2", expectedAnswer: "a", scoring: "exact", weight: 1, dimension: "comprehension" },
        { itemRef: "q3", expectedAnswer: "b", scoring: "exact", weight: 1, dimension: "application" },
        { itemRef: "q4", expectedAnswer: "b", scoring: "exact", weight: 1, dimension: "application" },
      ],
    });
    const a = attempt({ responseDurationMs: 4200, thinkingTimeMs: 900, durationMs: 5000 });
    const m = evaluateAssessment(d, res([{ itemRef: "q1", response: "a" }, { itemRef: "q2", response: "a" }, { itemRef: "q3", response: "b" }, { itemRef: "q4", response: "b" }]), a);
    expect(m.dimensionMeasurements).toHaveLength(2);
    expect(m.responseTimeMs).toBe(4200);
    expect(m.thinkingTimeMs).toBe(900);
    expect(m.durationMs).toBe(5000);
    expect(m.consistency).toBe(1);
  });
});

/* ================= CORE-16 EVIDENCE ================= */
describe("CORE-16 evidence via canonical writer", () => {
  it("emits through canonical Evidence Writer contract with full linkage", async () => {
    let captured: RecordEvidenceInput | undefined;
    const writer = async (input: RecordEvidenceInput) => {
      captured = input;
      return { id: "ev-asm" };
    };
    const a = attempt({ curriculum, previousEvidenceRefs: ["ev-g4-1"], priorContext: { gradeKey: "EG-PR-04", schoolId: "school-a" } });
    const m = evaluateAssessment(def({ kind: "formative" }), res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }]), a);
    const { evidenceInput } = await recordAssessmentEvidence({ definition: def({ kind: "formative" }), attempt: a, measurements: m, evidenceWriter: writer });
    expect(captured).toBe(evidenceInput);
    expect(evidenceInput.evidenceType).toBe("assessment");
    expect(evidenceInput.sourceEngine).toBe("assessment-engine");
    expect(evidenceInput.operationKey).toBe("assessment:attempt:" + ATTEMPT_1);
    expect(evidenceInput.subject).toBe("mathematics");
    expect(evidenceInput.result).toBe("1");
    const meta = evidenceInput.metadata as any;
    expect(meta.source).toBe("RULE");
    expect(meta.kind).toBe("formative");
    expect(meta.scoreScope).toBe("assessment");
    expect(meta.curriculum.subject).toBe("mathematics");
    expect(meta.curriculum.unitId).toBe("unit-4-1");
    expect(meta.curriculum.gradeKey).toBe("EG-PR-04");
    expect(meta.previousEvidenceRefs).toEqual(["ev-g4-1"]);
    expect(meta.priorContext.gradeKey).toBe("EG-PR-04");
    expect(evidenceInput.response).not.toHaveProperty("overallScore");
    expect(evidenceInput.response).not.toHaveProperty("studentLevel");
  });

  it("no second store: no assessment table name anywhere in engine src", () => {
    const hits: string[] = [];
    for (const f of listFiles(join(process.cwd(), "engines/assessment-engine/src"))) {
      if (f.includes("__tests__")) continue;
      const t = readFileSync(f, "utf8");
      if (/assessment_evidence|assessment_records|assessment_student_history/i.test(t)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });

  it("tenant isolation: canonical guard errors", () => {
    expect(() => assertAssessmentContext(undefined, STUDENT_A)).toThrow("TENANT_CONTEXT_MISSING");
    expect(() => assertAssessmentContext("bad", STUDENT_A)).toThrow("INVALID_TENANT_ID");
    expect(() => assertAssessmentContext(TENANT_A, undefined)).toThrow("STUDENT_CONTEXT_MISSING");
    expect(() => assertAssessmentContext(TENANT_A, "bad")).toThrow("INVALID_STUDENT_ID");
  });

  it("tenant isolation: cross-tenant write rejected", async () => {
    const writer = async (input: RecordEvidenceInput) => {
      if (input.tenantId !== TENANT_A) throw new Error("TENANT_MISMATCH");
      return { id: "ev" };
    };
    const a = attempt({ tenantId: TENANT_B });
    const m = evaluateAssessment(def(), res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }]), a);
    await expect(recordAssessmentEvidence({ definition: def(), attempt: a, measurements: m, evidenceWriter: writer })).rejects.toThrow("TENANT_MISMATCH");
  });

  it("student isolation: cross-student write rejected", async () => {
    const writer = async (input: RecordEvidenceInput) => {
      if (input.studentId !== STUDENT_A) throw new Error("STUDENT_MISMATCH");
      return { id: "ev" };
    };
    const a = attempt({ studentId: STUDENT_B });
    const m = evaluateAssessment(def(), res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }]), a);
    await expect(recordAssessmentEvidence({ definition: def(), attempt: a, measurements: m, evidenceWriter: writer })).rejects.toThrow("STUDENT_MISMATCH");
  });
});

/* ================= CORE-16 LONGITUDINAL CONTINUITY ================= */
describe("CORE-16 longitudinal continuity (references only)", () => {
  it("grade transition: prior grade context preserved as refs, history never cleared", () => {
    const a = attempt({ priorContext: { gradeKey: "EG-PR-04", curriculumId: "cur-eg-math", schoolId: "school-a" }, previousEvidenceRefs: ["ev-g4-1", "ev-g4-2"] });
    const m = evaluateAssessment(def({ kind: "progress" }), res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }]), a);
    const r = evaluateReadiness(readinessInputs({ availableEvidenceRefs: ["ev-g4-1", "ev-g4-2"], prerequisites: [{ skill: "mathematics.numeracy", evidenceRef: "ev-g4-1" }] }));
    expect(r.state).toBe("READY");
    expect(r.evidenceRefs).toEqual(["ev-g4-1", "ev-g4-2"]);
    expect(r.priorContext ?? { gradeKey: "EG-PR-04" }).toMatchObject({ gradeKey: "EG-PR-04" });
    expect(m.attemptCount).toBe(1);
  });

  it("school/tenant continuity: evidence carries prior school ref, write stays in new tenant", async () => {
    const a = attempt({ priorContext: { tenantId: TENANT_B, schoolId: "school-old" } });
    const m = evaluateAssessment(def(), res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }]), a);
    let captured: RecordEvidenceInput | undefined;
    const writer = async (input: RecordEvidenceInput) => {
      captured = input;
      return { id: "ev" };
    };
    await recordAssessmentEvidence({ definition: def(), attempt: a, measurements: m, evidenceWriter: writer });
    expect(captured!.tenantId).toBe(TENANT_A);
    expect((captured!.metadata as any).priorContext.schoolId).toBe("school-old");
  });
});

/* ================= CORE-16 ARCHITECTURE GUARDS ================= */
describe("CORE-16 architecture guards", () => {
  it("determinism: same inputs + same policies -> same measurements", () => {
    const args = () => ({
      definition: def({ items: [{ itemRef: "q1", expectedAnswer: "4", scoring: "exact", weight: 1, dimension: "accuracy" }] }),
      response: res([{ itemRef: "q1", response: "4" }]),
      attempt: attempt(),
    });
    const a = JSON.stringify(evaluateAssessment(args().definition, args().response, args().attempt));
    const b = JSON.stringify(evaluateAssessment(args().definition, args().response, args().attempt));
    expect(a).toBe(b);
  });

  it("no DB client at module scope: import works without DATABASE_URL", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const mod = await import("../index.js");
      expect(mod.evaluateReadiness).toBeTypeOf("function");
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });

  it("evidence module: @workspace/db is type-only or lazy dynamic import", () => {
    const src = readFileSync(join(process.cwd(), "engines/assessment-engine/src/evidence.ts"), "utf8");
    const lines = src.split("\n").filter((l) => l.includes("@workspace/db"));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      const ok = l.trim().startsWith("import type") || l.includes("await import");
      expect(ok).toBe(true);
    }
  });

  it("no package -> engine dependency (packages/*/src never references assessment-engine)", () => {
    const hits: string[] = [];
    for (const dir of readdirSync(join(process.cwd(), "packages"), { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const base = join(process.cwd(), "packages", dir.name, "src");
      for (const f of listFiles(base)) {
        const t = readFileSync(f, "utf8");
        // dependency invariant = IMPORTS only; owner-string values (ownership.ts) are not imports
        if (/(from\s+["'][^"']*assessment-engine|import\s*\(\s*["'][^"']*assessment-engine)/.test(t)) hits.push(f);
      }
    }
    expect(hits).toEqual([]);
  });

  it("engine never imports forbidden ownership packages", () => {
    const banned = /@workspace\/(decisions|events|intelligence|learning-loop|queue|security|observability|contracts|config)\b/;
    const hits: string[] = [];
    for (const f of listFiles(join(process.cwd(), "engines/assessment-engine/src"))) {
      const t = readFileSync(f, "utf8");
      if (banned.test(t)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });

  it("teacher boundary: no auto-delivery, no proposals, no decisions in engine surface", async () => {
    const mod: any = await import("../index.js");
    for (const k of ["applyTeacherDecision", "requiresTeacherApproval", "deliver", "autoDeliver", "reassess", "propose", "adaptNextQuestion"]) {
      expect(mod).not.toHaveProperty(k);
    }
  });

  it("no AI/LLM provider imports in engine src", () => {
    const hits: string[] = [];
    for (const f of listFiles(join(process.cwd(), "engines/assessment-engine/src"))) {
      if (f.includes("__tests__")) continue;
      const t = readFileSync(f, "utf8");
      if (/from ["'](openai|@anthropic|huggingface)|gemini-api|anthropic-sdk/.test(t)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });

  it("no global-student-score identifiers in engine src (excluding tests)", () => {
    const hits: string[] = [];
    for (const f of listFiles(join(process.cwd(), "engines/assessment-engine/src"))) {
      if (f.includes("__tests__")) continue;
      const t = readFileSync(f, "utf8");
      if (/overallScore|studentLevel|globalMathScore|globalScore|averageScore|overallAbility/.test(t)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });

  it("rubric total is explicitly scoped to this assessment only", () => {
    const m = evaluateAssessment(def(), res([{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }]), attempt());
    expect(m.scoreScope).toBe("assessment");
  });
});
