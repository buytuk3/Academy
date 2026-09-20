// PHASE-21 scoped matrix condition (p21-only, mirrors the p17-p20 gates): this
// file performs 3 legit auth flows inside one window; the shared default
// (3/IP) 429s the third. auth-sec keeps MAX=3 in its own process.
process.env.AUTH_RATE_LIMIT_MAX = "10";
/**
 * PHASE-21 (EXAM-BEHAVIORAL-ANALYTICS, governing doc v2.1 §3.9) — REAL E2E
 * gate: real Express app (thin /v1/exam-analytics adapter) + real PostgreSQL
 * (core32_verify, RLS enforced) + real Redis. Nothing mocked, NOTHING seeded:
 * every metric derives from REAL numeracy attempts driven through the REAL
 * /v1/attempts + /v1/attempts/:id/submit surfaces (the interaction_events
 * stream of PHASE-16 with DB-clock occurred_at — ADR-042).
 *   P21-1: real correct ("92") + real wrong ("91") attempts → the §3.9
 *          metrics (questionsStarted=2, submissions=3, avgTimeMs≥0, sequence
 *          [true,false] in DB-clock order); snapshot recorded once; replay
 *          with the SAME Idempotency-Key → the SAME id.
 *   P21-2: answer-change semantics — the converged resubmit of attempt-1
 *          logs a real second ATTEMPT_SUBMIT event → answerChanges=1.
 *   P21-3: principal dashboard on existing RLS reads ONLY — school view +
 *          class filter; tenant-B sees zero rows; role gates; /mine works.
 *   P21-4: fire-and-forget §3.3 — exactly ONE PHASE-21 event per unique key.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const RUN = process.env.CORE32_E2E === "1";
const d = RUN ? describe : describe.skip;

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const SCHOOL_A = randomUUID(), CLASS_A = randomUUID();
const SCHOOL_B = randomUUID(), CLASS_B = randomUUID();
const IDENTITY_1 = randomUUID(), STUDENT_1 = randomUUID();
const IDENTITY_B1 = randomUUID(), STUDENT_B1 = randomUUID();
const PRINCIPAL = { sub: randomUUID(), email: "", token: "" };
const TEACHER_A = { sub: randomUUID(), email: "", token: "" };
const TEACHER_B = { sub: randomUUID(), email: "", token: "" };
let STUDENT_TOKEN = "";

let server: Server | null = null;
let base = "";

afterAll(() => {
  server?.close();
});

interface ApiResult { status: number; body: any; json: any }
async function api(method: string, path: string, opts: {
  body?: unknown; token?: string; tenant?: string; idempotencyKey?: string;
} = {}): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.tenant) headers["x-tenant-id"] = opts.tenant;
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  const res = await fetch(base + path, {
    method, headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, body: json, json };
}

const opKey = (tag: string) => `p21-${tag}-${randomUUID()}`;
const num = (finalAnswer: string) => ({
  task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" },
  response: { finalAnswer },
});

beforeAll(async () => {
  const dbmod = await import("@workspace/db");
  const {
    tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P21-A", slug: `p21a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P21-B", slug: `p21b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P21-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P21-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P21", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب-P21", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);
  await db.insert(studentIdentitiesTable).values([
    { id: IDENTITY_1, operationKey: opKey("id1") },
    { id: IDENTITY_B1, operationKey: opKey("idb") },
  ]);
  await db.insert(studentsTable).values([
    { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "غساق", lastName: "P21", studentCode: `P21-${randomUUID()}` },
    { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "بشر", lastName: "P21B", studentCode: `P21B-${randomUUID()}` },
  ]);
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });
  await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

  const { hashPassword } = await import("@workspace/security");
  const hash = await hashPassword("s3cretpass");
  TEACHER_A.email = `p21-ta-${randomUUID()}@x.test`;
  TEACHER_B.email = `p21-tb-${randomUUID()}@x.test`;
  PRINCIPAL.email = `p21-pr-${randomUUID()}@x.test`;
  await db.insert(usersTable).values([
    { id: PRINCIPAL.sub, tenantId: TENANT_A, firstName: "مديرة", lastName: "P21", email: PRINCIPAL.email, passwordHash: hash, role: "principal" },
    { id: TEACHER_A.sub, tenantId: TENANT_A, firstName: "معلمة", lastName: "P21", email: TEACHER_A.email, passwordHash: hash, role: "teacher" },
    { id: TEACHER_B.sub, tenantId: TENANT_B, firstName: "معلم", lastName: "P21B", email: TEACHER_B.email, passwordHash: hash, role: "teacher" },
  ]);

  // REAL content chain (E4/p16 recipe) — the exercises the attempts run on
  const anchor = { curriculumId: "cur-eg-ar", curriculumVersion: "2026", country: "EG", educationSystem: "EG-NATIONAL", stageKey: "PRIMARY", gradeKey: "EG-PR-04", gradeLevel: "4", subject: "math", bookId: "bk-4", unitId: "u1", lessonId: "les-1", objectiveId: "o1" };
  const lesson = await dbmod.createContentDefinition({
    tenantId: TENANT_A, title: "درس P21", kind: "LESSON", source: "TEACHER_CREATED",
    curriculum: anchor, createdBy: PRINCIPAL.sub, operationKey: opKey("lesson"),
    metadata: { objective: "أهداف P21" },
  });
  const LESSON_ID = lesson.content.id;
  await dbmod.publishContent(TENANT_A, LESSON_ID, PRINCIPAL.sub);
  const ex = await dbmod.createExerciseDefinition({
    tenantId: TENANT_A, activityType: "MATHEMATICS", engineBinding: "NUMERACY",
    expectedResponseType: "TYPED", source: "TEACHER_CREATED", curriculum: anchor,
    contentId: LESSON_ID, createdBy: PRINCIPAL.sub, operationKey: opKey("exn"),
  });
  const EXERCISE_NUM = ex.exercise.id;
  await dbmod.publishExercise(TENANT_A, EXERCISE_NUM, PRINCIPAL.sub);
  (globalThis as any).__P21_EXERCISE__ = EXERCISE_NUM;

  const { default: app } = await import("../../apps/api/src/app.js");
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  });
  await new Promise<void>((resolve) => server!.on("listening", resolve));
  const la = await api("POST", "/v1/auth/login", { body: { email: TEACHER_A.email, password: "s3cretpass" } });
  expect(la.status).toBe(200);
  TEACHER_A.token = la.json.accessToken;
  const lb = await api("POST", "/v1/auth/login", { body: { email: TEACHER_B.email, password: "s3cretpass" } });
  expect(lb.status).toBe(200);
  TEACHER_B.token = lb.json.accessToken;
  const ls = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_1 }, tenant: TENANT_A });
  expect(ls.status).toBe(200);
  STUDENT_TOKEN = ls.json.accessToken;
  (globalThis as any).__P21_STUDENT__ = STUDENT_1;
});

d("PHASE-21 — exam-behavioral analytics over real HTTP + real PG (§3.9)", () => {
  it("P21-1+P21-2 [§3.9 derivation]: REAL attempts → exact metrics; resubmit = answer change; replay converges to the SAME id", async () => {
    const EXERCISE_NUM = (globalThis as any).__P21_EXERCISE__ as string;
    // attempt 1: REAL start + correct submit ("92")
    const start1 = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `p21-s1-${randomUUID()}`,
      body: { activityId: "act-p21-num", exerciseId: EXERCISE_NUM, attemptNumber: 1 },
    });
    expect(start1.status).toBe(201);
    const a1 = start1.json.attempt.id as string;
    const ok = await api("POST", `/v1/attempts/${a1}/submit`, {
      token: STUDENT_TOKEN, body: { durationMs: 25000, engineInput: num("92") },
    });
    expect(ok.status).toBe(200);
    // attempt 1 RESUBMIT with a DIFFERENT answer ("91") — converges (state
    // machine) and logs a REAL second ATTEMPT_SUBMIT event = answer change
    const resub = await api("POST", `/v1/attempts/${a1}/submit`, {
      token: STUDENT_TOKEN, body: { durationMs: 40000, engineInput: num("91") },
    });
    expect(resub.status).toBe(200);
    // attempt 2: REAL start + wrong submit ("91")
    const start2 = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: `p21-s2-${randomUUID()}`,
      body: { activityId: "act-p21-num", exerciseId: EXERCISE_NUM, attemptNumber: 2 },
    });
    expect(start2.status).toBe(201);
    const a2 = start2.json.attempt.id as string;
    const bad = await api("POST", `/v1/attempts/${a2}/submit`, {
      token: STUDENT_TOKEN, body: { durationMs: 30000, engineInput: num("91") },
    });
    expect(bad.status).toBe(200);

    // the §3.9 analytics — computed + snapshotted through the REAL /v1 surface
    const K = `p21-c1-${randomUUID()}`;
    const snap = await api("POST", "/v1/exam-analytics/compute", {
      token: STUDENT_TOKEN, idempotencyKey: K,
    });
    expect(snap.status).toBe(201);
    expect(snap.json.existed).toBe(false);
    expect(snap.json.engineVersion).toBe("1.0.0-events-derived");
    expect(snap.json.questionsStarted).toBe(2);
    expect(snap.json.submissions).toBe(3);
    expect(snap.json.answerChanges).toBe(1); // attempt-1 resubmit (real event)
    expect(snap.json.avgTimeMs).toBeGreaterThanOrEqual(0);
    expect(snap.json.correctCount).toBe(1); // attempt-1 evidence ("92" — first submit is canonical)
    expect(snap.json.wrongCount).toBe(1); // attempt-2 evidence ("91" → FINAL_ANSWER_ERROR)
    const seq = snap.json.sequence as Array<{ attemptId: string; correct: boolean; occurredAt: string }>;
    expect(seq.length).toBe(2);
    expect(seq[0].attemptId).toBe(a1);
    expect(seq[0].correct).toBe(true);
    expect(seq[1].attemptId).toBe(a2);
    expect(seq[1].correct).toBe(false);
    expect(new Date(seq[0].occurredAt).getTime()).toBeLessThanOrEqual(new Date(seq[1].occurredAt).getTime());
    expect(snap.json.classId).toBeTruthy();
    // replay with the SAME key → the SAME snapshot id (one row)
    const replay = await api("POST", "/v1/exam-analytics/compute", {
      token: STUDENT_TOKEN, idempotencyKey: K,
    });
    expect(replay.status).toBe(200);
    expect(replay.json.existed).toBe(true);
    expect(replay.json.id).toBe(snap.json.id);
    // the student's /mine lists exactly one snapshot
    const mine = await api("GET", "/v1/exam-analytics/mine", { token: STUDENT_TOKEN });
    expect(mine.status).toBe(200);
    expect((mine.body.items as unknown[]).length).toBe(1);
  });

  it("P21-3 [dashboard on existing RLS reads ONLY]: school view + class filter; tenant-B zero rows; role gates", async () => {
    const school = await api("GET", "/v1/exam-analytics/school", { token: TEACHER_A.token });
    expect(school.status).toBe(200);
    expect((school.body.items as unknown[]).length).toBe(1);
    // class filter = the student's REAL class
    const cls = await api("GET", `/v1/exam-analytics/school?classId=${CLASS_A}`, { token: TEACHER_A.token });
    expect(cls.status).toBe(200);
    expect((cls.body.items as unknown[]).length).toBe(1);
    const clsOther = await api("GET", `/v1/exam-analytics/school?classId=${randomUUID()}`, { token: TEACHER_A.token });
    expect(clsOther.status).toBe(200);
    expect((clsOther.body.items as unknown[]).length).toBe(0);
    // tenant-B staff sees ZERO tenant-A snapshots (RLS fail-closed)
    const cross = await api("GET", "/v1/exam-analytics/school", { token: TEACHER_B.token });
    expect(cross.status).toBe(200);
    expect((cross.body.items as unknown[]).length).toBe(0);
    // a student cannot use the staff dashboard
    const denied = await api("GET", "/v1/exam-analytics/school", { token: STUDENT_TOKEN });
    expect(denied.status).toBe(403);
    // staff live metrics for the student (no snapshot write)
    const live = await api("GET", `/v1/exam-analytics/student/${(globalThis as any).__P21_STUDENT__}`, { token: TEACHER_A.token });
    expect(live.status).toBe(200);
    expect(live.json.questionsStarted).toBe(2);
    // compute without an Idempotency-Key is rejected
    const noIdem = await api("POST", "/v1/exam-analytics/compute", { token: STUDENT_TOKEN });
    expect(noIdem.status).toBe(400);
  });

  it("P21-4 [§3.3 fire-and-forget]: exactly ONE PHASE-21 event per unique key (replay collapsed)", async () => {
    const dbmod = await import("@workspace/db");
    const events = await dbmod.listInteractionEvents({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 300 });
    const p21 = events.filter((e: any) => e.detail?.phase === "PHASE-21");
    expect(p21.length).toBe(1); // the P21-1 compute + its replay collapsed
    expect(p21[0].eventType).toBe("ATTEMPT_SUBMIT");
  });
});
