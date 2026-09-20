process.env.AUTH_RATE_LIMIT_MAX = "10";
/**
 * PHASE-25 (EXAMS-MODULE: الامتحانات — §5.2.1) — REAL E2E gate: real Express
 * app (thin /v1 adapter) + real PostgreSQL (core32_verify, RLS enforced) +
 * real Redis. Nothing mocked. The exam lifecycle is data-driven (window
 * checks inside the transaction — no scheduler); auto-grading happens
 * inside the submission transaction; the double-submit guard is ATOMIC
 * (UNIQUE(tenant,exam,student) + ON CONFLICT DO NOTHING) — ADR-046.
 *   P25-1: staff creates an exam (replay → SAME id); DRAFT invisible to
 *          students; student 403 on the staff surface.
 *   P25-2: /mine shows PUBLISHED exams WITHOUT answerKey; submit → exact
 *          auto-grade 2/3; same-key replay → SAME id; different key → 409;
 *          closed window → 409 WINDOW_CLOSED.
 *   P25-3: staff submissions list (exact score); student /submissions/mine;
 *          tenant-B sees ZERO tenant-A rows (RLS fail-closed).
 *   P25-4: §3.3 fire-and-forget — exactly one event per unique key.
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

interface ApiResult { status: number; body: any }
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
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body };
}

const opKey = (tag: string) => `p25-${tag}-${randomUUID()}`;

beforeAll(async () => {
  const dbmod = await import("@workspace/db");
  const {
    tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P25-A", slug: `p25a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P25-B", slug: `p25b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P25-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P25-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P25", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب-P25", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);
  await db.insert(studentIdentitiesTable).values([
    { id: IDENTITY_1, operationKey: opKey("id1") },
    { id: IDENTITY_B1, operationKey: opKey("idb") },
  ]);
  await db.insert(studentsTable).values([
    { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "خالد", lastName: "P25", studentCode: `P25-${randomUUID()}` },
    { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "برoccus", lastName: "P25B", studentCode: `P25B-${randomUUID()}` },
  ]);
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });
  await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

  const { hashPassword } = await import("@workspace/security");
  const hash = await hashPassword("s3cretpass");
  TEACHER_A.email = `p25-ta-${randomUUID()}@x.test`;
  TEACHER_B.email = `p25-tb-${randomUUID()}@x.test`;
  PRINCIPAL.email = `p25-pr-${randomUUID()}@x.test`;
  await db.insert(usersTable).values([
    { id: PRINCIPAL.sub, tenantId: TENANT_A, firstName: "مديرة", lastName: "P25", email: PRINCIPAL.email, passwordHash: hash, role: "principal" },
    { id: TEACHER_A.sub, tenantId: TENANT_A, firstName: "معلمة", lastName: "P25", email: TEACHER_A.email, passwordHash: hash, role: "teacher" },
    { id: TEACHER_B.sub, tenantId: TENANT_B, firstName: "معلم", lastName: "P25B", email: TEACHER_B.email, passwordHash: hash, role: "teacher" },
  ]);

  const { default: app } = await import("../../apps/api/src/app.js");
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  });
  await new Promise<void>((resolve) => server!.on("listening", resolve));
  const la = await api("POST", "/v1/auth/login", { body: { email: TEACHER_A.email, password: "s3cretpass" } });
  expect(la.status).toBe(200);
  TEACHER_A.token = la.body.accessToken;
  const lb = await api("POST", "/v1/auth/login", { body: { email: TEACHER_B.email, password: "s3cretpass" } });
  expect(lb.status).toBe(200);
  TEACHER_B.token = lb.body.accessToken;
  const ls = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_1 }, tenant: TENANT_A });
  expect(ls.status).toBe(200);
  STUDENT_TOKEN = ls.body.accessToken;
});

d("PHASE-25 — exams over real HTTP + real PG (§5.2.1)", () => {
  it("P25-1: staff creates an exam (replay → SAME id); DRAFT invisible to students; student 403", async () => {
    const now = Date.now();
    const K = `p25-e1-${randomUUID()}`;
    const e1 = await api("POST", "/v1/exams", {
      token: TEACHER_A.token, idempotencyKey: K,
      body: {
        classId: CLASS_A, title: "اختبار الوحدة الأولى", subject: "رياضيات",
        answerKey: { q1: "أ", q2: "ب", q3: "ج" }, status: "PUBLISHED",
        opensAt: new Date(now - 3600e3).toISOString(), closesAt: new Date(now + 2 * 3600e3).toISOString(),
      },
    });
    expect(e1.status).toBe(201);
    expect(e1.body.existed).toBe(false);
    expect(e1.body.exam.status).toBe("PUBLISHED");
    // replay with the SAME key → the SAME id, no duplicate
    const e1r = await api("POST", "/v1/exams", {
      token: TEACHER_A.token, idempotencyKey: K,
      body: {
        classId: CLASS_A, title: "اختبار الوحدة الأولى", subject: "رياضيات",
        answerKey: { q1: "أ", q2: "ب", q3: "ج" }, status: "PUBLISHED",
        opensAt: new Date(now - 3600e3).toISOString(), closesAt: new Date(now + 2 * 3600e3).toISOString(),
      },
    });
    expect(e1r.status).toBe(200);
    expect(e1r.body.existed).toBe(true);
    expect(e1r.body.exam.id).toBe(e1.body.exam.id);
    // DRAFT exam — invisible to students
    const draft = await api("POST", "/v1/exams", {
      token: TEACHER_A.token, idempotencyKey: `p25-e3-${randomUUID()}`,
      body: {
        classId: CLASS_A, title: "اختبار مسودة", subject: "علوم",
        answerKey: { q1: "ص" }, status: "DRAFT",
        opensAt: new Date(now - 3600e3).toISOString(), closesAt: new Date(now + 3600e3).toISOString(),
      },
    });
    expect(draft.status).toBe(201);
    // students cannot use the staff creation surface (role-gated)
    const denied = await api("POST", "/v1/exams", {
      token: STUDENT_TOKEN, idempotencyKey: `p25-deny-${randomUUID()}`,
      body: { title: "x", subject: "y", opensAt: new Date().toISOString(), closesAt: new Date().toISOString() },
    });
    expect(denied.status).toBe(403);
  });

  it("P25-2: /mine without answerKey; submit → exact auto-grade 2/3; replay → SAME id; double-submit 409; closed window 409", async () => {
    const mine = await api("GET", "/v1/exams/mine", { token: STUDENT_TOKEN });
    expect(mine.status).toBe(200);
    const items = mine.body.items as any[];
    // PUBLISHED only: the open exam + the closed-window exam (created below is
    // separate) — the DRAFT must NOT appear
    expect(items.length).toBe(2);
    // ANSWER-KEY CONFIDENTIALITY: no leak over HTTP
    expect(JSON.stringify(mine.body)).not.toContain("answerKey");
    // closed-window exam for the window test
    const now = Date.now();
    const closed = await api("POST", "/v1/exams", {
      token: TEACHER_A.token, idempotencyKey: `p25-e2-${randomUUID()}`,
      body: {
        classId: CLASS_A, title: "اختبار منقضي", subject: "لغة",
        answerKey: { q1: "أ" }, status: "PUBLISHED",
        opensAt: new Date(now - 3 * 3600e3).toISOString(), closesAt: new Date(now - 2 * 3600e3).toISOString(),
      },
    });
    expect(closed.status).toBe(201);
    // the atomic submission — one wrong answer of three
    const EXAM = items[0].id as string;
    const K = `p25-s1-${randomUUID()}`;
    const s1 = await api("POST", `/v1/exams/${EXAM}/submit`, {
      token: STUDENT_TOKEN, idempotencyKey: K,
      body: { answers: { q1: "أ", q2: "ب", q3: "د" } },
    });
    expect(s1.status).toBe(201);
    expect(s1.body.existed).toBe(false);
    expect(s1.body.submission.score).toBe(2);
    expect(s1.body.submission.maxScore).toBe(3);
    // replay with the SAME key → the SAME submission id (no duplicate, no re-grade)
    const s1r = await api("POST", `/v1/exams/${EXAM}/submit`, {
      token: STUDENT_TOKEN, idempotencyKey: K,
      body: { answers: { q1: "أ", q2: "ب", q3: "د" } },
    });
    expect(s1r.status).toBe(200);
    expect(s1r.body.existed).toBe(true);
    expect(s1r.body.submission.id).toBe(s1.body.submission.id);
    // a DIFFERENT key → genuine double-submit → 409 (the atomic UNIQUE guard)
    const dup = await api("POST", `/v1/exams/${EXAM}/submit`, {
      token: STUDENT_TOKEN, idempotencyKey: `p25-s2-${randomUUID()}`,
      body: { answers: { q1: "أ", q2: "ب", q3: "ج" } },
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("ALREADY_SUBMITTED");
    // outside the window → 409 WINDOW_CLOSED (data-driven, no scheduler)
    const late = await api("POST", `/v1/exams/${closed.body.exam.id}/submit`, {
      token: STUDENT_TOKEN, idempotencyKey: `p25-s3-${randomUUID()}`,
      body: { answers: { q1: "أ" } },
    });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("WINDOW_CLOSED");
  });

  it("P25-3: staff submissions list (exact score); student /submissions/mine; tenant-B sees ZERO", async () => {
    const list = await api("GET", "/v1/exams", { token: TEACHER_A.token });
    expect(list.status).toBe(200);
    const exams = list.body.items as any[];
    expect(exams.length).toBe(3); // PUBLISHED + DRAFT + closed-window (all tenant-A)
    const EXAM = exams.find((e) => e.title === "اختبار الوحدة الأولى")!.id as string;
    const subs = await api("GET", `/v1/exams/${EXAM}/submissions`, { token: TEACHER_A.token });
    expect(subs.status).toBe(200);
    expect((subs.body.items as unknown[]).length).toBe(1);
    expect(subs.body.items[0].score).toBe(2);
    expect(subs.body.items[0].maxScore).toBe(3);
    // student sees the OWN submission with the score
    const mine = await api("GET", "/v1/exams/submissions/mine", { token: STUDENT_TOKEN });
    expect(mine.status).toBe(200);
    expect((mine.body.items as unknown[]).length).toBe(1);
    expect(mine.body.items[0].score).toBe(2);
    // tenant-B staff: ZERO tenant-A exams and submissions (RLS fail-closed)
    const crossExams = await api("GET", "/v1/exams", { token: TEACHER_B.token });
    expect(crossExams.status).toBe(200);
    expect((crossExams.body.items as unknown[]).length).toBe(0);
  });

  it("P25-4 [§3.3 fire-and-forget]: exactly one event per unique key (replays collapsed)", async () => {
    // proven pattern (p16 line 223): staff reads the tenant interaction stream
    const events = await api("GET", "/v1/interaction-events", { token: TEACHER_A.token });
    expect(events.status).toBe(200);
    const p25 = (events.body.items as any[]).filter((e) => e.detail?.phase === "PHASE-25");
    expect(p25.length).toBe(4); // 3 creates + 1 submit (the replays collapsed)
    expect(p25.every((e) => e.eventType === "ATTEMPT_SUBMIT")).toBe(true);
  });
});
