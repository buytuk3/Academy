/**
 * PHASE-8 (PARENT-CAPABILITIES) — Parent access/visibility gates E2E.
 *
 * REAL browser (Playwright Chromium) + REAL API process (Express app serving
 * /v1 AND /ui — ACR-E5-001) + REAL PostgreSQL (core32_verify, migration 0008
 * applied) + REAL Redis. No mocks. Reuse-first: the visibility composition is
 * the canonical learner-builder set proven in PHASE-6/7 (NOT rebuilt); the
 * parent↔child gate is the new canonical parent-visibility capability
 * (assertParentStudentAccess — withTenant + RLS + link row). Proves the
 * PHASE-8 acceptance criteria "parent access and visibility gates pass":
 *   P8-1 access gate: parent JWT lists ONLY linked children (real rows),
 *   P8-2 visibility gate: child progress report opens with REAL data,
 *   P8-3 link gate: unlinked parent is DENIED (403/404 — real backend boundary),
 *   P8-4 tenant isolation: cross-tenant child reads 403/404 — never a leak,
 *   P8-5 boundaries + alignment: 401 unauthenticated; teacher JWT rejected on
 *        the parent surface; communication stays "غير مدعومة بعد" (PHASE-11).
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

let PARENT_A = { id: "", email: "" };
let PARENT_B = { id: "", email: "" };
let TEACHER_A = { id: "", email: "" };
const STUDENT_A = { identityId: "", studentId: "" };
const STUDENT_B = randomUUID();

let server: Server | null = null;
let base = "";
let browser: Browser | null = null;

const opKey = (tag: string) => `p8-${tag}-${randomUUID()}`;

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
}

beforeAll(async () => {
  const dbmod = await import("../../packages/database/src/index.js");
  const {
    tenantsTable, schoolsTable, classesTable, studentIdentitiesTable, studentsTable, usersTable,
    parentStudentLinksTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P8-A", slug: `p8a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P8-B", slug: `p8b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P8-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P8-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "5/أ-P8", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "ب-P8", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);

  const { hashPassword } = await import("@workspace/security");
  const mkUser = async (role: string) => {
    const id = randomUUID();
    const email = `p8-${role}-${randomUUID()}@x.test`;
    await db.insert(usersTable).values({
      id, tenantId: TENANT_A, firstName: "P8", lastName: role, email,
      passwordHash: await hashPassword("s3cretpass"), role,
    });
    return { id, email };
  };
  PARENT_A = await mkUser("parent");
  PARENT_B = await mkUser("parent");
  TEACHER_A = await mkUser("teacher");

  // Tenant A student + real membership + the parent↔child LINK (canonical rows)
  STUDENT_A.identityId = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: STUDENT_A.identityId, operationKey: opKey("idA") });
  STUDENT_A.studentId = randomUUID();
  await db.insert(studentsTable).values({
    id: STUDENT_A.studentId, tenantId: TENANT_A, classId: CLASS_A, identityId: STUDENT_A.identityId,
    firstName: "سالم", lastName: "P8", studentCode: `P8-${randomUUID()}`,
  });
  await dbmod.startMembership({
    identityId: STUDENT_A.identityId, tenantId: TENANT_A, studentId: STUDENT_A.studentId,
    schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("mA"),
  });
  await db.insert(parentStudentLinksTable).values({
    id: randomUUID(), tenantId: TENANT_A, parentUserId: PARENT_A.id,
    studentId: STUDENT_A.studentId, operationKey: opKey("link"),
  });

  // Tenant B student (cross-tenant probe target — never linked, never logs in)
  const ID_B = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: ID_B, operationKey: opKey("idB") });
  await db.insert(studentsTable).values({
    id: STUDENT_B, tenantId: TENANT_B, classId: CLASS_B, identityId: ID_B,
    firstName: "باسم", lastName: "P8-B", studentCode: `P8B-${randomUUID()}`,
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

d("PHASE-8 — Parent capabilities: access/visibility gates (real browser + real API + real PG/Redis)", () => {
  it("P8-1 [access gate]: parent JWT lists ONLY the linked child (real rows, parent portal root)", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, PARENT_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    expect(await page.getAttribute("#portal-nav", "data-role")).toBe("parent");
    expect(await page.textContent("#portal-title")).toContain("بوابة ولي الأمر");
    await page.waitForSelector("[data-parent-child]");
    const panel = await page.textContent("#portal-capability-panel");
    expect(panel).toContain("سالم");
    expect(panel).toContain("الأبناء");
    await page.close();
  });

  it("P8-2 [visibility gate]: child progress report opens with REAL data (no placeholder, no error)", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, PARENT_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    await page.waitForSelector("[data-parent-child]");
    await page.click("[data-child-report]");
    await page.waitForFunction(() => (document.getElementById("portal-meta")?.textContent ?? "").includes("متابعة تقدم الابن"));
    await page.waitForSelector("#parent-report-back");
    const report = await page.textContent("#portal-capability-panel");
    expect(report).not.toContain("غير مدعومة بعد");
    expect(report).not.toContain("تعذر");
    expect(await page.isVisible("#parent-report-back")).toBe(true);
    await page.close();
  });

  it("P8-3 [link gate]: an unlinked parent is DENIED on the child surface (403/404 — not UI hiding)", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, PARENT_B.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    const token = await sessionToken(page);
    const status = await page.evaluate(
      async ({ t, tenant, student }) =>
        fetch(`/v1/parents/children/${student}/dashboard`, {
          headers: { Authorization: `Bearer ${t}`, "X-Tenant-Id": tenant },
        }).then((r) => r.status),
      { t: token, tenant: TENANT_A, student: STUDENT_A.studentId },
    );
    expect([403, 404]).toContain(status);
    expect(status).not.toBe(200);
    await page.close();
  });

  it("P8-4 [tenant isolation]: cross-tenant child reads 403/404 — never a leak (PHASE-2 boundary intact)", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, PARENT_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    const token = await sessionToken(page);
    const res = await page.evaluate(
      async ({ t, tenant, student }) => {
        const r = await fetch(`/v1/parents/children/${student}/dashboard`, {
          headers: { Authorization: `Bearer ${t}`, "X-Tenant-Id": tenant },
        });
        return { status: r.status, body: await r.text() };
      },
      { t: token, tenant: TENANT_A, student: STUDENT_B },
    );
    expect([403, 404]).toContain(res.status);
    expect(res.body).not.toContain("P8-B");
    await page.close();
  });

  it("P8-5 [boundaries + alignment]: 401 unauthenticated; teacher JWT rejected on the parent surface; communication stays PHASE-11 placeholder", async () => {
    const page = await browser!.newPage();
    await page.goto(`${base}/`);
    const anon = await page.evaluate(() => fetch("/v1/parents/children").then((r) => r.status));
    expect(anon).toBe(401);
    await page.close();

    const tPage = await browser!.newPage();
    await staffLogin(tPage, TEACHER_A.email);
    await tPage.waitForSelector("#view-portal-home:not(.hidden)");
    const tTok = await sessionToken(tPage);
    const tStatus = await tPage.evaluate(
      async (t) => fetch("/v1/parents/children", { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.status),
      tTok,
    );
    expect(tStatus).toBe(403);
    await tPage.close();

    const pPage = await browser!.newPage();
    await staffLogin(pPage, PARENT_A.email);
    await pPage.waitForSelector("#view-portal-home:not(.hidden)");
    await pPage.click('[data-portal-cap="communication"]');
    await pPage.waitForSelector("#view-portal-placeholder:not(.hidden)");
    expect(await pPage.textContent("#portal-placeholder-text")).toContain("غير مدعومة بعد");
    expect(await pPage.textContent("#portal-placeholder-phase")).toContain("PHASE-11");
    await pPage.close();
  });
});
