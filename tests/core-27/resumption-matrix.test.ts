/**
 * CORE-27 / Batch 2R — Resumption identity matrix (ID-R1..R4) + race proofs.
 * EVIDENCE-ONLY: no production file is modified. HEAD must remain 82fb4a6f….
 *
 * Crash simulation (per the authorized plan §4): a stage INSERT SUCCEEDS in
 * PostgreSQL, then the running process "dies" before the identity reaches the
 * next consumer / before the trace completes. Resumption is then exercised in
 * exactly two separated ways:
 *   (a) OFFICIAL resumption — re-run runLearningLoop with the SAME evidence
 *       rows (+ teacher decision where applicable). The productive scenario.
 *   (b) CALLING-CONTRACT probe — the recovering caller re-reads stored rows
 *       from PostgreSQL before invoking the next stage. This is NOT a fix and
 *       hides nothing: it documents which protections hold only under an
 *       (undocumented) calling contract → carried to V-3.
 *
 * Verdict mapping: official-path test RED = R-027-05 defect confirmed for that
 * resumption point. Probe GREEN = DB-level protection sound; identity comes
 * only from DB re-reads (Calling Contract Gap → V-3).
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  db, learningDiagnosesTable, interventionProposalsTable,
  learningReassessmentsTable, learningOutcomesTable, listEvidenceForStudent,
} from "@workspace/db";
import {
  runLearningLoop, detectSignals, createDiagnosis, proposeIntervention,
  recordReassessment, recordOutcome, type LoopTrace,
} from "@workspace/learning-loop";
import { applyTeacherDecision, type TeacherDecision } from "@workspace/decisions";
import type { ComparisonResult } from "@workspace/learning-loop";
import { makeStudent, evidenceRow, type StudentFixture } from "./_helpers.js";

const emitSpy = async (ev: unknown) => ev;
const DECISION = (): TeacherDecision => ({ action: "APPROVED", actorId: randomUUID(), actorRole: "teacher", reason: "c27-2R" });
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** mistake rows (drive detection) + two real assessment rows (enable comparison). */
async function seedEvidence(s: StudentFixture, skill = "reading.fluency") {
  for (let i = 0; i < 3; i++) {
    await evidenceRow(s.tenantId, s.studentId, "mistake", "reading", { skill, errorType: "SUB" }, new Date(Date.UTC(2026, 8, 12, i, 0, 0)));
  }
  await evidenceRow(s.tenantId, s.studentId, "assessment", "reading", { skill, accuracy: 0.40 }, new Date(Date.UTC(2026, 8, 10, 9, 0, 0)));
  await evidenceRow(s.tenantId, s.studentId, "assessment", "reading", { skill, accuracy: 0.80 }, new Date(Date.UTC(2026, 8, 11, 15, 0, 0)));
  return listEvidenceForStudent({ tenantId: s.tenantId, studentId: s.studentId });
}

async function rowCount(table: string, where: string): Promise<number> {
  const res = await db.execute(sql.raw(`SELECT count(*)::int AS c FROM ${table} WHERE ${where}`));
  const list = (Array.isArray(res) ? res : (res as { rows?: Array<{ c: number }> }).rows ?? []) as Array<{ c: number }>;
  return list[0]?.c ?? -1;
}
/** any row whose operation_key embeds a lost identity (the `undefined` poison) */
async function undefinedKeys(...tables: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) out[t] = await rowCount(t, "operation_key LIKE '%undefined%'");
  return out;
}

