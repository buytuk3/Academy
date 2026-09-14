/**
 * CORE-18 — Student Identity & Tenant Membership Foundation (REAL PostgreSQL).
 * ADR-002 / R-009 implementation verification:
 *   18-A minimal global identity (no educational data, no email/phone)
 *   18-B membership lifecycle (active/transferred/returned, history kept)
 *   18-D database-level tenant integrity (composite FKs — R-009-a)
 *   18-E transfer = membership change, ZERO evidence mutation
 *   18-F return A→B→A with intact history
 *   18-H/18-I history shares: summary/dimensions/full, FULL ≠ audio, grant/revoke
 *   18-M idempotency (operationKey)
 *   18-N the eight isolation cases
 * Auto-skips unless CORE18_RUNTIME=1.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.CORE18_RUNTIME === "1";
const d = RUN ? describe : describe.skip;

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const SCHOOL_A = randomUUID();
const SCHOOL_B = randomUUID();
const CLASS_A = randomUUID();
const CLASS_B = randomUUID();
const IDENTITY_1 = { op: `core18-id1-${randomUUID()}` };
const STUDENT_A = randomUUID();
const STUDENT_B = randomUUID();

let dbmod: any, db: any, identity: any;

d("CORE-18 identity & membership (real PostgreSQL, canonical migrations)", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    identity = await import("@workspace/db/identity-membership");
    const { tenantsTable, schoolsTable, classesTable, studentsTable } = dbmod;
    await db.insert(tenantsTable).values([
      { id: TENANT_A, name: "Core18 A", slug: `c18a-${randomUUID()}` },
      { id: TENANT_B, name: "Core18 B", slug: `c18b-${randomUUID()}` },
    ]);
    await db.insert(schoolsTable).values([
      { id: SCHOOL_A, tenantId: TENANT_A, name: "School A" },
      { id: SCHOOL_B, tenantId: TENANT_B, name: "School B" },
    ]);
    await db.insert(classesTable).values([
      { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/A", gradeLevel: "4", academicYear: "2025/2026" },
      { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "4/B", gradeLevel: "4", academicYear: "2025/2026" },
    ]);
    // 18-A: identity FIRST, then tenant-scoped student records linked to it.
    const id1 = await identity.createIdentity({ operationKey: IDENTITY_1.op });
    expect(id1.created).toBe(true);
    await db.insert(studentsTable).values([
      { id: STUDENT_A, tenantId: TENANT_A, classId: CLASS_A, firstName: "أحمد", lastName: "العالمي", studentCode: `A-${randomUUID()}`, identityId: id1.identityId },
      { id: STUDENT_B, tenantId: TENANT_B, classId: CLASS_B, firstName: "أحمد", lastName: "المنتقل", studentCode: `B-${randomUUID()}`, identityId: id1.identityId },
    ]);
  }, 60000);

  it("18-A: identity is a minimal reference node — no educational/contact fields exist on it", async () => {
    const { studentIdentitiesTable } = dbmod;
    const cols = Object.keys(studentIdentitiesTable[Symbol.for("drizzle:Columns")] ?? studentIdentitiesTable);
    const forbidden = ["email", "phone", "score", "mastery", "evidence", "audio", "grade", "diagnosis"];
    for (const f of forbidden) {
      expect(cols.join(",")).not.toContain(f);
    }
    const [row] = await db.select().from(studentIdentitiesTable).limit(1);
    expect(Object.keys(row).sort()).toEqual(["createdAt", "id", "operationKey"]);
  });

  it("18-A/18-M: createIdentity replay with same operationKey → same identity, created=false", async () => {
    const again = await identity.createIdentity({ operationKey: IDENTITY_1.op });
    expect(again.created).toBe(false);
  });

  it("18-N case 8 (DB level): student row with classId from ANOTHER tenant → FK violation", async () => {
    const { studentsTable } = dbmod;
    let err: any;
    try {
      await db.insert(studentsTable).values({
        id: randomUUID(), tenantId: TENANT_A, classId: CLASS_B, // cross-tenant class
        firstName: "خاطئ", lastName: "ممنوع", studentCode: `X-${randomUUID()}`,
      });
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(String(err.code ?? err.message)).toMatch(/23503|foreign key/i);
  });

  it("18-N case 8 (DB level): membership referencing a student from ANOTHER tenant → FK violation", async () => {
    let err: any;
    try {
      await identity.startMembership({
        identityId: (await identity.createIdentity({ operationKey: `core18-id2-${randomUUID()}` })).identityId,
        tenantId: TENANT_B, studentId: STUDENT_A, // student A belongs to tenant A!
        schoolId: SCHOOL_B, classId: CLASS_B,
        operationKey: `core18-x-${randomUUID()}`,
      });
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(String(err.code ?? err.message)).toMatch(/23503|foreign key/i);
  });

  it("18-B/18-M (clean): membership created once; replay returns the same row", async () => {
    const [idrow] = await db.select().from(dbmod.studentIdentitiesTable).limit(1);
    const op = `core18-mA-${randomUUID()}`;
    const m1 = await identity.startMembership({ identityId: idrow.id, tenantId: TENANT_A, studentId: STUDENT_A, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: op });
    const m2 = await identity.startMembership({ identityId: idrow.id, tenantId: TENANT_A, studentId: STUDENT_A, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: op });
    expect(m1.id).toBe(m2.id);
    const history = await identity.getMembershipHistory(idrow.id);
    expect(history.filter((h: any) => h.operationKey === op)).toHaveLength(1);
  });

  it("18-E: transfer A→B — membership A closed (transferred), B active, evidence ownership UNTOUCHED", async () => {
    const [idrow] = await db.select().from(dbmod.studentIdentitiesTable).limit(1);
    // Evidence in A BEFORE the transfer (canonical writer path).
    const evOp = `core18-ev-${randomUUID()}`;
    const ev = await dbmod.recordEvidence({
      tenantId: TENANT_A, studentId: STUDENT_A, actorRole: "student",
      evidenceType: "response", sourceEngine: "core18-test", result: "قبل الانتقال",
      operationKey: evOp, occurredAt: new Date(),
    } as any);
    expect(ev.tenantId).toBe(TENANT_A);

    const { from, to } = await identity.transferStudent({
      identityId: idrow.id, fromTenantId: TENANT_A, toTenantId: TENANT_B,
      toStudentId: STUDENT_B, toSchoolId: SCHOOL_B, toClassId: CLASS_B,
      operationKey: `core18-t1-${randomUUID()}`,
    });
    expect(from.status).toBe("transferred");
    expect(from.activeTo).not.toBeNull();
    expect(from.tenantId).toBe(TENANT_A);
    expect(to.status).toBe("active");
    expect(to.tenantId).toBe(TENANT_B);

    // Evidence in A: SAME tenant, SAME content, ZERO mutation, ZERO copy.
    const evA = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A });
    expect(evA.filter((e: any) => e.operationKey === evOp)).toHaveLength(1);
    expect(evA.find((e: any) => e.operationKey === evOp).tenantId).toBe(TENANT_A);
    const evB = await dbmod.listEvidenceForStudent({ tenantId: TENANT_B, studentId: STUDENT_B });
    expect(evB.filter((e: any) => e.operationKey === evOp)).toHaveLength(0); // no copy to B

    // Transfer idempotent replay → no duplicate membership
    const opKey = `core18-t2-${randomUUID()}`;
    await identity.transferStudent({ identityId: idrow.id, fromTenantId: TENANT_B, toTenantId: TENANT_A, toStudentId: STUDENT_A, toSchoolId: SCHOOL_A, toClassId: CLASS_A, operationKey: opKey });
    const replay = await identity.transferStudent({ identityId: idrow.id, fromTenantId: TENANT_B, toTenantId: TENANT_A, toStudentId: STUDENT_A, toSchoolId: SCHOOL_A, toClassId: CLASS_A, operationKey: opKey });
    expect(replay.to.tenantId).toBe(TENANT_A);
    const history = await identity.getMembershipHistory(idrow.id);
    expect(history.filter((h: any) => h.operationKey === opKey)).toHaveLength(1);
  });

  it("18-F: return A→B→A — same identity, new membership, full history preserved", async () => {
    const [idrow] = await db.select().from(dbmod.studentIdentitiesTable).limit(1);
    const before = await identity.getMembershipHistory(idrow.id);
    const beforeCount = before.length;

    // transfer back to B then return to A
    await identity.transferStudent({ identityId: idrow.id, fromTenantId: TENANT_A, toTenantId: TENANT_B, toStudentId: STUDENT_B, toSchoolId: SCHOOL_B, toClassId: CLASS_B, operationKey: `core18-t3-${randomUUID()}` });
    const back = await identity.returnStudent({ identityId: idrow.id, toTenantId: TENANT_A, toStudentId: STUDENT_A, toSchoolId: SCHOOL_A, toClassId: CLASS_A, operationKey: `core18-r1-${randomUUID()}` });
    expect(back.status).toBe("active");
    expect(back.tenantId).toBe(TENANT_A);
    expect(back.identityId).toBe(idrow.id); // SAME global identity — no new identity

    const after = await identity.getMembershipHistory(idrow.id);
    expect(after.length).toBe(beforeCount + 2); // append-only
    // every historical row intact with original tenant ids
    const tenants = new Set(after.map((m: any) => m.tenantId));
    expect(tenants.has(TENANT_A)).toBe(true);
    expect(tenants.has(TENANT_B)).toBe(true);
    // exactly ONE active membership (DB partial unique index guarantees)
    const active = after.filter((m: any) => m.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].tenantId).toBe(TENANT_A);
  });

  it("18-N cases 1-2: no grant → cross-tenant access DENIED (cross-tenant-attempt)", async () => {
    const [idrow] = await db.select().from(dbmod.studentIdentitiesTable).limit(1);
    await expect(identity.assertGrantAuthorized({
      identityId: idrow.id, requestingTenantId: TENANT_B, requestedScope: "summary",
    })).rejects.toThrow(/HISTORY_SHARE_NOT_GRANTED/);
  });

  it("18-N case 3: SUMMARY grant → summary allowed, dimensions/full denied", async () => {
    const [idrow] = await db.select().from(dbmod.studentIdentitiesTable).limit(1);
    const share = await identity.createHistoryShare({
      identityId: idrow.id, sourceTenantId: TENANT_A, targetTenantId: TENANT_B,
      scope: "summary", grantedBy: randomUUID(), operationKey: `core18-s1-${randomUUID()}`,
    });
    const ok = await identity.assertGrantAuthorized({ identityId: idrow.id, requestingTenantId: TENANT_B, requestedScope: "summary" });
    expect(ok.scope).toBe("summary");
    await expect(identity.assertGrantAuthorized({ identityId: idrow.id, requestingTenantId: TENANT_B, requestedScope: "dimensions" })).rejects.toThrow(/SCOPE_INSUFFICIENT/);
    await expect(identity.assertGrantAuthorized({ identityId: idrow.id, requestingTenantId: TENANT_B, requestedScope: "full" })).rejects.toThrow(/SCOPE_INSUFFICIENT/);
    await identity.revokeHistoryShare(share.id);
  });

  it("18-N case 4: DIMENSIONS grant → dimensions allowed, full denied", async () => {
    const [idrow] = await db.select().from(dbmod.studentIdentitiesTable).limit(1);
    await identity.createHistoryShare({
      identityId: idrow.id, sourceTenantId: TENANT_A, targetTenantId: TENANT_B,
      scope: "dimensions", grantedBy: randomUUID(), operationKey: `core18-s2-${randomUUID()}`,
    });
    const ok = await identity.assertGrantAuthorized({ identityId: idrow.id, requestingTenantId: TENANT_B, requestedScope: "dimensions" });
    expect(ok.scope).toBe("dimensions");
    await expect(identity.assertGrantAuthorized({ identityId: idrow.id, requestingTenantId: TENANT_B, requestedScope: "full" })).rejects.toThrow(/SCOPE_INSUFFICIENT/);
  });

  it("18-N case 5 + 18-H: FULL grant → full allowed, AUDIO denied ALWAYS (full ≠ audio)", async () => {
    const [idrow] = await db.select().from(dbmod.studentIdentitiesTable).limit(1);
    await identity.createHistoryShare({
      identityId: idrow.id, sourceTenantId: TENANT_A, targetTenantId: TENANT_B,
      scope: "full", grantedBy: randomUUID(), operationKey: `core18-s3-${randomUUID()}`,
    });
    const ok = await identity.assertGrantAuthorized({ identityId: idrow.id, requestingTenantId: TENANT_B, requestedScope: "full" });
    expect(ok.scope).toBe("full");
    await expect(identity.assertGrantAuthorized({ identityId: idrow.id, requestingTenantId: TENANT_B, requestedScope: "audio" })).rejects.toThrow(/AUDIO_FORBIDDEN/);
  });

  it("18-N case 6: revoked grant → access DENIED immediately", async () => {
    // dedicated identity: no interference from earlier active grants
    const fresh = await identity.createIdentity({ operationKey: `core18-id6-${randomUUID()}` });
    await identity.startMembership({ identityId: fresh.identityId, tenantId: TENANT_A, studentId: STUDENT_A, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: `core18-m6-${randomUUID()}` });
    const share = await identity.createHistoryShare({
      identityId: fresh.identityId, sourceTenantId: TENANT_A, targetTenantId: TENANT_B,
      scope: "full", grantedBy: randomUUID(), operationKey: `core18-s4-${randomUUID()}`,
    });
    await expect(identity.assertGrantAuthorized({ identityId: fresh.identityId, requestingTenantId: TENANT_B, requestedScope: "summary" })).resolves.toBeTruthy();
    await identity.revokeHistoryShare(share.id);
    await expect(identity.assertGrantAuthorized({ identityId: fresh.identityId, requestingTenantId: TENANT_B, requestedScope: "summary" })).rejects.toThrow(/HISTORY_SHARE_NOT_GRANTED/);
  });

  it("18-N case 7: teacher of tenant B cannot use a grant targeted elsewhere", async () => {
    const [idrow] = await db.select().from(dbmod.studentIdentitiesTable).limit(1);
    await identity.createHistoryShare({
      identityId: idrow.id, sourceTenantId: TENANT_A, targetTenantId: TENANT_B,
      scope: "full", grantedBy: randomUUID(), operationKey: `core18-s5-${randomUUID()}`,
    });
    // requesting tenant is NOT the grant target → DENY
    await expect(identity.assertGrantAuthorized({ identityId: idrow.id, requestingTenantId: randomUUID(), requestedScope: "summary" })).rejects.toThrow(/HISTORY_SHARE_NOT_GRANTED/);
  });

  it("18-H/18-M: grant creation idempotent — same operationKey → one share; same-tenant grant rejected", async () => {
    const [idrow] = await db.select().from(dbmod.studentIdentitiesTable).limit(1);
    const op = `core18-s6-${randomUUID()}`;
    const g1 = await identity.createHistoryShare({ identityId: idrow.id, sourceTenantId: TENANT_A, targetTenantId: TENANT_B, scope: "summary", grantedBy: randomUUID(), operationKey: op });
    const g2 = await identity.createHistoryShare({ identityId: idrow.id, sourceTenantId: TENANT_A, targetTenantId: TENANT_B, scope: "summary", grantedBy: randomUUID(), operationKey: op });
    expect(g1.id).toBe(g2.id);
    await expect(identity.createHistoryShare({ identityId: idrow.id, sourceTenantId: TENANT_A, targetTenantId: TENANT_A, scope: "summary", grantedBy: randomUUID(), operationKey: `core18-s7-${randomUUID()}` })).rejects.toThrow(/SAME_TENANT/);
  });

  it("18-I/18-L: grant lifecycle audited — audit rows contain NO sensitive content", async () => {
    const { auditLogsTable } = dbmod;
    const rows = await db.select().from(auditLogsTable);
    const actions = rows.map((r: any) => r.action);
    for (const expected of ["membership.created", "membership.transferred", "membership.returned", "history_share.created", "history_share.revoked", "history_share.access_authorized"]) {
      expect(actions).toContain(expected);
    }
    for (const r of rows) {
      const blob = JSON.stringify(r);
      expect(blob).not.toMatch(/password|token|audio|refresh/i);
    }
  });

  it("18-J: evidence rows created BEFORE transfer keep original tenant after ALL operations", async () => {
    const [idrow] = await db.select().from(dbmod.studentIdentitiesTable).limit(1);
    // current active membership is Tenant A (after return) — transfer again and re-check
    const ev = await dbmod.recordEvidence({
      tenantId: TENANT_A, studentId: STUDENT_A, actorRole: "student",
      evidenceType: "response", sourceEngine: "core18-test", result: "فحص الملكية",
      operationKey: `core18-ev2-${randomUUID()}`, occurredAt: new Date(),
    } as any);
    await identity.transferStudent({ identityId: idrow.id, fromTenantId: TENANT_A, toTenantId: TENANT_B, toStudentId: STUDENT_B, toSchoolId: SCHOOL_B, toClassId: CLASS_B, operationKey: `core18-t4-${randomUUID()}` });
    const stillA = await dbmod.listEvidenceForStudent({ tenantId: TENANT_A, studentId: STUDENT_A });
    const found = stillA.find((e: any) => e.id === ev.id);
    expect(found).toBeDefined();
    expect(found.tenantId).toBe(TENANT_A); // ownership = historical truth
    expect(found.result).toBe("فحص الملكية"); // content untouched
  });

  it("18-T: no global score anywhere in identity/membership surfaces", () => {
    const identitySrc = ["identity-membership"];
    void identitySrc;
    const exported = Object.keys(identity);
    for (const k of exported) {
      expect(k.toLowerCase()).not.toContain("score");
      expect(k.toLowerCase()).not.toContain("level");
    }
  });
});
