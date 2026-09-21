process.env.AUTH_RATE_LIMIT_MAX = "10";
/**
 * PHASE-27 (STUCK-POINT-DETECTION-AND-MANAGER-ALERT-ENGINE — §3.10) — REAL
 * E2E gate: real Express app (thin /v1 adapter) + real PostgreSQL
 * (core32_verify, RLS enforced) + real Redis. Nothing mocked. The detector is
 * a hook on the SINGLE interaction_events write path (0011 classes
 * LOGIN_FAILED/ERROR — CHECK untouched); the alert derives EVERYTHING from the
 * real event row; delivery rides the PHASE-24 notifications (0019) in the same
 * transaction; dedup = UNIQUE(tenant, source_event_id) — ADR-048.
 *   P27-1: real failed student login → IMMEDIATE dual alert (principal+admin)
 *          with the mandatory payload; evaluate replay converges (no double
 *          delivery).
 *   P27-2: real insufficient-balance redemption → 409 → ERROR event → PAYMENT
 *          alert; sourceEventId links to a REAL interaction event.
 *   P27-3: fail-closed — student 403; tenant-B zero rows; unknown event 404.
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
const PRINCIPAL_A = { sub: randomUUID(), email: "", token: "" };
const ADMIN_A = { sub: randomUUID(), email: "", token: "" };
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

const opKey = (tag: string) => `p27-${tag}-${randomUUID()}`;

beforeAll(async () => {
  const dbmod = await import("@workspace/db");
  const {
    tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable,
    walletAccountsTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P27-A", slug: `p27a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P27-B", slug: `p27b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P27-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P27-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P27", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب-P27", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);
  await db.insert(studentIdentitiesTable).values([
    { id: IDENTITY_1, operationKey: opKey("id1") },
    { id: IDENTITY_B1, operationKey: opKey("idb") },
  ]);
  await db.insert(studentsTable).values([
    { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "سليم", lastName: "P27", studentCode: `P27-${randomUUID()}` },
    { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "بسام", lastName: "P27B", studentCode: `P27B-${randomUUID()}` },
  ]);
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });
  await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

  // a SMALL real wallet balance → the insufficient-balance redemption fails FOR REAL
  await db.insert(walletAccountsTable).values([
    { id: randomUUID(), tenantId: TENANT_A, studentId: STUDENT_1, balance: 50 },
  ]);

  const { hashPassword } = await import("@workspace/security");
  const hash = await hashPassword("s3cretpass");
  TEACHER_A.email = `p27-ta-${randomUUID()}@x.test`;
  TEACHER_B.email = `p27-tb-${randomUUID()}@x.test`;
  PRINCIPAL_A.email = `p27-pr-${randomUUID()}@x.test`;
  ADMIN_A.email = `p27-ad-${randomUUID()}@x.test`;
  await db.insert(usersTable).values([
    { id: PRINCIPAL_A.sub, tenantId: TENANT_A, firstName: "مديرة", lastName: "P27", email: PRINCIPAL_A.email, passwordHash: hash, role: "principal" },
    { id: ADMIN_A.sub, tenantId: TENANT_A, firstName: "مدير", lastName: "النظام-P27", email: ADMIN_A.email, passwordHash: hash, role: "admin" },
    { id: TEACHER_A.sub, tenantId: TENANT_A, firstName: "معلمة", lastName: "P27", email: TEACHER_A.email, passwordHash: hash, role: "teacher" },
    { id: TEACHER_B.sub, tenantId: TENANT_B, firstName: "معلم", lastName: "P27B", email: TEACHER_B.email, passwordHash: hash, role: "teacher" },
  ]);

  const { default: app } = await import("../../apps/api/src/app.js");
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  });
  await new Promise<void>((resolve) => server!.on("listening", resolve));
  for (const u of [TEACHER_A, TEACHER_B, PRINCIPAL_A, ADMIN_A]) {
    const lr = await api("POST", "/v1/auth/login", { body: { email: u.email, password: "s3cretpass" } });
    expect(lr.status).toBe(200);
    u.token = lr.body.accessToken;
  }
  const ls = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_1 }, tenant: TENANT_A });
  expect(ls.status).toBe(200);
  STUDENT_TOKEN = ls.body.accessToken;
});

d("PHASE-27 — stuck-point alerts over real HTTP + real PG (§3.10)", () => {
  it("P27-1: real failed login → IMMEDIATE dual alert with mandatory payload; replay converges (no double delivery)", async () => {
    // a REAL failure: an identity that belongs to tenant-B attempted on tenant-A
    const fail = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_B1 }, tenant: TENANT_A });
    expect(fail.status).toBeGreaterThanOrEqual(400);
    // IMMEDIATE: the alert is already visible right after the 4xx (no threshold)
    const list = await api("GET", "/v1/stuck-points", { token: TEACHER_A.token });
    expect(list.status).toBe(200);
    const items = list.body.items as any[];
    expect(items.length).toBe(1);
    const alert = items[0];
    expect(alert.operationType).toBe("LOGIN");
    expect(alert.actorId).toBe(IDENTITY_B1);
    expect(alert.actorRole).toBe("student");
    expect(alert.occurredAt).toBeTruthy();
    expect(alert.sourceEventId).toBeTruthy();
    // RECIPIENTS ALWAYS BOTH — recorded on the alert row
    expect(alert.notifiedPrincipals as string[]).toContain(PRINCIPAL_A.sub);
    expect(alert.notifiedAdmins as string[]).toContain(ADMIN_A.sub);
    // the mandatory payload arrives through the EXISTING PHASE-24 centers
    const pMine = await api("GET", "/v1/notifications/mine", { token: PRINCIPAL_A.token });
    expect(pMine.status).toBe(200);
    const pAlerts = (pMine.body.items as any[]).filter((n) => n.type === "SYSTEM");
    expect(pAlerts.length).toBe(1);
    expect(pAlerts[0].ref.sourceEventId).toBe(alert.sourceEventId);
    expect(pAlerts[0].ref.operationType).toBe("LOGIN");
    expect(pAlerts[0].body).toContain(IDENTITY_B1);
    expect(pAlerts[0].body).toContain(alert.occurredAt as string);
    const aMine = await api("GET", "/v1/notifications/mine", { token: ADMIN_A.token });
    expect(aMine.status).toBe(200);
    const aAlerts = (aMine.body.items as any[]).filter((n) => n.type === "SYSTEM");
    expect(aAlerts.length).toBe(1);
    expect(aAlerts[0].ref.sourceEventId).toBe(alert.sourceEventId);
    // idempotent replay of the SAME source event → NO double delivery
    const replay = await api("POST", "/v1/stuck-points/evaluate", {
      token: TEACHER_A.token, body: { sourceEventId: alert.sourceEventId },
    });
    expect(replay.status).toBe(200);
    expect(replay.body.existed).toBe(true);
    expect((replay.body.notified as unknown[]).length).toBe(0);
    const pMine2 = await api("GET", "/v1/notifications/mine", { token: PRINCIPAL_A.token });
    expect(((pMine2.body.items as any[]).filter((n) => n.type === "SYSTEM")).length).toBe(1);
  });

  it("P27-2: real insufficient-balance redemption → 409 → ERROR event → PAYMENT alert with a REAL source-event link", async () => {
    const over = await api("POST", "/v1/points/redeem", {
      token: STUDENT_TOKEN, idempotencyKey: `p27-r1-${randomUUID()}`,
      body: { item: "مكافأة كبيرة", cost: 99999 },
    });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("INSUFFICIENT_BALANCE");
    // IMMEDIATE: the PAYMENT alert is already there after the 409
    const list = await api("GET", "/v1/stuck-points", { token: TEACHER_A.token });
    expect(list.status).toBe(200);
    const items = list.body.items as any[];
    expect(items.length).toBe(2); // LOGIN + PAYMENT
    const pay = items.find((a) => a.operationType === "PAYMENT");
    expect(pay).toBeTruthy();
    expect(pay.failureReason).toBe("INSUFFICIENT_BALANCE");
    expect(pay.actorId).toBeTruthy();
    // REAL LINKAGE: the source event id EXISTS in the staff interaction-events listing
    const events = await api("GET", "/v1/interaction-events", { token: TEACHER_A.token });
    expect(events.status).toBe(200);
    expect((events.body.items as any[]).some((e) => e.id === pay.sourceEventId)).toBe(true);
    // both managers got the second alert too
    const pMine = await api("GET", "/v1/notifications/mine", { token: PRINCIPAL_A.token });
    expect(((pMine.body.items as any[]).filter((n) => n.type === "SYSTEM")).length).toBe(2);
    const aMine = await api("GET", "/v1/notifications/mine", { token: ADMIN_A.token });
    expect(((aMine.body.items as any[]).filter((n) => n.type === "SYSTEM")).length).toBe(2);
  });

  it("P27-3: fail-closed — student 403; tenant-B zero rows; unknown event 404 (no fabricated alerts)", async () => {
    const denied = await api("GET", "/v1/stuck-points", { token: STUDENT_TOKEN });
    expect(denied.status).toBe(403);
    const cross = await api("GET", "/v1/stuck-points", { token: TEACHER_B.token });
    expect(cross.status).toBe(200);
    expect((cross.body.items as unknown[]).length).toBe(0);
    const ghost = await api("POST", "/v1/stuck-points/evaluate", {
      token: TEACHER_A.token, body: { sourceEventId: randomUUID() },
    });
    expect(ghost.status).toBe(404);
    expect(ghost.body.error.code).toBe("STUCK_EVENT_NOT_FOUND");
  });
});
