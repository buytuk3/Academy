/**
 * CORE-24 / Wave 2 — Persistent Activity Assignment & Attempt STATE
 * (ACR-24/002, ADR-004). REAL PostgreSQL (canonical migrations 0000..0005).
 *
 * Covers ACR-24/002 §6: fresh-DB migration integrity (additive, EXACTLY the
 * two state tables), constraints (status/source/state CHECKs, has_anchor,
 * attempt_number, time order), tenant isolation at DB level (cross-tenant FK
 * rejection), assignment lifecycle (ACTIVE→CANCELLED/CLOSED, CAS, idempotent
 * retries), attempt lifecycle (CORE-23 ATTEMPT_STATES via CAS transitions —
 * no second state machine; invalid transitions rejected; idempotent replay),
 * evidence POINTER integrity (must reference a REAL canonical Evidence row in
 * the SAME tenant — the state layer never writes Evidence), idempotency
 * (same operation key + same logical identity), concurrency (parallel creates
 * and parallel duplicate submissions converge on ONE row), transfer safety
 * (ADR-002: rows never rewritten on A→B→A), audit hygiene, no-AI scan,
 * synthetic scale.
 * Auto-skips unless CORE24_RUNTIME=1.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";

const RUN = process.env.CORE24_RUNTIME === "1";
const d = RUN ? describe : describe.skip;

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
let dbmod: any, db: any;
let USER_A1: string, USER_B1: string;
let SCHOOL_A: string, SCHOOL_B: string;
const CLASS_A4 = randomUUID(), CLASS_B4 = randomUUID();
let STUDENT_A: string, STUDENT_B: string, STUDENT_B2: string;
const IDENTITY_1 = `c24w2-id1-${randomUUID()}`;
let IDENTITY_1_UUID: string;
const ACT_X = `act-w2-${randomUUID()}`; // activity REFERENCE (activities have no table — CORE-21)

const anchorA = {
  curriculumId: "cur-eg-ar", curriculumVersion: "2026", stageKey: "PRIMARY", gradeLevel: "4", subject: "dictation",
};

d("CORE-24 Wave 2: persistent assignment & attempt state (real PostgreSQL)", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    const { tenantsTable, usersTable, schoolsTable, classesTable, studentsTable } = dbmod;
    await db.insert(tenantsTable).values([
      { id: TENANT_A, name: "C24 حالة A", slug: `c24wa-${randomUUID()}` },
      { id: TENANT_B, name: "C24 حالة B", slug: `c24wb-${randomUUID()}` },
    ]);
    USER_A1 = randomUUID(); USER_B1 = randomUUID();
    await db.insert(usersTable).values([
      { id: USER_A1, tenantId: TENANT_A, firstName: "م", lastName: "معلم A", email: `w2a-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" },
      { id: USER_B1, tenantId: TENANT_B, firstName: "ب", lastName: "معلم B", email: `w2b-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" },
    ]);
    SCHOOL_A = randomUUID(); SCHOOL_B = randomUUID();
    await db.insert(schoolsTable).values([
      { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة W2-A" },
      { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة W2-B" },
    ]);
    await db.insert(classesTable).values([
      { id: CLASS_A4, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4A", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
      { id: CLASS_B4, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "4B", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
    ]);
    STUDENT_A = randomUUID(); STUDENT_B = randomUUID(); STUDENT_B2 = randomUUID();
    const id1 = await dbmod.createIdentity({ operationKey: IDENTITY_1 });
    IDENTITY_1_UUID = id1.identityId;
    await db.insert(studentsTable).values([
      { id: STUDENT_A, tenantId: TENANT_A, classId: CLASS_A4, identityId: IDENTITY_1_UUID, firstName: "أحمد", lastName: "أ", studentCode: `S-${randomUUID()}` },
      { id: STUDENT_B, tenantId: TENANT_B, classId: CLASS_B4, firstName: "سارة", lastName: "ب", studentCode: `S-${randomUUID()}` },
      { id: STUDENT_B2, tenantId: TENANT_B, classId: CLASS_B4, identityId: IDENTITY_1_UUID, firstName: "أحمد", lastName: "بعد النقل", studentCode: `S-${randomUUID()}` },
    ]);
    await dbmod.startMembership({ identityId: IDENTITY_1_UUID, tenantId: TENANT_A, studentId: STUDENT_A, schoolId: SCHOOL_A, classId: CLASS_A4, operationKey: `w2-m-${randomUUID()}` });
  });

  it("1. fresh-DB chain: journal 0000..0005; 0005 additive and creates EXACTLY the two STATE tables", async () => {
    const journal = JSON.parse(readFileSync("packages/database/migrations/meta/_journal.json", "utf8"));
    expect(journal.entries.map((e: any) => e.tag)).toEqual([
      "0000_core18_canonical_baseline",
      "0001_core18_identity_membership",
      "0002_core19_organization_scope",
      "0003_core20_evidence_tenant_time_index",
      "0004_core24_content_exercise_library",
      "0005_core24_activity_assignment_attempt_state",
    ]);
    const sql0005 = readFileSync("packages/database/migrations/0005_core24_activity_assignment_attempt_state.sql", "utf8");
    const created = [...sql0005.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?\"?([a-z_]+)\"?/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["activity_assignments", "activity_attempts"]);
    expect(sql0005).not.toMatch(/drop\s+table|drop\s+column|truncate/i); // forward-only, additive
    const res: any = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('activity_assignments','activity_attempts') ORDER BY table_name`);
    expect((res.rows ?? res).length).toBe(2);
  });

  it("2. separation invariant at DB level: state tables carry NO measurements/scores/responses — evidence_ref is a POINTER only (ADR-004)", async () => {
    const res: any = await db.execute(sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('activity_assignments','activity_attempts')`);
    const cols = (res.rows ?? res).map((r: any) => r.column_name);
    for (const banned of ["accuracy", "score", "result", "response", "response_payload", "measurements", "confidence", "transcript"]) {
      expect(cols).not.toContain(banned); // Evidence stays the single canonical learning fact
    }
    expect(cols).toContain("evidence_ref");  // POINTER, set at EVIDENCE_RECORDED
    expect(cols).toContain("state");          // CORE-23 ATTEMPT_STATES values
    expect(cols).toContain("operation_key");  // existing idempotency pattern
  });

  it("3. CHECK constraints enforced by the DB: status/source/anchors/state/number/time-order", async () => {
    const { activityAssignmentsTable, activityAttemptsTable } = dbmod;
    const baseAssignment = {
      id: randomUUID(), tenantId: TENANT_A, activityId: ACT_X, activityVersion: 1,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      targetSchoolId: SCHOOL_A, assignedBy: USER_A1, assignedByRole: "teacher",
      operationKey: `chk-${randomUUID()}`,
    };
    // invalid status
    await expect(db.insert(activityAssignmentsTable).values({ ...baseAssignment, status: "PAUSED", targetStudentId: STUDENT_A, source: "teacherAssigned" }))
      .rejects.toThrow(/assignment_status_check/);
    // invalid source
    await expect(db.insert(activityAssignmentsTable).values({ ...baseAssignment, source: "aiDecided", targetStudentId: STUDENT_A }))
      .rejects.toThrow(/assignment_source_check/); // AI never assigns (21-L/23-K)
    // no anchor at all
    await expect(db.insert(activityAssignmentsTable).values({ ...baseAssignment, source: "teacherAssigned" }))
      .rejects.toThrow(/assignment_has_anchor/);
    // invalid attempt state
    await expect(db.insert(activityAttemptsTable).values({
      id: randomUUID(), tenantId: TENANT_A, studentId: STUDENT_A, activityId: ACT_X,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      attemptNumber: 1, state: "DONE", operationKey: `chk-${randomUUID()}`,
    })).rejects.toThrow(/attempt_state_check/);
    // attempt_number < 1
    await expect(db.insert(activityAttemptsTable).values({
      id: randomUUID(), tenantId: TENANT_A, studentId: STUDENT_A, activityId: ACT_X,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      attemptNumber: 0, operationKey: `chk-${randomUUID()}`,
    })).rejects.toThrow(/attempt_number_check/);
    // submitted before started
    const t0 = new Date("2026-09-11T09:00:00Z");
    await expect(db.insert(activityAttemptsTable).values({
      id: randomUUID(), tenantId: TENANT_A, studentId: STUDENT_A, activityId: ACT_X,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      attemptNumber: 1, startedAt: t0, submittedAt: new Date(t0.getTime() - 1000), operationKey: `chk-${randomUUID()}`,
    })).rejects.toThrow(/attempt_time_order/);
  });

  it("4. tenant isolation is DB-level: cross-tenant assigned_by / target_student / attempt student FKs REJECTED", async () => {
    const { activityAssignmentsTable, activityAttemptsTable } = dbmod;
    // assignment in Tenant B assigned by Tenant A user
    await expect(db.insert(activityAssignmentsTable).values({
      id: randomUUID(), tenantId: TENANT_B, activityId: ACT_X, activityVersion: 1,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      targetSchoolId: SCHOOL_B, targetStudentId: STUDENT_B, assignedBy: USER_A1, assignedByRole: "teacher",
      source: "teacherAssigned", operationKey: `x-${randomUUID()}`,
    })).rejects.toThrow(/assignment_assigned_by_tenant_fk/);
    // assignment in Tenant A targeting Tenant B student
    await expect(db.insert(activityAssignmentsTable).values({
      id: randomUUID(), tenantId: TENANT_A, activityId: ACT_X, activityVersion: 1,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      targetSchoolId: SCHOOL_A, targetStudentId: STUDENT_B, assignedBy: USER_A1, assignedByRole: "teacher",
      source: "teacherAssigned", operationKey: `x-${randomUUID()}`,
    })).rejects.toThrow(/assignment_target_student_tenant_fk/);
    // attempt for Tenant B student under Tenant A
    await expect(db.insert(activityAttemptsTable).values({
      id: randomUUID(), tenantId: TENANT_A, studentId: STUDENT_B, activityId: ACT_X,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      attemptNumber: 1, operationKey: `x-${randomUUID()}`,
    })).rejects.toThrow(/attempt_student_tenant_fk/);
  });

  it("5. assignment create + idempotent retry: same operationKey → SAME id, created=false, ONE row", async () => {
    const op = `w2-a-${randomUUID()}`;
    const input = {
      tenantId: TENANT_A, activityId: ACT_X, activityVersion: 1,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      targetSchoolId: SCHOOL_A, targetStudentId: STUDENT_A,
      assignedBy: USER_A1, assignedByRole: "teacher", source: "teacherAssigned" as const, operationKey: op,
    };
    const r1 = await dbmod.createAssignment(input);
    expect(r1.created).toBe(true);
    expect(r1.assignment.status).toBe("ACTIVE");
    const r2 = await dbmod.createAssignment(input); // retry
    expect(r2.created).toBe(false);
    expect(r2.assignment.id).toBe(r1.assignment.id);
    const rows = await db.select().from(dbmod.activityAssignmentsTable)
      .where(and(eq(dbmod.activityAssignmentsTable.tenantId, TENANT_A), eq(dbmod.activityAssignmentsTable.operationKey, op)));
    expect(rows.length).toBe(1);
  });

  it("6. attempt concurrency: 5 parallel creates with DIFFERENT operation keys but the SAME logical identity → ONE row (attempt_logical_uniq)", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => dbmod.createAttempt({
      tenantId: TENANT_A, studentId: STUDENT_A, activityId: ACT_X,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      attemptNumber: 1, startedAt: new Date("2026-09-11T09:00:00Z"),
      operationKey: `w2-par-${randomUUID()}`, // different keys, SAME logical attempt
    })));
    const ids = new Set(results.map((r: any) => r.attempt.id));
    expect(ids.size).toBe(1); // parallel duplicate submissions converge on ONE logical attempt
    expect(results.filter((r: any) => r.created).length).toBe(1);
    const rows = await db.select().from(dbmod.activityAttemptsTable)
      .where(and(eq(dbmod.activityAttemptsTable.tenantId, TENANT_A), eq(dbmod.activityAttemptsTable.studentId, STUDENT_A), eq(dbmod.activityAttemptsTable.activityId, ACT_X)));
    expect(rows.length).toBe(1);
  });

  it("7. attempt lifecycle: full CAS walk (start→begin→submit→measure→record) with REAL canonical Evidence pointer; invalid transitions rejected; replay idempotent", async () => {
    const { attempt } = await dbmod.createAttempt({
      tenantId: TENANT_A, studentId: STUDENT_A, activityId: ACT_X,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      attemptNumber: 2, startedAt: new Date("2026-09-11T09:10:00Z"),
    });
    // invalid first event (submit before start) → CAS refuses
    await expect(dbmod.transitionAttempt(TENANT_A, attempt.id, "submit", { submittedAt: new Date() }))
      .rejects.toThrow(/INVALID_TRANSITION/);
    const t0 = new Date("2026-09-11T09:10:00Z");
    const s1 = await dbmod.transitionAttempt(TENANT_A, attempt.id, "start", { startedAt: t0, actorId: STUDENT_A });
    expect(s1.changed).toBe(true);
    expect(s1.attempt.state).toBe("STARTED");
    const s2 = await dbmod.transitionAttempt(TENANT_A, attempt.id, "begin", { actorId: STUDENT_A });
    expect(s2.attempt.state).toBe("IN_PROGRESS");
    const s3 = await dbmod.transitionAttempt(TENANT_A, attempt.id, "submit", {
      submittedAt: new Date(t0.getTime() + 4000), durationMs: 4000, actorId: STUDENT_A,
      time: { activityDurationMs: 4000, responseDurationMs: 3000, thinkingDurationMs: 800, pauseDurationMs: 150, replayDurationMs: 50 },
    });
    expect(s3.attempt.state).toBe("SUBMITTED");
    expect(s3.attempt.responseDurationMs).toBe(3000); // operational time segments persisted (state — not measurements)
    // invalid skip (measure → record without measure)
    await expect(dbmod.transitionAttempt(TENANT_A, attempt.id, "record", { evidenceRef: randomUUID() }))
      .rejects.toThrow(/INVALID_TRANSITION/);
    // valid transition: SUBMITTED → MEASURED (no opts required)
    const s4 = await dbmod.transitionAttempt(TENANT_A, attempt.id, "measure", { actorId: STUDENT_A });
    expect(s4.changed).toBe(true);
    expect(s4.attempt.state).toBe("MEASURED");
    // pointer integrity (runs ONLY after the CAS passed): fabricated evidenceRef refused
    const fakeRef = randomUUID();
    await expect(dbmod.transitionAttempt(TENANT_A, attempt.id, "record", { evidenceRef: fakeRef }))
      .rejects.toThrow(/EVIDENCE_REF_NOT_FOUND_IN_TENANT/); // fabricated pointer refused
    const evidence = await dbmod.recordEvidence({ // the ONLY canonical fact (writer-owned)
      tenantId: TENANT_A, studentId: STUDENT_A, actorRole: "student", evidenceType: "attempt",
      subject: anchorA.subject, activityId: ACT_X, sourceEngine: "dictation-engine",
      occurredAt: new Date(t0.getTime() + 4000), operationKey: `w2-ev-${randomUUID()}`,
      response: { accuracy: 0.9 },
    });
    const s5 = await dbmod.transitionAttempt(TENANT_A, attempt.id, "record", { evidenceRef: evidence.id, actorId: STUDENT_A });
    expect(s5.changed).toBe(true);
    expect(s5.attempt.state).toBe("EVIDENCE_RECORDED");
    expect(s5.attempt.evidenceRef).toBe(evidence.id); // POINTER — never a copy
    // replay after terminal → idempotent, changed=false, state unchanged
    const replay = await dbmod.transitionAttempt(TENANT_A, attempt.id, "record", { evidenceRef: evidence.id });
    expect(replay.changed).toBe(false);
    expect(replay.attempt.state).toBe("EVIDENCE_RECORDED");
    // the canonical fact lives in Evidence (single source) — exactly ONE row for this logical event
    const sameEv = await db.select().from(dbmod.evidenceTable)
      .where(and(eq(dbmod.evidenceTable.tenantId, TENANT_A), eq(dbmod.evidenceTable.operationKey, (evidence as any).operationKey)));
    expect(sameEv.length).toBe(1); // writer dedup untouched by the state layer
  });

  it("8. evidence pointer is tenant-verified: a REAL evidence row of ANOTHER tenant is refused as pointer", async () => {
    const evidenceB = await dbmod.recordEvidence({
      tenantId: TENANT_B, studentId: STUDENT_B, actorRole: "student", evidenceType: "attempt",
      subject: anchorA.subject, sourceEngine: "dictation-engine", operationKey: `w2-evb-${randomUUID()}`,
    });
    const { attempt } = await dbmod.createAttempt({
      tenantId: TENANT_A, studentId: STUDENT_A, activityId: ACT_X,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      attemptNumber: 3, startedAt: new Date("2026-09-11T09:20:00Z"),
    });    await dbmod.transitionAttempt(TENANT_A, attempt.id, "start", { startedAt: new Date("2026-09-11T09:20:00Z") });
    await dbmod.transitionAttempt(TENANT_A, attempt.id, "begin", {});
    await dbmod.transitionAttempt(TENANT_A, attempt.id, "submit", { submittedAt: new Date("2026-09-11T09:21:00Z") });
    await dbmod.transitionAttempt(TENANT_A, attempt.id, "measure", {});
    await expect(dbmod.transitionAttempt(TENANT_A, attempt.id, "record", { evidenceRef: evidenceB.id }))
      .rejects.toThrow(/EVIDENCE_REF_NOT_FOUND_IN_TENANT/); // cross-tenant pointer refused
  });

  it("9. assignment lifecycle: cancel/close are CAS one-way; retries idempotent; status conflicts refused", async () => {
    const op = `w2-life-${randomUUID()}`;
    const { assignment } = await dbmod.createAssignment({
      tenantId: TENANT_A, activityId: ACT_X, activityVersion: 1,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      targetSchoolId: SCHOOL_A, targetClassId: CLASS_A4,
      assignedBy: USER_A1, assignedByRole: "teacher", source: "curriculumRequired" as const, operationKey: op,
    });
    const c1 = await dbmod.cancelAssignment(TENANT_A, assignment.id, USER_A1);
    expect(c1.status).toBe("CANCELLED");
    const c2 = await dbmod.cancelAssignment(TENANT_A, assignment.id, USER_A1); // idempotent retry
    expect(c2.id).toBe(assignment.id);
    await expect(dbmod.closeAssignment(TENANT_A, assignment.id, USER_A1)) // CANCELLED is terminal
      .rejects.toThrow(/ASSIGNMENT_STATUS_CONFLICT/);
    // ACTIVE→CLOSED path
    const { assignment: a2 } = await dbmod.createAssignment({
      tenantId: TENANT_A, activityId: ACT_X, activityVersion: 1,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      targetSchoolId: SCHOOL_A, targetClassId: CLASS_A4,
      assignedBy: USER_A1, assignedByRole: "teacher", source: "teacherAssigned" as const, operationKey: `w2-close-${randomUUID()}`,
    });
    const closed = await dbmod.closeAssignment(TENANT_A, a2.id, USER_A1);
    expect(closed.status).toBe("CLOSED");
    await expect(dbmod.cancelAssignment(TENANT_A, a2.id, USER_A1)).rejects.toThrow(/ASSIGNMENT_STATUS_CONFLICT/);
    // reads: filters (status/student) + tenant scope
    const forStudent = await dbmod.listAssignments(TENANT_A, { studentId: STUDENT_A });
    expect(forStudent.total).toBeGreaterThanOrEqual(1);
    const cancelled = await dbmod.listAssignments(TENANT_A, { status: "CANCELLED" });
    expect(cancelled.rows.every((r: any) => r.status === "CANCELLED")).toBe(true);
    const foreign = await dbmod.listAssignments(TENANT_B, {});
    expect(foreign.total).toBe(0); // tenant-scoped reads
  });

  it("10. transfer safety (ADR-002): A→B transfer + return NEVER rewrite assignment/attempt rows; history intact; new-school assignment is a NEW row", async () => {
    const beforeAssignments = await dbmod.listAssignments(TENANT_A, { studentId: STUDENT_A });
    const beforeAttempts = await dbmod.listStudentAttempts(TENANT_A, STUDENT_A);
    const beforeSnap = JSON.stringify({ a: beforeAssignments.rows, t: beforeAttempts.rows });
    await dbmod.transferStudent({
      identityId: IDENTITY_1_UUID, fromTenantId: TENANT_A, toTenantId: TENANT_B,
      toStudentId: STUDENT_B2, toSchoolId: SCHOOL_B, toClassId: CLASS_B4,
      operationKey: `w2-tr-${randomUUID()}`, actorId: USER_A1,
    });
    // original rows untouched (same tenant, same student, same content)
    const afterOut = await dbmod.listAssignments(TENANT_A, { studentId: STUDENT_A });
    const afterOutAttempts = await dbmod.listStudentAttempts(TENANT_A, STUDENT_A);
    expect(JSON.stringify({ a: afterOut.rows, t: afterOutAttempts.rows })).toBe(beforeSnap); // never rewritten
    // assignment in the NEW school is a NEW row (no mutation of the old)
    const newAssignment = await dbmod.createAssignment({
      tenantId: TENANT_B, activityId: ACT_X, activityVersion: 1,
      curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
      stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
      targetSchoolId: SCHOOL_B, targetStudentId: STUDENT_B2,
      assignedBy: USER_B1, assignedByRole: "teacher", source: "teacherAssigned" as const, operationKey: `w2-new-${randomUUID()}`,
    });
    expect(newAssignment.created).toBe(true);
    expect(newAssignment.assignment.tenantId).toBe(TENANT_B);
    // return to A → original rows still identical
    await dbmod.returnStudent({
      identityId: IDENTITY_1_UUID, toTenantId: TENANT_A, toStudentId: STUDENT_A,
      toSchoolId: SCHOOL_A, toClassId: CLASS_A4, operationKey: `w2-ret-${randomUUID()}`, actorId: USER_A1,
    });
    const afterBack = await dbmod.listAssignments(TENANT_A, { studentId: STUDENT_A });
    const afterBackAttempts = await dbmod.listStudentAttempts(TENANT_A, STUDENT_A);
    expect(JSON.stringify({ a: afterBack.rows, t: afterBackAttempts.rows })).toBe(beforeSnap);
    const history = await dbmod.getMembershipHistory(IDENTITY_1_UUID);
    expect(history.length).toBeGreaterThanOrEqual(3); // active → transferred → returned
  });

  it("11. audit hygiene: lifecycle actions audited via EXISTING audit_logs — reason codes only (no PII/PII-adjacent values)", async () => {
    const rows = await db.select().from(dbmod.auditLogsTable).where(eq(dbmod.auditLogsTable.tenantId, TENANT_A));
    const actions = rows.map((r: any) => r.action);
    for (const expected of ["assignment.created", "assignment.cancelled", "assignment.closed", "attempt.started", "attempt.submitted", "attempt.state_changed"]) {
      expect(actions).toContain(expected);
    }
    for (const r of rows.filter((x: any) => x.entity === "activity_assignment" || x.entity === "activity_attempt")) {
      const s = JSON.stringify(r);
      expect(s).not.toMatch(/password|token|religio|accuracy|score/i); // no PII, no measurements in audit
    }
  });

  it("12. no-AI + no-Evidence-write scan over the state capability code (comment-stripped)", () => {
    for (const f of ["packages/database/src/activity/state.ts", "packages/database/src/schema/activity-state.ts"]) {
      const raw = readFileSync(f, "utf8");
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
      expect(code).not.toMatch(/openai|anthropic|onnx|llm|\.predict\(|mlModel/i);
      expect(code).not.toMatch(/recordEvidence\s*\(/); // state layer NEVER writes Evidence (pointer checks read-only)
    }
  });

  it("13. reads are tenant-scoped and paginated: getAttempt/listStudentAttempts refuse-or-return within tenant only", async () => {
    // student B (tenant B) attempts are invisible from tenant A queries
    const foreignList = await dbmod.listStudentAttempts(TENANT_A, STUDENT_B);
    expect(foreignList.total).toBe(0); // and the seed insert itself would have been FK-refused anyway
    const mine = await dbmod.listStudentAttempts(TENANT_A, STUDENT_A, { limit: 2, offset: 0 });
    expect(mine.total).toBeGreaterThanOrEqual(1);
    expect(mine.rows.length).toBeLessThanOrEqual(2);
    await expect(dbmod.getAttempt(TENANT_A, randomUUID())).rejects.toThrow(/ATTEMPT_NOT_FOUND_IN_TENANT/);
  });

  it("14. synthetic scale: 100 assignments + 100 attempts persisted and paginated (no hard limits)", async () => {
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) {
      await dbmod.createAssignment({
        tenantId: TENANT_A, activityId: `act-scale-${i}`, activityVersion: 1,
        curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
        stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
        targetSchoolId: SCHOOL_A, targetClassId: CLASS_A4,
        assignedBy: USER_A1, assignedByRole: "teacher", source: "teacherAssigned" as const,
        operationKey: `w2-scale-a-${randomUUID()}`,
      });
      await dbmod.createAttempt({
        tenantId: TENANT_A, studentId: STUDENT_A, activityId: `act-scale-${i}`,
        curriculumId: anchorA.curriculumId, curriculumVersion: anchorA.curriculumVersion,
        stageKey: anchorA.stageKey, gradeLevel: anchorA.gradeLevel, subject: anchorA.subject,
        attemptNumber: 1, startedAt: new Date(), operationKey: `w2-scale-t-${randomUUID()}`,
      });
    }
    const elapsed = Date.now() - t0;
    const page1 = await dbmod.listStudentAttempts(TENANT_A, STUDENT_A, { limit: 50, offset: 0 });
    expect(page1.total).toBeGreaterThanOrEqual(100);
    expect(page1.rows.length).toBe(50);
    const page2 = await dbmod.listStudentAttempts(TENANT_A, STUDENT_A, { limit: 50, offset: 50 });
    expect(page2.rows.length).toBe(50);
    expect(elapsed).toBeLessThan(60000); // generous bound — no pathological N+1
  });
});
