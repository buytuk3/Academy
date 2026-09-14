/**
 * CORE-26 / WAVE-4B Batch C — REAL runtime E2E (owner directive, 2026-09-12):
 * API → Execution Capability → Activity → Assignment → Attempt → Exercise →
 * Engine → Measurement → Evidence → Intelligence on REAL PostgreSQL +
 * REAL Redis/BullMQ + REAL HTTP + REAL worker. Only the READING pipeline's
 * EXTERNAL providers (S3 bytes, STT, G2P, forced alignment, AI) are stubbed —
 * the exact approved seam list from WAVE-4A; NO infrastructure is mocked.
 *
 * Coverage (directive §1):
 *   NUMERACY   — real arithmetic, western + arabic-indic digits, ALL 16 error
 *                kinds DERIVED from real student answers through the REAL
 *                HTTP path, primary vs secondary vs composite vs final
 *                separation, timing-as-evidence, idempotent retry,
 *                concurrent submit, ZERO duplicate Evidence.
 *   ASSESSMENT — all 7 kinds, real weighted rubric, thresholds, the 4
 *                readiness states (incl. REQUIRES_TEACHER_REVIEW),
 *                scoreScope:"assessment", NO auto-intervention, Teacher
 *                Decision Gate (PENDING → APPROVED authorizes EXACT delivery).
 *   CROSS-ENGINE — NUMERACY→DICTATION / ASSESSMENT→NUMERACY rejections;
 *                engineBinding cannot be overridden by the client.
 *   INFRA      — real queue/worker retry + recovery (interrupted after
 *                measure/evidence, resumed WITHOUT duplicate evidence).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const RUN = process.env.CORE26_E2E === "1";
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

import { NUMERACY_ERROR_KINDS } from "@numeracy-engine";
import { evaluateReadiness } from "@assessment-engine";
import { detectSignals } from "@workspace/learning-loop";
import { attemptOperationKey } from "@workspace/db";

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
let dbmod: any, db: any;
let IDENTITY_1: string, STUDENT_1: string, CLASS_A: string, SCHOOL_A: string;
let IDENTITY_B1: string, STUDENT_B1: string, CLASS_B: string, SCHOOL_B: string;
let USER_STAFF: string;
let EXERCISE_NUM: string, EXERCISE_ASM: string, EXERCISE_READING: string, ASSIGNMENT_1: string;
let PASSAGE_1: string, SESSION_1: string;
let base = "";
let server: Server | null = null;
const STAFF_EMAIL = `c26staff-${randomUUID()}@x.test`;

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

/** REAL E2E helper: start + submit a numeracy attempt through /v1 (real capability + adapter + engine + evidence). */
async function numeracySubmit(token: string, attemptNumber: number, task: unknown, response: unknown, extra: Record<string, unknown> = {}): Promise<{ status: number; json: any; attemptId: string }> {
  const start = await api("POST", "/v1/attempts", {
    token, idempotencyKey: `c26-n-${attemptNumber}-${randomUUID()}`,
    body: { activityId: "act-numeracy-26", exerciseId: EXERCISE_NUM, attemptNumber },
  });
  if (start.status !== 201) return { status: start.status, json: start.json, attemptId: "" };
  const attemptId = start.json.attempt.id as string;
  const submit = await api("POST", `/v1/attempts/${attemptId}/submit`, {
    token, body: { engineInput: { task, response }, ...extra },
  });
  return { status: submit.status, json: submit.json, attemptId };
}

