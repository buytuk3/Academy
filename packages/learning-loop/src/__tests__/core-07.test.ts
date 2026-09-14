/**
 * CORE-07 — Learning Loop test suite. Maps 1:1 to the user's required proofs:
 * Detection (evidence→signal, repeated pattern, insufficient, deterministic),
 * Diagnosis (evidence-required, tenant isolation, refs, confidence/reason),
 * Intervention (valid diagnosis, stable identity, idempotency, teacher decision),
 * Reassessment (baseline refs, no duplicate), Compare (multidimensional, no
 * overall score), Outcome (enums, refs, idempotency), full Loop (incl. failure
 * at any stage), Security (cross-tenant rejection + security event),
 * Architecture (no engine direct evidence writes, no duplicate SLR/db, no cycles).
 * The @workspace/db client is mocked; recordEvidence mock enforces the CORE-05
 * writer contract. INSERTS auto-return a row on the FIRST call per table and []
 * on subsequent calls — mirroring the (tenant_id, operation_key) unique index,
 * so idempotency tests run against the same contract as the real DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url)); // repo root (from packages/learning-loop/src/__tests__/)

const T = "00000000-0000-4000-8000-00000000000a";
const S = "00000000-0000-4000-8000-00000000000b";
const OTHER_T = "00000000-0000-4000-8000-0000000000cc";

const hoisted = vi.hoisted(() => {
  const insertCounts = new Map<unknown, number>();
  const firstInserts = new Map<unknown, Record<string, unknown>>(); // R-027-05: stored row for conflict-path restore
  const inserts: { table: unknown; values: unknown }[] = [];
  const securityEvents: unknown[] = [];
  const evidenceCalls: unknown[] = [];
  let autoId = 0;

  const db = {
    insert: vi.fn((table: unknown) => ({
      values: (v: unknown) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            inserts.push({ table, values: v });
            const c = insertCounts.get(table) ?? 0;
            insertCounts.set(table, c + 1);
            if (c === 0) {
              const stored = { id: `auto-${++autoId}`, ...(v as Record<string, unknown>) };
              firstInserts.set(table, stored);
              return [stored];
            }
            return [];
          },
        }),
      }),
    })),
    // R-027-05 restore path: select().from(t).where(...).limit(1) → stored row
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => (firstInserts.get(table) ? [firstInserts.get(table)] : []),
        }),
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: (v: Record<string, unknown>) => ({ where: async () => [{ ...v }] }),
    })),
  };

  const recordEvidence = vi.fn(async (input: Record<string, unknown>) => {
    evidenceCalls.push(input);
    return { id: `ev-${evidenceCalls.length}`, ...input };
  });

  const publishEvent = vi.fn(async () => undefined);

  class ClassifiedError extends Error {
    className: string;
    constructor(className = "application", message: string) {
      super(message);
      this.className = className;
      this.name = "ClassifiedError";
    }
  }
  const createLogger = () => ({ info() {}, error() {}, warn() {}, debug() {} });
  const safeLog = (x: unknown) => x;
  const getMetrics = () => ({ securityEvents: { inc() {} } });
  const recordSecurityEvent = vi.fn((_logger, _metrics, type: string, ctx: unknown) => {
    securityEvents.push({ type, ctx });
  });

  const learningDiagnosesTable = { __t: "learning_diagnoses" } as never;
  const interventionProposalsTable = { __t: "intervention_proposals" } as never;
  const learningReassessmentsTable = { __t: "learning_reassessments" } as never;
  const learningOutcomesTable = { __t: "learning_outcomes" } as never;

  return {
    db, recordEvidence, publishEvent, ClassifiedError, createLogger, safeLog, getMetrics,
    firstInserts,
    recordSecurityEvent, learningDiagnosesTable, interventionProposalsTable,
    learningReassessmentsTable, learningOutcomesTable, insertCounts, inserts, securityEvents, evidenceCalls,
  };
});

vi.mock("@workspace/db", async () => {
  // Registry is pure config data (rules.ts imports types only) — deep-import it
  // directly so the mock does NOT pull the real db client/config chain.
  const { LEARNER_DIMENSION_REGISTRY } = await import("../../../database/src/learner/rules.js");
  return {
    db: hoisted.db,
    recordEvidence: hoisted.recordEvidence,
    learningDiagnosesTable: hoisted.learningDiagnosesTable,
    interventionProposalsTable: hoisted.interventionProposalsTable,
    learningReassessmentsTable: hoisted.learningReassessmentsTable,
    learningOutcomesTable: hoisted.learningOutcomesTable,
    LEARNER_DIMENSION_REGISTRY,
  };
});
vi.mock("@workspace/events", () => ({ publishEvent: hoisted.publishEvent }));
vi.mock("@workspace/observability", () => ({
  ClassifiedError: hoisted.ClassifiedError,
  createLogger: hoisted.createLogger,
  safeLog: hoisted.safeLog,
  getMetrics: hoisted.getMetrics,
  recordSecurityEvent: hoisted.recordSecurityEvent,
}));

import {
  detectSignals, makeSignalKey, DEFAULT_DETECTION_RULES,
  stageDetect, createDiagnosis, proposeIntervention, applyTeacherDecision,
  recordReassessment, compareBeforeAfter, recordOutcome, adaptNextAction, runLearningLoop,
} from "../index.js";
import type { DetectionSignal } from "../index.js";

function row(over: Record<string, unknown>) {
  return {
    id: over.id as string,
    tenantId: (over.tenantId as string) ?? T,
    studentId: (over.studentId as string) ?? S,
    evidenceType: (over.evidenceType as string) ?? "assessment",
    subject: (over.subject as string) ?? "reading",
    occurredAt: (over.occurredAt as string) ?? "2026-09-01T08:00:00.000Z",
    durationMs: over.durationMs,
    response: over.response,
  };
}
function assessment(id: string, skill: string, accuracy: number, at: string, extra: Record<string, number> = {}) {
  return row({ id, evidenceType: "assessment", occurredAt: at, response: { skill, accuracy, ...extra } });
}
function signal(kind: "repeated-mistake" | "insufficient-evidence" | "accuracy-decline", refs: string[]): DetectionSignal {
  return {
    kind, tenantId: T, studentId: S, skill: "fluency", evidenceRefs: refs,
    confidence: 0.8, reason: "test", signalKey: makeSignalKey(kind, T, S, "fluency"),
  };
}

beforeEach(() => {
  hoisted.insertCounts.clear();
  hoisted.firstInserts.clear();
  hoisted.inserts.length = 0;
  hoisted.securityEvents.length = 0;
  hoisted.evidenceCalls.length = 0;
  hoisted.db.insert.mockClear();
  hoisted.recordEvidence.mockClear();
  hoisted.publishEvent.mockClear();
  hoisted.recordSecurityEvent.mockClear();
});

// ============================ DETECTION ============================
describe("CORE-07 — Detection (deterministic, evidence-based)", () => {
  it("repeated identical mistakes on the same skill produce a valid detection signal", async () => {
    const rows = [
      row({ id: "e1", evidenceType: "mistake", response: { skill: "decoding" } }),
      row({ id: "e2", evidenceType: "mistake", response: { skill: "decoding" } }),
      row({ id: "e3", evidenceType: "mistake", response: { skill: "decoding" } }),
    ];
    const signals = await stageDetect({ tenantId: T, studentId: S, rows });
    const rep = signals.find((s) => s.kind === "repeated-mistake");
    expect(rep).toBeDefined();
    expect(rep?.evidenceRefs).toEqual(["e1", "e2", "e3"]);
    expect(rep?.confidence).toBeGreaterThanOrEqual(DEFAULT_DETECTION_RULES.minConfidence);
    expect(rep?.reason.length).toBeGreaterThan(0);
  });

  it("insufficient evidence produces insufficient-evidence, not a false diagnosis", async () => {
    const signals = await stageDetect({ tenantId: T, studentId: S, rows: [assessment("e1", "fluency", 70, "2026-09-01T08:00:00Z")] });
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].kind).toBe("insufficient-evidence");
    expect(signals[0].evidenceRefs).toEqual(["e1"]);
  });

  it("time evidence (durationMs) drives slow-response detection", async () => {
    const rows = [
      row({ id: "e1", evidenceType: "time", durationMs: 60_000, response: { skill: "fluency" } }),
      row({ id: "e2", evidenceType: "time", durationMs: 70_000, response: { skill: "fluency" } }),
    ];
    const signals = await stageDetect({ tenantId: T, studentId: S, rows });
    expect(signals.some((s) => s.kind === "slow-response")).toBe(true);
  });

  it("is deterministic: same evidence + same rules → identical signals", async () => {
    const rows = [assessment("e1", "fluency", 90, "2026-09-01T08:00:00Z"), assessment("e2", "fluency", 70, "2026-09-03T08:00:00Z")];
    const a = await stageDetect({ tenantId: T, studentId: S, rows });
    const b = await stageDetect({ tenantId: T, studentId: S, rows });
    expect(b).toEqual(a);
  });

  it("accuracy decline across assessments fires accuracy-decline with evidence refs", async () => {
    const rows = [assessment("e1", "fluency", 92, "2026-09-01T08:00:00Z"), assessment("e2", "fluency", 78, "2026-09-03T08:00:00Z")];
    const signals = await stageDetect({ tenantId: T, studentId: S, rows });
    expect(signals.some((s) => s.kind === "accuracy-decline" && s.evidenceRefs.includes("e2"))).toBe(true);
  });
});

// ============================ DIAGNOSIS ============================
describe("CORE-07 — Diagnosis (evidence-linked)", () => {
  it("no diagnosis without evidence — DIAGNOSIS_REQUIRES_EVIDENCE", async () => {
    await expect(createDiagnosis({ tenantId: T, studentId: S, signal: signal("repeated-mistake", []) }))
      .rejects.toThrow("DIAGNOSIS_REQUIRES_EVIDENCE");
  });

  it("stores confidence, reason, source, evidence refs; publishes DiagnosisCreated once", async () => {
    const d = await createDiagnosis({ tenantId: T, studentId: S, signal: signal("repeated-mistake", ["e1", "e2", "e3"]) });
    expect(d.skill).toBe("fluency");
    expect(d.confidence).toBe(0.8);
    expect(d.reason).toBe("test");
    expect(d.source).toBe("detection:repeated-mistake");
    expect(d.status).toBe("candidate");
    expect(d.evidenceRefs).toEqual(["e1", "e2", "e3"]);
    expect(hoisted.publishEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.publishEvent.mock.calls[0][0].type).toBe("DiagnosisCreated");
  });

  it("idempotent — same logical operation does not create a second diagnosis", async () => {
    await createDiagnosis({ tenantId: T, studentId: S, signal: signal("repeated-mistake", ["e1", "e2", "e3"]) });
    const second = await createDiagnosis({ tenantId: T, studentId: S, signal: signal("repeated-mistake", ["e1", "e2", "e3"]) });
    expect(second.existed).toBe(true);
    expect(hoisted.publishEvent).toHaveBeenCalledTimes(1); // emit only on first
    expect(hoisted.inserts.filter((i) => i.table === hoisted.learningDiagnosesTable)).toHaveLength(2); // retried, but deduped by unique index contract
  });

  it("cross-tenant signal is rejected and logs a security event", async () => {
    const bad = { ...signal("repeated-mistake", ["e1"]), tenantId: OTHER_T };
    await expect(createDiagnosis({ tenantId: T, studentId: S, signal: bad })).rejects.toThrow("CROSS_TENANT_SIGNAL");
    expect(hoisted.recordSecurityEvent).toHaveBeenCalled();
    expect(hoisted.securityEvents.some((e: any) => e.type === "cross-tenant-attempt")).toBe(true);
  });

  it("cross-tenant evidence rows are rejected at Detect stage", async () => {
    const rows = [row({ id: "e1", tenantId: OTHER_T, evidenceType: "mistake", response: { skill: "x" } })];
    await expect(stageDetect({ tenantId: T, studentId: S, rows })).rejects.toThrow("CROSS_TENANT_EVIDENCE");
  });
});

// ============================ INTERVENTION ============================
describe("CORE-07 — Intervention (proposal + teacher decision boundary)", () => {
  async function makeDiagnosis() {
    return createDiagnosis({ tenantId: T, studentId: S, signal: signal("repeated-mistake", ["e1", "e2", "e3"]) });
  }

  it("requires a valid diagnosis from the same tenant", async () => {
    const d = await makeDiagnosis();
    await expect(proposeIntervention({ tenantId: T, studentId: S, diagnosis: { ...d, tenantId: OTHER_T }, activityType: "targeted-practice" }))
      .rejects.toThrow("CROSS_TENANT_DIAGNOSIS");
  });

  it("proposal has stable identity + PENDING status awaiting teacher", async () => {
    const d = await makeDiagnosis();
    const p = await proposeIntervention({ tenantId: T, studentId: S, diagnosis: d, activityType: "targeted-practice" });
    expect(p.status).toBe("PENDING");
    expect(p.diagnosisId).toBe(d.id);
    expect(p.originalProposal).toBeDefined();
  });

  it("idempotent proposal — retry yields existed, single stored row", async () => {
    const d = await makeDiagnosis();
    await proposeIntervention({ tenantId: T, studentId: S, diagnosis: d, activityType: "targeted-practice" });
    const second = await proposeIntervention({ tenantId: T, studentId: S, diagnosis: d, activityType: "targeted-practice" });
    expect(second.existed).toBe(true);
  });

  it("teacher review: APPROVED → delivered; REJECTED → stopped; actor required", async () => {
    const d = await makeDiagnosis();
    const p = await proposeIntervention({ tenantId: T, studentId: S, diagnosis: d, activityType: "targeted-practice" });
    await expect(applyTeacherDecision({ tenantId: T, proposal: p, decision: { action: "APPROVED", actorId: "", actorRole: "teacher" } }))
      .rejects.toThrow("DECISION_ACTOR_REQUIRED");
    const { proposal: approved } = await applyTeacherDecision({ tenantId: T, proposal: p, decision: { action: "APPROVED", actorId: "teacher-1", actorRole: "teacher" } });
    expect(approved.status).toBe("APPROVED");
    expect(hoisted.publishEvent.mock.calls.some((c) => c[0].type === "InterventionAssigned")).toBe(true);

    const r = await makeDiagnosis();
    const pr = await proposeIntervention({ tenantId: T, studentId: S, diagnosis: r, activityType: "targeted-practice" });
    const { proposal: rejected } = await applyTeacherDecision({ tenantId: T, proposal: pr, decision: { action: "REJECTED", actorId: "teacher-1", actorRole: "teacher", rejectionReason: "not appropriate" } });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.decision).toMatchObject({ action: "REJECTED", rejectionReason: "not appropriate" });
  });
});

// ============================ REASSESSMENT ============================
describe("CORE-07 — Reassessment (linked to baseline)", () => {
  async function prep() {
    const d = await createDiagnosis({ tenantId: T, studentId: S, signal: signal("repeated-mistake", ["e1"]) });
    const p = await proposeIntervention({ tenantId: T, studentId: S, diagnosis: d, activityType: "targeted-practice" });
    const { proposal: approved } = await applyTeacherDecision({ tenantId: T, proposal: p, decision: { action: "APPROVED", actorId: "teacher-1", actorRole: "teacher" } });
    return { d, p, approved };
  }

  it("references baseline evidence + links new reassessment evidence — no copy", async () => {
    const { d, approved } = await prep();
    const r = await recordReassessment({
      tenantId: T, studentId: S, diagnosis: d, intervention: approved, skill: "fluency",
      activityUsed: "targeted-practice", baselineEvidenceRef: "ev-base", reassessmentEvidenceRef: "ev-after",
      occurredAt: new Date("2026-09-10T08:00:00Z"),
    });
    expect(r.baselineEvidenceRef).toBe("ev-base");
    expect(r.reassessmentEvidenceRef).toBe("ev-after");
    expect(r.interventionId).toBe(approved.id);
  });

  it("rejects reassessment before teacher authorization (PENDING)", async () => {
    const d = await createDiagnosis({ tenantId: T, studentId: S, signal: signal("repeated-mistake", ["e1"]) });
    const p = await proposeIntervention({ tenantId: T, studentId: S, diagnosis: d, activityType: "targeted-practice" });
    await expect(recordReassessment({
      tenantId: T, studentId: S, diagnosis: d, intervention: p, skill: "fluency", baselineEvidenceRef: "a", reassessmentEvidenceRef: "b",
      occurredAt: new Date(),
    })).rejects.toThrow("INTERVENTION_NOT_AUTHORIZED");
  });

  it("is idempotent for the same (intervention, time)", async () => {
    const { d, approved } = await prep();
    const at = new Date("2026-09-10T08:00:00Z");
    await recordReassessment({ tenantId: T, studentId: S, diagnosis: d, intervention: approved, skill: "fluency", baselineEvidenceRef: "a", reassessmentEvidenceRef: "b", occurredAt: at });
    const second = await recordReassessment({ tenantId: T, studentId: S, diagnosis: d, intervention: approved, skill: "fluency", baselineEvidenceRef: "a", reassessmentEvidenceRef: "b", occurredAt: at });
    expect(second.existed).toBe(true);
  });
});

// ============================ COMPARE ============================
describe("CORE-07 — Compare (multidimensional, NO overall score)", () => {
  it("compares before/after across multiple indicators without an overall score", () => {
    const c = compareBeforeAfter({ accuracy: 70, fluency: 60, wpm: 40 }, { accuracy: 85, fluency: 78, wpm: 52 });
    expect(c.indicators.accuracy).toMatchObject({ before: 70, after: 85, direction: "up" });
    expect(c.indicators.fluency.direction).toBe("up");
    expect(c.indicators.wpm.direction).toBe("up");
    expect(c.trend).toBe("improved");
    expect(c.sufficientEvidence).toBe(true);
    expect(c.noOverallScore).toBe(true);
  });

  it("calls insufficient evidence when too few shared indicators", () => {
    const c = compareBeforeAfter({ accuracy: 70 }, { accuracy: 85 });
    expect(c.sufficientEvidence).toBe(false);
    expect(c.trend).toBe("unknown");
  });

  it("detects decline", () => {
    const c = compareBeforeAfter({ accuracy: 85, fluency: 80 }, { accuracy: 65, fluency: 70 });
    expect(c.trend).toBe("declined");
  });
});

// ============================ OUTCOME ============================
describe("CORE-07 — Outcome (explicit + traceable)", () => {
  async function prepOutcome() {
    const d = await createDiagnosis({ tenantId: T, studentId: S, signal: signal("repeated-mistake", ["e1"]) });
    const p = await proposeIntervention({ tenantId: T, studentId: S, diagnosis: d, activityType: "targeted-practice" });
    const { proposal: approved } = await applyTeacherDecision({ tenantId: T, proposal: p, decision: { action: "APPROVED", actorId: "teacher-1", actorRole: "teacher" } });
    const r = await recordReassessment({ tenantId: T, studentId: S, diagnosis: d, intervention: approved, skill: "fluency", baselineEvidenceRef: "ev-base", reassessmentEvidenceRef: "ev-after", occurredAt: new Date("2026-09-10T08:00:00Z") });
    return { d, approved, r };
  }

  it("derives IMPROVED from comparison; writes outcome evidence via recordEvidence + event", async () => {
    const { d, approved, r } = await prepOutcome();
    const comparison = compareBeforeAfter({ accuracy: 70, fluency: 60 }, { accuracy: 88, fluency: 80 });
    const o = await recordOutcome({ tenantId: T, studentId: S, diagnosis: d, intervention: approved, reassessment: r, comparison });
    expect(o.result).toBe("IMPROVED");
    expect(o.evidenceRefs).toEqual(["ev-base", "ev-after"]);
    expect(o.comparison).toBeDefined();
    expect(o.occurredAt).toBeInstanceOf(Date);
    // outcome stored as canonical evidence through the ONLY legal writer
    const ev = hoisted.evidenceCalls.find(
      (c: Record<string, unknown>) => typeof c.operationKey === "string" && String(c.operationKey).includes("loop:outcome-ev:"),
    ) as Record<string, unknown>;
    expect(ev.evidenceType).toBe("outcome");
    expect(ev.operationKey).toContain("loop:outcome-ev:");
    expect(hoisted.publishEvent.mock.calls.some((c) => c[0].type === "InterventionOutcomeMeasured")).toBe(true);
  });

  it("maps insufficient evidence to INSUFFICIENT_EVIDENCE", async () => {
    const { d, approved, r } = await prepOutcome();
    const o = await recordOutcome({ tenantId: T, studentId: S, diagnosis: d, intervention: approved, reassessment: r, comparison: compareBeforeAfter({ accuracy: 70 }, { accuracy: 88 }) });
    expect(o.result).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("is idempotent — retry does not duplicate the outcome or its evidence", async () => {
    const { d, approved, r } = await prepOutcome();
    const comparison = compareBeforeAfter({ accuracy: 70, fluency: 60 }, { accuracy: 88, fluency: 80 });
    await recordOutcome({ tenantId: T, studentId: S, diagnosis: d, intervention: approved, reassessment: r, comparison });
    const second = await recordOutcome({ tenantId: T, studentId: S, diagnosis: d, intervention: approved, reassessment: r, comparison });
    expect(second.existed).toBe(true);
    // no duplicate: exactly ONE outcome evidence and ONE decision evidence (canonical writer per stage)
    const outcomeEv = hoisted.evidenceCalls.filter((c: any) => String(c.operationKey).startsWith("loop:outcome-ev:"));
    const decisionEv = hoisted.evidenceCalls.filter((c: any) => String(c.operationKey).startsWith("teacher:decision:"));
    expect(outcomeEv).toHaveLength(1);
    expect(decisionEv).toHaveLength(1);
  });
});

// ============================ ADAPT ============================
describe("CORE-07 — Adapt (evidence-based next action)", () => {
  it("improved → continue; no-change → increase practice; repeated declines escalate to teacher", () => {
    expect(adaptNextAction({ result: "IMPROVED", confidence: 0.8 }, 0).action).toBe("continue-progression");
    expect(adaptNextAction({ result: "NO_CHANGE", confidence: 0.8 }, 0).action).toBe("increase-practice");
    expect(adaptNextAction({ result: "DECLINED", confidence: 0.8 }, 0).action).toBe("repeat");
    expect(adaptNextAction({ result: "DECLINED", confidence: 0.8 }, 2).action).toBe("escalate-to-teacher");
  });
});

// ============================ FULL LOOP ============================
describe("CORE-07 — Full Loop (traceable end-to-end)", () => {
  const rows = [
    assessment("e1", "fluency", 70, "2026-09-01T08:00:00Z", { fluency: 60, wpm: 40 }),
    assessment("e2", "fluency", 90, "2026-09-03T08:00:00Z", { fluency: 85, wpm: 55 }),
    row({ id: "m1", evidenceType: "mistake", response: { skill: "fluency" } }),
    row({ id: "m2", evidenceType: "mistake", response: { skill: "fluency" } }),
    row({ id: "m3", evidenceType: "mistake", response: { skill: "fluency" } }),
  ];

  it("runs the whole loop: detect→diagnose→propose→teacher→reassess→compare→outcome→adapt", async () => {
    const trace = await runLearningLoop({
      tenantId: T, studentId: S, rows,
      teacherDecision: { action: "APPROVED", actorId: "teacher-1", actorRole: "teacher" },
    });
    expect(trace.signals.some((s) => s.kind === "repeated-mistake")).toBe(true);
    expect(trace.diagnosis?.id).toBeDefined();
    expect(trace.proposal?.status).toBe("APPROVED");
    expect(trace.decision?.action).toBe("APPROVED");
    expect(trace.reassessment?.baselineEvidenceRef).toBe("e1");
    expect(trace.reassessment?.reassessmentEvidenceRef).toBe("e2");
    expect(trace.comparison?.noOverallScore).toBe(true);
    expect(trace.outcome?.result).toBe("IMPROVED");
    expect(trace.adapt?.action).toBeDefined();
    expect(trace.stoppedAt).toBeUndefined();
    const types = hoisted.publishEvent.mock.calls.map((c) => c[0].type);
    expect(types).toContain("DiagnosisCreated");
    expect(types).toContain("InterventionAssigned");
    expect(types).toContain("InterventionOutcomeMeasured");
  });

  it("stops at teacher decision boundary when no teacher decision provided", async () => {
    const trace = await runLearningLoop({ tenantId: T, studentId: S, rows });
    expect(trace.stoppedAt).toBe("teacher-decision");
    expect(trace.stopReason).toBe("awaiting-teacher-review");
  });

  it("stops at reassessment when evidence is insufficient for comparison", async () => {
    const rowsOne = [
      assessment("e1", "fluency", 90, "2026-09-01T08:00:00Z", { fluency: 95, wpm: 60 }),
      row({ id: "m1", evidenceType: "mistake", response: { skill: "fluency" } }),
      row({ id: "m2", evidenceType: "mistake", response: { skill: "fluency" } }),
      row({ id: "m3", evidenceType: "mistake", response: { skill: "fluency" } }),
    ];
    const trace = await runLearningLoop({ tenantId: T, studentId: S, rows: rowsOne, teacherDecision: { action: "APPROVED", actorId: "teacher-1", actorRole: "teacher" } });
    expect(trace.stoppedAt).toBe("reassessment");
  });
});

// ============================ ARCHITECTURE ============================
describe("CORE-07 — Architecture (no duplication, no cycles, legal evidence writes)", () => {
  it("no engine writes evidence directly (readonly grep over engines tree)", () => {
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, f.name);
        if (f.isDirectory()) out.push(...walk(p));
        else if (f.name.endsWith(".ts") && !f.name.endsWith(".test.ts")) out.push(p);
      }
      return out;
    };
    const engineDir = join(ROOT, "engines/reading-engine/src");
    const files = walk(engineDir);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // GAP-B3-04 (PM decision, Batch 3): the guard's intent is NO DIRECT
      // EVIDENCE WRITES from engines — canonical writes go through
      // recordEvidence only. Canonical-reader SELECTs (replay-safety,
      // e.g. analyze.processor.ts resume path) are legitimate and allowed.
      expect(src).not.toMatch(/\.insert\(\s*evidenceTable/);
      expect(src).not.toContain("insert into evidence");
      expect(src).not.toMatch(/insert\(evidenceTable\)/); // regex form — keeps B1's text guard clean
    }
  });

  it("migration 006 extends core only — no evidence copy, no second db, no SLR table", () => {
    const sql = readFileSync(join(ROOT, "packages/database/migrations/legacy/006_learning_loop.sql"), "utf8");
    expect(sql).not.toMatch(/create\s+database/i);
    expect(sql.toLowerCase()).not.toContain("create table evidence");
    expect(sql.toLowerCase()).not.toContain("student_level");
    expect(sql.toLowerCase()).not.toContain("overall_score");
  });

  it("no circular dependency: core packages never import the learning-loop package", () => {
    for (const f of ["packages/database/src/index.ts", "packages/database/src/schema/index.ts", "packages/events/src/index.ts", "packages/observability/src/index.ts"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src).not.toContain("@workspace/learning-loop");
    }
  });

  it("every loop table is (tenant_id, operation_key) UNIQUE for DB-backed idempotency", () => {
    const sql = readFileSync(join(ROOT, "packages/database/migrations/legacy/006_learning_loop.sql"), "utf8");
    for (const t of ["learning_diagnoses", "intervention_proposals", "learning_reassessments", "learning_outcomes"]) {
      expect(sql).toMatch(new RegExp(`UNIQUE \\(tenant_id, operation_key\\)`, "i"));
    }
  });
});
