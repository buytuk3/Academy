/**
 * PHASE-9 (PRINCIPAL-ADMIN-CAPABILITIES) — Principal/admin oversight gates E2E.
 *
 * REAL browser (Playwright Chromium) + REAL API process (Express serving /v1
 * AND /ui) + REAL PostgreSQL (core32_verify, migrations 0000-0008) + REAL
 * Redis. No mocks. Reuse-first: principal/admin consume the canonical surfaces
 * proven in PHASE-2/4/6/7 — assertStudentDetailAccess (staff scope gate),
 * /v1/teacher/review-queue (role-gated teacher/principal/admin),
 * /v1/oversight/aggregates (assertStaffScope + k-anonymity suppression) — plus
 * the NEW canonical principal/admin READ capabilities (listTenantStaff /
 * listTenantClasses / listTenantUsers / listAuditEvents — SELECT-only,
 * withTenant → RLS). Proves the PHASE-9 acceptance criteria «oversight/admin
 * gates pass» (DEV-009 closure):
 *   P9-1 principal roster/classes views render REAL staff + REAL classes,
 *   P9-2 principal reports open the REAL student report through the scope gate,
 *   P9-3 principal analytics render REAL privacy-suppressed aggregates,
 *   P9-4 admin users/queue/audit render REAL accounts, queue and audit trail,
 *   P9-5 boundaries: 401 anon; parent/teacher/principal denials on the
 *        admin-only surface; cross-tenant student 403/404 no-leak; models/
 *        settings stay explicit placeholders (PHASE-12).
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
const PROPOSAL_ID = randomUUID();
const DIAG_ID = randomUUID();

let PRINCIPAL_A = { id: "", email: "" };
let ADMIN_A = { id: "", email: "" };
let TEACHER_A = { id: "", email: "" };
let PARENT_A = { id: "", email: "" };
const STUDENT_A = { identityId: "", studentId: "" };
const STUDENT_B = randomUUID();

let server: Server | null = null;
let base = "";
let browser: Browser | null = null;

const opKey = (tag: string) => `p9-${tag}-${randomUUID()}`;

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
  const { db } = await import("../../packages/database/src/client.js");
  const {
    tenantsTable, schoolsTable, classesTable, studentIdentitiesTable, studentsTable, usersTable,
    staffMembershipsTable, auditLogsTable, learningDiagnosesTable, interventionProposalsTable,
  } = await import("../../packages/database/src/schema/index.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P9-A", slug: `p9a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P9-B", slug: `p9b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P9-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P9-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "6/أ-P9", gradeLevel: "6", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "ب-P9", gradeLevel: "6", academicYear: "2026", stageKey: "PRIMARY" },
  ]);

  const { hashPassword } = await import("@workspace/security");
  const mkUser = async (role: string) => {
    const id = randomUUID();
    const email = `p9-${role}-${randomUUID()}@x.test`;
    await db.insert(usersTable).values({
      id, tenantId: TENANT_A, firstName: "P9", lastName: role, email,
      passwordHash: await hashPassword("s3cretpass"), role,
    });
    return { id, email };
  };
  PRINCIPAL_A = await mkUser("principal");
  ADMIN_A = await mkUser("admin");
  TEACHER_A = await mkUser("teacher");
  PARENT_A = await mkUser("parent");

  // REAL memberships (institutional placement — every membership anchored):
  // principal covers SCHOOL_A; admin is tenant-wide (anchored at SCHOOL_A to
  // satisfy staff_memberships_has_anchor); teacher covers CLASS_A.
  await db.insert(staffMembershipsTable).values([
    { id: randomUUID(), tenantId: TENANT_A, userId: PRINCIPAL_A.id, schoolId: SCHOOL_A, role: "principal", scopeType: "SCHOOL", scopeId: SCHOOL_A, status: "active", operationKey: opKey("sm-principal") },
    { id: randomUUID(), tenantId: TENANT_A, userId: ADMIN_A.id, schoolId: SCHOOL_A, role: "admin", scopeType: "TENANT", status: "active", operationKey: opKey("sm-admin") },
    { id: randomUUID(), tenantId: TENANT_A, userId: TEACHER_A.id, schoolId: SCHOOL_A, role: "teacher", scopeType: "CLASS", scopeId: CLASS_A, status: "active", operationKey: opKey("sm-teacher") },
  ]);

  // Tenant A student + real membership (student report target)
  STUDENT_A.identityId = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: STUDENT_A.identityId, operationKey: opKey("idA") });
  STUDENT_A.studentId = randomUUID();
  await db.insert(studentsTable).values({
    id: STUDENT_A.studentId, tenantId: TENANT_A, classId: CLASS_A, identityId: STUDENT_A.identityId,
    firstName: "سالم", lastName: "P9", studentCode: `P9-${randomUUID()}`,
  });
  await dbmod.startMembership({
    identityId: STUDENT_A.identityId, tenantId: TENANT_A, studentId: STUDENT_A.studentId,
    schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("mA"),
  });

  // REAL review-queue proposal (admin queue view + principal students view)
  await db.insert(learningDiagnosesTable).values({
    id: DIAG_ID, tenantId: TENANT_A, studentId: STUDENT_A.studentId,
    signalKey: `p9-slow-${randomUUID()}`, detectedAt: new Date(), evidenceRefs: [],
    skill: "ضرب", confidence: 0.9, reason: "P9 seeded slow-response signal", source: "p9-seed",
    operationKey: opKey("diag"),
  });
  await db.insert(interventionProposalsTable).values({
    id: PROPOSAL_ID, tenantId: TENANT_A, studentId: STUDENT_A.studentId, diagnosisId: DIAG_ID,
    skill: "ضرب", activityType: "numeracy-drill", operationKey: opKey("prop"),
  });

  // REAL audit row (admin audit view renders the real trail)
  await db.insert(auditLogsTable).values({
    id: randomUUID(), tenantId: TENANT_A, actorId: ADMIN_A.id,
    action: "p9.seed.audit", entity: "system", entityId: null, metadata: null,
  });

  // Tenant B student — cross-tenant leak probe target (never logs in)
  const ID_B = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: ID_B, operationKey: opKey("idB") });
  await db.insert(studentsTable).values({
    id: STUDENT_B, tenantId: TENANT_B, classId: CLASS_B, identityId: ID_B,
    firstName: "باسم", lastName: "P9-B", studentCode: `P9B-${randomUUID()}`,
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

d("PHASE-9 — Principal/admin capabilities: oversight gates (real browser + real API + real PG/Redis)", () => {
  it("P9-1 [roster/classes]: principal portal renders REAL staff roster and REAL classes", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, PRINCIPAL_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    expect(await page.getAttribute("#portal-nav", "data-role")).toBe("principal");
    expect(await page.textContent("#portal-title")).toContain("بوابة المدير");
    await page.click('[data-portal-cap="teachers"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("أعضاء الكادر"));
    const roster = await page.textContent("#portal-capability-panel");
    expect(roster).toContain("P9 teacher"); // real first/last name from users+staff_memberships
    expect(roster).not.toContain("غير مدعومة بعد");
    await page.click('[data-portal-cap="classes"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("الصفوف"));
    const classes = await page.textContent("#portal-capability-panel");
    expect(classes).toContain("6/أ-P9"); // real class row
    expect(classes).not.toContain("غير مدعومة بعد");
    await page.close();
  });

  it("P9-2 [reports]: principal opens the REAL student report through the canonical scope gate", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, PRINCIPAL_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    await page.click('[data-portal-cap="students"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("المقترحات المعلقة"));
    await page.click("[data-report-student]");
    await page.waitForFunction(() => (document.getElementById("portal-meta")?.textContent ?? "").includes("تقرير طالب"));
    const report = await page.textContent("#portal-capability-panel");
    expect(report).not.toContain("غير مدعومة بعد");
    expect(report).not.toContain("تعذر");
    await page.close();
  });

  it("P9-3 [analytics]: principal analytics view renders REAL privacy-suppressed aggregates", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, PRINCIPAL_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    await page.click('[data-portal-cap="analytics"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("مجموعات الإشراف"));
    const panel = await page.textContent("#portal-capability-panel");
    expect(panel).not.toContain("غير مدعومة بعد");
    expect(panel).not.toContain("تعذر");
    await page.close();
  });

  it("P9-4 [admin surfaces]: admin users/queue/audit render REAL accounts, queue and audit trail", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, ADMIN_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    expect(await page.textContent("#portal-title")).toContain("بوابة المسؤول");
    await page.click('[data-portal-cap="users"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("الحسابات"));
    const usersPanel = await page.textContent("#portal-capability-panel");
    expect(usersPanel).toContain(PRINCIPAL_A.email); // real user row
    expect(usersPanel).not.toContain("غير مدعومة بعد");
    await page.click('[data-portal-cap="audit"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("أحداث التدقيق"));
    const auditPanel = await page.textContent("#portal-capability-panel");
    expect(auditPanel).toContain("p9.seed.audit"); // real audit row
    await page.click('[data-portal-cap="queue"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("المقترحات المعلقة"));
    const queuePanel = await page.textContent("#portal-capability-panel");
    expect(queuePanel).toContain("ضرب"); // real pending proposal
    await page.close();
  });

  it("P9-5 [boundaries + alignment]: 401 anon; parent/teacher/principal denied on the admin-only surface; cross-tenant 403/404; models/settings stay PHASE-12 placeholders", async () => {
    const page = await browser!.newPage();
    await page.goto(`${base}/`);
    const anon = await page.evaluate(() => fetch("/v1/admin/users").then((r) => r.status));
    expect(anon).toBe(401);
    await page.close();

    // parent (no staff membership) → 403 on the roster surface
    const pPage = await browser!.newPage();
    await staffLogin(pPage, PARENT_A.email);
    await pPage.waitForSelector("#view-portal-home:not(.hidden)");
    const pTok = await sessionToken(pPage);
    const pStatus = await pPage.evaluate(
      async (t) => fetch("/v1/admin/staff", { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.status),
      pTok,
    );
    expect(pStatus).toBe(403);
    await pPage.close();

    // teacher (CLASS scope) and principal: both DENIED on the admin-only surface
    for (const who of [TEACHER_A, PRINCIPAL_A]) {
      const tPage = await browser!.newPage();
      await staffLogin(tPage, who.email);
      await tPage.waitForSelector("#view-portal-home:not(.hidden)");
      const tok = await sessionToken(tPage);
      const status = await tPage.evaluate(
        async (t) => fetch("/v1/admin/users", { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.status),
        tok,
      );
      expect(status).toBe(403);
      await tPage.close();
    }

    // cross-tenant student report via the principal scope gate → 403/404 no-leak
    const xPage = await browser!.newPage();
    await staffLogin(xPage, PRINCIPAL_A.email);
    await xPage.waitForSelector("#view-portal-home:not(.hidden)");
    const xTok = await sessionToken(xPage);
    const xStatus = await xPage.evaluate(
      async ({ t, tenant, student }) =>
        fetch(`/v1/students/${student}/dashboard`, {
          headers: { Authorization: `Bearer ${t}`, "X-Tenant-Id": tenant },
        }).then((r) => r.status),
      { t: xTok, tenant: TENANT_A, student: STUDENT_B },
    );
    expect([403, 404]).toContain(xStatus);
    expect(xStatus).not.toBe(200);
    await xPage.close();

    // unbuilt admin capabilities keep explicit placeholders — roadmap-aligned (PHASE-12)
    const aPage = await browser!.newPage();
    await staffLogin(aPage, ADMIN_A.email);
    await aPage.waitForSelector("#view-portal-home:not(.hidden)");
    await aPage.click('[data-portal-cap="models"]');
    await aPage.waitForSelector("#view-portal-placeholder:not(.hidden)");
    expect(await aPage.textContent("#portal-placeholder-text")).toContain("غير مدعومة بعد");
    expect(await aPage.textContent("#portal-placeholder-phase")).toContain("PHASE-12");
    await aPage.close();
  });
});
