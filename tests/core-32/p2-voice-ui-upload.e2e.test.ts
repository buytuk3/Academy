/**
 * CORE-34A / V0.1.4 — Student UI voice intake over the existing architecture.
 *
 * REAL browser (Playwright Chromium) + REAL API process + REAL PostgreSQL/Redis.
 * External storage upload is the only mocked seam here: the browser requests a
 * presigned URL, then uploads the selected audio file to a fake signed target.
 * The reading submit itself stays REAL and must enqueue the async path.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { desc, eq } from "drizzle-orm";

const RUN = process.env.CORE32_E2E === "1";
const d = RUN ? describe : describe.skip;

const TENANT_A = randomUUID();
const SCHOOL_A = randomUUID();
const CLASS_A = randomUUID();
let IDENTITY_1: string;
let STUDENT_1: string;
let USER_TA: string;
let LESSON_ID: string;
let EXERCISE_READING: string;
let PASSAGE_ID: string;
let SESSION_ID: string;
const EXPECTED_TEXT = "مرحبا بكم في منصة باي توك التعليمية";
const ANCHOR = {
  curriculumId: "cur-eg-ar", curriculumVersion: "2026", country: "EG", educationSystem: "EG-NATIONAL",
  stageKey: "PRIMARY", gradeKey: "EG-PR-04", gradeLevel: "4", subject: "reading", bookId: "bk-r4", unitId: "u-read", lessonId: "les-read-1", objectiveId: "o-read-1",
};

let server: Server | null = null;
let base = "";
let browser: Browser | null = null;
let dbmod: any;
let db: any;
let readingAttemptsTable: any;

const opKey = (tag: string) => `c34a-${tag}-${randomUUID()}`;

beforeAll(async () => {
  await import("../../packages/queue/src/index.js");

  dbmod = await import("../../packages/database/src/index.js");
  ({ db } = await import("../../packages/database/src/client.js"));
  readingAttemptsTable = (await import("../../packages/database/src/schema/reading.ts")).attemptsTable;
  const { passagesTable } = await import("../../packages/database/src/schema/reading.ts");
  const { readingSessionsTable } = await import("../../packages/database/src/schema/sessions.ts");
  const {
    tenantsTable, schoolsTable, classesTable, studentIdentitiesTable, studentsTable, usersTable, staffMembershipsTable,
  } = await import("../../packages/database/src/schema/index.js");

  await db.insert(tenantsTable).values({ id: TENANT_A, name: "T-P2-VOICE-UI", slug: `c34a-${randomUUID()}` });
  await db.insert(schoolsTable).values({ id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة الصوت" });
  await db.insert(classesTable).values({ id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/ص", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" });

  IDENTITY_1 = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: IDENTITY_1, operationKey: opKey("identity") });
  STUDENT_1 = randomUUID();
  await db.insert(studentsTable).values({ id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "ليلى", lastName: "صوت", studentCode: `VOICE-${randomUUID()}` });
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("membership") });

  const { hashPassword } = await import("@workspace/security");
  USER_TA = randomUUID();
  await db.insert(usersTable).values({ id: USER_TA, tenantId: TENANT_A, firstName: "معلمة", lastName: "صوت", email: `voice-teacher-${randomUUID()}@x.test`, passwordHash: await hashPassword("s3cretpass"), role: "teacher" });
  await db.insert(staffMembershipsTable).values({ id: randomUUID(), tenantId: TENANT_A, userId: USER_TA, schoolId: SCHOOL_A, role: "teacher", scopeType: "CLASS", scopeId: CLASS_A, status: "active", operationKey: opKey("staff") });

  const lesson = await dbmod.createContentDefinition({
    tenantId: TENANT_A, title: "درس القراءة الصوتية — V0.1.4", kind: "LESSON", source: "TEACHER_CREATED",
    curriculum: ANCHOR, createdBy: USER_TA, operationKey: opKey("lesson"),
  });
  LESSON_ID = lesson.content.id;
  await dbmod.publishContent(TENANT_A, LESSON_ID, USER_TA);

  PASSAGE_ID = randomUUID();
  await db.insert(passagesTable).values({
    id: PASSAGE_ID,
    tenantId: TENANT_A,
    teacherId: USER_TA,
    classroomId: CLASS_A,
    title: "مقطع قراءة تجريبي",
    text: EXPECTED_TEXT,
    difficulty: 2,
    grade: "4",
  });

  SESSION_ID = randomUUID();
  await db.insert(readingSessionsTable).values({
    id: SESSION_ID,
    tenantId: TENANT_A,
    studentId: STUDENT_1,
    teacherId: USER_TA,
    sessionType: "reading",
    status: "draft",
    notes: "CORE-34A browser voice upload fixture",
  });

  const reading = await dbmod.createExerciseDefinition({
    tenantId: TENANT_A,
    activityType: "READING",
    engineBinding: "READING",
    expectedResponseType: "VOICE",
    source: "TEACHER_CREATED",
    curriculum: ANCHOR,
    contentId: LESSON_ID,
    createdBy: USER_TA,
    operationKey: opKey("exercise"),
    metadata: {
      passageId: PASSAGE_ID,
      sessionId: SESSION_ID,
      expectedText: EXPECTED_TEXT,
      question: EXPECTED_TEXT,
    },
  });
  EXERCISE_READING = reading.exercise.id;
  await dbmod.publishExercise(TENANT_A, EXERCISE_READING, USER_TA);

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

d("CORE-34A / V0.1.4 — Voice UI browser upload on existing reading async path", () => {
  it("V1. voice activity uses browser file selection + presign upload + REAL async submit", async () => {
    const page: Page = await browser!.newPage();
    let presignedKey = "";
    let uploadBytes = 0;

    await page.route(`${base}/api/audio/presign*`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      presignedKey = url.searchParams.get("key") ?? "";
      expect(req.method()).toBe("GET");
      expect(url.searchParams.get("op")).toBe("putObject");
      expect(presignedKey).toContain("student-ui/");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: `${base}/__fake_signed_upload/${encodeURIComponent(presignedKey)}` }),
      });
    });

    await page.route(`${base}/__fake_signed_upload/*`, async (route) => {
      expect(route.request().method()).toBe("PUT");
      uploadBytes = route.request().postDataBuffer()?.length ?? 0;
      await route.fulfill({ status: 200, body: "" });
    });

    await browserLogin(page);
    await page.waitForSelector("#view-dashboard:not(.hidden)", { timeout: 20000 });
    await page.click("[data-open-lesson]");
    await page.waitForSelector("#view-lesson:not(.hidden)", { timeout: 20000 });
    const lessonText = await page.textContent("#lesson-exercises");
    expect(lessonText).toContain("بدء النشاط الصوتي");
    expect(lessonText).toContain(EXPECTED_TEXT);

    await page.click("[data-start-attempt]");
    await page.waitForSelector("#view-activity:not(.hidden)", { timeout: 20000 });
    expect(await page.isVisible("#activity-voice-mode")).toBe(true);
    expect(await page.isVisible("#activity-text-mode")).toBe(false);
    const meta = await page.textContent("#activity-voice-meta");
    expect(meta).toContain(PASSAGE_ID);
    expect(meta).toContain(SESSION_ID);

    await page.setInputFiles("#activity-audio-file", {
      name: "reading-sample.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFFVOICEPAYLOAD0001", "utf8"),
    });
    const uploadReady = await page.textContent("#activity-upload-status");
    expect(uploadReady).toContain("جاهز للرفع");

    await page.click("#activity-submit");
    await page.waitForSelector("#result-card:not(.hidden)", { timeout: 30000 });
    const result = await page.textContent("#activity-result");
    expect(result).toContain("SUBMITTED");
    expect(result).toContain("ربط ملف القراءة بالمحاولة");
    expect(uploadBytes).toBeGreaterThan(0);
    expect(presignedKey).toContain("reading-sample.wav");

    const rows = await db.select().from(readingAttemptsTable)
      .where(eq(readingAttemptsTable.sessionId, SESSION_ID))
      .orderBy(desc(readingAttemptsTable.createdAt))
      .limit(1);
    expect(rows.length).toBe(1);
    expect(rows[0].audioKey).toBe(presignedKey);
    expect(rows[0].passageId).toBe(PASSAGE_ID);
    expect(rows[0].studentId).toBe(STUDENT_1);
    expect(rows[0].jobStatus).toBe("queued");
    expect(rows[0].correlationId).toBeTruthy();
    await page.close();
  });

  async function browserLogin(page: Page) {
    await page.goto(`${base}/`);
    await page.fill("#login-tenant", TENANT_A);
    await page.fill("#login-identity", IDENTITY_1);
    await page.click("#login-form button[type=submit]");
  }
});
