/**
 * CORE-31 / E4-P0 — Student Learning Loop E2E (Lesson Runtime axis).
 * Real PostgreSQL (core31_verify) + real Redis + real HTTP. Nothing mocked
 * except the READING pipeline's EXTERNAL-provider seams (the approved
 * WAVE-4A list) — the mastery leg runs the REAL queue + REAL processor code
 * path (the single existing mastery writer), so "Update Mastery" is proven
 * through the canonical current writer, not a fixture.
 *
 * Loop legs proven (owner DoD):
 *   Create/Authenticate → Open Dashboard → Open Lesson → Start Activity (lesson
 *   exercise) → Submit Attempt → Evidence (real engine, error captured) →
 *   Assessment/Learner Model update (weak → gap → targeted-practice
 *   recommendation) → Mastery Update (reading writer) → Retry/Improvement →
 *   Mastery/strength improvement → Next recommendation (evidence-derived).
 * Security: IDOR (student-B on A), out-of-scope staff 403, cross-tenant 404,
 *   malformed UUID 400, unauthenticated 401, tenant-B isolation by values.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const RUN = process.env.CORE31_E2E === "1";
const d = RUN ? describe : describe.skip;

// ── READING pipeline EXTERNAL-provider seams only (approved WAVE-4A list) ──
vi.mock("../../engines/reading-engine/src/security/s3-client.js", () => ({
  downloadAudio: async () => ({ encryptedBuffer: new Uint8Array(100), encryptedKey: "ek" }),
  decryptAudio: async () => new Uint8Array(16000 * 2),
}));
vi.mock("../../engines/reading-engine/src/pipeline/audio-enhancement.js", () => ({
  AudioEnhancement: class { validate() {} denoise = async () => new Float32Array(16000); },
}));
vi.mock("../../engines/reading-engine/src/pipeline/feature-extraction.js", () => ({
  FeatureExtractor: class { extract = () => ({}); },
}));
vi.mock("../../engines/reading-engine/src/pipeline/vad.js", () => ({
  VoiceActivityDetector: class { detect = async () => [{}]; mergeSegments = () => [{}]; },
}));
vi.mock("../../engines/reading-engine/src/pipeline/stt.js", () => ({
  WhisperSTT: class { transcribe = async () => ({ text: "مرحبا بالعالم", words: [] }); },
}));
vi.mock("../../engines/reading-engine/src/pipeline/g2p.js", () => ({
  G2PEngine: class { diacritizeSentence = async () => ""; },
}));
vi.mock("../../engines/reading-engine/src/pipeline/forced-alignment.js", () => ({
  ForcedAlignment: class { align = async () => []; },
}));
vi.mock("../../engines/reading-engine/src/pipeline/alignment.js", () => ({
  AlignmentEngine: class {
    align = () => ({ ops: [{ type: "match", expected: "x", actual: "x", cost: 0 }], distance: 0, normalizedDistance: 0 });
  },
}));
vi.mock("../../engines/reading-engine/src/engines/confidence.js", () => ({ ConfidenceEngine: class {} }));
vi.mock("../../engines/reading-engine/src/engines/reading-score.js", () => ({
  ReadingScoreEngine: class {
    compute = () => ({ overall: 85, accuracy: 90, pronunciation: 80, fluency: 85, prosody: 80, wpm: 100, durationSec: 5 });
  },
}));
vi.mock("../../engines/reading-engine/src/engines/mastery.js", () => ({
  MasteryEngine: class { compute = () => ({ level: "PROGRESSING", delta: 1, attempts: 2, trend: "up" }); },
}));
vi.mock("../../engines/reading-engine/src/engines/gap.js", () => ({
  GapEngine: class {
    compute = () => ({ errorDistribution: {}, phonemeGaps: {}, problemWords: [], skippedSegments: [], severityBreakdown: { high: 0, medium: 0, low: 0 } });
  },
}));
vi.mock("../../engines/reading-engine/src/engines/recommendation.js", () => ({
  RecommendationEngine: class { compute = () => []; },
}));
vi.mock("../../engines/reading-engine/src/engines/ai-feedback.js", () => ({
  AIFeedbackEngine: class { generate = async () => []; },
}));
vi.mock("../../engines/reading-engine/src/report/generator.js", () => ({
  ReportGenerator: class {
    build = (...args: unknown[]) => ({
      attemptId: args[9], passageId: args[10], studentId: args[11], tenantId: args[12],
      expected: "", actual: "", wordReport: [], reading: args[4], mastery: args[5], gaps: args[6],
      recommendations: [], aiFeedback: [], createdAt: new Date().toISOString(), modelVersions: {},
    });
  },
}));

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
let dbmod: any, db: any;
let IDENTITY_1: string, STUDENT_1: string, CLASS_A: string, SCHOOL_A: string;
let IDENTITY_B1: string, STUDENT_B1: string, CLASS_B: string, SCHOOL_B: string;
let USER_TA: string, USER_TB: string, USER_TC: string;
let STUDENT_TOKEN = "", STUDENT_B_TOKEN = "", TEACHER_A_TOKEN = "", TEACHER_B_TOKEN = "", TEACHER_C_TOKEN = "";
let LESSON_ID = "", EXERCISE_NUM = "", EXERCISE_READING = "", PASSAGE_1 = "", SESSION_1 = "";
let base = "";
let server: Server | null = null;
const TEACHER_A_EMAIL = `e4-ta-${randomUUID()}@x.test`;
const TEACHER_B_EMAIL = `e4-tb-${randomUUID()}@x.test`;
const TEACHER_C_EMAIL = `e4-tc-${randomUUID()}@x.test`;
const opKey = (tag: string) => `c31-${tag}-${randomUUID()}`;

async function api(method: string, path: string, opts: { body?: unknown; token?: string; tenant?: string; idempotencyKey?: string } = {}): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.tenant) headers["x-tenant-id"] = opts.tenant;
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  const res = await fetch(base + path, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json };
}

async function assessmentEvidence(studentId: string, tenantId: string, subject: string, metric: string, value: number, day: number): Promise<void> {
  await dbmod.recordEvidence({
    tenantId, studentId, actorRole: "student",
    occurredAt: new Date(Date.UTC(2026, 8, day, 10, 0, 0)),
    evidenceType: "assessment", subject,
    response: { [metric]: value },
    sourceEngine: "e4-cycle", tool: "core-31", operationKey: opKey("asm"),
  });
}

d("CORE-31 / E4-P0: Student Learning Loop — Lesson Runtime axis over real HTTP", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    const { tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable, passagesTable, readingSessionsTable } = dbmod;

    await db.insert(tenantsTable).values([
      { id: TENANT_A, name: "C31 مستأجر A", slug: `c31a-${randomUUID()}` },
      { id: TENANT_B, name: "C31 مستأجر B", slug: `c31b-${randomUUID()}` },
    ]);
    SCHOOL_A = randomUUID(); CLASS_A = randomUUID();
    await db.insert(schoolsTable).values({ id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة E4-A" });
    await db.insert(classesTable).values({ id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" });
    IDENTITY_1 = randomUUID();
    await db.insert(studentIdentitiesTable).values({ id: IDENTITY_1, operationKey: opKey("id1") });
    STUDENT_1 = randomUUID();
    await db.insert(studentsTable).values({ id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "سالم", lastName: "E4", studentCode: `E4-${randomUUID()}` });
    await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });

    SCHOOL_B = randomUUID(); CLASS_B = randomUUID();
    await db.insert(schoolsTable).values({ id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة E4-B" });
    await db.insert(classesTable).values({ id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" });
    IDENTITY_B1 = randomUUID();
    await db.insert(studentIdentitiesTable).values({ id: IDENTITY_B1, operationKey: opKey("idb") });
    STUDENT_B1 = randomUUID();
    await db.insert(studentsTable).values({ id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "باسم", lastName: "E4B", studentCode: `E4B-${randomUUID()}` });
    await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

    const { hashPassword } = await import("@workspace/security");
    USER_TA = randomUUID(); USER_TB = randomUUID(); USER_TC = randomUUID();
    await db.insert(usersTable).values([
      { id: USER_TA, tenantId: TENANT_A, firstName: "معلمة", lastName: "A", email: TEACHER_A_EMAIL, passwordHash: await hashPassword("s3cretpass"), role: "teacher" },
      { id: USER_TB, tenantId: TENANT_B, firstName: "معلم", lastName: "B", email: TEACHER_B_EMAIL, passwordHash: await hashPassword("s3cretpass"), role: "teacher" },
      { id: USER_TC, tenantId: TENANT_A, firstName: "معلمة", lastName: "C", email: TEACHER_C_EMAIL, passwordHash: await hashPassword("s3cretpass"), role: "teacher" },
    ]);
    await db.insert(dbmod.staffMembershipsTable).values([
      { id: randomUUID(), tenantId: TENANT_A, userId: USER_TA, schoolId: SCHOOL_A, role: "teacher", scopeType: "CLASS", scopeId: CLASS_A, status: "active", operationKey: opKey("sma") },
      { id: randomUUID(), tenantId: TENANT_B, userId: USER_TB, schoolId: SCHOOL_B, role: "teacher", scopeType: "CLASS", scopeId: CLASS_B, status: "active", operationKey: opKey("smb") },
      { id: randomUUID(), tenantId: TENANT_A, userId: USER_TC, schoolId: SCHOOL_A, role: "teacher", scopeType: "CLASS", scopeId: randomUUID(), status: "active", operationKey: opKey("smc") },
    ]);

    // LESSON (content_definitions, open registry kind=LESSON) + its NUMERACY exercise (content_id link).
    const anchor = { curriculumId: "cur-eg-ar", curriculumVersion: "2026", country: "EG", educationSystem: "EG-NATIONAL", stageKey: "PRIMARY", gradeKey: "EG-PR-04", gradeLevel: "4", subject: "math", bookId: "bk-4", unitId: "u1", lessonId: "les-1", objectiveId: "o1" };
    const lesson = await dbmod.createContentDefinition({
      tenantId: TENANT_A, title: "درس الضرب — E4", kind: "LESSON", source: "TEACHER_CREATED",
      curriculum: anchor, createdBy: USER_TA, operationKey: opKey("lesson"),
      metadata: { objective: "إتقان ضرب عددين", successCriteria: "دقة ≥ 0.85 على 3 محاولات" },
    });
    LESSON_ID = lesson.content.id;
    await dbmod.publishContent(TENANT_A, LESSON_ID, USER_TA);
    const ex = await dbmod.createExerciseDefinition({
      tenantId: TENANT_A, activityType: "MATHEMATICS", engineBinding: "NUMERACY",
      expectedResponseType: "TYPED", source: "TEACHER_CREATED", curriculum: anchor,
      contentId: LESSON_ID, createdBy: USER_TA, operationKey: opKey("exn"),
    });
    EXERCISE_NUM = ex.exercise.id;
    await dbmod.publishExercise(TENANT_A, EXERCISE_NUM, USER_TA);

    // READING slice for the Mastery leg (real writer = analyze processor).
    PASSAGE_1 = randomUUID();
    await db.insert(passagesTable).values({ id: PASSAGE_1, tenantId: TENANT_A, title: "نص E4", text: "مرحبا بالعالم", difficulty: 1 });
    SESSION_1 = randomUUID();
    await db.insert(readingSessionsTable).values({ id: SESSION_1, tenantId: TENANT_A, studentId: STUDENT_1, sessionType: "reading", status: "draft" });
    const rx = await dbmod.createExerciseDefinition({
      tenantId: TENANT_A, activityType: "READING", engineBinding: "READING",
      expectedResponseType: "VOICE", source: "TEACHER_CREATED", curriculum: { ...anchor, subject: "reading" },
      createdBy: USER_TA, operationKey: opKey("exr"),
    });
    EXERCISE_READING = rx.exercise.id;
    await dbmod.publishExercise(TENANT_A, EXERCISE_READING, USER_TA);

    const { default: app } = await import("../../apps/api/src/app.js");
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
        resolve();
      });
    });

    const sLogin = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_1 }, tenant: TENANT_A });
    expect(sLogin.status).toBe(200);
    STUDENT_TOKEN = sLogin.json.accessToken;
    const sbLogin = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_B1 }, tenant: TENANT_B });
    expect(sbLogin.status).toBe(200);
    STUDENT_B_TOKEN = sbLogin.json.accessToken;
    for (const [tok, email] of [["A", TEACHER_A_EMAIL], ["B", TEACHER_B_EMAIL], ["C", TEACHER_C_EMAIL]] as const) {
      const l = await api("POST", "/v1/auth/login", { body: { email, password: "s3cretpass" } });
      expect(l.status).toBe(200);
      if (tok === "A") TEACHER_A_TOKEN = l.json.accessToken;
      if (tok === "B") TEACHER_B_TOKEN = l.json.accessToken;
      if (tok === "C") TEACHER_C_TOKEN = l.json.accessToken;
    }
  });

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
  });

  it("E4-1 [Lesson Runtime]: lessons listed (published LESSON) → open lesson shows its linked exercise (content_id honored)", async () => {
    const list = await api("GET", "/v1/lessons", { token: STUDENT_TOKEN });
    expect(list.status).toBe(200);
    const mine = list.json.items.find((l: any) => l.id === LESSON_ID);
    expect(mine).toBeTruthy();
    expect(mine.status).toBe("PUBLISHED");
    const open = await api("GET", `/v1/lessons/${LESSON_ID}`, { token: STUDENT_TOKEN });
    expect(open.status).toBe(200);
    expect(open.json.lesson.id).toBe(LESSON_ID);
    expect(open.json.exercises.some((e: any) => e.exerciseId === EXERCISE_NUM)).toBe(true);
    // negatives: unknown lesson (valid UUID) → 404 · cross-tenant lesson → 404 · unauth → 401
    const nf = await api("GET", `/v1/lessons/${randomUUID()}`, { token: STUDENT_TOKEN });
    expect(nf.status).toBe(404);
    expect(nf.json.error.code).toBe("CONTENT_NOT_FOUND_IN_TENANT");
    const xt = await api("GET", `/v1/lessons/${LESSON_ID}`, { token: TEACHER_B_TOKEN });
    expect(xt.status).toBe(404);
    const un = await api("GET", "/v1/lessons");
    expect(un.status).toBe(401);
  });

  it("E4-2 [Practice→Attempt→Evidence]: student starts the LESSON's exercise → submits a wrong numeracy answer → real engine evidence with error kind", async () => {
    const start = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: opKey("att1"),
      body: { activityId: "act-e4-numeracy", exerciseId: EXERCISE_NUM, attemptNumber: 1 },
    });
    expect(start.status).toBe(201);
    const attemptId = start.json.attempt.id as string;
    const submit = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: { durationMs: 30000, engineInput: { task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" }, response: { finalAnswer: "91" } } },
    });
    expect(submit.status).toBe(200);
    expect(submit.json.state).toBe("EVIDENCE_RECORDED"); // V-3 sync site ran (loop stopped at the gate — no decision)
    const ev = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 100 });
    const row = ev.find((r: any) => r.id === submit.json.evidenceRef);
    expect(row).toBeTruthy();
    expect(row.evidenceType).toBe("attempt");
    expect(row.errorType).toBe("FINAL_ANSWER_ERROR"); // 16-kind taxonomy — real error analysis, not a bare score
    (globalThis as any).__ATTEMPT_1 = attemptId;
  });

  it("E4-3 [Weak phase → Gap → Recommendation]: dashboard shows weak reading skill, gaps, mastery [] (none yet), and an evidence-derived targeted-practice nextActivity", async () => {
    // canonical assessment evidence (weak reading, strong math) through the ONLY writer
    for (const [day, v] of [[1, 0.9], [2, 0.92], [3, 0.95]] as const) await assessmentEvidence(STUDENT_1, TENANT_A, "mathematics", "numeracy", v, day);
    for (const [day, v] of [[1, 0.4], [2, 0.42], [3, 0.45]] as const) await assessmentEvidence(STUDENT_1, TENANT_A, "reading", "accuracy", v, day);
    const r = await api("GET", `/v1/students/${STUDENT_1}/dashboard`, { token: STUDENT_TOKEN });
    expect(r.status).toBe(200);
    const dash = r.json;
    const flat = JSON.stringify(dash);
    expect(flat.includes("overallScore")).toBe(false);
    expect(flat.includes("student_level")).toBe(false);
    const acc = dash.skills.find((s: any) => s.subject === "reading" && s.dimension === "accuracy");
    expect(acc.level).toBe("weak");
    expect(dash.weaknesses.some((w: any) => w.skill === "reading.accuracy")).toBe(true);
    expect(dash.gaps.length).toBeGreaterThanOrEqual(1); // dictation insufficient etc. — first-class
    expect(dash.mastery).toEqual([]); // no mastery rows yet
    const target = dash.recommendations.find((i: any) => i.currentSkill === "reading.accuracy" && i.proposedActivityType === "targeted-practice");
    expect(target).toBeTruthy(); // evidence-derived remediation recommendation
    expect(target.requiresTeacherApproval).toBe(true);
    expect(dash.nextActivity.proposalId).toBe(dash.recommendations[0].proposalId);
    expect(dash.recentActivities.length).toBeGreaterThanOrEqual(1); // the numeracy attempt
    (globalThis as any).__BEFORE_REASONS = dash.recommendations.map((i: any) => i.reason);
    console.log("EVIDENCE E4-3 weak-phase dashboard", JSON.stringify({ skills: dash.skills.length, weaknesses: dash.weaknesses, next: dash.nextActivity.proposedActivityType }));
  });

  it("E4-4 [Mastery Update — REAL writer]: reading attempt → REAL queue + REAL processor → mastery_records row written by the canonical current writer", async () => {
    const start = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: opKey("attr"),
      body: { activityId: "act-e4-reading", exerciseId: EXERCISE_READING, attemptNumber: 51 },
    });
    expect(start.status).toBe(201);
    const attemptId = start.json.attempt.id as string;
    const submit = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: {
        durationMs: 42000,
        time: { activityDurationMs: 42000, responseDurationMs: 9000 },
        engineInput: { passageId: PASSAGE_1, sessionId: SESSION_1, audioKey: `c31/${randomUUID()}.bin`, expectedText: "مرحبا بالعالم" },
      },
    });
    expect(submit.status).toBe(200);
    expect(submit.json.state).toBe("SUBMITTED"); // async path — worker completes it
    const { createWorker, analyzeQueue } = await import("@workspace/queue");
    const { processAnalyzeJob } = await import("../../engines/reading-engine/src/queue/workers/analyze.processor.js");
    const worker = createWorker("analyze", (job: any) => processAnalyzeJob(job), { concurrency: 1, autorun: true });
    const t0 = Date.now();
    let jobs: any[] = [];
    while (Date.now() - t0 < 25000) {
      jobs = await analyzeQueue.getJobs(["active", "waiting", "completed", "failed"]);
      if (jobs.length > 0) {
        const states = await Promise.all(jobs.map((j: any) => j.getState()));
        if (states.every((s: string) => s === "completed" || s === "failed")) break;
      }
      await new Promise((r2) => setTimeout(r2, 300));
    }
    await worker.close();
    const final = await dbmod.getAttempt(TENANT_A, attemptId);
    expect(final.state).toBe("EVIDENCE_RECORDED");
    const mrows = await db.select().from(dbmod.masteryRecordsTable).where(
      (await import("drizzle-orm")).and((await import("drizzle-orm")).eq(dbmod.masteryRecordsTable.tenantId, TENANT_A), (await import("drizzle-orm")).eq(dbmod.masteryRecordsTable.studentId, STUDENT_1)),
    );
    expect(mrows.length).toBe(1); // exactly ONE mastery row by the REAL writer
    expect(mrows[0].level).toBe("PROGRESSING");
    expect(Number(mrows[0].score)).toBe(85);
    console.log("EVIDENCE E4-4 mastery row", JSON.stringify({ level: mrows[0].level, score: mrows[0].score, attempts: mrows[0].attempts }));
  });

  it("E4-5 [Retry → Improvement → Next Recommendation]: remediation evidence → mastery/strength improves → recommendations re-derived (reasons changed) — still NO overall score", async () => {
    // The recommended remediation happened: improved reading accuracy evidence (canonical writer).
    for (const [day, v] of [[8, 0.88], [9, 0.9], [10, 0.93]] as const) await assessmentEvidence(STUDENT_1, TENANT_A, "reading", "accuracy", v, day);
    const r = await api("GET", `/v1/students/${STUDENT_1}/dashboard`, { token: STUDENT_TOKEN });
    expect(r.status).toBe(200);
    const dash = r.json;
    const acc = dash.skills.find((s: any) => s.subject === "reading" && s.dimension === "accuracy");
    expect(acc.level).toBe("strong"); // mastery improved
    expect(acc.trend).toBe("IMPROVING");
    expect(dash.strengths.some((s: any) => s.skill === "reading.accuracy")).toBe(true);
    expect(dash.weaknesses.some((w: any) => w.skill === "reading.accuracy")).toBe(false);
    expect(dash.mastery.length).toBe(1); // reading mastery now visible in the view
    expect(dash.mastery[0].level).toBe("PROGRESSING");
    // Next learning decision re-derived from the NEW evidence (not a static value).
    const afterReasons = dash.recommendations.map((i: any) => i.reason);
    expect(afterReasons).not.toEqual((globalThis as any).__BEFORE_REASONS);
    for (const item of dash.recommendations) expect(item.requiresTeacherApproval).toBe(true);
    const flat = JSON.stringify(dash);
    expect(flat.includes("overallScore")).toBe(false);
    console.log("EVIDENCE E4-5 improved dashboard", JSON.stringify({ acc, next: dash.nextActivity.proposedActivityType, reasons: afterReasons }));
  });

  it("E4-6 [Security bundle]: IDOR 403 · out-of-scope staff 403 · cross-tenant 404 · malformed UUID 400 · unauthenticated 401", async () => {
    const idor = await api("GET", `/v1/students/${STUDENT_1}/dashboard`, { token: STUDENT_B_TOKEN });
    expect(idor.status).toBe(403);
    expect(idor.json.error.code).toBe("STUDENT_DETAIL_ACCESS_DENIED");
    const oos = await api("GET", `/v1/students/${STUDENT_1}/dashboard`, { token: TEACHER_C_TOKEN });
    expect(oos.status).toBe(403);
    const xt = await api("GET", `/v1/students/${STUDENT_1}/dashboard`, { token: TEACHER_B_TOKEN });
    expect(xt.status).toBe(404);
    const bad = await api("GET", "/v1/students/not-a-uuid/dashboard", { token: TEACHER_A_TOKEN });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("INVALID_STUDENT_ID");
    const un = await api("GET", `/v1/students/${STUDENT_1}/dashboard`);
    expect(un.status).toBe(401);
  });

  it("E4-7 [Tenant isolation by values]: tenant-B dashboard carries ONLY tenant-B data (zero A leakage)", async () => {
    const r = await api("GET", `/v1/students/${STUDENT_B1}/dashboard`, { token: STUDENT_B_TOKEN });
    expect(r.status).toBe(200);
    const dash = r.json;
    expect(dash.student.tenantId).toBe(TENANT_B);
    expect(dash.mastery).toEqual([]); // A's reading mastery never leaks
    const flat = JSON.stringify(dash);
    expect(flat.includes("0.45")).toBe(false); // A's weak-phase values
    expect(flat.includes("0.93")).toBe(false); // A's improved values
    for (const item of dash.recommendations) {
      expect(item.requiresTeacherApproval).toBe(true);
      expect(item.evidenceRefs.length).toBe(0); // no evidence at all for B yet — nothing derived from A
    }
  });
});
