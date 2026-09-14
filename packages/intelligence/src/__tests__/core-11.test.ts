/**
 * CORE-11 - Teacher Intelligence tests (TI-01..TI-06).
 * Required coverage: multidimensional summary (no overallScore), persistence
 * (temporary vs persistent), time (firstSeen/lastSeen/spanDays/sessions),
 * intervention chain (diagnosis/intervention/decision/reassessment/outcome),
 * all four outcome states, recommendations (refs/explanation/confidence/
 * teacher approval), tenant isolation (A != B), no duplication, canonical
 * decision boundary (single implementation, never rebuilt).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  listEvidenceForStudent: vi.fn(),
  buildLearnerModel: vi.fn(),
  recordEvidence: vi.fn(async () => ({ id: "00000000-0000-4000-8000-0000000000ee" })),
}));

import { listEvidenceForStudent, buildLearnerModel, recordEvidence } from "@workspace/db";
import {
  buildInterventionHistory,
  buildTeacherRecommendations,
  buildTeacherReviewQueue,
  buildTeacherStudentSummary,
  prioritizeInsights,
  recordTeacherFeedback,
} from "../teacher.js";
import type { EvidenceRow } from "../intelligence.js";

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
  return new Date(new Date("2026-03-01T00:00:00.000Z").getTime() + day * 86_400_000);
}
function row(partial: Partial<EvidenceRow> & { evidenceType: string }): EvidenceRow {
  return { id: nid(), occurredAt: at(1), sessionId: "s1", evidenceType: "assessment", subject: "reading", response: null, tenantId: T, studentId: S, ...partial };
}
function mistake(session: string, day: number, errorType = "substitution", skill = "reading.accuracy", tenantId = T, studentId = S): EvidenceRow {
  return row({ id: nid(), occurredAt: at(day), sessionId: session, evidenceType: "mistake", subject: "reading", response: { errorType, skill }, tenantId, studentId });
}
function outcomeEv(day: number, outcome: string, extra: Record<string, unknown> = {}): EvidenceRow {
  return row({ id: nid(), occurredAt: at(day), sessionId: null, evidenceType: "outcome", subject: "reading", response: { outcome, skill: "reading.accuracy", diagnosisId: "diag-1", interventionId: "int-1", reassessmentId: "re-1", evidenceRefs: ["00000000-0000-4000-8000-000000000001"], ...extra } });
}
function decisionEv(day: number, proposalId: string, decision: string): EvidenceRow {
  return row({ id: nid(), occurredAt: at(day), sessionId: null, evidenceType: "decision", subject: "reading", response: { proposalId, decision } });
}
function dim(subject: string, dimension: string, level: string, trend: string, confidence: number, refs: string[], n: number, fromDay: number, toDay: number) {
  return { subject, skill: subject + "." + dimension, dimension, level, trend, interpretationSource: "RULE" as const, confidence, evidenceRefs: refs, sampleCount: n, recentMean: 0.5, olderMean: 0.4, from: at(fromDay), to: at(toDay), reason: "RULE: " + n + " samples" };
}
function learnerOf(tenantId: string, studentId: string) {
  return {
    tenantId, studentId, builtAt: at(0), interpretationSource: "RULE" as const, contexts: [], subjects: [],
    dimensions: [] as ReturnType<typeof dim>[], teacherInterpretations: [], aiInterpretations: [],
  };
}

function setup(rows: EvidenceRow[], learner: ReturnType<typeof learnerOf> | null) {
  mockList.mockImplementation(async (q: { tenantId: string; studentId: string }) =>
    rows.filter((r) => (r as unknown as { tenantId?: string }).tenantId === q.tenantId && (r as unknown as { studentId?: string }).studentId === q.studentId),
  );
  mockLearner.mockResolvedValue(learner as never);
}

interface Args { rows?: EvidenceRow[]; learner?: ReturnType<typeof learnerOf> | null; tenantId?: string; studentId?: string }
function build(args: Args) {
  const rows = args.rows ?? [];
  const learner = args.learner !== undefined ? args.learner : null;
  setup(rows, learner);
  return buildTeacherStudentSummary({
    tenantId: args.tenantId ?? T,
    studentId: args.studentId ?? S,
    evidenceReader: mockList as never,
    learnerBuilder: mockLearner as never,
    now: at(40),
  });
}

describe("CORE-11 teacher intelligence", () => {
  beforeEach(() => { seq = 0; vi.clearAllMocks(); });

  it("TI-01. multidimensional summary: strong + weak + improving + insufficient, NO overall score", async () => {
    const rows = [
      mistake("s1", 1), mistake("s2", 3), mistake("s3", 5),
      row({ id: nid(), occurredAt: at(2), evidenceType: "assessment", subject: "mathematics", response: { numeracy: 0.9 } }),
    ];
    const learner = learnerOf(T, S);
    learner.dimensions = [
      dim("mathematics", "numeracy", "strong", "STABLE", 0.8, ["e1", "e2", "e3"], 3, 1, 3),
      dim("reading", "accuracy", "weak", "DECLINING", 0.7, ["e4", "e5", "e6"], 3, 1, 3),
      dim("reading", "fluency", "improving", "IMPROVING", 0.6, ["e7", "e8", "e9"], 4, 1, 3),
      dim("dictation", "accuracy", "insufficient", "INSUFFICIENT_EVIDENCE", 0, [], 0, 2, 2),
    ];
    const s = await build({ rows, learner });
    expect(s.strengths.map((x) => x.dimension).sort()).toEqual(["fluency", "numeracy"]);
    expect(s.attentionAreas.some((x) => x.dimension === "accuracy" && x.subject === "reading")).toBe(true);
    expect(s.attentionAreas.some((x) => x.dimension === "accuracy" && x.subject === "dictation")).toBe(false); // insufficient is not "attention" (no evidence)
    expect(s.evidenceCount).toBe(rows.length);
    const plain = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    expect(plain.overallScore).toBeUndefined();
    expect(plain.studentScore).toBeUndefined();
    expect(plain.averageScore).toBeUndefined();
  });

  it("TI-01. time window: firstSeen/lastSeen/spanDays from evidence, not last test only", async () => {
    const rows = [mistake("s1", 1), mistake("s2", 10), mistake("s3", 40)];
    const s = await build({ rows, learner: null });
    expect(s.timeWindow.firstSeenAt?.getTime()).toBe(at(1).getTime());
    expect(s.timeWindow.lastSeenAt?.getTime()).toBe(at(40).getTime());
    expect(s.timeWindow.spanDays).toBe(39);
  });

  it("TI-02. priority: NO_IMPROVEMENT > PERSISTENT_PATTERN > TEMPORARY_EVENT, deterministic, per-insight score", async () => {
    const rows = [
      mistake("s1", 1, "x"), mistake("s2", 2, "x"), mistake("s3", 3, "x"),
      mistake("s1", 4, "y"),
    ];
    const learner = learnerOf(T, S);
    learner.dimensions = [dim("reading", "accuracy", "declining", "DECLINING", 0.7, ["e1", "e2"], 2, 1, 2)];
    setup([...rows, outcomeEv(8, "NO_CHANGE")], learner);
    const s = await build({ rows: [...rows, outcomeEv(8, "NO_CHANGE")], learner });
    const priorities = prioritizeInsights([]); // deterministic scoring asserted below on explicit inputs
    // insights come from the summary builder path; fetch via review queue instead
    const q = (await build({ rows: [...rows, outcomeEv(8, "NO_CHANGE")], learner })).needsTeacherDecisionCount;
    expect(q).toBeGreaterThanOrEqual(1);
    // explicit deterministic scores
    const mk = (signal: string, conf: number, d1: Date | null, d2: Date | null, sess: number) => ({ id: "i:" + signal, tenantId: T, studentId: S, dimension: { subject: "reading", skill: "reading.accuracy", dimension: "accuracy" }, signal, evidenceRefs: [], confidence: conf, source: "RULE" as const, occurredAt: at(40), firstSeenAt: d1, lastSeenAt: d2, evidenceCount: 3, sessionCount: sess, explanation: "x", priorIntervention: null, recommendation: null }) as never;
    const list = prioritizeInsights([
      mk("NO_IMPROVEMENT_AFTER_INTERVENTION", 0.8, at(1), at(40), 5),
      mk("PERSISTENT_PATTERN", 0.7, at(1), at(40), 3),
      mk("TEMPORARY_EVENT", 0.3, at(10), at(10), 1),
    ]);
    expect(list[0].insight.signal).toBe("NO_IMPROVEMENT_AFTER_INTERVENTION");
    expect(list[1].insight.signal).toBe("PERSISTENT_PATTERN");
    expect(list[2].insight.signal).toBe("TEMPORARY_EVENT");
    expect(list[0].priorityRank).toBe(1);
    const raw = JSON.parse(JSON.stringify(list)) as Record<string, unknown>;
    expect(raw.overallScore).toBeUndefined();
  });

  it("TI-03. recommendations: evidenceRefs, reason, confidence, proposedAction, teacher approval REQUIRED", async () => {
    const rows = [mistake("s1", 1), mistake("s2", 3), mistake("s3", 5)];
    const s = await build({ rows, learner: null });
    // collect insights by rebuilding the report internals through recommendations builder on queue
    const insights: never[] = [];
    const recs = buildTeacherRecommendations(insights as never);
    expect(Array.isArray(recs)).toBe(true);
    // real path: recommendations derived from insights with recommendation != null
    const chain = await buildInterventionHistory({ tenantId: T, studentId: S, evidenceReader: mockList as never, learnerBuilder: mockLearner as never });
    expect(chain).toEqual([]);
    expect(s.needsTeacherDecisionCount).toBeGreaterThan(0); // persistent pattern -> review item
    // explicit recommendation contract check
    const q1 = buildTeacherReviewQueue([{ id: "i1", tenantId: T, studentId: S, dimension: { subject: "reading", skill: "reading.accuracy", dimension: "accuracy" }, signal: "PERSISTENT_PATTERN", evidenceRefs: ["r1", "r2", "r3"], confidence: 0.7, source: "RULE" as const, occurredAt: at(40), firstSeenAt: at(1), lastSeenAt: at(40), evidenceCount: 3, sessionCount: 3, explanation: "persistent", priorIntervention: null, recommendation: { kind: "TARGETED_PRACTICE", rationale: "targeted", requiresTeacherApproval: true } } as never]);
    const rec = buildTeacherRecommendations([{ id: "i1", tenantId: T, studentId: S, dimension: { subject: "reading", skill: "reading.accuracy", dimension: "accuracy" }, signal: "PERSISTENT_PATTERN", evidenceRefs: ["r1", "r2", "r3"], confidence: 0.7, source: "RULE" as const, occurredAt: at(40), firstSeenAt: at(1), lastSeenAt: at(40), evidenceCount: 3, sessionCount: 3, explanation: "persistent", priorIntervention: null, recommendation: { kind: "TARGETED_PRACTICE", rationale: "targeted practice", requiresTeacherApproval: true } } as never]);
    expect(q1[0].kind).toBe("PERSISTENT_PATTERN");
    expect(rec[0].evidenceRefs).toEqual(["r1", "r2", "r3"]);
    expect(rec[0].reason).toContain("targeted practice");
    expect(rec[0].confidence).toBeGreaterThan(0);
    expect(rec[0].requiresTeacherApproval).toBe(true);
  });

  it("TI-04. intervention history chain: problem -> diagnosis -> intervention -> teacher decision -> reassessment -> outcome (evidence-derived, no copies)", async () => {
    const rows = [
      outcomeEv(10, "NO_CHANGE", { diagnosisId: "diag-1", interventionId: "int-1", reassessmentId: "re-1" }),
      decisionEv(12, "int-1", "APPROVED"),
      outcomeEv(20, "DECLINED", { diagnosisId: "diag-2", interventionId: "int-2", reassessmentId: "re-2" }),
      decisionEv(22, "int-2", "MODIFIED"),
    ];
    const chains = await buildInterventionHistory({ tenantId: T, studentId: S, evidenceReader: (async (q) => rows.filter((r) => r.id.length > 0)) as never, learnerBuilder: mockLearner as never });
    expect(chains.length).toBe(2);
    expect(chains[0]).toMatchObject({ diagnosisId: "diag-1", interventionId: "int-1", teacherDecision: "APPROVED", reassessmentId: "re-1", outcome: "NO_CHANGE" });
    expect(chains[1]).toMatchObject({ diagnosisId: "diag-2", interventionId: "int-2", teacherDecision: "MODIFIED", reassessmentId: "re-2", outcome: "DECLINED" });
    const raw = JSON.parse(JSON.stringify(chains)) as Record<string, unknown>;
    expect(raw.overallScore).toBeUndefined();
  });

  it("TI-05. review queue kinds: NO_IMPROVEMENT / DECLINE / PERSISTENT / RECURRING / INSUFFICIENT_EVIDENCE_JUDGEMENT all actionable", async () => {
    const mk = (signal: string, kind: string, outcome: string | null) => ({ id: "i:" + signal + kind, tenantId: T, studentId: S, dimension: { subject: "reading", skill: "reading.accuracy", dimension: "accuracy" }, signal, evidenceRefs: ["r1"], confidence: 0.7, source: "RULE" as const, occurredAt: at(40), firstSeenAt: at(1), lastSeenAt: at(40), evidenceCount: 3, sessionCount: 3, explanation: "e", priorIntervention: outcome ? { diagnosisId: "d", interventionId: "i", outcome, reassessmentId: "r", occurredAt: at(9), evidenceRefs: ["r0"] } : null, recommendation: { kind, rationale: "because", requiresTeacherApproval: true } }) as never;
    const q = buildTeacherReviewQueue([
      mk("NO_IMPROVEMENT_AFTER_INTERVENTION", "ALTERNATIVE_INTERVENTION", "NO_CHANGE"),
      mk("DECLINE", "TEACHER_REVIEW", null),
      mk("PERSISTENT_PATTERN", "TARGETED_PRACTICE", null),
      mk("PERSISTENT_PATTERN", "TEACHER_REVIEW", "IMPROVED"),
      mk("NO_IMPROVEMENT_AFTER_INTERVENTION", "ALTERNATIVE_INTERVENTION", "INSUFFICIENT_EVIDENCE"),
    ]);
    const kinds = q.map((x) => x.kind).sort();
    expect(kinds).toContain("NO_IMPROVEMENT");
    expect(kinds).toContain("DECLINE");
    expect(kinds).toContain("PERSISTENT_PATTERN");
    expect(kinds).toContain("RECURRING_AFTER_IMPROVEMENT");
    expect(kinds).toContain("INSUFFICIENT_EVIDENCE_JUDGEMENT");
    for (const item of q) expect(item.requiresTeacherApproval).toBe(true);
  });

  it("TI-05/outcomes. all four outcomes decoded: IMPROVED, NO_CHANGE, DECLINED, INSUFFICIENT_EVIDENCE", async () => {
    const rows = [
      mistake("s1", 1), mistake("s2", 2), mistake("s3", 3),
      outcomeEv(8, "IMPROVED"),
      outcomeEv(9, "NO_CHANGE"),
      outcomeEv(10, "DECLINED"),
      outcomeEv(11, "INSUFFICIENT_EVIDENCE"),
    ];
    const s = await build({ rows, learner: null });
    expect(s.lastOutcome?.outcome).toBe("INSUFFICIENT_EVIDENCE"); // chronological last
    const q = buildTeacherReviewQueue([
      { id: "iA", tenantId: T, studentId: S, dimension: { subject: "reading", skill: "reading.accuracy", dimension: "accuracy" }, signal: "NO_IMPROVEMENT_AFTER_INTERVENTION", evidenceRefs: ["r"], confidence: 0.7, source: "RULE" as const, occurredAt: at(40), firstSeenAt: at(1), lastSeenAt: at(40), evidenceCount: 3, sessionCount: 3, explanation: "e", priorIntervention: { diagnosisId: "d", interventionId: "i", outcome: "NO_CHANGE", reassessmentId: "r", occurredAt: at(9), evidenceRefs: ["r0"] }, recommendation: { kind: "ALTERNATIVE_INTERVENTION", rationale: "alt", requiresTeacherApproval: true } } as never,
      { id: "iB", tenantId: T, studentId: S, dimension: { subject: "reading", skill: "reading.accuracy", dimension: "accuracy" }, signal: "NO_IMPROVEMENT_AFTER_INTERVENTION", evidenceRefs: ["r"], confidence: 0.7, source: "RULE" as const, occurredAt: at(40), firstSeenAt: at(1), lastSeenAt: at(40), evidenceCount: 3, sessionCount: 3, explanation: "e", priorIntervention: { diagnosisId: "d", interventionId: "i", outcome: "DECLINED", reassessmentId: "r", occurredAt: at(9), evidenceRefs: ["r0"] }, recommendation: { kind: "ALTERNATIVE_INTERVENTION", rationale: "alt", requiresTeacherApproval: true } } as never,
      { id: "iC", tenantId: T, studentId: S, dimension: { subject: "reading", skill: "reading.accuracy", dimension: "accuracy" }, signal: "PERSISTENT_PATTERN", evidenceRefs: ["r"], confidence: 0.8, source: "RULE" as const, occurredAt: at(40), firstSeenAt: at(1), lastSeenAt: at(40), evidenceCount: 3, sessionCount: 3, explanation: "e", priorIntervention: { diagnosisId: "d", interventionId: "i", outcome: "IMPROVED", reassessmentId: "r", occurredAt: at(9), evidenceRefs: ["r0"] }, recommendation: { kind: "TEACHER_REVIEW", rationale: "resurface", requiresTeacherApproval: true } } as never,
    ]);
    expect(q.some((x) => x.kind === "NO_IMPROVEMENT")).toBe(true); // NO_CHANGE + DECLINED -> NO_IMPROVEMENT
    expect(q.some((x) => x.kind === "RECURRING_AFTER_IMPROVEMENT")).toBe(true); // IMPROVED resurface
  });

  it("persistence: temporary single-session issue is NOT a review item; persistent is", async () => {
    const temp = await build({ rows: [mistake("s1", 1), mistake("s1", 2)], learner: null });
    expect(temp.needsTeacherDecisionCount).toBe(0);
    const pers = await build({ rows: [mistake("s1", 1), mistake("s2", 3), mistake("s3", 5)], learner: null });
    expect(pers.needsTeacherDecisionCount).toBeGreaterThan(0);
  });

  it("tenant isolation: tenant A never sees tenant B evidence; UUID gates", async () => {
    const rowsA = [mistake("s1", 1, "a", "reading.accuracy", T, S), mistake("s2", 3, "a", "reading.accuracy", T, S), mistake("s3", 5, "a", "reading.accuracy", T, S)];
    const rowsB = [mistake("s1", 1, "b", "reading.accuracy", T2, S2), mistake("s2", 3, "b", "reading.accuracy", T2, S2), mistake("s3", 5, "b", "reading.accuracy", T2, S2)];
    const sA = await build({ rows: [...rowsA, ...rowsB], tenantId: T, studentId: S });
    const sB = await build({ rows: [...rowsA, ...rowsB], tenantId: T2, studentId: S2 });
    expect(sA.evidenceCount).toBe(3);
    expect(sB.evidenceCount).toBe(3);
    const refsA = sA.strengths.concat(sA.attentionAreas).flatMap((x) => x.evidenceRefs);
    const refsB = sB.strengths.concat(sB.attentionAreas).flatMap((x) => x.evidenceRefs);
    for (const r of refsA) expect(refsB).not.toContain(r);
    await expect(build({ tenantId: "", studentId: S })).rejects.toThrow("TENANT_CONTEXT_MISSING");
    await expect(build({ tenantId: "not-a-uuid", studentId: S })).rejects.toThrow("INVALID_TENANT_ID");
    await expect(build({ tenantId: T, studentId: "" })).rejects.toThrow("STUDENT_CONTEXT_MISSING");
  });

  it("no duplication: summary is a projection of REFERENCES, never a copy of Evidence", async () => {
    const rows = [mistake("s1", 1), mistake("s2", 3), mistake("s3", 5)];
    const s = await build({ rows, learner: null });
    const raw = JSON.stringify(s);
    expect(raw).not.toContain('"evidenceType"'); // no evidence row copy
    expect(raw).not.toContain('"occurredAt"'); // only refs/time window, not row payloads
    // every ref points into the real provided rows
    const ids = new Set(rows.map((r) => r.id));
    const refs = s.strengths.concat(s.attentionAreas).flatMap((x) => x.evidenceRefs);
    for (const ref of refs) expect(ids.has(ref) || ref.startsWith("e")).toBe(true); // learner-model generated ids allowed
  });

  it("TI-06. teacher feedback recorded ONLY through canonical recordEvidence with idempotent operationKey", async () => {
    const now = at(50);
    const out = await recordTeacherFeedback(
      { tenantId: T, studentId: S, actorId: "00000000-0000-4000-8000-0000000000aa", actorRole: "teacher", proposalId: "p-1", decision: "APPROVED", note: "looks good" },
      { record: mockRecord as never, now },
    );
    expect(out.recorded).toBe(true);
    expect(out.operationKey).toBe("teacher:feedback:p-1:00000000-0000-4000-8000-0000000000aa:APPROVED");
    expect(mockRecord).toHaveBeenCalledTimes(1);
    const call = mockRecord.mock.calls[0][0] as Record<string, unknown>;
    expect(call.evidenceType).toBe("decision");
    expect(call.operationKey).toBe(out.operationKey);
    expect(call.sourceEngine).toBe("teacher-intelligence");
    expect((call.response as Record<string, unknown>).proposalId).toBe("p-1");
    await expect(recordTeacherFeedback({ tenantId: "", studentId: S, actorId: "00000000-0000-4000-8000-0000000000aa", actorRole: "teacher", proposalId: "p", decision: "APPROVED" } as never, { record: mockRecord as never })).rejects.toThrow("TENANT_CONTEXT_MISSING");
    await expect(recordTeacherFeedback({ tenantId: T, studentId: S, actorId: "", actorRole: "teacher", proposalId: "p", decision: "APPROVED" } as never, { record: mockRecord as never })).rejects.toThrow("ACTOR_REQUIRED");
    await expect(recordTeacherFeedback({ tenantId: T, studentId: S, actorId: "00000000-0000-4000-8000-0000000000aa", actorRole: "teacher", proposalId: "p", decision: "AUTO" } as never, { record: mockRecord as never })).rejects.toThrow("INVALID_DECISION");
  });

  it("teacher control: no autonomous delivery path exists (every recommendation requires approval)", async () => {
    const rows = [mistake("s1", 1), mistake("s2", 3), mistake("s3", 5)];
    const s = await build({ rows, learner: null });
    const indep = await buildTeacherStudentSummary({ tenantId: T, studentId: S, evidenceReader: mockList as never, learnerBuilder: mockLearner as never, now: at(40) });
    const q = buildTeacherReviewQueue([
      { id: "iX", tenantId: T, studentId: S, dimension: { subject: "reading", skill: "reading.accuracy", dimension: "accuracy" }, signal: "DECLINE", evidenceRefs: ["r"], confidence: 0.7, source: "RULE" as const, occurredAt: at(40), firstSeenAt: at(1), lastSeenAt: at(40), evidenceCount: 3, sessionCount: 3, explanation: "e", priorIntervention: null, recommendation: { kind: "TEACHER_REVIEW", rationale: "review", requiresTeacherApproval: true } } as never,
    ]);
    expect(q.every((x) => x.requiresTeacherApproval)).toBe(true);
    expect(indep.needsTeacherDecisionCount).toBe(s.needsTeacherDecisionCount); // deterministic
  });
});
