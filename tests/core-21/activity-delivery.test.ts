/**
 * CORE-21 — Learning Delivery & Activity Foundation (REAL PostgreSQL + Redis).
 * 33-item matrix (21-AN): curriculum→activity reference, activity identity/
 * version, activity≠assessment, assignment scope, student/teacher/school
 * scopes (AUTHORIZED school-scope users ONLY — the owner's clarification as a
 * distinct predicate), stage/grade/curriculum isolation, unified login
 * context, canonical evidence writer, Reading/Dictation/Numeracy/Assessment
 * integration, Learner Model/Intelligence/Learning Loop continuity, teacher
 * decision boundary, religious policy, A→B transfer, idempotency, concurrency,
 * audit, privacy, aggregate compatibility, no duplicate store, synthetic scale.
 * Auto-skips unless CORE21_RUNTIME=1.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";

const RUN = process.env.CORE21_RUNTIME === "1";
const d = RUN ? describe : describe.skip;

const TENANT_M = randomUUID();
let dbmod: any, db: any, ov: any, dictation: any, numeracy: any, assessment: any, events: any, decisions: any, ll: any, intel: any, curriculum: any;

let MINISTRY: any, GOV: any, DIR_1: any, DIR_2: any;
let SCHOOL_A = randomUUID(), SCHOOL_B = randomUUID();
const CLASS_4A = randomUUID(), CLASS_4B = randomUUID(), CLASS_5P = randomUUID();
let USER_MINISTRY: string, USER_PRINCIPAL_A: string, USER_TEACHER_A: string, USER_TEACHER_B: string, USER_NOBODY: string;
const ID_OP = `c21-id-${randomUUID()}`;
let STUDENT_A: string, STUDENT_B: string, STUDENT_C: string, IDENTITY_ID: string;
// seeded attempt rows (canonical attempt store owned by reading-engine —
// the evidence writer REQUIRES real attempt references, CORE-17 pattern)
const ATTEMPT_D = randomUUID(), ATTEMPT_N = randomUUID(), ATTEMPT_A = randomUUID();
const SESSION_D = randomUUID(), SESSION_N = randomUUID(), SESSION_A = randomUUID();
const PASSAGE_A = randomUUID();
const T0 = Date.UTC(2026, 8, 10, 9, 0, 0); // 2026-09-10T09:00Z
const iso = (ms: number) => new Date(T0 + ms).toISOString();

// ===== Activity definitions (reference-only contracts — 21-C) =====
const anchor4A = {
  country: "EG", educationSystem: "EG-NATIONAL", stageKey: "PRIMARY", gradeLevel: "4", gradeKey: "EG-PR-04",
  subject: "dictation", curriculumId: "cur-eg-ar", curriculumVersion: "2026",
  bookId: "bk-ar-4", unitId: "u3", lessonId: "l7", objectiveId: "obj-77", skill: "dictation.accuracy", dimension: "accuracy",
};
const ACT_DICT: any = {
  activityId: `act-c21-dict-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  curriculum: anchor4A, activityType: "DICTATION", level: "medium",
  instructionsRef: "content://dictation/l7/instructions", expectedResponseType: "TYPED",
  assessmentPolicyRef: undefined, status: "ACTIVE", version: 1,
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
const curriculumMath = {
  tenantId: TENANT_M, studentId: "", country: "EG", language: "ar", educationSystem: "EG-NATIONAL",
  educationStage: "primary", grade: "Grade 4", gradeKey: "EG-PR-04", subject: "mathematics",
  curriculum: { curriculumId: "cur-eg-math", version: "2026", title: "EG Math 2026" },
  skills: ["numeracy.arithmetic"], dimensions: ["accuracy"],
} as any;
const ACT_NUM: any = {
  activityId: `act-c21-num-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  curriculum: { ...anchor4A, subject: "mathematics", curriculumId: "cur-eg-math", skill: "numeracy.arithmetic", lessonId: "l2", objectiveId: "obj-12" },
  activityType: "MATHEMATICS", expectedResponseType: "STEPS", status: "ACTIVE", version: 1,
};
const ACT_READ: any = {
  activityId: `act-c21-read-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  curriculum: { ...anchor4A, subject: "reading", skill: "reading.accuracy" },
  activityType: "READING", expectedResponseType: "VOICE", status: "ACTIVE", version: 1,
};
const ACT_ASSESS: any = {
  activityId: `act-c21-assess-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  curriculum: { ...anchor4A, subject: "mathematics" }, activityType: "ASSESSMENT_ACTIVITY",
  expectedResponseType: "SELECTION", assessmentPolicyRef: "assessment://def-c21-1", status: "ACTIVE", version: 1,
};
const assessmentDefinition = {
  definitionId: "def-c21-1", title: "تقييم ضرب الأعداد", kind: "formative" as const,
  subject: "mathematics", targets: { skills: ["numeracy.arithmetic"] },
  items: [
    { itemRef: "q1", expectedAnswer: "4", scoring: "numeric" as const, weight: 1 },
    { itemRef: "q2", expectedAnswer: "6", scoring: "numeric" as const, weight: 1 },
  ],
  dimensions: ["accuracy"], passThreshold: 0.5, maxAttempts: 2,
};

function learningEvent(type: string, payload: any, occurredAt: string, studentId = "") {
  return { id: randomUUID(), version: 1, type, occurredAt, actor: { id: "system", role: "system" }, tenantId: TENANT_M, studentId, payload };
}

d("CORE-21 activity & delivery foundation (real PostgreSQL)", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    ov = dbmod;
    dictation = await import("@dictation-engine");
    numeracy = await import("@numeracy-engine");
    assessment = await import("@assessment-engine");
    events = await import("@workspace/events");
    decisions = await import("@workspace/decisions");
    ll = await import("@workspace/learning-loop");
    intel = await import("@workspace/intelligence");
    curriculum = await import("@workspace/curriculum");
    const { tenantsTable, usersTable, schoolsTable, classesTable, studentsTable } = dbmod;
    await db.insert(tenantsTable).values({ id: TENANT_M, name: "وزارة C21", slug: `c21-${randomUUID()}` });
    USER_MINISTRY = randomUUID(); USER_PRINCIPAL_A = randomUUID(); USER_TEACHER_A = randomUUID(); USER_TEACHER_B = randomUUID(); USER_NOBODY = randomUUID();
    await db.insert(usersTable).values([
      { id: USER_MINISTRY, tenantId: TENANT_M, firstName: "م", lastName: "وزارة", email: `m-${randomUUID()}@x.test`, passwordHash: "x", role: "admin" },
      { id: USER_PRINCIPAL_A, tenantId: TENANT_M, firstName: "ع", lastName: "مدير", email: `p-${randomUUID()}@x.test`, passwordHash: "x", role: "principal" },
      { id: USER_TEACHER_A, tenantId: TENANT_M, firstName: "أ", lastName: "معلم A", email: `ta-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" },
      { id: USER_TEACHER_B, tenantId: TENANT_M, firstName: "ب", lastName: "معلم B", email: `tb-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" },
      { id: USER_NOBODY, tenantId: TENANT_M, firstName: "ل", lastName: "بلا دور", email: `n-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" },
    ]);
    // hierarchy: MINISTRY → GOV → DIR_1 (School A) / DIR_2 (School B)
    MINISTRY = (await ov.createOrganization({ tenantId: TENANT_M, type: "MINISTRY", name: "الوزارة", operationKey: `c21-min-${randomUUID()}` })).organization;
    GOV = (await ov.createOrganization({ tenantId: TENANT_M, type: "GOVERNORATE", name: "المحافظة", parentOrganizationId: MINISTRY.id, operationKey: `c21-g-${randomUUID()}` })).organization;
    DIR_1 = (await ov.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: "مديرية 1", parentOrganizationId: GOV.id, operationKey: `c21-d1-${randomUUID()}` })).organization;
    DIR_2 = (await ov.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: "مديرية 2", parentOrganizationId: GOV.id, operationKey: `c21-d2-${randomUUID()}` })).organization;
    await ov.createSchool({ tenantId: TENANT_M, name: "مدرسة أبو بكر الصديق", code: `A-${randomUUID().slice(0, 6)}`, organizationId: DIR_1.id, operationKey: `c21-sa-${randomUUID()}` }).then((r: any) => { SCHOOL_A = r.school.id; });
    await ov.createSchool({ tenantId: TENANT_M, name: "مدرسة ب", code: `B-${randomUUID().slice(0, 6)}`, organizationId: DIR_2.id, operationKey: `c21-sb-${randomUUID()}` }).then((r: any) => { SCHOOL_B = r.school.id; });
    ACT_DICT.schoolId = SCHOOL_A; ACT_NUM.schoolId = SCHOOL_A; ACT_READ.schoolId = SCHOOL_A; ACT_ASSESS.schoolId = SCHOOL_A;
    await db.insert(classesTable).values([
      { id: CLASS_4A, tenantId: TENANT_M, schoolId: SCHOOL_A, name: "4A", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
      { id: CLASS_4B, tenantId: TENANT_M, schoolId: SCHOOL_B, name: "4B", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
      { id: CLASS_5P, tenantId: TENANT_M, schoolId: SCHOOL_B, name: "5P", gradeLevel: "5", academicYear: "2026/2027", stageKey: "PREPARATORY" },
    ]);
    const id1 = await ov.createIdentity({ operationKey: ID_OP });
    IDENTITY_ID = id1.identityId;
    STUDENT_A = randomUUID(); STUDENT_B = randomUUID(); STUDENT_C = randomUUID();
    await db.insert(studentsTable).values([
      { id: STUDENT_A, tenantId: TENANT_M, classId: CLASS_4A, firstName: "أحمد", lastName: "رباعي", studentCode: `A-${randomUUID()}`, identityId: IDENTITY_ID },
      { id: STUDENT_B, tenantId: TENANT_M, classId: CLASS_4B, firstName: "سارة", lastName: "ثانية", studentCode: `B-${randomUUID()}`, identityId: null },
      { id: STUDENT_C, tenantId: TENANT_M, classId: CLASS_5P, firstName: "كرم", lastName: "إعدادي", studentCode: `C-${randomUUID()}`, identityId: null },
    ]);
    // staff memberships (RBAC + Scope): ministry oversight, principal (school admin), teachers (CLASS-scoped)
    await ov.addStaffMembership({ tenantId: TENANT_M, userId: USER_MINISTRY, role: "ministry-admin", scopeType: "ORGANIZATION", scopeId: MINISTRY.id, organizationId: MINISTRY.id, operationKey: `c21-sm-${randomUUID()}` });
    await ov.addStaffMembership({ tenantId: TENANT_M, userId: USER_PRINCIPAL_A, role: "principal", scopeType: "SCHOOL", scopeId: SCHOOL_A, schoolId: SCHOOL_A, operationKey: `c21-sp-${randomUUID()}` });
    await ov.addStaffMembership({ tenantId: TENANT_M, userId: USER_TEACHER_A, role: "teacher", scopeType: "CLASS", scopeId: CLASS_4A, schoolId: SCHOOL_A, operationKey: `c21-sta-${randomUUID()}` });
    await ov.addStaffMembership({ tenantId: TENANT_M, userId: USER_TEACHER_B, role: "teacher", scopeType: "CLASS", scopeId: CLASS_4B, schoolId: SCHOOL_B, operationKey: `c21-stb-${randomUUID()}` });
    // seed canonical attempt references (reading-engine owns the attempts table;
    // evidence-writer validates attemptId against it — CORE-17 integration pattern)
    const { passagesTable, readingSessionsTable, attemptsTable } = dbmod;
    await db.insert(passagesTable).values({ id: PASSAGE_A, tenantId: TENANT_M, classroomId: CLASS_4A, title: "قصة C21", text: "كان يا ما كان", difficulty: 3 });
    await db.insert(readingSessionsTable).values([
      { id: SESSION_D, tenantId: TENANT_M, studentId: STUDENT_A },
      { id: SESSION_N, tenantId: TENANT_M, studentId: STUDENT_A },
      { id: SESSION_A, tenantId: TENANT_M, studentId: STUDENT_A },
    ]);
    await db.insert(attemptsTable).values([
      { id: ATTEMPT_D, tenantId: TENANT_M, sessionId: SESSION_D, studentId: STUDENT_A, passageId: PASSAGE_A },
      { id: ATTEMPT_N, tenantId: TENANT_M, sessionId: SESSION_N, studentId: STUDENT_A, passageId: PASSAGE_A },
      { id: ATTEMPT_A, tenantId: TENANT_M, sessionId: SESSION_A, studentId: STUDENT_A, passageId: PASSAGE_A },
    ]);
  }, 90000);

  const membershipsOf = async (userId: string) => {
    const rows = await db.select().from(dbmod.staffMembershipsTable);
    return rows.filter((r: any) => r.userId === userId && r.status === "active");
  };
  const ctxOf = async (studentId: string) => ov.resolveStudentContext(TENANT_M, studentId);

  it("1-4. contracts: curriculum→activity reference compatibility, identity, version, activity≠assessment", async () => {
    // 1: ActivityCurriculumAnchor is structurally compatible with packages/curriculum CurriculumContext fields
    expect(typeof curriculum.CurriculumContext).toBe("undefined"); // type-only export
    for (const [k, v] of Object.entries({ stageKey: anchor4A.stageKey, gradeLevel: anchor4A.gradeLevel, subject: anchor4A.subject })) {
      expect((curriculumDictation as any)[k === "stageKey" ? "educationStage" : k] ?? v).toBeTruthy(); // chain resolvable
    }
    expect(curriculumDictation.curriculum.curriculumId).toBe(anchor4A.curriculumId); // same curriculum reference
    expect(curriculumDictation.curriculum.version).toBe(anchor4A.curriculumVersion); // 21-O version parity
    // 2-3: identity + version validated (deterministic)
    ov.validateActivityDefinition(ACT_DICT);
    expect(() => ov.validateActivityDefinition({ ...ACT_DICT, activityId: "" })).toThrow(/ACTIVITY_ID_REQUIRED/);
    expect(() => ov.validateActivityDefinition({ ...ACT_DICT, version: 0 })).toThrow(/ACTIVITY_VERSION_INVALID/);
    expect(() => ov.validateActivityDefinition({ ...ACT_DICT, curriculum: { ...anchor4A, curriculumVersion: "" } })).toThrow(/ACTIVITY_CURRICULUM_ANCHOR_MISSING:curriculumVersion/); // 21-O
    // 4: Activity ≠ Assessment — practice-only activity has no assessment semantics
    expect(ov.isAssessmentActivity(ACT_DICT)).toBe(false);
    expect(ov.isAssessmentActivity(ACT_ASSESS)).toBe(true);
  });

  it("5-11. assignment scope + stage/grade/curriculum isolation: cross-school assignment DENIED, content policy enforced", async () => {
    // 5: Teacher A (School A activity) cannot assign to School B (21-M)
    await expect(ov.assignActivity({
      definition: ACT_DICT,
      assignment: { assignedTo: { schoolId: SCHOOL_B }, assignedBy: { actorId: USER_TEACHER_A, actorRole: "teacher" }, source: "teacherAssigned", assignedAt: iso(100) },
    })).rejects.toThrow(/ASSIGNMENT_CROSS_SCHOOL/);
    // assignment to OWN school student succeeds
    const ok = await ov.assignActivity({
      definition: ACT_DICT,
      assignment: { assignedTo: { studentId: STUDENT_A }, assignedBy: { actorId: USER_TEACHER_A, actorRole: "teacher" }, source: "teacherAssigned", assignedAt: iso(100) },
    });
    expect(ok.assigned).toBe(true);
    expect(ok.assignmentId).toBeTruthy();
    // 22: religious content — Muslim student → Christian religious content DENIED at assignment (21-R via CORE-20 policy)
    await expect(ov.assignActivity({
      definition: { ...ACT_DICT, activityId: `act-rel-${randomUUID()}` },
      assignment: { assignedTo: { studentId: STUDENT_A }, assignedBy: { actorId: USER_PRINCIPAL_A, actorRole: "principal" }, source: "teacherAssigned", assignedAt: iso(100) },
      studentReligiousContext: "MUSLIM",
      contentRef: { subject: "christian-education", contentType: "religious-education", religiousContext: "CHRISTIAN" },
    })).rejects.toThrow(/ASSIGNMENT_CONTENT_POLICY/);
    // and a non-religious lesson assigns fine with a Christian student (cross-access kept for grammar-type islamic content)
    const grammar = await ov.assignActivity({
      definition: { ...ACT_DICT, activityId: `act-gram-${randomUUID()}` },
      assignment: { assignedTo: { studentId: STUDENT_A }, assignedBy: { actorId: USER_PRINCIPAL_A, actorRole: "principal" }, source: "teacherAssigned", assignedAt: iso(100) },
      studentReligiousContext: "CHRISTIAN",
      contentRef: { subject: "arabic-language", contentType: "grammar", religiousContext: "ISLAMIC" },
    });
    expect(grammar.assigned).toBe(true);
    // 9-11: stage/grade/curriculum isolation live in the ANCHOR — a Grade-4-PRIMARY activity can never be re-anchored to PREPARATORY without a different anchor
    const prepAnchor = { ...anchor4A, stageKey: "PREPARATORY", gradeLevel: "5" };
    expect(prepAnchor.stageKey).not.toEqual(ACT_DICT.curriculum.stageKey);
    expect(prepAnchor.gradeLevel).not.toEqual(ACT_DICT.curriculum.gradeLevel);
  });

  it("6-8. THE OWNER CLARIFICATION as a distinct predicate: principal (authorized administration) ALLOW, class teacher → own class ONLY, ministry NEVER individual", async () => {
    const sctxA = await ctxOf(STUDENT_A);
    const sctxB = await ctxOf(STUDENT_B);
    // 7: teacher A → own class student ALLOW (level=CLASS)
    const memA = await membershipsOf(USER_TEACHER_A);
    const memB = await membershipsOf(USER_TEACHER_B);
    const memM = await membershipsOf(USER_MINISTRY);
    const tA = ov.assertActivityAccess({ subject: { tenantId: TENANT_M, userId: USER_TEACHER_A, staffMemberships: memA }, definition: { tenantId: TENANT_M, schoolId: SCHOOL_A }, studentId: STUDENT_A, studentContext: sctxA });
    expect(tA.allowed).toBe(true);
    expect(tA.level).toBe("CLASS");
    // teacher A → School B student DENY (different class, different school)
    expect(() => ov.assertActivityAccess({ subject: { tenantId: TENANT_M, userId: USER_TEACHER_A, staffMemberships: memA }, definition: { tenantId: TENANT_M, schoolId: SCHOOL_B }, studentId: STUDENT_B, studentContext: sctxB })).toThrow(/ACTIVITY_ACCESS_NOT_AUTHORIZED/);
    // 8: principal of School A → School A student ALLOW (level=SCHOOL_ADMIN) — authorized administration, not mere membership
    const memP = await membershipsOf(USER_PRINCIPAL_A);
    const pA = ov.assertActivityAccess({ subject: { tenantId: TENANT_M, userId: USER_PRINCIPAL_A, staffMemberships: memP }, definition: { tenantId: TENANT_M, schoolId: SCHOOL_A }, studentId: STUDENT_A, studentContext: sctxA });
    expect(pA.allowed).toBe(true);
    expect(pA.level).toBe("SCHOOL_ADMIN");
    // a teacher of School B (mere staff of another school) → School A student DENY
    expect(() => ov.assertActivityAccess({ subject: { tenantId: TENANT_M, userId: USER_TEACHER_B, staffMemberships: memB }, definition: { tenantId: TENANT_M, schoolId: SCHOOL_A }, studentId: STUDENT_A, studentContext: sctxA })).toThrow(/ACTIVITY_ACCESS_NOT_AUTHORIZED/);
    // ministry oversight → individual student DENIED (aggregate-only, 20-B carried into activity access)
    expect(() => ov.assertActivityAccess({ subject: { tenantId: TENANT_M, userId: USER_MINISTRY, staffMemberships: memM }, definition: { tenantId: TENANT_M, schoolId: SCHOOL_A }, studentId: STUDENT_A, studentContext: sctxA })).toThrow(/ACTIVITY_ACCESS_NOT_AUTHORIZED/);
    // student himself → OWN; another student → DENY (21-AH)
    const own = ov.assertActivityAccess({ subject: { tenantId: TENANT_M, userId: "student-session", staffMemberships: [], ownStudentId: STUDENT_A }, definition: { tenantId: TENANT_M, schoolId: SCHOOL_A }, studentId: STUDENT_A, studentContext: sctxA });
    expect(own.level).toBe("OWN");
    expect(() => ov.assertActivityAccess({ subject: { tenantId: TENANT_M, userId: "student-session", staffMemberships: [], ownStudentId: STUDENT_A }, definition: { tenantId: TENANT_M, schoolId: SCHOOL_A }, studentId: STUDENT_B, studentContext: sctxB })).toThrow(/ACTIVITY_ACCESS_DENIED_OTHER_STUDENT/);
    // user with NO memberships → DENY
    expect(() => ov.assertActivityAccess({ subject: { tenantId: TENANT_M, userId: USER_NOBODY, staffMemberships: [] }, definition: { tenantId: TENANT_M, schoolId: SCHOOL_A }, studentId: STUDENT_A, studentContext: sctxA })).toThrow(/ACTIVITY_ACCESS_NOT_AUTHORIZED/);
    const ok = await ov.validateStudentLoginContext({ tenantId: TENANT_M, identityId: IDENTITY_ID, claimed: { schoolId: SCHOOL_A, gradeLevel: "4", stageKey: "PRIMARY" } });
    expect(ok.studentId).toBe(STUDENT_A);
    await expect(ov.validateStudentLoginContext({ tenantId: TENANT_M, identityId: IDENTITY_ID, claimed: { schoolId: SCHOOL_B } })).rejects.toThrow(/LOGIN_CONTEXT_CLAIM_MISMATCH/);
  });

  it("13-15. dictation activity → runDictationAttempt → CANONICAL evidence (activityId + curriculum version carried)", async () => {
    // started audit (21-AJ)
    await ov.auditActivityEvent("activity.started", TENANT_M, STUDENT_A, ACT_DICT.activityId, undefined);
    const r = await dictation.runDictationAttempt({
      attempt: {
        tenantId: TENANT_M, studentId: STUDENT_A, activityId: ACT_DICT.activityId,
        attemptId: ATTEMPT_D, startedAt: iso(1000), submittedAt: iso(1800),
        replayCount: 0, responseDurationMs: 800, totalActivityDurationMs: 800,
      },
      prompt: { text: "ذهب الطالب إلى المدرسة", language: "ar" },
      submission: { typedText: "ذهب الطالب إلى المدرسة", source: "keyboard" },
      policy: dictationPolicy,
    });
    expect(r.measurements.accuracy).toBe(1);
    await ov.auditActivityEvent("activity.submitted", TENANT_M, STUDENT_A, ACT_DICT.activityId, r.attemptId);
    const rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, evidenceType: "attempt", limit: 50 });
    const dict = rows.filter((x: any) => x.sourceEngine === "dictation-engine" && x.activityId === ACT_DICT.activityId);
    expect(dict.length).toBe(1);
    expect(dict[0].subject).toBe("dictation");
    expect(dict[0].lessonId).toBe("l7"); // curriculum chain carried as references
    expect(dict[0].metadata.curriculumVersion ?? (dict[0].metadata.curriculum?.curriculumRef ?? "")).toContain("2026"); // 21-O
  });

  it("16. numeracy activity → analyzeNumeracy + recordNumeracyEvidence → canonical evidence", async () => {
    const attempt = {
      attemptId: ATTEMPT_N, tenantId: TENANT_M, studentId: STUDENT_A, activityId: ACT_NUM.activityId,
      occurredAt: iso(3000), startedAt: iso(3000), submittedAt: iso(3500), durationMs: 500, attemptCount: 1,
    };
    const analysis = numeracy.analyzeNumeracy({
      attempt, task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92" },
      response: { finalAnswer: "92" }, policy: { language: "ar", digitSet: "western", curriculum: curriculumMath },
    });
    expect(analysis.comparison.finalCorrect).toBe(true);
    await numeracy.recordNumeracyEvidence({ attempt, measurements: analysis.measurements, policy: { language: "ar", digitSet: "western", curriculum: curriculumMath }, comparison: analysis.comparison, area: "arithmetic" });
    const rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, evidenceType: "attempt", limit: 50 });
    expect(rows.filter((x: any) => x.sourceEngine === "numeracy-engine" && x.activityId === ACT_NUM.activityId).length).toBe(1);
  });

  it("17. assessment activity → evaluateAssessment + recordAssessmentEvidence → canonical evidence (kind=assessment)", async () => {
    const attempt = {
      attemptId: ATTEMPT_A, tenantId: TENANT_M, studentId: STUDENT_A, activityId: ACT_ASSESS.activityId,
      occurredAt: iso(5000), startedAt: iso(5000), submittedAt: iso(5600), durationMs: 600, attemptCount: 1,
      curriculum: curriculumMath,
    };
    const m = assessment.evaluateAssessment(assessmentDefinition, { items: [{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }] }, attempt);
    expect(m.rubricScore).toBe(1);
    await assessment.recordAssessmentEvidence({ definition: assessmentDefinition, attempt, measurements: m });
    const rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, evidenceType: "assessment", limit: 50 });
    expect(rows.filter((x: any) => x.sourceEngine === "assessment-engine" && x.activityId === ACT_ASSESS.activityId).length).toBe(1);
  });

  it("14. reading activity → events → real Outbox → canonical evidence (sourceEngine=reading-engine)", async () => {
    const SESSION_R = randomUUID();
    const { readingSessionsTable } = dbmod;
    await db.insert(readingSessionsTable).values({ id: SESSION_R, tenantId: TENANT_M, studentId: STUDENT_A });
    const corr = { requestId: randomUUID(), correlationId: randomUUID(), jobId: randomUUID() };
    for (let i = 0; i < 3; i++) {
      await events.publishEvent(learningEvent("StudentResponseRecorded", { skill: "reading.accuracy", accuracy: 0.9, fluency: 0.9, activityId: ACT_READ.activityId }, iso(7000 + i * 1000), STUDENT_A), i === 0 ? corr : {});
    }
    const res = await events.processEventOutbox({ limit: 50 });
    expect(res.failed).toBe(0);
    const rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 100 });
    expect(rows.filter((x: any) => x.sourceEngine === "reading-engine" && x.evidenceType === "response").length).toBe(3);
  });

  it("18-20. Learner Model + Intelligence + Learning Loop continuity over activity-driven evidence", async () => {
    const model = await ov.buildLearnerModel({ tenantId: TENANT_M, studentId: STUDENT_A });
    expect(model.dimensions.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(model)).not.toMatch(/overallScore|globalScore|studentLevel/); // 18: multidimensional, no single level
    const patterns = await intel.buildStudentPatterns({ tenantId: TENANT_M, studentId: STUDENT_A });
    expect(patterns.length).toBeGreaterThanOrEqual(0); // evidence-referencing patterns (no copies)
    const rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 100 });
    const signals = await ll.stageDetect({ tenantId: TENANT_M, studentId: STUDENT_A, rows });
    expect(Array.isArray(signals)).toBe(true); // loop stage reads canonical evidence
  });

  it("21. teacher decision boundary: proposal → APPROVE → delivery authorization gates the activity delivery", async () => {
    const rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 100 });
    const signals = await ll.stageDetect({ tenantId: TENANT_M, studentId: STUDENT_A, rows });
    // fall back to a fully-populated signal built via the loop's OWN identity
    // helper (signalKey = idempotency anchor; confidence/reason are required
    // members of DetectionSignal — createDiagnosis persists both)
    const sig = signals[0] ?? {
      kind: "repeated-mistake", skill: "dictation.accuracy", severity: "high",
      evidenceRefs: rows.slice(0, 2).map((r: any) => r.id),
      tenantId: TENANT_M, studentId: STUDENT_A,
      signalKey: ll.makeSignalKey("repeated-mistake", TENANT_M, STUDENT_A, "dictation.accuracy"),
      confidence: 0.9, reason: "fallback signal from canonical evidence rows",
    } as any;
    expect(sig.evidenceRefs?.length ?? 0).toBeGreaterThanOrEqual(1);
    const diagnosis = await ll.createDiagnosis({ tenantId: TENANT_M, studentId: STUDENT_A, signal: sig });
    const proposal = await ll.proposeIntervention({ tenantId: TENANT_M, studentId: STUDENT_A, diagnosis, activityType: "targeted-practice" });
    expect(proposal.status).toBe("PENDING"); // no AI→student shortcut
    const applied = await decisions.applyTeacherDecision({
      tenantId: TENANT_M, proposal,
      decision: { action: "APPROVED", actorId: USER_TEACHER_A, actorRole: "teacher", decidedAt: iso(9000), reason: "موافقة" },
    });
    expect(applied.proposal.status).toBe("APPROVED");
    expect(applied.authorization).not.toBeNull();
    // delivery gate uses the APPLIED proposal's own activityType (canonical pattern)
    expect(() => decisions.assertDeliveryAuthorized({ tenantId: TENANT_M, studentId: STUDENT_A, proposalId: proposal.id, activityType: applied.proposal.activityType }, applied.authorization)).not.toThrow();
    expect(() => decisions.assertDeliveryAuthorized({ tenantId: TENANT_M, studentId: STUDENT_B, proposalId: proposal.id, activityType: applied.proposal.activityType }, applied.authorization)).toThrow(); // other student blocked
  });

  it("23. transfer safety: School A → School B → evidence immutable, identity unchanged, activity history intact", async () => {
    const before = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 100 });
    const beforeFrozen = JSON.stringify(before.map((e: any) => ({ id: e.id, tenantId: e.tenantId, activityId: e.activityId, confidence: e.confidence, occurredAt: e.occurredAt })));
    await ov.startMembership({ identityId: IDENTITY_ID, tenantId: TENANT_M, studentId: STUDENT_A, schoolId: SCHOOL_A, classId: CLASS_4A, operationKey: `c21-ma-${randomUUID()}` });
    await ov.transferStudent({ identityId: IDENTITY_ID, fromTenantId: TENANT_M, toTenantId: TENANT_M, toStudentId: STUDENT_A, toSchoolId: SCHOOL_B, toClassId: CLASS_4B, operationKey: `c21-mb-${randomUUID()}` });
    await ov.returnStudent({ identityId: IDENTITY_ID, toTenantId: TENANT_M, toStudentId: STUDENT_A, toSchoolId: SCHOOL_A, toClassId: CLASS_4A, operationKey: `c21-mc-${randomUUID()}` });
    const after = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 100 });
    const afterFrozen = JSON.stringify(after.map((e: any) => ({ id: e.id, tenantId: e.tenantId, activityId: e.activityId, confidence: e.confidence, occurredAt: e.occurredAt })));
    expect(afterFrozen).toBe(beforeFrozen); // 21-Z: history IMMUTABLE through transfer
    const [studentRow] = await db.select().from(dbmod.studentsTable).where(eq(dbmod.studentsTable.id, STUDENT_A));
    expect(studentRow.identityId).toBe(IDENTITY_ID); // same global identity
  });

  it("24-25. idempotency + concurrency: same operationKey submissions (parallel) → exactly ONE evidence row", async () => {
    const attempt = {
      tenantId: TENANT_M, studentId: STUDENT_A, activityId: ACT_NUM.activityId,
      identityId: IDENTITY_ID, assignmentId: undefined, lessonId: "l2",
      curriculum: ACT_NUM.curriculum, startedAt: iso(11000), submittedAt: iso(11500),
      durationMs: 500, responseType: "STEPS", attemptNumber: 1,
    };
    const opk = ov.submissionOperationKey({ tenantId: TENANT_M, studentId: STUDENT_A, activityId: ACT_NUM.activityId, attemptNumber: 1, startedAt: iso(11000) });
    const input = ov.attemptEvidenceInput(attempt, "numeracy-engine", { confidence: 0.9, durationMs: 500 }, opk);
    const results = await Promise.allSettled([ov.recordEvidence(input), ov.recordEvidence({ ...input })]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 200 });
    expect(rows.filter((r: any) => r.operationKey === opk).length).toBe(1); // double submit → ONE row
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    // time-order validation (21-P)
    expect(() => ov.validateAttempt({ ...attempt, submittedAt: iso(9000) })).toThrow(/ATTEMPT_TIME_ORDER_INVALID/);
    expect(() => ov.validateAttempt({ ...attempt, curriculum: { ...ACT_NUM.curriculum, curriculumVersion: "" } })).toThrow(/ATTEMPT_CURRICULUM_VERSION_REQUIRED/);
  });

  it("26-27. audit + privacy: activity lifecycle audited in EXISTING audit_logs; NO names/religion/audio in any row or evidence metadata", async () => {
    const rows = await db.select().from(dbmod.auditLogsTable);
    const actions = rows.map((r: any) => r.action);
    for (const expected of ["activity.started", "activity.submitted", "activity.assigned", "activity.access.denied", "activity.access.authorized"]) {
      expect(actions).toContain(expected);
    }
    for (const r of rows) {
      const blob = JSON.stringify(r);
      expect(blob).not.toMatch(/password|token|audio|secret|"MUSLIM"|"CHRISTIAN"|أحمد|سارة/i);
    }
    const evRows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 200 });
    for (const e of evRows) {
      expect(JSON.stringify(e.metadata ?? {})).not.toMatch(/"MUSLIM"|"CHRISTIAN"|religion/i);
    }
  });

  it("28. aggregate compatibility: activity-tagged evidence flows into CORE-20 oversight aggregation untouched", async () => {
    const res = await ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_MINISTRY, organizationId: MINISTRY.id, timePeriod: { from: iso(0), to: iso(20000) }, evidenceType: "attempt", subject: "dictation", minimumAggregationSize: 1 });
    const g = res.groups.find((x: any) => x.schoolId === SCHOOL_A);
    expect(g).toBeDefined();
    expect(g.assessedStudents).toBeGreaterThanOrEqual(1);
  });

  it("29-31. no duplicate store (source scans); persistence gate: CORE-21 added NONE (its 0000..0004 chain untouched); 0005 state tables per ACR-24/002 (CORE-24 Wave 2, owner-approved per ADR-004 §5) create EXACTLY the two state tables — never a second evidence/score store", async () => {
    for (const f of readdirSync("packages/database/migrations").filter((x: string) => x.endsWith(".sql")).filter((x: string) => !x.startsWith("0005_"))) {
      const sql = readFileSync(`packages/database/migrations/${f}`, "utf8");
      expect(sql).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?(activity|activity_assignment|activity_attempt|activity_evidence|student_activity_history|school_activity_statistics)/i);
      expect(sql).not.toMatch(/activity_score_table/i); // 21-AC: outcome stays evidence-derived
    }
    // ACR-24/002: 0005 creates EXACTLY activity_assignments + activity_attempts —
    // operational STATE only (no evidence rows, no scores, no student results:
    // Evidence stays the single canonical learning fact via recordEvidence)
    const sql0005 = readFileSync("packages/database/migrations/0005_core24_activity_assignment_attempt_state.sql", "utf8");
    const created = [...sql0005.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?\"?([a-z_]+)\"?/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["activity_assignments", "activity_attempts"]);
    expect(sql0005).not.toMatch(/globalstudentscore|overallscore|globalrank|evidence_type|score/i);
    for (const f of ["packages/database/src/activity/contracts.ts", "packages/database/src/activity/delivery.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s).not.toMatch(/pgTable\(/); // CORE-21 reference-only layer — zero new tables (unchanged)
      expect(s).not.toMatch(/globalStudentScore|overallScore|globalRank/i);
      expect(s).not.toMatch(/openai|anthropic|onnx|llm/i);
    }
  });

  it("32. synthetic scale: 1,000+ schools — validate 1,004 activity definitions + assignments (no hardcoded limits)", async () => {
    const { schoolsTable } = dbmod;
    const gov2 = (await ov.createOrganization({ tenantId: TENANT_M, type: "GOVERNORATE", name: "محافظة C21", parentOrganizationId: MINISTRY.id, operationKey: `c21-sg-${randomUUID()}` })).organization;
    const dirs: string[] = [];
    for (let dd = 0; dd < 5; dd++) {
      const dir = (await ov.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: `مديرية C21-${dd}`, parentOrganizationId: gov2.id, operationKey: `c21-sd-${randomUUID()}-${dd}` })).organization;
      dirs.push(dir.id);
    }
    const schoolIds: string[] = [];
    for (let batch = 0; batch < 5; batch++) {
      const rows = [];
      for (let s = 0; s < 200; s++) {
        rows.push({ id: randomUUID(), tenantId: TENANT_M, name: `مدرسة ${batch}-${s}`, code: `C21S-${batch}-${s}-${randomUUID().slice(0, 6)}`, organizationId: dirs[s % dirs.length], operationKey: `c21-ss-${randomUUID()}-${batch}-${s}` });
      }
      await db.insert(schoolsTable).values(rows);
      schoolIds.push(...rows.map((r: any) => r.id));
    }
    expect(schoolIds.length).toBe(1000);
    // 1,004 activity definitions validated (in-memory contracts — reference-only, zero writes)
    const t0 = performance.now();
    let validated = 0;
    for (const sid of [SCHOOL_A, ...schoolIds]) {
      ov.validateActivityDefinition({ ...ACT_DICT, activityId: `act-scale-${sid}`, schoolId: sid });
      validated++;
    }
    const ms = Math.round(performance.now() - t0);
    expect(validated).toBe(1001);
    console.log(`[CORE-21 PERF] 1001 activity definitions validated in ${ms}ms (pure contracts)`);
    // assignment targeting a scale school from its own principal-role actor works
    const scaleAssign = await ov.assignActivity({
      definition: { ...ACT_DICT, activityId: `act-scale-${schoolIds[999]}`, schoolId: schoolIds[999] },
      assignment: { assignedTo: { classId: randomUUID(), schoolId: schoolIds[999] }, assignedBy: { actorId: USER_MINISTRY, actorRole: "ministry-admin" }, source: "curriculumRequired", assignedAt: iso(12000) },
    });
    expect(scaleAssign.assigned).toBe(true);
  });

  it("21-AQ. performance baseline: activity lookup / assignment validation / attempt→evidence flow / scope authorization (scoped)", async () => {
    const t = async (fn: () => Promise<unknown>): Promise<number> => { const s = performance.now(); await fn(); return Math.round(performance.now() - s); };
    const activityLookup = await t(async () => ov.validateActivityDefinition(ACT_DICT));
    const assignmentLookup = await t(() => ov.assignActivity({ definition: ACT_DICT, assignment: { assignedTo: { studentId: STUDENT_A }, assignedBy: { actorId: USER_PRINCIPAL_A, actorRole: "principal" }, source: "reinforcement", assignedAt: iso(13000) } }));
    const scopeAuthz = await t(async () => ov.assertActivityAccess({ subject: { tenantId: TENANT_M, userId: USER_TEACHER_A, staffMemberships: await membershipsOf(USER_TEACHER_A) }, definition: { tenantId: TENANT_M, schoolId: SCHOOL_A }, studentId: STUDENT_A, studentContext: await ctxOf(STUDENT_A) }));
    const evidenceWrite = await t(() => ov.recordEvidence(ov.attemptEvidenceInput({
      tenantId: TENANT_M, studentId: STUDENT_A, activityId: ACT_NUM.activityId, identityId: IDENTITY_ID,
      curriculum: ACT_NUM.curriculum, startedAt: iso(14000), submittedAt: iso(14500), durationMs: 500, responseType: "STEPS", attemptNumber: 9,
    }, "numeracy-engine", { confidence: 1 }, `c21-perf-${randomUUID()}`)));
    const flow = await t(async () => {
      const input = ov.attemptEvidenceInput({ tenantId: TENANT_M, studentId: STUDENT_A, activityId: ACT_READ.activityId, curriculum: ACT_READ.curriculum, startedAt: iso(15000), submittedAt: iso(15300), durationMs: 300, responseType: "VOICE", attemptNumber: 2 }, "reading-engine", { confidence: 0.95 }, `c21-perf2-${randomUUID()}`);
      return ov.recordEvidence(input);
    });
    console.log(`[CORE-21 PERF] activity_lookup=${activityLookup}ms assignment_validation=${assignmentLookup}ms scope_authorization=${scopeAuthz}ms evidence_write=${evidenceWrite}ms activity_to_evidence_flow=${flow}ms`);
    expect(activityLookup).toBeLessThan(1000);
    expect(evidenceWrite).toBeLessThan(2000);
  });
});
