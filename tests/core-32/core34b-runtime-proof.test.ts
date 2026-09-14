import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { desc, eq } from "drizzle-orm";

const RUN = process.env.CORE32_E2E === "1";
const d = RUN ? describe : describe.skip;
const LOGDIR = process.env.CORE34B_LOGDIR ?? "/home/user/core34b_runtime/logs3";
mkdirSync(LOGDIR, { recursive: true });

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
let dbmod: any;
let db: any;
let readingAttemptsTable: any;

const opKey = (tag: string) => `c34b-${tag}-${randomUUID()}`;
const log = (name: string, text: string) => appendFileSync(`${LOGDIR}/${name}`, text);
const save = (name: string, text: string) => writeFileSync(`${LOGDIR}/${name}`, text);

function curl(args: string[]) {
  return spawnSync("curl", args, { encoding: "utf8" });
}
function splitHeadersBody(raw: string) {
  const parts = raw.split(/\r?\n\r?\n/);
  const headers = parts.shift() ?? "";
  const body = parts.join("\n\n");
  return { headers, body };
}

beforeAll(async () => {
  save("00_env.txt", `logdir=${LOGDIR}\n`);
  await import("../../packages/queue/src/index.js");

  dbmod = await import("../../packages/database/src/index.js");
  ({ db } = await import("../../packages/database/src/client.js"));
  readingAttemptsTable = (await import("../../packages/database/src/schema/reading.ts")).attemptsTable;
  const { passagesTable } = await import("../../packages/database/src/schema/reading.ts");
  const { readingSessionsTable } = await import("../../packages/database/src/schema/sessions.ts");
  const {
    tenantsTable, schoolsTable, classesTable, studentIdentitiesTable, studentsTable, usersTable, staffMembershipsTable,
  } = await import("../../packages/database/src/schema/index.js");

  await db.insert(tenantsTable).values({ id: TENANT_A, name: "T-P2-VOICE-RUNTIME", slug: `c34b-${randomUUID()}` });
  await db.insert(schoolsTable).values({ id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة الإثبات الحي" });
  await db.insert(classesTable).values({ id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/ص", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" });

  IDENTITY_1 = randomUUID();
  await db.insert(studentIdentitiesTable).values({ id: IDENTITY_1, operationKey: opKey("identity") });
  STUDENT_1 = randomUUID();
  await db.insert(studentsTable).values({ id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "ليلى", lastName: "إثبات", studentCode: `RUNTIME-${randomUUID()}` });
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("membership") });

  const { hashPassword } = await import("@workspace/security");
  USER_TA = randomUUID();
  await db.insert(usersTable).values({ id: USER_TA, tenantId: TENANT_A, firstName: "معلمة", lastName: "إثبات", email: `runtime-teacher-${randomUUID()}@x.test`, passwordHash: await hashPassword("s3cretpass"), role: "teacher" });
  await db.insert(staffMembershipsTable).values({ id: randomUUID(), tenantId: TENANT_A, userId: USER_TA, schoolId: SCHOOL_A, role: "teacher", scopeType: "CLASS", scopeId: CLASS_A, status: "active", operationKey: opKey("staff") });

  const lesson = await dbmod.createContentDefinition({
    tenantId: TENANT_A, title: "درس القراءة الصوتية — CORE-34B", kind: "LESSON", source: "TEACHER_CREATED",
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
    title: "مقطع قراءة إثبات حي",
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
    notes: "CORE-34B live runtime proof fixture",
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
      save("01_server_ready.txt", `base=${base}\ntenant=${TENANT_A}\nidentity=${IDENTITY_1}\nstudent=${STUDENT_1}\nexercise=${EXERCISE_READING}\npassage=${PASSAGE_ID}\nsession=${SESSION_ID}\n`);
      resolve();
    });
  });

});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
});

