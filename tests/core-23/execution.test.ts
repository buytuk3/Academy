/**
 * CORE-23 — Learning Execution & Real Student Learning Flow Foundation.
 * REAL PostgreSQL + Redis (canonical migrations 0000..0003 — ZERO new tables).
 *
 * Matrix (23 spec): lifecycle state machine, context validation (curriculum
 * version mandatory), exercise→engine single binding, Student Access chain
 * (teacher class / other school / school admin / organization-individual /
 * student self / other student), religion policy (CORE-20 config reuse),
 * REAL dictation-engine execution → canonical Evidence, orchestrator fallback
 * evidence, idempotency (retry + concurrency → single evidence row),
 * multidimensional time evidence, audit trail (activity.started/submitted),
 * outbox continuity (no new event bus), Learner Model continuity, learning
 * loop + teacher decision boundary + delivery authorization, transfer safety
 * (A→B→A evidence immutability), synthetic scale (1000+ schools, no hard
 * limits), performance baselines, no-new-tables, no-AI scan.
 * Auto-skips unless CORE23_RUNTIME=1.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";

const RUN = process.env.CORE23_RUNTIME === "1";
const d = RUN ? describe : describe.skip;

const TENANT_M = randomUUID();
const TENANT_X = randomUUID();
let dbmod: any, db: any, dictation: any, events: any, decisions: any, ll: any;

let MINISTRY: any, DIR_1: any, DIR_2: any;
let SCHOOL_A = randomUUID(), SCHOOL_B = randomUUID(), SCHOOL_X = randomUUID();
const CLASS_4A = randomUUID(), CLASS_4B = randomUUID(), CLASS_X = randomUUID();
let USER_PRINCIPAL_A: string, USER_TEACHER_A: string, USER_TEACHER_B: string;
const ID_1 = `c23-id1-${randomUUID()}`, ID_2 = `c23-id2-${randomUUID()}`;
let STUDENT_A: string, STUDENT_B: string, STUDENT_X: string, IDENTITY_1: string;
const ATTEMPT_D = randomUUID(), SESSION_D = randomUUID(), PASSAGE_A = randomUUID();
const T0 = Date.UTC(2026, 8, 10, 9, 0, 0); // 2026-09-10T09:00Z
const iso = (ms: number) => new Date(T0 + ms).toISOString();

// ===== CORE-21 activity definitions (references — unchanged owners) =====
const anchorDict = {
  country: "EG", educationSystem: "EG-NATIONAL", stageKey: "PRIMARY", gradeLevel: "4", gradeKey: "EG-PR-04",
  subject: "dictation", curriculumId: "cur-eg-ar", curriculumVersion: "2026",
  bookId: "bk-ar-4", unitId: "u3", lessonId: "l7", objectiveId: "obj-77", skill: "dictation.accuracy", dimension: "accuracy",
};
const ACT_DICT: any = {
  activityId: `act-c23-dict-${randomUUID()}`, tenantId: TENANT_M, schoolId: "",
  curriculum: anchorDict, activityType: "DICTATION", expectedResponseType: "TYPED", status: "ACTIVE", version: 1,
};
const ACT_GENERIC: any = {
  activityId: `act-c23-gen-${randomUUID()}`, tenantId: TENANT_M, schoolId: "",
  curriculum: { ...anchorDict, subject: "reading", skill: "reading.accuracy" },
  activityType: "PRACTICE", expectedResponseType: "TYPED", status: "ACTIVE", version: 1,
};
const curriculumDictation = {
  tenantId: TENANT_M, studentId: "", country: "EG", language: "ar", educationSystem: "EG-NATIONAL",
  educationStage: "primary", grade: "Grade 4", gradeKey: "EG-PR-04", subject: "dictation",
  curriculum: { curriculumId: "cur-eg-ar", version: "2026", title: "EG Arabic 2026" },
  book: { bookId: "bk-ar-4", bookTitle: "كتاب اللغة العربية — الصف الرابع" },
  unit: { unitId: "u3", unitTitle: "الوحدة الثالثة" },
  lesson: { lessonId: "l7", lessonTitle: "إملاء الوحدة الثالثة" },
  objective: { objectiveId: "obj-77", objectiveText: "كتابة النص المسموع إملائيًا", skills: ["dictation.accuracy"], dimensions: ["accuracy"] },
  skills: ["dictation.accuracy"], dimensions: ["accuracy"],
} as any;
const dictationPolicy = {
  activityId: ACT_DICT.activityId, language: "ar" as const, inputType: "TEXT" as const,
  responseType: "TYPED" as const, responseSource: "keyboard" as const,
  pauseAllowed: true, replayAllowed: true, maxReplayCount: 2, speedControlAllowed: false,
  volumeControlAllowed: false, sentenceReplayAllowed: true, wordReplayAllowed: true,
  caseSensitive: false, comparePunctuation: false, curriculum: curriculumDictation,
};

function learningEvent(type: string, payload: any, occurredAt: string, studentId = "") {
  return { id: randomUUID(), version: 1, type, occurredAt, actor: { id: "system", role: "system" }, tenantId: TENANT_M, studentId, payload };
}

d("CORE-23 execution foundation (real PostgreSQL)", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    dictation = await import("@dictation-engine");
    events = await import("@workspace/events");
    decisions = await import("@workspace/decisions");
    ll = await import("@workspace/learning-loop");
    const { tenantsTable, usersTable, schoolsTable, classesTable, studentsTable, passagesTable, readingSessionsTable, attemptsTable } = dbmod;
    await db.insert(tenantsTable).values([
      { id: TENANT_M, name: "وزارة C23", slug: `c23-m-${randomUUID()}` },
      { id: TENANT_X, name: "إدارة X", slug: `c23-x-${randomUUID()}` },
    ]);
    USER_PRINCIPAL_A = randomUUID(); USER_TEACHER_A = randomUUID(); USER_TEACHER_B = randomUUID();
    await db.insert(usersTable).values([
      { id: USER_PRINCIPAL_A, tenantId: TENANT_M, firstName: "ع", lastName: "مدير", email: `p-${randomUUID()}@x.test`, passwordHash: "x", role: "principal" },
      { id: USER_TEACHER_A, tenantId: TENANT_M, firstName: "أ", lastName: "معلم A", email: `ta-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" },
      { id: USER_TEACHER_B, tenantId: TENANT_M, firstName: "ب", lastName: "معلم B", email: `tb-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" },
    ]);
    MINISTRY = (await dbmod.createOrganization({ tenantId: TENANT_M, type: "MINISTRY", name: "الوزارة", operationKey: `c23-min-${randomUUID()}` })).organization;
    const GOV = (await dbmod.createOrganization({ tenantId: TENANT_M, type: "GOVERNORATE", name: "المحافظة", parentOrganizationId: MINISTRY.id, operationKey: `c23-g-${randomUUID()}` })).organization;
    DIR_1 = (await dbmod.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: "مديرية 1", parentOrganizationId: GOV.id, operationKey: `c23-d1-${randomUUID()}` })).organization;
    DIR_2 = (await dbmod.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: "مديرية 2", parentOrganizationId: GOV.id, operationKey: `c23-d2-${randomUUID()}` })).organization;
    await dbmod.createSchool({ tenantId: TENANT_M, name: "مدرسة A", code: `A-${randomUUID().slice(0, 6)}`, organizationId: DIR_1.id, operationKey: `c23-sa-${randomUUID()}` }).then((r: any) => { SCHOOL_A = r.school.id; });
    await dbmod.createSchool({ tenantId: TENANT_M, name: "مدرسة B", code: `B-${randomUUID().slice(0, 6)}`, organizationId: DIR_2.id, operationKey: `c23-sb-${randomUUID()}` }).then((r: any) => { SCHOOL_B = r.school.id; });
    await db.insert(schoolsTable).values({ id: SCHOOL_X, tenantId: TENANT_X, name: "مدرسة X" });
    await db.insert(classesTable).values([
      { id: CLASS_4A, tenantId: TENANT_M, schoolId: SCHOOL_A, name: "4A", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
      { id: CLASS_4B, tenantId: TENANT_M, schoolId: SCHOOL_B, name: "4B", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
      { id: CLASS_X, tenantId: TENANT_X, schoolId: SCHOOL_X, name: "X1", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
    ]);
    ACT_DICT.schoolId = SCHOOL_A; ACT_GENERIC.schoolId = SCHOOL_A;
    const id1 = await dbmod.createIdentity({ operationKey: ID_1 });
    IDENTITY_1 = id1.identityId;
    await dbmod.createIdentity({ operationKey: ID_2 });
    STUDENT_A = randomUUID(); STUDENT_B = randomUUID(); STUDENT_X = randomUUID();
    await db.insert(studentsTable).values([
      { id: STUDENT_A, tenantId: TENANT_M, classId: CLASS_4A, identityId: IDENTITY_1, firstName: "أحمد", lastName: "الطالب", studentCode: `S-${randomUUID()}` },
      { id: STUDENT_B, tenantId: TENANT_M, classId: CLASS_4B, firstName: "سارة", lastName: "الطالبة", studentCode: `S-${randomUUID()}` },
      { id: STUDENT_X, tenantId: TENANT_X, classId: CLASS_X, identityId: IDENTITY_1, firstName: "أحمد", lastName: "بعد النقل", studentCode: `S-${randomUUID()}` },
    ]);
    await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_M, studentId: STUDENT_A, schoolId: SCHOOL_A, classId: CLASS_4A, operationKey: `c23-m1-${randomUUID()}` });
    await db.insert(passagesTable).values({ id: PASSAGE_A, tenantId: TENANT_M, classroomId: CLASS_4A, title: "قصة قصيرة", text: "كان يا ما كان", difficulty: 3 });
    await db.insert(readingSessionsTable).values({ id: SESSION_D, tenantId: TENANT_M, studentId: STUDENT_A });
    await db.insert(attemptsTable).values({ id: ATTEMPT_D, tenantId: TENANT_M, sessionId: SESSION_D, studentId: STUDENT_A, passageId: PASSAGE_A });
  });

  it("1. lifecycle state machine: full walk + invalid transitions rejected (23-B, pure)", async () => {
    const dbmod2 = await import("@workspace/db");
    const walk: string[] = [];
    let s = "CREATED";
    for (const ev of ["start", "begin", "submit", "measure", "record"] as const) {
      s = dbmod2.applyAttemptEvent(s, ev);
      walk.push(s);
    }
    expect(walk).toEqual(["STARTED", "IN_PROGRESS", "SUBMITTED", "MEASURED", "EVIDENCE_RECORDED"]);
    // invalid: skip steps, restart terminal, unknown order
    expect(() => dbmod2.applyAttemptEvent("CREATED", "submit")).toThrow(/INVALID_TRANSITION/);
    expect(() => dbmod2.applyAttemptEvent("MEASURED", "start")).toThrow(/INVALID_TRANSITION/);
    expect(() => dbmod2.applyAttemptEvent("EVIDENCE_RECORDED", "record")).toThrow(/INVALID_TRANSITION/);
  });

  it("2. execution context validation: curriculumVersion mandatory + bad contexts rejected (23-A)", async () => {
    const base = {
      tenantId: TENANT_M, studentId: STUDENT_A, activityId: ACT_GENERIC.activityId,
      curriculumVersion: "2026", stageKey: "PRIMARY", gradeLevel: "4", subject: "reading",
      attemptNumber: 1, startedAt: iso(0),
    };
    expect(() => dbmod.validateExecutionContext(base as any)).not.toThrow();
    expect(() => dbmod.validateExecutionContext({ ...base, curriculumVersion: undefined } as any)).toThrow(/CURRICULUM_VERSION_REQUIRED/);
    expect(() => dbmod.validateExecutionContext({ ...base, tenantId: "not-a-uuid" } as any)).toThrow(/EXECUTION_CONTEXT_REQUIRED/);
    expect(() => dbmod.validateExecutionContext({ ...base, submittedAt: iso(-1000) } as any)).toThrow(/INVALID_TRANSITION/);
    expect(() => dbmod.validateExecutionContext({ ...base, attemptNumber: 0 } as any)).toThrow(/EXECUTION_CONTEXT_REQUIRED/);
  });

  it("3. exercise binding: ONE engine per exercise; conflict + non-ACTIVE denied (23-C)", () => {
    const resolution = { exerciseId: "ex-1", engineBinding: "DICTATION" as const, expectedResponseType: "TYPED", status: "ACTIVE" as const };
    expect(dbmod.resolveExerciseBinding(ACT_DICT, resolution)).toBe("DICTATION");
    expect(() => dbmod.resolveExerciseBinding({ ...ACT_DICT, expectedResponseType: "VOICE" }, resolution)).toThrow(/ENGINE_BINDING_CONFLICT/);
    expect(() => dbmod.resolveExerciseBinding(ACT_DICT, { ...resolution, status: "RETIRED" })).toThrow(/EXECUTION_DENIED/);
  });

  it("4. access chain: teacher → OWN class student ALLOW (23-H)", async () => {
    const ctx = await dbmod.assertExecutionAccess({
      subject: { tenantId: TENANT_M, userId: USER_TEACHER_A, staffMemberships: [{ role: "teacher", scopeType: "CLASS", scopeId: CLASS_4A, schoolId: SCHOOL_A, organizationId: null }] },
      definition: ACT_DICT,
      studentId: STUDENT_A,
    });
    expect(ctx.classId).toBe(CLASS_4A);
    expect(ctx.schoolId).toBe(SCHOOL_A);
    expect(ctx.identityId).toBe(IDENTITY_1);
  });

  it("5. access chain: teacher → OTHER school student DENY (23-H)", async () => {
    await expect(dbmod.assertExecutionAccess({
      subject: { tenantId: TENANT_M, userId: USER_TEACHER_B, staffMemberships: [{ role: "teacher", scopeType: "CLASS", scopeId: CLASS_4B, schoolId: SCHOOL_B, organizationId: null }] },
      definition: ACT_DICT,
      studentId: STUDENT_A,
    })).rejects.toThrow(/ACTIVITY_ACCESS/);
  });

  it("6. access chain: principal SCHOOL ALLOW; ORGANIZATION individual DENY (23-H/21-M)", async () => {
    const principal = await dbmod.assertExecutionAccess({
      subject: { tenantId: TENANT_M, userId: USER_PRINCIPAL_A, staffMemberships: [{ role: "principal", scopeType: "SCHOOL", scopeId: SCHOOL_A, schoolId: SCHOOL_A, organizationId: null }] },
      definition: ACT_DICT,
      studentId: STUDENT_A,
    });
    expect(principal.classId).toBe(CLASS_4A);
    await expect(dbmod.assertExecutionAccess({
      subject: { tenantId: TENANT_M, userId: randomUUID(), staffMemberships: [{ role: "admin", scopeType: "ORGANIZATION", scopeId: MINISTRY.id, organizationId: MINISTRY.id, schoolId: null }] },
      definition: ACT_DICT,
      studentId: STUDENT_A,
    })).rejects.toThrow(/ACTIVITY_ACCESS_NOT_AUTHORIZED/);
  });

  it("7. access chain: student SELF via ownStudentId ALLOW; other student DENY (23-H)", async () => {
    await expect(dbmod.assertExecutionAccess({
      subject: { tenantId: TENANT_M, userId: STUDENT_A, staffMemberships: [], ownStudentId: STUDENT_A },
      definition: ACT_DICT,
      studentId: STUDENT_A,
    })).resolves.toBeTruthy();
    await expect(dbmod.assertExecutionAccess({
      subject: { tenantId: TENANT_M, userId: STUDENT_A, staffMemberships: [], ownStudentId: STUDENT_A },
      definition: ACT_DICT,
      studentId: STUDENT_B,
    })).rejects.toThrow(/ACTIVITY_ACCESS_DENIED_OTHER_STUDENT/);
  });

  it("8. religion policy: CORE-20 config reused — religious content w/o pathway DENIED (23-R)", () => {
    expect(() => dbmod.assertContentPolicyAllowed(
      { tenantId: TENANT_M, studentId: STUDENT_A, stageKey: "PRIMARY" },
      { subject: "arabic-language", contentType: "religious-education", religiousContext: "ISLAMIC" },
    )).toThrow(/EXECUTION_DENIED/); // fail-closed, no studentReligiousContext
    expect(() => dbmod.assertContentPolicyAllowed(
      { tenantId: TENANT_M, studentId: STUDENT_A, stageKey: "PRIMARY" },
      { subject: "arabic-language", contentType: "grammar" },
    )).not.toThrow(); // non-religious: ALLOW
  });

  it("9. REAL dictation engine execution via adapter → canonical Evidence in PostgreSQL (23-D/23-E)", async () => {
    const dictationAdapter = async (req: any) => {
      const r = await dictation.runDictationAttempt({
        attempt: {
          tenantId: req.context.tenantId, studentId: req.context.studentId,
          actorId: req.actor.actorId, actorRole: "student",
          activityId: req.context.activityId, sessionId: SESSION_D, attemptId: ATTEMPT_D,
          startedAt: req.context.startedAt, submittedAt: req.context.submittedAt, replayCount: 0,
        },
        prompt: req.engineInput.prompt,
        submission: req.engineInput.submission,
        policy: req.engineInput.policy,
        evidenceWriter: req.recordEvidence,
      });
      return {
        engine: "DICTATION" as const,
        measurements: { ...(r.measurements as any) },
        confidence: (r.measurements as any).accuracy,
        durationMs: 5000,
        response: { accuracy: (r.measurements as any).accuracy },
        evidenceRef: (r.evidence as any)?.id as string,
      };
    };
    const trace = await dbmod.executeAttempt({
      actor: { actorId: STUDENT_A, actorRole: "student" },
      context: {
        tenantId: TENANT_M, schoolId: SCHOOL_A, studentId: STUDENT_A, identityId: IDENTITY_1,
        activityId: ACT_DICT.activityId, curriculumVersion: "2026", curriculumId: "cur-eg-ar",
        stageKey: "PRIMARY", gradeLevel: "4", subject: "dictation", lessonId: "l7", objectiveId: "obj-77",
        skill: "dictation.accuracy", dimension: "accuracy", attemptNumber: 1,
        startedAt: iso(0), submittedAt: iso(5000), durationMs: 5000,
        time: { activityDurationMs: 5000, responseDurationMs: 3200, thinkingDurationMs: 1200, pauseDurationMs: 400, replayDurationMs: 200 },
      },
      definition: ACT_DICT,
      resolution: { exerciseId: "ex-dict-1", engineBinding: "DICTATION" as const, expectedResponseType: "TYPED", status: "ACTIVE" as const },
      adapters: { DICTATION: dictationAdapter },
      engineInput: { prompt: { text: "المدرسة", language: "ar", source: "TEACHER_TEXT" }, submission: { typedText: "المدرسة", source: "keyboard" }, policy: dictationPolicy },
      subject: { tenantId: TENANT_M, userId: STUDENT_A, staffMemberships: [], ownStudentId: STUDENT_A },
    });
    expect(trace.lifecycle).toEqual(["CREATED", "STARTED", "IN_PROGRESS", "SUBMITTED", "MEASURED", "EVIDENCE_RECORDED"]);
    expect(trace.engine).toBe("DICTATION");
    expect(trace.evidenceRef).toBeTruthy();
    // the evidence row REALLY exists in canonical Evidence, tenant-owned
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 50 });
    const row = rows.find((r: any) => r.id === trace.evidenceRef);
    expect(row).toBeDefined();
    expect(row.sourceEngine).toBe("dictation-engine");
    expect(row.activityId).toBe(ACT_DICT.activityId);
  });

  it("10. orchestrator fallback: adapter w/o evidenceRef → canonical attempt evidence (23-D)", async () => {
    const genericAdapter = async (req: any) => ({
      measurementSource: "dictation-engine",
      engine: "DICTATION" as const,
      measurements: { accuracy: 0.8 },
      confidence: 0.8,
      durationMs: req.context.durationMs,
      response: { accuracy: 0.8 },
    });
    const context = {
      tenantId: TENANT_M, schoolId: SCHOOL_A, studentId: STUDENT_A,
      activityId: ACT_GENERIC.activityId, curriculumVersion: "2026",
      stageKey: "PRIMARY", gradeLevel: "4", subject: "reading", attemptNumber: 1,
      startedAt: iso(10000), submittedAt: iso(14000), durationMs: 4000,
      time: { activityDurationMs: 4000, responseDurationMs: 3000, thinkingDurationMs: 800 },
    };
    const trace = await dbmod.executeAttempt({
      actor: { actorId: STUDENT_A, actorRole: "student" },
      context,
      definition: ACT_GENERIC,
      resolution: { exerciseId: "ex-gen-1", engineBinding: "DICTATION" as const, expectedResponseType: "TYPED", status: "ACTIVE" as const },
      adapters: { DICTATION: genericAdapter },
      engineInput: {},
      subject: { tenantId: TENANT_M, userId: STUDENT_A, staffMemberships: [], ownStudentId: STUDENT_A },
    });
    expect(trace.evidenceRef).toBeTruthy();
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 100 });
    const row = rows.find((r: any) => r.id === trace.evidenceRef);
    expect(row).toBeDefined();
    expect(row.sourceEngine).toBe("dictation-engine"); // adapter-owned measurement source (CORE-15: platform never names engines)
    expect(row.evidenceType).toBe("attempt");
    // multidimensional time evidence rides in metadata (23-P)
    expect(row.metadata.time.responseDurationMs).toBe(3000);
    expect(row.metadata.time.activityDurationMs).toBe(4000);
    // curriculum version preserved on the evidence (21-O continuity)
    expect(row.metadata.curriculumVersion).toBe("2026");
  });

  it("11. idempotency: identical retry → SAME evidenceRef, exactly ONE row (23-X)", async () => {
    const genericAdapter = async () => ({ measurementSource: "dictation-engine", engine: "DICTATION" as const, measurements: { accuracy: 0.7 }, response: { accuracy: 0.7 } });
    const context = {
      tenantId: TENANT_M, schoolId: SCHOOL_A, studentId: STUDENT_A,
      activityId: ACT_GENERIC.activityId, curriculumVersion: "2026",
      stageKey: "PRIMARY", gradeLevel: "4", subject: "reading", attemptNumber: 2,
      startedAt: iso(20000), submittedAt: iso(24000), durationMs: 4000,
    };
    const args = {
      actor: { actorId: STUDENT_A, actorRole: "student" },
      context,
      definition: ACT_GENERIC,
      resolution: { exerciseId: "ex-gen-2", engineBinding: "DICTATION" as const, expectedResponseType: "TYPED", status: "ACTIVE" as const },
      adapters: { DICTATION: genericAdapter },
      engineInput: {},
      subject: { tenantId: TENANT_M, userId: STUDENT_A, staffMemberships: [], ownStudentId: STUDENT_A },
    };
    const t1 = await dbmod.executeAttempt(args);
    const t2 = await dbmod.executeAttempt(args); // HTTP/worker retry
    expect(t2.evidenceRef).toBe(t1.evidenceRef);
    const rows = await db.select().from(dbmod.evidenceTable).where(and(eq(dbmod.evidenceTable.tenantId, TENANT_M), eq(dbmod.evidenceTable.operationKey, t1.operationKey)));
    expect(rows.length).toBe(1);
  });

  it("12. concurrency: 5 parallel duplicate submissions → single evidence row (23-X)", async () => {
    const genericAdapter = async () => ({ measurementSource: "dictation-engine", engine: "DICTATION" as const, measurements: { accuracy: 0.6 }, response: { accuracy: 0.6 } });
    const context = {
      tenantId: TENANT_M, schoolId: SCHOOL_A, studentId: STUDENT_A,
      activityId: ACT_GENERIC.activityId, curriculumVersion: "2026",
      stageKey: "PRIMARY", gradeLevel: "4", subject: "reading", attemptNumber: 3,
      startedAt: iso(30000), submittedAt: iso(34000), durationMs: 4000,
    };
    const args = {
      actor: { actorId: STUDENT_A, actorRole: "student" },
      context,
      definition: ACT_GENERIC,
      resolution: { exerciseId: "ex-gen-3", engineBinding: "DICTATION" as const, expectedResponseType: "TYPED", status: "ACTIVE" as const },
      adapters: { DICTATION: genericAdapter },
      engineInput: {},
      subject: { tenantId: TENANT_M, userId: STUDENT_A, staffMemberships: [], ownStudentId: STUDENT_A },
    };
    const traces = await Promise.all(Array.from({ length: 5 }, () => dbmod.executeAttempt(args)));
    const refs = new Set(traces.map((t: any) => t.evidenceRef));
    expect(refs.size).toBe(1);
    const rows = await db.select().from(dbmod.evidenceTable).where(and(eq(dbmod.evidenceTable.tenantId, TENANT_M), eq(dbmod.evidenceTable.operationKey, traces[0].operationKey)));
    expect(rows.length).toBe(1);
  });

  it("13. audit trail: activity.started + activity.submitted in audit_logs, no PII (23-AJ)", async () => {
    const rows = await db.select().from(dbmod.auditLogsTable).where(and(eq(dbmod.auditLogsTable.tenantId, TENANT_M), eq(dbmod.auditLogsTable.entity, "activity"), eq(dbmod.auditLogsTable.entityId, ACT_DICT.activityId)));
    const actions = rows.map((r: any) => r.action);
    expect(actions).toContain("activity.started");
    expect(actions).toContain("activity.submitted");
    for (const r of rows) {
      const s = JSON.stringify(r);
      expect(s).not.toMatch(/password|token|audio|religio/i);
    }
  });

  it("14. outbox continuity: canonical event → outbox → consumer → evidence (no new bus)", async () => {
    // The event registry (EVENT_TO_EVIDENCE_TYPE) is CLOSED — execution
    // observability rides audit_logs; the outbox carries the CANONICAL
    // learning events only (CORE-17 path, reused as-is).
    const ev = learningEvent("StudentResponseRecorded", { skill: "reading.accuracy", accuracy: 0.5, fluency: 0.5 }, iso(45000), STUDENT_A);
    await events.publishEvent(ev, { requestId: randomUUID(), correlationId: randomUUID() });
    const res = await events.processEventOutbox({ limit: 50 });
    expect(res.failed).toBe(0);
    const outboxRows = await db.select().from(dbmod.eventOutboxTable).where(eq(dbmod.eventOutboxTable.tenantId, TENANT_M));
    const mine = outboxRows.filter((r: any) => r.id === ev.id);
    expect(mine.length).toBe(1);
    expect(mine[0].status === "processed" || (mine[0].status as string) !== "pending").toBe(true);
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 200 });
    expect(rows.some((r: any) => r.metadata?.eventId === ev.id && r.evidenceType === "response")).toBe(true);
  });

  it("15. learner model continuity: execution evidence feeds multidimensional model (23-F)", async () => {
    const model = await dbmod.buildLearnerModel({ tenantId: TENANT_M, studentId: STUDENT_A });
    const subjects = (model.subjects ?? []).map((s: any) => s.subject ?? s.dimension);
    expect(subjects).toContain("dictation"); // our dictation-engine evidence rows
  });

  it("16. learning loop continuity + teacher decision boundary (23-I/23-J/23-K)", async () => {
    // proven CORE-17 path: events → canonical evidence → detection
    for (let i = 0; i < 3; i++) {
      await events.publishEvent(learningEvent("StudentResponseRecorded", { skill: "reading.accuracy", accuracy: 0.4, fluency: 0.4 }, iso(50000 + i * 2000), STUDENT_A));
      await events.publishEvent(learningEvent("MistakeDetected", { sessionId: SESSION_D, phoneme: "ص", errorType: "substitution", context: "المدرسة", skill: "reading.accuracy" }, iso(60000 + i * 2000), STUDENT_A));
    }
    await events.processEventOutbox({ limit: 50 });
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 200 });
    const signals = await ll.stageDetect({ tenantId: TENANT_M, studentId: STUDENT_A, rows });
    const actionable = signals.filter((s: any) => s.kind !== "insufficient-evidence");
    expect(actionable.length).toBeGreaterThanOrEqual(1);
    const diagnosis = await ll.createDiagnosis({ tenantId: TENANT_M, studentId: STUDENT_A, signal: actionable[0] });
    const proposal = await ll.proposeIntervention({ tenantId: TENANT_M, studentId: STUDENT_A, diagnosis, activityType: "targeted-practice" });
    expect(proposal.status).toBe("PENDING"); // AI/rules can only PROPOSE — never deliver
    const result = await decisions.applyTeacherDecision({
      tenantId: TENANT_M,
      proposal,
      decision: { action: "APPROVED", actorId: USER_TEACHER_A, actorRole: "teacher", decidedAt: iso(70000) },
      evidenceRefs: [],
    });
    expect(result.authorization).toBeTruthy();
    decisions.assertDeliveryAuthorized(
      { tenantId: TENANT_M, studentId: STUDENT_A, proposalId: proposal.id, activityType: (proposal as any).activityType },
      result.authorization,
    ); // match → passes
    expect(() => decisions.assertDeliveryAuthorized(
      { tenantId: TENANT_M, studentId: STUDENT_A, proposalId: proposal.id, activityType: "other-activity" },
      result.authorization,
    )).toThrow(/DELIVERY_AUTHORIZATION_MISMATCH/); // any mismatch → authorization failure
  });

  it("17. transfer safety: A→B→A keeps evidence immutable + identity stable (23-M/23-N)", async () => {
    const before = await dbmod.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 500 });
    const beforeIds = before.map((r: any) => r.id).sort();
    await dbmod.transferStudent({
      identityId: IDENTITY_1, fromTenantId: TENANT_M, toTenantId: TENANT_X,
      toStudentId: STUDENT_X, toSchoolId: SCHOOL_X, toClassId: CLASS_X,
      operationKey: `c23-t1-${randomUUID()}`, actorId: USER_PRINCIPAL_A,
    });
    const afterOut = await dbmod.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 500 });
    expect(afterOut.map((r: any) => r.id).sort()).toEqual(beforeIds); // evidence NOT rewritten
    await dbmod.returnStudent({
      identityId: IDENTITY_1, toTenantId: TENANT_M, toStudentId: STUDENT_A,
      toSchoolId: SCHOOL_A, toClassId: CLASS_4A,
      operationKey: `c23-t2-${randomUUID()}`, actorId: USER_PRINCIPAL_A,
    });
    const afterBack = await dbmod.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 500 });
    expect(afterBack.map((r: any) => r.id).sort()).toEqual(beforeIds); // evidence immutable after return
    const history = await dbmod.getMembershipHistory(IDENTITY_1);
    expect(history.length).toBeGreaterThanOrEqual(3); // active → transferred → returned
    const active = history.find((m: any) => m.status === "active");
    expect(active?.tenantId).toBe(TENANT_M);
    expect(history.some((m: any) => m.status === "transferred")).toBe(true);
  });

  it("18. synthetic scale: 1001 execution contexts across 1000+ schools resolve < 1s (no hard limits)", () => {
    const started = Date.now();
    const schools = Array.from({ length: 1001 }, (_, i) => randomUUID());
    let bound = 0;
    for (let i = 0; i < schools.length; i++) {
      const ctx = {
        tenantId: TENANT_M, schoolId: schools[i], studentId: STUDENT_A,
        activityId: `act-scale-${i}`, curriculumVersion: "2026",
        stageKey: "PRIMARY", gradeLevel: "4", subject: i % 2 === 0 ? "dictation" : "reading",
        attemptNumber: (i % 5) + 1, startedAt: iso(i), submittedAt: iso(i + 1000), durationMs: 1000,
      };
      dbmod.validateExecutionContext(ctx);
      const def = { ...(i % 2 === 0 ? ACT_DICT : ACT_GENERIC), schoolId: schools[i] };
      dbmod.assertCurriculumAlignment(def, ctx);
      const engine = dbmod.resolveExerciseBinding(def, { engineBinding: "DICTATION" as const, expectedResponseType: "TYPED", status: "ACTIVE" as const });
      if (engine === "DICTATION") bound += 1;
    }
    const elapsed = Date.now() - started;
    expect(bound).toBe(1001);
    expect(elapsed).toBeLessThan(1000);
  });

  it("19. performance baselines: real-PostgreSQL pipeline latencies (23-V)", async () => {
    const genericAdapter = async () => ({ measurementSource: "dictation-engine", engine: "DICTATION" as const, measurements: { accuracy: 1 }, response: { accuracy: 1 } });
    const t0 = Date.now();
    await dbmod.assertExecutionAccess({
      subject: { tenantId: TENANT_M, userId: USER_TEACHER_A, staffMemberships: [{ role: "teacher", scopeType: "CLASS", scopeId: CLASS_4A, schoolId: SCHOOL_A, organizationId: null }] },
      definition: ACT_GENERIC,
      studentId: STUDENT_A,
    });
    const scopeAuthzMs = Date.now() - t0;
    const t1 = Date.now();
    const trace = await dbmod.executeAttempt({
      actor: { actorId: STUDENT_A, actorRole: "student" },
      context: {
        tenantId: TENANT_M, schoolId: SCHOOL_A, studentId: STUDENT_A,
        activityId: ACT_GENERIC.activityId, curriculumVersion: "2026",
        stageKey: "PRIMARY", gradeLevel: "4", subject: "reading", attemptNumber: 9,
        startedAt: iso(80000), submittedAt: iso(84000), durationMs: 4000,
      },
      definition: ACT_GENERIC,
      resolution: { exerciseId: "ex-perf", engineBinding: "DICTATION" as const, expectedResponseType: "TYPED", status: "ACTIVE" as const },
      adapters: { DICTATION: genericAdapter },
      engineInput: {},
      subject: { tenantId: TENANT_M, userId: STUDENT_A, staffMemberships: [], ownStudentId: STUDENT_A },
    });
    const flowMs = Date.now() - t1;
    expect(trace.evidenceRef).toBeTruthy();
    // generous bounds — the assertion is that nothing pathological (no N+1 explosion)
    expect(scopeAuthzMs).toBeLessThan(500);
    expect(flowMs).toBeLessThan(1000);
  });

  it("20. persistence gate: canonical chain 0000..0003 + 0004 (ACR-24/001) + 0005 (ACR-24/002, owner-approved); ZERO execution tables — activity tables are STATE ONLY", async () => {
    const journal = JSON.parse(readFileSync("packages/database/migrations/meta/_journal.json", "utf8"));
    expect(journal.entries.map((e: any) => e.tag)).toEqual([
      "0000_core18_canonical_baseline",
      "0001_core18_identity_membership",
      "0002_core19_organization_scope",
      "0003_core20_evidence_tenant_time_index",
      "0004_core24_content_exercise_library", // ACR-24/001 (CORE-24 Wave 1) — definitions ONLY
      "0005_core24_activity_assignment_attempt_state", // ACR-24/002 (CORE-24 Wave 2) — operational STATE only
    ]);
    expect(readdirSync("packages/database/migrations").filter((f) => f.endsWith(".sql")).length).toBe(6);
    // CORE-23 invariant: no EXECUTION tables. The ONLY activity tables are the
    // ACR-24/002 state tables (assignment/attempt lifecycle + timings + an
    // evidence_ref POINTER — no measurements/scores/responses; Evidence stays
    // the single canonical learning fact via recordEvidence).
    const res: any = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%execution%' OR table_name LIKE '%activity%')`);
    const activityTables = (res.rows ?? res).map((r: any) => r.table_name ?? r.TABLE_NAME);
    expect(activityTables.length).toBeGreaterThan(0);
    expect(activityTables.every((t: string) => t === "activity_assignments" || t === "activity_attempts")).toBe(true);
    // The ONLY content-like tables allowed are the ACR-24/001 library definitions.
    const res2: any = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%content%'`);
    const contentTables = (res2.rows ?? res2).map((r: any) => r.table_name ?? r.TABLE_NAME);
    expect(contentTables.length).toBeGreaterThan(0);
    expect(contentTables.every((t: string) => t === "content_definitions")).toBe(true);
  });

  it("21. no AI/LLM in execution code (comment-stripped scan, 23 prohibitions)", () => {
    for (const f of ["packages/database/src/execution/contracts.ts", "packages/database/src/execution/orchestrator.ts"]) {
      const raw = readFileSync(f, "utf8");
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
      expect(code).not.toMatch(/openai|anthropic|onnx|llm|gpt|tensorflow|torch|\.predict\(/i);
    }
  });
});