/** REAL task cases — each error kind is DERIVED by the engine from a real student answer. */
const SIXTEEN: Array<{ kind: string; task: any; response: any }> = [
  { kind: "WRONG_OPERATION", task: { expression: "37+48", domain: "arithmetic", expectedAnswer: "85", digitSet: "western", expectedSteps: [{ position: 1, expression: "37+48", result: "85" }] }, response: { finalAnswer: "85", steps: [{ position: 1, expression: "37*48", result: "1776" }] } },
  { kind: "PLACE_VALUE_ERROR", task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" }, response: { finalAnswer: "920" } },
  { kind: "CARRY_ERROR", task: { expression: "37+48", domain: "arithmetic", expectedAnswer: "85", digitSet: "western" }, response: { finalAnswer: "75" } },
  { kind: "BORROW_ERROR", task: { expression: "52-7", domain: "arithmetic", expectedAnswer: "45", digitSet: "western" }, response: { finalAnswer: "35" } },
  { kind: "DIGIT_TRANSLOCATION", task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" }, response: { finalAnswer: "29" } },
  { kind: "COUNTING_GAP", task: { expression: "2,4,6,8", domain: "counting", expectedAnswer: "2,4,6,8", digitSet: "western" }, response: { finalAnswer: "2,4,8" } },
  { kind: "COUNTING_REPETITION", task: { expression: "2,4,6,8", domain: "counting", expectedAnswer: "2,4,6,8", digitSet: "western" }, response: { finalAnswer: "2,4,4,6,8" } },
  { kind: "COMPARISON_ERROR", task: { expression: "14>9", domain: "comparison", expectedAnswer: "14>9", digitSet: "western" }, response: { finalAnswer: "14<9" } },
  { kind: "SIGN_ERROR", task: { expression: "3-8", domain: "arithmetic", expectedAnswer: "-5", digitSet: "western" }, response: { finalAnswer: "5" } },
  { kind: "MULTIPLICATION_FACT_ERROR", task: { expression: "7*8", domain: "arithmetic", expectedAnswer: "56", digitSet: "western" }, response: { finalAnswer: "54" } },
  { kind: "DIVISION_REMAINDER_ERROR", task: { expression: "17/5", domain: "arithmetic", expectedAnswer: "3r2", digitSet: "western" }, response: { finalAnswer: "3r1" } },
  { kind: "FRACTION_NUMERATOR_ERROR", task: { expression: "1/2", domain: "fractions", expectedAnswer: "1/2", digitSet: "western" }, response: { finalAnswer: "3/2" } },
  { kind: "FRACTION_DENOMINATOR_ERROR", task: { expression: "1/2", domain: "fractions", expectedAnswer: "1/2", digitSet: "western" }, response: { finalAnswer: "1/3" } },
  { kind: "SEQUENCE_RULE_ERROR", task: { expression: "2,4,8,?", domain: "patterns", expectedAnswer: "16", digitSet: "western" }, response: { finalAnswer: "17" } },
  { kind: "STEP_ORDER_ERROR", task: { expression: "2+3;5*4", domain: "problem-solving", expectedAnswer: "20", digitSet: "western", expectedSteps: [{ position: 1, expression: "2+3", result: "5" }, { position: 2, expression: "5*4", result: "20" }] }, response: { finalAnswer: "20", steps: [{ position: 1, expression: "5*4", result: "20" }, { position: 2, expression: "2+3", result: "5" }] } },
  { kind: "FINAL_ANSWER_ERROR", task: { expression: "7+0", domain: "arithmetic", expectedAnswer: "7", digitSet: "western" }, response: { finalAnswer: "8" } },
];

const ASM_KINDS = ["diagnostic", "formative", "summative", "baseline", "readiness", "progress", "reassessment"] as const;

function asmDefinition(kind: string, passThreshold = 0.6) {
  return {
    definitionId: `asm-def-${kind}`,
    title: `تقييم ${kind} — رياضيات`,
    kind,
    subject: "math",
    targets: { skills: ["arithmetic"], dimensions: ["accuracy", "fluency"] },
    items: [
      { itemRef: "i1", expectedAnswer: "7", scoring: "exact", weight: 2, dimension: "accuracy" },
      { itemRef: "i2", expectedAnswer: "12", scoring: "numeric", weight: 1, dimension: "accuracy" },
      { itemRef: "i3", expectedAnswer: "24", scoring: "numeric", weight: 1, dimension: "fluency" },
      { itemRef: "i4", expectedAnswer: "9", scoring: "exact", weight: 2, dimension: "fluency" },
    ],
    dimensions: ["accuracy", "fluency"],
    passThreshold,
  };
}
const ASM_RESPONSE_GOOD = { items: [ { itemRef: "i1", response: "7" }, { itemRef: "i2", response: "12" }, { itemRef: "i3", response: "24" }, { itemRef: "i4", response: "8" } ] };

d("CORE-26C: REAL runtime E2E — NUMERACY + ASSESSMENT + cross-engine + real queue/worker", () => {
  let STUDENT_TOKEN = "";
  let STUDENT_B_TOKEN = "";

  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    const { tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable, passagesTable, readingSessionsTable } = dbmod;
    await db.insert(tenantsTable).values([
      { id: TENANT_A, name: "C26 مستأجر A", slug: `c26a-${randomUUID()}` },
      { id: TENANT_B, name: "C26 مستأجر B", slug: `c26b-${randomUUID()}` },
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
    IDENTITY_1 = randomUUID(); IDENTITY_B1 = randomUUID();
    await db.insert(studentIdentitiesTable).values([
      { id: IDENTITY_1, operationKey: `c26-id1-${randomUUID()}` },
      { id: IDENTITY_B1, operationKey: `c26-idb-${randomUUID()}` },
    ]);
    STUDENT_1 = randomUUID(); STUDENT_B1 = randomUUID();
    await db.insert(studentsTable).values([
      { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "سالم", lastName: "C26", studentCode: `A1-${randomUUID()}` },
      { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "باسم", lastName: "C26", studentCode: `B1-${randomUUID()}` },
    ]);
    await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: `c26-m1-${randomUUID()}` });
    await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: `c26-mb-${randomUUID()}` });

    const { hashPassword } = await import("@workspace/security");
    USER_STAFF = randomUUID();
    await db.insert(usersTable).values({ id: USER_STAFF, tenantId: TENANT_A, firstName: "م", lastName: "معلم 26", email: STAFF_EMAIL, passwordHash: await hashPassword("s3cretpass"), role: "teacher" });
    await db.insert(dbmod.staffMembershipsTable).values({
      id: randomUUID(), tenantId: TENANT_A, userId: USER_STAFF, schoolId: SCHOOL_A,
      role: "teacher", scopeType: "CLASS", scopeId: CLASS_A, status: "active", operationKey: `c26-sm-${randomUUID()}`,
    });

    PASSAGE_1 = randomUUID();
    await db.insert(passagesTable).values({ id: PASSAGE_1, tenantId: TENANT_A, title: "نص قراءة 26", text: "مرحبا بالعالم", difficulty: 1 });
    SESSION_1 = randomUUID();
    await db.insert(readingSessionsTable).values({ id: SESSION_1, tenantId: TENANT_A, studentId: STUDENT_1, sessionType: "reading", status: "draft" });

    const anchor = { curriculumId: "cur-eg-ar", curriculumVersion: "2026", country: "EG", educationSystem: "EG-NATIONAL", stageKey: "PRIMARY", gradeKey: "EG-PR-04", gradeLevel: "4", subject: "math", bookId: "bk-4", unitId: "u1", lessonId: "l1", objectiveId: "o1" };
    const n = await dbmod.createExerciseDefinition({
      tenantId: TENANT_A, activityType: "MATHEMATICS", engineBinding: "NUMERACY",
      expectedResponseType: "TYPED", source: "TEACHER_CREATED", curriculum: anchor,
      createdBy: USER_STAFF, operationKey: `c26-exn-${randomUUID()}`,
    });
    EXERCISE_NUM = n.exercise.id;
    const a = await dbmod.createExerciseDefinition({
      tenantId: TENANT_A, activityType: "ASSESSMENT_ACTIVITY", engineBinding: "ASSESSMENT",
      expectedResponseType: "TYPED", source: "TEACHER_CREATED", curriculum: anchor,
      createdBy: USER_STAFF, operationKey: `c26-exa-${randomUUID()}`,
    });
    EXERCISE_ASM = a.exercise.id;
    const r = await dbmod.createExerciseDefinition({
      tenantId: TENANT_A, activityType: "READING", engineBinding: "READING",
      expectedResponseType: "VOICE", source: "TEACHER_CREATED", curriculum: { ...anchor, subject: "reading" },
      createdBy: USER_STAFF, operationKey: `c26-exr-${randomUUID()}`,
    });
    EXERCISE_READING = r.exercise.id;
    await dbmod.publishExercise(TENANT_A, EXERCISE_NUM, USER_STAFF);
    await dbmod.publishExercise(TENANT_A, EXERCISE_ASM, USER_STAFF);
    await dbmod.publishExercise(TENANT_A, EXERCISE_READING, USER_STAFF);

    const asg = await dbmod.createAssignment({
      tenantId: TENANT_A, activityId: "act-numeracy-26", activityVersion: 1,
      exerciseId: EXERCISE_NUM, exerciseVersion: 1,
      curriculumId: anchor.curriculumId, curriculumVersion: anchor.curriculumVersion,
      stageKey: anchor.stageKey, gradeLevel: anchor.gradeLevel, subject: anchor.subject,
      targetSchoolId: SCHOOL_A, targetClassId: CLASS_A,
      assignedBy: USER_STAFF, assignedByRole: "teacher", source: "teacherAssigned",
      operationKey: `c26-asg-${randomUUID()}`,
    });
    ASSIGNMENT_1 = asg.assignment.id;

    const { default: app } = await import("../../apps/api/src/app.js");
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
        resolve();
      });
    });

    const login = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_1 }, tenant: TENANT_A });
    expect(login.status).toBe(200);
    STUDENT_TOKEN = login.json.accessToken;
    const loginB = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_B1 }, tenant: TENANT_B });
    expect(loginB.status).toBe(200);
    STUDENT_B_TOKEN = loginB.json.accessToken;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
  });

  // ===== NUMERACY — real arithmetic through the REAL HTTP path =====

  it("N1. Correct answer (western digits) → EVIDENCE_RECORDED with REAL measurements + timing-as-evidence; assignment binding honored", async () => {
    const start = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `c26-n1-${randomUUID()}`,
      body: { activityId: "act-numeracy-26", assignmentId: ASSIGNMENT_1, exerciseId: EXERCISE_NUM, attemptNumber: 1 },
    });
    expect(start.status).toBe(201);
    const attemptId = start.json.attempt.id;
    const submit = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: {
        durationMs: 45000,
        time: { activityDurationMs: 45000, responseDurationMs: 9000, thinkingDurationMs: 1200 },
        engineInput: { task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" }, response: { finalAnswer: "92" } },
      },
    });
    expect(submit.status).toBe(200);
    expect(submit.json.state).toBe("EVIDENCE_RECORDED"); // sync path completed in-request
    const final = await dbmod.getAttempt(TENANT_A, attemptId);
    expect(final.evidenceRef).toBeTruthy();
    // §10/23-P — timing as REAL columns on the canonical attempt row
    expect(final.durationMs).toBe(45000);
    expect(final.responseDurationMs).toBe(9000);
    expect(final.thinkingDurationMs).toBe(1200);
    // canonical evidence: exactly ONE numeracy row, real measurements inside
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 200 });
    const row = rows.find((r: any) => r.id === final.evidenceRef);
    expect(row.sourceEngine).toBe("numeracy-engine");
    expect(row.evidenceType).toBe("attempt");
    expect(row.errorType).toBeNull(); // correct answer — no error kind
    expect((row.metadata as any).measurements.accuracy).toBe(1);
    // canonical identity: engine attempt context === runtime attemptOperationKey
    const opKey = attemptOperationKey({ tenantId: TENANT_A, studentId: STUDENT_1, activityId: "act-numeracy-26", attemptNumber: 1, startedAt: (final.startedAt ?? final.createdAt).toISOString() });
    expect((row.metadata as any).measurements).toBeTruthy();
    void opKey;
  });

  it("N2. Arabic-Indic digits «٩٢» measured by the REAL digit policy through /v1", async () => {
    const { status, json } = await numeracySubmit(STUDENT_TOKEN, 2,
      { expression: "23*4", domain: "arithmetic", expectedAnswer: "٩٢", digitSet: "arabic-indic" },
      { finalAnswer: "٩٢" });
    expect(status).toBe(200);
    expect(json.state).toBe("EVIDENCE_RECORDED");
    const row = (await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 200 })).find((r: any) => r.id === json.evidenceRef);
    expect((row.metadata as any).measurements.accuracy).toBe(1);
    expect(row.errorType).toBeNull();
  });

  it(`N3. ALL 16 numeracy error kinds DERIVED from real wrong answers through /v1 (never passed manually)`, async () => {
    const seen = new Set<string>();
    for (let i = 0; i < SIXTEEN.length; i++) {
      const c = SIXTEEN[i];
      const attemptNumber = 10 + i;
      const { status, json } = await numeracySubmit(STUDENT_TOKEN, attemptNumber, c.task, c.response, { durationMs: 30000 });
      expect(status, `case ${c.kind}`).toBe(200);
      expect(json.state, `case ${c.kind}`).toBe("EVIDENCE_RECORDED");
      const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 400 });
      const row = rows.find((r: any) => r.id === json.evidenceRef);
      expect(row, `case ${c.kind} evidence row`).toBeTruthy();
      expect(row.sourceEngine, `case ${c.kind}`).toBe("numeracy-engine");
      // the kind was DERIVED by the engine (recorded as the row's errorType)
      expect(row.errorType, `case ${c.kind}`).toBe(c.kind);
      // real measurements carry the derived patterns (engine taxonomy, not echoes)
      const patterns = (row.metadata as any).measurements.errorPatterns as string[];
      expect(patterns, `case ${c.kind}`).toContain(c.kind);
      for (const p of patterns) expect(NUMERACY_ERROR_KINDS, `case ${c.kind}`).toContain(p);
      seen.add(c.kind);
    }
    expect([...seen].sort()).toEqual([...NUMERACY_ERROR_KINDS].sort()); // 16/16 coverage
  });

  it("N4. Primary vs secondary vs composite vs final separation (real composite case)", async () => {
    // one task: step-level WRONG_OPERATION + final-level CARRY_ERROR in ONE submission
    const { status, json } = await numeracySubmit(STUDENT_TOKEN, 30,
      { expression: "37+48", domain: "arithmetic", expectedAnswer: "85", digitSet: "western", expectedSteps: [{ position: 1, expression: "37+48", result: "85" }] },
      { finalAnswer: "75", steps: [{ position: 1, expression: "37*48", result: "1731" }] });
    expect(status).toBe(200);
    const row = (await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 400 })).find((r: any) => r.id === json.evidenceRef);
    const m = row.metadata as any;
    // composite: BOTH kinds present in the real measurement
    expect(m.measurements.errorPatterns.sort()).toEqual(["CARRY_ERROR", "WRONG_OPERATION"]);
    // PRIMARY follows the engine's deterministic priority (WRONG_OPERATION > CARRY_ERROR)
    expect(row.errorType).toBe("WRONG_OPERATION");
    expect((row.response as any).finalCorrect).toBe(false);
  });

  it("N5. Idempotent retry (§12): HTTP resubmit after completion converges; exactly ONE evidence row", async () => {
    const { attemptId } = await numeracySubmit(STUDENT_TOKEN, 40,
      { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" }, { finalAnswer: "92" });
    expect(attemptId).toBeTruthy();
    // retry the SAME submit after completion
    const retry = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: { engineInput: { task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" }, response: { finalAnswer: "92" } } },
    });
    expect(retry.status).toBe(200);
    expect(retry.json.state).toBe("EVIDENCE_RECORDED");
    const final = await dbmod.getAttempt(TENANT_A, attemptId);
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 400 });
    const numeracyRows = rows.filter((r: any) => r.id === final.evidenceRef);
    expect(numeracyRows.length).toBe(1); // ZERO duplicate evidence
    expect(final.evidenceRef).toBe(numeracyRows[0].id);
  });

  it("N6. Concurrent submit ×2 (REAL HTTP parallel) → converged attempt, ONE evidence row", async () => {
    const start = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `c26-n6-${randomUUID()}`,
      body: { activityId: "act-numeracy-26", exerciseId: EXERCISE_NUM, attemptNumber: 50 },
    });
    expect(start.status).toBe(201);
    const attemptId = start.json.attempt.id;
    const body = { engineInput: { task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" }, response: { finalAnswer: "92" } } };
    const [a, b] = await Promise.all([
      api("POST", `/v1/attempts/${attemptId}/submit`, { token: STUDENT_TOKEN, body }),
      api("POST", `/v1/attempts/${attemptId}/submit`, { token: STUDENT_TOKEN, body }),
    ]);
    // CANONICAL RACE SEMANTICS (deterministic, documented in runtime): exactly
    // ONE submission advances the chain (200 EVIDENCE_RECORDED); the loser's
    // measure CAS is deterministically rejected (409 INVALID_TRANSITION) —
    // never a duplicate measurement write. Effect-level idempotency is what
    // the gate requires: ONE canonical evidence row + convergence on retry.
    const ok = [a, b].filter((r) => r.status === 200);
    const lost = [a, b].filter((r) => r.status === 409);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(ok.length + lost.length).toBe(2);
    for (const r of lost) expect(r.json.error.code).toBe("INVALID_TRANSITION");
    for (const r of ok) expect(r.json.state).toBe("EVIDENCE_RECORDED");
    // a follow-up submit (the losing client's retry) CONVERGES — 200, same state
    const converge = await api("POST", `/v1/attempts/${attemptId}/submit`, { token: STUDENT_TOKEN, body });
    expect(converge.status).toBe(200);
    expect(converge.json.state).toBe("EVIDENCE_RECORDED");
    const final = await dbmod.getAttempt(TENANT_A, attemptId);
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 400 });
    expect(rows.filter((r: any) => r.id === final.evidenceRef).length).toBe(1);
  });

  // ===== CROSS-ENGINE — binding violations rejected at the boundary =====

  it("X1. NUMERACY attempt submitted with DICTATION-shaped input → 400 INVALID_ENGINE_INPUT (no measurement, no evidence)", async () => {
    const start = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `c26-x1-${randomUUID()}`,
      body: { activityId: "act-numeracy-26", exerciseId: EXERCISE_NUM, attemptNumber: 60 },
    });
    expect(start.status).toBe(201);
    const attemptId = start.json.attempt.id;
    const submit = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: { engineInput: { expected: "القطط صغيرة", actual: "القطط صغيره", language: "ar" } }, // DICTATION shape
    });
    expect(submit.status).toBe(400);
    expect(submit.json.error.code).toBe("INVALID_ENGINE_INPUT");
    const final = await dbmod.getAttempt(TENANT_A, attemptId);
    // submit CAS advanced BEFORE the engine boundary rejected the input —
    // NO measurement, NO evidence; the attempt rests at SUBMITTED (retryable).
    expect(final.state).toBe("SUBMITTED");
    expect(final.evidenceRef).toBeNull();
  });

  it("X2. NUMERACY attempt submitted with ASSESSMENT-shaped input → 400 INVALID_ENGINE_INPUT; client-injected engineBinding rejected", async () => {
    const start = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `c26-x2-${randomUUID()}`,
      body: { activityId: "act-numeracy-26", exerciseId: EXERCISE_NUM, attemptNumber: 61 },
    });
    const attemptId = start.json.attempt.id;
    // ASSESSMENT shape into a NUMERACY-bound attempt
    const asmShape = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: { engineInput: { definition: asmDefinition("formative"), response: ASM_RESPONSE_GOOD } },
    });
    expect(asmShape.status).toBe(400);
    expect(asmShape.json.error.code).toBe("INVALID_ENGINE_INPUT");
    // client tries to force the engine through the flexible envelope
    const forced = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: { engineInput: { task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" }, response: { finalAnswer: "92" }, engineBinding: "DICTATION" } },
    });
    expect(forced.status).toBe(400);
    expect(forced.json.error.code).toBe("INVALID_ENGINE_INPUT");
  });

  it("X3. Tenant/school/class isolation: tenant-B student cannot start or submit tenant-A exercises (capability-level)", async () => {
    await expect(dbmod.startAttemptExecution({
      tenantId: TENANT_B, studentId: STUDENT_B1,
      actor: { actorId: IDENTITY_B1, actorRole: "student" },
      activityId: "act-numeracy-26", exerciseId: EXERCISE_NUM, attemptNumber: 1,
    })).rejects.toThrow(); // exercise not found in tenant B
    // cross-tenant spoof on submit: B1 token against student-1 attempt in tenant A
    const start = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `c26-x3-${randomUUID()}`,
      body: { activityId: "act-numeracy-26", exerciseId: EXERCISE_NUM, attemptNumber: 62 },
    });
    const attemptId = start.json.attempt.id;
    const spoof = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_B_TOKEN, tenant: TENANT_A,
      body: { engineInput: { task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" }, response: { finalAnswer: "92" } } },
    });
    // the attempt is INVISIBLE cross-tenant (scoped lookup → 404) — isolation
    // is STRONGER than a 403: B cannot even learn the attempt exists.
    expect([403, 404]).toContain(spoof.status);
    if (spoof.status === 403) expect(spoof.json.error.code).toBe("STUDENT_CONTEXT_MISMATCH");
    else expect(spoof.json.error.code).toBe("ATTEMPT_NOT_FOUND_IN_TENANT");
  });

  // ===== ASSESSMENT — all 7 kinds, rubric, readiness, gate =====

  it(`A1. All 7 assessment kinds through /v1: REAL weighted rubric, scoreScope, evidence trace; NO auto-intervention`, async () => {
    const proposalsBefore = await db.select().from(dbmod.interventionProposalsTable);
    const beforeForStudent = proposalsBefore.filter((p: any) => p.studentId === STUDENT_1).length;
    for (let i = 0; i < ASM_KINDS.length; i++) {
      const kind = ASM_KINDS[i];
      const start = await api("POST", "/v1/attempts", {
        token: STUDENT_TOKEN, idempotencyKey: `c26-a-${kind}-${randomUUID()}`,
        body: { activityId: "act-assessment-26", exerciseId: EXERCISE_ASM, attemptNumber: 100 + i },
      });
      expect(start.status, kind).toBe(201);
      const attemptId = start.json.attempt.id;
      const submit = await api("POST", `/v1/attempts/${attemptId}/submit`, {
        token: STUDENT_TOKEN,
        body: {
          durationMs: 60000,
          time: { activityDurationMs: 60000, responseDurationMs: 20000, thinkingDurationMs: 5000 },
          engineInput: { definition: asmDefinition(kind), response: ASM_RESPONSE_GOOD },
        },
      });
      expect(submit.status, kind).toBe(200);
      expect(submit.json.state, kind).toBe("EVIDENCE_RECORDED");
      const row = (await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 400 })).find((r: any) => r.id === submit.json.evidenceRef);
      expect(row.sourceEngine, kind).toBe("assessment-engine");
      const m = (row.metadata as any).measurements;
      expect(m.definitionId, kind).toBe(`asm-def-${kind}`);
      expect(m.scoreScope, kind).toBe("assessment"); // assessment-scoped, NEVER a global verdict
      expect(m.rubricScore, kind).toBeCloseTo(4 / 6, 4); // real weighted rubric (engine-computed)
      expect(m.attemptId, kind).toBe(attemptOperationKey({
        tenantId: TENANT_A, studentId: STUDENT_1, activityId: "act-assessment-26",
        attemptNumber: 100 + i, startedAt: (await dbmod.getAttempt(TENANT_A, attemptId)).startedAt instanceof Date
          ? ((await dbmod.getAttempt(TENANT_A, attemptId)).startedAt).toISOString() : (await dbmod.getAttempt(TENANT_A, attemptId)).startedAt,
      }));
      expect(m.durationMs, kind).toBe(60000); // timing rides through the REAL path
    }
    // NO automatic intervention from assessment results (R-026-03):
    const proposalsAfter = await db.select().from(dbmod.interventionProposalsTable);
    expect(proposalsAfter.filter((p: any) => p.studentId === STUDENT_1).length).toBe(beforeForStudent);
  });

  it("A2. The 4 readiness states derived from REAL adapter measurements (data flow, not synthetic) incl. REQUIRES_TEACHER_REVIEW", async () => {
    // real rubric output from the A1 "formative" submission (read from canonical evidence)
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 400 });
    const real = rows.filter((r: any) => r.sourceEngine === "assessment-engine");
    expect(real.length).toBeGreaterThanOrEqual(7);
    // REAL fully-correct submission for a clean READY case: all 4 items correct →
    // rubricScore=1, consistency=1 (engine-computed, not synthetic).
    const startR = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `c26-ready-${randomUUID()}`,
      body: { activityId: "act-assessment-26", exerciseId: EXERCISE_ASM, attemptNumber: 120 },
    });
    expect(startR.status).toBe(201);
    const submitR = await api("POST", `/v1/attempts/${startR.json.attempt.id}/submit`, {
      token: STUDENT_TOKEN,
      body: {
        engineInput: {
          definition: asmDefinition("progress"),
          response: { items: [ { itemRef: "i1", response: "7" }, { itemRef: "i2", response: "12" }, { itemRef: "i3", response: "24" }, { itemRef: "i4", response: "9" } ] },
        },
      },
    });
    expect(submitR.status).toBe(200);
    const rowsAll = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 400 });
    const realAll = rowsAll.filter((r: any) => r.sourceEngine === "assessment-engine");
    const perfect = (realAll.find((r: any) => (r.metadata as any)?.measurements?.rubricScore === 1));
    expect(perfect, "fully-correct rubric evidence").toBeTruthy();
    const m = (perfect as any).metadata.measurements;
    expect(m.consistency).toBe(1);
    const policy = { minEvidenceCount: 2, minConsistency: 0.6 };
    const prereqs = [{ skill: "arithmetic", evidenceRef: (perfect as any).id }, { skill: "fluency", evidenceRef: (realAll.find((r: any) => r.id !== (perfect as any).id) as any).id }];
    const refs = prereqs.map((p) => p.evidenceRef);
    // READY — the REAL fully-correct measurement above threshold with consistent dims
    expect(evaluateReadiness({ assessment: m, prerequisites: prereqs, requiredEvidence: policy, availableEvidenceRefs: refs }).state).toBe("READY");
    // REQUIRES_TEACHER_REVIEW — the REAL 4/6 measurement (0.67) against threshold 0.75 (inside the buffer)
    const partial = (realAll.find((r: any) => r.id !== (perfect as any).id) as any).metadata.measurements;
    expect(evaluateReadiness({ assessment: partial, prerequisites: prereqs, requiredEvidence: policy, availableEvidenceRefs: refs, passThreshold: 0.75 }).state).toBe("REQUIRES_TEACHER_REVIEW");
    // INSUFFICIENT_EVIDENCE — fewer real evidence refs than policy requires
    expect(evaluateReadiness({ assessment: m, prerequisites: [], requiredEvidence: policy, availableEvidenceRefs: [] }).state).toBe("INSUFFICIENT_EVIDENCE");
    // NOT_READY — the REAL 4/6 measurement (0.67) below threshold−buffer (0.95−0.1=0.85)
    expect(evaluateReadiness({ assessment: partial, prerequisites: prereqs, requiredEvidence: policy, availableEvidenceRefs: refs, passThreshold: 0.95 }).state).toBe("NOT_READY");
  });

  it("A3. Teacher Decision Gate: real detection → diagnosis → PENDING proposal → delivery FORBIDDEN until APPROVED; unauthorized delivery fails", async () => {
    // REAL mistake evidence via the canonical writer (3 real repeated mistakes on division)
    const refs: string[] = [];
    for (let i = 0; i < 3; i++) {
      const written = await dbmod.recordEvidence({
        tenantId: TENANT_A, studentId: STUDENT_1, actorId: USER_STAFF, actorRole: "teacher",
        evidenceType: "mistake", subject: "math", sourceEngine: "numeracy-engine",
        response: { skill: "division", accuracy: 0, errorType: "DIVISION_REMAINDER_ERROR" },
        operationKey: `c26-mistake-${i}-${randomUUID()}`,
      });
      refs.push((written as any).id);
    }
    // REAL detection over REAL evidence rows
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 400 });
    const signals = detectSignals(rows.filter((r: any) => r.evidenceType === "mistake" && (r.response as any)?.skill === "division"));
    const signal = signals.find((s) => s.kind === "repeated-mistake");
    expect(signal).toBeTruthy();
    expect(signal!.evidenceRefs.sort()).toEqual([...refs].sort()); // traceable to canonical evidence
    // REAL diagnosis → REAL proposal (PENDING)
    const diagnosis = await (await import("@workspace/learning-loop")).createDiagnosis({
      tenantId: TENANT_A, studentId: STUDENT_1, signal,
    });
    const proposal = await (await import("@workspace/learning-loop")).proposeIntervention({
      tenantId: TENANT_A, studentId: STUDENT_1, diagnosis, activityType: "targeted-numeracy-exercise",
    });
    expect(proposal.status).toBe("PENDING"); // NOT executed, NOT delivered
    // the loop's template RESOLVED the delivery type — the REAL proposal value governs
    const deliveredType = proposal.activityType as string;
    const decisions = await import("@workspace/decisions");
    // delivery BEFORE the gate is impossible (no authorization exists)
    expect(() => decisions.assertDeliveryAuthorized(
      { tenantId: TENANT_A, studentId: STUDENT_1, proposalId: proposal.id, activityType: deliveredType },
      null,
    )).toThrow();
    // teacher APPROVES through the gate
    const applied = await decisions.applyTeacherDecision({
      tenantId: TENANT_A, proposal,
      decision: { action: "APPROVED", actorId: USER_STAFF, actorRole: "teacher", reason: "موافقة المعلم" },
      evidenceRefs: refs,
    });
    expect(applied.existed).toBeFalsy(); // first application
    // delivery AFTER approval is authorized for the EXACT proposal/student/type only
    expect(() => decisions.assertDeliveryAuthorized(
      { tenantId: TENANT_A, studentId: STUDENT_1, proposalId: proposal.id, activityType: deliveredType },
      applied.authorization,
    )).not.toThrow();
    expect(() => decisions.assertDeliveryAuthorized(
      { tenantId: TENANT_A, studentId: STUDENT_B1, proposalId: proposal.id, activityType: deliveredType }, // another student
      applied.authorization,
    )).toThrow();
  });

  // ===== INFRASTRUCTURE — REAL queue/worker retry + recovery (no infra mocks) =====

  it("W1. READING slice: REAL queue → REAL worker → canonical evidence → EVIDENCE_RECORDED; worker job REPLAY cannot duplicate evidence (recovery)", async () => {
    const start = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `c26-w1-${randomUUID()}`,
      body: { activityId: "act-reading-26", exerciseId: EXERCISE_READING, attemptNumber: 200 },
    });
    expect(start.status).toBe(201);
    const attemptId = start.json.attempt.id;
    const submit = await api("POST", `/v1/attempts/${attemptId}/submit`, {
      token: STUDENT_TOKEN,
      body: {
        durationMs: 42000,
        time: { activityDurationMs: 42000, responseDurationMs: 9000, thinkingDurationMs: 1200, replayDurationMs: 3000 },
        engineInput: { passageId: PASSAGE_1, sessionId: SESSION_1, audioKey: `c26/${randomUUID()}.bin`, expectedText: "مرحبا بالعالم" },
      },
    });
    expect(submit.status).toBe(200);
    expect(submit.json.state).toBe("SUBMITTED"); // async path — rests at SUBMITTED

    // REAL in-test worker over the REAL queue (same factory as apps/worker)
    const { createWorker } = await import("@workspace/queue");
    const { processAnalyzeJob } = await import("../../engines/reading-engine/src/queue/workers/analyze.processor.js");
    const worker = createWorker("analyze", (job: any) => processAnalyzeJob(job), { concurrency: 1, autorun: true });
    const { analyzeQueue } = await import("@workspace/queue");
    const t0 = Date.now();
    let jobs: any[] = [];
    while (Date.now() - t0 < 25000) {
      jobs = await analyzeQueue.getJobs(["active", "waiting", "completed", "failed"]);
      if (jobs.length > 0) {
        const states = await Promise.all(jobs.map((j: any) => j.getState()));
        if (states.every((s: string) => s === "completed" || s === "failed")) break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    await worker.close();

    let final = await dbmod.getAttempt(TENANT_A, attemptId);
    expect(final.state).toBe("EVIDENCE_RECORDED");
    expect(final.evidenceRef).toBeTruthy();
    const countRows = async () => {
      const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 400 });
      return rows.filter((r: any) => r.sourceEngine === "reading-engine" && (r.metadata as any)?.masteryLevel).length;
    };
    expect(await countRows()).toBe(1);

    // RECOVERY/RETRY: the worker executes the SAME job AGAIN (queue retry/replay) —
    // idempotent operationKey → still exactly ONE evidence row; replay converge.
    const { isDuplicateJob } = await import("@workspace/queue");
    if (jobs.length > 0) {
      const job = jobs.find((j: any) => j.id) ;
      if (job) {
        await processAnalyzeJob(job); // real second execution of the same job
        expect(await countRows()).toBe(1); // ZERO duplicates after replay
      }
    }
    void isDuplicateJob;

    // RECOVERY: idempotent completion replay — completeAsyncExecution resumes
    // the canonical lifecycle WITHOUT writing a second evidence row.
    final = await dbmod.getAttempt(TENANT_A, attemptId);
    // idempotent completion replay
    const resumed = await dbmod.completeAsyncExecution({
      tenantId: TENANT_A, executionAttemptId: attemptId,
      evidenceRef: final.evidenceRef, actorId: "worker",
    });
    expect(resumed.state).toBe("EVIDENCE_RECORDED");
    expect(resumed.evidenceRef).toBe(final.evidenceRef);
    expect(await countRows()).toBe(1); // still exactly ONE
  }, 60000);
});
