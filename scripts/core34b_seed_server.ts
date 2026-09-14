import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";

import "@workspace/queue";
import * as dbmod from "@workspace/db";
import { db } from "../packages/database/src/client.ts";
import { passagesTable } from "../packages/database/src/schema/reading.ts";
import { readingSessionsTable } from "../packages/database/src/schema/sessions.ts";
import {
  tenantsTable,
  schoolsTable,
  classesTable,
  studentIdentitiesTable,
  studentsTable,
  usersTable,
  staffMembershipsTable,
} from "../packages/database/src/schema/index.ts";
import { hashPassword } from "@workspace/security";
import app from "../apps/api/src/app.ts";

const outEnv = process.env.RUNTIME_ENV_FILE;
if (!outEnv) throw new Error("RUNTIME_ENV_FILE is required");

const opKey = (tag: string) => `c34b-${tag}-${randomUUID()}`;
const TENANT_A = randomUUID();
const SCHOOL_A = randomUUID();
const CLASS_A = randomUUID();
const EXPECTED_TEXT = "مرحبا بكم في منصة باي توك التعليمية";
const ANCHOR = {
  curriculumId: "cur-eg-ar", curriculumVersion: "2026", country: "EG", educationSystem: "EG-NATIONAL",
  stageKey: "PRIMARY", gradeKey: "EG-PR-04", gradeLevel: "4", subject: "reading", bookId: "bk-r4", unitId: "u-read", lessonId: "les-read-1", objectiveId: "o-read-1",
};

async function main() {
  const IDENTITY_1 = randomUUID();
  const STUDENT_1 = randomUUID();
  const USER_TA = randomUUID();
  const PASSAGE_ID = randomUUID();
  const SESSION_ID = randomUUID();

  await db.insert(tenantsTable).values({ id: TENANT_A, name: "T-P2-VOICE-RUNTIME", slug: `c34b-${randomUUID()}` });
  await db.insert(schoolsTable).values({ id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة الإثبات الحي" });
  await db.insert(classesTable).values({ id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/ص", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" });

  await db.insert(studentIdentitiesTable).values({ id: IDENTITY_1, operationKey: opKey("identity") });
  await db.insert(studentsTable).values({ id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "ليلى", lastName: "إثبات", studentCode: `RUNTIME-${randomUUID()}` });
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("membership") });

  await db.insert(usersTable).values({ id: USER_TA, tenantId: TENANT_A, firstName: "معلمة", lastName: "إثبات", email: `runtime-teacher-${randomUUID()}@x.test`, passwordHash: await hashPassword("s3cretpass"), role: "teacher" });
  await db.insert(staffMembershipsTable).values({ id: randomUUID(), tenantId: TENANT_A, userId: USER_TA, schoolId: SCHOOL_A, role: "teacher", scopeType: "CLASS", scopeId: CLASS_A, status: "active", operationKey: opKey("staff") });

  const lesson = await dbmod.createContentDefinition({
    tenantId: TENANT_A, title: "درس القراءة الصوتية — CORE-34B", kind: "LESSON", source: "TEACHER_CREATED",
    curriculum: ANCHOR, createdBy: USER_TA, operationKey: opKey("lesson"),
  });
  const LESSON_ID = lesson.content.id;
  await dbmod.publishContent(TENANT_A, LESSON_ID, USER_TA);

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
  const EXERCISE_READING = reading.exercise.id;
  await dbmod.publishExercise(TENANT_A, EXERCISE_READING, USER_TA);

  const server = app.listen(0, () => {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    writeFileSync(outEnv, [
      `BASE=${JSON.stringify(base)}`,
      `TENANT_ID=${JSON.stringify(TENANT_A)}`,
      `IDENTITY_ID=${JSON.stringify(IDENTITY_1)}`,
      `STUDENT_ID=${JSON.stringify(STUDENT_1)}`,
      `EXERCISE_ID=${JSON.stringify(EXERCISE_READING)}`,
      `PASSAGE_ID=${JSON.stringify(PASSAGE_ID)}`,
      `SESSION_ID=${JSON.stringify(SESSION_ID)}`,
      `EXPECTED_TEXT=${JSON.stringify(EXPECTED_TEXT)}`,
    ].join("\n") + "\n");
    console.log(`READY base=${base} tenant=${TENANT_A} identity=${IDENTITY_1} student=${STUDENT_1} exercise=${EXERCISE_READING} passage=${PASSAGE_ID} session=${SESSION_ID}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`SHUTDOWN signal=${signal}`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