describe("CORE-27 Batch 2R — resumption identity matrix", () => {
  // ── ID-R1: crash AFTER diagnosis commit, BEFORE proposal ──────────────
  it("ID-R1a: OFFICIAL resumption after crash-post-diagnosis completes without error", async () => {
    const s = await makeStudent("IDR1a");
    const rows = await seedEvidence(s);
    const signal = detectSignals(rows as never).find((x) => x.kind === "repeated-mistake")!;
    await createDiagnosis({ tenantId: s.tenantId, studentId: s.studentId, signal }, emitSpy); // INSERT committed → "process dies"
    let error: string | null = null;
    let trace: LoopTrace | null = null;
    try {
      trace = await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, teacherDecision: DECISION(), emitEvent: emitSpy });
    } catch (e) { error = errMsg(e); }
    console.log("EVIDENCE ID-R1a", JSON.stringify({ officialResumptionError: error, stoppedAt: trace?.stoppedAt ?? null, diagnosisIdRestored: (trace?.diagnosis as { id?: string } | undefined)?.id ?? null }, null, 2));
    // DB integrity — a crash must never corrupt
    expect(await rowCount("learning_diagnoses", `student_id = '${s.studentId}'`)).toBe(1);
    const uk = await undefinedKeys("learning_diagnoses", "intervention_proposals", "learning_reassessments", "learning_outcomes");
    console.log("EVIDENCE ID-R1a undefinedKeys", JSON.stringify(uk));
    expect(Object.values(uk).every((v) => v === 0)).toBe(true);
    // CONTRACT: official resumption must complete — RED = R-027-05 defect proof
    expect(error, `R-027-05: official resumption crashed → ${error}`).toBeNull();
  });

  it("ID-R1b [Calling-Contract probe]: resumption with DB re-read identity → proposal created exactly once", async () => {
    const s = await makeStudent("IDR1b");
    const rows = await seedEvidence(s);
    const signal = detectSignals(rows as never).find((x) => x.kind === "repeated-mistake")!;
    await createDiagnosis({ tenantId: s.tenantId, studentId: s.studentId, signal }, emitSpy); // crash point
    const opKey = `loop:diagnosis:${signal.signalKey}`;
    const stored = (await db.select().from(learningDiagnosesTable).where(eq(learningDiagnosesTable.operationKey, opKey)))[0];
    console.log("EVIDENCE ID-R1b storedDiagnosis", JSON.stringify({ id: stored?.id, operationKey: stored?.operationKey }));
    const proposal = await proposeIntervention({ tenantId: s.tenantId, studentId: s.studentId, diagnosis: stored, activityType: "targeted-practice" }, emitSpy);
    console.log("EVIDENCE ID-R1b proposalIdentity", JSON.stringify({ returnedId: proposal.id ?? null, operationKey: `loop:intervention:${stored.id}`, existed: proposal.existed === true }));
    expect(await rowCount("intervention_proposals", `student_id = '${s.studentId}'`)).toBe(1);
    expect((await undefinedKeys("intervention_proposals")).intervention_proposals).toBe(0);
    const storedP = (await db.select().from(interventionProposalsTable).where(eq(interventionProposalsTable.operationKey, `loop:intervention:${stored.id}`)))[0];
    expect(storedP).toBeDefined();
  });

  // ── ID-R2: crash AFTER proposal commit, BEFORE teacher decision ───────
  it("ID-R2: OFFICIAL resumption after crash-post-proposal (resume WITH decision) completes without error", async () => {
    const s = await makeStudent("IDR2");
    const rows = await seedEvidence(s);
    const first = await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, emitEvent: emitSpy }); // stops at teacher gate
    expect(first.stoppedAt).toBe("teacher-decision");
    let error: string | null = null;
    let trace: LoopTrace | null = null;
    try {
      trace = await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, teacherDecision: DECISION(), emitEvent: emitSpy });
    } catch (e) { error = errMsg(e); }
    console.log("EVIDENCE ID-R2", JSON.stringify({ officialResumptionError: error, stoppedAt: trace?.stoppedAt ?? null }, null, 2));
    // DB integrity: the PENDING proposal from run 1 untouched, no corruption
    expect(await rowCount("learning_diagnoses", `student_id = '${s.studentId}'`)).toBe(1);
    expect(await rowCount("intervention_proposals", `student_id = '${s.studentId}'`)).toBe(1);
    const uk = await undefinedKeys("learning_diagnoses", "intervention_proposals", "learning_reassessments", "learning_outcomes");
    console.log("EVIDENCE ID-R2 undefinedKeys", JSON.stringify(uk));
    expect(Object.values(uk).every((v) => v === 0)).toBe(true);
    expect(error, `R-027-05: official resumption crashed → ${error}`).toBeNull();
  });

  // ── ID-R3: crash AFTER reassessment commit, BEFORE outcome ────────────
  it("ID-R3: OFFICIAL resumption after crash-post-reassessment completes without error", async () => {
    const s = await makeStudent("IDR3");
    const rows = await seedEvidence(s);
    // manual chain up to reassessment (each insert committed, identities re-read like a compliant caller)
    const signal = detectSignals(rows as never).find((x) => x.kind === "repeated-mistake")!;
    await createDiagnosis({ tenantId: s.tenantId, studentId: s.studentId, signal }, emitSpy);
    const diag = (await db.select().from(learningDiagnosesTable).where(eq(learningDiagnosesTable.studentId, s.studentId)))[0];
    const prop = await proposeIntervention({ tenantId: s.tenantId, studentId: s.studentId, diagnosis: diag, activityType: "targeted-practice" }, emitSpy);
    const decision = DECISION(); // ONE logical decision — the resumption retry must reuse the SAME identity (decisions retry contract, decisions.ts:10-12)
    const { proposal: approved } = await applyTeacherDecision({ tenantId: s.tenantId, proposal: prop, decision }, emitSpy);
    const latest = rows.filter((r) => r.evidenceType === "assessment").sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))[0];
    await recordReassessment({
      tenantId: s.tenantId, studentId: s.studentId, diagnosis: diag, intervention: approved,
      skill: diag.skill, activityUsed: approved.activityType,
      baselineEvidenceRef: rows.filter((r) => r.evidenceType === "assessment").sort((a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt))[0].id,
      reassessmentEvidenceRef: latest.id, occurredAt: new Date(latest.occurredAt),
    }, emitSpy); // INSERT committed → "process dies" before outcome
    // OFFICIAL resumption with the same evidence + the SAME decision identity (retry contract):
    let error: string | null = null;
    let trace: LoopTrace | null = null;
    try {
      trace = await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, teacherDecision: decision, emitEvent: emitSpy });
    } catch (e) { error = errMsg(e); }
    console.log("EVIDENCE ID-R3", JSON.stringify({ officialResumptionError: error, stoppedAt: trace?.stoppedAt ?? null }, null, 2));
    // DB integrity: reassessment deduped to one; the resumption now COMPLETES
    // the missing stage (outcome) exactly once — correct post-R-027-05-fix
    // semantics (pre-fix the resumption crashed at proposal, so this expected 0).
    expect(await rowCount("learning_reassessments", `student_id = '${s.studentId}'`)).toBe(1);
    expect(await rowCount("learning_outcomes", `student_id = '${s.studentId}'`)).toBe(1);
    const uk = await undefinedKeys("learning_diagnoses", "intervention_proposals", "learning_reassessments", "learning_outcomes");
    console.log("EVIDENCE ID-R3 undefinedKeys", JSON.stringify(uk));
    expect(Object.values(uk).every((v) => v === 0)).toBe(true);
    expect(error, `R-027-05: official resumption crashed → ${error}`).toBeNull();
  });

  it("ID-R3b [Calling-Contract probe]: reassessment dedupe + outcome completion with re-read identities", async () => {
    const s = await makeStudent("IDR3b");
    const rows = await seedEvidence(s);
    const signal = detectSignals(rows as never).find((x) => x.kind === "repeated-mistake")!;
    await createDiagnosis({ tenantId: s.tenantId, studentId: s.studentId, signal }, emitSpy);
    const diag = (await db.select().from(learningDiagnosesTable).where(eq(learningDiagnosesTable.studentId, s.studentId)))[0];
    const prop = await proposeIntervention({ tenantId: s.tenantId, studentId: s.studentId, diagnosis: diag, activityType: "targeted-practice" }, emitSpy);
    const { proposal: approved } = await applyTeacherDecision({ tenantId: s.tenantId, proposal: prop, decision: DECISION() }, emitSpy);
    const assessments = rows.filter((r) => r.evidenceType === "assessment").sort((a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt));
    const occurredAt = new Date(assessments[assessments.length - 1].occurredAt);
    const rrInput = {
      tenantId: s.tenantId, studentId: s.studentId, diagnosis: diag, intervention: approved,
      skill: diag.skill, activityUsed: approved.activityType,
      baselineEvidenceRef: assessments[0].id, reassessmentEvidenceRef: assessments[assessments.length - 1].id, occurredAt,
    };
    const rr1 = await recordReassessment(rrInput, emitSpy); // committed
    const rr2 = await recordReassessment(rrInput, emitSpy); // conflict path — identity surface
    console.log("EVIDENCE ID-R3b conflictIdentity", JSON.stringify({ returnedId: rr2.id ?? null, existed: rr2.existed === true }));
    // compliant caller re-reads the stored reassessment
    const storedRr = (await db.select().from(learningReassessmentsTable).where(eq(learningReassessmentsTable.studentId, s.studentId)))[0];
    const comparison: ComparisonResult = { indicators: { accuracy: { before: 0.4, after: 0.8, delta: 0.4, direction: "up" } }, trend: "improved", sufficientEvidence: true, noOverallScore: true };
    const outcome = await recordOutcome({ tenantId: s.tenantId, studentId: s.studentId, diagnosis: diag, intervention: approved, reassessment: storedRr, comparison }, emitSpy);
    console.log("EVIDENCE ID-R3b outcomeIdentity", JSON.stringify({ returnedId: outcome.id ?? null }));
    expect(await rowCount("learning_reassessments", `student_id = '${s.studentId}'`)).toBe(1); // dedupe held
    expect(await rowCount("learning_outcomes", `student_id = '${s.studentId}'`)).toBe(1);
    expect(await rowCount("evidence", `operation_key LIKE 'loop:outcome-ev:%' AND student_id = '${s.studentId}'`)).toBe(1); // canonical outcome evidence exactly once (scoped to this student)
  });

  // ── ID-R4: crash AFTER outcome commit (full loop), THEN resume ────────
  it("ID-R4: OFFICIAL resumption after a COMPLETED loop stays duplicate-free (crash signature documented)", async () => {
    const s = await makeStudent("IDR4");
    const rows = await seedEvidence(s);
    const decision = DECISION(); // ONE logical decision shared by run 1 and the resumption (decisions retry contract)
    const first = await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, teacherDecision: decision, emitEvent: emitSpy });
    expect(first.outcome).toBeDefined(); // run 1 completed the full chain
    let error: string | null = null;
    try {
      await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, teacherDecision: decision, emitEvent: emitSpy });
    } catch (e) { error = errMsg(e); }
    console.log("EVIDENCE ID-R4", JSON.stringify({ officialResumptionError: error }, null, 2));
    // DB integrity: the completed chain stays EXACTLY once — resume must not duplicate anything
    expect(await rowCount("learning_diagnoses", `student_id = '${s.studentId}'`)).toBe(1);
    expect(await rowCount("intervention_proposals", `student_id = '${s.studentId}'`)).toBe(1);
    expect(await rowCount("learning_reassessments", `student_id = '${s.studentId}'`)).toBe(1);
    expect(await rowCount("learning_outcomes", `student_id = '${s.studentId}'`)).toBe(1);
    expect(await rowCount("evidence", `operation_key LIKE 'loop:outcome-ev:%' AND student_id = '${s.studentId}'`)).toBe(1);
    const uk = await undefinedKeys("learning_diagnoses", "intervention_proposals", "learning_reassessments", "learning_outcomes");
    expect(Object.values(uk).every((v) => v === 0)).toBe(true);
    expect(error, `R-027-05: official resumption crashed → ${error}`).toBeNull();
  });

  it("ID-R4b [Calling-Contract probe]: outcome conflict path — no duplicate outcome evidence, identity surface logged", async () => {
    const s = await makeStudent("IDR4b");
    const rows = await seedEvidence(s);
    await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, teacherDecision: DECISION(), emitEvent: emitSpy }); // full chain committed
    const diag = (await db.select().from(learningDiagnosesTable).where(eq(learningDiagnosesTable.studentId, s.studentId)))[0];
    const approved = (await db.select().from(interventionProposalsTable).where(eq(interventionProposalsTable.studentId, s.studentId)))[0];
    const storedRr = (await db.select().from(learningReassessmentsTable).where(eq(learningReassessmentsTable.studentId, s.studentId)))[0];
    const comparison: ComparisonResult = { indicators: { accuracy: { before: 0.4, after: 0.8, delta: 0.4, direction: "up" } }, trend: "improved", sufficientEvidence: true, noOverallScore: true };
    const again = await recordOutcome({ tenantId: s.tenantId, studentId: s.studentId, diagnosis: diag, intervention: approved, reassessment: storedRr, comparison }, emitSpy); // conflict path
    console.log("EVIDENCE ID-R4b conflictIdentity", JSON.stringify({ returnedId: again.id ?? null, existed: again.existed === true }));
    expect(await rowCount("learning_outcomes", `student_id = '${s.studentId}'`)).toBe(1); // dedupe held
    expect(await rowCount("evidence", `operation_key LIKE 'loop:outcome-ev:%' AND student_id = '${s.studentId}'`)).toBe(1); // the !existed guard held — no double evidence (scoped)
  });
});

