/**
 * CORE-09 - Multidimensional Learner Model tests (Core Platform).
 *
 * Proves the model is:
 *  1. Multidimensional (math strong / reading weak / dictation insufficient)
 *     with NO overall score anywhere.
 *  2. History-preserving: weak -> improving -> strong, old evidence retained.
 *  3. Decline-aware: strong -> declining from NEW evidence only.
 *  4. Insufficient-evidence first-class: no grammar evidence -> INSUFFICIENT_EVIDENCE.
 *  5. Tenant-isolated: tenant A rows never leak into tenant B model; UUID gates.
 *  6. Longitudinal: grade 4 -> grade 5 keeps the continuous profile (context segments).
 *  7. Teacher-evidence ready: teacher rows surface as EXTERNAL teacher interpretations.
 *  8. AI-distinguishable: AI rows surface as EXTERNAL AI interpretations and are
 *     NEVER auto-converted into a rule level or a decision.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../evidence/evidence-reader.js", () => ({
  listEvidenceForStudent: vi.fn(),
}));

import { listEvidenceForStudent } from "../../evidence/evidence-reader.js";
import { buildLearnerModel } from "../projection.js";
import { DEFAULT_LEARNER_MODEL_CONFIG } from "../rules.js";
import type { Evidence } from "../../schema/evidence.js";

const mockList = vi.mocked(listEvidenceForStudent);

const T = "00000000-0000-4000-8000-00000000000a";
const T2 = "00000000-0000-4000-8000-0000000000b1";
const S = "00000000-0000-4000-8000-00000000000b";
const S2 = "00000000-0000-4000-8000-0000000000c2";

function ev(partial: Partial<Evidence> & { id: string; occurredAt: Date; evidenceType: string }): Evidence {
  return {
    tenantId: T,
    studentId: S,
    actorId: null,
    actorRole: null,
    subject: null,
    grade: null,
    curriculumBook: null,
    unitId: null,
    lessonId: null,
    objectiveId: null,
    activityId: null,
    sessionId: null,
    attemptId: null,
    passageId: null,
    inResponseToId: null,
    response: null,
    result: null,
    durationMs: null,
    errorType: null,
    confidence: null,
    sourceEngine: "reading-engine",
    tool: null,
    teacherDecision: null,
    followUp: null,
    metadata: null,
    operationKey: null,
    createdAt: partial.occurredAt,
    ...partial,
  } as Evidence;
}

/** Deterministic date sequence helper. */
function at(day: number, base = new Date("2026-01-01T00:00:00.000Z")): Date {
  return new Date(base.getTime() + day * 86_400_000);
}

let seq = 0;
function nid(): string {
  seq += 1;
  return "00000000-0000-4000-8000-" + String(seq).padStart(12, "0");
}

function accuracyRow(day: number, accuracy: number, subject = "reading", extra: Partial<Evidence> = {}): Evidence {
  return ev({
    id: nid(),
    tenantId: extra.tenantId ?? T,
    studentId: extra.studentId ?? S,
    subject,
    evidenceType: "assessment",
    occurredAt: at(day),
    response: { accuracy },
    sourceEngine: "reading-engine",
    ...extra,
  });
}

function setDataset(rows: Evidence[], tenantId: string = T, studentId: string = S): void {
  mockList.mockImplementation(async ({ tenantId: t, studentId: s }) =>
    rows.filter((r) => r.tenantId === t && r.studentId === s),
  );
}

import type { DimensionInterpretation } from "../types.js";
function findDim(model: { dimensions: DimensionInterpretation[] }, subject: string, dimension: string): DimensionInterpretation | undefined {
  return model.dimensions.find((d) => d.subject === subject && d.dimension === dimension);
}

