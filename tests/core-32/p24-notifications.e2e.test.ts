process.env.AUTH_RATE_LIMIT_MAX = "10";
/**
 * PHASE-24 (NOTIFICATIONS: مركز الإشعارات + التخصيص حسب الدور — §5.2.4) —
 * REAL E2E gate: real Express app (thin /v1 adapter) + real PostgreSQL
 * (core32_verify, RLS enforced) + real Redis. Nothing mocked. Mark-read is
 * an atomic CAS (P15-4 pattern); prefs upsert by UNIQUE(tenant,user) —
 * ADR-045, transports deferred (DEV-024).
 *   P24-1: staff creates a notification for a SAME-tenant user (idempotent
 *          replay → SAME id, no duplicate); cross-tenant recipient → 404
 *          RECIPIENT_NOT_FOUND; student 403 on the staff surface.
 *   P24-2: recipient center — /mine shows the row; unread-count 1 → atomic
 *          CAS mark-read (changed=true) → replay converges → unread-count 0.
 *   P24-3: §5.2.4 تخصيص — per-user channel prefs upsert; another tenant
 *          sees null prefs.
 *   P24-4: tenant-B staff sees ZERO tenant-A notifications; §3.3
 *          fire-and-forget — exactly one event per unique key (create +
 *          read; replays collapsed).
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

const opKey = (tag: string) => `p24-${tag}-${randomUUID()}`;

beforeAll(async () => {
  const dbmod = await import("@workspace/db");
  const {
    tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P24-A", slug: `p24a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P24-B", slug: `p24b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P24-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P24-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P24", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب-P24", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);
  await db.insert(studentIdentitiesTable).values([
    { id: IDENTITY_1, operationKey: opKey("id1") },
    { id: IDENTITY_B1, operationKey: opKey("idb") },
  ]);
  await db.insert(studentsTable).values([
    { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "غسق", lastName: "P24", studentCode: `P24-${randomUUID()}` },
    { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "بدر", lastName: "P24B", studentCode: `P24B-${randomUUID()}` },
  ]);
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });
  await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

  const { hashPassword } = await import("@workspace/security");
  const hash = await hashPassword("s3cretpass");
  TEACHER_A.email = `p24-ta-${randomUUID()}@x.test`;
  TEACHER_B.email = `p24-tb-${randomUUID()}@x.test`;
  PRINCIPAL.email = `p24-pr-${randomUUID()}@x.test`;
  await db.insert(usersTable).values([
    { id: PRINCIPAL.sub, tenantId: TENANT_A, firstName: "مديرة", lastName: "P24", email: PRINCIPAL.email, passwordHash: hash, role: "principal" },
    { id: TEACHER_A.sub, tenantId: TENANT_A, firstName: "معلمة", lastName: "P24", email: TEACHER_A.email, passwordHash: hash, role: "teacher" },
    { id: TEACHER_B.sub, tenantId: TENANT_B, firstName: "معلم", lastName: "P24B", email: TEACHER_B.email, passwordHash: hash, role: "teacher" },
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
  const lp = await api("POST", "/v1/auth/login", { body: { email: PRINCIPAL.email, password: "s3cretpass" } });
  expect(lp.status).toBe(200);
  PRINCIPAL.token = lp.body.accessToken;
  const ls = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_1 }, tenant: TENANT_A });
  expect(ls.status).toBe(200);
  STUDENT_TOKEN = ls.body.accessToken;
});

d("PHASE-24 — notifications over real HTTP + real PG (§5.2.4)", () => {
  it("P24-1: staff creates for a SAME-tenant user (replay → SAME id); cross-tenant recipient → 404; student 403", async () => {
    const K = `p24-n1-${randomUUID()}`;
    const n1 = await api("POST", "/v1/notifications", {
      token: TEACHER_A.token, idempotencyKey: K,
      body: {
        recipientId: PRINCIPAL.sub, recipientRole: "principal", type: "ACADEMIC",
        title: "تقرير التقدم الأسبوعي جاهز", body: "راجع لوحة التقدم الأسبوعي للصف 4/أ",
        ref: { classId: CLASS_A },
      },
    });
    expect(n1.status).toBe(201);
    expect(n1.body.existed).toBe(false);
    expect(n1.body.notification.type).toBe("ACADEMIC");
    expect(n1.body.notification.readAt).toBeNull();
    // replay with the SAME key → the SAME id, no duplicate row
    const n1r = await api("POST", "/v1/notifications", {
      token: TEACHER_A.token, idempotencyKey: K,
      body: {
        recipientId: PRINCIPAL.sub, recipientRole: "principal", type: "ACADEMIC",
        title: "تقرير التقدم الأسبوعي جاهز", body: "راجع لوحة التقدم الأسبوعي للصف 4/أ",
        ref: { classId: CLASS_A },
      },
    });
    expect(n1r.status).toBe(200);
    expect(n1r.body.existed).toBe(true);
    expect(n1r.body.notification.id).toBe(n1.body.notification.id);
    // fail-closed recipient validation: a tenant-A user cannot target tenant-B
    const cross = await api("POST", "/v1/notifications", {
      token: TEACHER_A.token, idempotencyKey: `p24-n2-${randomUUID()}`,
      body: { recipientId: TEACHER_B.sub, recipientRole: "teacher", title: "x", body: "y" },
    });
    expect(cross.status).toBe(404);
    expect(cross.body.error.code).toBe("RECIPIENT_NOT_FOUND");
    // students cannot use the staff creation surface (role-gated)
    const denied = await api("POST", "/v1/notifications", {
      token: STUDENT_TOKEN, idempotencyKey: `p24-n3-${randomUUID()}`,
      body: { recipientId: PRINCIPAL.sub, recipientRole: "principal", title: "x", body: "y" },
    });
    expect(denied.status).toBe(403);
  });

  it("P24-2: recipient center — /mine, unread-count 1 → atomic CAS mark-read → replay converges → 0", async () => {
    const mine = await api("GET", "/v1/notifications/mine", { token: PRINCIPAL.token });
    expect(mine.status).toBe(200);
    expect((mine.body.items as unknown[]).length).toBe(1);
    const before = await api("GET", "/v1/notifications/unread-count", { token: PRINCIPAL.token });
    expect(before.status).toBe(200);
    expect(before.body.unread).toBe(1);
    const NID = mine.body.items[0].id as string;
    const KR = `p24-r1-${randomUUID()}`;
    const r1 = await api("POST", `/v1/notifications/${NID}/read`, { token: PRINCIPAL.token, idempotencyKey: KR });
    expect(r1.status).toBe(200);
    expect(r1.body.changed).toBe(true);
    expect(r1.body.notification.readAt).toBeTruthy();
    // replay with the SAME key → converges (changed=false, existed=true)
    const r1r = await api("POST", `/v1/notifications/${NID}/read`, { token: PRINCIPAL.token, idempotencyKey: KR });
    expect(r1r.status).toBe(200);
    expect(r1r.body.changed).toBe(false);
    expect(r1r.body.existed).toBe(true);
    // the unread counter dropped to zero — the CAS actually committed
    const after = await api("GET", "/v1/notifications/unread-count", { token: PRINCIPAL.token });
    expect(after.status).toBe(200);
    expect(after.body.unread).toBe(0);
    // a non-recipient staff member cannot read someone else's notification
    const other = await api("POST", `/v1/notifications/${NID}/read`, { token: TEACHER_A.token, idempotencyKey: `p24-r2-${randomUUID()}` });
    expect(other.status).toBe(404);
  });

  it("P24-3 [§5.2.4 تخصيص]: per-user channel prefs upsert (idempotent); another tenant sees null", async () => {
    const p1 = await api("PUT", "/v1/notifications/prefs", {
      token: PRINCIPAL.token, body: { channels: ["IN_APP", "EMAIL"], muted: false },
    });
    expect(p1.status).toBe(200);
    expect(p1.body.prefs.prefs.channels).toEqual(["IN_APP", "EMAIL"]);
    // upsert again → updated (naturally idempotent by UNIQUE(tenant,user))
    const p2 = await api("PUT", "/v1/notifications/prefs", {
      token: PRINCIPAL.token, body: { channels: ["IN_APP"], muted: true },
    });
    expect(p2.status).toBe(200);
    expect(p2.body.prefs.prefs.muted).toBe(true);
    const g = await api("GET", "/v1/notifications/prefs", { token: PRINCIPAL.token });
    expect(g.status).toBe(200);
    expect(g.body.prefs.prefs.channels).toEqual(["IN_APP"]);
    // tenant-B user has no tenant-A prefs row (RLS fail-closed)
    const gb = await api("GET", "/v1/notifications/prefs", { token: TEACHER_B.token });
    expect(gb.status).toBe(200);
    expect(gb.body.prefs).toBeNull();
  });

  it("P24-4: tenant-B sees ZERO tenant-A rows; §3.3 fire-and-forget — one event per unique key", async () => {
    // tenant-B staff: zero tenant-A notifications (RLS fail-closed)
    const cross = await api("GET", "/v1/notifications", { token: TEACHER_B.token });
    expect(cross.status).toBe(200);
    expect((cross.body.items as unknown[]).length).toBe(0);
    // staff tenant-wide list sees exactly the one tenant-A notification
    const list = await api("GET", "/v1/notifications", { token: TEACHER_A.token });
    expect(list.status).toBe(200);
    expect((list.body.items as unknown[]).length).toBe(1);
    // §3.3: exactly one event per unique key (create + mark-read; replays collapsed)
    const events = await api("GET", "/v1/interaction-events", { token: TEACHER_A.token });
    expect(events.status).toBe(200);
    const p24 = (events.body.items as any[]).filter((e) => e.detail?.phase === "PHASE-24");
    expect(p24.length).toBe(2);
    expect(p24.every((e) => e.eventType === "ATTEMPT_SUBMIT")).toBe(true);
  });
});
