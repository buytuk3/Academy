/**
 * CORE-30 / E3-P0 — Student Progress + Recommendations over REAL HTTP.
 * Real PostgreSQL (core30_verify) + real Redis. Nothing mocked.
 *
 * Proves (P0 learning-loop visibility legs):
 *   S1  GET /students/{id}/progress → 200 canonical SLR shape: strands per
 *       skill with MULTIDIMENSIONAL indicators (never an overall score),
 *       events = references into the canonical evidence log (ISO dates).
 *   S2  GET /students/{id}/recommendations → 200 items DERIVED from the
 *       student's ACTUAL evidence (patterns → path proposals), every item
 *       requiresTeacherApproval:true (Decision Gate intact, never auto-executed).
 *   S3  Updated state: NEW evidence ⇒ progress reflects it (momentary, no store).
 *   S4  Tenant isolation: tenant-B progress/recommendations contain ZERO tenant-A data.
 *   NEG: student-B token on A → 403 · out-of-scope staff → 403 · cross-tenant
 *        staff → 404 · malformed UUID → 400 · unauthenticated → 401.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const RUN = process.env.CORE30_E2E === "1";
const d = RUN ? describe : describe.skip;

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
let dbmod: any, db: any;
let IDENTITY_1: string, STUDENT_1: string, CLASS_A: string, SCHOOL_A: string;
let IDENTITY_B1: string, STUDENT_B1: string, CLASS_B: string, SCHOOL_B: string;
let USER_TA: string, USER_TB: string, USER_TC: string;
let STUDENT_TOKEN = "", TEACHER_A_TOKEN = "", TEACHER_B_TOKEN = "", TEACHER_C_TOKEN = "", STUDENT_B_TOKEN = "";
let base = "";
let server: Server | null = null;
const TEACHER_A_EMAIL = `e3-ta-${randomUUID()}@x.test`;
const TEACHER_B_EMAIL = `e3-tb-${randomUUID()}@x.test`;
const TEACHER_C_EMAIL = `e3-tc-${randomUUID()}@x.test`;
const opKey = (tag: string) => `c30-${tag}-${randomUUID()}`;

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

/** Canonical evidence through the ONLY legal writer. */
const A_EVIDENCE_IDS: string[] = [];
async function assessment(studentId: string, tenantId: string, subject: string, metric: string, value: number, day: number, hour = 10): Promise<any> {
  const row = await dbmod.recordEvidence({
    tenantId, studentId, actorRole: "student",
    occurredAt: new Date(Date.UTC(2026, 8, day, hour, 0, 0)),
    evidenceType: "assessment", subject,
    response: { [metric]: value },
    sourceEngine: "e3-cycle", tool: "core-30", operationKey: opKey("asm"),
  });
  if (tenantId === TENANT_A) A_EVIDENCE_IDS.push(row.id);
  return row;
}
async function mistake(studentId: string, tenantId: string, skill: string, day: number, hour: number): Promise<any> {
  const row = await dbmod.recordEvidence({
    tenantId, studentId, actorRole: "student",
    occurredAt: new Date(Date.UTC(2026, 8, day, hour, 0, 0)),
    evidenceType: "mistake", subject: "reading",
    response: { skill, errorType: "SUBSTITUTION" },
    sourceEngine: "e3-cycle", tool: "core-30", operationKey: opKey("mist"),
  });
  if (tenantId === TENANT_A) A_EVIDENCE_IDS.push(row.id);
  return row;
}

