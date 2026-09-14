/**
 * CORE-29 / E2 — Learner Model API: FULL read-only HTTP proof.
 * Real PostgreSQL (core29_verify) + real Redis + real HTTP. Nothing mocked.
 *
 * Proves (owner-approved E2 plan):
 *   S1  Student reads OWN model → 200, canonical shape (ISO dates, camelCase),
 *       NO overallScore / NO student_level anywhere in the flat JSON,
 *       rule-derived levels (math strong / reading weak / dictation insufficient),
 *       teacher interpretation surfaced EXTERNALLY (never merged into a level).
 *   S2  Determinism: same evidence ⇒ identical dimensions (only builtAt moves).
 *   S3  Updated student state: NEW canonical evidence ⇒ model reflects it
 *       (trend IMPROVING, recentMean > olderMean, sampleCount grows) — momentary
 *       projection, no store.
 *   S4  Tenant isolation: tenant-B model contains zero tenant-A data.
 *   S5  Staff in scope (CLASS) → 200; staff out of scope (other class) → 403
 *       STUDENT_DETAIL_ACCESS_DENIED; cross-tenant staff → 404 STUDENT_NOT_FOUND_IN_TENANT.
 *   N1  Student principal reading ANOTHER student → 403 STUDENT_DETAIL_ACCESS_DENIED.
 *   N2  Malformed path UUID (staff) → 400 INVALID_STUDENT_ID (never a 500).
 *   N3  Unauthenticated → 401.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const RUN = process.env.CORE29_E2E === "1";
const d = RUN ? describe : describe.skip;

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
let dbmod: any, db: any;
let IDENTITY_1: string, STUDENT_1: string, CLASS_A: string, SCHOOL_A: string;
let IDENTITY_B1: string, STUDENT_B1: string, CLASS_B: string, SCHOOL_B: string;
let USER_TA: string, USER_TB: string, USER_TC: string;
let STUDENT_TOKEN = "", TEACHER_A_TOKEN = "", TEACHER_B_TOKEN = "", TEACHER_C_TOKEN = "";
let base = "";
let server: Server | null = null;
const TEACHER_A_EMAIL = `e2-ta-${randomUUID()}@x.test`;
const TEACHER_B_EMAIL = `e2-tb-${randomUUID()}@x.test`;
const TEACHER_C_EMAIL = `e2-tc-${randomUUID()}@x.test`;
const opKey = (tag: string) => `c29-${tag}-${randomUUID()}`;

async function api(method: string, path: string, opts: { body?: unknown; token?: string; tenant?: string } = {}): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.tenant) headers["x-tenant-id"] = opts.tenant;
  const res = await fetch(base + path, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json };
}

/** Canonical assessment evidence through the ONLY legal writer. */
async function accuracyEvidence(studentId: string, tenantId: string, accuracy: number, day: number): Promise<void> {
  await dbmod.recordEvidence({
    tenantId, studentId, actorRole: "student",
    occurredAt: new Date(Date.UTC(2026, 8, day, 10, 0, 0)),
    evidenceType: "assessment", subject: "reading",
    response: { accuracy },
    sourceEngine: "e2-cycle", tool: "core-29", operationKey: opKey("asm"),
  });
}

