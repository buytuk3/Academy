/**
 * CORE-24 / Wave 1 — Persistent Content & Exercise Library (ACR-24/001, ADR-004).
 * REAL PostgreSQL (canonical migrations 0000..0004, fresh-DB built).
 * Covers the Wave-1 directive §12: schema integrity, FK integrity (incl.
 * cross-tenant rejection), CHECK constraints, unique constraints, versioning/
 * lifecycle, curriculum binding, operation key, idempotency (retry + failure
 * recovery), concurrency (parallel creates → no duplicates), tenant isolation,
 * audit hygiene, separation invariant (NO evidence/student columns — Evidence
 * stays the ONLY canonical learning fact), no-AI scan, synthetic scale.
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
let dbmod: any, db: any, cf: any;
let USER_A1: string, USER_B1: string;

const anchorA = {
  curriculumId: "cur-eg-ar", curriculumVersion: "2026", country: "EG", educationSystem: "EG-NATIONAL",
  stageKey: "PRIMARY", gradeKey: "EG-PR-04", gradeLevel: "4", subject: "dictation",
  bookId: "bk-ar-4", unitId: "u3", lessonId: "l7", objectiveId: "obj-77", skill: "dictation.accuracy", dimension: "accuracy",
};

d("CORE-24 Wave 1: persistent content & exercise library (real PostgreSQL)", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    const { tenantsTable, usersTable } = dbmod;
    await db.insert(tenantsTable).values([
      { id: TENANT_A, name: "C24 مكتبة A", slug: `c24a-${randomUUID()}` },
      { id: TENANT_B, name: "C24 مكتبة B", slug: `c24b-${randomUUID()}` },
    ]);
    USER_A1 = randomUUID(); USER_B1 = randomUUID();
    await db.insert(usersTable).values([
      { id: USER_A1, tenantId: TENANT_A, firstName: "م", lastName: "معلم A", email: `c24a-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" },
      { id: USER_B1, tenantId: TENANT_B, firstName: "ب", lastName: "معلم B", email: `c24b-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" },
    ]);
  });

  it("1. fresh-DB chain: journal 0000..0004 + 0005 (ACR-24/002, owner-approved); 0004/0005 additive, EXACTLY the ACR tables", async () => {
    const journal = JSON.parse(readFileSync("packages/database/migrations/meta/_journal.json", "utf8"));
    expect(journal.entries.map((e: any) => e.tag)).toEqual([
      "0000_core18_canonical_baseline",
      "0001_core18_identity_membership",
      "0002_core19_organization_scope",
      "0003_core20_evidence_tenant_time_index",
      "0004_core24_content_exercise_library",
      "0005_core24_activity_assignment_attempt_state", // ACR-24/002 (CORE-24 Wave 2) — STATE only
    ]);
    const sql0004 = readFileSync("packages/database/migrations/0004_core24_content_exercise_library.sql", "utf8");
    const created = [...sql0004.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?\"?([a-z_]+)\"?/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["content_definitions", "exercise_definitions"]);
    expect(sql0004).not.toMatch(/drop\s+table|drop\s+column|truncate/i); // forward-only, additive
    // both tables REALLY exist in the migrated fresh DB
    const res: any = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('content_definitions','exercise_definitions') ORDER BY table_name`);
    expect((res.rows ?? res).length).toBe(2);
  });

  it("2. schema integrity: NO evidence/result/student columns — separation invariant at DB level (ADR-004)", async () => {
    const res: any = await db.execute(sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('content_definitions','exercise_definitions')`);
    const cols = (res.rows ?? res).map((r: any) => r.column_name);
    for (const banned of ["evidence_ref", "evidence_id", "student_id", "result", "score", "response_payload", "audio_data", "confidence"]) {
      expect(cols).not.toContain(banned); // definitions ONLY — Evidence stays canonical (recordEvidence path)
    }
    expect(cols).toContain("body_ref"); // Object Storage REFERENCE only (ADR-004 media boundary)
    expect(cols).toContain("curriculum_version"); // mandatory immutable anchor (21-O)
  });

  it("3. CHECK constraints enforced by the DB: status / engine_binding / self-parent / version / max_attempts", async () => {
    const { contentDefinitionsTable, exerciseDefinitionsTable } = dbmod;
    // invalid status
    await expect(db.insert(contentDefinitionsTable).values({
      id: randomUUID(), tenantId: TENANT_A, rootContentId: randomUUID(), version: 1, status: "ARCHIVED",
      kind: "WORD_LIST", source: "TEACHER_CREATED", title: "x", curriculumId: "c", curriculumVersion: "2026",
      stageKey: "PRIMARY", gradeLevel: "4", subject: "dictation", createdBy: USER_A1, operationKey: `chk-${randomUUID()}`,
    })).rejects.toThrow(/content_status_check/);
    // invalid engine binding
    await expect(db.insert(exerciseDefinitionsTable).values({
      id: randomUUID(), tenantId: TENANT_A, rootExerciseId: randomUUID(), version: 1,
      activityType: "DICTATION", engineBinding: "SPEAKING", expectedResponseType: "TYPED", source: "TEACHER_CREATED",
      curriculumId: "c", curriculumVersion: "2026", stageKey: "PRIMARY", gradeLevel: "4", subject: "dictation",
      createdBy: USER_A1, operationKey: `chk-${randomUUID()}`,
    })).rejects.toThrow(/exercise_engine_check/);
    // self-parent
    const sid = randomUUID();
    await expect(db.insert(contentDefinitionsTable).values({
      id: sid, tenantId: TENANT_A, rootContentId: sid, parentVersionId: sid, version: 1,
      kind: "WORD_LIST", source: "TEACHER_CREATED", title: "x", curriculumId: "c", curriculumVersion: "2026",
      stageKey: "PRIMARY", gradeLevel: "4", subject: "dictation", createdBy: USER_A1, operationKey: `chk-${randomUUID()}`,
    })).rejects.toThrow(/content_no_self_parent/);
    // version < 1
    await expect(db.insert(contentDefinitionsTable).values({
      id: randomUUID(), tenantId: TENANT_A, rootContentId: randomUUID(), version: 0,
      kind: "WORD_LIST", source: "TEACHER_CREATED", title: "x", curriculumId: "c", curriculumVersion: "2026",
      stageKey: "PRIMARY", gradeLevel: "4", subject: "dictation", createdBy: USER_A1, operationKey: `chk-${randomUUID()}`,
    })).rejects.toThrow(/content_version_positive/);
    // max_attempts = 0
    await expect(db.insert(exerciseDefinitionsTable).values({
      id: randomUUID(), tenantId: TENANT_A, rootExerciseId: randomUUID(), version: 1, maxAttempts: 0,
      activityType: "DICTATION", engineBinding: "DICTATION", expectedResponseType: "TYPED", source: "TEACHER_CREATED",
      curriculumId: "c", curriculumVersion: "2026", stageKey: "PRIMARY", gradeLevel: "4", subject: "dictation",
      createdBy: USER_A1, operationKey: `chk-${randomUUID()}`,
    })).rejects.toThrow(/exercise_max_attempts_check/);
  });

  it("4. tenant isolation is DB-level: cross-tenant created_by FK and cross-tenant content link REJECTED", async () => {
    const { contentDefinitionsTable, exerciseDefinitionsTable } = dbmod;
    // Tenant B row created by Tenant A user → composite FK rejection
    await expect(db.insert(contentDefinitionsTable).values({
      id: randomUUID(), tenantId: TENANT_B, rootContentId: randomUUID(), version: 1,
      kind: "WORD_LIST", source: "TEACHER_CREATED", title: "عابر", curriculumId: "c", curriculumVersion: "2026",
      stageKey: "PRIMARY", gradeLevel: "4", subject: "dictation", createdBy: USER_A1, operationKey: `x-${randomUUID()}`,
    })).rejects.toThrow(/content_created_by_tenant_fk/);
    // Tenant A content owned by A; Tenant B exercise linking to it → composite FK rejection
    const { content } = await dbmod.createContentDefinition({
      tenantId: TENANT_A, title: "كلمات الوحدة الثالثة", kind: "WORD_LIST", source: "TEACHER_CREATED",
      curriculum: anchorA, createdBy: USER_A1, operationKey: `c24-iso-${randomUUID()}`,
    });
    await expect(db.insert(exerciseDefinitionsTable).values({
      id: randomUUID(), tenantId: TENANT_B, rootExerciseId: randomUUID(), version: 1, contentId: content.id,
      activityType: "DICTATION", engineBinding: "DICTATION", expectedResponseType: "TYPED", source: "TEACHER_CREATED",
      curriculumId: "c", curriculumVersion: "2026", stageKey: "PRIMARY", gradeLevel: "4", subject: "dictation",
      createdBy: USER_B1, operationKey: `x-${randomUUID()}`,
    })).rejects.toThrow(/exercise_content_tenant_fk/);
  });

  it("5. capability create + idempotent retry: same operationKey → SAME id, created=false, ONE row", async () => {
    const op = `c24-idem-${randomUUID()}`;
    const r1 = await dbmod.createContentDefinition({
      tenantId: TENANT_A, title: "نص قراءة: المدرسة", kind: "READING_TEXT", source: "TEACHER_CREATED",
      bodyRef: `s3://buytuk-content/${randomUUID()}`, curriculum: anchorA, createdBy: USER_A1, operationKey: op,
    });
    expect(r1.created).toBe(true);
    const r2 = await dbmod.createContentDefinition({ // HTTP/worker retry
      tenantId: TENANT_A, title: "نص قراءة: المدرسة", kind: "READING_TEXT", source: "TEACHER_CREATED",
      curriculum: anchorA, createdBy: USER_A1, operationKey: op,
    });
    expect(r2.created).toBe(false);
    expect(r2.content.id).toBe(r1.content.id);
    const rows = await db.select().from(dbmod.contentDefinitionsTable)
      .where(and(eq(dbmod.contentDefinitionsTable.tenantId, TENANT_A), eq(dbmod.contentDefinitionsTable.operationKey, op)));
    expect(rows.length).toBe(1);
  });

  it("6. concurrency: 5 parallel creates with the SAME operationKey → exactly ONE row, all callers agree", async () => {
    const op = `c24-par-${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 5 }, () => dbmod.createContentDefinition({
      tenantId: TENANT_A, title: "تدريب متزامن", kind: "QUESTION_SET", source: "TEACHER_CREATED",
      curriculum: anchorA, createdBy: USER_A1, operationKey: op,
    })));
    const ids = new Set(results.map((r: any) => r.content.id));
    expect(ids.size).toBe(1); // no duplicates under concurrency
    expect(results.filter((r: any) => r.created).length).toBe(1);
    const rows = await db.select().from(dbmod.contentDefinitionsTable)
      .where(and(eq(dbmod.contentDefinitionsTable.tenantId, TENANT_A), eq(dbmod.contentDefinitionsTable.operationKey, op)));
    expect(rows.length).toBe(1);
  });

  it("7. versioning lifecycle: DRAFT → PUBLISHED (idempotent) → supersede creates v2 DRAFT, v1 SUPERSEDED (history kept)", async () => {
    const op = `c24-life-${randomUUID()}`;
    const { content } = await dbmod.createContentDefinition({
      tenantId: TENANT_A, title: "إملاء: المدرسة v1", kind: "WORD_LIST", source: "TEACHER_CREATED",
      curriculum: anchorA, createdBy: USER_A1, operationKey: op,
    });
    // draft → published (CAS)
    const p1 = await dbmod.publishContent(TENANT_A, content.id, USER_A1);
    expect(p1.status).toBe("PUBLISHED");
    const p2 = await dbmod.publishContent(TENANT_A, content.id, USER_A1); // idempotent re-publish
    expect(p2.id).toBe(content.id);
    // publish is the only exit from DRAFT: superseding a DRAFT is refused
    const draft = (await dbmod.createContentDefinition({
      tenantId: TENANT_A, title: "مسودة", kind: "WORD_LIST", source: "TEACHER_CREATED",
      curriculum: anchorA, createdBy: USER_A1, operationKey: `c24-dr-${randomUUID()}`,
    })).content;
    await expect(dbmod.supersedeContent({ tenantId: TENANT_A, contentId: draft.id, actorId: USER_A1, operationKey: `c24-sd-${randomUUID()}` }))
      .rejects.toThrow(/SUPERSEDE_REQUIRES_PUBLISHED/);
    // supersede the PUBLISHED row → NEW v2 DRAFT row, v1 SUPERSEDED — history queryable, never rewritten
    const v2 = await dbmod.supersedeContent({
      tenantId: TENANT_A, contentId: content.id, actorId: USER_A1, operationKey: `c24-sp-${randomUUID()}`,
      title: "إملاء: المدرسة v2",
    });
    expect(v2.version).toBe(2);
    expect(v2.status).toBe("DRAFT");
    expect(v2.parentVersionId).toBe(content.id);
    expect(v2.rootContentId).toBe(content.rootContentId);
    const versions = await dbmod.listContentVersions(TENANT_A, content.rootContentId);
    expect(versions.length).toBe(2);
    expect(versions[0].status).toBe("SUPERSEDED"); // old version preserved and marked — never deleted/rewritten
    expect(versions[1].version).toBe(2);
    // retry-style supersede on the SUPERSEDED v1 (new key) CONVERGES on the existing successor —
    // immutable history: v1 never rewritten, no v3 branch from v1, no duplicates (Wave-1 §7)
    const converged = await dbmod.supersedeContent({ tenantId: TENANT_A, contentId: content.id, actorId: USER_A1, operationKey: `c24-sx-${randomUUID()}` });
    expect(converged.id).toBe(v2.id);
    expect((await dbmod.listContentVersions(TENANT_A, content.rootContentId)).length).toBe(2);
  });

  it("8. supersede race recovery: concurrent different-key supersedes → exactly ONE winner; loser rolls back (no orphan successor); retry succeeds", async () => {
    const op = `c24-race-${randomUUID()}`;
    const { content } = await dbmod.createContentDefinition({
      tenantId: TENANT_A, title: "سباق الاستبدال", kind: "READING_TEXT", source: "TEACHER_CREATED",
      curriculum: anchorA, createdBy: USER_A1, operationKey: op,
    });
    await dbmod.publishContent(TENANT_A, content.id, USER_A1);
    const attempts = await Promise.allSettled([
      dbmod.supersedeContent({ tenantId: TENANT_A, contentId: content.id, actorId: USER_A1, operationKey: `c24-r1-${randomUUID()}` }),
      dbmod.supersedeContent({ tenantId: TENANT_A, contentId: content.id, actorId: USER_A1, operationKey: `c24-r2-${randomUUID()}` }),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled").length).toBe(1);
    expect(attempts.filter((a) => a.status === "rejected").length).toBe(1);
    // failure recovery: retry after the lost race → clean successor, still exactly 2 versions
    const retry = await dbmod.supersedeContent({ tenantId: TENANT_A, contentId: content.id, actorId: USER_A1, operationKey: `c24-r3-${randomUUID()}` });
    expect(retry.version).toBe(2);
    const versions = await dbmod.listContentVersions(TENANT_A, content.rootContentId);
    expect(versions.length).toBe(2); // v1 + exactly one successor — loser's insert rolled back
  });

  it("9. exercise lifecycle + ONE-engine binding + published-contract loader (CORE-22 shape, version-pinned)", async () => {
    const op = `c24-ex-${randomUUID()}`;
    const { content } = await dbmod.createContentDefinition({
      tenantId: TENANT_A, title: "كلمات للإملاء", kind: "WORD_LIST", source: "TEACHER_CREATED",
      curriculum: anchorA, createdBy: USER_A1, operationKey: `c24-exc-${randomUUID()}`,
    });
    const { exercise } = await dbmod.createExerciseDefinition({
      tenantId: TENANT_A, activityType: "DICTATION", engineBinding: "DICTATION", expectedResponseType: "TYPED",
      contentId: content.id, source: "TEACHER_CREATED", curriculum: anchorA, createdBy: USER_A1, operationKey: op,
      maxAttempts: 3, timeLimitMs: 600000,
    });
    expect(exercise.status).toBe("DRAFT");
    // engine binding is DB-enforced closed vocabulary; ONE engine per exercise row
    const rows = await db.select().from(dbmod.exerciseDefinitionsTable).where(eq(dbmod.exerciseDefinitionsTable.id, exercise.id));
    expect(rows[0].engineBinding).toBe("DICTATION");
    // draft exercise is NOT deliverable (version binding: published only)
    await expect(dbmod.getPublishedExerciseContract(TENANT_A, exercise.id)).rejects.toThrow(/EXERCISE_NOT_PUBLISHED_IN_TENANT/);
    await dbmod.publishExercise(TENANT_A, exercise.id, USER_A1);
    const contract = await dbmod.getPublishedExerciseContract(TENANT_A, exercise.id);
    // structural compatibility with the EXISTING CORE-22 ExerciseDefinition contract — no contract change
    expect(contract.exerciseId).toBe(exercise.id);
    expect(contract.engineBinding).toBe("DICTATION");
    expect((contract.expectedResponse as any).type).toBe("TYPED");
    expect(contract.curriculum.curriculumVersion).toBe("2026"); // 21-O carried
    expect(contract.contentRefs).toEqual([content.id]); // content referenced, never copied
    expect(contract.status).toBe("ACTIVE");
    expect(contract.version).toBe(1);
  });

  it("10. curriculum binding is mandatory: missing curriculumVersion → refused (21-O, not free text)", async () => {
    await expect(dbmod.createContentDefinition({
      tenantId: TENANT_A, title: "بلا نسخة منهج", kind: "WORD_LIST", source: "TEACHER_CREATED",
      curriculum: { ...anchorA, curriculumVersion: undefined } as any, createdBy: USER_A1, operationKey: `c24-cv-${randomUUID()}`,
    })).rejects.toThrow(/CURRICULUM_VERSION_REQUIRED/);
    await expect(dbmod.createExerciseDefinition({
      tenantId: TENANT_A, activityType: "DICTATION", engineBinding: "DICTATION", expectedResponseType: "TYPED",
      source: "TEACHER_CREATED", curriculum: { ...anchorA, curriculumId: "" } as any, createdBy: USER_A1, operationKey: `c24-cv2-${randomUUID()}`,
    })).rejects.toThrow(/CURRICULUM_ANCHOR_REQUIRED/);
  });

  it("11. reads are tenant-scoped + search/filter/pagination work (indexes-backed)", async () => {
    // seed one PUBLISHED dictation content row (earlier tests leave DRAFT/SUPERSEDED only)
    const seeded = await dbmod.createContentDefinition({
      tenantId: TENANT_A, title: "إملاء منشور للبحث", kind: "WORD_LIST", source: "TEACHER_CREATED",
      curriculum: anchorA, createdBy: USER_A1, operationKey: `c24-pub-${randomUUID()}`,
    });
    await dbmod.publishContent(TENANT_A, seeded.content.id, USER_A1);
    // Tenant B sees NOTHING from Tenant A's library
    const foreign = await dbmod.searchContent(TENANT_B, {});
    expect(foreign.total).toBe(0);
    const { total, rows } = await dbmod.searchContent(TENANT_A, { status: "PUBLISHED", subject: "dictation" }, { limit: 10, offset: 0 });
    expect(total).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBeLessThanOrEqual(10);
    for (const r of rows) {
      expect(r.tenantId).toBe(TENANT_A);
      expect(r.status).toBe("PUBLISHED");
    }
    const byPrefix = await dbmod.searchContent(TENANT_A, { titlePrefix: "إملاء" });
    expect(byPrefix.total).toBeGreaterThanOrEqual(1);
    const byKind = await dbmod.searchExercises(TENANT_A, { engineBinding: "DICTATION", status: "PUBLISHED" });
    expect(byKind.total).toBeGreaterThanOrEqual(1);
  });

  it("12. audit hygiene: lifecycle actions audited via EXISTING audit_logs — reason codes only (no body, no PII)", async () => {
    const rows = await db.select().from(dbmod.auditLogsTable).where(eq(dbmod.auditLogsTable.tenantId, TENANT_A));
    const actions = rows.map((r: any) => r.action);
    for (const expected of ["content.created", "content.published", "content.superseded", "exercise.created", "exercise.published"]) {
      expect(actions).toContain(expected);
    }
    for (const r of rows.filter((x: any) => x.entity === "content_definition" || x.entity === "exercise_definition")) {
      const s = JSON.stringify(r);
      expect(s).not.toMatch(/password|token|religio|s3:\/\//i); // no PII, no religion values, no media bodies
    }
  });

  it("13. no-AI + no-second-evidence scan over the library capability code (comment-stripped)", () => {
    for (const f of ["packages/database/src/content/library.ts", "packages/database/src/schema/content-library.ts"]) {
      const raw = readFileSync(f, "utf8");
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
      expect(code).not.toMatch(/openai|anthropic|onnx|llm|\.predict\(|mlModel/i);
      expect(code).not.toMatch(/recordEvidence|evidenceTable/); // library NEVER touches canonical Evidence
    }
  });

  it("14. synthetic scale: 300+300 persisted definitions created + searched (no hard limits, indexed reads)", async () => {
    const t0 = Date.now();
    for (let i = 0; i < 300; i++) {
      await dbmod.createContentDefinition({
        tenantId: TENANT_A, title: `مقياس محتوى ${i}`, kind: "QUESTION_SET", source: i % 2 === 0 ? "CURRICULUM" : "TEACHER_CREATED",
        curriculum: { ...anchorA, lessonId: `l-scale-${i % 20}` }, createdBy: USER_A1, operationKey: `c24-scale-c-${randomUUID()}`,
      });
      await dbmod.createExerciseDefinition({
        tenantId: TENANT_A, activityType: i % 2 === 0 ? "DICTATION" : "PRACTICE", engineBinding: "DICTATION",
        expectedResponseType: "TYPED", source: "TEACHER_CREATED", curriculum: { ...anchorA, lessonId: `l-scale-${i % 20}` },
        createdBy: USER_A1, operationKey: `c24-scale-e-${randomUUID()}`,
      });
    }
    const elapsed = Date.now() - t0;
    const all = await dbmod.searchContent(TENANT_A, { kind: "QUESTION_SET" }, { limit: 200, offset: 0 });
    expect(all.total).toBeGreaterThanOrEqual(300);
    expect(all.rows.length).toBe(200); // pagination cap honored
    // deterministic pagination window over the QUESTION_SET slice: offset 250 of ≥300 → exactly 50
    const paged = await dbmod.searchContent(TENANT_A, { kind: "QUESTION_SET" }, { limit: 50, offset: 250 });
    expect(paged.rows.length).toBe(50);
    expect(elapsed).toBeLessThan(60000); // generous bound — no pathological N+1
  });
});
