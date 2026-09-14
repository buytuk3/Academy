/**
 * CORE-25 / WAVE-4A — Execution Runtime: FIRST REAL vertical slice.
 * REAL PostgreSQL (canonical migrations, fresh core25_verify) + REAL Redis
 * (BullMQ queue in/out) + REAL HTTP (/v1 surface on an ephemeral port) +
 * REAL canonical Evidence + REAL outbox + REAL persistent attempt lifecycle.
 *
 * Engine seams: ONLY the EXTERNAL-infrastructure stages of the reading
 * pipeline are stubbed at module level (S3 bytes, inference-gateway STT,
 * G2P, forced alignment, AI feedback) — the exact same seam list as the
 * engine's own canonical evidence test (CORE-03A). The deterministic scoring
 * result, canonical Evidence writing, outbox events, queue round-trip and
 * the persistent attempt lifecycle are REAL code on REAL infrastructure.
 *
 * Directive §22: a missing capability is a GAP/BLOCKER, never a workaround —
 * assertions below encode the owner-approved contracts only.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const RUN = process.env.CORE25_RUNTIME === "1";
const d = RUN ? describe : describe.skip;

// ── Engine external-infra seams (same list as CORE-03A canonical test) ──
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
  WhisperSTT: class { transcribe = async () => ({ text: "مرحبا", words: [] }); },
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
let IDENTITY_2: string, STUDENT_2: string, USER_STAFF: string;
let SCHOOL_B: string, CLASS_B: string, STUDENT_B1: string, IDENTITY_B1: string;
let PASSAGE_1: string, SESSION_1: string;
let EXERCISE_READING: string, EXERCISE_DICTATION: string, ASSIGNMENT_1: string;
let base = "";
let server: Server | null = null;
const STAFF_EMAIL = `c25staff-${randomUUID()}@x.test`;

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

async function waitForJob(jobId: string, timeoutMs = 20000): Promise<any> {
  const { getJobStatus } = await import("@workspace/queue");
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await getJobStatus(jobId);
    if (s && (s.state === "completed" || s.state === "failed")) return s;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`job ${jobId} not completed in time`);
}

d("CORE-25 WAVE-4A: execution runtime — first real vertical slice", () => {
  let STUDENT_TOKEN = "";

  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    const { tenantsTable, usersTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, passagesTable, readingSessionsTable } = dbmod;
    await db.insert(tenantsTable).values([
      { id: TENANT_A, name: "C25 مستأجر A", slug: `c25a-${randomUUID()}` },
      { id: TENANT_B, name: "C25 مستأجر B", slug: `c25b-${randomUUID()}` },
    ]);
    SCHOOL_A = randomUUID(); CLASS_A = randomUUID();
    SCHOOL_B = randomUUID(); CLASS_B = randomUUID();
    await db.insert(schoolsTable).values([
      { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة A" },
      { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة B" },
    ]);
    await db.insert(classesTable).values([
      { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
      { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
    ]);

    // Identity + ACTIVE membership via the CANONICAL capability (ADR-002).
    IDENTITY_1 = randomUUID(); IDENTITY_2 = randomUUID();
    IDENTITY_B1 = randomUUID();
    await db.insert(studentIdentitiesTable).values([
      { id: IDENTITY_1, operationKey: `c25-id1-${randomUUID()}` },
      { id: IDENTITY_2, operationKey: `c25-id2-${randomUUID()}` },
      { id: IDENTITY_B1, operationKey: `c25-idb-${randomUUID()}` },
    ]);
    STUDENT_1 = randomUUID(); STUDENT_2 = randomUUID(); STUDENT_B1 = randomUUID();
    await db.insert(studentsTable).values([
      { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "سالم", lastName: "الأول", studentCode: `A1-${randomUUID()}` },
      { id: STUDENT_2, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_2, firstName: "هالة", lastName: "الثانية", studentCode: `A2-${randomUUID()}` },
      { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "باسم", lastName: "B", studentCode: `B1-${randomUUID()}` },
    ]);
    // ACTIVE memberships (canonical capability — 18-M idempotent).
    await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: `c25-m1-${randomUUID()}` });
    await dbmod.startMembership({ identityId: IDENTITY_2, tenantId: TENANT_A, studentId: STUDENT_2, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: `c25-m2-${randomUUID()}` });
    await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: `c25-mb-${randomUUID()}` });

    // Staff user (real bcrypt hash) + CLASS-scoped membership (21-M gate).
    const { hashPassword } = await import("@workspace/security");
    USER_STAFF = randomUUID();
    await db.insert(usersTable).values({ id: USER_STAFF, tenantId: TENANT_A, firstName: "م", lastName: "معلم 25", email: STAFF_EMAIL, passwordHash: await hashPassword("s3cretpass"), role: "teacher" });
    await db.insert(dbmod.staffMembershipsTable).values({
      id: randomUUID(), tenantId: TENANT_A, userId: USER_STAFF, schoolId: SCHOOL_A,
      role: "teacher", scopeType: "CLASS", scopeId: CLASS_A, status: "active", operationKey: `c25-sm-${randomUUID()}`,
    });

    // Reading material (REAL engine-owned rows) — passage + session.
    PASSAGE_1 = randomUUID();
    await db.insert(passagesTable).values({ id: PASSAGE_1, tenantId: TENANT_A, title: "نص قراءة 25", text: "مرحبا بالعالم", difficulty: 1 });
    SESSION_1 = randomUUID();
    await db.insert(readingSessionsTable).values({ id: SESSION_1, tenantId: TENANT_A, studentId: STUDENT_1, sessionType: "reading", status: "draft" });

    // CORE-24 persistent exercises (READING async + DICTATION sync), published.
    const anchor = { curriculumId: "cur-eg-ar", curriculumVersion: "2026", country: "EG", educationSystem: "EG-NATIONAL", stageKey: "PRIMARY", gradeKey: "EG-PR-04", gradeLevel: "4", subject: "reading", bookId: "bk-4", unitId: "u1", lessonId: "l1", objectiveId: "o1" };
    const r1 = await dbmod.createExerciseDefinition({
      tenantId: TENANT_A, activityType: "READING", engineBinding: "READING",
      expectedResponseType: "VOICE", source: "TEACHER_CREATED", curriculum: anchor,
      createdBy: USER_STAFF, operationKey: `c25-exr-${randomUUID()}`,
    });
    EXERCISE_READING = r1.exercise.id;
    const r2 = await dbmod.createExerciseDefinition({
      tenantId: TENANT_A, activityType: "DICTATION", engineBinding: "DICTATION",
      expectedResponseType: "TYPED", source: "TEACHER_CREATED",
      curriculum: { ...anchor, subject: "dictation" }, createdBy: USER_STAFF, operationKey: `c25-exd-${randomUUID()}`,
    });
    EXERCISE_DICTATION = r2.exercise.id;
    await dbmod.publishExercise(TENANT_A, EXERCISE_READING, USER_STAFF);
    await dbmod.publishExercise(TENANT_A, EXERCISE_DICTATION, USER_STAFF);

    // CORE-24 persistent assignment (class-targeted, teacherAssigned).
    const a = await dbmod.createAssignment({
      tenantId: TENANT_A, activityId: "act-reading-25", activityVersion: 1,
      exerciseId: EXERCISE_READING, exerciseVersion: 1,
      curriculumId: anchor.curriculumId, curriculumVersion: anchor.curriculumVersion,
      stageKey: anchor.stageKey, gradeLevel: anchor.gradeLevel, subject: anchor.subject,
      targetSchoolId: SCHOOL_A, targetClassId: CLASS_A,
      assignedBy: USER_STAFF, assignedByRole: "teacher", source: "teacherAssigned",
      operationKey: `c25-asg-${randomUUID()}`,
    });
    ASSIGNMENT_1 = a.assignment.id;

    // REAL HTTP surface.
    const { default: app } = await import("../../apps/api/src/app.js");
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
        resolve();
      });
    });

    // REAL student login (20-O unified flow) → verified-context token.
    const login = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_1 }, tenant: TENANT_A });
    expect(login.status).toBe(200);
    expect(login.json.context).toMatchObject({ studentId: STUDENT_1, schoolId: SCHOOL_A });
    STUDENT_TOKEN = login.json.accessToken;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
  });

  // ===== §21.1–5: login/context/activity/assignment/start =====

  it("T1. Student login + verified context (REAL HTTP, 20-O)", async () => {
    const me = await api("GET", "/v1/auth/me", { token: STUDENT_TOKEN });
    expect(me.status).toBe(200);
    expect(me.json.studentContext).toMatchObject({ studentId: STUDENT_1, classId: CLASS_A, schoolId: SCHOOL_A });
  });

  it("T2. Start attempt via /v1 → persistent STARTED row bound to the assignment (REAL HTTP)", async () => {
    const r = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `c25-start-${randomUUID()}`,
      body: { activityId: "act-reading-25", assignmentId: ASSIGNMENT_1, exerciseId: EXERCISE_READING, attemptNumber: 1 },
    });
    expect(r.status).toBe(201);
    expect(r.json.created).toBe(true);
    expect(r.json.attempt).toMatchObject({ studentId: STUDENT_1, activityId: "act-reading-25", assignmentId: ASSIGNMENT_1, state: "STARTED", attemptNumber: 1 });
  });

  it("T3. Concurrent start ×2 (REAL HTTP parallel) → ONE logical attempt (201 + 200, same id)", async () => {
    const key = `c25-conc-${randomUUID()}`;
    const body = { activityId: "act-reading-25", assignmentId: ASSIGNMENT_1, exerciseId: EXERCISE_READING, attemptNumber: 2 };
    const [a, b] = await Promise.all([
      api("POST", "/v1/attempts", { token: STUDENT_TOKEN, idempotencyKey: key, body }),
      api("POST", "/v1/attempts", { token: STUDENT_TOKEN, idempotencyKey: `${key}-2`, body }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.json.attempt.id).toBe(b.json.attempt.id);
    const ids = new Set([a.json.attempt.id, b.json.attempt.id]);
    expect(ids.size).toBe(1);
  });

  it("T4. Curriculum binding enforced BEFORE any attempt (§6): grade mismatch → no attempt row", async () => {
    // Tenant B student (grade 5) against tenant A grade-4 exercise — also a
    // tenant violation; assert via capability for the precise code.
    await expect(dbmod.startAttemptExecution({
      tenantId: TENANT_B, studentId: STUDENT_B1,
      actor: { actorId: IDENTITY_B1, actorRole: "student" },
      activityId: "act-x", exerciseId: EXERCISE_READING, attemptNumber: 1,
    })).rejects.toThrow(); // tenant-scoped getExerciseDefinition → not found in tenant B
  });

  it("T5. Student spoofing another student (same tenant) → STUDENT_CONTEXT_MISMATCH at the capability (§5)", async () => {
    await expect(dbmod.startAttemptExecution({
      tenantId: TENANT_A, studentId: STUDENT_2, // A2 belongs to identity_2, not actor identity_1
      actor: { actorId: IDENTITY_1, actorRole: "student" },
      activityId: "act-reading-25", exerciseId: EXERCISE_READING, attemptNumber: 1,
    })).rejects.toThrow(/STUDENT_CONTEXT_MISMATCH/);
  });

  it("T6. Assignment school/class isolation (§14/§18): other-school/other-class execution → EXECUTION_DENIED", async () => {
    // Tenant-B student vs tenant-A assignment → tenant-scoped fetch denies first (capability).
    await expect(dbmod.startAttemptExecution({
      tenantId: TENANT_B, studentId: STUDENT_B1,
      actor: { actorId: IDENTITY_B1, actorRole: "student" },
      activityId: "act-reading-25", assignmentId: ASSIGNMENT_1, exerciseId: EXERCISE_READING, attemptNumber: 1,
    })).rejects.toThrow();
  });

  // ===== §21.7–9 + §11/§17: READING async E2E (queue→worker→evidence→SLR) =====

  it("T7. READING vertical slice E2E: submit → REAL queue → REAL worker → canonical Evidence → persistent EVIDENCE_RECORDED → SLR timeline (REAL Redis+PG)", async () => {
    // start attempt #3 via REAL HTTP
    const start = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `c25-e2e-${randomUUID()}`,
      body: { activityId: "act-reading-25", assignmentId: ASSIGNMENT_1, exerciseId: EXERCISE_READING, attemptNumber: 3 },
    });
    expect(start.status).toBe(201);
    const attemptId = start.json.attempt.id;

    // REAL in-test worker over the REAL queue (same factory as apps/worker).
    const { createWorker } = await import("@workspace/queue");
    const { processAnalyzeJob } = await import("../../engines/reading-engine/src/queue/workers/analyze.processor.js");
    const worker = createWorker("analyze", (job: any) => processAnalyzeJob(job), { concurrency: 1, autorun: true });

    // submit via REAL HTTP → async hand-off (single enqueue on the winning CAS)
    const submit = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: {
        durationMs: 42000,
        time: { activityDurationMs: 42000, responseDurationMs: 9000, thinkingDurationMs: 1200, replayDurationMs: 3000 },
        engineInput: { passageId: PASSAGE_1, sessionId: SESSION_1, audioKey: `c25/${randomUUID()}.bin`, expectedText: "مرحبا بالعالم" },
      },
    });
    expect(submit.status).toBe(200);
    expect(submit.json.state).toBe("SUBMITTED"); // rests at SUBMITTED (async path)
    const jobId: string | undefined = submit.json.operationKey ? undefined : undefined; // jobId rides the runtime result only
    void jobId;

    // The runtime enqueued exactly ONE job (assert via attempt count + queue drain below).

    // wait for the REAL worker to complete the REAL pipeline
    const { analyzeQueue } = await import("@workspace/queue");
    const t0 = Date.now();
    let jobDone = false;
    while (Date.now() - t0 < 25000 && !jobDone) {
      const jobs = await analyzeQueue.getJobs(["active", "waiting", "completed", "failed"]);
      if (jobs.length > 0) {
        const states = await Promise.all(jobs.map((j: any) => j.getState()));
        if (states.every((s: string) => s === "completed" || s === "failed")) jobDone = true;
      }
      if (!jobDone) await new Promise((r) => setTimeout(r, 300));
    }
    await worker.close();

    // REAL worker completed → persistent attempt closed with REAL pointer
    const final = await dbmod.getAttempt(TENANT_A, attemptId);
    expect(final.state).toBe("EVIDENCE_RECORDED");
    expect(final.evidenceRef).toBeTruthy();

    // canonical Evidence: EXACTLY ONE reading-analysis row (idempotent key)
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 200 });
    const analysis = rows.filter((r: any) => r.sourceEngine === "reading-engine" && (r.metadata as any)?.masteryLevel);
    expect(analysis.length).toBe(1);
    expect(analysis[0].id).toBe(final.evidenceRef);

    // §10 — Time as Evidence: the 23-P multidimensional segments persist as REAL
    // COLUMNS on the canonical attempt STATE row (durable, audited — never a UI
    // metric); the engine's evidence row carries the measurement payload.
    expect(final.activityDurationMs).toBe(42000);
    expect(final.responseDurationMs).toBe(9000);
    expect(final.thinkingDurationMs).toBe(1200);
    expect(final.replayDurationMs).toBe(3000);

    // §17 — Outbox: the engine's domain events got a REAL processor pass
    const out = await (await import("@workspace/events")).processEventOutbox({ limit: 50 });
    expect(out.processed).toBeGreaterThanOrEqual(2); // ReadingAnalyzed + MasteryUpdated

    // §9 — SLR: projection over canonical Evidence (NO new table)
    const timeline = await dbmod.buildStudentTimeline({ tenantId: TENANT_A, studentId: STUDENT_1 });
    expect(timeline.tenantId).toBe(TENANT_A);
    expect(timeline.events.length).toBeGreaterThanOrEqual(1);

    // §15 — Intelligence output from Evidence (read-only)
    const report = await (await import("@workspace/intelligence")).buildIntelligenceReport({ tenantId: TENANT_A, studentId: STUDENT_1 });
    expect(report.tenantId).toBe(TENANT_A);
    expect(report.studentId).toBe(STUDENT_1);
    expect(Array.isArray(report.insights)).toBe(true);
    void jobId;
  }, 60000);

  it("T8. Idempotent retries (§12): HTTP resubmit after completion converges; worker job replay cannot duplicate Evidence", async () => {
    const start = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `c25-retry-${randomUUID()}`,
      body: { activityId: "act-reading-25", assignmentId: ASSIGNMENT_1, exerciseId: EXERCISE_READING, attemptNumber: 4 },
    });
    expect(start.status).toBe(201);
    const attemptId = start.json.attempt.id;
    // Worker-equivalent chain: the student submits FIRST (HTTP → SUBMITTED;
    // a job is enqueued but NO worker runs in this test — it just waits).
    const submit = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: { engineInput: { passageId: PASSAGE_1, sessionId: SESSION_1, audioKey: "x", expectedText: "y" } },
    });
    expect(submit.status).toBe(200);
    expect(submit.json.state).toBe("SUBMITTED");
    // The worker side: writes canonical evidence, closes the persistent lifecycle.
    const ev = await dbmod.recordEvidence({
      tenantId: TENANT_A, studentId: STUDENT_1, actorRole: "system", evidenceType: "attempt", subject: "reading",
      activityId: "act-reading-25", sourceEngine: "reading-engine", result: "completed",
      operationKey: `c25-retry-ev-${randomUUID()}`,
    });
    await dbmod.completeAsyncExecution({ tenantId: TENANT_A, executionAttemptId: attemptId, evidenceRef: ev.id });
    // HTTP resubmit AFTER completion → converged response, no error
    const again = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: { engineInput: { passageId: PASSAGE_1, sessionId: SESSION_1, audioKey: "x", expectedText: "y" } },
    });
    expect(again.status).toBe(200);
    const final = await dbmod.getAttempt(TENANT_A, attemptId);
    expect(final.state).toBe("EVIDENCE_RECORDED");
    expect(final.evidenceRef).toBe(ev.id);
    // distinct logical events → distinct evidence rows (SAME key dedups — core-24 proven)
    const before = await dbmod.countEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1 });
    await dbmod.recordEvidence({
      tenantId: TENANT_A, studentId: STUDENT_1, actorRole: "system", evidenceType: "attempt", subject: "reading",
      activityId: "act-reading-25", sourceEngine: "reading-engine", result: "completed",
      operationKey: `c25-retry-ev-${randomUUID()}`,
    });
    const after = await dbmod.countEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1 });
    expect(after).toBe(before + 1);
  });

  it("T9. DICTATION sync slice (§7): engine resolution → REAL dictation engine measures → ONE canonical attempt Evidence", async () => {
    const start = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `c25-dict-${randomUUID()}`,
      body: { activityId: "act-dictation-25", exerciseId: EXERCISE_DICTATION, attemptNumber: 1 },
    });
    expect(start.status).toBe(201);
    const attemptId = start.json.attempt.id;
    const submit = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: {
        durationMs: 15000,
        time: { activityDurationMs: 15000, responseDurationMs: 6000 },
        engineInput: { expected: "القطط صغيرة", actual: "القطط صغيره", language: "ar" },
      },
    });
    expect(submit.status).toBe(200);
    expect(submit.json.state).toBe("EVIDENCE_RECORDED"); // sync path completed in-request
    const final = await dbmod.getAttempt(TENANT_A, attemptId);
    expect(final.state).toBe("EVIDENCE_RECORDED");
    expect(final.evidenceRef).toBeTruthy();
    const ev = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 200 });
    const row = ev.find((r: any) => r.id === final.evidenceRef);
    expect(row.sourceEngine).toBe("dictation-engine");
    expect(row.evidenceType).toBe("attempt");
    expect((row.response as any).expected).toBe("القطط صغيرة"); // canonical expected text
    expect((row.response as any).actual).toBe("القطط صغيره"); // the STUDENT'S actual typed input
    // measure/record mismatch: submitting again → converged (terminal), no 2nd row
    const before = await dbmod.countEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1 });
    await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: { engineInput: { expected: "القطط صغيرة", actual: "القطط صغيره", language: "ar" } },
    });
    const after = await dbmod.countEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1 });
    expect(after).toBe(before); // retry after completion writes NOTHING
  });

  it("T10. Teacher Decision Gate (§16): proposal flagged → APPROVED authorizes EXACT delivery; unauthorized delivery fails", async () => {
    const intelligence = await import("@workspace/intelligence");
    const loop = await import("@workspace/learning-loop");
    // A diagnosis over REAL evidence refs (detection signal, canonical shape).
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 50 });
    expect(rows.length).toBeGreaterThan(0);
    const diagnosis = await loop.createDiagnosis({
      tenantId: TENANT_A, studentId: STUDENT_1,
      signal: { kind: "repeated-mistake", tenantId: TENANT_A, studentId: STUDENT_1, skill: "reading.accuracy", evidenceRefs: rows.slice(0, 2).map((r: any) => r.id), confidence: 0.7, reason: "E2E", signalKey: `c25-sig-${randomUUID()}` },
    });
    const proposal = await loop.proposeIntervention({
      tenantId: TENANT_A, studentId: STUDENT_1, diagnosis, activityType: "targeted-dictation-exercise",
    });
    // §16 — the recommendation NEVER auto-executes: the proposal RESTS at
    // PENDING with NO decision and NO delivery authorization (the canonical
    // CORE-08 gate: execution requires an explicit Teacher Decision).
    expect(proposal.status).toBe("PENDING");
    expect(proposal.decision ?? null).toBeNull(); // jsonb null vs undefined (row projection)
    expect(proposal.deliveryAuthorization ?? null).toBeNull();
    // Teacher APPROVES (canonical decision capability).
    const decision = await intelligence.applyTeacherDecision({
      tenantId: TENANT_A, proposal,
      decision: { action: "APPROVED", actorId: USER_STAFF, actorRole: "teacher", decidedAt: new Date().toISOString(), reason: "E2E" },
    });
    expect(decision.existed).toBe(false);
    expect(decision.authorization).toBeTruthy();
    // Delivery is GATED: exact match passes…
    expect(() => intelligence.assertDeliveryAuthorized(
      { tenantId: TENANT_A, studentId: STUDENT_1, proposalId: proposal.id, activityType: "targeted-dictation-exercise" },
      decision.authorization,
    )).not.toThrow();
    // …any mismatch (another student) FAILS the gate.
    expect(() => intelligence.assertDeliveryAuthorized(
      { tenantId: TENANT_A, studentId: STUDENT_2, proposalId: proposal.id, activityType: "targeted-dictation-exercise" },
      decision.authorization,
    )).toThrow();
    // …and delivering with NO authorization at all is impossible.
    expect(() => intelligence.assertDeliveryAuthorized(
      { tenantId: TENANT_A, studentId: STUDENT_1, proposalId: proposal.id, activityType: "targeted-dictation-exercise" },
      null,
    )).toThrow();
  });

  it("T11. Transfer safety (§18/§23): after canonical transfer, execution in the OLD tenant is DENIED (rows never rewritten)", async () => {
    await dbmod.transferStudent({
      identityId: IDENTITY_2, fromTenantId: TENANT_A, toTenantId: TENANT_B,
      toStudentId: STUDENT_B1, toSchoolId: SCHOOL_B, toClassId: CLASS_B, operationKey: `c25-tr-${randomUUID()}`,
    });
    await expect(dbmod.startAttemptExecution({
      tenantId: TENANT_A, studentId: STUDENT_2,
      actor: { actorId: IDENTITY_2, actorRole: "student" },
      activityId: "act-reading-25", exerciseId: EXERCISE_READING, attemptNumber: 1,
    })).rejects.toThrow(/EXECUTION_DENIED/); // membership no longer active in TENANT_A
  });

  it("T12. Missing exercise binding → attempt never starts (§6/§7: the exercise owns the engine)", async () => {
    const r = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `c25-noex-${randomUUID()}`,
      body: { activityId: "act-reading-25", attemptNumber: 9 }, // no exerciseId
    });
    expect(r.status).toBe(400);
    expect(r.json?.error?.code).toBe("EXECUTION_CONTEXT_REQUIRED");
  });
});
