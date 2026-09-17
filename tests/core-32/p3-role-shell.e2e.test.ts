/**
 * PHASE-3 (CORE-WEB-PORTAL-SHELL) — Role-aware portal shell E2E.
 *
 * REAL browser (Playwright Chromium) + REAL API process (Express app serving
 * /v1 AND /ui — ACR-E5-001) + REAL PostgreSQL (core32_verify) + REAL Redis.
 * No API mocks. The role source of truth is the JWT (server-verified on every
 * request; the shell only PRESENTS it). This suite proves:
 *   - the five portal roots (Student/Teacher/Parent/Principal/Admin) route by
 *     the authenticated role,
 *   - real navigation with explicit "غير مدعومة بعد" placeholders for
 *     capabilities without a real /v1 surface (ACR-E5-001 — zero mock data),
 *   - 401 without authentication,
 *   - 403 for unauthorized roles (real backend boundary, not UI hiding),
 *   - no cross-tenant data leak (PHASE-2 tenant isolation intact).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const RUN = process.env.CORE32_E2E === "1";
const d = RUN ? describe : describe.skip;

// Test-scoped env ONLY: this suite performs multiple real logins by design
// (five roles), so the auth rate limit is raised for THIS test process —
// the production app code and its defaults are untouched (no rate-limit
// re-engineering; DEV-013 policy respected).
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const SCHOOL_A = randomUUID();
const SCHOOL_B = randomUUID();
const CLASS_B = randomUUID();
const CLASS_A = randomUUID();

let TEACHER_A = { id: "", email: "" };
let PARENT_A = { id: "", email: "" };
let PRINCIPAL_A = { id: "", email: "" };
let ADMIN_A = { id: "", email: "" };
const STUDENT_A = { identityId: "", studentId: "" };
let STUDENT_B = "";

let server: Server | null = null;
let base = "";
let browser: Browser | null = null;

const SESSION_KEY = "buytuk.ui.session.v017";
const opKey = (tag: string) => `p3-${tag}-${randomUUID()}`;

const PORTAL_TITLES: Record<string, string> = {
  student: "بوابة الطالب",
  teacher: "بوابة المعلم",
  parent: "بوابة ولي الأمر",
  principal: "بوابة المدير",
  admin: "بوابة المسؤول",
};

async function sessionToken(page: Page): Promise<string> {
  const raw = await page.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY);
  const sess = raw ? JSON.parse(raw) : null;
  expect(sess?.accessToken, "real login must have stored an access token").toBeTruthy();
  return sess.accessToken;
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
  const { db } = await import("../../packages/database/src/client.js");
  const {
    tenantsTable, schoolsTable, classesTable, studentIdentitiesTable, studentsTable, usersTable,
  } = await import("../../packages/database/src/schema/index.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P3-A", slug: `p3a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P3-B", slug: `p3b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P3-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P3-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P3", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "ب-P3", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
  ]);

  const { hashPassword } = await import("@workspace/security");
  const mkUser = async (role: string) => {
    const id = randomUUID();
    const email = `p3-${role}-${randomUUID()}@x.test`;
    await db.insert(usersTable).values({
      id, tenantId: TENANT_A, firstName: "P3", lastName: role, email,
      passwordHash: await hashPassword("s3cretpass"), role,
    });
    return { id, email };
  };
  TEACHER_A = await mkUser("teacher");
  PARENT_A = await mkUser("parent");
  PRINCIPAL_A = await mkUser("principal");
  ADMIN_A = await mkUser("admin");

  // Tenant A student (real student-login → Student portal routing)
  STUDENT_A.identityId = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: STUDENT_A.identityId, operationKey: opKey("idA") });
  STUDENT_A.studentId = randomUUID();
  await db.insert(studentsTable).values({
    id: STUDENT_A.studentId, tenantId: TENANT_A, classId: CLASS_A, identityId: STUDENT_A.identityId,
    firstName: "سالم", lastName: "P3", studentCode: `P3-${randomUUID()}`,
  });
  await dbmod.startMembership({
    identityId: STUDENT_A.identityId, tenantId: TENANT_A, studentId: STUDENT_A.studentId,
    schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("mA"),
  });

  // Tenant B student — cross-tenant leak probe target (never logs in)
  const ID_B = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: ID_B, operationKey: opKey("idB") });
  STUDENT_B = randomUUID();
  await db.insert(studentsTable).values({
    id: STUDENT_B, tenantId: TENANT_B, classId: CLASS_B, identityId: ID_B,
    firstName: "ب", lastName: "P3-B", studentCode: `P3B-${randomUUID()}`,
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

d("PHASE-3 — Role-aware portal shell (real browser + real API + real auth)", () => {
  it("P3-1 [Student]: student login routes to the Student portal (real dashboard + real nav)", async () => {
    const page = await browser!.newPage();
    await page.goto(`${base}/`);
    await page.fill("#login-tenant", TENANT_A);
    await page.fill("#login-identity", STUDENT_A.identityId);
    await page.click("#login-form button[type=submit]");
    await page.waitForSelector("#view-dashboard:not(.hidden)");
    expect(await page.getAttribute("#portal-nav", "data-role")).toBe("student");
    expect(await page.locator("#portal-nav .nav-item").count()).toBeGreaterThanOrEqual(5);
    await page.close();
  });

  it("P3-2 [Teacher]: teacher JWT routes to the Teacher portal root with REAL review-queue data", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, TEACHER_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    expect(await page.textContent("#portal-title")).toContain(PORTAL_TITLES.teacher);
    expect(await page.textContent("#portal-meta")).toContain("teacher");
    expect(await page.getAttribute("#portal-nav", "data-role")).toBe("teacher");
    await page.waitForSelector("#portal-capability-panel .stat");
    await page.close();
  });

  it("P3-3 [Parent]: parent JWT routes to the Parent portal root (PHASE-8: the root is now the REAL children view — evolved from the PHASE-3 placeholder per approved roadmap)", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, PARENT_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    expect(await page.textContent("#portal-title")).toContain(PORTAL_TITLES.parent);
    expect(await page.getAttribute("#portal-nav", "data-role")).toBe("parent");
    await page.close();
  });

  it("P3-4 [Principal] + P3-5 [Admin]: JWT roles route to their own portal roots", async () => {
    for (const u of [
      { email: PRINCIPAL_A.email, role: "principal", title: PORTAL_TITLES.principal },
      { email: ADMIN_A.email, role: "admin", title: PORTAL_TITLES.admin },
    ]) {
      const page = await browser!.newPage();
      await staffLogin(page, u.email);
      await page.waitForSelector("#view-portal-home:not(.hidden)");
      expect(await page.textContent("#portal-title")).toContain(u.title);
      expect(await page.getAttribute("#portal-nav", "data-role")).toBe(u.role);
      await page.close();
    }
  });

  it("P3-6 [Nav]: a capability without a real /v1 surface shows the explicit placeholder (no mock data)", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, TEACHER_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    await page.click('[data-portal-cap="attendance"]');
    await page.waitForSelector("#view-portal-placeholder:not(.hidden)");
    expect(await page.textContent("#portal-placeholder-text")).toContain("غير مدعومة بعد");
    await page.click('[data-nav="portal-home"]');
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    await page.close();
  });

  it("P3-7 [401]: portal API without authentication is 401 (real backend boundary)", async () => {
    const page = await browser!.newPage();
    await page.goto(`${base}/`);
    const status = await page.evaluate(() => fetch("/v1/teacher/review-queue").then((r) => r.status));
    expect(status).toBe(401);
    await page.close();
  });

  it("P3-8 [403]: parent token is rejected by the teacher capability (403 — not UI hiding)", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, PARENT_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    const token = await sessionToken(page);
    const status = await page.evaluate(
      async (t) => fetch("/v1/teacher/review-queue", { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.status),
      token,
    );
    expect(status).toBe(403);
    await page.close();
  });

  it("P3-9 [Tenant isolation]: tenant A staff cannot read tenant B student data (no leak)", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, TEACHER_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    const token = await sessionToken(page);
    const res = await page.evaluate(
      async ({ t, tenant, student }) => {
        const r = await fetch(`/v1/students/${student}/dashboard`, {
          headers: { Authorization: `Bearer ${t}`, "X-Tenant-Id": tenant },
        });
        return { status: r.status, body: await r.text() };
      },
      { t: token, tenant: TENANT_A, student: STUDENT_B },
    );
    expect([403, 404]).toContain(res.status);
    expect(res.body).not.toContain("P3-B");
    await page.close();
  });
});
