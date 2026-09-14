/**
 * CORE-20 — National Educational Oversight + Aggregation + Student Educational
 * Access Foundation (REAL PostgreSQL, canonical migrations 0000..0003).
 * Covers the 20 mandatory 20-AO scenarios + synthetic scale (20-AP) +
 * concurrency/idempotency (20-AN). Auto-skips unless CORE20_RUNTIME=1.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";

const RUN = process.env.CORE20_RUNTIME === "1";
const d = RUN ? describe : describe.skip;

// ===== Hierarchy & actors =====
const TENANT_M = randomUUID();
let dbmod: any, db: any, ov: any;
let MINISTRY: any, GOV_CAIRO: any, GOV_ALEX: any, DIR_1: any, DIR_2: any, DIR_3: any;
let SCHOOL_A = randomUUID(), SCHOOL_B = randomUUID(), SCHOOL_C = randomUUID();
const CLASS_4A = randomUUID(), CLASS_4B = randomUUID(), CLASS_5P = randomUUID();
let USER_MINISTRY: string, USER_GOV: string, USER_DIR1: string, USER_PRINCIPAL_A: string, USER_TEACHER_A: string;
const ID_OP = `c20-id-${randomUUID()}`;
let STUDENT_A: string, STUDENT_B: string, STUDENT_C: string, IDENTITY_ID: string;
// time windows (20-AD: current + equal-length previous)
const CUR = { from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" };

const usersToInsert: any[] = [];

d("CORE-20 oversight & aggregation (real PostgreSQL)", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    ov = dbmod;
    const { tenantsTable, usersTable, organizationsTable, schoolsTable, classesTable, studentsTable } = dbmod;
    await db.insert(tenantsTable).values({ id: TENANT_M, name: "وزارة التجريب", slug: `c20-${randomUUID()}` });
    // actors
    USER_MINISTRY = randomUUID(); USER_GOV = randomUUID(); USER_DIR1 = randomUUID(); USER_PRINCIPAL_A = randomUUID(); USER_TEACHER_A = randomUUID();
    await db.insert(usersTable).values([
      { id: USER_MINISTRY, tenantId: TENANT_M, firstName: "م", lastName: "وزارة", email: `m-${randomUUID()}@x.test`, passwordHash: "x", role: "admin" },
      { id: USER_GOV, tenantId: TENANT_M, firstName: "ج", lastName: "محافظة", email: `g-${randomUUID()}@x.test`, passwordHash: "x", role: "admin" },
      { id: USER_DIR1, tenantId: TENANT_M, firstName: "د", lastName: "مديرية", email: `d-${randomUUID()}@x.test`, passwordHash: "x", role: "admin" },
      { id: USER_PRINCIPAL_A, tenantId: TENANT_M, firstName: "ع", lastName: "مدير مدرسة", email: `p-${randomUUID()}@x.test`, passwordHash: "x", role: "principal" },
      { id: USER_TEACHER_A, tenantId: TENANT_M, firstName: "ت", lastName: "معلم", email: `t-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" },
    ]);
    // org hierarchy: MINISTRY → GOVERNORATES → DIRECTORATES → SCHOOLS
    MINISTRY = (await ov.createOrganization({ tenantId: TENANT_M, type: "MINISTRY", name: "وزارة التربية والتعليم", country: "EG", operationKey: `c20-min-${randomUUID()}` })).organization;
    GOV_CAIRO = (await ov.createOrganization({ tenantId: TENANT_M, type: "GOVERNORATE", name: "محافظة القاهرة", parentOrganizationId: MINISTRY.id, operationKey: `c20-gc-${randomUUID()}` })).organization;
    GOV_ALEX = (await ov.createOrganization({ tenantId: TENANT_M, type: "GOVERNORATE", name: "محافظة الإسكندرية", parentOrganizationId: MINISTRY.id, operationKey: `c20-ga-${randomUUID()}` })).organization;
    DIR_1 = (await ov.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: "مديرية القاهرة التعليمية 1", parentOrganizationId: GOV_CAIRO.id, operationKey: `c20-d1-${randomUUID()}` })).organization;
    DIR_2 = (await ov.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: "مديرية القاهرة التعليمية 2", parentOrganizationId: GOV_CAIRO.id, operationKey: `c20-d2-${randomUUID()}` })).organization;
    DIR_3 = (await ov.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: "مديرية إسكندرية 3", parentOrganizationId: GOV_ALEX.id, operationKey: `c20-d3-${randomUUID()}` })).organization;
    await ov.createSchool({ tenantId: TENANT_M, name: "مدرسة أبو بكر الصديق", code: "ABK-1", organizationId: DIR_1.id, operationKey: `c20-sa-${randomUUID()}` }).then((r: any) => { SCHOOL_A = r.school.id; });
    await ov.createSchool({ tenantId: TENANT_M, name: "مدرسة ب", code: "SC-B", organizationId: DIR_2.id, operationKey: `c20-sb-${randomUUID()}` }).then((r: any) => { SCHOOL_B = r.school.id; });
    await ov.createSchool({ tenantId: TENANT_M, name: "مدرسة ج بالإسكندرية", code: "SC-C", organizationId: DIR_3.id, operationKey: `c20-sc-${randomUUID()}` }).then((r: any) => { SCHOOL_C = r.school.id; });
    // classes: School A has 4A (primary), School B has 4B (primary) + 5P (preparatory)
    const CLASS_C = randomUUID();
    await db.insert(classesTable).values([
      { id: CLASS_4A, tenantId: TENANT_M, schoolId: SCHOOL_A, name: "4A", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
      { id: CLASS_4B, tenantId: TENANT_M, schoolId: SCHOOL_B, name: "4B", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
      { id: CLASS_5P, tenantId: TENANT_M, schoolId: SCHOOL_B, name: "5P", gradeLevel: "5", academicYear: "2026/2027", stageKey: "PREPARATORY" },
      { id: CLASS_C, tenantId: TENANT_M, schoolId: SCHOOL_C, name: "4C", gradeLevel: "4", academicYear: "2026/2027", stageKey: "PRIMARY" },
    ]);
    // one global identity → student A (School A); students B/C in School B; student D in School C (Alexandria)
    const id1 = await ov.createIdentity({ operationKey: ID_OP });
    IDENTITY_ID = id1.identityId;
    STUDENT_A = randomUUID(); STUDENT_B = randomUUID(); STUDENT_C = randomUUID();
    const STUDENT_D = randomUUID();
    await db.insert(studentsTable).values([
      { id: STUDENT_A, tenantId: TENANT_M, classId: CLASS_4A, firstName: "أحمد محمود", lastName: "عبد الله حسن", studentCode: `A-${randomUUID()}`, identityId: IDENTITY_ID },
      { id: STUDENT_B, tenantId: TENANT_M, classId: CLASS_4B, firstName: "سارة", lastName: "ثانية", studentCode: `B-${randomUUID()}`, identityId: null },
      { id: STUDENT_C, tenantId: TENANT_M, classId: CLASS_5P, firstName: "كرم", lastName: "إعدادي", studentCode: `C-${randomUUID()}`, identityId: null },
      { id: STUDENT_D, tenantId: TENANT_M, classId: CLASS_C, firstName: "ليلى", lastName: "إسكندرانية", studentCode: `D-${randomUUID()}`, identityId: null },
    ]);
    // staff scopes (RBAC + Scope, 20-H)
    await ov.addStaffMembership({ tenantId: TENANT_M, userId: USER_MINISTRY, role: "ministry-admin", scopeType: "ORGANIZATION", scopeId: MINISTRY.id, organizationId: MINISTRY.id, operationKey: `c20-sm-${randomUUID()}` });
    await ov.addStaffMembership({ tenantId: TENANT_M, userId: USER_GOV, role: "governorate-supervisor", scopeType: "ORGANIZATION", scopeId: GOV_CAIRO.id, organizationId: GOV_CAIRO.id, operationKey: `c20-sg-${randomUUID()}` });
    await ov.addStaffMembership({ tenantId: TENANT_M, userId: USER_DIR1, role: "directorate-supervisor", scopeType: "ORGANIZATION", scopeId: DIR_1.id, organizationId: DIR_1.id, operationKey: `c20-sd-${randomUUID()}` });
    await ov.addStaffMembership({ tenantId: TENANT_M, userId: USER_PRINCIPAL_A, role: "principal", scopeType: "SCHOOL", scopeId: SCHOOL_A, schoolId: SCHOOL_A, operationKey: `c20-sp-${randomUUID()}` });
    await ov.addStaffMembership({ tenantId: TENANT_M, userId: USER_TEACHER_A, role: "teacher", scopeType: "CLASS", scopeId: CLASS_4A, schoolId: SCHOOL_A, operationKey: `c20-st-${randomUUID()}` });
    // evidence: A (school A, reading, current+previous), B (school B, 4B primary, current), C (5P preparatory, current)
    const evArgs = [
      { studentId: STUDENT_A, subject: "reading", confidence: 0.92, dim: "accuracy", op: `c20-a1-${randomUUID()}`, at: "2026-08-15T10:00:00.000Z" },
      { studentId: STUDENT_A, subject: "reading", confidence: 0.80, dim: "accuracy", op: `c20-a2-${randomUUID()}`, at: "2026-07-15T10:00:00.000Z" },
      { studentId: STUDENT_A, subject: "dictation", confidence: 0.76, dim: "spelling", op: `c20-a3-${randomUUID()}`, at: "2026-08-16T10:00:00.000Z" },
      { studentId: STUDENT_B, subject: "reading", confidence: 0.70, dim: "accuracy", op: `c20-b1-${randomUUID()}`, at: "2026-08-17T10:00:00.000Z" },
      { studentId: STUDENT_C, subject: "reading", confidence: 0.65, dim: "accuracy", op: `c20-c1-${randomUUID()}`, at: "2026-08-18T10:00:00.000Z" },
      { studentId: STUDENT_D, subject: "reading", confidence: 0.88, dim: "accuracy", op: `c20-d1-${randomUUID()}`, at: "2026-08-19T10:00:00.000Z" },
    ];
    for (const e of evArgs) {
      await ov.recordEvidence({
        tenantId: TENANT_M, studentId: e.studentId, actorRole: "student", evidenceType: "response",
        sourceEngine: "core20-test", subject: e.subject, confidence: e.confidence,
        metadata: { dimension: e.dim }, operationKey: e.op, occurredAt: new Date(e.at),
      } as any);
    }
  }, 90000);

  it("1. Ministry sees AGGREGATE across A+B+C (no student names anywhere in the result)", async () => {
    const res = await ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_MINISTRY, organizationId: MINISTRY.id, timePeriod: CUR, evidenceType: "response", subject: "reading" });
    const schoolIds = res.groups.map((g: any) => g.schoolId);
    expect(schoolIds).toContain(SCHOOL_A);
    expect(schoolIds).toContain(SCHOOL_B);
    expect(schoolIds).toContain(SCHOOL_C); // Alexandria school inside ministry subtree (all governorates)
    // metric shape (20-C/20-E): sampleSize, assessedStudents, coverage, confidence, trend
    const g = res.groups.find((x: any) => x.schoolId === SCHOOL_A);
    expect(g.sampleSize).toBeGreaterThanOrEqual(1);
    expect(g.assessedStudents).toBeGreaterThanOrEqual(1);
    expect(g.studentsInScope).toBeGreaterThanOrEqual(1);
    expect(typeof g.assessmentCoverage).toBe("number");
    expect(["low", "medium", "high"]).toContain(g.confidence);
    expect(JSON.stringify(res)).not.toMatch(/أحمد|سارة|firstName|studentName/); // 20-I default: no names
  });

  it("2. Governorate Cairo sees its descendants ONLY (not Alexandria)", async () => {
    const res = await ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_GOV, timePeriod: CUR, evidenceType: "response", subject: "reading" });
    const ids = res.groups.map((g: any) => g.schoolId);
    expect(ids).toContain(SCHOOL_A);
    expect(ids).toContain(SCHOOL_B);
    expect(ids).not.toContain(SCHOOL_C); // Alexandria school outside Cairo scope (student D evidence lives there)
  });

  it("3. Directorate 1 sees ITS schools only", async () => {
    const res = await ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_DIR1, timePeriod: CUR, evidenceType: "response" });
    const ids = new Set(res.groups.map((g: any) => g.schoolId));
    expect(ids.has(SCHOOL_A)).toBe(true);
    expect(ids.has(SCHOOL_B)).toBe(false);
    expect(ids.has(SCHOOL_C)).toBe(false);
  });

  it("4-5-6. detail gate: principal/teacher of School A → own students ALLOW; School B student DENY; teacher class-narrowed", async () => {
    await expect(ov.assertStudentDetailAccess(TENANT_M, USER_PRINCIPAL_A, STUDENT_A)).resolves.toBeUndefined(); // 4
    await expect(ov.assertStudentDetailAccess(TENANT_M, USER_PRINCIPAL_A, STUDENT_B)).rejects.toThrow(/STUDENT_DETAIL_ACCESS_DENIED/); // 5
    await expect(ov.assertStudentDetailAccess(TENANT_M, USER_TEACHER_A, STUDENT_A)).resolves.toBeUndefined(); // own class
    await expect(ov.assertStudentDetailAccess(TENANT_M, USER_TEACHER_A, STUDENT_B)).rejects.toThrow(/STUDENT_DETAIL_ACCESS_DENIED/); // 6
    await expect(ov.assertStudentDetailAccess(TENANT_M, USER_MINISTRY, STUDENT_A)).rejects.toThrow(/STUDENT_DETAIL_ACCESS_DENIED/); // ministry ≠ individual (20-B)
    await expect(ov.assertStudentDetailAccess(TENANT_M, USER_DIR1, STUDENT_A)).rejects.toThrow(/STUDENT_DETAIL_ACCESS_DENIED/); // directorate ≠ individual
  });

  it("7-8. stage/grade isolation: PRIMARY report excludes PREPARATORY; Grade 4 excludes Grade 5", async () => {
    const primary = await ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_MINISTRY, organizationId: MINISTRY.id, stageKey: "PRIMARY", timePeriod: CUR, evidenceType: "response", subject: "reading" });
    expect(primary.groups.every((g: any) => g.stageKey === "PRIMARY")).toBe(true);
    const grade4 = await ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_MINISTRY, organizationId: MINISTRY.id, gradeLevel: "4", timePeriod: CUR, evidenceType: "response", subject: "reading" });
    expect(grade4.groups.every((g: any) => g.gradeLevel === "4")).toBe(true);
    expect(grade4.groups.every((g: any) => g.stageKey !== "PREPARATORY")).toBe(true);
  });

  it("9-11. religion policy: pathway access, christian→islamic cross-access per policy, muslim→christian default DENY — all config-driven", async () => {
    // 9: Muslim student → Christian religious content → DENY (rule 4)
    const r9 = ov.canAccessContent(
      { tenantId: TENANT_M, studentReligiousContext: "MUSLIM", stageKey: "PRIMARY" },
      { subject: "christian-education", contentType: "religious-education", religiousContext: "CHRISTIAN" },
    );
    expect(r9.decision).toBe("DENY");
    expect(r9.reason).toBe("CROSS_ACCESS_POLICY_DENY");
    // 10: Christian student → Islamic content used for ARABIC GRAMMAR objectives → ALLOW (rule 3)
    const r10 = ov.canAccessContent(
      { tenantId: TENANT_M, studentReligiousContext: "CHRISTIAN", stageKey: "PRIMARY" },
      { subject: "arabic-language", contentType: "grammar", religiousContext: "ISLAMIC" },
    );
    expect(r10.decision).toBe("ALLOW");
    expect(r10.reason).toBe("CROSS_ACCESS_POLICY_ALLOW");
    // and islamic-education content itself stays pathway-only for the christian student
    expect(ov.canAccessContent({ tenantId: TENANT_M, studentReligiousContext: "CHRISTIAN" }, { subject: "islamic-education", contentType: "religious-education", religiousContext: "ISLAMIC" }).decision).toBe("DENY");
    // 11: same pathway → ALLOW (rules 1–2)
    const r11 = ov.canAccessContent(
      { tenantId: TENANT_M, studentReligiousContext: "MUSLIM" },
      { subject: "islamic-education", contentType: "religious-education", religiousContext: "ISLAMIC" },
    );
    expect(r11.decision).toBe("ALLOW");
    expect(r11.reason).toBe("PATHWAY_ACCESS");
    // config-driven: a deployment MAY open muslim→christian cross-access without code changes
    const opened = ov.canAccessContent(
      { tenantId: TENANT_M, studentReligiousContext: "MUSLIM" },
      { subject: "arabic-language", contentType: "reading", religiousContext: "CHRISTIAN" },
      { config: { christianToIslamicCrossAccess: { allowedContentTypes: [], allowedSubjects: [], allowAll: false }, muslimToChristianCrossAccess: { allowedContentTypes: ["reading"], allowedSubjects: ["arabic-language"], allowAll: false } } },
    );
    expect(opened.decision).toBe("ALLOW");
    // non-religious content is open (20-S)
    expect(ov.canAccessContent({ tenantId: TENANT_M }, { subject: "mathematics", contentType: "activity" }).decision).toBe("ALLOW");
    // 20-T: decisions never carry religion values in a loggable form
    expect(JSON.stringify(r9)).not.toMatch(/"MUSLIM"|"CHRISTIAN"/);
  });

  it("12-13-14. unified student login: context validated against membership; wrong claims DENIED; identityId is the only key (name never used)", async () => {
    // 12: one unified validation path — claims verified against REAL records
    const ok = await ov.validateStudentLoginContext({ tenantId: TENANT_M, identityId: IDENTITY_ID, claimed: { schoolId: SCHOOL_A, classId: CLASS_4A, gradeLevel: "4", stageKey: "PRIMARY" } });
    expect(ok.allowed).toBe(true);
    expect(ok.studentId).toBe(STUDENT_A);
    expect(ok.schoolId).toBe(SCHOOL_A);
    // 13: claiming School B while reality is School A → DENY (20-O)
    await expect(ov.validateStudentLoginContext({ tenantId: TENANT_M, identityId: IDENTITY_ID, claimed: { schoolId: SCHOOL_B } })).rejects.toThrow(/LOGIN_CONTEXT_CLAIM_MISMATCH/);
    await expect(ov.validateStudentLoginContext({ tenantId: TENANT_M, identityId: IDENTITY_ID, claimed: { gradeLevel: "5" } })).rejects.toThrow(/LOGIN_CONTEXT_CLAIM_MISMATCH/);
    // unknown identity → no membership → DENY
    await expect(ov.validateStudentLoginContext({ tenantId: TENANT_M, identityId: randomUUID() })).rejects.toThrow(/LOGIN_CONTEXT_NO_MEMBERSHIP/);
    // 14: the API surface carries NO name parameter at all (four-part name is display-only, 20-P)
    const sig = readFileSync("packages/database/src/oversight/login-context.ts", "utf8");
    expect(sig).not.toMatch(/firstName|fullName|fourPart|nameKey/);
  });

  it("15-16. CORE-18 untouched: evidence owned by original tenant; A→B→A preserves the SAME global identity", async () => {
    const before = await db.select().from(dbmod.evidenceTable);
    expect(before.filter((e: any) => e.studentId === STUDENT_A).every((e: any) => e.tenantId === TENANT_M)).toBe(true);
    // A→B→A via CORE-18 membership APIs (unchanged)
    await ov.startMembership({ identityId: IDENTITY_ID, tenantId: TENANT_M, studentId: STUDENT_A, schoolId: SCHOOL_A, classId: CLASS_4A, operationKey: `c20-ma-${randomUUID()}` });
    await ov.transferStudent({ identityId: IDENTITY_ID, fromTenantId: TENANT_M, toTenantId: TENANT_M, toStudentId: STUDENT_A, toSchoolId: SCHOOL_B, toClassId: CLASS_4B, operationKey: `c20-mb-${randomUUID()}` });
    const back = await ov.returnStudent({ identityId: IDENTITY_ID, toTenantId: TENANT_M, toStudentId: STUDENT_A, toSchoolId: SCHOOL_A, toClassId: CLASS_4A, operationKey: `c20-mc-${randomUUID()}` });
    expect(back.identityId).toBe(IDENTITY_ID);
    const after = await db.select().from(dbmod.evidenceTable);
    expect(after.filter((e: any) => e.studentId === STUDENT_A).every((e: any) => e.tenantId === TENANT_M)).toBe(true);
    expect(after.length).toBe(before.length); // no duplicate evidence created by movement
  });

  it("17. minimumAggregationSize: small group → INSUFFICIENT_EVIDENCE (no mean, no trend)", async () => {
    // School A reading group has exactly 1 assessed student in the window
    const res = await ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_MINISTRY, organizationId: MINISTRY.id, schoolId: SCHOOL_A, timePeriod: CUR, evidenceType: "response", subject: "reading", minimumAggregationSize: 2 });
    const g = res.groups.find((x: any) => x.schoolId === SCHOOL_A);
    expect(g.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(g.mean).toBeNull(); // the "40% student" cannot be exposed (20-AA)
    expect(g.trend).toBeNull();
    // without the threshold (default 5): also suppressed here (1 student)
    const res2 = await ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_MINISTRY, organizationId: MINISTRY.id, schoolId: SCHOOL_A, timePeriod: CUR, evidenceType: "response", subject: "reading" });
    expect(res2.groups.find((x: any) => x.schoolId === SCHOOL_A).status).toBe("INSUFFICIENT_EVIDENCE");
    // config-driven: minimum 1 → group published (capability, not a legal number)
    const res3 = await ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_MINISTRY, organizationId: MINISTRY.id, schoolId: SCHOOL_A, timePeriod: CUR, evidenceType: "response", subject: "reading", minimumAggregationSize: 1 });
    expect(res3.groups.find((x: any) => x.schoolId === SCHOOL_A).status).toBe("OK");
    expect(res3.groups.find((x: any) => x.schoolId === SCHOOL_A).mean).toBeCloseTo(0.92, 2);
  });

  it("20-AD. trend: current vs previous equal-length window with direction", async () => {
    const res = await ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_MINISTRY, organizationId: MINISTRY.id, schoolId: SCHOOL_A, timePeriod: CUR, evidenceType: "response", subject: "reading", minimumAggregationSize: 1, minSamplesMedium: 1, minSamplesHigh: 2 });
    const g = res.groups.find((x: any) => x.schoolId === SCHOOL_A);
    expect(g.trend).not.toBeNull();
    expect(g.trend.current).toBeCloseTo(0.92, 2);
    expect(g.trend.previous).toBeCloseTo(0.80, 2);
    expect(g.trend.direction).toBe("UP");
  });

  it("18-19-20. no global score, no AI, no duplicate Evidence/SLR (source + migration scans)", async () => {
    for (const f of ["packages/database/src/oversight/contracts.ts", "packages/database/src/oversight/aggregation.ts", "packages/database/src/oversight/access-policy.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s).not.toMatch(/globalStudentScore|overallStudentScore|schoolStudentScore|globalRank|overallScore/i); // 18
    }
    const agg = readFileSync("packages/database/src/oversight/aggregation.ts", "utf8");
    expect(agg).not.toMatch(/openai|anthropic|llm|onnx|\.predict|mlModel/i); // 19 — deterministic only
    for (const f of readdirSync("packages/database/migrations").filter((x) => x.endsWith(".sql"))) {
      const sql = readFileSync(`packages/database/migrations/${f}`, "utf8");
      expect(sql).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?(evidence_|student_learning_record_|.*statistics)/i); // 20 — no second store
    }
  });

  it("20-Z. anti-leakage: out-of-scope school/organization aggregation → DENIED", async () => {
    // directorate-1 user requesting school B → DENY
    await expect(ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_DIR1, schoolId: SCHOOL_B, timePeriod: CUR })).rejects.toThrow(/AGGREGATE_SCOPE_NOT_COVERED/);
    // governorate-cairo user drilling into Alexandria org → DENY
    await expect(ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_GOV, organizationId: GOV_ALEX.id, timePeriod: CUR })).rejects.toThrow(/AGGREGATE_SCOPE_NOT_COVERED/);
  });

  it("20-AN. concurrency + idempotency: parallel aggregates & parallel login validations → consistent single state; repeated policy decision identical", async () => {
    const [a, b] = await Promise.all([
      ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_MINISTRY, organizationId: MINISTRY.id, timePeriod: CUR, evidenceType: "response", subject: "reading" }),
      ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_MINISTRY, organizationId: MINISTRY.id, timePeriod: CUR, evidenceType: "response", subject: "reading" }),
    ]);
    expect(a.groups.map((g: any) => [g.schoolId, g.mean])).toEqual(b.groups.map((g: any) => [g.schoolId, g.mean])); // deterministic
    const [l1, l2] = await Promise.all([
      ov.validateStudentLoginContext({ tenantId: TENANT_M, identityId: IDENTITY_ID }),
      ov.validateStudentLoginContext({ tenantId: TENANT_M, identityId: IDENTITY_ID }),
    ]);
    expect(l1.studentId).toBe(l2.studentId);
    const args = [{ tenantId: TENANT_M, studentReligiousContext: "CHRISTIAN" as const }, { subject: "arabic-language", contentType: "grammar", religiousContext: "ISLAMIC" as const }];
    expect(ov.canAccessContent(args[0], args[1])).toEqual(ov.canAccessContent(args[0], args[1]));
  });

  it("20-AK. audit: aggregate access + student detail access recorded in EXISTING audit_logs with NO sensitive values", async () => {
    const rows = await db.select().from(dbmod.auditLogsTable);
    const actions = rows.map((r: any) => r.action);
    expect(actions).toContain("aggregate.accessed");
    expect(actions).toContain("student_detail.accessed");
    expect(actions).toContain("student_login.context_validated");
    for (const r of rows) {
      const blob = JSON.stringify(r);
      expect(blob).not.toMatch(/password|token|audio|secret|"MUSLIM"|"CHRISTIAN"|أحمد محمود/i);
    }
  });

  it("20-AP. synthetic scale: MINISTRY → 4 GOVERNORATES → 20 DIRECTORATES → 1,000 SCHOOLS — subtree aggregation stays correct + timed", async () => {
    const { schoolsTable } = dbmod;
    // build: 4 governorates, each 5 directorates, each carrying 50 schools → 1,000 synthetic schools
    for (let g = 0; g < 4; g++) {
      const gov = (await ov.createOrganization({ tenantId: TENANT_M, type: "GOVERNORATE", name: `محافظة اصطناعية ${g}`, parentOrganizationId: MINISTRY.id, operationKey: `scale20-g-${randomUUID()}-${g}` })).organization;
      const dirs: string[] = [];
      for (let dd = 0; dd < 5; dd++) {
        const dir = (await ov.createOrganization({ tenantId: TENANT_M, type: "DIRECTORATE", name: `مديرية ${g}-${dd}`, parentOrganizationId: gov.id, operationKey: `scale20-d-${randomUUID()}-${g}-${dd}` })).organization;
        dirs.push(dir.id);
      }
      const rows: any[] = [];
      for (let s = 0; s < 250; s++) {
        rows.push({ id: randomUUID(), tenantId: TENANT_M, name: `مدرسة ${g}-${s}`, code: `SYN-${g}-${s}-${randomUUID().slice(0, 6)}`, organizationId: dirs[s % dirs.length], operationKey: `scale20-s-${randomUUID()}-${g}-${s}` });
      }
      await db.insert(schoolsTable).values(rows);
    }
    // count synthetic schools under the ministry subtree
    const sub = await ov.descendantOrganizationIds(TENANT_M, MINISTRY.id);
    const all = [MINISTRY.id, ...sub];
    const schoolRows = (await db.select({ id: dbmod.schoolsTable.id }).from(dbmod.schoolsTable).where(and(eq(dbmod.schoolsTable.tenantId, TENANT_M), inArray(dbmod.schoolsTable.organizationId, all))));
    expect(schoolRows.length).toBeGreaterThanOrEqual(1000 + 3); // 1,000 synthetic + 3 real
    // aggregation over the WHOLE ministry subtree (time-bounded, indexed path)
    const t0 = performance.now();
    const res = await ov.aggregateEvidence({ tenantId: TENANT_M, userId: USER_MINISTRY, organizationId: MINISTRY.id, timePeriod: CUR, evidenceType: "response", subject: "reading" });
    const ms = Math.round(performance.now() - t0);
    console.log(`[CORE-20 PERF] ministry-subtree aggregation over ${schoolRows.length} schools: ${ms}ms, groups=${res.groups.length}`);
    expect(ms).toBeLessThan(15000); // sanity bound, not an optimization claim
  });
});
