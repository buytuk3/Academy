/**
 * PHASE-10 (ENGINES-ASSESSMENT-DICTATION-DIAGNOSIS-CONTENT-LESSON) — per-engine
 * functional gates E2E (acceptance: «per-engine functional gates pass»).
 *
 * REAL browser (Playwright Chromium) + REAL API process (Express serving /v1
 * AND /ui) + REAL PostgreSQL (core32_verify, migrations 0000-0008) + REAL
 * Redis. No mocks. REUSE-FIRST: zero migrations, zero new endpoints, zero new
 * libraries — the three sync engines are already wired in the canonical
 * engine-adapters registry (CORE-25/26B: DICTATION → compareDictation +
 * computeMeasurements, NUMERACY → analyzeNumeracy 16-kind taxonomy, ASSESSMENT
 * → evaluateAssessment rubric) and are invoked ONLY through the canonical
 * /v1/attempts surface (startAttemptExecution / submitAttemptExecution), which
 * resolves the exercise engineBinding and writes canonical Evidence through
 * the single writer. Content/Lesson reuse the CORE-24 content library
 * (content_definitions open registry kinds: PASSAGE / LESSON) via the existing
 * /v1/lessons + /v1/exercises surfaces. READING (async queue path) is already
 * proven by P1/P2 — re-listed here only as a real (possibly empty) library
 * surface, never rebuilt.
 *
 * Gates:
 *   P10-1 content/lesson surfaces: teacher passages + lessons panels render
 *         REAL published content_definitions rows (PASSAGE + LESSON kinds).
 *   P10-2 NUMERACY gate: real student attempt (wrong answer 23*4→91) through
 *         the UI session → EVIDENCE_RECORDED + real evidence row
 *         (sourceEngine numeracy-engine, accuracy 0).
 *   P10-3 DICTATION gate: perfect transcription → EVIDENCE_RECORDED +
 *         evidence row (sourceEngine dictation-engine, accuracy 1).
 *   P10-4 ASSESSMENT gate: 2-item rubric, all correct → EVIDENCE_RECORDED +
 *         evidence row (sourceEngine assessment-engine, rubricScore 1).
 *   P10-5 boundaries + alignment: exercises panel real (3 engines);
 *         analytics real aggregates (CLASS-scope teacher → real empty groups);
 *         voice-qa real READING library surface (empty-real, no mocks);
 *         ratings stays an explicit placeholder (no canonical table — would
 *         need a migration, deferred per ADR-033) re-targeted PHASE-11;
 *         unauthenticated /v1/attempts is 401.
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
const SCHOOL_A = randomUUID();
const CLASS_A = randomUUID();

const ANCHOR = {
  curriculumId: "cur-eg-ar", curriculumVersion: "2026", country: "EG", educationSystem: "EG-NATIONAL",
  stageKey: "PRIMARY", gradeKey: "EG-PR-04", gradeLevel: "4", subject: "math", bookId: "bk-4", unitId: "u1", lessonId: "les-1", objectiveId: "o1",
};

const NUM_TASK = { expression: "23*4", expectedAnswer: "92", domain: "arithmetic", digitSet: "western", question: "كم يساوي 23 × 4؟" };
const DICTATION_TEXT = "محمد رسول الله";
const ASSESSMENT_DEF = {
  definitionId: "asmt-p10-1", title: "تقييم قصير P10", kind: "formative", subject: "math",
  targets: { skills: ["ضرب"] },
  items: [
    { itemRef: "i1", expectedAnswer: "6", scoring: "exact", weight: 1, dimension: "accuracy" },
    { itemRef: "i2", expectedAnswer: "8", scoring: "exact", weight: 1, dimension: "accuracy" },
  ],
  dimensions: ["accuracy"],
  passThreshold: 0.5,
};

let TEACHER_A = { id: "", email: "" };
const STUDENT_A = { identityId: "", studentId: "" };

let PASSAGE_ID = "";
let LESSON_ID = "";
let EX_NUM = "";
let EX_DICT = "";
let EX_ASMT = "";

let server: Server | null = null;
let base = "";
let browser: Browser | null = null;

const opKey = (tag: string) => `p10-${tag}-${randomUUID()}`;

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

async function teacherLogin(page: Page) {
  await page.goto(`${base}/`);
  await page.click("#switch-staff");
  await page.fill("#login-email", TEACHER_A.email);
  await page.fill("#login-password", "s3cretpass");
  await page.click("#login-form button[type=submit]");
  await page.waitForSelector("#view-portal-home:not(.hidden)");
}

beforeAll(async () => {
  const dbmod = await import("../../packages/database/src/index.js");
  const {
    tenantsTable, schoolsTable, classesTable, studentIdentitiesTable, studentsTable, usersTable,
    staffMembershipsTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values({ id: TENANT_A, name: "T-P10-A", slug: `p10a-${randomUUID()}` });
  await db.insert(schoolsTable).values({ id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P10" });
  await db.insert(classesTable).values({ id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P10", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" });

  // REAL student (self login via identity) + REAL teacher (CLASS scope)
  STUDENT_A.identityId = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: STUDENT_A.identityId, operationKey: opKey("id") });
  STUDENT_A.studentId = randomUUID();
  await db.insert(studentsTable).values({
    id: STUDENT_A.studentId, tenantId: TENANT_A, classId: CLASS_A, identityId: STUDENT_A.identityId,
    firstName: "سالم", lastName: "P10", studentCode: `P10-${randomUUID()}`,
  });
  await dbmod.startMembership({
    identityId: STUDENT_A.identityId, tenantId: TENANT_A, studentId: STUDENT_A.studentId,
    schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m"),
  });

  const { hashPassword } = await import("@workspace/security");
  TEACHER_A.id = randomUUID();
  TEACHER_A.email = `p10-teacher-${randomUUID()}@x.test`;
  await db.insert(usersTable).values({
    id: TEACHER_A.id, tenantId: TENANT_A, firstName: "معلمة", lastName: "P10", email: TEACHER_A.email,
    passwordHash: await hashPassword("s3cretpass"), role: "teacher",
  });
  await db.insert(staffMembershipsTable).values({
    id: randomUUID(), tenantId: TENANT_A, userId: TEACHER_A.id, schoolId: SCHOOL_A,
    role: "teacher", scopeType: "CLASS", scopeId: CLASS_A, status: "active", operationKey: opKey("sm"),
  });

  // REAL canonical content (PASSAGE + LESSON) through the CORE-24 capabilities
  const passage = await dbmod.createContentDefinition({
    tenantId: TENANT_A, title: "نص إملاء P10", kind: "PASSAGE", source: "TEACHER_CREATED",
    curriculum: ANCHOR, createdBy: TEACHER_A.id, operationKey: opKey("passage"),
  });
  PASSAGE_ID = passage.content.id;
  await dbmod.publishContent(TENANT_A, PASSAGE_ID, TEACHER_A.id);

  const lesson = await dbmod.createContentDefinition({
    tenantId: TENANT_A, title: "درس المحركات P10", kind: "LESSON", source: "TEACHER_CREATED",
    curriculum: ANCHOR, createdBy: TEACHER_A.id, operationKey: opKey("lesson"),
  });
  LESSON_ID = lesson.content.id;
  await dbmod.publishContent(TENANT_A, LESSON_ID, TEACHER_A.id);

  // REAL engine-bound exercises (the engines are chosen by the canonical binding)
  const exN = await dbmod.createExerciseDefinition({
    tenantId: TENANT_A, activityType: "MATHEMATICS", engineBinding: "NUMERACY",
    expectedResponseType: "TYPED", source: "TEACHER_CREATED", curriculum: ANCHOR,
    contentId: LESSON_ID, createdBy: TEACHER_A.id, operationKey: opKey("exn"),
    metadata: { ...NUM_TASK },
  });
  EX_NUM = exN.exercise.id;
  await dbmod.publishExercise(TENANT_A, EX_NUM, TEACHER_A.id);

  const exD = await dbmod.createExerciseDefinition({
    tenantId: TENANT_A, activityType: "DICTATION", engineBinding: "DICTATION",
    expectedResponseType: "TYPED", source: "TEACHER_CREATED", curriculum: ANCHOR,
    contentId: PASSAGE_ID, createdBy: TEACHER_A.id, operationKey: opKey("exd"),
    metadata: { expected: DICTATION_TEXT, language: "ar" },
  });
  EX_DICT = exD.exercise.id;
  await dbmod.publishExercise(TENANT_A, EX_DICT, TEACHER_A.id);

  const exA = await dbmod.createExerciseDefinition({
    tenantId: TENANT_A, activityType: "ASSESSMENT", engineBinding: "ASSESSMENT",
    expectedResponseType: "TYPED", source: "TEACHER_CREATED", curriculum: ANCHOR,
    contentId: LESSON_ID, createdBy: TEACHER_A.id, operationKey: opKey("exa"),
    metadata: { definition: ASSESSMENT_DEF },
  });
  EX_ASMT = exA.exercise.id;
  await dbmod.publishExercise(TENANT_A, EX_ASMT, TEACHER_A.id);

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

/** Real student session → start + submit one engine attempt through /v1 (real API, real state machine). */
async function runEngineAttempt(page: Page, exerciseId: string, engineInput: unknown, attemptNumber = 1): Promise<{ status: number; state: string | null }> {
  const tok = await sessionToken(page);
  const res = await page.evaluate(
    async ({ t, tenant, activity, exercise, payload, attemptNumber }) => {
      const H = { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "X-Tenant-Id": tenant, "Idempotency-Key": crypto.randomUUID() };
      const r1 = await fetch("/v1/attempts", {
        method: "POST", headers: H,
        body: JSON.stringify({ activityId: activity, exerciseId: exercise, attemptNumber }),
      });
      const start = await r1.json();
      if (r1.status !== 201 && r1.status !== 200) return { status: r1.status, state: null, startError: start?.error?.code ?? JSON.stringify(start).slice(0, 120) };
      const r2 = await fetch(`/v1/attempts/${start.attempt.id}/submit`, {
        method: "POST", headers: H,
        body: JSON.stringify(payload),
      });
      const fin = await r2.json();
      return { status: r2.status, state: fin?.state ?? null, submitError: fin?.error?.code ?? null };
    },
    { t: tok, tenant: TENANT_A, activity: LESSON_ID, exercise: exerciseId, payload: { engineInput, durationMs: 5000 }, attemptNumber },
  );
  return { status: res.status, state: res.state };
}


