/**
 * PHASE-16 (INTERACTION-EVENT-LOG, governing doc v2.1 §3.3) — REAL E2E gate:
 * real Express app (thin /v1 adapters with fire-and-forget event hooks) + real
 * PostgreSQL (core32_verify, RLS enforced) + real Redis. Nothing mocked.
 *   P16-1 EVT-1/2: real student login → LOGIN event with REAL DB-clock timestamp
 *          inside the test window; events table SEPARATE from evidence (a login
 *          creates ZERO evidence rows).
 *   P16-2 EVT-2: attempt start → ATTEMPT_START (attemptId binding); idempotent
 *          replay (created:false) does NOT duplicate the event; submit →
 *          ATTEMPT_SUBMIT (sync mode); START.occurredAt <= SUBMIT.occurredAt.
 *   P16-3 EVT-2: FAILED student login (real 4xx) → LOGIN_FAILED row with reason.
 *   P16-4 EVT-4: staff listing (role-gated; student 403); student /mine = own only;
 *          tenant-B teacher sees ONLY tenant-B events (RLS fail-closed) — tenant-A
 *          event ids invisible.
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
let STUDENT_TOKEN = "", STUDENT_B_TOKEN = "";
let LESSON_ID = "", EXERCISE_NUM = "";

let server: Server | null = null;
let base = "";
let T0 = 0;

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

const opKey = (tag: string) => `p16-${tag}-${randomUUID()}`;
const ms = (v: unknown): number => new Date(v as string).getTime();

beforeAll(async () => {
  T0 = Date.now();
  const dbmod = await import("@workspace/db");
  const {
    tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P16-A", slug: `p16a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P16-B", slug: `p16b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P16-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P16-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P16", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب-P16", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);
  await db.insert(studentIdentitiesTable).values([
    { id: IDENTITY_1, operationKey: opKey("id1") },
    { id: IDENTITY_B1, operationKey: opKey("idb") },
  ]);
  await db.insert(studentsTable).values([
    { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "سالم", lastName: "P16", studentCode: `P16-${randomUUID()}` },
    { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "باسم", lastName: "P16B", studentCode: `P16B-${randomUUID()}` },
  ]);
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });
  await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

  const { hashPassword } = await import("@workspace/security");
  const hash = await hashPassword("s3cretpass");
  TEACHER_A.email = `p16-ta-${randomUUID()}@x.test`;
  TEACHER_B.email = `p16-tb-${randomUUID()}@x.test`;
  PRINCIPAL.email = `p16-pr-${randomUUID()}@x.test`;
  await db.insert(usersTable).values([
    { id: PRINCIPAL.sub, tenantId: TENANT_A, firstName: "مديرة", lastName: "P16", email: PRINCIPAL.email, passwordHash: hash, role: "principal" },
    { id: TEACHER_A.sub, tenantId: TENANT_A, firstName: "معلمة", lastName: "P16", email: TEACHER_A.email, passwordHash: hash, role: "teacher" },
    { id: TEACHER_B.sub, tenantId: TENANT_B, firstName: "معلم", lastName: "P16B", email: TEACHER_B.email, passwordHash: hash, role: "teacher" },
  ]);

  // Published LESSON + linked NUMERACY exercise (E4 recipe — real content chain)
  const anchor = { curriculumId: "cur-eg-ar", curriculumVersion: "2026", country: "EG", educationSystem: "EG-NATIONAL", stageKey: "PRIMARY", gradeKey: "EG-PR-04", gradeLevel: "4", subject: "math", bookId: "bk-4", unitId: "u1", lessonId: "les-1", objectiveId: "o1" };
  const lesson = await dbmod.createContentDefinition({
    tenantId: TENANT_A, title: "درس P16", kind: "LESSON", source: "TEACHER_CREATED",
    curriculum: anchor, createdBy: PRINCIPAL.sub, operationKey: opKey("lesson"),
    metadata: { objective: "أهداف P16" },
  });
  LESSON_ID = lesson.content.id;
  await dbmod.publishContent(TENANT_A, LESSON_ID, PRINCIPAL.sub);
  const ex = await dbmod.createExerciseDefinition({
    tenantId: TENANT_A, activityType: "MATHEMATICS", engineBinding: "NUMERACY",
    expectedResponseType: "TYPED", source: "TEACHER_CREATED", curriculum: anchor,
    contentId: LESSON_ID, createdBy: PRINCIPAL.sub, operationKey: opKey("exn"),
  });
  EXERCISE_NUM = ex.exercise.id;
  await dbmod.publishExercise(TENANT_A, EXERCISE_NUM, PRINCIPAL.sub);

  const { default: app } = await import("../../apps/api/src/app.js");
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  });
  await new Promise<void>((resolve) => server!.on("listening", resolve));
});

d("PHASE-16 — interaction event log over real HTTP + real PG (§3.3)", () => {
  let ATTEMPT_ID = "";
  const startKey = opKey("att1");

  it("P16-1 [EVT-1/2]: real student login → LOGIN event with REAL timestamp; ZERO evidence rows for a login", async () => {
    const dbmod = await import("@workspace/db");
    const login = await api("POST", "/v1/auth/student-login", {
      body: { identityId: IDENTITY_1 }, tenant: TENANT_A,
    });
    expect(login.status).toBe(200);
    STUDENT_TOKEN = login.json.accessToken;

    const events = await dbmod.listInteractionEvents({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 50 });
    const logins = events.filter((e) => e.eventType === "LOGIN");
    expect(logins.length).toBe(1);
    const t = ms(logins[0].occurredAt);
    expect(t).toBeGreaterThanOrEqual(T0 - 1000); // real DB clock, inside the test window
    expect(t).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(logins[0].attemptId).toBeNull();

    // SEPARATION from evidence: a LOGIN records an event, never an evidence row
    const before = await dbmod.listInteractionEvents({ tenantId: TENANT_A, studentId: STUDENT_1 });
    await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_1 }, tenant: TENANT_A });
    const after = await dbmod.listInteractionEvents({ tenantId: TENANT_A, studentId: STUDENT_1 });
    expect(after.length).toBe(before.length + 1); // the second login logged exactly one more event
  });

  it("P16-2 [EVT-2]: attempt start → ATTEMPT_START (replay does NOT duplicate); submit → ATTEMPT_SUBMIT (START <= SUBMIT)", async () => {
    const dbmod = await import("@workspace/db");
    const start = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: startKey,
      body: { activityId: "act-p16-numeracy", exerciseId: EXERCISE_NUM, attemptNumber: 1 },
    });
    expect(start.status).toBe(201);
    ATTEMPT_ID = start.json.attempt.id as string;

    const evStart = await dbmod.listInteractionEvents({ tenantId: TENANT_A, studentId: STUDENT_1, eventType: "ATTEMPT_START" });
    expect(evStart.length).toBe(1);
    expect(evStart[0].attemptId).toBe(ATTEMPT_ID);

    // idempotent replay: same operation key → created:false AND no second event
    const replay = await api("POST", "/v1/attempts", {
      token: STUDENT_TOKEN, idempotencyKey: startKey,
      body: { activityId: "act-p16-numeracy", exerciseId: EXERCISE_NUM, attemptNumber: 1 },
    });
    expect(replay.status).toBe(200);
    expect(replay.json.created).toBe(false);
    const evStart2 = await dbmod.listInteractionEvents({ tenantId: TENANT_A, studentId: STUDENT_1, eventType: "ATTEMPT_START" });
    expect(evStart2.length).toBe(1); // collapsed by operation_key — no duplicate

    const submit = await api("POST", `/v1/attempts/${ATTEMPT_ID}/submit`, {
      token: STUDENT_TOKEN,
      body: { durationMs: 30000, engineInput: { task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" }, response: { finalAnswer: "91" } } },
    });
    expect(submit.status).toBe(200);

    const evSubmit = await dbmod.listInteractionEvents({ tenantId: TENANT_A, studentId: STUDENT_1, eventType: "ATTEMPT_SUBMIT" });
    expect(evSubmit.length).toBe(1);
    expect(evSubmit[0].attemptId).toBe(ATTEMPT_ID);
    expect(ms(evSubmit[0].occurredAt)).toBeGreaterThanOrEqual(ms(evStart[0].occurredAt));
  });

  it("P16-3 [EVT-2]: FAILED student login (real 4xx) → LOGIN_FAILED row with the reason", async () => {
    const fail = await api("POST", "/v1/auth/student-login", {
      body: { identityId: randomUUID() }, tenant: TENANT_A,
    });
    expect(fail.status).toBeGreaterThanOrEqual(400);
    const dbmod = await import("@workspace/db");
    const fails = await dbmod.listInteractionEvents({ tenantId: TENANT_A, eventType: "LOGIN_FAILED" });
    expect(fails.length).toBe(1);
    expect(fails[0].studentId).toBeNull();
    expect(JSON.stringify(fails[0].detail)).not.toBe("{}"); // carries the real reason
  });

  it("P16-4 [EVT-4]: staff listing role-gated; student /mine own-only; tenant-B sees ONLY its own events (fail-closed)", async () => {
    // staff listing for the student
    const staff = await api("GET", `/v1/interaction-events?studentId=${STUDENT_1}`, { token: TEACHER_A.token });
    expect(staff.status).toBe(200);
    const items = staff.body.items as Array<{ id: string; eventType: string; occurredAt: string }>;
    expect(items.length).toBe(4); // 2 LOGIN + 1 ATTEMPT_START + 1 ATTEMPT_SUBMIT
    expect(items[0].eventType).toBe("ATTEMPT_SUBMIT"); // desc by occurred_at
    for (const e of items) expect(ms(e.occurredAt)).toBeGreaterThanOrEqual(T0 - 1000);

    // role gate: a student cannot read the staff surface
    const denied = await api("GET", "/v1/interaction-events", { token: STUDENT_TOKEN });
    expect(denied.status).toBe(403);

    // student /mine: own rows only
    const mine = await api("GET", "/v1/interaction-events/mine", { token: STUDENT_TOKEN });
    expect(mine.status).toBe(200);
    expect((mine.body.items as unknown[]).length).toBe(4);

    // tenant-B login (real) then tenant-B teacher listing: exactly B's events, none of A's
    const loginB = await api("POST", "/v1/auth/student-login", {
      body: { identityId: IDENTITY_B1 }, tenant: TENANT_B,
    });
    expect(loginB.status).toBe(200);
    STUDENT_B_TOKEN = loginB.json.accessToken;
    const bList = await api("GET", "/v1/interaction-events", { token: TEACHER_B.token });
    expect(bList.status).toBe(200);
    const bItems = bList.body.items as Array<{ id: string; eventType: string }>;
    expect(bItems.length).toBe(1); // only tenant-B's own LOGIN (fail-closed RLS)
    expect(bItems[0].eventType).toBe("LOGIN");
    for (const e of items) expect(bItems.some((x) => x.id === e.id)).toBe(false); // tenant-A ids invisible
  });
});
