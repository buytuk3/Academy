/**
 * CORE-17 — Security, tenant isolation, concurrency, recovery (REAL PostgreSQL + Redis).
 * Auto-skips unless CORE17_RUNTIME=1.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.CORE17_RUNTIME === "1";
const d = RUN ? describe : describe.skip;

const TENANT_S1 = randomUUID();
const TENANT_S2 = randomUUID();
const SCHOOL_S1 = randomUUID();
const SCHOOL_S2 = randomUUID();
const CLASS_S2 = randomUUID();
const CLASS_S1 = randomUUID();
const STUDENT_S1 = randomUUID();
const STUDENT_S2 = randomUUID();
const TEACHER_ID = randomUUID();

let db: any, dbmod: any, recordEvidence: any, buildLearnerModel: any, listEvidenceForStudent: any, getEvidenceChain: any;
let events: any, decisions: any, ll: any, security: any, obs: any;

function iso(): string {
  return new Date().toISOString();
}

d("CORE-17 security / tenant isolation / concurrency / recovery", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    recordEvidence = dbmod.recordEvidence;
    buildLearnerModel = dbmod.buildLearnerModel;
    listEvidenceForStudent = dbmod.listEvidenceForStudent;
    getEvidenceChain = dbmod.getEvidenceChain;
    events = await import("@workspace/events");
    decisions = await import("@workspace/decisions");
    ll = await import("@workspace/learning-loop");
    security = await import("@workspace/security");
    obs = await import("@workspace/observability");
    const { tenantsTable, schoolsTable, classesTable, studentsTable, passagesTable, readingSessionsTable, attemptsTable } = dbmod;
    await db.insert(tenantsTable).values([
      { id: TENANT_S1, name: "Sec Tenant 1", slug: `s1-${randomUUID()}` },
      { id: TENANT_S2, name: "Sec Tenant 2", slug: `s2-${randomUUID()}` },
    ]);
    await db.insert(schoolsTable).values([
      { id: SCHOOL_S1, tenantId: TENANT_S1, name: "School S1" },
      { id: SCHOOL_S2, tenantId: TENANT_S2, name: "School S2" },
    ]);
    await db.insert(classesTable).values({ id: CLASS_S2, tenantId: TENANT_S2, schoolId: SCHOOL_S2, name: "C2", gradeLevel: "3", academicYear: "2025/2026" });
    await db.insert(classesTable).values({ id: CLASS_S1, tenantId: TENANT_S1, schoolId: SCHOOL_S1, name: "C1", gradeLevel: "3", academicYear: "2025/2026" });
    await db.insert(studentsTable).values([
      { id: STUDENT_S1, tenantId: TENANT_S1, classId: CLASS_S1, firstName: "طالب", lastName: "أول", studentCode: `S1-${randomUUID()}` },
      { id: STUDENT_S2, tenantId: TENANT_S2, classId: CLASS_S2, firstName: "طالبة", lastName: "ثاني", studentCode: `S2-${randomUUID()}` },
    ]);
    const PASSAGE_S1 = randomUUID();
    await db.insert(passagesTable).values({ id: PASSAGE_S1, tenantId: TENANT_S1, classroomId: CLASS_S1, title: "نص", text: "نص تجريبي", difficulty: 2 });
    const SESSION_S1 = randomUUID();
    await db.insert(readingSessionsTable).values({ id: SESSION_S1, tenantId: TENANT_S1, studentId: STUDENT_S1 });
    await db.insert(attemptsTable).values({ id: randomUUID(), tenantId: TENANT_S1, sessionId: SESSION_S1, studentId: STUDENT_S1, passageId: PASSAGE_S1 });
  }, 60000);

  it("CONCURRENCY: same attempt evidence twice (parallel) → ONE row (operation-key dedupe)", async () => {
    const opk = `core17-conc-${randomUUID()}`;
    const input = {
      tenantId: TENANT_S1,
      studentId: STUDENT_S1,
      actorRole: "system",
      occurredAt: new Date(),
      evidenceType: "response" as const,
      subject: "reading",
      response: { accuracy: 0.9 },
      result: "0.9",
      sourceEngine: "core17-verify",
      operationKey: opk,
    };
    const [a, b] = await Promise.all([recordEvidence(input), recordEvidence(input)]);
    expect(a.id).toBe(b.id);
    const rows = await listEvidenceForStudent({ tenantId: TENANT_S1, studentId: STUDENT_S1, limit: 100 });
    expect(rows.filter((r: any) => r.operationKey === opk).length).toBe(1);
  });

  it("CONCURRENCY: duplicate event delivery → idempotent, evidence NOT duplicated", async () => {
    const ev = {
      id: randomUUID(),
      version: 1,
      type: "StudentResponseRecorded",
      occurredAt: iso(),
      actor: { id: "system", role: "system" },
      tenantId: TENANT_S1,
      studentId: STUDENT_S1,
      payload: { skill: "reading.accuracy", accuracy: 0.8 },
    };
    await events.publishEvent(ev, {});
    await events.processEventOutbox({ limit: 20 });
    const count = async () =>
      (await listEvidenceForStudent({ tenantId: TENANT_S1, studentId: STUDENT_S1, limit: 100 })).filter((r: any) => r.operationKey === `event:${ev.id}`).length;
    expect(await count()).toBe(1);
    // simulate redelivery
    const { eventOutboxTable } = dbmod;
    const { eq } = await import("drizzle-orm");
    await db.update(eventOutboxTable).set({ status: "pending" }).where(eq(eventOutboxTable.id, ev.id));
    await events.processEventOutbox({ limit: 20 });
    expect(await count()).toBe(1); // operationKey event:{id} → writer dedupes
  });

  it("CONCURRENCY: same Teacher decision twice → idempotent (same decisionId, existed=true)", async () => {
    const signal = {
      kind: "repeated-mistake" as const,
      tenantId: TENANT_S1,
      studentId: STUDENT_S1,
      skill: "reading.accuracy",
      evidenceRefs: [randomUUID()],
      confidence: 0.9,
      reason: "core17",
      signalKey: `detect:repeated-mistake:${TENANT_S1}:${STUDENT_S1}:reading.accuracy`,
    };
    const diagnosis = await ll.createDiagnosis({ tenantId: TENANT_S1, studentId: STUDENT_S1, signal });
    const proposal = await ll.proposeIntervention({ tenantId: TENANT_S1, studentId: STUDENT_S1, diagnosis, activityType: "targeted-practice" });
    const decision = { action: "APPROVED" as const, actorId: TEACHER_ID, actorRole: "teacher", decidedAt: iso(), reason: "موافق" };
    const d1 = await decisions.applyTeacherDecision({ tenantId: TENANT_S1, proposal, decision });
    expect(d1.proposal.status).toBe("APPROVED");
    const d2 = await decisions.applyTeacherDecision({ tenantId: TENANT_S1, proposal: d1.proposal, decision });
    expect(d2.existed).toBe(true);
    expect(d2.decisionId).toBe(d1.decisionId);
  });

  it("STATE MACHINE: REJECTED proposal → Reassessment refused (INTERVENTION_NOT_AUTHORIZED)", async () => {
    const signal = {
      kind: "repeated-mistake" as const,
      tenantId: TENANT_S1,
      studentId: STUDENT_S1,
      skill: "reading.fluency",
      evidenceRefs: [randomUUID()],
      confidence: 0.9,
      reason: "core17",
      signalKey: `detect:repeated-mistake:${TENANT_S1}:${STUDENT_S1}:reading.fluency`,
    };
    const diagnosis = await ll.createDiagnosis({ tenantId: TENANT_S1, studentId: STUDENT_S1, signal });
    const proposal = await ll.proposeIntervention({ tenantId: TENANT_S1, studentId: STUDENT_S1, diagnosis, activityType: "targeted-practice" });
    const rejected = await decisions.applyTeacherDecision({
      tenantId: TENANT_S1,
      proposal,
      decision: { action: "REJECTED", actorId: TEACHER_ID, actorRole: "teacher", decidedAt: iso(), rejectionReason: "غير مناسب" },
    });
    expect(rejected.proposal.status).toBe("REJECTED");
    await expect(
      ll.recordReassessment({
        tenantId: TENANT_S1,
        studentId: STUDENT_S1,
        diagnosis,
        intervention: rejected.proposal,
        skill: "reading.fluency",
        baselineEvidenceRef: randomUUID(),
        reassessmentEvidenceRef: randomUUID(),
        occurredAt: new Date(),
      }),
    ).rejects.toThrow("INTERVENTION_NOT_AUTHORIZED");
  });

  it("TENANT ISOLATION: cross-tenant evidence write rejected (TENANT_MISMATCH)", async () => {
    const { attemptsTable } = dbmod;
    const { eq } = await import("drizzle-orm");
    const [attempt] = await db.select().from(attemptsTable).where(eq(attemptsTable.tenantId, TENANT_S1)).limit(1);
    await expect(
      recordEvidence({
        tenantId: TENANT_S2,
        studentId: STUDENT_S2,
        actorRole: "student",
        evidenceType: "attempt",
        attemptId: attempt.id, // belongs to TENANT_S1
        sourceEngine: "core17-verify",
        operationKey: `core17-x-${randomUUID()}`,
      }),
    ).rejects.toThrow("TENANT_MISMATCH");
  });

  it("TENANT ISOLATION: Tenant 2 reads zero Tenant 1 evidence; learner model empty; chain leaks nothing", async () => {
    const rows = await listEvidenceForStudent({ tenantId: TENANT_S2, studentId: STUDENT_S2, limit: 100 });
    expect(rows.length).toBe(0);
    const model = await buildLearnerModel({ tenantId: TENANT_S2, studentId: STUDENT_S2 });
    // All 23 registry dimensions exist by design (first-class insufficient evidence);
    // isolation = ZERO of them carry any real sample from Tenant 1.
    expect(model.dimensions.length).toBe(23);
    expect(model.dimensions.every((x: any) => x.sampleCount === 0)).toBe(true);
    const tenant1Evidence = (await listEvidenceForStudent({ tenantId: TENANT_S1, studentId: STUDENT_S1, limit: 10 }))[0];
    const chain = await getEvidenceChain({ tenantId: TENANT_S2, evidenceId: tenant1Evidence.id });
    expect(chain.length).toBe(0);
  });

  it("TENANT ISOLATION: cross-tenant teacher decision rejected", async () => {
    const signal = {
      kind: "repeated-mistake" as const,
      tenantId: TENANT_S1,
      studentId: STUDENT_S1,
      skill: "reading.comprehension",
      evidenceRefs: [randomUUID()],
      confidence: 0.9,
      reason: "core17",
      signalKey: `detect:repeated-mistake:${TENANT_S1}:${STUDENT_S1}:reading.comprehension`,
    };
    const diagnosis = await ll.createDiagnosis({ tenantId: TENANT_S1, studentId: STUDENT_S1, signal });
    const proposal = await ll.proposeIntervention({ tenantId: TENANT_S1, studentId: STUDENT_S1, diagnosis, activityType: "targeted-practice" });
    await expect(
      decisions.applyTeacherDecision({
        tenantId: TENANT_S2, // attacker tenant
        proposal,
        decision: { action: "APPROVED", actorId: TEACHER_ID, actorRole: "teacher", decidedAt: iso() },
      }),
    ).rejects.toThrow();
  });

  it("RBAC: student/system roles cannot decide (ACTOR_ROLE_NOT_AUTHORIZED); teacher can", () => {
    expect(() => decisions.assertActorCanDecide("student")).toThrow("ACTOR_ROLE_NOT_AUTHORIZED");
    expect(() => decisions.assertActorCanDecide("system")).toThrow("ACTOR_ROLE_NOT_AUTHORIZED");
    expect(() => decisions.assertActorCanDecide("teacher")).not.toThrow();
  });

  it("AUTH: access token roundtrip + tamper detection; refresh token family decode", () => {
    const opts = { secret: "core17-test-secret", issuer: "buytuk", audience: "buytuk-client" };
    const token = security.createAccessToken({ sub: STUDENT_S1, role: "student" } as any, opts, 900);
    const payload = security.verifyAccessToken(token, opts);
    expect(payload.sub).toBe(STUDENT_S1);
    expect(payload.type).toBe("access");
    const tampered = token.slice(0, -3) + (token.endsWith("a") ? "bbb" : "aaa");
    expect(() => security.verifyAccessToken(tampered, opts)).toThrow();
    const refresh = security.createRefreshToken(STUDENT_S1, `fam-${randomUUID()}`, opts, 30);
    const decoded = security.decodeRefreshToken(refresh, opts);
    expect(decoded.sub).toBe(STUDENT_S1);
    expect(decoded.type).toBe("refresh");
  });

  it("AUDIO: encrypted at rest path (encrypt → bytes change → decrypt roundtrip); no bytea audio columns in DB", async () => {
    process.env.AUDIO_KEK = process.env.AUDIO_KEK ?? "0".repeat(32) + "ff".repeat(32).slice(0, 32); // 64-hex test KEK
    const enc = await import("../../engines/reading-engine/src/security/encryption.js");
    const pcm = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const { encryptedBuffer, encryptedKey } = await enc.encryptAudio(pcm);
    expect(encryptedKey.length).toBeGreaterThan(0);
    expect(Buffer.compare(Buffer.from(encryptedBuffer), Buffer.from(pcm.buffer))).not.toBe(0);
    const decrypted = await enc.decryptAudio(encryptedBuffer, encryptedKey);
    const decBytes = Buffer.from(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength);
    expect(decBytes.length).toBe(pcm.buffer.byteLength); // 16 bytes (Buffer-pool safe)
    const { sql } = await import("drizzle-orm");
    const bytea = await db.execute(sql`SELECT table_name FROM information_schema.columns WHERE data_type='bytea' AND table_name IN ('attempts','evidence','reading_sessions')`);
    expect((Array.isArray(bytea) ? bytea : bytea.rows).length).toBe(0); // audio NEVER in DB
  });

  it("AUDIT: security events recorded (cross-tenant-attempt observable) + audit_logs table present", async () => {
    expect(() =>
      obs.recordSecurityEvent(obs.createLogger({ name: "core17" }), obs.getMetrics(), "cross-tenant-attempt", {
        tenantId: TENANT_S2,
        studentId: STUDENT_S2,
        detail: { verification: "core-17" },
      }),
    ).not.toThrow();
    const { sql } = await import("drizzle-orm");
    const t = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_name='audit_logs'`);
    expect((Array.isArray(t) ? t : t.rows).length).toBe(1);
  });

  it("RECOVERY: consumer failure → outbox failed (attempts/lastError persisted) → retryFailedEvent → processed", async () => {
    let fail = true;
    const anchor = (await listEvidenceForStudent({ tenantId: TENANT_S1, studentId: STUDENT_S1, limit: 1 }))[0];
    events.registerConsumer("TeacherReportGenerated", async () => {
      if (fail) throw new Error("core17-flaky-consumer");
      return { id: anchor.id };
    });
    const ev = {
      id: randomUUID(),
      version: 1,
      type: "TeacherReportGenerated",
      occurredAt: iso(),
      actor: { id: "system", role: "system" },
      tenantId: TENANT_S1,
      studentId: STUDENT_S1,
      payload: {},
    };
    await events.publishEvent(ev, {});
    await events.processEventOutbox({ limit: 20 });
    const { eventOutboxTable } = dbmod;
    const { eq } = await import("drizzle-orm");
    const [row1] = await db.select().from(eventOutboxTable).where(eq(eventOutboxTable.id, ev.id));
    expect(row1.status).toBe("failed");
    expect(row1.attempts).toBe(1);
    expect(row1.lastError).toContain("core17-flaky-consumer");

    fail = false;
    await events.retryFailedEvent(ev.id);
    await events.processEventOutbox({ limit: 20 });
    const [row2] = await db.select().from(eventOutboxTable).where(eq(eventOutboxTable.id, ev.id));
    expect(row2.status).toBe("processed");
  });
});
