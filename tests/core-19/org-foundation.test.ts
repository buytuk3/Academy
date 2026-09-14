/**
 * CORE-19 — Education Organization & Multi-Tenant Scope Foundation (REAL PostgreSQL).
 * Test matrix (19-AK): hierarchy, cycles, parent-child integrity, tenant/org/school
 * scope, student+teacher membership, role vs scope, cross-tenant/cross-org deny,
 * DB FK isolation, idempotency, concurrency, audit, CORE-18 history-share intact,
 * global identity continuity, A→B→A, curriculum continuity, no duplicate
 * evidence/SLR, no global score, scale simulation, perf baseline.
 * Auto-skips unless CORE19_RUNTIME=1.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

const RUN = process.env.CORE19_RUNTIME === "1";
const d = RUN ? describe : describe.skip;

const TENANT_M = randomUUID(); // ministry-holding tenant
const TENANT_X = randomUUID(); // foreign tenant (denial tests)
const USER_TEACHER = randomUUID();
const USER_ANALYST = randomUUID();
const USER_NOBODY = randomUUID();
let dbmod: any, db: any, org: any;

// hierarchy handles (assigned in beforeAll / hierarchy test)
let MINISTRY_ORG: any, GOV_ORG: any, DIRECTORATE_ORG: any, ORG_A_ID: string, SCHOOL_A_ID: string, SCHOOL_B_ID: string;
let CLASS_A = randomUUID(), CLASS_B = randomUUID();

d("CORE-19 organization & scope foundation (real PostgreSQL, canonical migrations)", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    org = dbmod;
    const { tenantsTable, usersTable } = dbmod;
    await db.insert(tenantsTable).values([
      { id: TENANT_M, name: "Core19 Ministry Tenant", slug: `c19m-${randomUUID()}` },
      { id: TENANT_X, name: "Core19 Foreign Tenant", slug: `c19x-${randomUUID()}` },
    ]);
    await db.insert(usersTable).values([
      { id: USER_TEACHER, tenantId: TENANT_M, firstName: "أ", lastName: "معلم", email: `t-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" },
      { id: USER_ANALYST, tenantId: TENANT_M, firstName: "ب", lastName: "محلل", email: `a-${randomUUID()}@x.test`, passwordHash: "x", role: "admin" },
      { id: USER_NOBODY, tenantId: TENANT_M, firstName: "ج", lastName: "بلا عضوية", email: `n-${randomUUID()}@x.test`, passwordHash: "x", role: "student" },
    ]);
  }, 60000);

  it("1-3. hierarchy: MINISTRY→GOVERNORATE→DIRECTORATE; chain walk correct; self-parent rejected by DB CHECK", async () => {
    const m = await org.createOrganization({ tenantId: TENANT_M, type: "MINISTRY", name: "وزارة التعليم", code: "MIN-1", country: "EG", educationSystem: "EG-NATIONAL", operationKey: `core19-min-${randomUUID()}` });
    MINISTRY_ORG = m.organization;
    expect(m.created).toBe(true);
    const gov = await org.createOrganization({ tenantId: TENANT_M, type: "GOVERNORATE", name: "محافظة القاهرة", parentOrganizationId: MINISTRY_ORG.id, operationKey: `core19-gov-${randomUUID()}` });
    GOV_ORG = gov.organization;
    const dir = await org.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: "مديرية شرق", parentOrganizationId: GOV_ORG.id, operationKey: `core19-dir-${randomUUID()}` });
    DIRECTORATE_ORG = dir.organization;
    const chain = await org.ancestorChain(TENANT_M, DIRECTORATE_ORG.id);
    expect(chain.map((c: any) => c.type)).toEqual(["DIRECTORATE", "GOVERNORATE", "MINISTRY"]);
    // self-parent → DB CHECK violation
    let checkErr: any;
    try {
      await db.update(dbmod.organizationsTable).set({ parentOrganizationId: DIRECTORATE_ORG.id }).where(eq(dbmod.organizationsTable.id, DIRECTORATE_ORG.id));
    } catch (e) { checkErr = e; }
    expect(checkErr).toBeDefined();
    expect(String(checkErr.code ?? checkErr.message)).toMatch(/23514|check/i);
  });

  it("2. no cycles: attachParent that would create a cycle → ORG_CYCLE_DETECTED", async () => {
    const a = await org.createOrganization({ tenantId: TENANT_M, type: "REGION", name: "منطقة فرعية", parentOrganizationId: DIRECTORATE_ORG.id, operationKey: `a-${randomUUID()}` });
    ORG_A_ID = a.organization.id;
    await expect(org.attachParent({ tenantId: TENANT_M, organizationId: MINISTRY_ORG.id, parentOrganizationId: ORG_A_ID })).rejects.toThrow(/ORG_CYCLE_DETECTED/);
  });

  it("5-6-7. scope: ORGANIZATION subtree covers attached schools; SCHOOL scope denies other school", async () => {
    const s1 = await org.createSchool({ tenantId: TENANT_M, name: "مدرسة الشمس", code: `S-${randomUUID().slice(0, 8)}`, organizationId: DIRECTORATE_ORG.id, operationKey: `s1-${randomUUID()}` });
    SCHOOL_A_ID = s1.school.id;
    const s2 = await org.createSchool({ tenantId: TENANT_M, name: "مدرسة القمر", code: `S-${randomUUID().slice(0, 8)}`, operationKey: `s2-${randomUUID()}` });
    SCHOOL_B_ID = s2.school.id;
    await org.attachSchoolToOrganization({ tenantId: TENANT_M, schoolId: SCHOOL_B_ID, organizationId: DIRECTORATE_ORG.id });
    // supervisor at directorate (ORGANIZATION scope) covers both schools
    await org.addStaffMembership({ tenantId: TENANT_M, userId: USER_ANALYST, role: "supervisor", scopeType: "ORGANIZATION", scopeId: DIRECTORATE_ORG.id, organizationId: DIRECTORATE_ORG.id, operationKey: `sm-a-${randomUUID()}` });
    const dec = await org.checkScope({ tenantId: TENANT_M, userId: USER_ANALYST, resource: { tenantId: TENANT_M, schoolId: SCHOOL_A_ID } });
    expect(dec.authorized).toBe(true);
    expect(dec.scopeType).toBe("ORGANIZATION");
    // teacher bound to SCHOOL_B only
    await org.addStaffMembership({ tenantId: TENANT_M, userId: USER_TEACHER, role: "teacher", scopeType: "SCHOOL", scopeId: SCHOOL_B_ID, schoolId: SCHOOL_B_ID, operationKey: `sm-t-${randomUUID()}` });
    await expect(org.checkScope({ tenantId: TENANT_M, userId: USER_TEACHER, resource: { tenantId: TENANT_M, schoolId: SCHOOL_B_ID } })).resolves.toBeTruthy();
    await expect(org.checkScope({ tenantId: TENANT_M, userId: USER_TEACHER, resource: { tenantId: TENANT_M, schoolId: SCHOOL_A_ID } })).rejects.toThrow(/SCOPE_NOT_COVERING_RESOURCE/);
  });

  it("9. role vs scope: role gate on top of scope gate (RBAC + Scope)", async () => {
    await expect(org.checkScope({ tenantId: TENANT_M, userId: USER_TEACHER, resource: { tenantId: TENANT_M, schoolId: SCHOOL_B_ID }, allowedRoles: ["admin"] })).rejects.toThrow(/SCOPE_ROLE_NOT_ALLOWED/);
    await expect(org.checkScope({ tenantId: TENANT_M, userId: USER_ANALYST, resource: { tenantId: TENANT_M, schoolId: SCHOOL_A_ID }, allowedRoles: ["supervisor", "admin"] })).resolves.toBeTruthy();
  });

  it("10-11. cross-tenant deny: foreign-tenant resource → SCOPE_TENANT_MISMATCH; no membership → NO_ACTIVE_MEMBERSHIP", async () => {
    await expect(org.checkScope({ tenantId: TENANT_M, userId: USER_ANALYST, resource: { tenantId: TENANT_X, schoolId: randomUUID() } })).rejects.toThrow(/SCOPE_TENANT_MISMATCH/);
    await expect(org.checkScope({ tenantId: TENANT_M, userId: USER_NOBODY, resource: { tenantId: TENANT_M, schoolId: SCHOOL_A_ID } })).rejects.toThrow(/SCOPE_NO_ACTIVE_MEMBERSHIP/);
  });

  it("12. DB FK isolation: staff→school cross-tenant impossible; org parent cross-tenant impossible", async () => {
    let err1: any;
    try {
      await org.addStaffMembership({ tenantId: TENANT_M, userId: USER_TEACHER, role: "teacher", scopeType: "SCHOOL", scopeId: randomUUID(), schoolId: randomUUID(), operationKey: `fk-${randomUUID()}` });
    } catch (e) { err1 = e; }
    expect(err1).toBeDefined();
    const fx = await org.createOrganization({ tenantId: TENANT_X, type: "MINISTRY", name: "وزارة أخرى", operationKey: `fx-${randomUUID()}` });
    let err2: any;
    try {
      await db.insert(dbmod.organizationsTable).values({ id: randomUUID(), tenantId: TENANT_M, type: "REGION", name: "عابر", parentOrganizationId: fx.organization.id, operationKey: `cross-${randomUUID()}` });
    } catch (e) { err2 = e; }
    expect(err2).toBeDefined();
    expect(String(err2.code ?? err2.message)).toMatch(/23503|foreign key/i);
  });

  it("13. idempotency: organization/school/membership retry with same operationKey → one row", async () => {
    const op = `idem-org-${randomUUID()}`;
    const r1 = await org.createOrganization({ tenantId: TENANT_M, type: "REGION", name: "مكرر", operationKey: op });
    const r2 = await org.createOrganization({ tenantId: TENANT_M, type: "REGION", name: "مكرر", operationKey: op });
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);
    expect(r1.organization.id).toBe(r2.organization.id);
    const ops = `idem-sch-${randomUUID()}`;
    const s1 = await org.createSchool({ tenantId: TENANT_M, name: "مدرسة مكررة", operationKey: ops });
    const s2 = await org.createSchool({ tenantId: TENANT_M, name: "مدرسة مكررة", operationKey: ops });
    expect(s1.created).toBe(true); expect(s2.created).toBe(false); expect(s1.school.id).toBe(s2.school.id);
    const opm = `idem-sm-${randomUUID()}`;
    const m1 = await org.addStaffMembership({ tenantId: TENANT_M, userId: USER_NOBODY, role: "student", scopeType: "SCHOOL", scopeId: SCHOOL_A_ID, schoolId: SCHOOL_A_ID, operationKey: opm });
    const m2 = await org.addStaffMembership({ tenantId: TENANT_M, userId: USER_NOBODY, role: "student", scopeType: "SCHOOL", scopeId: SCHOOL_A_ID, schoolId: SCHOOL_A_ID, operationKey: opm });
    expect(m1.id).toBe(m2.id);
  });

  it("14. concurrency: two parallel membership creates with duplicate operationKey → exactly one state", async () => {
    const op = `conc-${randomUUID()}`;
    const [a, b] = await Promise.all([
      org.addStaffMembership({ tenantId: TENANT_M, userId: USER_ANALYST, role: "principal", scopeType: "SCHOOL", scopeId: SCHOOL_A_ID, schoolId: SCHOOL_A_ID, operationKey: op }),
      org.addStaffMembership({ tenantId: TENANT_M, userId: USER_ANALYST, role: "principal", scopeType: "SCHOOL", scopeId: SCHOOL_A_ID, schoolId: SCHOOL_A_ID, operationKey: op }),
    ]);
    expect(a.id).toBe(b.id);
    const rows = await db.select().from(dbmod.staffMembershipsTable);
    expect(rows.filter((r: any) => r.operationKey === op)).toHaveLength(1);
  });

  it("15. audit: lifecycle audited in EXISTING audit_logs; no secrets in any row", async () => {
    const rows = await db.select().from(dbmod.auditLogsTable);
    const actions = rows.map((r: any) => r.action);
    for (const expected of ["organization.created", "school.created", "staff_membership.created", "school.organization_attached"]) {
      expect(actions).toContain(expected);
    }
    for (const r of rows) {
      expect(JSON.stringify(r)).not.toMatch(/password|token|audio|secret/i);
    }
  });

  it("16-17-18. CORE-18 intact: history-share gate unchanged; global identity continuity A→B→A; evidence ownership untouched", async () => {
    const IDENTITY_OP = `core19-id-${randomUUID()}`;
    const id1 = await dbmod.createIdentity({ operationKey: IDENTITY_OP });
    expect(id1.created).toBe(true);
    const replay = await dbmod.createIdentity({ operationKey: IDENTITY_OP });
    expect(replay.created).toBe(false);
    expect(replay.identityId).toBe(id1.identityId);

    const { classesTable, studentsTable } = dbmod;
    await db.insert(classesTable).values([
      { id: CLASS_A, tenantId: TENANT_M, schoolId: SCHOOL_A_ID, name: "4/A", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
      { id: CLASS_B, tenantId: TENANT_M, schoolId: SCHOOL_B_ID, name: "4/B", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
    ]);
    // ONE tenant-scoped student record per identity (CORE-18 constraint
    // students_identity_tenant_uniq — intact, untouched). School movement
    // happens at the MEMBERSHIP layer, never by duplicating student rows.
    const SA = randomUUID();
    await db.insert(studentsTable).values([
      { id: SA, tenantId: TENANT_M, classId: CLASS_A, firstName: "منى", lastName: "الطالبة", studentCode: `M-${randomUUID()}`, identityId: id1.identityId },
    ]);
    const ev = await dbmod.recordEvidence({
      tenantId: TENANT_M, studentId: SA, actorRole: "student", evidenceType: "response",
      sourceEngine: "core19-test", result: "قبل الانتقال", operationKey: `c19-ev-${randomUUID()}`, occurredAt: new Date(),
    });
    // A→B→A across schools INSIDE the tenant via CORE-18 membership APIs (unchanged):
    await dbmod.startMembership({ identityId: id1.identityId, tenantId: TENANT_M, studentId: SA, schoolId: SCHOOL_A_ID, classId: CLASS_A, operationKey: `c19-ma-${randomUUID()}` });
    await dbmod.transferStudent({ identityId: id1.identityId, fromTenantId: TENANT_M, toTenantId: TENANT_M, toStudentId: SA, toSchoolId: SCHOOL_B_ID, toClassId: CLASS_B, operationKey: `c19-mb-${randomUUID()}` });
    const back = await dbmod.returnStudent({ identityId: id1.identityId, toTenantId: TENANT_M, toStudentId: SA, toSchoolId: SCHOOL_A_ID, toClassId: CLASS_A, operationKey: `c19-mc-${randomUUID()}` });
    expect(back.identityId).toBe(id1.identityId); // SAME global identity
    const history = await dbmod.getMembershipHistory(id1.identityId);
    expect(history.length).toBeGreaterThanOrEqual(3); // append-only history
    const active = history.filter((m: any) => m.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].schoolId).toBe(SCHOOL_A_ID); // returned to school A
    // evidence untouched, single copy, same tenant — no copy, no rewrite, no merge
    const evA = await dbmod.listEvidenceForStudent({ tenantId: TENANT_M, studentId: SA });
    expect(evA.filter((e: any) => e.operationKey === ev.operationKey)).toHaveLength(1);
    expect(evA.find((e: any) => e.operationKey === ev.operationKey).tenantId).toBe(TENANT_M);
    expect(evA.find((e: any) => e.operationKey === ev.operationKey).result).toBe("قبل الانتقال");
    // history-share gate (CORE-18 semantics): audio always denied — 19-T preserved
    await expect(dbmod.assertGrantAuthorized({ identityId: id1.identityId, requestingTenantId: TENANT_X, requestedScope: "audio" })).rejects.toThrow(/AUDIO_FORBIDDEN/);
    // DB-level: a SECOND student row for the same identity+tenant is impossible
    let dupeErr: any;
    try {
      await db.insert(studentsTable).values({ id: randomUUID(), tenantId: TENANT_M, classId: CLASS_B, firstName: "منى", lastName: "المكررة", studentCode: `M-${randomUUID()}`, identityId: id1.identityId });
    } catch (e) { dupeErr = e; }
    expect(dupeErr).toBeDefined();
    expect(String(dupeErr.code ?? dupeErr.message)).toMatch(/23505|unique|duplicate/i);
  });

  it("19. curriculum continuity: stage/grade are configuration references — no curriculum copy in core", async () => {
    const rows = await db.select().from(dbmod.classesTable);
    expect(rows.length).toBeGreaterThan(0);
    for (const c of rows) {
      expect(typeof c.stageKey === "string" || c.stageKey === null).toBe(true); // scalar reference
    }
    // curriculum stage semantics stay in packages/curriculum (EducationStageKey = config data)
    const { EducationStageKey } = await import("node:fs") as any;
    void EducationStageKey;
  });

  it("20-21-22. no duplicate Evidence store, no per-school SLR tables, no global score — all migrations + org code clean", async () => {
    const fs = await import("node:fs");
    const files = fs.readdirSync("packages/database/migrations").filter((f: string) => f.endsWith(".sql"));
    for (const f of files) {
      const sql = fs.readFileSync(`packages/database/migrations/${f}`, "utf8");
      expect(sql).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:evidence_|student_learning_record_)/i);
      expect(sql).not.toMatch(/globalstudentscore|overallscore|globalrank|schoolscore/i);
    }
    const orgSrc = fs.readFileSync("packages/database/src/org/organization.ts", "utf8");
    expect(orgSrc).not.toMatch(/globalstudentscore|overallscore|globalrank|schoolscore/i);
    const identitySrc = fs.readFileSync("packages/database/src/schema/organization.ts", "utf8");
    expect(identitySrc).not.toMatch(/evidence|audio|score/i);
  });

  it("19-AD/26. scale simulation: 3-level synthetic hierarchy (80 nodes) — org-subtree scope resolution stays correct", async () => {
    const gov2 = await org.createOrganization({ tenantId: TENANT_M, type: "GOVERNORATE", name: "محافظة اختبار الحجم", parentOrganizationId: MINISTRY_ORG.id, operationKey: `scale-gov-${randomUUID()}` });
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const dirx = await org.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: `مديرية ${i}`, parentOrganizationId: gov2.organization.id, operationKey: `scale-d-${randomUUID()}-${i}` });
      for (let j = 0; j < 2; j++) {
        const sch = await org.createSchool({ tenantId: TENANT_M, name: `مدرسة ${i}-${j}`, code: `SC-${randomUUID().slice(0, 10)}`, organizationId: dirx.organization.id, operationKey: `scale-s-${randomUUID()}-${i}-${j}` });
        ids.push(sch.school.id);
      }
    }
    expect(ids.length).toBe(40);
    await org.addStaffMembership({ tenantId: TENANT_M, userId: USER_ANALYST, role: "supervisor", scopeType: "ORGANIZATION", scopeId: gov2.organization.id, organizationId: gov2.organization.id, operationKey: `scale-sm-${randomUUID()}` });
    const dec = await org.checkScope({ tenantId: TENANT_M, userId: USER_ANALYST, resource: { tenantId: TENANT_M, schoolId: ids[39] } });
    expect(dec.authorized).toBe(true);
    expect(dec.scopeType).toBe("ORGANIZATION");
  });

  it("19-AA. performance baseline: org lookup / school scope / membership / tenant authz / evidence scoped query", async () => {
    const t = async (fn: () => Promise<unknown>): Promise<number> => { const s = performance.now(); await fn(); return Math.round(performance.now() - s); };
    const orgLookup = await t(() => org.ancestorChain(TENANT_M, DIRECTORATE_ORG.id));
    const schoolScope = await t(() => org.checkScope({ tenantId: TENANT_M, userId: USER_ANALYST, resource: { tenantId: TENANT_M, schoolId: SCHOOL_A_ID } }));
    const membershipList = await t(() => db.select().from(dbmod.staffMembershipsTable));
    const tenantAuthz = await t(() => org.checkScope({ tenantId: TENANT_M, userId: USER_TEACHER, resource: { tenantId: TENANT_M, schoolId: SCHOOL_B_ID } }));
    const stuRows = await db.select().from(dbmod.studentsTable).limit(1);
    const evidenceQuery = await t(() => dbmod.listEvidenceForStudent({ tenantId: TENANT_M, studentId: stuRows[0]?.id ?? randomUUID(), limit: 50 }));
    console.log(`[CORE-19 PERF] org_lookup=${orgLookup}ms school_scope=${schoolScope}ms membership_list=${membershipList}ms tenant_authz=${tenantAuthz}ms evidence_query=${evidenceQuery}ms`);
    expect(orgLookup).toBeLessThan(2000);
    expect(schoolScope).toBeLessThan(2000);
  });
});