d("CORE-30 / E3-P0: student progress + recommendations over real HTTP", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    const { tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable } = dbmod;

    await db.insert(tenantsTable).values([
      { id: TENANT_A, name: "C30 مستأجر A", slug: `c30a-${randomUUID()}` },
      { id: TENANT_B, name: "C30 مستأجر B", slug: `c30b-${randomUUID()}` },
    ]);
    SCHOOL_A = randomUUID(); CLASS_A = randomUUID();
    await db.insert(schoolsTable).values({ id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة E3-A" });
    await db.insert(classesTable).values({ id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" });
    IDENTITY_1 = randomUUID();
    await db.insert(studentIdentitiesTable).values({ id: IDENTITY_1, operationKey: opKey("id1") });
    STUDENT_1 = randomUUID();
    await db.insert(studentsTable).values({ id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "سالم", lastName: "E3", studentCode: `E3-${randomUUID()}` });
    await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });

    SCHOOL_B = randomUUID(); CLASS_B = randomUUID();
    await db.insert(schoolsTable).values({ id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة E3-B" });
    await db.insert(classesTable).values({ id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" });
    IDENTITY_B1 = randomUUID();
    await db.insert(studentIdentitiesTable).values({ id: IDENTITY_B1, operationKey: opKey("idb") });
    STUDENT_B1 = randomUUID();
    await db.insert(studentsTable).values({ id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "باسم", lastName: "E3B", studentCode: `E3B-${randomUUID()}` });
    await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

    // Tenant-B OWN evidence — the isolation proof: B's surfaces must carry ONLY these values.
    for (const [day, v] of [[2, 0.7], [3, 0.72], [4, 0.74]] as const) await assessment(STUDENT_B1, TENANT_B, "reading", "accuracy", v, day);

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
      { id: randomUUID(), tenantId: TENANT_A, userId: USER_TC, schoolId: SCHOOL_A, role: "teacher", scopeType: "CLASS", scopeId: randomUUID(), status: "active", operationKey: opKey("smc") },
    ]);

    // REAL evidence for student A: math strong (0.9x), reading weak (0.4x), 3 repeated mistakes on reading.accuracy.
    for (const [day, v] of [[1, 0.9], [2, 0.92], [3, 0.95]] as const) await assessment(STUDENT_1, TENANT_A, "mathematics", "numeracy", v, day, 9);
    for (const [day, v] of [[1, 0.4], [2, 0.42], [3, 0.45]] as const) await assessment(STUDENT_1, TENANT_A, "reading", "accuracy", v, day);
    for (const [day, hour] of [[4, 8], [4, 9], [4, 10]] as const) await mistake(STUDENT_1, TENANT_A, "reading.accuracy", day, hour);
    const teachRow = await dbmod.recordEvidence({
      tenantId: TENANT_A, studentId: STUDENT_1, actorId: USER_TA, actorRole: "teacher",
      occurredAt: new Date(Date.UTC(2026, 8, 5, 9, 0, 0)),
      evidenceType: "response", subject: "reading",
      response: { skill: "reading.accuracy", interpretationSource: "TEACHER", claimedLevel: "weak", note: "دعم قراءة مطلوب" },
      sourceEngine: "teacher", tool: "teacher-e3", operationKey: opKey("teach"),
    });
    A_EVIDENCE_IDS.push((teachRow as any).id);

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
    STUDENT_B_TOKEN = sbLogin.json.accessToken;
    for (const [tok, email] of [["A", TEACHER_A_EMAIL], ["B", TEACHER_B_EMAIL], ["C", TEACHER_C_EMAIL]] as const) {
      const l = await api("POST", "/v1/auth/login", { body: { email, password: "s3cretpass" } });
      expect(l.status).toBe(200);
      if (tok === "A") TEACHER_A_TOKEN = l.json.accessToken;
      if (tok === "B") TEACHER_B_TOKEN = l.json.accessToken;
      if (tok === "C") TEACHER_C_TOKEN = l.json.accessToken;
    }
  });

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
  });

  it("E3-S1: student progress → 200 canonical SLR shape, multidimensional strands, NO overall score", async () => {
    const r = await api("GET", `/v1/students/${STUDENT_1}/progress`, { token: STUDENT_TOKEN });
    expect(r.status).toBe(200);
    const p = r.json;
    expect(p.tenantId).toBe(TENANT_A);
    expect(p.studentId).toBe(STUDENT_1);
    expect(new Date(p.builtAt).getTime()).toBeGreaterThan(0);
    const flat = JSON.stringify(p);
    expect(flat.includes("overallScore")).toBe(false);
    expect(flat.includes("student_level")).toBe(false);
    // Reading strand: real evidence counts + exact indicator values.
    const reading = p.strands.find((s: any) => s.subject === "reading");
    expect(reading).toBeTruthy();
    expect(reading.progress.evidenceCount).toBeGreaterThanOrEqual(4); // 3 assessments + 3 mistakes + teacher row
    const acc = reading.progress.indicators.find((i: any) => i.metric === "accuracy");
    expect(acc).toBeTruthy();
    expect(acc.values).toEqual([0.4, 0.42, 0.45]);
    expect(acc.latest).toBe(0.45);
    // Mathematics strand present with numeracy values.
    const math = p.strands.find((s: any) => s.subject === "mathematics");
    expect(math).toBeTruthy();
    const num = math.progress.indicators.find((i: any) => i.metric === "numeracy");
    expect(num.values).toEqual([0.9, 0.92, 0.95]);
    // Events = canonical evidence references (ISO), incl. teacher row.
    expect(p.events.length).toBeGreaterThanOrEqual(7);
    expect(p.events.some((e: any) => e.evidenceType === "response")).toBe(true);
    expect(new Date(p.events[0].occurredAt).toISOString()).toBe(p.events[0].occurredAt);
    console.log("EVIDENCE E3-S1 progress", JSON.stringify({ strands: p.strands.length, events: p.events.length }));
  });

  it("E3-S2: recommendations derived from ACTUAL evidence → every item requiresTeacherApproval", async () => {
    const r = await api("GET", `/v1/students/${STUDENT_1}/recommendations`, { token: STUDENT_TOKEN });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.items)).toBe(true);
    console.log("EVIDENCE E3-S2 recommendations", JSON.stringify(r.json.items, null, 2));
    expect(r.json.items.length).toBeGreaterThanOrEqual(1); // weak accuracy + persistent mistakes ⇒ real proposals
    for (const item of r.json.items) {
      expect(item.requiresTeacherApproval).toBe(true); // Decision Gate intact — never auto-executed
      expect(["targeted-practice", "teacher-review", "alternative-intervention", "baseline-assessment", "reinforcement"]).toContain(item.proposedActivityType);
      expect(item.reason.length).toBeGreaterThan(0);
      expect(item.confidence).toBeGreaterThan(0);
    }
    // The weak reading accuracy pattern is the driver: targeted practice on reading.accuracy.
    const target = r.json.items.find((i: any) => i.currentSkill === "reading.accuracy" && i.proposedActivityType === "targeted-practice");
    expect(target).toBeTruthy();
    expect(target.currentDimension).toBe("accuracy");
  });

  it("E3-S3: updated state — NEW evidence ⇒ progress reflects it (momentary projection)", async () => {
    for (const [day, v] of [[8, 0.88], [9, 0.9], [10, 0.93]] as const) await assessment(STUDENT_1, TENANT_A, "reading", "accuracy", v, day);
    const r = await api("GET", `/v1/students/${STUDENT_1}/progress`, { token: STUDENT_TOKEN });
    expect(r.status).toBe(200);
    const reading = r.json.strands.find((s: any) => s.subject === "reading");
    const acc = reading.progress.indicators.find((i: any) => i.metric === "accuracy");
    expect(acc.values).toEqual([0.4, 0.42, 0.45, 0.88, 0.9, 0.93]);
    expect(acc.latest).toBe(0.93);
    expect(reading.progress.trend).toBe("up");
  });

  it("E3-S5a: staff IN scope → 200 progress + 200 recommendations", async () => {
    const p = await api("GET", `/v1/students/${STUDENT_1}/progress`, { token: TEACHER_A_TOKEN });
    expect(p.status).toBe(200);
    const r = await api("GET", `/v1/students/${STUDENT_1}/recommendations`, { token: TEACHER_A_TOKEN });
    expect(r.status).toBe(200);
  });

  it("E3-NEG: out-of-scope staff → 403 · cross-tenant staff → 404 · student-B on A → 403 · malformed UUID → 400 · unauthenticated → 401", async () => {
    const oos = await api("GET", `/v1/students/${STUDENT_1}/progress`, { token: TEACHER_C_TOKEN });
    expect(oos.status).toBe(403);
    expect(oos.json.error.code).toBe("STUDENT_DETAIL_ACCESS_DENIED");
    const xt = await api("GET", `/v1/students/${STUDENT_1}/progress`, { token: TEACHER_B_TOKEN });
    expect(xt.status).toBe(404);
    expect(xt.json.error.code).toBe("STUDENT_NOT_FOUND_IN_TENANT");
    const cross = await api("GET", `/v1/students/${STUDENT_1}/recommendations`, { token: STUDENT_B_TOKEN });
    expect(cross.status).toBe(403);
    expect(cross.json.error.code).toBe("STUDENT_DETAIL_ACCESS_DENIED");
    const bad = await api("GET", "/v1/students/not-a-uuid/progress", { token: TEACHER_A_TOKEN });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("INVALID_STUDENT_ID");
    const un = await api("GET", `/v1/students/${STUDENT_1}/progress`);
    expect(un.status).toBe(401);
  });

  it("E3-S4: tenant isolation — tenant-B surfaces carry ONLY tenant-B evidence (zero tenant-A leakage)", async () => {
    const p = await api("GET", `/v1/students/${STUDENT_B1}/progress`, { token: STUDENT_B_TOKEN });
    expect(p.status).toBe(200);
    expect(p.json.tenantId).toBe(TENANT_B);
    expect(p.json.studentId).toBe(STUDENT_B1);
    // B's OWN values only — A's weak (0.4x) and strong (0.9x) values never leak.
    const reading = p.json.strands.find((s: any) => s.subject === "reading");
    expect(reading).toBeTruthy();
    const acc = reading.progress.indicators.find((i: any) => i.metric === "accuracy");
    expect(acc.values).toEqual([0.7, 0.72, 0.74]);
    const flat = JSON.stringify(p.json);
    expect(flat.includes("0.45")).toBe(false);
    expect(flat.includes("0.93")).toBe(false);
    for (const e of p.json.events) expect(A_EVIDENCE_IDS).not.toContain(e.evidenceId);
    // Recommendations (if any) derive ONLY from B's evidence — never from A's patterns.
    const r = await api("GET", `/v1/students/${STUDENT_B1}/recommendations`, { token: STUDENT_B_TOKEN });
    expect(r.status).toBe(200);
    for (const item of r.json.items) {
      expect(item.requiresTeacherApproval).toBe(true);
      for (const ref of item.evidenceRefs) expect(A_EVIDENCE_IDS).not.toContain(ref);
    }
  });
});