describe("CORE-09 multidimensional learner model", () => {
  beforeEach(() => {
    seq = 0;
    vi.clearAllMocks();
  });

  it("1. multidimensional: math strong, reading weak, dictation insufficient, NO overall score", async () => {
    const rows = [
      ev({ id: nid(), evidenceType: "assessment", occurredAt: at(1), subject: "mathematics", response: { numeracy: 0.9 } }),
      ev({ id: nid(), evidenceType: "assessment", occurredAt: at(2), subject: "mathematics", response: { numeracy: 0.92 } }),
      ev({ id: nid(), evidenceType: "assessment", occurredAt: at(3), subject: "mathematics", response: { numeracy: 0.95 } }),
      accuracyRow(1, 0.4),
      accuracyRow(2, 0.42),
      accuracyRow(3, 0.45),
    ];
    setDataset(rows);
    const m = await buildLearnerModel({ tenantId: T, studentId: S });

    expect(findDim(m, "mathematics", "numeracy")?.level).toBe("strong");
    expect(findDim(m, "reading", "accuracy")?.level).toBe("weak");
    expect(findDim(m, "dictation", "accuracy")?.level).toBe("insufficient");
    expect(findDim(m, "dictation", "accuracy")?.trend).toBe("INSUFFICIENT_EVIDENCE");
    const plain = JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
    expect(plain.overallScore).toBeUndefined();
    expect(plain.student_level).toBeUndefined();
    expect(m.subjects.length).toBeGreaterThanOrEqual(2);
  });

  it("2. history: weak -> improving -> strong with ALL evidence retained", async () => {
    const rows = [
      accuracyRow(1, 0.4), accuracyRow(2, 0.42), accuracyRow(3, 0.85), accuracyRow(4, 0.88), accuracyRow(5, 0.92),
    ];
    setDataset(rows);
    const m = await buildLearnerModel({ tenantId: T, studentId: S });
    const acc = findDim(m, "reading", "accuracy");
    expect(acc?.level).toBe("strong");
    expect(acc?.trend).toBe("IMPROVING");
    expect(acc?.sampleCount).toBe(5);
    expect(acc?.evidenceRefs).toHaveLength(5); // old weak evidence never deleted
    expect(acc?.from?.getTime()).toBe(at(1).getTime());
    expect(acc?.to?.getTime()).toBe(at(5).getTime());
    expect(acc?.recentMean ?? -1).toBeGreaterThan(acc?.olderMean ?? 2); // recent above older
  });

  it("3. decline: strong -> declining driven by NEW evidence only", async () => {
    const rows = [
      accuracyRow(1, 0.9), accuracyRow(2, 0.88), accuracyRow(3, 0.86), accuracyRow(4, 0.7), accuracyRow(5, 0.6),
    ];
    setDataset(rows);
    const m = await buildLearnerModel({ tenantId: T, studentId: S });
    const acc = findDim(m, "reading", "accuracy");
    expect(acc?.trend).toBe("DECLINING");
    expect(acc?.level).toBe("declining");
    expect(acc?.evidenceRefs).toHaveLength(5); // history intact while declining
  });

  it("4. insufficient evidence is first-class, never a guessed score", async () => {
    // 1-2 samples only (below minEvidenceCount=3) and zero grammar rows
    setDataset([accuracyRow(1, 0.8), accuracyRow(2, 0.82)]);
    const m = await buildLearnerModel({ tenantId: T, studentId: S });
    const acc = findDim(m, "reading", "accuracy");
    expect(acc?.level).toBe("insufficient");
    expect(acc?.trend).toBe("INSUFFICIENT_EVIDENCE");
    expect(acc?.confidence).toBe(0);
    const grammar = findDim(m, "grammar", "accuracy");
    expect(grammar?.level).toBe("insufficient");
    expect(grammar?.confidence).toBe(0);
    expect(grammar?.sampleCount).toBe(0);
  });

  it("5. tenant isolation: tenant A rows never leak into tenant B model; UUID gates", async () => {
    const rowsA = [accuracyRow(1, 0.9), accuracyRow(2, 0.92), accuracyRow(3, 0.95)];
    const rowsB = [
      accuracyRow(1, 0.2, "reading", { tenantId: T2, studentId: S2 }),
      accuracyRow(2, 0.25, "reading", { tenantId: T2, studentId: S2 }),
      accuracyRow(3, 0.3, "reading", { tenantId: T2, studentId: S2 }),
    ];
    mockList.mockImplementation(async ({ tenantId: t, studentId: s }) => {
      const pool = t === T ? rowsA : t === T2 ? rowsB : [];
      return pool.filter((r) => r.studentId === s);
    });
    const mA = await buildLearnerModel({ tenantId: T, studentId: S });
    const mB = await buildLearnerModel({ tenantId: T2, studentId: S2 });
    const accA = findDim(mA, "reading", "accuracy");
    const accB = findDim(mB, "reading", "accuracy");
    expect(accA?.level).toBe("strong");
    expect(accB?.level).toBe("weak");
    for (const ref of accB?.evidenceRefs ?? []) {
      expect(accA?.evidenceRefs).not.toContain(ref);
    }
    // uuid gates
    await expect(buildLearnerModel({ tenantId: "", studentId: S })).rejects.toThrow("TENANT_CONTEXT_MISSING");
    await expect(buildLearnerModel({ tenantId: "not-a-uuid", studentId: S })).rejects.toThrow("INVALID_TENANT_ID");
    await expect(buildLearnerModel({ tenantId: T, studentId: "" })).rejects.toThrow("STUDENT_CONTEXT_MISSING");
  });

  it("6. longitudinal: grade 4 -> grade 5 keeps the continuous profile (context segments, no reset)", async () => {
    const rows = [
      accuracyRow(1, 0.5, "reading", { grade: "4", curriculumBook: "arabic-core" }),
      accuracyRow(2, 0.55, "reading", { grade: "4", curriculumBook: "arabic-core" }),
      accuracyRow(3, 0.6, "reading", { grade: "5", curriculumBook: "arabic-core" }),
      accuracyRow(4, 0.65, "reading", { grade: "5", curriculumBook: "arabic-core" }),
      accuracyRow(5, 0.7, "reading", { grade: "5", curriculumBook: "arabic-core" }),
    ];
    setDataset(rows);
    const m = await buildLearnerModel({ tenantId: T, studentId: S });
    expect(m.contexts).toHaveLength(2);
    expect(m.contexts[0]).toMatchObject({ grade: "4", curriculumBook: "arabic-core", evidenceCount: 2 });
    expect(m.contexts[1]).toMatchObject({ grade: "5", curriculumBook: "arabic-core", evidenceCount: 3 });
    const acc = findDim(m, "reading", "accuracy");
    expect(acc?.sampleCount).toBe(5); // profile not zeroed on grade change
    expect(acc?.evidenceRefs).toHaveLength(5);
  });

  it("7. teacher evidence: surfaced as EXTERNAL teacher interpretation, never merged into rule level", async () => {
    const rows = [
      accuracyRow(1, 0.5),
      accuracyRow(2, 0.55),
      ev({
        id: nid(), tenantId: T, studentId: S, evidenceType: "assessment", occurredAt: at(6),
        subject: "reading", sourceEngine: "teacher",
        response: { skill: "reading.accuracy", dimension: "accuracy", level: "strong", confidence: 0.8, note: "teacher observation" },
      }),
    ];
    setDataset(rows);
    const m = await buildLearnerModel({ tenantId: T, studentId: S });
    expect(m.teacherInterpretations).toHaveLength(1);
    expect(m.teacherInterpretations[0].source).toBe("TEACHER");
    expect(m.teacherInterpretations[0].claimedLevel).toBe("strong");
    expect(m.teacherInterpretations[0].evidenceId).toBeTruthy();
    const acc = findDim(m, "reading", "accuracy");
    expect(acc?.sampleCount).toBe(2); // teacher row NOT counted as rule evidence
  });

  it("8. AI evidence distinguishable, never auto-converted into a level or a decision", async () => {
    const rows = [
      accuracyRow(1, 0.6),
      accuracyRow(2, 0.62),
      accuracyRow(3, 0.64),
      ev({
        id: nid(), tenantId: T, studentId: S, evidenceType: "assessment", occurredAt: at(7),
        subject: "reading", sourceEngine: "ai-vision",
        response: { skill: "reading.fluency", dimension: "fluency", value: 0.5, interpretationSource: "AI" },
      }),
    ];
    setDataset(rows);
    const m = await buildLearnerModel({ tenantId: T, studentId: S });
    expect(m.aiInterpretations).toHaveLength(1);
    expect(m.aiInterpretations[0].source).toBe("AI");
    const flu = findDim(m, "reading", "fluency");
    expect(flu?.sampleCount).toBe(0); // AI row excluded from rule dimension
    const plain = JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
    expect(plain.aiDecision).toBeUndefined();
    expect(plain.recommendation).toBeUndefined();
    expect(plain.teacherDecision).toBeUndefined();
  });

  it("9. deterministic + config-driven: minEvidenceCount controls sufficiency", async () => {
    setDataset([accuracyRow(1, 0.8), accuracyRow(2, 0.82), accuracyRow(3, 0.84)]);
    const mInsufficient = await buildLearnerModel({ tenantId: T, studentId: S, config: { minEvidenceCount: 4 } });
    expect(findDim(mInsufficient, "reading", "accuracy")?.level).toBe("insufficient");
    const mSufficient = await buildLearnerModel({ tenantId: T, studentId: S, config: DEFAULT_LEARNER_MODEL_CONFIG });
    expect(findDim(mSufficient, "reading", "accuracy")?.level).not.toBe("insufficient");
  });
});
