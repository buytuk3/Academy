/**
 * CORE-17 — End-to-End learning-loop integration (REAL PostgreSQL).
 * Student → Activity → Response → Engines → Measurement → Evidence (canonical
 * writer) → Learner Model → Intelligence → Diagnosis → Proposal → Teacher
 * Decision → Delivery Authorization → Reassessment → Compare → Outcome →
 * Evidence → Updated longitudinal Learner Model. Correlation chain verified.
 * Auto-skips unless CORE17_RUNTIME=1.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { runDictationAttempt } from "@dictation-engine";
import { analyzeNumeracy, recordNumeracyEvidence } from "@numeracy-engine";
import { evaluateAssessment, recordAssessmentEvidence } from "@assessment-engine";
import type { CurriculumContext } from "@workspace/curriculum";

const RUN = process.env.CORE17_RUNTIME === "1";
const d = RUN ? describe : describe.skip;

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const SCHOOL_A = randomUUID();
const SCHOOL_B = randomUUID();
const CLASS_B = randomUUID();
const CLASS_A = randomUUID();
const STUDENT_A = randomUUID();
const STUDENT_B = randomUUID();
const PASSAGE_ID = randomUUID();
const SESSION_1 = randomUUID();
const SESSION_2 = randomUUID();
const TEACHER_ID = randomUUID();
const ATTEMPT_IDS = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const T0 = Date.UTC(2026, 8, 9, 10, 0, 0); // 2026-09-09T10:00Z

let db: any, dbmod: any, recordEvidence: any, buildLearnerModel: any, listEvidenceForStudent: any, getEvidenceChain: any;
let events: any, decisions: any, ll: any, intel: any;

const curriculumDictation: CurriculumContext = {
  tenantId: TENANT_A,
  studentId: STUDENT_A,
  country: "EG",
  language: "ar",
  educationSystem: "EG-NATIONAL",
  educationStage: "primary",
  grade: "Grade 4",
  gradeKey: "EG-PR-04",
  subject: "dictation",
  curriculum: { curriculumId: "cur-eg-ar", version: "2026", title: "EG Arabic 2026" },
  skills: ["dictation.accuracy"],
  dimensions: ["accuracy"],
} as CurriculumContext;

const curriculumMath: CurriculumContext = {
  tenantId: TENANT_A,
  studentId: STUDENT_A,
  country: "EG",
  language: "ar",
  educationSystem: "EG-NATIONAL",
  educationStage: "primary",
  grade: "Grade 5",
  gradeKey: "EG-PR-05",
  subject: "mathematics",
  curriculum: { curriculumId: "cur-eg-math", version: "2026", title: "EG Math 2026" },
  skills: ["mathematics.accuracy"],
  dimensions: ["accuracy"],
} as CurriculumContext;

const dictationPolicy = {
  activityId: "act-dict-1",
  language: "ar" as const,
  inputType: "TEXT" as const,
  responseType: "TYPED" as const,
  responseSource: "keyboard" as const,
  pauseAllowed: true,
  replayAllowed: true,
  maxReplayCount: 2,
  speedControlAllowed: false,
  volumeControlAllowed: false,
  sentenceReplayAllowed: true,
  wordReplayAllowed: true,
  caseSensitive: false,
  comparePunctuation: false,
  curriculum: curriculumDictation,
};

function iso(ms: number): string {
  return new Date(T0 + ms).toISOString();
}

function learningEvent(type: string, payload: any, occurredAt: string, tenantId = TENANT_A, studentId = STUDENT_A) {
  return {
    id: randomUUID(),
    version: 1,
    type,
    occurredAt,
    actor: { id: "system", role: "system" },
    tenantId,
    studentId,
    payload,
  };
}

d("CORE-17 E2E learning loop (real PostgreSQL through the canonical writer)", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    recordEvidence = dbmod.recordEvidence;
    buildLearnerModel = dbmod.buildLearnerModel;
    listEvidenceForStudent = dbmod.listEvidenceForStudent;
    getEvidenceChain = dbmod.getEvidenceChain;
    events = await import("@workspace/events");
    decisions = await import("@workspace/decisions");
    ll = await import("@workspace/learning-loop");
    intel = await import("@workspace/intelligence");
    const { tenantsTable, schoolsTable, classesTable, studentsTable, passagesTable, readingSessionsTable, attemptsTable } = dbmod;
    await db.insert(tenantsTable).values([
      { id: TENANT_A, name: "Tenant A", slug: `ta-${randomUUID()}` },
      { id: TENANT_B, name: "Tenant B", slug: `tb-${randomUUID()}` },
    ]);
    await db.insert(schoolsTable).values([
      { id: SCHOOL_A, tenantId: TENANT_A, name: "School A" },
      { id: SCHOOL_B, tenantId: TENANT_B, name: "School B" },
    ]);
    await db.insert(classesTable).values({ id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "4/B", gradeLevel: "4", academicYear: "2025/2026" });
    await db.insert(classesTable).values({ id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/A", gradeLevel: "4", academicYear: "2025/2026" });
    await db.insert(studentsTable).values([
      { id: STUDENT_A, tenantId: TENANT_A, classId: CLASS_A, firstName: "أحمد", lastName: "الطالب", studentCode: `S-${randomUUID()}` },
      { id: STUDENT_B, tenantId: TENANT_B, classId: CLASS_B, firstName: "سارة", lastName: "اختبار", studentCode: `S-${randomUUID()}` },
    ]);
    await db.insert(passagesTable).values({ id: PASSAGE_ID, tenantId: TENANT_A, classroomId: CLASS_A, title: "قصة قصيرة", text: "كان يا ما كان", difficulty: 3 });
    await db.insert(readingSessionsTable).values([
      { id: SESSION_1, tenantId: TENANT_A, studentId: STUDENT_A },
      { id: SESSION_2, tenantId: TENANT_A, studentId: STUDENT_A },
    ]);
    await db.insert(attemptsTable).values(
      ATTEMPT_IDS.map((id, i) => ({ id, tenantId: TENANT_A, sessionId: i < 4 ? SESSION_1 : SESSION_2, studentId: STUDENT_A, passageId: PASSAGE_ID })),
    );
  }, 60000);

  it("Dictation ×3 → canonical Evidence rows in real DB (accuracy 0.8, Grade 4 context)", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await runDictationAttempt({
        attempt: {
          tenantId: TENANT_A,
          studentId: STUDENT_A,
          activityId: "act-dict-1",
          attemptId: ATTEMPT_IDS[i],
          startedAt: iso(i * 1000),
          submittedAt: iso(i * 1000 + 800),
          replayCount: 0,
          responseDurationMs: 800,
          totalActivityDurationMs: 800,
        },
        prompt: { text: "ذهب الطالب إلى المدرسة", language: "ar" },
        submission: { typedText: "ذهب الطالب إلى المكتبة", source: "keyboard" },
        policy: dictationPolicy,
      });
      expect(r.measurements.accuracy).toBe(0.75); // 3/4 words match («المدرسة»→«المكتبة» substitution)
    }
    const rows = await listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A, evidenceType: "attempt", limit: 50 });
    const dict = rows.filter((r: any) => r.sourceEngine === "dictation-engine");
    expect(dict.length).toBe(3);
    expect(dict[0].subject).toBe("dictation");
    expect(dict[0].grade).toBe("Grade 4");
    expect(dict[0].response.accuracy).toBe(0.75);
  });

  it("Numeracy ×3 → canonical Evidence rows (subject mathematics, accuracy 1)", async () => {
    for (let i = 0; i < 3; i++) {
      const attempt = {
        attemptId: ATTEMPT_IDS[3 + i],
        tenantId: TENANT_A,
        studentId: STUDENT_A,
        activityId: "act-num-1",
        occurredAt: iso(10000 + i * 1000),
        startedAt: iso(10000 + i * 1000),
        submittedAt: iso(10000 + i * 1000 + 500),
        durationMs: 500,
        attemptCount: 1,
      };
      const analysis = analyzeNumeracy({
        attempt,
        task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92" },
        response: { finalAnswer: "92" },
        policy: { language: "en", digitSet: "western" },
      });
      expect(analysis.comparison.finalCorrect).toBe(true);
      await recordNumeracyEvidence({
        attempt,
        measurements: analysis.measurements,
        policy: { language: "en", digitSet: "western", curriculum: curriculumMath },
        comparison: analysis.comparison,
        area: "arithmetic",
      });
    }
    const rows = await listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A, evidenceType: "attempt", limit: 50 });
    const num = rows.filter((r: any) => r.sourceEngine === "numeracy-engine");
    expect(num.length).toBe(3);
    expect(num[0].subject).toBe("mathematics");
    expect(num[0].grade).toBe("Grade 5");
  });

  it("Assessment ×2 → canonical Evidence rows (evidenceType assessment)", async () => {
    const definition = {
      definitionId: "asm-core17",
      title: "Formative Quiz",
      kind: "formative" as const,
      subject: "mathematics",
      targets: { skills: ["mathematics.accuracy"] },
      items: [
        { itemRef: "q1", expectedAnswer: "4", scoring: "exact" as const, weight: 1, dimension: "accuracy" },
        { itemRef: "q2", expectedAnswer: "6", scoring: "exact" as const, weight: 1, dimension: "accuracy" },
      ],
      dimensions: ["accuracy"],
      passThreshold: 0.8,
    };
    for (let i = 0; i < 2; i++) {
      const attempt = {
        attemptId: ATTEMPT_IDS[6 + i],
        tenantId: TENANT_A,
        studentId: STUDENT_A,
        activityId: "act-asm-1",
        occurredAt: iso(20000 + i * 1000),
        startedAt: iso(20000 + i * 1000),
        submittedAt: iso(20000 + i * 1000 + 700),
        durationMs: 700,
        attemptCount: 1,
        curriculum: curriculumMath,
        previousEvidenceRefs: i === 0 ? [ATTEMPT_IDS[0]] : undefined,
      };
      const m = evaluateAssessment(definition, { items: [{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }] }, attempt);
      expect(m.rubricScore).toBe(1);
      expect(m.scoreScope).toBe("assessment");
      await recordAssessmentEvidence({ definition, attempt, measurements: m });
    }
    const rows = await listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A, evidenceType: "assessment", limit: 50 });
    expect(rows.filter((r: any) => r.sourceEngine === "assessment-engine").length).toBe(2);
  });

  it("Reading events → real Outbox → processed → canonical Evidence (response + mistake)", async () => {
    // correlation-wrapped event (Request → Trace → Event chain)
    const corr = { requestId: randomUUID(), correlationId: randomUUID(), jobId: randomUUID() };
    for (let i = 0; i < 3; i++) {
      const ev = learningEvent("StudentResponseRecorded", { skill: "reading.accuracy", accuracy: 0.5, fluency: 0.5 }, iso(30000 + i * 2000));
      await events.publishEvent(ev, i === 0 ? corr : {});
    }
    for (let i = 0; i < 3; i++) {
      const ev = learningEvent("MistakeDetected", { sessionId: i < 2 ? SESSION_1 : SESSION_2, phoneme: "ص", errorType: "substitution", context: "المدرسة", skill: "reading.accuracy" }, iso(40000 + i * 2000));
      await events.publishEvent(ev, {});
    }
    const res = await events.processEventOutbox({ limit: 50 });
    expect(res.failed).toBe(0);
    expect(res.processed).toBeGreaterThanOrEqual(6);
    const rows = await listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A, limit: 100 });
    expect(rows.filter((r: any) => r.evidenceType === "mistake").length).toBe(3);
    expect(rows.filter((r: any) => r.evidenceType === "response" && r.sourceEngine === "reading-engine").length).toBe(3);
  });

  it("Learner Model is multidimensional on real data: reading weak + dictation developing + math strong + insufficient dims — NO single level", async () => {
    await recordEvidence({
      tenantId: TENANT_A,
      studentId: STUDENT_A,
      actorRole: "system",
      occurredAt: new Date(iso(50000)),
      evidenceType: "response",
      subject: "writing",
      response: { spelling: 0.7 },
      result: "0.7",
      sourceEngine: "assessment-engine",
      operationKey: `core17-seed-${randomUUID()}`,
    });
    const model = await buildLearnerModel({ tenantId: TENANT_A, studentId: STUDENT_A });
    const dim = (s: string, dd: string) => model.dimensions.find((x: any) => x.subject === s && x.dimension === dd);
    expect(dim("reading", "accuracy").level).toBe("weak");
    expect(dim("dictation", "accuracy").level).toBe("developing");
    expect(dim("mathematics", "accuracy").level).toBe("strong");
    expect(model.dimensions.filter((x: any) => x.sampleCount < 3).length).toBeGreaterThanOrEqual(1); // insufficient-evidence dims exist
    expect(model.dimensions.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(model)).not.toMatch(/overallScore|studentLevel|globalScore/);
    (globalThis as any).__modelBefore = model;
  });

  it("Learning Intelligence reads real cross-domain evidence → patterns emerge", async () => {
    const patterns = await intel.buildStudentPatterns({ tenantId: TENANT_A, studentId: STUDENT_A });
    expect(patterns.length).toBeGreaterThanOrEqual(1);
    const persistence = patterns.find((p: any) => p.patternType === "PERSISTENCE_PATTERN");
    expect(persistence).toBeDefined();
    expect(persistence.evidenceRefs.length).toBeGreaterThanOrEqual(3); // references only — no copies
  });

  it("Full loop: Detect → Diagnosis → Proposal → Teacher APPROVE → Delivery authorization → Reassessment → Compare → Outcome → Adapt", async () => {
    const rows = await listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A, limit: 100 });
    const signals = await ll.stageDetect({ tenantId: TENANT_A, studentId: STUDENT_A, rows });
    const sig = signals.find((s: any) => s.kind === "repeated-mistake");
    expect(sig).toBeDefined();

    const diagnosis = await ll.createDiagnosis({ tenantId: TENANT_A, studentId: STUDENT_A, signal: sig });
    expect(diagnosis.id).toBeTruthy();

    const proposal = await ll.proposeIntervention({ tenantId: TENANT_A, studentId: STUDENT_A, diagnosis, activityType: "targeted-practice" });
    expect(proposal.status).toBe("PENDING"); // teacher boundary: never auto-delivered

    expect(() => decisions.assertActorCanDecide("student")).toThrow();
    expect(() => decisions.assertActorCanDecide("teacher")).not.toThrow();

    const applied = await decisions.applyTeacherDecision({
      tenantId: TENANT_A,
      proposal,
      decision: { action: "APPROVED", actorId: TEACHER_ID, actorRole: "teacher", decidedAt: new Date(iso(60000)).toISOString(), reason: "موافقة المعلم" },
    });
    expect(applied.proposal.status).toBe("APPROVED");
    expect(applied.authorization).not.toBeNull();

    expect(() =>
      decisions.assertDeliveryAuthorized({ tenantId: TENANT_A, studentId: STUDENT_A, proposalId: proposal.id, activityType: applied.proposal.activityType }, applied.authorization),
    ).not.toThrow();
    expect(() =>
      decisions.assertDeliveryAuthorized({ tenantId: TENANT_A, studentId: STUDENT_B, proposalId: proposal.id, activityType: applied.proposal.activityType }, applied.authorization),
    ).toThrow(); // wrong student → delivery blocked

    // Reassessment evidence: 2 newer reading responses @ 0.9
    for (let i = 0; i < 2; i++) {
      const ev = learningEvent("StudentResponseRecorded", { skill: "reading.accuracy", accuracy: 0.9, fluency: 0.9 }, iso(70000 + i * 2000));
      await events.publishEvent(ev, {});
    }
    await events.processEventOutbox({ limit: 50 });

    const rows2 = await listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A, limit: 100 });
    const reading = rows2
      .filter((r: any) => r.evidenceType === "response" && r.subject === "reading")
      .sort((a: any, b: any) => a.occurredAt.getTime() - b.occurredAt.getTime());
    expect(reading.length).toBe(5);

    const reassessment = await ll.recordReassessment({
      tenantId: TENANT_A,
      studentId: STUDENT_A,
      diagnosis,
      intervention: applied.proposal,
      skill: sig.skill,
      baselineEvidenceRef: reading[0].id,
      reassessmentEvidenceRef: reading[reading.length - 1].id,
      occurredAt: new Date(iso(80000)),
    });
    expect(reassessment.id).toBeTruthy();

    const comparison = ll.compareBeforeAfter({ accuracy: 0.5, fluency: 0.5 }, { accuracy: 0.9, fluency: 0.9 });
    expect(comparison.trend).toBe("improved");
    expect(comparison.sufficientEvidence).toBe(true);
    expect(comparison.noOverallScore).toBe(true);

    const outcome = await ll.recordOutcome({ tenantId: TENANT_A, studentId: STUDENT_A, diagnosis, intervention: applied.proposal, reassessment, comparison });
    expect(outcome.result).toBe("IMPROVED");

    const adapt = ll.adaptNextAction(outcome, 0);
    expect(adapt.action).toBe("continue-progression");
    (globalThis as any).__loop = { diagnosis, proposal: applied.proposal, reassessment, outcome };
  });

  it("Outcome → canonical outcome Evidence + InterventionOutcomeMeasured event → processed", async () => {
    const rows = await listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A, evidenceType: "outcome", limit: 10 });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const loop = (globalThis as any).__loop;
    const evRows = rows.filter((r: any) => r.operationKey === `loop:outcome-ev:${loop.reassessment.id}`);
    expect(evRows.length).toBe(1); // outcome stored as canonical evidence exactly once
    const chain = await getEvidenceChain({ tenantId: TENANT_A, evidenceId: evRows[0].id });
    expect(chain.length).toBeGreaterThanOrEqual(1); // longitudinal reference chain intact
    await events.processEventOutbox({ limit: 50 }); // flush InterventionOutcomeMeasured
  });

  it("Longitudinal continuity: same student, Grade 4 + Grade 5 evidence coexist; model improves without reset", async () => {
    const rows = await listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A, limit: 100 });
    const grades = new Set(rows.map((r: any) => r.grade).filter(Boolean));
    expect(grades.has("Grade 4")).toBe(true);
    expect(grades.has("Grade 5")).toBe(true);

    const model = await buildLearnerModel({ tenantId: TENANT_A, studentId: STUDENT_A });
    const ra = model.dimensions.find((x: any) => x.subject === "reading" && x.dimension === "accuracy");
    expect(ra.sampleCount).toBe(5);
    expect(ra.level === "improving" || ra.trend === "IMPROVING").toBe(true);
  });

  it("Correlation chain persisted: requestId → traceId → correlationId → jobId → evidenceId", async () => {
    const { eventOutboxTable } = dbmod;
    const { eq } = await import("drizzle-orm");
    const all = await db.select().from(eventOutboxTable);
    const mine = all.filter((r: any) => r.tenantId === TENANT_A);
    const withCorr = mine.filter((r: any) => r.requestId && r.correlationId && r.traceId);
    expect(withCorr.length).toBeGreaterThanOrEqual(1);
    const processed = withCorr.find((r: any) => r.status === "processed" && r.evidenceId);
    expect(processed).toBeDefined();
    expect(processed.jobId).toBeTruthy();
    expect(mine.every((r: any) => ["processed", "pending"].includes(r.status))).toBe(true);
    void eq;
  });

  it("PERF baseline (first measurement, no optimization): evidence query / learner projection / intelligence / outbox", async () => {
    const t0 = Date.now();
    await listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A, limit: 200 });
    const evidenceMs = Date.now() - t0;

    const t1 = Date.now();
    await buildLearnerModel({ tenantId: TENANT_A, studentId: STUDENT_A });
    const learnerMs = Date.now() - t1;

    const t2 = Date.now();
    await intel.buildStudentPatterns({ tenantId: TENANT_A, studentId: STUDENT_A });
    const patternsMs = Date.now() - t2;

    const t3 = Date.now();
    await events.processEventOutbox({ limit: 10 });
    const outboxMs = Date.now() - t3;

    console.log(`[CORE-17 PERF] evidence_query=${evidenceMs}ms learner_projection=${learnerMs}ms intelligence_analysis=${patternsMs}ms outbox_processing=${outboxMs}ms`);
    expect(evidenceMs).toBeLessThan(2000);
    expect(learnerMs).toBeLessThan(2000);
    expect(patternsMs).toBeLessThan(2000);
    expect(outboxMs).toBeLessThan(2000);
  });
});