describe("CORE-27 Batch 2R — parallel resumption race proofs", () => {
  it("RACE-1: two PARALLEL OFFICIAL resumptions after partial failure — no corruption", async () => {
    const s = await makeStudent("RACE1");
    const rows = await seedEvidence(s);
    await runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, emitEvent: emitSpy }); // stops at gate: diagnosis+proposal committed
    const decision = DECISION(); // ONE logical decision — both parallel resumptions retry the SAME identity (decisions retry contract)
    const settled = await Promise.allSettled([
      runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, teacherDecision: decision, emitEvent: emitSpy }),
      runLearningLoop({ tenantId: s.tenantId, studentId: s.studentId, rows, teacherDecision: decision, emitEvent: emitSpy }),
    ]);
    const errors = settled.map((r) => (r.status === "rejected" ? errMsg(r.reason) : null));
    console.log("EVIDENCE RACE-1", JSON.stringify({ statuses: settled.map((r) => r.status), errors }, null, 2));
    // DB integrity: parallel official resumption must not corrupt or duplicate
    expect(await rowCount("learning_diagnoses", `student_id = '${s.studentId}'`)).toBe(1);
    expect(await rowCount("intervention_proposals", `student_id = '${s.studentId}'`)).toBe(1);
    const uk = await undefinedKeys("learning_diagnoses", "intervention_proposals", "learning_reassessments", "learning_outcomes");
    expect(Object.values(uk).every((v) => v === 0)).toBe(true);
    // CONTRACT: parallel official resumption must complete — RED = defect proof
    const firstError = errors.find((e) => e !== null) ?? null;
    expect(firstError, `R-027-05: parallel official resumption crashed → ${firstError}`).toBeNull();
  });

  it("RACE-2: two PARALLEL compliant resumptions (re-read identity) — DB race protection holds", async () => {
    const s = await makeStudent("RACE2");
    const rows = await seedEvidence(s);
    const signal = detectSignals(rows as never).find((x) => x.kind === "repeated-mistake")!;
    await createDiagnosis({ tenantId: s.tenantId, studentId: s.studentId, signal }, emitSpy); // committed; crash point
    const stored = (await db.select().from(learningDiagnosesTable).where(eq(learningDiagnosesTable.operationKey, `loop:diagnosis:${signal.signalKey}`)))[0];
    const settled = await Promise.allSettled([
      proposeIntervention({ tenantId: s.tenantId, studentId: s.studentId, diagnosis: stored, activityType: "targeted-practice" }, emitSpy),
      proposeIntervention({ tenantId: s.tenantId, studentId: s.studentId, diagnosis: stored, activityType: "targeted-practice" }, emitSpy),
    ]);
    const ids = settled.map((r) => (r.status === "fulfilled" ? (r.value as { id?: string }).id ?? null : `REJECTED:${errMsg(r.reason)}`));
    console.log("EVIDENCE RACE-2", JSON.stringify({ statuses: settled.map((r) => r.status), returnedIds: ids }, null, 2));
    // DB race protection: exactly ONE proposal row, proper key, no poison
    expect(await rowCount("intervention_proposals", `student_id = '${s.studentId}'`)).toBe(1);
    const storedP = (await db.select().from(interventionProposalsTable).where(eq(interventionProposalsTable.studentId, s.studentId)))[0];
    expect(storedP.operationKey).toBe(`loop:intervention:${stored.id}`);
    expect((await undefinedKeys("intervention_proposals")).intervention_proposals).toBe(0);
    // Calling-Contract surface (documented, NOT hidden): the race loser returns
    // without the restored identity — carried to V-3 as a contract requirement.
    const identityGaps = ids.filter((x) => x === null).length;
    console.log("EVIDENCE RACE-2 callingContractGap", JSON.stringify({ identityGaps, note: "winner has id, loser returns identity-less — DB dedupe held" }));
  });
});
