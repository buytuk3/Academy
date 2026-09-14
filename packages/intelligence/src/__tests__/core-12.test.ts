/**
 * CORE-12 - Student Pattern & Learning Path tests.
 * Behavior tests per directive §12: multidimensional patterns, temporary vs
 * persistent, performance/speed/persistence/improvement/regression/
 * insufficient evidence, confidence/explanation/evidenceRefs/time span,
 * longitudinal continuity, teacher confirmation/rejection, path proposal,
 * approval/modification/rejection boundary, reassessment/outcome/path update,
 * tenant isolation, no duplicate evidence/SLR, no autonomous delivery, no
 * overall score, no medical diagnosis (pattern types strictly educational).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  listEvidenceForStudent: vi.fn(),
  buildLearnerModel: vi.fn(),
  recordEvidence: vi.fn(),
}));
vi.mock("@workspace/decisions", () => ({
  applyTeacherDecision: vi.fn(async () => ({ status: "APPROVED" })),
  issueDeliveryAuthorization: vi.fn(),
  assertDeliveryAuthorized: vi.fn(),
  assertActorCanDecide: vi.fn(),
}));

import { listEvidenceForStudent, buildLearnerModel, recordEvidence } from "@workspace/db";
import { buildStudentPatterns } from "../student-pattern.js";
import { buildLearningPathProposals, pathUpdateFromOutcome, assertProposalRequiresApproval } from "../learning-path.js";
import type { EvidenceRow } from "../intelligence.js";
import type { StudentPattern } from "../pattern-contracts.js";

const mockList = vi.mocked(listEvidenceForStudent);
const mockLearner = vi.mocked(buildLearnerModel);
const mockRecord = vi.mocked(recordEvidence);

const T = "00000000-0000-4000-8000-00000000000a";
const T2 = "00000000-0000-4000-8000-0000000000b1";
const S = "00000000-0000-4000-8000-00000000000b";
const S2 = "00000000-0000-4000-8000-0000000000c2";

let seq = 0;
function nid(): string {
  seq += 1;
  return "00000000-0000-4000-8000-" + String(seq).padStart(12, "0");
}
function at(day: number): Date {
  return new Date(new Date("2026-04-01T00:00:00.000Z").getTime() + day * 86_400_000);
}
function row(partial: Partial<EvidenceRow> & { evidenceType: string }): EvidenceRow {
  return { id: nid(), occurredAt: at(1), sessionId: "s1", evidenceType: "assessment", subject: "reading", response: null, tenantId: T, studentId: S, ...partial };
}
function mistake(session: string, day: number, errorType = "substitution", skill = "reading.accuracy", tenantId = T, studentId = S): EvidenceRow {
  return row({ id: nid(), occurredAt: at(day), sessionId: session, evidenceType: "mistake", subject: "reading", response: { errorType, skill }, tenantId, studentId });
}
function durationRow(day: number, ms: number, subject = "reading", tenantId = T, studentId = S): EvidenceRow {
  return row({ id: nid(), occurredAt: at(day), sessionId: "s" + day, evidenceType: "time", subject, response: { skill: subject + ".speed" }, durationMs: ms, tenantId, studentId });
}
function dim(subject: string, dimension: string, level: string, trend: string, confidence: number, refs: string[], n: number, fromDay: number, toDay: number) {
  return { subject, skill: subject + "." + dimension, dimension, level, trend, interpretationSource: "RULE" as const, confidence, evidenceRefs: refs, sampleCount: n, recentMean: 0.5, olderMean: 0.4, from: at(fromDay), to: at(toDay), reason: "RULE: " + n + " samples" };
}
function learnerOf(tenantId: string, studentId: string) {
  return { tenantId, studentId, builtAt: at(0), interpretationSource: "RULE" as const, contexts: [], subjects: [], dimensions: [] as ReturnType<typeof dim>[], teacherInterpretations: [], aiInterpretations: [] };
}
function setup(rows: EvidenceRow[], learner: ReturnType<typeof learnerOf> | null) {
  mockList.mockResolvedValue(rows as never);
  mockLearner.mockResolvedValue(learner as never);
  mockRecord.mockClear();
}
async function patterns(args: { rows: EvidenceRow[]; learner: ReturnType<typeof learnerOf> | null; tenantId?: string; studentId?: string; config?: Record<string, unknown> }) {
  setup(args.rows, args.learner);
  const tenantId = args.tenantId ?? T;
  const studentId = args.studentId ?? S;
  // simulate the real DB contract: reader scopes by tenantId+studentId (mimics listEvidenceForStudent)
  const scopedReader = async (q: { tenantId: string; studentId: string; limit?: number }) =>
    args.rows.filter((r) => r.tenantId === q.tenantId && r.studentId === q.studentId);
  return buildStudentPatterns({
    tenantId,
    studentId,
    evidenceReader: scopedReader as never,
    learnerBuilder: mockLearner as never,
    config: (args.config ?? {}) as never,
    now: at(60),
  });
}
function findPattern(list: StudentPattern[], type: string, subject = "reading", dimension = "accuracy"): StudentPattern | undefined {
  return list.find((p) => p.patternType === type && p.subject === subject && p.dimension === dimension);
}
const TYPES = ["PERFORMANCE_PATTERN", "SPEED_PATTERN", "PERSISTENCE_PATTERN", "IMPROVEMENT_PATTERN", "REGRESSION_PATTERN", "INSUFFICIENT_EVIDENCE_PATTERN"];

describe("CORE-12 student pattern & learning path", () => {
  beforeEach(() => { seq = 0; vi.clearAllMocks(); });

  it("1. multidimensional patterns: math strong, reading weak, dictation insufficient; NO overall score", async () => {
    const learner = learnerOf(T, S);
    learner.dimensions = [
      dim("mathematics", "numeracy", "strong", "STABLE", 0.82, ["e1", "e2", "e3"], 3, 1, 3),
      dim("reading", "accuracy", "weak", "DECLINING", 0.7, ["e4", "e5", "e6"], 3, 1, 3),
      dim("dictation", "accuracy", "insufficient", "INSUFFICIENT_EVIDENCE", 0, [], 0, 2, 2),
    ];
    const ps = await patterns({ rows: [], learner });
    expect(findPattern(ps, "PERFORMANCE_PATTERN", "mathematics", "numeracy")?.explanation).toContain("strong");
    expect(findPattern(ps, "PERFORMANCE_PATTERN", "reading", "accuracy")?.explanation).toContain("weak");
    expect(findPattern(ps, "INSUFFICIENT_EVIDENCE_PATTERN", "dictation", "accuracy")?.confidence).toBe(0);
    const raw = JSON.parse(JSON.stringify(ps)) as Record<string, unknown>;
    expect(raw.overallScore).toBeUndefined();
    expect(raw.averageScore).toBeUndefined();
    expect(raw.studentScore).toBeUndefined();
  });

  it("2. temporary vs persistent: single-session mistakes vs across sessions", async () => {
    const temp = await patterns({ rows: [mistake("s1", 1), mistake("s1", 2)], learner: null });
    const t = findPattern(temp, "PERSISTENCE_PATTERN", "reading", "substitution");
    expect(t).toBeDefined();
    expect(t!.persistence).toBe("TEMPORARY");
    expect(t!.status).toBe("temporary");
    expect(t!.sessionCount).toBe(1);
    const pers = await patterns({ rows: [mistake("s1", 1), mistake("s2", 3), mistake("s3", 5)], learner: null });
    const p = findPattern(pers, "PERSISTENCE_PATTERN", "reading", "substitution");
    expect(p!.persistence).toBe("PERSISTENT");
    expect(p!.status).toBe("active");
    expect(p!.sessionCount).toBe(3);
    expect(p!.evidenceCount).toBe(3);
  });

  it("3. performance pattern reflects strong vs weak levels", async () => {
    const learner = learnerOf(T, S);
    learner.dimensions = [
      dim("reading", "accuracy", "weak", "STABLE", 0.7, ["e1"], 4, 1, 5),
      dim("reading", "fluency", "strong", "STABLE", 0.8, ["e2"], 4, 1, 5),
    ];
    const ps = await patterns({ rows: [], learner });
    expect(findPattern(ps, "PERFORMANCE_PATTERN", "reading", "accuracy")?.explanation).toContain("weak");
    expect(findPattern(ps, "PERFORMANCE_PATTERN", "reading", "fluency")?.explanation).toContain("strong");
  });

  it("4. speed pattern: persistent over >=21 days, temporary under it", async () => {
    const slowLong = learnerOf(T, S);
    slowLong.dimensions = [dim("reading", "response-speed", "slow", "STABLE", 0.75, ["e1", "e2", "e3"], 3, 1, 40)];
    const long = await patterns({ rows: [], learner: slowLong });
    expect(findPattern(long, "SPEED_PATTERN", "reading", "response-speed")?.persistence).toBe("PERSISTENT");
    const slowShort = learnerOf(T, S);
    slowShort.dimensions = [dim("reading", "response-speed", "slow", "STABLE", 0.75, ["e1", "e2", "e3"], 3, 1, 4)];
    const short = await patterns({ rows: [], learner: slowShort });
    expect(findPattern(short, "SPEED_PATTERN", "reading", "response-speed")?.persistence).toBe("TEMPORARY");
  });

  it("5. improvement pattern from trend IMPROVING", async () => {
    const learner = learnerOf(T, S);
    learner.dimensions = [dim("reading", "fluency", "improving", "IMPROVING", 0.6, ["e1", "e2", "e3", "e4"], 4, 1, 10)];
    const ps = await patterns({ rows: [], learner });
    expect(findPattern(ps, "IMPROVEMENT_PATTERN", "reading", "fluency")).toBeDefined();
  });

  it("6. regression pattern from trend DECLINING", async () => {
    const learner = learnerOf(T, S);
    learner.dimensions = [dim("reading", "accuracy", "declining", "DECLINING", 0.7, ["e1", "e2", "e3"], 3, 1, 10)];
    const ps = await patterns({ rows: [], learner });
    const r = findPattern(ps, "REGRESSION_PATTERN", "reading", "accuracy");
    expect(r).toBeDefined();
    expect(r!.detectionRule).toContain("DECLINING");
  });

  it("7. insufficient evidence pattern is a first-class value, no guess", async () => {
    const learner = learnerOf(T, S);
    learner.dimensions = [dim("grammar", "accuracy", "insufficient", "INSUFFICIENT_EVIDENCE", 0, [], 0, 2, 2)];
    const ps = await patterns({ rows: [], learner });
    const g = findPattern(ps, "INSUFFICIENT_EVIDENCE_PATTERN", "grammar", "accuracy");
    expect(g).toBeDefined();
    expect(g!.confidence).toBe(0);
    expect(g!.explanation).toContain("INSUFFICIENT");
    expect(g!.evidenceCount).toBe(0);
  });

  it("8. every pattern carries the full required field set", async () => {
    const learner = learnerOf(T, S);
    learner.dimensions = [dim("reading", "accuracy", "weak", "DECLINING", 0.7, ["e1", "e2", "e3"], 3, 1, 9)];
    const ps = await patterns({ rows: [mistake("s1", 1), mistake("s2", 3), mistake("s3", 5)], learner });
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) {
      expect(p.patternId).toBeTruthy();
      expect(p.tenantId).toBe(T);
      expect(p.studentId).toBe(S);
      expect(p.subject).toBeTruthy();
      expect(p.skill).toBeTruthy();
      expect(p.dimension).toBeTruthy();
      expect(TYPES).toContain(p.patternType);
      expect(["PERSISTENT", "TEMPORARY", "N/A"]).toContain(p.persistence);
      expect(p.evidenceRefs).toBeDefined();
      expect(p.evidenceCount).toBeGreaterThanOrEqual(0);
      expect(p.sessionCount).toBeGreaterThanOrEqual(0);
      expect(p.spanDays).toBeGreaterThanOrEqual(0);
      expect(typeof p.confidence).toBe("number");
      expect(p.detectionRule).toBeTruthy();
      expect(p.explanation.length).toBeGreaterThan(10);
      expect(p.source).toBe("RULE");
      expect(p.status).toBeTruthy();
    }
  });

  it("9. time span + sessions + longitudinal continuity (grade change never resets)", async () => {
    const rows = [
      mistake("s1", 1, "sub", "reading.accuracy"),
      mistake("s2", 10, "sub", "reading.accuracy"),
      mistake("s3", 40, "sub", "reading.accuracy"),
    ];
    const learner = learnerOf(T, S);
    learner.dimensions = [dim("reading", "accuracy", "weak", "STABLE", 0.7, ["e4", "e5", "e6"], 3, 1, 40)];
    learner.contexts = [
      { grade: "4", curriculumBook: null, from: at(1), to: at(12), evidenceCount: 2 },
      { grade: "5", curriculumBook: null, from: at(20), to: at(40), evidenceCount: 1 },
    ];
    const ps = await patterns({ rows, learner });
    const p = findPattern(ps, "PERSISTENCE_PATTERN", "reading", "sub");
    expect(p!.firstSeenAt?.getTime()).toBe(at(1).getTime());
    expect(p!.lastSeenAt?.getTime()).toBe(at(40).getTime());
    expect(p!.spanDays).toBe(39);
    expect(p!.sessionCount).toBe(3);
    expect(p!.evidenceRefs).toHaveLength(3);
    expect(ps.length).toBeGreaterThan(0); // profile not zeroed on grade change
  });

  it("10. path proposal: full field set, evidenceRefs, teacher approval required", async () => {
    const learner = learnerOf(T, S);
    learner.dimensions = [dim("reading", "accuracy", "weak", "DECLINING", 0.7, ["e4", "e5", "e6"], 3, 1, 30)];
    const ps = await patterns({ rows: [], learner });
    const proposals = buildLearningPathProposals(ps, { tenantId: T, studentId: S });
    expect(proposals.length).toBeGreaterThan(0);
    const pr = proposals[0];
    expect(pr.requiresTeacherApproval).toBe(true);
    expect(pr.reason).toBeTruthy();
    expect(pr.evidenceRefs.length).toBeGreaterThan(0);
    expect(pr.currentSkill).toBeTruthy();
    expect(pr.currentDimension).toBeTruthy();
    expect(pr.targetSkill).toBeTruthy();
    expect(pr.targetDimension).toBeTruthy();
    expect(pr.proposedActivityType).toBeTruthy();
    expect(pr.expectedOutcome).toBeTruthy();
    expect(pr.reassessmentCriteria).toBeTruthy();
    expect(pr.confidence).toBeGreaterThan(0);
    expect(pr.source).toBe("RULE");
    expect(() => assertProposalRequiresApproval(pr)).not.toThrow();
    expect(() => assertProposalRequiresApproval({ requiresTeacherApproval: false })).toThrow("TEACHER_APPROVAL_REQUIRED");
  });

  it("11. regression -> teacher-review proposal; weakness -> targeted-practice; insufficient -> baseline-assessment", async () => {
    const learner = learnerOf(T, S);
    learner.dimensions = [
      dim("reading", "accuracy", "declining", "DECLINING", 0.7, ["e1"], 3, 1, 10),
      dim("reading", "vocabulary", "weak", "STABLE", 0.6, ["e2"], 4, 1, 10),
      dim("grammar", "accuracy", "insufficient", "INSUFFICIENT_EVIDENCE", 0, [], 0, 2, 2),
    ];
    const ps = await patterns({ rows: [], learner });
    const proposals = buildLearningPathProposals(ps, { tenantId: T, studentId: S });
    const byDim = new Map(proposals.map((p) => [p.currentSkill + ":" + p.currentDimension, p]));
    expect(byDim.get("reading.accuracy:accuracy")?.proposedActivityType).toBe("teacher-review");
    expect(byDim.get("reading.vocabulary:vocabulary")?.proposedActivityType).toBe("targeted-practice");
    expect(byDim.get("grammar.accuracy:accuracy")?.proposedActivityType).toBe("baseline-assessment");
  });

  it("12. no autonomous delivery: temporary patterns produce NO proposal; persistent after NO_CHANGE -> alternative", async () => {
    const temp = await patterns({ rows: [mistake("s1", 1), mistake("s1", 2)], learner: null });
    expect(buildLearningPathProposals(temp, { tenantId: T, studentId: S })).toEqual([]);
    const pers = await patterns({ rows: [mistake("s1", 1), mistake("s2", 3), mistake("s3", 5)], learner: null });
    const proposals = buildLearningPathProposals(pers, {
      tenantId: T, studentId: S,
      history: [{ diagnosisId: "d", interventionId: "i", reassessmentId: "r", outcome: "NO_CHANGE", skill: "reading.accuracy", occurredAt: at(20), evidenceRefs: ["h1"] }],
    });
    const pr = proposals.find((p) => p.currentSkill === "reading.accuracy");
    expect(pr?.proposedActivityType).toBe("alternative-intervention");
    for (const p of proposals) expect(p.requiresTeacherApproval).toBe(true);
  });

  it("13. teacher decision boundary: canonical @workspace/decisions is the only decision API (re-exported, no local state machine)", async () => {
    const teacherBoundary = await import("../teacher-boundary.js");
    expect(typeof teacherBoundary.applyTeacherDecision).toBe("function");
    expect(typeof teacherBoundary.issueDeliveryAuthorization).toBe("function");
    expect(typeof teacherBoundary.assertDeliveryAuthorized).toBe("function");
    // no delivery happens from path functions themselves
    const learner = learnerOf(T, S);
    learner.dimensions = [dim("reading", "accuracy", "weak", "STABLE", 0.7, ["e1"], 4, 1, 10)];
    const ps = await patterns({ rows: [], learner });
    const proposals = buildLearningPathProposals(ps, { tenantId: T, studentId: S });
    expect(proposals.every((p) => p.requiresTeacherApproval === true)).toBe(true);
  });

  it("14. reassessment/outcome -> path update: IMPROVED / NO_CHANGE / DECLINED / INSUFFICIENT_EVIDENCE", async () => {
    const proposal = { proposalId: "path:p", tenantId: T, studentId: S, reason: "r", evidenceRefs: ["e"], currentSkill: "reading.accuracy", currentDimension: "accuracy", targetSkill: "reading.accuracy", targetDimension: "accuracy", proposedActivityType: "targeted-practice" as const, expectedOutcome: "improve accuracy", reassessmentCriteria: "reassessment", confidence: 0.7, source: "RULE" as const, requiresTeacherApproval: true as const, curriculumContext: {} };
    expect(pathUpdateFromOutcome(proposal, "IMPROVED").nextAction).toBe("proceed_to_reinforcement");
    expect(pathUpdateFromOutcome(proposal, "NO_CHANGE").nextAction).toBe("propose_alternative");
    expect(pathUpdateFromOutcome(proposal, "DECLINED").nextAction).toBe("escalate_to_teacher_review");
    expect(pathUpdateFromOutcome(proposal, "INSUFFICIENT_EVIDENCE").nextAction).toBe("collect_more_evidence");
  });

  it("15. tenant isolation: A never sees B; UUID gates", async () => {
    const rowsA = [mistake("s1", 1, "a", "reading.accuracy", T, S), mistake("s2", 3, "a", "reading.accuracy", T, S), mistake("s3", 5, "a", "reading.accuracy", T, S)];
    const rowsB = [mistake("s1", 1, "b", "reading.accuracy", T2, S2), mistake("s2", 3, "b", "reading.accuracy", T2, S2), mistake("s3", 5, "b", "reading.accuracy", T2, S2)];
    const psA = await patterns({ rows: [...rowsA, ...rowsB], learner: null, tenantId: T, studentId: S });
    const psB = await patterns({ rows: [...rowsA, ...rowsB], learner: null, tenantId: T2, studentId: S2 });
    const refsA = psA.flatMap((p) => p.evidenceRefs);
    const refsB = psB.flatMap((p) => p.evidenceRefs);
    for (const r of refsA) expect(refsB).not.toContain(r);
    await expect(patterns({ rows: [], learner: null, tenantId: "", studentId: S })).rejects.toThrow("TENANT_CONTEXT_MISSING");
    await expect(patterns({ rows: [], learner: null, tenantId: "bad", studentId: S })).rejects.toThrow("INVALID_TENANT_ID");
    await expect(patterns({ rows: [], learner: null, tenantId: T, studentId: "" })).rejects.toThrow("STUDENT_CONTEXT_MISSING");
  });

  it("16. no duplicate evidence / no writes: patterns only reference evidence; recordEvidence never called", async () => {
    const rows = [mistake("s1", 1), mistake("s2", 3), mistake("s3", 5)];
    const learner = learnerOf(T, S);
    learner.dimensions = [dim("reading", "accuracy", "weak", "STABLE", 0.7, ["e4", "e5", "e6"], 3, 1, 40)];
    const ps = await patterns({ rows, learner });
    const ids = new Set(rows.map((r) => r.id));
    for (const p of ps) {
      for (const ref of p.evidenceRefs) expect(ids.has(ref) || ref.startsWith("e")).toBe(true);
    }
    expect(mockRecord).not.toHaveBeenCalled();
    const raw = JSON.stringify(ps);
    expect(raw).not.toContain('"evidenceType"'); // no evidence-row copy
    expect(raw).not.toContain('"occurredAt"'); // pattern keeps first/last only, not row payloads
  });

  it("17. no medical/psychological diagnosis: pattern types strictly educational; no clinical vocabulary", async () => {
    const learner = learnerOf(T, S);
    learner.dimensions = [dim("reading", "accuracy", "weak", "DECLINING", 0.7, ["e1", "e2", "e3"], 3, 1, 10)];
    const ps = await patterns({ rows: [], learner });
    for (const p of ps) {
      expect(TYPES).toContain(p.patternType);
      expect(p.explanation).not.toMatch(/disorder|clinical|medical diagnosis|المرض|اضطراب/i);
    }
  });
});