d("CORE-29 / E2: Learner Model API — full read-only HTTP proof", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    const { tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable } = dbmod;

    await db.insert(tenantsTable).values([
      { id: TENANT_A, name: "C29 مستأجر A", slug: `c29a-${randomUUID()}` },
      { id: TENANT_B, name: "C29 مستأجر B", slug: `c29b-${randomUUID()}` },
    ]);
    SCHOOL_A = randomUUID(); CLASS_A = randomUUID();
    await db.insert(schoolsTable).values({ id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة E2-A" });
    await db.insert(classesTable).values({ id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" });
    IDENTITY_1 = randomUUID();
    await db.insert(studentIdentitiesTable).values({ id: IDENTITY_1, operationKey: opKey("id1") });
    STUDENT_1 = randomUUID();
    await db.insert(studentsTable).values({ id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "سالم", lastName: "E2", studentCode: `E2-${randomUUID()}` });
    await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });

    // Tenant B (isolation proof).
    SCHOOL_B = randomUUID(); CLASS_B = randomUUID();
    await db.insert(schoolsTable).values({ id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة E2-B" });
    await db.insert(classesTable).values({ id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" });
    IDENTITY_B1 = randomUUID();
    await db.insert(studentIdentitiesTable).values({ id: IDENTITY_B1, operationKey: opKey("idb") });
    STUDENT_B1 = randomUUID();
    await db.insert(studentsTable).values({ id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "باسم", lastName: "E2B", studentCode: `E2B-${randomUUID()}` });
    await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

    // Staff: A (in scope, CLASS_A), B (tenant B), C (tenant A, OTHER class scope).
    const { hashPassword } = await import("@workspace/security");
    USER_TA = randomUUID(); USER_TB = randomUUID(); USER_TC = randomUUID();
    await db.insert(usersTable).values([
      { id: USER_TA, tenantId: TENANT_A, firstName: "معلمة", lastName: "A", email: TEACHER_A_EMAIL, passwordHash: await hashPassword("s3cretpass"), role: "teacher" },
      { id: USER_TB, tenantId: TENANT_B, firstName: "معلم", lastName: "B", email: TEACHER_B_EMAIL, passwordHash: await hashPassword("s3cretpass"), role: "teacher" },
      { id: USER_TC, tenantId: TENANT_A, firstName: "معلمة", lastName: "C", email: TEACHER_C_EMAIL, passwordHash: await hashPassword("s3cretpass"), role: "teacher" },
    ]);
    await db.insert(dbmod.staffMembershipsTable).values([
      { id: randomUUID(), tenantId: TENANT_A, userId: USER_TA, schoolId: SCHOOL_A, role: "teacher", scopeType: "CLASS", scopeId: CLASS_A, status: "active", operationKey: opKey("sma") },
      { id: randomUUID(), tenantId: TENANT_B, userId: USER_TB, schoolId: SCHOOL_B, role: "teacher", scopeType: "CLASS", scopeId: CLASS_B, status: "active", operationKey: opKey("smb") },
      { id: randomUUID(), tenantId: TENANT_A, userId: USER_TC, schoolId: SCHOOL_A, role: "teacher", scopeType: "CLASS", scopeId: randomUUID(), status: "active", operationKey: opKey("smc") }, // scope ≠ CLASS_A → out of scope
    ]);

    // Canonical evidence for student A (tenant A): math strong (0.9+), reading weak (0.4x), + teacher-source interpretation.
    for (const [day, v] of [[1, 0.9], [2, 0.92], [3, 0.95]] as const) {
      await dbmod.recordEvidence({
        tenantId: TENANT_A, studentId: STUDENT_1, actorRole: "student",
        occurredAt: new Date(Date.UTC(2026, 8, day, 9, 0, 0)),
        evidenceType: "assessment", subject: "mathematics",
        response: { numeracy: v },
        sourceEngine: "e2-cycle", tool: "core-29", operationKey: opKey("math"),
      });
    }
    for (const [day, v] of [[1, 0.4], [2, 0.42], [3, 0.45]] as const) {
      await accuracyEvidence(STUDENT_1, TENANT_A, v, day);
    }
    await dbmod.recordEvidence({
      tenantId: TENANT_A, studentId: STUDENT_1, actorId: USER_TA, actorRole: "teacher",
      occurredAt: new Date(Date.UTC(2026, 8, 4, 9, 0, 0)),
      evidenceType: "response", subject: "reading",
      response: { skill: "reading.accuracy", interpretationSource: "TEACHER", claimedLevel: "weak", note: "يحتاج دعمًا في القراءة" },
      sourceEngine: "teacher", tool: "teacher-e2", operationKey: opKey("teach"),
    });

    const { default: app } = await import("../../apps/api/src/app.js");
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
        resolve();
      });
    });

    const sLogin = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_1 }, tenant: TENANT_A });
    expect(sLogin.status).toBe(200);
    STUDENT_TOKEN = sLogin.json.accessToken;
    const sbLogin = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_B1 }, tenant: TENANT_B });
    expect(sbLogin.status).toBe(200);
    (globalThis as any).__STUDENT_B_TOKEN = sbLogin.json.accessToken;
    for (const [tok, email] of [["TEACHER_A_TOKEN", TEACHER_A_EMAIL], ["TEACHER_B_TOKEN", TEACHER_B_EMAIL], ["TEACHER_C_TOKEN", TEACHER_C_EMAIL]] as const) {
      const l = await api("POST", "/v1/auth/login", { body: { email, password: "s3cretpass" } });
      expect(l.status).toBe(200);
      if (tok === "TEACHER_A_TOKEN") TEACHER_A_TOKEN = l.json.accessToken;
      if (tok === "TEACHER_B_TOKEN") TEACHER_B_TOKEN = l.json.accessToken;
      if (tok === "TEACHER_C_TOKEN") TEACHER_C_TOKEN = l.json.accessToken;
    }
  });

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
  });

  it("E2-S1: student reads OWN learner-model → 200 canonical shape, rule levels, NO overall score, teacher interpretation external", async () => {
    const r = await api("GET", `/v1/students/${STUDENT_1}/learner-model`, { token: STUDENT_TOKEN });
    expect(r.status).toBe(200);
    const m = r.json;
    expect(m.tenantId).toBe(TENANT_A);
    expect(m.studentId).toBe(STUDENT_1);
    expect(m.interpretationSource).toBe("RULE");
    expect(new Date(m.builtAt).getTime()).toBeGreaterThan(0);
    // Anti-score invariant over the FLAT JSON (core-09 pattern, over HTTP).
    const flat = JSON.stringify(m);
    expect(flat.includes("overallScore")).toBe(false);
    expect(flat.includes("student_level")).toBe(false);
    // Rule-derived levels.
    const acc = m.dimensions.find((x: any) => x.subject === "reading" && x.dimension === "accuracy");
    expect(acc.level).toBe("weak");
    expect(acc.sampleCount).toBe(3);
    const num = m.dimensions.find((x: any) => x.subject === "mathematics" && x.dimension === "numeracy");
    expect(num.level).toBe("strong");
    const dic = m.dimensions.find((x: any) => x.subject === "dictation" && x.dimension === "accuracy");
    expect(dic.level).toBe("insufficient");
    expect(dic.trend).toBe("INSUFFICIENT_EVIDENCE");
    // Teacher interpretation EXTERNAL — never merged into the rule level.
    expect(m.teacherInterpretations.length).toBe(1);
    expect(m.teacherInterpretations[0].source).toBe("TEACHER");
    expect(m.teacherInterpretations[0].claimedLevel).toBe("weak");
    expect(acc.interpretationSource).toBe("RULE"); // level untouched by the teacher row
    // ISO date convention.
    expect(new Date(acc.from).toISOString()).toBe(acc.from);
  });

  it("E2-S2: determinism — same evidence ⇒ identical dimensions (only builtAt moves)", async () => {
    const a = await api("GET", `/v1/students/${STUDENT_1}/learner-model`, { token: STUDENT_TOKEN });
    const b = await api("GET", `/v1/students/${STUDENT_1}/learner-model`, { token: STUDENT_TOKEN });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.json.dimensions).toEqual(a.json.dimensions);
    expect(new Date(b.json.builtAt).getTime()).toBeGreaterThanOrEqual(new Date(a.json.builtAt).getTime());
  });

  it("E2-S3: updated student state — NEW canonical evidence ⇒ projection reflects it (momentary, no store)", async () => {
    for (const [day, v] of [[5, 0.88], [6, 0.91], [7, 0.93]] as const) {
      await accuracyEvidence(STUDENT_1, TENANT_A, v, day);
    }
    const r = await api("GET", `/v1/students/${STUDENT_1}/learner-model`, { token: STUDENT_TOKEN });
    expect(r.status).toBe(200);
    const acc = r.json.dimensions.find((x: any) => x.subject === "reading" && x.dimension === "accuracy");
    expect(acc.sampleCount).toBe(6);
    expect(acc.trend).toBe("IMPROVING");
    expect(acc.recentMean ?? -1).toBeGreaterThan(acc.olderMean ?? 2);
    expect(acc.level).toBe("strong");
  });

  it("E2-S5a: staff IN scope (CLASS teacher A) → 200", async () => {
    const r = await api("GET", `/v1/students/${STUDENT_1}/learner-model`, { token: TEACHER_A_TOKEN });
    expect(r.status).toBe(200);
    expect(r.json.studentId).toBe(STUDENT_1);
  });

  it("E2-S5b: staff OUT of scope (teacher C, other class, same tenant) → 403 STUDENT_DETAIL_ACCESS_DENIED", async () => {
    const r = await api("GET", `/v1/students/${STUDENT_1}/learner-model`, { token: TEACHER_C_TOKEN });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("STUDENT_DETAIL_ACCESS_DENIED");
  });

  it("E2-S5c: cross-tenant staff (teacher B) → 404 STUDENT_NOT_FOUND_IN_TENANT (no existence leak)", async () => {
    const r = await api("GET", `/v1/students/${STUDENT_1}/learner-model`, { token: TEACHER_B_TOKEN });
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe("STUDENT_NOT_FOUND_IN_TENANT");
  });

  it("E2-N1: student principal reading ANOTHER student → 403 STUDENT_DETAIL_ACCESS_DENIED", async () => {
    const bTok = (globalThis as any).__STUDENT_B_TOKEN;
    const r = await api("GET", `/v1/students/${STUDENT_1}/learner-model`, { token: bTok });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("STUDENT_DETAIL_ACCESS_DENIED");
  });

  it("E2-N2: malformed path UUID (staff) → 400 INVALID_STUDENT_ID (never a 500)", async () => {
    const r = await api("GET", "/v1/students/not-a-uuid/learner-model", { token: TEACHER_A_TOKEN });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("INVALID_STUDENT_ID");
  });

  it("E2-N3: unauthenticated → 401", async () => {
    const r = await api("GET", `/v1/students/${STUDENT_1}/learner-model`);
    expect(r.status).toBe(401);
  });

  it("E2-S4: tenant isolation — tenant-B model contains ZERO tenant-A data", async () => {
    const bTok = (globalThis as any).__STUDENT_B_TOKEN;
    const r = await api("GET", `/v1/students/${STUDENT_B1}/learner-model`, { token: bTok });
    expect(r.status).toBe(200);
    const m = r.json;
    expect(m.tenantId).toBe(TENANT_B);
    expect(m.studentId).toBe(STUDENT_B1);
    const allRefs = m.dimensions.flatMap((x: any) => x.evidenceRefs);
    expect(allRefs.length).toBe(0); // no B evidence exists — nothing leaks from A
    const num = m.dimensions.find((x: any) => x.subject === "mathematics" && x.dimension === "numeracy");
    expect(num.level).toBe("insufficient"); // A's strong math does NOT leak
  });
});
