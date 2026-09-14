/**
 * CORE-22 — Learning Content & Exercise Foundation (REAL PostgreSQL + Redis).
 * Five-layer separation proven end-to-end on the real engine stack:
 *   Content (المادة) → Exercise (المهمة) → Activity (السياق, CORE-21) →
 *   Assignment → Attempt → Engines (Dictation/Reading/Numeracy/Assessment) →
 *   Measurement → Canonical Evidence.
 * Also: curriculum anchoring with mandatory version, variants, religious
 * policy (CORE-20 reuse), idempotency, audit/privacy, no-new-tables gate,
 * synthetic scale, perf baseline. Auto-skips unless CORE22_RUNTIME=1.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { eq } from "drizzle-orm";

const RUN = process.env.CORE22_RUNTIME === "1";
const d = RUN ? describe : describe.skip;

const TENANT_M = randomUUID();
let dbmod: any, db: any, ov: any, cf: any, dictation: any, numeracy: any, assessment: any, events: any, decisions: any, ll: any;

let MINISTRY: any, DIR_1: any, DIR_2: any;
let SCHOOL_A = randomUUID(), SCHOOL_B = randomUUID();
const CLASS_4A = randomUUID(), CLASS_4B = randomUUID();
let USER_TEACHER_A: string, USER_PRINCIPAL_A: string, USER_MINISTRY: string;
const ID_OP = `c22-id-${randomUUID()}`;
let STUDENT_A: string, IDENTITY_ID: string;
const T0 = Date.UTC(2026, 8, 10, 11, 0, 0); // 2026-09-10T11:00Z
const iso = (ms: number) => new Date(T0 + ms).toISOString();

const ATTEMPT_D = randomUUID(), ATTEMPT_N = randomUUID(), ATTEMPT_A = randomUUID();
const SESSION_D = randomUUID(), SESSION_N = randomUUID(), SESSION_A = randomUUID();
const PASSAGE_A = randomUUID();

// ===== CORE-22 definitions (المادة ثم المهمة) =====
const anchor = {
  country: "EG", educationSystem: "EG-NATIONAL", stageKey: "PRIMARY", gradeLevel: "4", gradeKey: "EG-PR-04",
  subject: "dictation", curriculumId: "cur-eg-ar", curriculumVersion: "2026",
  bookId: "bk-ar-4", unitId: "u3", lessonId: "l7", objectiveId: "obj-77", skill: "dictation.accuracy", dimension: "accuracy",
};
const CONTENT_WORDS: any = {
  contentId: `cnt-words-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  kind: "WORD_LIST", language: "ar", mediaTypes: ["text"],
  inlineText: "ذهب الطالب إلى المدرسة",
  curriculum: anchor, source: "TEACHER_CREATED",
  religiousContext: null, status: "ACTIVE", version: 1,
  createdBy: { actorId: randomUUID(), actorRole: "teacher" },
};
const CONTENT_PASSAGE: any = {
  contentId: `cnt-passage-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  kind: "READING_TEXT", language: "ar", mediaTypes: ["text"],
  inlineText: "كان يا ما كان في القديم",
  curriculum: { ...anchor, subject: "reading", skill: "reading.accuracy", lessonId: "l8", objectiveId: "obj-80" },
  source: "CURRICULUM", religiousContext: null, status: "ACTIVE", version: 1,
};
const CONTENT_AUDIO: any = {
  contentId: `cnt-audio-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  kind: "MEDIA_AUDIO", language: "ar", mediaTypes: ["audio"],
  bodyRef: "s3://buytuk-audio/passages/pc22.mp3", // audio NEVER inline — reference only (R-003/R-004)
  curriculum: { ...anchor, subject: "reading", skill: "reading.listening" },
  source: "CURRICULUM", religiousContext: null, status: "ACTIVE", version: 1,
};
const CONTENT_MATH: any = {
  contentId: `cnt-math-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  kind: "QUESTION_SET", language: "ar", mediaTypes: ["text"],
  inlineText: "23*4::92",
  curriculum: { ...anchor, subject: "mathematics", curriculumId: "cur-eg-math", skill: "numeracy.arithmetic", lessonId: "l2", objectiveId: "obj-12" },
  source: "CURRICULUM", religiousContext: null, status: "ACTIVE", version: 1,
};
const EX_DICT: any = {
  exerciseId: `ex-dict-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  engineBinding: "DICTATION", contentRefs: [CONTENT_WORDS.contentId],
  expectedResponse: { type: "TYPED", maxAttempts: 2 },
  difficulty: "medium", skill: "dictation.accuracy", dimension: "accuracy",
  curriculum: anchor, status: "ACTIVE", version: 1,
};
const EX_READ: any = {
  exerciseId: `ex-read-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  engineBinding: "READING", contentRefs: [CONTENT_PASSAGE.contentId, CONTENT_AUDIO.contentId],
  expectedResponse: { type: "VOICE", replayAllowed: true },
  curriculum: CONTENT_PASSAGE.curriculum, status: "ACTIVE", version: 1,
};
const EX_NUM: any = {
  exerciseId: `ex-num-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  engineBinding: "NUMERACY", contentRefs: [CONTENT_MATH.contentId],
  expectedResponse: { type: "TYPED", digitSet: "western" },
  skill: "numeracy.arithmetic", curriculum: CONTENT_MATH.curriculum, status: "ACTIVE", version: 1,
};
const EX_ASSESS: any = {
  exerciseId: `ex-assess-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  engineBinding: "ASSESSMENT", contentRefs: [CONTENT_MATH.contentId],
  expectedResponse: { type: "SELECTION" }, curriculum: CONTENT_MATH.curriculum,
  assessmentPolicyRef: "assessment://def-c22-1", status: "ACTIVE", version: 1,
};
const ACT_DICT: any = {
  activityId: `act-c22-dict-${randomUUID()}`, tenantId: TENANT_M, schoolId: SCHOOL_A,
  curriculum: anchor, activityType: "DICTATION", expectedResponseType: "TYPED",
  status: "ACTIVE", version: 1,
};
const assessmentDefinition = {
  definitionId: "def-c22-1", title: "تقييم C22", kind: "formative" as const,
  subject: "mathematics", targets: { skills: ["numeracy.arithmetic"] },
  items: [
    { itemRef: "q1", expectedAnswer: "4", scoring: "numeric" as const, weight: 1 },
    { itemRef: "q2", expectedAnswer: "6", scoring: "numeric" as const, weight: 1 },
  ],
  dimensions: ["accuracy"], passThreshold: 0.5, maxAttempts: 2,
};
const curriculumDictation = {
  tenantId: TENANT_M, studentId: "", country: "EG", language: "ar", educationSystem: "EG-NATIONAL",
  educationStage: "primary", grade: "Grade 4", gradeKey: "EG-PR-04", subject: "dictation",
  curriculum: { curriculumId: "cur-eg-ar", version: "2026", title: "EG Arabic 2026" },
  book: { bookId: "bk-ar-4", bookTitle: "كتاب اللغة العربية" },
  unit: { unitId: "u3", unitTitle: "الوحدة الثالثة" },
  lesson: { lessonId: "l7", lessonTitle: "إملاء الوحدة الثالثة" },
  objective: { objectiveId: "obj-77", objectiveText: "كتابة النص المسموع", skills: ["dictation.accuracy"], dimensions: ["accuracy"] },
  skills: ["dictation.accuracy"], dimensions: ["accuracy"],
} as any;
const curriculumMath = {
  tenantId: TENANT_M, studentId: "", country: "EG", language: "ar", educationSystem: "EG-NATIONAL",
  educationStage: "primary", grade: "Grade 4", gradeKey: "EG-PR-04", subject: "mathematics",
  curriculum: { curriculumId: "cur-eg-math", version: "2026", title: "EG Math 2026" },
  skills: ["numeracy.arithmetic"], dimensions: ["accuracy"],
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

d("CORE-22 content & exercise foundation (real PostgreSQL)", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    ov = dbmod;
    cf = dbmod; // content-foundation resolvers ride on the same canonical surface
    dictation = await import("@dictation-engine");
    numeracy = await import("@numeracy-engine");
    assessment = await import("@assessment-engine");
    events = await import("@workspace/events");
    decisions = await import("@workspace/decisions");
    ll = await import("@workspace/learning-loop");
    const { tenantsTable, usersTable, classesTable, studentsTable } = dbmod;
    await db.insert(tenantsTable).values({ id: TENANT_M, name: "وزارة C22", slug: `c22-${randomUUID()}` });
    USER_TEACHER_A = randomUUID(); USER_PRINCIPAL_A = randomUUID(); USER_MINISTRY = randomUUID();
    await db.insert(usersTable).values([
      { id: USER_TEACHER_A, tenantId: TENANT_M, firstName: "أ", lastName: "معلم", email: `t-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" },
      { id: USER_PRINCIPAL_A, tenantId: TENANT_M, firstName: "ع", lastName: "مدير", email: `p-${randomUUID()}@x.test`, passwordHash: "x", role: "principal" },
      { id: USER_MINISTRY, tenantId: TENANT_M, firstName: "م", lastName: "وزارة", email: `m-${randomUUID()}@x.test`, passwordHash: "x", role: "admin" },
    ]);
    MINISTRY = (await ov.createOrganization({ tenantId: TENANT_M, type: "MINISTRY", name: "الوزارة", operationKey: `c22-min-${randomUUID()}` })).organization;
    const gov = (await ov.createOrganization({ tenantId: TENANT_M, type: "GOVERNORATE", name: "المحافظة", parentOrganizationId: MINISTRY.id, operationKey: `c22-g-${randomUUID()}` })).organization;
    DIR_1 = (await ov.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: "مديرية 1", parentOrganizationId: gov.id, operationKey: `c22-d1-${randomUUID()}` })).organization;
    DIR_2 = (await ov.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: "مديرية 2", parentOrganizationId: gov.id, operationKey: `c22-d2-${randomUUID()}` })).organization;
    await ov.createSchool({ tenantId: TENANT_M, name: "مدرسة أبو بكر", code: `A-${randomUUID().slice(0, 6)}`, organizationId: DIR_1.id, operationKey: `c22-sa-${randomUUID()}` }).then((r: any) => { SCHOOL_A = r.school.id; });
    await ov.createSchool({ tenantId: TENANT_M, name: "مدرسة ب", code: `B-${randomUUID().slice(0, 6)}`, organizationId: DIR_2.id, operationKey: `c22-sb-${randomUUID()}` }).then((r: any) => { SCHOOL_B = r.school.id; });
    [ACT_DICT.schoolId, CONTENT_WORDS.schoolId, CONTENT_PASSAGE.schoolId, CONTENT_AUDIO.schoolId, CONTENT_MATH.schoolId, EX_DICT.schoolId, EX_READ.schoolId, EX_NUM.schoolId, EX_ASSESS.schoolId] = Array(9).fill(SCHOOL_A);
    await db.insert(classesTable).values([
      { id: CLASS_4A, tenantId: TENANT_M, schoolId: SCHOOL_A, name: "4A", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
      { id: CLASS_4B, tenantId: TENANT_M, schoolId: SCHOOL_B, name: "4B", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
    ]);
    const id1 = await ov.createIdentity({ operationKey: ID_OP });
    IDENTITY_ID = id1.identityId;
    STUDENT_A = randomUUID();
    await db.insert(studentsTable).values({ id: STUDENT_A, tenantId: TENANT_M, classId: CLASS_4A, firstName: "أحمد", lastName: "رباعي", studentCode: `A-${randomUUID()}`, identityId: IDENTITY_ID });
    await ov.addStaffMembership({ tenantId: TENANT_M, userId: USER_MINISTRY, role: "ministry-admin", scopeType: "ORGANIZATION", scopeId: MINISTRY.id, organizationId: MINISTRY.id, operationKey: `c22-sm-${randomUUID()}` });
    await ov.addStaffMembership({ tenantId: TENANT_M, userId: USER_PRINCIPAL_A, role: "principal", scopeType: "SCHOOL", scopeId: SCHOOL_A, schoolId: SCHOOL_A, operationKey: `c22-sp-${randomUUID()}` });
    await ov.addStaffMembership({ tenantId: TENANT_M, userId: USER_TEACHER_A, role: "teacher", scopeType: "CLASS", scopeId: CLASS_4A, schoolId: SCHOOL_A, operationKey: `c22-st-${randomUUID()}` });
    // canonical attempt references (evidence writer validates against reading-owned attempts)
    const { passagesTable, readingSessionsTable, attemptsTable } = dbmod;
    await db.insert(passagesTable).values({ id: PASSAGE_A, tenantId: TENANT_M, classroomId: CLASS_4A, title: "قصة C22", text: "كان يا ما كان", difficulty: 3 });
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

  it("1. Content = المادة: validation (identity, version, body exclusivity, audio NEVER inline, variant self-ref, mediaTypes)", () => {
    cf.validateContentDefinition(CONTENT_WORDS);
    expect(() => cf.validateContentDefinition({ ...CONTENT_WORDS, contentId: "" })).toThrow(/CONTENT_ID_REQUIRED/);
    expect(() => cf.validateContentDefinition({ ...CONTENT_WORDS, version: 0 })).toThrow(/CONTENT_VERSION_INVALID/);
    expect(() => cf.validateContentDefinition({ ...CONTENT_WORDS, curriculum: { ...anchor, curriculumVersion: "" } })).toThrow(/ANCHOR_MISSING:curriculumVersion/); // 21-O parity
    expect(() => cf.validateContentDefinition({ ...CONTENT_WORDS, inlineText: "نص", bodyRef: "s3://x" })).toThrow(/BODY_SOURCE_MUST_BE_EXCLUSIVE/); // exactly one body
    expect(() => cf.validateContentDefinition({ ...CONTENT_WORDS, inlineText: undefined, bodyRef: undefined })).toThrow(/BODY_SOURCE_MUST_BE_EXCLUSIVE/);
    expect(() => cf.validateContentDefinition({ ...CONTENT_WORDS, kind: "MEDIA_AUDIO", bodyRef: undefined })).toThrow(/AUDIO_NEVER_INLINE/); // R-003/R-004
    expect(() => cf.validateContentDefinition({ ...CONTENT_WORDS, bodyRef: "data:audio/mp3;base64,xxx", inlineText: undefined })).toThrow(/INLINE_DATA_FORBIDDEN/);
    expect(() => cf.validateContentDefinition({ ...CONTENT_WORDS, variantOf: CONTENT_WORDS.contentId })).toThrow(/VARIANT_SELF_REFERENCE/);
    expect(() => cf.validateContentDefinition({ ...CONTENT_WORDS, mediaTypes: [] })).toThrow(/MEDIA_TYPES_REQUIRED/);
    expect(() => cf.validateContentDefinition({ ...CONTENT_WORDS, source: "UNKNOWN" as any })).toThrow(/SOURCE_INVALID/);
    // variant to a PARENT content is a valid reference (no copy)
    const variant: any = { ...CONTENT_PASSAGE, contentId: `cnt-var-${randomUUID()}`, variantOf: CONTENT_PASSAGE.contentId, inlineText: "قصة أسهل", version: 1 };
    cf.validateContentDefinition(variant);
    expect(variant.variantOf).toBe(CONTENT_PASSAGE.contentId);
  });

  it("2. Exercise = المهمة: engine binding + content refs + expected-response compatibility per engine", () => {
    cf.validateExerciseDefinition(EX_DICT);
    expect(() => cf.validateExerciseDefinition({ ...EX_DICT, engineBinding: "QUANTUM" as any })).toThrow(/ENGINE_BINDING_INVALID/);
    expect(() => cf.validateExerciseDefinition({ ...EX_DICT, contentRefs: [] })).toThrow(/EXERCISE_CONTENT_REQUIRED/); // exercise BUILT on content
    // compatibility matrix enforced through exercise validation: reading exercise carrying TYPED response is invalid
    expect(() => cf.validateExerciseDefinition({ ...EX_READ, expectedResponse: { type: "TYPED" } })).toThrow(/INCOMPATIBLE/);
    expect(() => cf.validateExerciseDefinition({ ...EX_NUM, expectedResponse: { type: "HANDWRITTEN" } })).toThrow(/INCOMPATIBLE/);
  });

  it("3. expected-response matrix per engine (unified config, 21-P parity)", () => {
    expect(() => cf.validateExpectedResponse("READING", { type: "VOICE" })).not.toThrow();
    expect(() => cf.validateExpectedResponse("READING", { type: "TYPED" })).toThrow(/INCOMPATIBLE/);
    expect(() => cf.validateExpectedResponse("DICTATION", { type: "HANDWRITTEN" })).not.toThrow();
    expect(() => cf.validateExpectedResponse("NUMERACY", { type: "STEPS" })).not.toThrow();
    expect(() => cf.validateExpectedResponse("NUMERACY", { type: "HANDWRITTEN" })).toThrow(/INCOMPATIBLE/);
    expect(() => cf.validateExpectedResponse("ASSESSMENT", { type: "SELECTION" })).not.toThrow();
    expect(() => cf.validateExpectedResponse("DICTATION", { type: "TYPED", maxAttempts: 0 })).toThrow(/MAX_ATTEMPTS_INVALID/);
    expect(() => cf.validateExpectedResponse("DICTATION", { type: "TYPED", timeLimitMs: -5 })).toThrow(/TIME_LIMIT_INVALID/);
  });

  it("4. THE SEPARATION ENFORCER: exercise binds into activity BY REFERENCE — same tenant + same curriculum chain required", () => {
    cf.assertExerciseCompatibleWithActivity(EX_DICT, ACT_DICT); // same chain → OK
    expect(() => cf.assertExerciseCompatibleWithActivity({ ...EX_NUM, tenantId: randomUUID() } as any, ACT_DICT)).toThrow(/BINDING_TENANT_MISMATCH/);
    expect(() => cf.assertExerciseCompatibleWithActivity(EX_NUM as any, ACT_DICT)).toThrow(/BINDING_CURRICULUM_MISMATCH:subject/); // math exercise ≠ dictation activity
    expect(() => cf.assertExerciseCompatibleWithActivity({ ...EX_DICT, curriculum: { ...anchor, curriculumVersion: "2027" } }, ACT_DICT)).toThrow(/MISMATCH:curriculumVersion/); // version drift blocked
    expect(() => cf.assertExerciseCompatibleWithActivity({ ...EX_DICT, curriculum: { ...anchor, stageKey: "PREPARATORY" } }, ACT_DICT)).toThrow(/MISMATCH:stageKey/);
  });

  it("5. DICTATION resolver: content text → engine prompt (deterministic, source-aware)", () => {
    const input = cf.resolveDictationInput(EX_DICT, [CONTENT_WORDS]);
    expect(input.prompt.text).toBe("ذهب الطالب إلى المدرسة");
    expect(input.prompt.language).toBe("ar");
    expect(input.prompt.source).toBe("TEACHER_TEXT"); // teacher-created content
    expect(input.responseSource).toBe("keyboard");
    expect(() => cf.resolveDictationInput(EX_DICT, [])).toThrow(/PROMPT_TEXT_MISSING/);
    expect(() => cf.resolveDictationInput(EX_READ as any, [CONTENT_WORDS])).toThrow(/RESOLVER_ENGINE_MISMATCH/);
  });

  it("6. READING resolver: passage text + audio as REFERENCE (bodyRef only, never inline)", () => {
    const input = cf.resolveReadingInput(EX_READ, [CONTENT_PASSAGE, CONTENT_AUDIO]);
    expect(input.passageText).toBe("كان يا ما كان في القديم");
    expect(input.passageRef).toBe("s3://buytuk-audio/passages/pc22.mp3"); // audio reference flows, content never copied
    expect(() => cf.resolveReadingInput(EX_READ, [])).toThrow(/READING_MATERIAL_MISSING/);
  });

  it("7. NUMERACY resolver: content convention 'expression::expectedAnswer' → engine task", () => {
    const input = cf.resolveNumeracyInput(EX_NUM, [CONTENT_MATH]);
    expect(input.task.expression).toBe("23*4");
    expect(input.task.expectedAnswer).toBe("92");
    expect(input.task.digitSet).toBe("western");
    expect(() => cf.resolveNumeracyInput(EX_NUM, [{ ...CONTENT_MATH, inlineText: "بدون فاصل" }])).toThrow(/NUMERACY_QUESTION_MALFORMED/);
  });

  it("8. ASSESSMENT resolver: requires the Assessment Engine definition ref (21-E separation)", () => {
    const input = cf.resolveAssessmentInput(EX_ASSESS);
    expect(input.assessmentPolicyRef).toBe("assessment://def-c22-1");
    expect(() => cf.resolveAssessmentInput({ ...EX_ASSESS, assessmentPolicyRef: undefined })).toThrow(/ASSESSMENT_DEFINITION_REF_REQUIRED/);
    expect(() => cf.resolveAssessmentInput(EX_DICT as any)).toThrow(/RESOLVER_ENGINE_MISMATCH/);
  });

  it("9-10. religious policy on CONTENT (CORE-20 reuse): pathway + cross-access + denial — reason codes only", () => {
    const islamic: any = { ...CONTENT_WORDS, contentId: `cnt-isl-${randomUUID()}`, kind: "READING_TEXT", religiousContext: "ISLAMIC", curriculum: { ...anchor, subject: "islamic-education" } };
    const r1 = cf.checkContentAccessForStudent({ content: islamic, tenantId: TENANT_M, studentReligiousContext: "MUSLIM" });
    expect(r1.decision).toBe("ALLOW"); // pathway
    const r2 = cf.checkContentAccessForStudent({ content: islamic, tenantId: TENANT_M, studentReligiousContext: "CHRISTIAN" });
    expect(r2.decision).toBe("DENY"); // religious-education content stays pathway-only
    const grammarIslamic: any = { ...CONTENT_WORDS, contentId: `cnt-gram-${randomUUID()}`, religiousContext: "ISLAMIC", kind: "INSTRUCTIONS", curriculum: { ...anchor, subject: "arabic-language" } };
    const r3 = cf.checkContentAccessForStudent({ content: grammarIslamic, tenantId: TENANT_M, studentReligiousContext: "CHRISTIAN" });
    expect(r3.decision).toBe("ALLOW"); // cross-access for grammar objectives (20-R rule 3)
    expect(JSON.stringify(r3)).not.toMatch(/"MUSLIM"|"CHRISTIAN"/); // reason codes only
    const neutral = cf.checkContentAccessForStudent({ content: CONTENT_WORDS, tenantId: TENANT_M, studentReligiousContext: null });
    expect(neutral.decision).toBe("ALLOW"); // non-religious content open (20-S)
  });

  it("11-14. E2E: content → exercise → DICTATION engine → canonical evidence (real attempt reference, curriculum version carried)", async () => {
    const prompt = cf.resolveDictationInput(EX_DICT, [CONTENT_WORDS]);
    await ov.auditActivityEvent("activity.started", TENANT_M, STUDENT_A, ACT_DICT.activityId, undefined);
    const r = await dictation.runDictationAttempt({
      attempt: {
        tenantId: TENANT_M, studentId: STUDENT_A, activityId: ACT_DICT.activityId,
        attemptId: ATTEMPT_D, startedAt: iso(1000), submittedAt: iso(1800),
        replayCount: 0, responseDurationMs: 800, totalActivityDurationMs: 800,
      },
      prompt: prompt.prompt,
      submission: { typedText: "ذهب الطالب إلى المدرسة", source: "keyboard" },
      policy: dictationPolicy,
    });
    expect(r.measurements.accuracy).toBe(1);
    await ov.auditActivityEvent("activity.submitted", TENANT_M, STUDENT_A, ACT_DICT.activityId, r.attemptId);
    const rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, evidenceType: "attempt", limit: 50 });
    const dict = rows.filter((x: any) => x.sourceEngine === "dictation-engine" && x.activityId === ACT_DICT.activityId);
    expect(dict.length).toBe(1);
    expect(dict[0].lessonId).toBe("l7"); // content → exercise → evidence chain via references
    expect(JSON.stringify(dict[0].metadata)).toContain("2026"); // curriculum version carried
  });

  it("15-16. E2E: numeracy content → engine → evidence; reading audio-ref content → events → outbox → evidence", async () => {
    // numeracy: resolve → analyze → record (canonical)
    const nIn = cf.resolveNumeracyInput(EX_NUM, [CONTENT_MATH]);
    const attempt = {
      attemptId: ATTEMPT_N, tenantId: TENANT_M, studentId: STUDENT_A, activityId: `act-c22-num-${randomUUID()}`,
      occurredAt: iso(3000), startedAt: iso(3000), submittedAt: iso(3500), durationMs: 500, attemptCount: 1,
    };
    const analysis = numeracy.analyzeNumeracy({
      attempt, task: nIn.task, response: { finalAnswer: "92" },
      policy: { language: "ar", digitSet: "western", curriculum: curriculumMath },
    });
    expect(analysis.comparison.finalCorrect).toBe(true);
    await numeracy.recordNumeracyEvidence({ attempt, measurements: analysis.measurements, policy: { language: "ar", digitSet: "western", curriculum: curriculumMath }, comparison: analysis.comparison, area: "arithmetic" });
    let rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, evidenceType: "attempt", limit: 50 });
    expect(rows.filter((x: any) => x.sourceEngine === "numeracy-engine").length).toBe(1);
    // reading: passage content → reading events → outbox → canonical evidence
    const rIn = cf.resolveReadingInput(EX_READ, [CONTENT_PASSAGE, CONTENT_AUDIO]);
    expect(rIn.passageText).toBeTruthy();
    for (let i = 0; i < 3; i++) {
      await events.publishEvent(learningEvent("StudentResponseRecorded", { skill: "reading.accuracy", accuracy: 0.9, fluency: 0.9 }, iso(5000 + i * 1000), STUDENT_A), {});
    }
    const res = await events.processEventOutbox({ limit: 50 });
    expect(res.failed).toBe(0);
    rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 100 });
    expect(rows.filter((x: any) => x.sourceEngine === "reading-engine" && x.evidenceType === "response").length).toBe(3);
  });

  it("17. E2E: assessment exercise → Assessment Engine definition → canonical evidence (kind=assessment)", async () => {
    const aIn = cf.resolveAssessmentInput(EX_ASSESS);
    expect(aIn.assessmentPolicyRef).toBe(EX_ASSESS.assessmentPolicyRef);
    const attempt = {
      attemptId: ATTEMPT_A, tenantId: TENANT_M, studentId: STUDENT_A, activityId: `act-c22-assess-${randomUUID()}`,
      occurredAt: iso(7000), startedAt: iso(7000), submittedAt: iso(7600), durationMs: 600, attemptCount: 1,
      curriculum: curriculumMath,
    };
    const m = assessment.evaluateAssessment(assessmentDefinition, { items: [{ itemRef: "q1", response: "4" }, { itemRef: "q2", response: "6" }] }, attempt);
    expect(m.rubricScore).toBe(1);
    await assessment.recordAssessmentEvidence({ definition: assessmentDefinition, attempt, measurements: m });
    const rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, evidenceType: "assessment", limit: 50 });
    expect(rows.filter((x: any) => x.sourceEngine === "assessment-engine").length).toBe(1);
  });

  it("18-19. teacher decision boundary intact over exercise-driven loop; learner model multidimensional (no global score)", async () => {
    const model = await ov.buildLearnerModel({ tenantId: TENANT_M, studentId: STUDENT_A });
    expect(model.dimensions.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(model)).not.toMatch(/overallScore|globalScore|studentLevel/);
    const rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 100 });
    const signals = await ll.stageDetect({ tenantId: TENANT_M, studentId: STUDENT_A, rows });
    const sig = signals[0] ?? {
      kind: "repeated-mistake", skill: "dictation.accuracy", tenantId: TENANT_M, studentId: STUDENT_A,
      evidenceRefs: rows.slice(0, 2).map((r: any) => r.id),
      signalKey: ll.makeSignalKey("repeated-mistake", TENANT_M, STUDENT_A, "dictation.accuracy"),
      confidence: 0.9, reason: "c22 fallback signal",
    };
    const diagnosis = await ll.createDiagnosis({ tenantId: TENANT_M, studentId: STUDENT_A, signal: sig });
    const proposal = await ll.proposeIntervention({ tenantId: TENANT_M, studentId: STUDENT_A, diagnosis, activityType: "targeted-practice" });
    const applied = await decisions.applyTeacherDecision({ tenantId: TENANT_M, proposal, decision: { action: "APPROVED", actorId: USER_TEACHER_A, actorRole: "teacher", decidedAt: iso(9000), reason: "موافقة" } });
    expect(applied.proposal.status).toBe("APPROVED");
    expect(() => decisions.assertDeliveryAuthorized({ tenantId: TENANT_M, studentId: STUDENT_A, proposalId: proposal.id, activityType: applied.proposal.activityType }, applied.authorization)).not.toThrow();
  });

  it("20. transfer safety: content/evidence immutable through A→B→A; identity unchanged", async () => {
    const before = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 100 });
    const frozen = JSON.stringify(before.map((e: any) => ({ id: e.id, tenantId: e.tenantId, activityId: e.activityId, confidence: e.confidence })));
    await ov.startMembership({ identityId: IDENTITY_ID, tenantId: TENANT_M, studentId: STUDENT_A, schoolId: SCHOOL_A, classId: CLASS_4A, operationKey: `c22-ma-${randomUUID()}` });
    await ov.transferStudent({ identityId: IDENTITY_ID, fromTenantId: TENANT_M, toTenantId: TENANT_M, toStudentId: STUDENT_A, toSchoolId: SCHOOL_B, toClassId: CLASS_4B, operationKey: `c22-mb-${randomUUID()}` });
    await ov.returnStudent({ identityId: IDENTITY_ID, toTenantId: TENANT_M, toStudentId: STUDENT_A, toSchoolId: SCHOOL_A, toClassId: CLASS_4A, operationKey: `c22-mc-${randomUUID()}` });
    const after = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 100 });
    expect(JSON.stringify(after.map((e: any) => ({ id: e.id, tenantId: e.tenantId, activityId: e.activityId, confidence: e.confidence })))).toBe(frozen);
    const [row] = await db.select().from(dbmod.studentsTable).where(eq(dbmod.studentsTable.id, STUDENT_A));
    expect(row.identityId).toBe(IDENTITY_ID);
  });

  it("21. idempotency: exerciseSubmissionOperationKey deterministic; parallel duplicate submissions → ONE evidence row", async () => {
    const base = { tenantId: TENANT_M, studentId: STUDENT_A, exerciseId: EX_NUM.exerciseId, attemptNumber: 1, startedAt: iso(11000) };
    expect(cf.exerciseSubmissionOperationKey(base)).toBe(cf.exerciseSubmissionOperationKey({ ...base }));
    const opk = cf.exerciseSubmissionOperationKey(base);
    const input = {
      tenantId: TENANT_M, studentId: STUDENT_A, actorRole: "student", occurredAt: new Date(iso(11500)),
      evidenceType: "attempt", sourceEngine: "numeracy-engine", subject: "mathematics", grade: "4",
      attemptId: ATTEMPT_N, confidence: 1, operationKey: opk,
    };
    await Promise.allSettled([ov.recordEvidence(input), ov.recordEvidence({ ...input })]);
    const rows = await ov.listEvidenceForStudent({ tenantId: TENANT_M, studentId: STUDENT_A, limit: 200 });
    expect(rows.filter((r: any) => r.operationKey === opk).length).toBe(1);
  });

  it("22-23. audit/privacy: no names, no religion, no audio inline anywhere in new audit rows; aggregate compatibility untouched", async () => {
    const rows = await db.select().from(dbmod.auditLogsTable);
    for (const r of rows) {
      expect(JSON.stringify(r)).not.toMatch(/password|token|audio|secret|"MUSLIM"|"CHRISTIAN"|أحمد/i);
    }
    // CORE-20 aggregation still consumes evidence produced through the content chain
    const res = await ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_MINISTRY, organizationId: MINISTRY.id, timePeriod: { from: iso(0), to: iso(20000) }, evidenceType: "attempt", subject: "dictation", minimumAggregationSize: 1 });
    expect(res.groups.find((g: any) => g.schoolId === SCHOOL_A)).toBeDefined();
  });

  it("24. 21-AF gate: CORE-22 added NONE (0000..0003 unchanged); 0004 library per ACR-24/001 (CORE-24 Wave 1, owner-approved) — and 0004 creates EXACTLY the two definition tables", () => {
    const migrations = readdirSync("packages/database/migrations").filter((f: string) => f.endsWith(".sql"));
    expect(migrations.length).toBe(6); // 0000..0003 (CORE-22 added NONE) + 0004 (ACR-24/001) + 0005 (ACR-24/002 state tables; ADR-004 §5)
    for (const f of migrations.filter((x) => !x.startsWith("0004_"))) {
      const sql = readFileSync(`packages/database/migrations/${f}`, "utf8");
      expect(sql).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?(content|exercise|content_library)/i);
    }
    // ACR-24/001: 0004 creates EXACTLY content_definitions + exercise_definitions — never a second evidence/score store
    const sql0004 = readFileSync("packages/database/migrations/0004_core24_content_exercise_library.sql", "utf8");
    const created = [...sql0004.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?\"?([a-z_]+)\"?/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["content_definitions", "exercise_definitions"]);
    expect(sql0004).not.toMatch(/globalstudentscore|overallscore|globalrank/i);
    for (const f of ["packages/database/src/content/contracts.ts", "packages/database/src/content/foundation.ts"]) {
      const raw = readFileSync(f, "utf8");
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // scan CODE, not documentation
      expect(code).not.toMatch(/pgTable\(/);
      expect(code).not.toMatch(/globalStudentScore|overallScore|globalRank/i);
      expect(code).not.toMatch(/openai|anthropic|onnx|\.predict\(|mlModel/i);
    }
  });

  it("25-26. synthetic scale: 1,000+ content/exercise definitions validated (pure contracts) + perf baseline", async () => {
    const t0 = performance.now();
    let validated = 0;
    for (let i = 0; i < 600; i++) {
      cf.validateContentDefinition({ ...CONTENT_WORDS, contentId: `cnt-scale-${i}` });
      cf.validateExerciseDefinition({ ...EX_DICT, exerciseId: `ex-scale-${i}` });
      validated += 2;
    }
    const ms = Math.round(performance.now() - t0);
    expect(validated).toBe(1200);
    console.log(`[CORE-22 PERF] 1200 content+exercise definitions validated in ${ms}ms (pure contracts)`);
    const t = async (fn: () => unknown): Promise<number> => { const s = performance.now(); fn(); return Math.round(performance.now() - s); };
    const contentValidate = await t(() => cf.validateContentDefinition(CONTENT_WORDS));
    const exerciseValidate = await t(() => cf.validateExerciseDefinition(EX_DICT));
    const resolve = await t(() => cf.resolveDictationInput(EX_DICT, [CONTENT_WORDS]));
    const bind = await t(() => cf.assertExerciseCompatibleWithActivity(EX_DICT, ACT_DICT));
    const policy = await t(() => cf.checkContentAccessForStudent({ content: CONTENT_WORDS, tenantId: TENANT_M, studentReligiousContext: "MUSLIM" }));
    console.log(`[CORE-22 PERF] content_validate=${contentValidate}ms exercise_validate=${exerciseValidate}ms resolver=${resolve}ms binding_check=${bind}ms content_policy=${policy}ms`);
    expect(contentValidate).toBeLessThan(500);
    expect(resolve).toBeLessThan(500);
  });
});