/** Evidence measurement reader: runtime stores adapter measurements in metadata.measurements (canonical single source). */
function accOf(row: { metadata?: { measurements?: unknown } | null; measurements?: unknown } | null | undefined): number {
  const m = row?.metadata?.measurements ?? row?.measurements;
  if (m && typeof m === "object" && !Array.isArray(m)) return Number((m as Record<string, unknown>).accuracy);
  if (Array.isArray(m)) return Number((m.find((x) => (x as { dimension?: string })?.dimension === "accuracy") as { value?: number } | undefined)?.value ?? NaN);
  return NaN;
}

d("PHASE-10 — Engines (assessment/dictation/diagnosis/content/lesson): per-engine functional gates (real browser + real API + real PG/Redis)", () => {
  it("P10-1 [content/lesson surfaces]: teacher passages + lessons panels render REAL published content", async () => {
    const page = await browser!.newPage();
    await teacherLogin(page);
    await page.click('[data-portal-cap="passages"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("نص إملاء P10"));
    const passages = await page.textContent("#portal-capability-panel");
    expect(passages).not.toContain("غير مدعومة بعد");
    await page.click('[data-portal-cap="lessons"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("درس المحركات P10"));
    const lessons = await page.textContent("#portal-capability-panel");
    expect(lessons).not.toContain("غير مدعومة بعد");
    await page.close();
  });

  it("P10-2 [NUMERACY gate]: real student attempt (wrong answer) → EVIDENCE_RECORDED + canonical evidence row", async () => {
    const page = await browser!.newPage();
    await page.goto(`${base}/`);
    await page.fill("#login-tenant", TENANT_A);
    await page.fill("#login-identity", STUDENT_A.identityId);
    await page.click("#login-form button[type=submit]");
    await page.waitForSelector("#view-dashboard:not(.hidden)", { timeout: 20000 });

    const r = await runEngineAttempt(page, EX_NUM, {
      task: { expression: "23*4", domain: "arithmetic", expectedAnswer: "92", digitSet: "western" },
      response: { finalAnswer: "91" }, // WRONG on purpose → accuracy 0
      timing: { durationMs: 5000 },
    }, 1);
    expect(r.status, JSON.stringify(r)).toBe(200);
    expect(r.state).toBe("EVIDENCE_RECORDED");

    const dbmod = await import("../../packages/database/src/index.js");
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A.studentId });
    const num = rows.find((e) => e.sourceEngine === "numeracy-engine");
    expect(num, "canonical numeracy evidence row must exist").toBeTruthy();
    expect(accOf(num)).toBe(0); // wrong answer measured by the real engine
    await page.close();
  });

  it("P10-3 [DICTATION gate]: perfect transcription → EVIDENCE_RECORDED + canonical evidence row (accuracy 1)", async () => {
    const page = await browser!.newPage();
    await page.goto(`${base}/`);
    await page.fill("#login-tenant", TENANT_A);
    await page.fill("#login-identity", STUDENT_A.identityId);
    await page.click("#login-form button[type=submit]");
    await page.waitForSelector("#view-dashboard:not(.hidden)", { timeout: 20000 });

    const r = await runEngineAttempt(page, EX_DICT, {
      expected: DICTATION_TEXT, actual: DICTATION_TEXT, language: "ar",
      timing: { listeningDurationMs: 800, responseDurationMs: 1200, totalActivityDurationMs: 3000, replayCount: 0 },
    }, 2);
    expect(r.status, JSON.stringify(r)).toBe(200);
    expect(r.state).toBe("EVIDENCE_RECORDED");

    const dbmod = await import("../../packages/database/src/index.js");
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A.studentId });
    const dict = rows.find((e) => e.sourceEngine === "dictation-engine");
    expect(dict, "canonical dictation evidence row must exist").toBeTruthy();
    expect(accOf(dict)).toBe(1); // perfect transcription measured by the real engine
    await page.close();
  });

  it("P10-4 [ASSESSMENT gate]: 2-item rubric all-correct → EVIDENCE_RECORDED + canonical evidence row (rubricScore 1)", async () => {
    const page = await browser!.newPage();
    await page.goto(`${base}/`);
    await page.fill("#login-tenant", TENANT_A);
    await page.fill("#login-identity", STUDENT_A.identityId);
    await page.click("#login-form button[type=submit]");
    await page.waitForSelector("#view-dashboard:not(.hidden)", { timeout: 20000 });

    const r = await runEngineAttempt(page, EX_ASMT, {
      definition: ASSESSMENT_DEF,
      response: { items: [{ itemRef: "i1", response: "6" }, { itemRef: "i2", response: "8" }] },
      timing: { durationMs: 4000 },
    }, 3);
    expect(r.status, JSON.stringify(r)).toBe(200);
    expect(r.state).toBe("EVIDENCE_RECORDED");

    const dbmod = await import("../../packages/database/src/index.js");
    const rows = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A.studentId });
    const asmt = rows.find((e) => e.sourceEngine === "assessment-engine");
    expect(asmt, "canonical assessment evidence row must exist").toBeTruthy();
    const rub = Number((asmt?.metadata?.measurements as Record<string, unknown> | null | undefined)?.rubricScore);
    expect(rub).toBe(1); // all-correct rubric measured by the real engine
    await page.close();
  });

  it("P10-5 [boundaries + alignment]: exercises panel real (3 engines); analytics real; voice-qa real-empty; ratings explicit PHASE-11 placeholder; /v1/attempts anon 401", async () => {
    const page = await browser!.newPage();
    await teacherLogin(page);

    // exercises → real library list carrying the three engine bindings
    await page.click('[data-portal-cap="exercises"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("NUMERACY"));
    const ex = await page.textContent("#portal-capability-panel");
    expect(ex).toContain("DICTATION");
    expect(ex).toContain("ASSESSMENT");
    expect(ex).not.toContain("غير مدعومة بعد");

    // analytics → REAL aggregates call (CLASS-scope teacher → real empty groups, no fabrication)
    await page.click('[data-portal-cap="analytics"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("مجموعات الإشراف"));
    const an = await page.textContent("#portal-capability-panel");
    expect(an).not.toContain("غير مدعومة بعد");
    expect(an).not.toContain("تعذر");

    // voice-qa → REAL READING-bound library surface (empty-real; READING engine itself is proven async in P1/P2)
    await page.click('[data-portal-cap="voice-qa"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("القراءة الصوتية"));
    const vq = await page.textContent("#portal-capability-panel");
    expect(vq).not.toContain("غير مدعومة بعد");

    // ratings → NO canonical table exists (would require a migration — deferred per ADR-033): explicit placeholder, re-targeted PHASE-11
    /* PHASE-11 EVOLUTION (ADR-034): ratings is now a REAL surface (ADR-033
     * re-target honored) — the alignment assertion moves from placeholder to
     * REAL data. */
    await page.click('[data-portal-cap="ratings"]');
    await page.waitForFunction(() => (document.getElementById("portal-capability-panel")?.textContent ?? "").includes("تقييمات المعلمين"), { timeout: 20000 });
    expect(await page.textContent("#portal-capability-panel")).not.toContain("غير مدعومة بعد");
    await page.close();

    // boundaries: unauthenticated attempt start is a real 401 from the API
    const anonPage = await browser!.newPage();
    await anonPage.goto(`${base}/`);
    const anon = await anonPage.evaluate(() =>
      fetch("/v1/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.status),
    );
    expect(anon).toBe(401);
    await anonPage.close();
  });
});
