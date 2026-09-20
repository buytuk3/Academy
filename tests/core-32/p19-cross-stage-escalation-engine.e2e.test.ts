// PHASE-19 scoped matrix condition (p19-only, mirrors the p17/p18 gates): this
// file performs 3 legit auth flows inside one window; the shared default
// (3/IP) 429s the third. auth-sec keeps MAX=3 in its own process.
process.env.AUTH_RATE_LIMIT_MAX = "10";
/**
 * PHASE-19 (CROSS-STAGE-ESCALATION-ENGINE, governing doc v2.1 §3.6) — REAL
 * E2E gate: real Express app (thin /v1/escalations adapter) + real PostgreSQL
 * (core32_verify, RLS enforced) + real Redis. Nothing mocked.
 * §3.6 triggers are derived ONLY from real attempt outcomes recorded through
 * the REAL PHASE-17 /v1/provisional-advance/record-attempt surface (the §3.4
 * stage_progressions stream — no synthetic seeds, ADR-040).
 *   P19-1: REAL debt (3 fails → provisional advance) + persistent gap (2 more
 *          fails on another stage) → evaluate creates exactly ONE escalation
 *          (HIGH; cross-stage from=PRIMARY to=PRIMARY-B19, debt snapshot
 *          carried); re-evaluation is idempotent (created=0).
 *   P19-2: teacher ack (atomic CAS) → ACKNOWLEDGED; Idempotency-Key replay
 *          converges (no second write); student is 403 on staff surfaces.
 *   P19-3: real-data-only — a clean student yields ZERO escalations; RLS
 *          fail-closed — tenant-B sees zero tenant-A escalation rows.
 *   P19-4: fire-and-forget §3.3 events appear exactly once each (evaluate +
 *          ack; the ack replay collapses on the same operation key).
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

const opKey = (tag: string) => `p19-${tag}-${randomUUID()}`;

beforeAll(async () => {
  const dbmod = await import("@workspace/db");
  const {
    tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P19-A", slug: `p19a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P19-B", slug: `p19b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P19-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P19-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P19", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب-P19", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);
  await db.insert(studentIdentitiesTable).values([
    { id: IDENTITY_1, operationKey: opKey("id1") },
    { id: IDENTITY_B1, operationKey: opKey("idb") },
  ]);
  await db.insert(studentsTable).values([
    { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "سمير", lastName: "P19", studentCode: `P19-${randomUUID()}` },
    { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "بالي", lastName: "P19B", studentCode: `P19B-${randomUUID()}` },
  ]);
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });
  await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

  const { hashPassword } = await import("@workspace/security");
  const hash = await hashPassword("s3cretpass");
  TEACHER_A.email = `p19-ta-${randomUUID()}@x.test`;
  TEACHER_B.email = `p19-tb-${randomUUID()}@x.test`;
  PRINCIPAL.email = `p19-pr-${randomUUID()}@x.test`;
  await db.insert(usersTable).values([
    { id: PRINCIPAL.sub, tenantId: TENANT_A, firstName: "مديرة", lastName: "P19", email: PRINCIPAL.email, passwordHash: hash, role: "principal" },
    { id: TEACHER_A.sub, tenantId: TENANT_A, firstName: "معلمة", lastName: "P19", email: TEACHER_A.email, passwordHash: hash, role: "teacher" },
    { id: TEACHER_B.sub, tenantId: TENANT_B, firstName: "معلم", lastName: "P19B", email: TEACHER_B.email, passwordHash: hash, role: "teacher" },
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

d("PHASE-19 — cross-stage escalation engine over real HTTP + real PG (§3.6)", () => {
  it("P19-1 [§3.6 derivation]: REAL debt + persistent gap → exactly ONE escalation; re-evaluation idempotent", async () => {
    // §3.4 debt: 3 real fails on PRIMARY → provisional advance (debt carried)
    const fail = (stage: string) => api("POST", "/v1/provisional-advance/record-attempt", {
      token: TEACHER_A.token,
      body: { studentId: STUDENT_1, stageKey: stage, attemptId: `att-p19-${randomUUID()}`, passed: false },
      idempotencyKey: `p19-seed-${randomUUID()}`,
    });
    for (let i = 0; i < 3; i++) {
      const r = await fail("PRIMARY");
      expect(r.status).toBe(200);
    }
    const adv = await fail("PRIMARY");
    expect(adv.json.advanced).toBe(true); // provisional advance → debt PROVISIONAL_PENDING
    // persistent gap on ANOTHER stage: 2 more real fails on PRIMARY-B19
    await fail("PRIMARY-B19");
    const g2 = await fail("PRIMARY-B19");
    expect(g2.json.progression.attemptCount).toBe(2);
    // the §3.6 engine — staff evaluates on REAL data
    const ev = await api("POST", `/v1/escalations/evaluate/${STUDENT_1}`, { token: TEACHER_A.token });
    expect(ev.status).toBe(200);
    expect(ev.json.created).toBe(1);
    const items = ev.json.items as Array<{ id: string; fromStage: string; toStage: string; severity: string; debtStatusSnapshot: string; failedAttemptsTotal: number; status: string }>;
    expect(items.length).toBe(1);
    expect(items[0].fromStage).toBe("PRIMARY");
    expect(items[0].toStage).toBe("PRIMARY-B19");
    expect(items[0].severity).toBe("HIGH");
    expect(items[0].debtStatusSnapshot).toBe("PROVISIONAL_PENDING");
    expect(items[0].failedAttemptsTotal).toBe(5);
    expect(items[0].status).toBe("OPEN");
    // idempotent re-evaluation — no duplicates
    const ev2 = await api("POST", `/v1/escalations/evaluate/${STUDENT_1}`, { token: TEACHER_A.token });
    expect(ev2.status).toBe(200);
    expect(ev2.json.created).toBe(0);
    expect((ev2.json.items as unknown[]).length).toBe(1);
  });

  it("P19-2 [§3.6 ack]: atomic acknowledge + replay convergence; student surfaces are 403", async () => {
    const list = await api("GET", "/v1/escalations", { token: TEACHER_A.token });
    expect(list.status).toBe(200);
    const items = list.json.items as Array<{ id: string; status: string }>;
    const esc = items.find((e) => e.status === "OPEN")!;
    // a student cannot evaluate or acknowledge (staff-only surfaces)
    const deniedEval = await api("POST", `/v1/escalations/evaluate/${STUDENT_1}`, { token: STUDENT_TOKEN });
    expect(deniedEval.status).toBe(403);
    const deniedAck = await api("POST", `/v1/escalations/${esc.id}/acknowledge`, {
      token: STUDENT_TOKEN, idempotencyKey: `p19-deny-${randomUUID()}`,
    });
    expect(deniedAck.status).toBe(403);
    // the teacher acknowledges — atomic CAS
    const K = `p19-ack-${randomUUID()}`;
    const ack = await api("POST", `/v1/escalations/${esc.id}/acknowledge`, { token: TEACHER_A.token, idempotencyKey: K });
    expect(ack.status).toBe(200);
    expect(ack.json.changed).toBe(true);
    expect(ack.json.item.status).toBe("ACKNOWLEDGED");
    // replay with the SAME key → converges, no second write
    const ackR = await api("POST", `/v1/escalations/${esc.id}/acknowledge`, { token: TEACHER_A.token, idempotencyKey: K });
    expect(ackR.status).toBe(200);
    expect(ackR.json.changed).toBe(false);
    expect(ackR.json.existed).toBe(true);
  });

  it("P19-3 [real-data-only + RLS fail-closed]: clean student → ZERO escalations; tenant-B sees zero tenant-A rows", async () => {
    // tenant-B student has NO real attempts → evaluation yields nothing
    const evB = await api("POST", `/v1/escalations/evaluate/${STUDENT_B1}`, { token: TEACHER_B.token });
    expect(evB.status).toBe(200);
    expect(evB.json.created).toBe(0);
    expect((evB.json.items as unknown[]).length).toBe(0);
    // tenant-B teacher CANNOT see tenant-A escalations (existence-hiding via RLS)
    const crossList = await api("GET", "/v1/escalations", { token: TEACHER_B.token });
    expect(crossList.status).toBe(200);
    expect((crossList.json.items as unknown[]).length).toBe(0);
    // tenant-A staff still sees exactly its own one row
    const ownList = await api("GET", "/v1/escalations", { token: TEACHER_A.token });
    expect((ownList.json.items as unknown[]).length).toBe(1);
  });

  it("P19-4 [§3.3 fire-and-forget]: escalation + ack surfaced exactly once each on the interaction stream", async () => {
    const dbmod = await import("@workspace/db");
    const events = await dbmod.listInteractionEvents({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 300 });
    const p19 = events.filter((e: any) => e.detail?.phase === "PHASE-19");
    expect(p19.length).toBe(2); // creation alert + ack (replay collapsed)
    expect(p19.every((e: any) => e.eventType === "ERROR")).toBe(true);
  });
});
