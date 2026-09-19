// PHASE-18 scoped matrix condition (p18-only, mirrors the p17 gate): this file
// performs 3 legit auth flows inside one window; the shared default (3/IP)
// 429s the third. auth-sec keeps MAX=3 in its own process.
process.env.AUTH_RATE_LIMIT_MAX = "10";
/**
 * PHASE-18 (SPACED-REVIEW-ENGINE, governing doc v2.1 §3.5) — REAL E2E gate:
 * real Express app (thin /v1/spaced-review adapter) + real PostgreSQL
 * (core32_verify, RLS enforced) + real Redis. Nothing mocked.
 * Review items are derived ONLY from real attempt outcomes recorded through
 * the REAL PHASE-17 /v1/provisional-advance/record-attempt surface (the §3.4
 * stage_progressions stream — no synthetic seeds, ADR-039).
 *   P18-1: real failed stage attempts → staff refresh → box-1 DUE items;
 *          student sees them on /mine/due; idempotent refresh replays.
 *   P18-2: the fixed ladder — pass → box2 (3d), pass → box3 (7d); ledger
 *          rows recorded; Idempotency-Key replay converges (no second write).
 *   P18-3: a lapse resets to box 1 (immediately due again).
 *   P18-4: RLS fail-closed — tenant-B sees zero tenant-A rows; role gates;
 *          fire-and-forget completion events appear exactly once each.
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

const opKey = (tag: string) => `p18-${tag}-${randomUUID()}`;

beforeAll(async () => {
  const dbmod = await import("@workspace/db");
  const {
    tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P18-A", slug: `p18a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P18-B", slug: `p18b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P18-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P18-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P18", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب-P18", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);
  await db.insert(studentIdentitiesTable).values([
    { id: IDENTITY_1, operationKey: opKey("id1") },
    { id: IDENTITY_B1, operationKey: opKey("idb") },
  ]);
  await db.insert(studentsTable).values([
    { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "سالي", lastName: "P18", studentCode: `P18-${randomUUID()}` },
    { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "باسل", lastName: "P18B", studentCode: `P18B-${randomUUID()}` },
  ]);
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });
  await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

  const { hashPassword } = await import("@workspace/security");
  const hash = await hashPassword("s3cretpass");
  TEACHER_A.email = `p18-ta-${randomUUID()}@x.test`;
  TEACHER_B.email = `p18-tb-${randomUUID()}@x.test`;
  PRINCIPAL.email = `p18-pr-${randomUUID()}@x.test`;
  await db.insert(usersTable).values([
    { id: PRINCIPAL.sub, tenantId: TENANT_A, firstName: "مديرة", lastName: "P18", email: PRINCIPAL.email, passwordHash: hash, role: "principal" },
    { id: TEACHER_A.sub, tenantId: TENANT_A, firstName: "معلمة", lastName: "P18", email: TEACHER_A.email, passwordHash: hash, role: "teacher" },
    { id: TEACHER_B.sub, tenantId: TENANT_B, firstName: "معلم", lastName: "P18B", email: TEACHER_B.email, passwordHash: hash, role: "teacher" },
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

d("PHASE-18 — spaced-review engine over real HTTP + real PG (§3.5)", () => {
  it("P18-1 [§3.5 derivation]: review items come ONLY from real stage attempts (staff refresh → box-1 DUE)", async () => {
    // real failed attempts on TWO stages through the REAL PHASE-17 surface
    const fail = (stage: string) => api("POST", "/v1/provisional-advance/record-attempt", {
      token: TEACHER_A.token,
      body: { studentId: STUDENT_1, stageKey: stage, attemptId: `att-p18-${randomUUID()}`, passed: false },
      idempotencyKey: `p18-seed-${randomUUID()}`,
    });
    for (const stage of ["PRIMARY", "PRIMARY-P18-B"]) {
      for (let i = 0; i < 2; i++) {
        const r = await fail(stage);
        expect(r.status).toBe(200);
      }
    }
    // staff refresh → real derivation
    const ref = await api("POST", `/v1/spaced-review/refresh/${STUDENT_1}`, { token: TEACHER_A.token });
    expect(ref.status).toBe(200);
    expect(ref.json.created).toBe(2); // exactly one item per touched stage
    const items = ref.json.items as Array<{ id: string; stageKey: string; box: number; status: string; intervalDays: number }>;
    expect(items.length).toBe(2);
    for (const it of items) {
      expect(it.box).toBe(1);
      expect(it.intervalDays).toBe(1);
      expect(it.status).toBe("DUE");
    }
    // idempotent replay: no duplicates, no re-creation
    const ref2 = await api("POST", `/v1/spaced-review/refresh/${STUDENT_1}`, { token: TEACHER_A.token });
    expect(ref2.status).toBe(200);
    expect(ref2.json.created).toBe(0);
    expect((ref2.json.items as unknown[]).length).toBe(2);
    // the student sees the due queue (before any completion)
    const mine = await api("GET", "/v1/spaced-review/mine/due", { token: STUDENT_TOKEN });
    expect(mine.status).toBe(200);
    expect((mine.body.items as unknown[]).length).toBe(2);
  });

  it("P18-2 [§3.5 ladder]: pass → box2 (3d) → box3 (7d); ledger rows; Idempotency-Key replay converges", async () => {
    const ref = await api("POST", `/v1/spaced-review/refresh/${STUDENT_1}`, { token: TEACHER_A.token });
    const items = ref.json.items as Array<{ id: string; stageKey: string }>;
    const item = items.find((i) => i.stageKey === "PRIMARY")!;
    // 1st pass → box 2, interval 3 (SAME key reused for the replay below)
    const K1 = `p18-c1-${randomUUID()}`;
    const c1 = await api("POST", "/v1/spaced-review/mine/complete", {
      token: STUDENT_TOKEN,
      body: { itemId: item.id, passed: true },
      idempotencyKey: K1,
    });
    expect(c1.status).toBe(200);
    expect(c1.json.item.box).toBe(2);
    expect(c1.json.item.intervalDays).toBe(3);
    expect(c1.json.item.status).toBe("SNOOZED");
    expect(c1.json.ledger.boxFrom).toBe(1);
    expect(c1.json.ledger.boxTo).toBe(2);
    expect(c1.json.ledger.existed).toBe(false);
    // replay with the SAME key → converge, no second ledger write
    const c1r = await api("POST", "/v1/spaced-review/mine/complete", {
      token: STUDENT_TOKEN,
      body: { itemId: item.id, passed: true },
      idempotencyKey: K1,
    });
    expect(c1r.status).toBe(200);
    expect(c1r.json.ledger.existed).toBe(true);
    expect(c1r.json.item.box).toBe(2); // unchanged
    // 2nd pass (self-paced early revision is allowed) → box 3, interval 7
    const c2 = await api("POST", "/v1/spaced-review/mine/complete", {
      token: STUDENT_TOKEN,
      body: { itemId: item.id, passed: true },
      idempotencyKey: `p18-c2-${randomUUID()}`,
    });
    expect(c2.status).toBe(200);
    expect(c2.json.item.box).toBe(3);
    expect(c2.json.item.intervalDays).toBe(7);
    // the ladder is the fixed §3.5 policy
    const dbmod = await import("@workspace/db");
    expect((dbmod as any).SPACED_INTERVAL_DAYS).toEqual([1, 3, 7, 14, 30]);
  });

  it("P18-3 [§3.5 lapse]: a failed recall resets the item to box 1 (immediately due again)", async () => {
    const ref = await api("POST", `/v1/spaced-review/refresh/${STUDENT_1}`, { token: TEACHER_A.token });
    const items = ref.json.items as Array<{ id: string; stageKey: string }>;
    const item = items.find((i) => i.stageKey === "PRIMARY")!;
    const c3 = await api("POST", "/v1/spaced-review/mine/complete", {
      token: STUDENT_TOKEN,
      body: { itemId: item.id, passed: false },
      idempotencyKey: `p18-c3-${randomUUID()}`,
    });
    expect(c3.status).toBe(200);
    expect(c3.json.item.box).toBe(1);
    expect(c3.json.item.intervalDays).toBe(1);
    expect(c3.json.item.status).toBe("DUE");
    expect(c3.json.ledger.boxFrom).toBe(3);
    expect(c3.json.ledger.boxTo).toBe(1);
    // the lapsed item is due again for the student (lapse → immediate re-study)
    const mine = await api("GET", "/v1/spaced-review/mine/due", { token: STUDENT_TOKEN });
    expect(mine.status).toBe(200);
    expect((mine.body.items as Array<{ id: string }>).some((i) => i.id === item.id)).toBe(true);
  });

  it("P18-4 [RLS fail-closed + role gates + fire-and-forget §3.3 events]", async () => {
    // tenant-B staff cannot see tenant-A review data (existence-hiding via RLS)
    const crossDue = await api("GET", `/v1/spaced-review/${STUDENT_1}/due`, { token: TEACHER_B.token });
    expect(crossDue.status).toBe(200);
    expect((crossDue.body.items as unknown[]).length).toBe(0); // zero tenant-A rows
    // a student cannot use the staff refresh surface
    const denied = await api("POST", `/v1/spaced-review/refresh/${STUDENT_1}`, { token: STUDENT_TOKEN });
    expect(denied.status).toBe(403);
    // completions surfaced on the interaction stream (fire-and-forget §3.3):
    // c1 + c2 + c3 → exactly 3 rows; the c1 REPLAY collapses on the same
    // operation key (idempotent — no second event).
    const dbmod = await import("@workspace/db");
    const events = await dbmod.listInteractionEvents({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 300 });
    const p18 = events.filter((e: any) => e.detail?.phase === "PHASE-18");
    expect(p18.length).toBe(3);
    for (const e of p18) expect(e.eventType).toBe("ATTEMPT_SUBMIT");
  });
});