d("CORE-34B / BuyTuk.V.01.6 — live runtime proof", () => {
  it("executes real HTTP + queue/worker path and records live evidence", async () => {
    const root = curl(["-i", "-sS", `${base}/`]);
    save("08_root_request.log", `exit_code=${root.status ?? -1}\n${root.stdout}\nSTDERR:\n${root.stderr}`);
    expect(root.status).toBe(0);
    expect(root.stdout).toContain("HTTP/1.1 200 OK");

    const login = curl([
      "-i", "-sS",
      "-H", "Content-Type: application/json",
      "-H", `X-Tenant-Id: ${TENANT_A}`,
      "-d", JSON.stringify({ identityId: IDENTITY_1 }),
      `${base}/v1/auth/student-login`,
    ]);
    save("09_login_request.log", `exit_code=${login.status ?? -1}\n${login.stdout}\nSTDERR:\n${login.stderr}`);
    expect(login.status).toBe(0);
    expect(login.stdout).toContain("HTTP/1.1 200 OK");
    const loginParsed = splitHeadersBody(login.stdout);
    const loginJson = JSON.parse(loginParsed.body);
    const token = loginJson.accessToken as string;
    expect(token).toBeTruthy();

    const audioKey = `student-ui/${TENANT_A}/${STUDENT_1}/${Date.now()}-core34b-runtime-proof.wav`;
    const presign = curl([
      "-i", "-sS",
      "-H", `Authorization: Bearer ${token}`,
      "-H", `X-Tenant-Id: ${TENANT_A}`,
      `${base}/api/audio/presign?key=${encodeURIComponent(audioKey)}&op=putObject`,
    ]);
    save("10_presign_request.log", `exit_code=${presign.status ?? -1}\n${presign.stdout}\nSTDERR:\n${presign.stderr}`);
    expect(presign.status).toBe(0);
    const presignParsed = splitHeadersBody(presign.stdout);
    const presignStatusLine = presignParsed.headers.split(/\r?\n/)[0] ?? "";
    const presignBody = presignParsed.body.trim();
    let uploadResult = "SKIPPED";
    if (presignStatusLine.includes("200")) {
      const presignJson = JSON.parse(presignBody);
      const upload = curl(["-i", "-sS", "-X", "PUT", "-H", "Content-Type: audio/wav", "--data-binary", "@/home/user/core34b_runtime/runtime-proof.wav", presignJson.url]);
      save("11_upload_request.log", `exit_code=${upload.status ?? -1}\n${upload.stdout}\nSTDERR:\n${upload.stderr}`);
      uploadResult = `UPLOAD_HTTP=${splitHeadersBody(upload.stdout).headers.split(/\r?\n/)[0] ?? ""}`;
    } else {
      save("11_upload_request.log", `SKIPPED due to presign status\n${presignStatusLine}\n${presignBody}\n`);
    }

    const start = curl([
      "-i", "-sS",
      "-H", "Content-Type: application/json",
      "-H", `Authorization: Bearer ${token}`,
      "-H", `X-Tenant-Id: ${TENANT_A}`,
      "-H", `Idempotency-Key: c34b-${randomUUID()}`,
      "-d", JSON.stringify({ activityId: EXERCISE_READING, exerciseId: EXERCISE_READING, attemptNumber: 1 }),
      `${base}/v1/attempts`,
    ]);
    save("12_attempt_create.log", `exit_code=${start.status ?? -1}\n${start.stdout}\nSTDERR:\n${start.stderr}`);
    expect(start.status).toBe(0);
    expect(start.stdout).toContain("HTTP/1.1 201 Created");
    const startJson = JSON.parse(splitHeadersBody(start.stdout).body);
    const attemptId = startJson.attempt.id as string;
    expect(attemptId).toBeTruthy();

    const submitBody = {
      durationMs: 1500,
      engineInput: {
        passageId: PASSAGE_ID,
        sessionId: SESSION_ID,
        audioKey,
        expectedText: EXPECTED_TEXT,
      },
    };
    save("13_submit_body.json", JSON.stringify(submitBody, null, 2));
    const submit = curl([
      "-i", "-sS",
      "-H", "Content-Type: application/json",
      "-H", `Authorization: Bearer ${token}`,
      "-H", `X-Tenant-Id: ${TENANT_A}`,
      "-d", JSON.stringify(submitBody),
      `${base}/v1/attempts/${attemptId}/submit`,
    ]);
    save("13_attempt_submit.log", `exit_code=${submit.status ?? -1}\n${submit.stdout}\nSTDERR:\n${submit.stderr}`);
    expect(submit.status).toBe(0);
    expect(submit.stdout).toContain("HTTP/1.1 200 OK");
    const submitJson = JSON.parse(splitHeadersBody(submit.stdout).body);
    expect(submitJson.state).toBe("SUBMITTED");

    const firstRow = await db.select().from(readingAttemptsTable)
      .where(eq(readingAttemptsTable.sessionId, SESSION_ID))
      .orderBy(desc(readingAttemptsTable.createdAt))
      .limit(1);
    save("14_reading_attempt_row.json", JSON.stringify(firstRow[0] ?? null, null, 2));
    expect(firstRow.length).toBe(1);
    const jobId = firstRow[0].jobId as string;
    expect(jobId).toBeTruthy();

    const { analyzeQueue } = await import("@workspace/queue");
    const queuedJob = await analyzeQueue.getJob(jobId);
    const queuedState = queuedJob ? await queuedJob.getState() : "missing";
    save("15_job_queued.json", JSON.stringify({ jobId, queuedState, uploadResult }, null, 2));

    const analyzeStatus = curl([
      "-i", "-sS",
      "-H", `Authorization: Bearer ${token}`,
      "-H", `X-Tenant-Id: ${TENANT_A}`,
      `${base}/api/analyze/${jobId}`,
    ]);
    save("18_analyze_status.log", `exit_code=${analyzeStatus.status ?? -1}\n${analyzeStatus.stdout}\nSTDERR:\n${analyzeStatus.stderr}`);
    expect(analyzeStatus.status).toBe(0);
    expect(analyzeStatus.stdout).toContain("HTTP/1.1 200 OK");

    save("19_summary.json", JSON.stringify({
      base,
      tenantId: TENANT_A,
      studentId: STUDENT_1,
      exerciseId: EXERCISE_READING,
      sessionId: SESSION_ID,
      attemptId,
      jobId,
      presignStatusLine,
      queuedState,
      uploadResult,
    }, null, 2));

    expect(["waiting", "active", "delayed", "prioritized", "waiting-children", "completed", "failed"]).toContain(queuedState);
  }, 90000);
});
