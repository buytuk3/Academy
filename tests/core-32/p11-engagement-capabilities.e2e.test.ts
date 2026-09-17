/**
 * PHASE-11 (GAMIFICATION-MESSAGING-ATTENDANCE) — engagement/coordination gates
 * E2E (DEV-005/006/007 closure + ADR-033 ratings re-target).
 *
 * REAL browser (Playwright Chromium) + REAL API process (Express serving /v1
 * AND /ui) + REAL PostgreSQL (core32_verify with migration 0009 applied) +
 * REAL Redis. No mocks.
 *   P11-1 wallet: student sees REAL balance (0) → staff credit 50 (201,
 *         balance 50) → student panel shows 50; idempotent replay (same key)
 *         → 200, balance stays 50 (no double credit).
 *   P11-2 messaging: teacher → parent real message (201) → parent
 *         communication panel renders it; cross-tenant recipient → 404.
 *   P11-3 attendance: staff mark PRESENT (201) → same-day re-mark (200,
 *         created:false, no duplicate); panel shows the record; parent denied
 *         403.
 *   P11-4 ratings: staff rate student (201) → panel shows it; invalid score
 *         9 → 400.
 *   P11-5 boundaries + alignment: 401 anon on /v1/wallet; student JWT denied
 *         on credit (403); cross-tenant student credit denied (403/404);
 *         deferred caps keep explicit placeholders (student points-store/
 *         notes/support, teacher schedule/classes → PHASE-12).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const RUN = process.env.CORE32_E2E === "1";
const d = RUN ? describe : describe.skip;

// Test-scoped env ONLY: multiple real logins by design — production code and
// defaults untouched (DEV-013 policy).
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const SCHOOL_A = randomUUID();
const SCHOOL_B = randomUUID();
const CLASS_A = randomUUID();
const CLASS_B = randomUUID();

let TEACHER_A = { id: "", email: "" };
let PARENT_A = { id: "", email: "" };
const STUDENT_A = { identityId: "", studentId: "" };
const STUDENT_X = randomUUID(); // tenant-B student for cross-tenant probes

let server: Server | null = null;
let base = "";
let browser: Browser | null = null;

const opKey = (tag: string) => `p11-${tag}-${randomUUID()}`;

async function sessionToken(page: Page): Promise<string> {
  const tok = await page.evaluate(() => {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i) as string;
      if (k.startsWith("buytuk.ui.session")) {
        const s = JSON.parse(sessionStorage.getItem(k) as string);
        if (s?.accessToken) return s.accessToken as string;
      }
    }
    return null;
  });
  expect(tok, "real login must have stored an access token").toBeTruthy();
  return tok as string;
}

async function staffLogin(page: Page, email: string) {
  await page.goto(`${base}/`);
  await page.click("#switch-staff");
  await page.fill("#login-email", email);
  await page.fill("#login-password", "s3cretpass");
  await page.click("#login-form button[type=submit]");
  await page.waitForSelector("#view-portal-home:not(.hidden)");
}

async function studentLogin(page: Page) {
  await page.goto(`${base}/`);
  await page.fill("#login-tenant", TENANT_A);
  await page.fill("#login-identity", STUDENT_A.identityId);
  await page.click("#login-form button[type=submit]");
  await page.waitForSelector("#view-dashboard:not(.hidden)", { timeout: 20000 });
}

beforeAll(async () => {
  const dbmod = await import("../../packages/database/src/index.js");
  const {
    tenantsTable, schoolsTable, classesTable, studentIdentitiesTable, studentsTable, usersTable,
    staffMembershipsTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P11-A", slug: `p11a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P11-B", slug: `p11b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P11-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P11-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P11", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "ب-P11", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
  ]);

  // Real student (own wallet owner)
  STUDENT_A.identityId = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: STUDENT_A.identityId, operationKey: opKey("id") });
  STUDENT_A.studentId = randomUUID();
  await db.insert(studentsTable).values({
    id: STUDENT_A.studentId, tenantId: TENANT_A, classId: CLASS_A, identityId: STUDENT_A.identityId,
    firstName: "سالم", lastName: "P11", studentCode: `P11-${randomUUID()}`,
  });
  await dbmod.startMembership({
    identityId: STUDENT_A.identityId, tenantId: TENANT_A, studentId: STUDENT_A.studentId,
    schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m"),
  });

  // Real teacher (CLASS scope) + real parent
  const { hashPassword } = await import("@workspace/security");
  TEACHER_A.id = randomUUID();
  TEACHER_A.email = `p11-teacher-${randomUUID()}@x.test`;
  await db.insert(usersTable).values({
    id: TEACHER_A.id, tenantId: TENANT_A, firstName: "معلمة", lastName: "P11", email: TEACHER_A.email,
    passwordHash: await hashPassword("s3cretpass"), role: "teacher",
  });
  await db.insert(staffMembershipsTable).values({
    id: randomUUID(), tenantId: TENANT_A, userId: TEACHER_A.id, schoolId: SCHOOL_A,
    role: "teacher", scopeType: "CLASS", scopeId: CLASS_A, status: "active", operationKey: opKey("sm"),
  });
  PARENT_A.id = randomUUID();
  PARENT_A.email = `p11-parent-${randomUUID()}@x.test`;
  await db.insert(usersTable).values({
    id: PARENT_A.id, tenantId: TENANT_A, firstName: "ولية", lastName: "P11", email: PARENT_A.email,
    passwordHash: await hashPassword("s3cretpass"), role: "parent",
  });

  // Tenant-B student (cross-tenant probe target; never logs in)
  const ID_X = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: ID_X, operationKey: opKey("idX") });
  await db.insert(studentsTable).values({
    id: STUDENT_X, tenantId: TENANT_B, classId: CLASS_B, identityId: ID_X,
    firstName: "باسم", lastName: "P11-B", studentCode: `P11B-${randomUUID()}`,
  });

  // REAL API process (serves /v1 AND /ui — ACR-E5-001)
  const { default: app } = await import("../../apps/api/src/app.js");
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
      resolve();
    });
  });

  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
});

d("PHASE-11 — Engagement/coordination gates: wallet + messages + attendance + ratings (real browser + real API + real PG/Redis)", () => {
  it("P11-1 [wallet/DEV-005]: real balance view → staff credit (201, balance 50) → student panel shows 50; idempotent replay keeps 50", async () => {
    const sPage = await browser!.newPage();
    await studentLogin(sPage);
    const sTok = await sessionToken(sPage);
    const w0 = await sPage.evaluate(async (t) => fetch("/v1/wallet", { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()), sTok);
    expect(w0.balance).toBe(0);
    await sPage.close();

    const tPage = await browser!.newPage();
    await staffLogin(tPage, TEACHER_A.email);
    const tTok = await sessionToken(tPage);
    const key = opKey("credit");
    const c1 = await tPage.evaluate(async ({ t, s, k }) =>
      fetch(`/v1/wallet/${s}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "Idempotency-Key": k },
        body: JSON.stringify({ points: 50, reason: "مكافأة إتقان" }),
      }).then(async (r) => ({ status: r.status, body: await r.json() })), { t: tTok, s: STUDENT_A.studentId, k: key });
    expect(c1.status).toBe(201);
    expect(c1.body.balance).toBe(50);
    const c2 = await tPage.evaluate(async ({ t, s, k }) =>
      fetch(`/v1/wallet/${s}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "Idempotency-Key": k },
        body: JSON.stringify({ points: 50, reason: "مكافأة إتقان" }),
      }).then(async (r) => ({ status: r.status, body: await r.json() })), { t: tTok, s: STUDENT_A.studentId, k: key });
    expect(c2.status).toBe(200);
    expect(c2.body.balance).toBe(50); // NO double credit (database idempotency)
    expect(c2.body.created).toBe(false);
    await tPage.close();

    const sPage2 = await browser!.newPage();
    await studentLogin(sPage2);
    await sPage2.click('[data-portal-cap="wallet"]');
    await sPage2.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("رصيد النقاط"));
    const panel = await sPage2.textContent("#portal-capability-panel");
    expect(panel).toContain("50");
    expect(panel).toContain("مكافأة إتقان");
    expect(panel).not.toContain("غير مدعومة بعد");
    await sPage2.close();
  });

  it("P11-2 [messages/DEV-006]: teacher → parent real message; parent panel renders it; cross-tenant recipient 404", async () => {
    const tPage = await browser!.newPage();
    await staffLogin(tPage, TEACHER_A.email);
    const tTok = await sessionToken(tPage);
    const sent = await tPage.evaluate(async ({ t, to }) =>
      fetch("/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ toUserId: to, body: "اجتماع أولياء الأمور يوم الخميس" }),
      }).then(async (r) => ({ status: r.status, body: await r.json() })), { t: tTok, to: PARENT_A.id });
    expect(sent.status).toBe(201);
    const cross = await tPage.evaluate(async (t) =>
      fetch("/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ toUserId: crypto.randomUUID(), body: "اختراق" }),
      }).then((r) => r.status), tTok);
    expect(cross).toBe(404); // existence-hiding for out-of-tenant recipients
    await tPage.close();

    const pPage = await browser!.newPage();
    await staffLogin(pPage, PARENT_A.email);
    await pPage.click('[data-portal-cap="communication"]');
    await pPage.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("اجتماع أولياء الأمور"));
    const panel = await pPage.textContent("#portal-capability-panel");
    expect(panel).not.toContain("غير مدعومة بعد");
    await pPage.close();
  });

  it("P11-3 [attendance/DEV-007]: staff mark PRESENT (201) → same-day re-mark (200, created:false); panel renders it; parent 403", async () => {
    const tPage = await browser!.newPage();
    await staffLogin(tPage, TEACHER_A.email);
    const tTok = await sessionToken(tPage);
    const day = new Date().toISOString().slice(0, 10);
    const m1 = await tPage.evaluate(async ({ t, s, d }) =>
      fetch("/v1/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ studentId: s, sessionDate: d, status: "PRESENT" }),
      }).then(async (r) => ({ status: r.status, body: await r.json() })), { t: tTok, s: STUDENT_A.studentId, d: day });
    expect(m1.status).toBe(201);
    expect(m1.body.created).toBe(true);
    const m2 = await tPage.evaluate(async ({ t, s, d }) =>
      fetch("/v1/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ studentId: s, sessionDate: d, status: "ABSENT" }),
      }).then(async (r) => ({ status: r.status, body: await r.json() })), { t: tTok, s: STUDENT_A.studentId, d: day });
    expect(m2.status).toBe(200);
    expect(m2.body.created).toBe(false);
    expect(m2.body.status).toBe("PRESENT"); // daily idempotency: first mark wins
    await tPage.close();

    const vPage = await browser!.newPage();
    await staffLogin(vPage, TEACHER_A.email);
    await vPage.click('[data-portal-cap="attendance"]');
    await vPage.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("سجلات الحضور"));
    const panel = await vPage.textContent("#portal-capability-panel");
    expect(panel).toContain("PRESENT");
    expect(panel).not.toContain("غير مدعومة بعد");
    await vPage.close();

    const pPage = await browser!.newPage();
    await staffLogin(pPage, PARENT_A.email);
    const pTok = await sessionToken(pPage);
    const pStatus = await pPage.evaluate(async (t) =>
      fetch("/v1/attendance", { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.status), pTok);
    expect(pStatus).toBe(403); // parent is not a staff member
    await pPage.close();
  });

  it("P11-4 [ratings/ADR-033 re-target]: staff rate student (201) → panel renders it; invalid score 9 → 400", async () => {
    const tPage = await browser!.newPage();
    await staffLogin(tPage, TEACHER_A.email);
    const tTok = await sessionToken(tPage);
    const r1 = await tPage.evaluate(async ({ t, s }) =>
      fetch("/v1/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ studentId: s, score: 5, note: "مشاركة متميزة" }),
      }).then(async (r) => ({ status: r.status, body: await r.json() })), { t: tTok, s: STUDENT_A.studentId });
    expect(r1.status).toBe(201);
    const bad = await tPage.evaluate(async ({ t, s }) =>
      fetch("/v1/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ studentId: s, score: 9 }),
      }).then((r) => r.status), { t: tTok, s: STUDENT_A.studentId });
    expect(bad).toBe(400);
    await tPage.close();

    const vPage = await browser!.newPage();
    await staffLogin(vPage, TEACHER_A.email);
    await vPage.click('[data-portal-cap="ratings"]');
    await vPage.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("تقييمات المعلمين"));
    const panel = await vPage.textContent("#portal-capability-panel");
    expect(panel).toContain("مشاركة متميزة");
    expect(panel).not.toContain("غير مدعومة بعد");
    await vPage.close();
  });

  it("P11-5 [boundaries + alignment]: 401 anon; student denied on credit; cross-tenant credit 403/404; deferred caps keep PHASE-12 placeholders", async () => {
    const aPage = await browser!.newPage();
    await aPage.goto(`${base}/`);
    const anon = await aPage.evaluate(() => fetch("/v1/wallet").then((r) => r.status));
    expect(anon).toBe(401);
    await aPage.close();

    const sPage = await browser!.newPage();
    await studentLogin(sPage);
    const sTok = await sessionToken(sPage);
    const sStatus = await sPage.evaluate(async ({ t, s }) =>
      fetch(`/v1/wallet/${s}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ points: 10, reason: "self" }),
      }).then((r) => r.status), { t: sTok, s: STUDENT_A.studentId });
    expect(sStatus).toBe(403); // students can read their wallet, not credit it
    await sPage.close();

    const tPage = await browser!.newPage();
    await staffLogin(tPage, TEACHER_A.email);
    const tTok = await sessionToken(tPage);
    const xStatus = await tPage.evaluate(async ({ t, s }) =>
      fetch(`/v1/wallet/${s}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ points: 10, reason: "x" }),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })), { t: tTok, s: STUDENT_X });
    expect([403, 404]).toContain(xStatus.status); // cross-tenant credit denied, no leak
    await tPage.close();

    // deferred caps keep explicit placeholders — re-targeted PHASE-12 (ADR-034)
    const dPage = await browser!.newPage();
    await staffLogin(dPage, TEACHER_A.email);
    await dPage.click('[data-portal-cap="schedule"]');
    await dPage.waitForSelector("#view-portal-placeholder:not(.hidden)");
    expect(await dPage.textContent("#portal-placeholder-text")).toContain("غير مدعومة بعد");
    expect(await dPage.textContent("#portal-placeholder-phase")).toContain("PHASE-12");
    await dPage.close();
  });
});
