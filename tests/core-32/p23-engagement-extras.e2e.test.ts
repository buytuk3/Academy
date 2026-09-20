process.env.AUTH_RATE_LIMIT_MAX = "10";
/**
 * PHASE-23 (STUDENT-ENGAGEMENT-EXTRAS: صرف النقاط / الملاحظات / الدعم) —
 * REAL E2E gate: real Express app (thin /v1 adapter) + real PostgreSQL
 * (core32_verify, RLS enforced) + real Redis. Nothing mocked. The point
 * balance rides the EXISTING wallet_accounts (0009); the redemption debits
 * it ATOMICALLY (P15-4 pattern) — ADR-044.
 *   P23-1: real redeem → exact atomic debit (100-30=70); replay with the
 *          SAME key → the SAME id, NO second debit (balance stays 70);
 *          over-redemption (200 > 70) → 409 INSUFFICIENT_BALANCE, balance
 *          unchanged; staff surfaces are 403 for students.
 *   P23-2: notes — staff adds a note for a tenant student (idempotent
 *          replay); staff list sees exactly one row.
 *   P23-3: support — the student opens a ticket; staff resolves it (atomic
 *          CAS; replay converges); tenant-B staff sees zero tenant-A rows.
 *   P23-4: fire-and-forget §3.3 — exactly one event per unique key (4 total:
 *          redeem + note + ticket + resolve; replays collapsed).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
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

const opKey = (tag: string) => `p23-${tag}-${randomUUID()}`;

beforeAll(async () => {
  const dbmod = await import("@workspace/db");
  const {
    tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable,
    walletAccountsTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P23-A", slug: `p23a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P23-B", slug: `p23b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P23-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P23-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P23", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب-P23", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);
  await db.insert(studentIdentitiesTable).values([
    { id: IDENTITY_1, operationKey: opKey("id1") },
    { id: IDENTITY_B1, operationKey: opKey("idb") },
  ]);
  await db.insert(studentsTable).values([
    { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "تامر", lastName: "P23", studentCode: `P23-${randomUUID()}` },
    { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "بصام", lastName: "P23B", studentCode: `P23B-${randomUUID()}` },
  ]);
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });
  await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

  // REAL wallet balance (the EXISTING 0009 account row — the canonical balance
  // of record; id has NO default in the schema, so it is minted here)
  await db.insert(walletAccountsTable).values([
    { id: randomUUID(), tenantId: TENANT_A, studentId: STUDENT_1, balance: 100 },
  ]);

  const { hashPassword } = await import("@workspace/security");
  const hash = await hashPassword("s3cretpass");
  TEACHER_A.email = `p23-ta-${randomUUID()}@x.test`;
  TEACHER_B.email = `p23-tb-${randomUUID()}@x.test`;
  PRINCIPAL.email = `p23-pr-${randomUUID()}@x.test`;
  await db.insert(usersTable).values([
    { id: PRINCIPAL.sub, tenantId: TENANT_A, firstName: "مديرة", lastName: "P23", email: PRINCIPAL.email, passwordHash: hash, role: "principal" },
    { id: TEACHER_A.sub, tenantId: TENANT_A, firstName: "معلمة", lastName: "P23", email: TEACHER_A.email, passwordHash: hash, role: "teacher" },
    { id: TEACHER_B.sub, tenantId: TENANT_B, firstName: "معلم", lastName: "P23B", email: TEACHER_B.email, passwordHash: hash, role: "teacher" },
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

d("PHASE-23 — engagement extras over real HTTP + real PG (§5.2.3/§3.10)", () => {
  it("P23-1 [صرف النقاط]: atomic debit (100-30=70); replay → SAME id NO second debit; over-redemption → 409", async () => {
    const K = `p23-r1-${randomUUID()}`;
    const r1 = await api("POST", "/v1/points/redeem", {
      token: STUDENT_TOKEN, idempotencyKey: K,
      body: { item: "قصة تفاعلية", cost: 30 },
    });
    expect(r1.status).toBe(201);
    expect(r1.body.existed).toBe(false);
    expect(r1.body.redemption.cost).toBe(30);
    expect(r1.body.balance).toBe(70); // exact atomic debit
    // replay with the SAME key → the SAME id, NO second debit
    const r1r = await api("POST", "/v1/points/redeem", {
      token: STUDENT_TOKEN, idempotencyKey: K,
      body: { item: "قصة تفاعلية", cost: 30 },
    });
    expect(r1r.status).toBe(200);
    expect(r1r.body.existed).toBe(true);
    expect(r1r.body.redemption.id).toBe(r1.body.redemption.id);
    expect(r1r.body.balance).toBe(70); // unchanged — the replay did NOT debit again
    // over-redemption → 409, balance untouched
    const over = await api("POST", "/v1/points/redeem", {
      token: STUDENT_TOKEN, idempotencyKey: `p23-r2-${randomUUID()}`,
      body: { item: "رهان كبير", cost: 200 },
    });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("INSUFFICIENT_BALANCE");
    // the balance is STILL 70 (the failed redemption rolled back cleanly)
    const { walletAccountsTable } = await import("../../packages/database/src/schema/index.js");
    const { db } = await import("../../packages/database/src/client.js");
    const [acct] = await db.select().from(walletAccountsTable).where(
      and(
        eq(walletAccountsTable.tenantId, TENANT_A),
        eq(walletAccountsTable.studentId, STUDENT_1),
      ),
    );
    expect(acct.balance).toBe(70);
    // redemption history: exactly one row
    const hist = await api("GET", "/v1/points/redemptions/mine", { token: STUDENT_TOKEN });
    expect(hist.status).toBe(200);
    expect((hist.body.items as unknown[]).length).toBe(1);
    // staff cannot use the student redemption surface (role-gated)
    const denied = await api("POST", "/v1/points/redeem", {
      token: TEACHER_A.token, idempotencyKey: `p23-deny-${randomUUID()}`,
      body: { item: "x", cost: 1 },
    });
    expect(denied.status).toBe(403);
  });

  it("P23-2 [الملاحظات]: staff adds a note (idempotent replay); staff list sees exactly one row", async () => {
    const K = `p23-n1-${randomUUID()}`;
    const n1 = await api("POST", "/v1/notes", {
      token: TEACHER_A.token, idempotencyKey: K,
      body: { studentId: STUDENT_1, category: "ACADEMIC", body: "تحسّن ملحوظ في الرياضيات هذا الأسبوع" },
    });
    expect(n1.status).toBe(201);
    expect(n1.body.existed).toBe(false);
    expect(n1.body.note.category).toBe("ACADEMIC");
    const n1r = await api("POST", "/v1/notes", {
      token: TEACHER_A.token, idempotencyKey: K,
      body: { studentId: STUDENT_1, category: "ACADEMIC", body: "تحسّن ملحوظ في الرياضيات هذا الأسبوع" },
    });
    expect(n1r.status).toBe(200);
    expect(n1r.body.existed).toBe(true);
    expect(n1r.body.note.id).toBe(n1.body.note.id);
    const list = await api("GET", `/v1/notes?studentId=${STUDENT_1}`, { token: TEACHER_A.token });
    expect(list.status).toBe(200);
    expect((list.body.items as unknown[]).length).toBe(1);
  });

  it("P23-3 [الدعم]: the student opens a ticket; staff resolves (atomic CAS; replay converges); tenant-B sees zero", async () => {
    const t1 = await api("POST", "/v1/support/tickets", {
      token: STUDENT_TOKEN, idempotencyKey: `p23-t1-${randomUUID()}`,
      body: { subject: "مشكلة في تشغيل الدرس", body: "الفيديو لا يفتح على الجهاز اللوحي" },
    });
    expect(t1.status).toBe(201);
    expect(t1.body.ticket.status).toBe("OPEN");
    // staff list (tenant-scoped)
    const list = await api("GET", "/v1/support/tickets", { token: TEACHER_A.token });
    expect(list.status).toBe(200);
    expect((list.body.items as unknown[]).length).toBe(1);
    // tenant-B staff: ZERO tenant-A tickets (RLS fail-closed)
    const cross = await api("GET", "/v1/support/tickets", { token: TEACHER_B.token });
    expect(cross.status).toBe(200);
    expect((cross.body.items as unknown[]).length).toBe(0);
    // the atomic resolve
    const TICKET = t1.body.ticket.id as string;
    const KR = `p23-res-${randomUUID()}`;
    const res1 = await api("POST", `/v1/support/tickets/${TICKET}/resolve`, { token: TEACHER_A.token, idempotencyKey: KR });
    expect(res1.status).toBe(200);
    expect(res1.body.changed).toBe(true);
    expect(res1.body.ticket.status).toBe("RESOLVED");
    expect(res1.body.ticket.resolvedAt).toBeTruthy();
    const resR = await api("POST", `/v1/support/tickets/${TICKET}/resolve`, { token: TEACHER_A.token, idempotencyKey: KR });
    expect(resR.status).toBe(200);
    expect(resR.body.changed).toBe(false);
    expect(resR.body.existed).toBe(true);
  });

  it("P23-4 [§3.3 fire-and-forget]: exactly one event per unique key (replays collapsed)", async () => {
    // proven pattern (p16 line 223): staff reads the tenant interaction stream
    const events = await api("GET", "/v1/interaction-events", { token: TEACHER_A.token });
    expect(events.status).toBe(200);
    const p23 = (events.body.items as any[]).filter((e) => e.detail?.phase === "PHASE-23");
    expect(p23.length).toBe(4); // redeem + note + ticket + resolve (the redeem replay collapsed)
    expect(p23.every((e) => e.eventType === "ATTEMPT_SUBMIT")).toBe(true);
  });
});
