/**
 * CORE-27 / Batch 2 — Matrix B (runtime part): architectural protections.
 * ALL of these MUST PASS. Any failure = immediate batch stop.
 * Real PostgreSQL + real Redis. No mocks.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  db, learningDiagnosesTable, interventionProposalsTable,
  recordEvidence, listEvidenceForStudent,
} from "@workspace/db";
import {
  runLearningLoop, stageDetect, createDiagnosis, proposeIntervention,
  detectSignals,
} from "@workspace/learning-loop";
import { applyTeacherDecision, assertDeliveryAuthorized, type TeacherDecision } from "@workspace/decisions";
import { makeStudent, evidenceRow, type StudentFixture } from "./_helpers.js";

const emitSpy = async (ev: unknown) => ev;

const DECISION = (reason: string): TeacherDecision => ({
  action: "APPROVED", actorId: randomUUID(), actorRole: "teacher", reason,
});

async function countRows(table: typeof learningDiagnosesTable | typeof interventionProposalsTable, key: string): Promise<number> {
  const res = await db.execute(sql`SELECT count(*)::int AS c FROM ${table} WHERE operation_key = ${key}`);
  const list = (Array.isArray(res) ? res : (res as { rows?: Array<{ c: number }> }).rows ?? []) as Array<{ c: number }>;
  return list[0].c;
}

describe("CORE-27 Batch 2 — Matrix B: protections (must all pass)", () => {
  // ── B2: no delivery without an APPROVED teacher decision ─────────────
  it("B2-a: loop without a teacher decision stops at teacher-decision and leaves proposal PENDING", async () => {
    const s: StudentFixture = await makeStudent("B2a");
    for (let i = 0; i < 3; i++) {
      await evidenceRow(s.tenantId, s.studentId, "mistake", "reading", { skill: "reading.fluency", errorType: "SUB" }, new Date(Date.UTC(2026, 8, 12, i, 0, 0)));
    }
    const rows = await listEvidenceForStudent({ tenantId: s.tenantId, studentId: s.studentId });
    const trace = await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, emitEvent: emitSpy });
    expect(trace.stoppedAt).toBe("teacher-decision");
    expect(trace.stopReason).toBe("awaiting-teacher-review");
    expect(trace.proposal).toBeDefined();
    // proposal persisted as PENDING — nothing delivered
    const inDb = await db.select().from(interventionProposalsTable).where(eq(interventionProposalsTable.id, (trace.proposal as { id: string }).id));
    expect(inDb[0]?.status).toBe("PENDING");
  });

  it("B2-b: REJECTED decision stops the loop — no reassessment, no outcome", async () => {
    const s: StudentFixture = await makeStudent("B2b");
    for (let i = 0; i < 3; i++) {
      await evidenceRow(s.tenantId, s.studentId, "mistake", "reading", { skill: "reading.fluency", errorType: "SUB" }, new Date(Date.UTC(2026, 8, 12, i, 0, 0)));
    }
    const rows = await listEvidenceForStudent({ tenantId: s.tenantId, studentId: s.studentId });
    const trace = await runLearningLoop({
      tenantId: s.tenantId, studentId: s.studentId, rows, emitEvent: emitSpy,
      teacherDecision: { action: "REJECTED", actorId: randomUUID(), actorRole: "teacher", rejectionReason: "not appropriate" },
    });
    expect(trace.stoppedAt).toBe("teacher-decision");
    expect(trace.stopReason).toBe("rejected-by-teacher");
    expect(trace.reassessment).toBeUndefined();
    expect(trace.outcome).toBeUndefined();
  });

  // ── B3: no side execution path — delivery only through the bound authorization ──
  it("B3: delivery without a matching authorization is rejected (gate lives in decisions capability)", async () => {
    const s: StudentFixture = await makeStudent("B3");
    const { proposal } = await seedDiagnosisAndProposal(s, "reading.fluency");
    const decision = DECISION("B3 approve");
    const { authorization } = await applyTeacherDecision({ tenantId: s.tenantId, proposal, decision }, emitSpy);
    expect(authorization).not.toBeNull();
    // exact match passes
    expect(() => assertDeliveryAuthorized(
      { tenantId: s.tenantId, studentId: s.studentId, proposalId: proposal.id, activityType: proposal.activityType },
      authorization,
    )).not.toThrow();
    // ANY mismatch (student / tenant / proposal / activity) is rejected
    expect(() => assertDeliveryAuthorized(
      { tenantId: s.tenantId, studentId: randomUUID(), proposalId: proposal.id, activityType: proposal.activityType },
      authorization,
    )).toThrowError(/DELIVERY_AUTHORIZATION_MISMATCH/);
  });

  // ── B4: tenant / student / skill / evidenceType isolation ────────────
  it("B4-tenant: mixed-tenant rows are refused at detection (CROSS_TENANT_EVIDENCE)", async () => {
    const a = await makeStudent("B4A");
    const b = await makeStudent("B4B");
    // real evidence rows for each student (each through the canonical writer)
    await evidenceRow(a.tenantId, a.studentId, "mistake", "reading", { skill: "reading.fluency", errorType: "SUB" }, new Date());
    await evidenceRow(b.tenantId, b.studentId, "mistake", "reading", { skill: "reading.fluency", errorType: "SUB" }, new Date());
    const rowsA = await listEvidenceForStudent({ tenantId: a.tenantId, studentId: a.studentId });
    const rowsB = await listEvidenceForStudent({ tenantId: b.tenantId, studentId: b.studentId });
    expect(rowsA.length).toBe(1);
    expect(rowsB.length).toBe(1);
    await expect(stageDetect({ tenantId: a.tenantId, studentId: a.studentId, rows: [...rowsA, ...rowsB] }))
      .rejects.toThrowError(/CROSS_TENANT/);
  });

  it("B4-student: diagnoses of student X never appear for student Y (same school, same tenant)", async () => {
    const s1 = await makeStudent("B4S1");
    const s2 = await makeStudent("B4S2"); // same tenant, different student
    for (let i = 0; i < 3; i++) {
      await evidenceRow(s1.tenantId, s1.studentId, "mistake", "reading", { skill: "reading.fluency", errorType: "SUB" }, new Date(Date.UTC(2026, 8, 12, i, 0, 0)));
    }
    const rows1 = await listEvidenceForStudent({ tenantId: s1.tenantId, studentId: s1.studentId });
    await runLearningLoop({ tenantId: s1.tenantId, studentId: s1.studentId, rows: rows1, emitEvent: emitSpy });
    const dx1 = await db.select().from(learningDiagnosesTable).where(eq(learningDiagnosesTable.studentId, s1.studentId));
    const dx2 = await db.select().from(learningDiagnosesTable).where(eq(learningDiagnosesTable.studentId, s2.studentId));
    expect(dx1.length).toBeGreaterThanOrEqual(1);
    expect(dx2.length).toBe(0); // zero leakage
  });

  it("B4-skill: identical signals on different skills produce DIFFERENT signalKeys/diagnoses", async () => {
    const rows = [
      mkRow("mistake", "reading", { skill: "reading.fluency" }),
      mkRow("mistake", "reading", { skill: "reading.fluency" }),
      mkRow("mistake", "reading", { skill: "reading.fluency" }),
      mkRow("mistake", "math", { skill: "mathematics.numeracy" }),
      mkRow("mistake", "math", { skill: "mathematics.numeracy" }),
      mkRow("mistake", "math", { skill: "mathematics.numeracy" }),
    ];
    const signals = detectSignals(rows as never);
    const bySkill = signals.filter((x) => x.kind === "repeated-mistake").map((x) => x.skill).sort();
    expect(bySkill).toEqual(["mathematics.numeracy", "reading.fluency"]); // two separate signals, never merged
  });

  it("B4-evidenceType: assessment rows never count as repeated mistakes", async () => {
    const rows = [
      mkRow("assessment", "reading", { skill: "reading.fluency", accuracy: 0.9 }),
      mkRow("assessment", "reading", { skill: "reading.fluency", accuracy: 0.9 }),
      mkRow("assessment", "reading", { skill: "reading.fluency", accuracy: 0.9 }),
      mkRow("assessment", "reading", { skill: "reading.fluency", accuracy: 0.9 }),
      mkRow("mistake", "reading", { skill: "reading.fluency", errorType: "SUB" }),
      mkRow("mistake", "reading", { skill: "reading.fluency", errorType: "SUB" }),
    ];
    const signals = detectSignals(rows as never);
    expect(signals.filter((x) => x.kind === "repeated-mistake")).toHaveLength(0); // only 2 real mistakes < threshold 3
  });

  it("B4-opKey: same operationKey in TWO tenants → both stored; same tenant → exactly one row", async () => {
    const t1 = await makeStudent("B4T1");
    const t2 = await makeStudent("B4T2");
    const opKey = `c27-opkey:${randomUUID()}`;
    const r1 = await recordEvidence({ tenantId: t1.tenantId, studentId: t1.studentId, actorRole: "system", evidenceType: "response", subject: "x", sourceEngine: "c27-proof", operationKey: opKey } as never);
    const r2 = await recordEvidence({ tenantId: t2.tenantId, studentId: t2.studentId, actorRole: "system", evidenceType: "response", subject: "x", sourceEngine: "c27-proof", operationKey: opKey } as never);
    expect(r1.id).toBeTruthy();
    expect(r2.id).toBeTruthy();
    const res = await db.execute(sql`SELECT tenant_id FROM evidence WHERE operation_key = ${opKey}`);
    const list = (Array.isArray(res) ? res : (res as { rows?: Array<{ tenant_id: string }> }).rows ?? []) as Array<{ tenant_id: string }>;
    const tenantIds = list.map((r) => r.tenant_id).sort();
    expect(tenantIds).toEqual([t1.tenantId, t2.tenantId].sort()); // uniqueness is (tenant_id, operation_key) — cross-tenant same key is legal by design
    // duplicate INSIDE one tenant → deduped
    await recordEvidence({ tenantId: t1.tenantId, studentId: t1.studentId, actorRole: "system", evidenceType: "response", subject: "x", sourceEngine: "c27-proof", operationKey: opKey } as never);
    const res2 = await db.execute(sql`SELECT count(*)::int AS c FROM evidence WHERE operation_key = ${opKey} AND tenant_id = ${t1.tenantId}`);
    const list2 = (Array.isArray(res2) ? res2 : (res2 as { rows?: Array<{ c: number }> }).rows ?? []) as Array<{ c: number }>;
    expect(list2[0].c).toBe(1);
  });

  // ── B7: idempotency + concurrency + retry (DB-backed, not just {existed}) ──
  it("B7-1: two CONCURRENT identical diagnoses → exactly ONE row", async () => {
    const s = await makeStudent("B7a");
    const signal = { kind: "repeated-mistake" as const, tenantId: s.tenantId, studentId: s.studentId, skill: "reading.fluency", evidenceRefs: ["e1", "e2", "e3"], confidence: 0.8, reason: "c27", signalKey: `detect:repeated-mistake:${s.tenantId}:${s.studentId}:reading.fluency` };
    const [r1, r2] = await Promise.all([
      createDiagnosis({ tenantId: s.tenantId, studentId: s.studentId, signal }, emitSpy),
      createDiagnosis({ tenantId: s.tenantId, studentId: s.studentId, signal }, emitSpy),
    ]);
    const opKey = `loop:diagnosis:${signal.signalKey}`;
    expect(await countRows(learningDiagnosesTable, opKey)).toBe(1); // DB-backed: exactly ONE row under concurrency
    expect(r1.existed !== r2.existed || r1.id === r2.id).toBe(true); // one inserted, one deduped
  });

  it("B7-2r: retry after timeout — prescribed order: DB count → re-read stored row → strict identity", async () => {
    const s = await makeStudent("B7b2R");
    const signal = { kind: "repeated-mistake" as const, tenantId: s.tenantId, studentId: s.studentId, skill: "reading.fluency", evidenceRefs: ["e1"], confidence: 0.8, reason: "c27", signalKey: `detect:repeated-mistake:${s.tenantId}:${s.studentId}:reading.fluency` };
    const first = await createDiagnosis({ tenantId: s.tenantId, studentId: s.studentId, signal }, emitSpy); // "timed out" — caller lost the response
    const retry = await createDiagnosis({ tenantId: s.tenantId, studentId: s.studentId, signal }, emitSpy);
    const opKey = `loop:diagnosis:${signal.signalKey}`;
    // (1) DB row count FIRST — dedupe proof must not depend on the returned object
    const dbCount = await countRows(learningDiagnosesTable, opKey);
    console.log("EVIDENCE B7-2r dbCount", dbCount);
    expect(dbCount).toBe(1);
    // (2) re-read the STORED row from PostgreSQL
    const stored = (await db.select().from(learningDiagnosesTable).where(eq(learningDiagnosesTable.operationKey, opKey)))[0];
    console.log("EVIDENCE B7-2r storedRow", JSON.stringify({ id: stored?.id, operationKey: stored?.operationKey }));
    expect(stored).toBeDefined();
    // (3) STRICT identity: the retry object must carry the SAME restored id
    console.log("EVIDENCE B7-2r identities", JSON.stringify({ retryId: retry.id ?? null, storedId: stored.id, firstId: first.id ?? null, existed: retry.existed === true }));
    expect(retry.id).toBeDefined(); // ← FAILS today = R-027-05 (conflict path drops identity)
    expect(retry.id).toBe(stored.id);
    expect(retry.id).toBe(first.id);
  });

  it("B7-3: two different skills → two independent proposals", async () => {
    const s = await makeStudent("B7c");
    const mk = (skill: string) => ({ kind: "repeated-mistake" as const, tenantId: s.tenantId, studentId: s.studentId, skill, evidenceRefs: ["e1"], confidence: 0.8, reason: "c27", signalKey: `detect:repeated-mistake:${s.tenantId}:${s.studentId}:${skill}` });
    const d1 = await createDiagnosis({ tenantId: s.tenantId, studentId: s.studentId, signal: mk("reading.fluency") }, emitSpy);
    const d2 = await createDiagnosis({ tenantId: s.tenantId, studentId: s.studentId, signal: mk("mathematics.numeracy") }, emitSpy);
    const p1 = await proposeIntervention({ tenantId: s.tenantId, studentId: s.studentId, diagnosis: d1, activityType: "targeted-practice" }, emitSpy);
    const p2 = await proposeIntervention({ tenantId: s.tenantId, studentId: s.studentId, diagnosis: d2, activityType: "targeted-practice" }, emitSpy);
    expect(p1.id).not.toBe(p2.id);
    expect(await countRows(interventionProposalsTable, `loop:intervention:${d1.id}`)).toBe(1);
    expect(await countRows(interventionProposalsTable, `loop:intervention:${d2.id}`)).toBe(1);
  });

  it("B7-4: failure after evidence, before loop result → rerun converges without duplicates (official path: runLearningLoop)", async () => {
    const s = await makeStudent("B7d");
    for (let i = 0; i < 3; i++) {
      await evidenceRow(s.tenantId, s.studentId, "mistake", "reading", { skill: "reading.fluency", errorType: "SUB" }, new Date(Date.UTC(2026, 8, 12, i, 0, 0)));
    }
    const rows = await listEvidenceForStudent({ tenantId: s.tenantId, studentId: s.studentId });
    // run #1 — crashes after diagnosis+proposal (no teacher decision → stops at gate)
    await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, emitEvent: emitSpy });
    // run #2 — the RERUN after the "crash": same evidence rows, same tenant/student.
    // Expected protection: converges (dedupe) WITHOUT duplicates and without errors.
    const rerun = await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, emitEvent: emitSpy });
    expect(rerun.stoppedAt).toBe("teacher-decision");
    // exactly one diagnosis + one proposal for this logical case
    const dx = await db.select().from(learningDiagnosesTable).where(eq(learningDiagnosesTable.studentId, s.studentId));
    const pp = await db.select().from(interventionProposalsTable).where(eq(interventionProposalsTable.studentId, s.studentId));
    expect(dx).toHaveLength(1);
    expect(pp).toHaveLength(1);
  });

  it("B7-5: teacher decision retry → same decisionId, no duplicate decision evidence, same authorizationId", async () => {
    const s = await makeStudent("B7e");
    const { proposal } = await seedDiagnosisAndProposal(s, "reading.fluency");
    const decision: TeacherDecision = { action: "APPROVED", actorId: randomUUID(), actorRole: "teacher", reason: "B7-5" };
    const first = await applyTeacherDecision({ tenantId: s.tenantId, proposal, decision }, emitSpy);
    expect(first.existed).toBe(false);
    expect(first.authorization).not.toBeNull();
    // realistic retry: the recovering caller RE-READS the proposal from the DB
    // (never trusts a stale in-memory object), then re-applies the same decision.
    const fresh = (await db.select().from(interventionProposalsTable).where(eq(interventionProposalsTable.id, proposal.id)))[0];
    const second = await applyTeacherDecision({ tenantId: s.tenantId, proposal: fresh, decision }, emitSpy);
    expect(second.existed).toBe(true);
    expect(second.decisionId).toBe(first.decisionId);
    expect(second.authorization?.authorizationId).toBe(first.authorization?.authorizationId);
    // decision evidence stored exactly once (operationKey = decisionId)
    const res = await db.execute(sql`SELECT count(*)::int AS c FROM evidence WHERE operation_key = ${first.decisionId}`);
    const list = (Array.isArray(res) ? res : (res as { rows?: Array<{ c: number }> }).rows ?? []) as Array<{ c: number }>;
    expect(list[0].c).toBe(1);
  });
});

// ── shared B helpers ───────────────────────────────────────────────────
function mkRow(evidenceType: string, subject: string, response: unknown) {
  return { id: randomUUID(), tenantId: randomUUID(), studentId: randomUUID(), evidenceType, subject, response, occurredAt: new Date().toISOString(), durationMs: null };
}

async function seedDiagnosisAndProposal(s: StudentFixture, skill: string) {
  for (let i = 0; i < 3; i++) {
    await evidenceRow(s.tenantId, s.studentId, "mistake", "reading", { skill, errorType: "SUB" }, new Date(Date.UTC(2026, 8, 12, i, 0, 0)));
  }
  const rows = await listEvidenceForStudent({ tenantId: s.tenantId, studentId: s.studentId });
  const trace = await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, emitEvent: emitSpy }); // stops at teacher gate
  return { proposal: trace.proposal!, trace };
}
