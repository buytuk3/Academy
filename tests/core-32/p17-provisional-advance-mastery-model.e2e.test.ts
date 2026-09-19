// PHASE-17 scoped matrix condition (p17-only, mirrors the p16 gate): this file
// performs 3 legit auth flows inside one window; the shared default (3/IP)
// 429s the third. auth-sec keeps MAX=3 in its own process.
process.env.AUTH_RATE_LIMIT_MAX = "10";
/**
 * PHASE-17 (PROVISIONAL-ADVANCE-MASTERY-MODEL, governing doc v2.1 §3.4) — REAL
 * E2E gate: real Express app (thin /v1/provisional-advance adapter) + real
 * PostgreSQL (core32_verify, RLS enforced) + real Redis. Nothing mocked.
 * Attempt history rides the REAL PHASE-16 interaction-events hooks already
 * wired into the real /v1/attempts surface (submit → ATTEMPT_SUBMIT with the
 * real measured echo) — the §3.4 engine adds NO new data source (ADR-038).
 *   P17-1: 3 failed stage attempts → exactly ONE provisional advance, budget
 *          consumed, debt PROVISIONAL_PENDING, promotion carried on the log.
 *   P17-2: the provisional stage REPEATS on further failure; a REAL pass
 *          clears it — debt carried, never erased.
 *   P17-3: REAL concurrency — two parallel 3rd-fail records → exactly ONE
 *          provisional advance (the P15-4 DB-level lock).
 *   P17-4: RLS fail-closed — tenant-B sees zero tenant-A progression rows.
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

const opKey = (tag: string) => `p17-${tag}-${randomUUID()}`;

beforeAll(async () => {
  const dbmod = await import("@workspace/db");
  const {
    tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P17-A", slug: `p17a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P17-B", slug: `p17b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P17-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P17-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P17", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب-P17", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);
  await db.insert(studentIdentitiesTable).values([
    { id: IDENTITY_1, operationKey: opKey("id1") },
    { id: IDENTITY_B1, operationKey: opKey("idb") },
  ]);
  await db.insert(studentsTable).values([
    { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "سليم", lastName: "P17", studentCode: `P17-${randomUUID()}` },
    { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "بدر", lastName: "P17B", studentCode: `P17B-${randomUUID()}` },
  ]);
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });
  await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

  const { hashPassword } = await import("@workspace/security");
  const hash = await hashPassword("s3cretpass");
  TEACHER_A.email = `p17-ta-${randomUUID()}@x.test`;
  TEACHER_B.email = `p17-tb-${randomUUID()}@x.test`;
  PRINCIPAL.email = `p17-pr-${randomUUID()}@x.test`;
  await db.insert(usersTable).values([
    { id: PRINCIPAL.sub, tenantId: TENANT_A, firstName: "مديرة", lastName: "P17", email: PRINCIPAL.email, passwordHash: hash, role: "principal" },
    { id: TEACHER_A.sub, tenantId: TENANT_A, firstName: "معلمة", lastName: "P17", email: TEACHER_A.email, passwordHash: hash, role: "teacher" },
    { id: TEACHER_B.sub, tenantId: TENANT_B, firstName: "معلم", lastName: "P17B", email: TEACHER_B.email, passwordHash: hash, role: "teacher" },
  ]);

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
});

d("PHASE-17 — provisional-advance mastery model over real HTTP + real PG (§3.4)", () => {
  const STAGE = "PRIMARY";

  it("P17-1 [§3.4]: 3 real failed attempts → exactly ONE provisional advance, budget=1, debt carried", async () => {
    const rec = () => api("POST", "/v1/provisional-advance/record-attempt", {
      token: TEACHER_A.token,
      body: { studentId: STUDENT_1, stageKey: STAGE, attemptId: `att-p17-${randomUUID()}`, passed: false },
      idempotencyKey: `p17-fail-${randomUUID()}`,
    });
    const r1 = await rec();
    expect(r1.status).toBe(200);
    expect(r1.json.advanced).toBe(false);
    expect(r1.json.progression.status).toBe("ACTIVE");
    expect(r1.json.progression.attemptCount).toBe(1);
    const r2 = await rec();
    expect(r2.status).toBe(200);
    expect(r2.json.progression.attemptCount).toBe(2);
    const r3 = await rec();
    expect(r3.status).toBe(201); // the provisional advance is a REAL creation
    expect(r3.json.advanced).toBe(true);
    expect(r3.json.progression.status).toBe("PROVISIONAL");
    expect(r3.json.progression.provisionalBudgetUsed).toBe(1);
    expect(r3.json.progression.advanceSeq).toBe(1);
    expect(r3.json.progression.debtStatus).toBe("PROVISIONAL_PENDING");
    expect(r3.json.debtCarried).toBe(true);
    // the promotion surfaced on the PHASE-16 interaction stream exactly once
    const dbmod = await import("@workspace/db");
    const rows = await dbmod.listInteractionEvents({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 200 });
    const promos = rows.filter((e: any) => e.detail?.phase === "PHASE-17" && e.detail?.advanced === true);
    expect(promos.length).toBe(1);
  });

  it("P17-2 [§3.4]: the provisional stage REPEATS on failure; a REAL pass clears it — debt carried, never erased", async () => {
    // 4th failure inside the provisional stage → REPEATING, NO budget change, no new advance
    const r4 = await api("POST", "/v1/provisional-advance/record-attempt", {
      token: TEACHER_A.token,
      body: { studentId: STUDENT_1, stageKey: STAGE, attemptId: `att-p17-${randomUUID()}`, passed: false },
      idempotencyKey: `p17-fail-4-${randomUUID()}`,
    });
    expect(r4.status).toBe(200);
    expect(r4.json.advanced).toBe(false);
    expect(r4.json.progression.status).toBe("REPEATING");
    expect(r4.json.progression.provisionalBudgetUsed).toBe(1);
    expect(r4.json.progression.advanceSeq).toBe(1);
    // the REAL pass
    const r5 = await api("POST", "/v1/provisional-advance/record-attempt", {
      token: TEACHER_A.token,
      body: { studentId: STUDENT_1, stageKey: STAGE, attemptId: `att-p17-${randomUUID()}`, passed: true },
      idempotencyKey: `p17-pass-5-${randomUUID()}`,
    });
    expect(r5.status).toBe(200);
    expect(r5.json.advanced).toBe(false);
    expect(r5.json.progression.status).toBe("ADVANCED");
    expect(r5.json.progression.debtStatus).toBe("CLEARED_BY_REAL_PASS_WITH_DEBT_CARRIED");
  });

  it("P17-3 [P15-4 lock]: two PARALLEL 3rd-fail records → exactly ONE provisional advance (real DB-level atomicity)", async () => {
    const S2 = "PRIMARY-P17-3";
    const rec = () => api("POST", "/v1/provisional-advance/record-attempt", {
      token: TEACHER_A.token,
      body: { studentId: STUDENT_1, stageKey: S2, attemptId: `att-p17c-${randomUUID()}`, passed: false },
      idempotencyKey: `p17c-${randomUUID()}`,
    });
    const first = await rec();
    expect(first.status).toBe(200);
    const second = await rec();
    expect(second.json.progression.attemptCount).toBe(2);
    // two simultaneous 3rd-fail records — the same logical attempt-count race
    const [a, b] = await Promise.all([rec(), rec()]);
    for (const r of [a, b]) expect([200, 201]).toContain(r.status);
    const advanced = [a, b].filter((r) => r.json.advanced === true);
    expect(advanced.length).toBe(1); // exactly one winner — no double budget
    const winner = advanced[0];
    expect(winner.json.progression.provisionalBudgetUsed).toBe(1);
    expect(winner.json.progression.advanceSeq).toBe(1);
    expect(winner.json.progression.debtStatus).toBe("PROVISIONAL_PENDING");
  });

  it("P17-4 [RLS fail-closed]: tenant-B sees ZERO tenant-A progression rows; surfaces are role-gated", async () => {
    // student /mine: own rows only
    const mine = await api("GET", "/v1/provisional-advance/mine", { token: STUDENT_TOKEN });
    expect(mine.status).toBe(200);
    expect((mine.body.items as unknown[]).some((r: any) => r.studentId === STUDENT_1)).toBe(true);
    // staff scope-checked read
    const staff = await api("GET", `/v1/provisional-advance/${STUDENT_1}?stageKey=${STAGE}`, { token: TEACHER_A.token });
    expect(staff.status).toBe(200);
    expect(staff.json.studentId).toBe(STUDENT_1);
    // tenant-B teacher cannot see tenant-A progression (existence-hiding via RLS)
    const cross = await api("GET", `/v1/provisional-advance/${STUDENT_1}?stageKey=${STAGE}`, { token: TEACHER_B.token });
    expect(cross.status).toBe(404);
    // a student cannot use the staff surfaces
    const denied = await api("POST", "/v1/provisional-advance/record-attempt", {
      token: STUDENT_TOKEN,
      body: { studentId: STUDENT_1, stageKey: STAGE, attemptId: "x", passed: false },
    });
    expect(denied.status).toBe(403);
  });
});
