/**
 * PHASE-7 (TEACHER-CAPABILITIES) — Teacher review/report/remediation gates E2E.
 *
 * REAL browser (Playwright Chromium) + REAL API process (Express app serving
 * /v1 AND /ui — ACR-E5-001) + REAL PostgreSQL (core32_verify) + REAL Redis.
 * No mocks. Reuse-first per governance: the remediation loop is the E1-proven
 * canonical capability set (core-28, NOT rebuilt here); the report surface is
 * the canonical staff-authorized student dashboard (assertStudentDetailAccess —
 * PHASE-2 boundaries); the shell is the PHASE-3 portal. This suite proves the
 * PHASE-7 acceptance criteria: "teacher review/report/remediation gates pass":
 *   P7-1 review gate: the teacher staff dashboard renders the REAL pending
 *        intervention proposal (seeded in the canonical learning-loop tables)
 *        and opens a REAL student report from the queue (no mock data),
 *   P7-2 report gate: teacher JWT is authorized on the canonical report surface
 *        (staff CLASS scope → own-class student → 200),
 *   P7-3 RBAC: parent JWT is DENIED (403/404) on the report surface (real
 *        backend boundary — not UI hiding),
 *   P7-4 tenant isolation: cross-tenant student reads as 403/404 — never a leak,
 *   P7-5 roadmap alignment: unbuilt teacher capabilities still render explicit
 *        "غير مدعومة بعد" placeholders with their roadmap phases (PHASE-10/11).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const RUN = process.env.CORE32_E2E === "1";
const d = RUN ? describe : describe.skip;

// Test-scoped env ONLY: this suite performs multiple real logins by design —
// the production app code and its defaults are untouched (DEV-013 policy).
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
const STUDENT_B = randomUUID();
const DIAG_ID = randomUUID();
const PROPOSAL_ID = randomUUID();

let server: Server | null = null;
let base = "";
let browser: Browser | null = null;

const opKey = (tag: string) => `p7-${tag}-${randomUUID()}`;

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
    learningDiagnosesTable, interventionProposalsTable,
  } = await import("../../packages/database/src/schema/index.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P7-A", slug: `p7a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P7-B", slug: `p7b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P7-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P7-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P7", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "ب-P7", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
  ]);

  const { hashPassword } = await import("@workspace/security");
  const mkUser = async (role: string) => {
    const id = randomUUID();
    const email = `p7-${role}-${randomUUID()}@x.test`;
    await db.insert(usersTable).values({
      id, tenantId: TENANT_A, firstName: "P7", lastName: role, email,
      passwordHash: await hashPassword("s3cretpass"), role,
    });
    return { id, email };
  };
  TEACHER_A = await mkUser("teacher");
  PARENT_A = await mkUser("parent");

  // Staff scope: teacher A owns CLASS_A (the predicate family that the report
  // surface verifies via assertStudentDetailAccess — same as core-28 E1).
  await db.insert(dbmod.staffMembershipsTable).values({
    id: randomUUID(), tenantId: TENANT_A, userId: TEACHER_A.id, schoolId: SCHOOL_A,
    role: "teacher", scopeType: "CLASS", scopeId: CLASS_A, status: "active", operationKey: opKey("sm"),
  });

  // Tenant A student (inside the teacher's CLASS scope) + real membership
  STUDENT_A.identityId = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: STUDENT_A.identityId, operationKey: opKey("idA") });
  STUDENT_A.studentId = randomUUID();
  await db.insert(studentsTable).values({
    id: STUDENT_A.studentId, tenantId: TENANT_A, classId: CLASS_A, identityId: STUDENT_A.identityId,
    firstName: "سالم", lastName: "P7", studentCode: `P7-${randomUUID()}`,
  });
  await dbmod.startMembership({
    identityId: STUDENT_A.identityId, tenantId: TENANT_A, studentId: STUDENT_A.studentId,
    schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("mA"),
  });

  // Learning-loop seed: one REAL diagnosis + one PENDING proposal → the review
  // queue must show it (canonical loop state rows, not a UI fixture).
  await db.insert(learningDiagnosesTable).values({
    id: DIAG_ID, tenantId: TENANT_A, studentId: STUDENT_A.studentId, skill: "ضرب",
    signalKey: `p7-slow-${randomUUID()}`, detectedAt: new Date(), evidenceRefs: [],
    confidence: 0.9, reason: "P7 seeded slow-response signal", source: "p7-seed",
    operationKey: opKey("diag"),
  });
  await db.insert(interventionProposalsTable).values({
    id: PROPOSAL_ID, tenantId: TENANT_A, studentId: STUDENT_A.studentId, diagnosisId: DIAG_ID,
    skill: "ضرب", activityType: "numeracy-drill", operationKey: opKey("prop"),
  });

  // Tenant B student — cross-tenant leak probe target (never logs in)
  const ID_B = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: ID_B, operationKey: opKey("idB") });
  await db.insert(studentsTable).values({
    id: STUDENT_B, tenantId: TENANT_B, classId: CLASS_B, identityId: ID_B,
    firstName: "باسم", lastName: "P7-B", studentCode: `P7B-${randomUUID()}`,
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

d("PHASE-7 — Teacher capabilities: review/report/remediation gates (real browser + real API + real PG/Redis)", () => {
  it("P7-1 [review + report gates]: teacher staff dashboard renders the REAL pending proposal and opens a REAL student report from the queue", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, TEACHER_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    expect(await page.getAttribute("#portal-nav", "data-role")).toBe("teacher");
    // The REAL seeded proposal (PENDING, skill ضرب) is rendered — not just a count
    await page.waitForSelector("[data-report-student]");
    const queue = await page.textContent("#portal-capability-panel");
    expect(queue).toContain("ضرب");
    expect(queue).toContain("PENDING");
    // Open the teacher report for that student — REAL staff-authorized data
    await page.click("[data-report-student]");
    await page.waitForSelector("#portal-capability-panel .stat");
    expect(await page.textContent("#portal-meta")).toContain("تقرير طالب");
    const report = await page.textContent("#portal-capability-panel");
    expect(report).not.toContain("غير مدعومة بعد");
    expect(report).not.toContain("تعذر");
    await page.close();
  });

  it("P7-2 [report gate]: teacher JWT is authorized on the canonical report surface (CLASS scope → own-class student → 200)", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, TEACHER_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    const token = await sessionToken(page);
    const res = await page.evaluate(
      async ({ t, tenant, student }) => {
        const r = await fetch(`/v1/students/${student}/dashboard`, {
          headers: { Authorization: `Bearer ${t}`, "X-Tenant-Id": tenant },
        });
        return { status: r.status, json: await r.json() };
      },
      { t: token, tenant: TENANT_A, student: STUDENT_A.studentId },
    );
    expect(res.status).toBe(200);
    expect(res.json?.student?.studentId).toBe(STUDENT_A.studentId);
    await page.close();
  });

  it("P7-3 [RBAC]: parent JWT is DENIED on the report surface (real backend boundary — not UI hiding)", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, PARENT_A.email);
    await page.waitForSelector("#view-portal-placeholder:not(.hidden)");
    const token = await sessionToken(page);
    const status = await page.evaluate(
      async ({ t, tenant, student }) =>
        fetch(`/v1/students/${student}/dashboard`, {
          headers: { Authorization: `Bearer ${t}`, "X-Tenant-Id": tenant },
        }).then((r) => r.status),
      { t: token, tenant: TENANT_A, student: STUDENT_A.studentId },
    );
    expect([403, 404]).toContain(status);
    expect(status).not.toBe(200);
    await page.close();
  });

  it("P7-4 [tenant isolation]: cross-tenant student reads as 403/404 — never a leak (PHASE-2 boundary intact)", async () => {
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
    expect(res.body).not.toContain("P7-B");
    await page.close();
  });

  it("P7-5 [roadmap alignment]: unbuilt teacher capabilities still render explicit placeholders with their roadmap phases", async () => {
    const page = await browser!.newPage();
    await staffLogin(page, TEACHER_A.email);
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    await page.click('[data-portal-cap="attendance"]');
    await page.waitForSelector("#view-portal-placeholder:not(.hidden)");
    expect(await page.textContent("#portal-placeholder-text")).toContain("غير مدعومة بعد");
    expect(await page.textContent("#portal-placeholder-phase")).toContain("PHASE-11");
    await page.click('[data-nav="portal-home"]');
    await page.waitForSelector("#view-portal-home:not(.hidden)");
    await page.click('[data-portal-cap="passages"]');
    await page.waitForSelector("#view-portal-placeholder:not(.hidden)");
    expect(await page.textContent("#portal-placeholder-phase")).toContain("PHASE-10");
    await page.close();
  });
});
