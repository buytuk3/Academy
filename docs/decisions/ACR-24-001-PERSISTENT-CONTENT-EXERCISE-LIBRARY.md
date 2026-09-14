# ACR-24/001 — Persistent Content & Exercise Library

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


- **Status:** PROPOSED → approved for Wave 1 implementation pending owner review of Wave-0 closeout
- **Date:** 2026-09-11
- **Baseline:** `1d7ee7a6b3a6992652b76a9c5628438899d53606` (CORE-23f), git clean
- **Owner:** `core-platform`
- **Location:** `packages/database` (schema + capability code + canonical migration `0004`)
- **Related:** CORE-22 (content/exercise contracts — this ACR PERSISTS them, does not change them), CORE-21 (activity anchor / 21-O mandatory curriculumVersion), CORE-19 (tenant-safe composite FK pattern), CORE-18 (operationKey idempotency pattern), ADR-004 (ownership impact)

---

## 1. Problem

CORE-22 shipped `ContentDefinition` / `ExerciseDefinition` as **reference-only contracts + deterministic resolvers**
(`packages/database/src/content/contracts.ts`, `foundation.ts`). Verified facts at baseline:

- ZERO persistence for content/exercise anywhere (`db.insert|update|delete` in `src/content/` = audit_logs only).
- Teacher-created, curriculum, system, reinforcement and reassessment content cannot survive a process restart.
- No versioning, publish/supersede lifecycle, reuse, or search — the content library was explicitly deferred as a
  future ACR in CORE-22 closeout.

A product (CORE-24 goal) requires a **persistent, manageable, reusable library**.

## 2. Decision

Persist content & exercise definitions in **two new tables owned by `core-platform`** inside `packages/database`,
created by canonical migration **`0004_content_exercise_library`** (drizzle-kit generate → migrate; `push` forbidden).

### 2.1 Invariants (enforced by design, tests in Wave 1)

1. **Separation of the five+ layers stays absolute:**
   `Content ≠ Exercise ≠ Activity ≠ Assignment ≠ Attempt ≠ Evidence ≠ Assessment`.
2. **Evidence remains the single canonical learning fact.** These tables store **definitions** — NEVER Evidence rows,
   attempt results, scores, responses, or any student data. No student-owned column exists in either table.
3. **Curriculum stays canonical** (CORE-13/21-O): every row carries an immutable `curriculum_version` reference;
   no curriculum text is copied or reinterpreted.
4. **Media is never inline** (R-003/R-004): binary/audio lives in Object Storage via reference (`body_ref`) only.
5. **Tenant isolation at DB level** — composite tenant FKs per the CORE-18/19 pattern.
6. **Open vocabularies stay open** (21-D pattern): `kind`, `source`, `subject` are registries, not DB enums;
   only `engine_binding` and `status` are CHECK-constrained (closed by design).

### 2.2 `content_definitions` (DDL-in-doc — NOT executed in Wave 0)

```sql
CREATE TABLE "content_definitions" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "root_content_id" text NOT NULL,              -- lineage root (groups all versions of one logical content)
  "parent_version_id" text,                     -- previous version this supersedes (NULL for v1)
  "version" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'DRAFT',       -- DRAFT | PUBLISHED | SUPERSEDED  (CHECK)
  "kind" text NOT NULL,                         -- CORE-22 KNOWN_CONTENT_KINDS (open registry)
  "source" text NOT NULL,                       -- CORE-22 CONTENT_SOURCES: TEACHER | CURRICULUM | SYSTEM | REINFORCEMENT | REASSESSMENT (open)
  "title" text NOT NULL,
  "body_ref" text,                              -- Object Storage reference ONLY (audio/media never inline; R-003/R-004)
  "language" text NOT NULL DEFAULT 'ar',
  -- curriculum anchor (mandatory immutable version, 21-O; structurally = CORE-22 ContentCurriculumAnchor)
  "curriculum_id" text NOT NULL,
  "curriculum_version" text NOT NULL,
  "country" text, "education_system" text,
  "stage_key" text NOT NULL, "grade_key" text, "grade_level" text NOT NULL,
  "subject" text NOT NULL,
  "book_id" text, "unit_id" text, "lesson_id" text, "objective_id" text,
  "skill" text, "dimension" text,
  "created_by" text NOT NULL,                   -- users.id, same tenant (composite FK)
  "operation_key" text NOT NULL,                -- 19-X/21-X idempotency
  "metadata" jsonb,                             -- supplementary only (never a substitute for columns)
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "content_status_check"      CHECK ("status" IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  CONSTRAINT "content_no_self_parent"    CHECK ("parent_version_id" IS NULL OR "parent_version_id" <> "id"),
  CONSTRAINT "content_version_positive"  CHECK ("version" >= 1)
);

-- tenant-safe composite FKs (pattern of 0001/0002; parent uniques already exist from CORE-18/19:
-- users_id_tenant_uniq; self-referencing lineage needs its own)
ALTER TABLE "content_definitions" ADD CONSTRAINT "content_id_tenant_uniq"        UNIQUE ("id","tenant_id");
ALTER TABLE "content_definitions" ADD CONSTRAINT "content_op_key_tenant_uniq"    UNIQUE ("tenant_id","operation_key"); -- idempotency
ALTER TABLE "content_definitions" ADD CONSTRAINT "content_created_by_tenant_fk"  FOREIGN KEY ("tenant_id","created_by") REFERENCES "users"("tenant_id","id");
ALTER TABLE "content_definitions" ADD CONSTRAINT "content_parent_tenant_fk"      FOREIGN KEY ("tenant_id","parent_version_id") REFERENCES "content_definitions"("tenant_id","id");

-- indexes (search/filter paths)
CREATE INDEX "content_tenant_idx"           ON "content_definitions" ("tenant_id");
CREATE INDEX "content_tenant_status_idx"    ON "content_definitions" ("tenant_id","status");
CREATE INDEX "content_tenant_kind_idx"      ON "content_definitions" ("tenant_id","kind");
CREATE INDEX "content_tenant_subject_idx"   ON "content_definitions" ("tenant_id","subject");
CREATE INDEX "content_curriculum_idx"       ON "content_definitions" ("tenant_id","curriculum_id","curriculum_version");
CREATE INDEX "content_root_version_idx"     ON "content_definitions" ("tenant_id","root_content_id","version");
CREATE INDEX "content_lesson_idx"           ON "content_definitions" ("tenant_id","lesson_id");
CREATE INDEX "content_created_by_idx"       ON "content_definitions" ("tenant_id","created_by");
```

Search (Wave 1 scope): predicate filters on the indexes above + case-insensitive `title` prefix match.
Full-text/pg_trgm search is **deferred** — needs a product decision on language normalization (ties to R-001), no
new extension dependency in 0004.

### 2.3 `exercise_definitions` (DDL-in-doc — NOT executed in Wave 0)

```sql
CREATE TABLE "exercise_definitions" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "root_exercise_id" text NOT NULL,
  "parent_version_id" text,
  "version" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'DRAFT',       -- DRAFT | PUBLISHED | SUPERSEDED  (CHECK)
  "content_id" text,                            -- OPTIONAL link to library content (Exercise ≠ Content)
  "activity_type" text NOT NULL,                -- CORE-21 open activity vocabulary
  "engine_binding" text NOT NULL,               -- CORE-22 closed: READING | DICTATION | NUMERACY | ASSESSMENT (CHECK)
  "expected_response_type" text NOT NULL,       -- CORE-22 ExpectedResponseConfig (typed, validated in code)
  "expected_response_config" jsonb,
  "max_attempts" integer,
  "time_limit_ms" integer,
  -- curriculum anchor (mandatory immutable version, 21-O)
  "curriculum_id" text NOT NULL,
  "curriculum_version" text NOT NULL,
  "stage_key" text NOT NULL, "grade_key" text, "grade_level" text NOT NULL,
  "subject" text NOT NULL,
  "book_id" text, "unit_id" text, "lesson_id" text, "objective_id" text,
  "skill" text, "dimension" text,
  "created_by" text NOT NULL,
  "operation_key" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "exercise_status_check"        CHECK ("status" IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  CONSTRAINT "exercise_engine_check"        CHECK ("engine_binding" IN ('READING','DICTATION','NUMERACY','ASSESSMENT')),
  CONSTRAINT "exercise_no_self_parent"      CHECK ("parent_version_id" IS NULL OR "parent_version_id" <> "id"),
  CONSTRAINT "exercise_version_positive"    CHECK ("version" >= 1),
  CONSTRAINT "exercise_max_attempts_check"  CHECK ("max_attempts" IS NULL OR "max_attempts" >= 1)
);

ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_id_tenant_uniq"       UNIQUE ("id","tenant_id");
ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_op_key_tenant_uniq"   UNIQUE ("tenant_id","operation_key");
ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_created_by_tenant_fk" FOREIGN KEY ("tenant_id","created_by") REFERENCES "users"("tenant_id","id");
ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_content_tenant_fk"    FOREIGN KEY ("tenant_id","content_id") REFERENCES "content_definitions"("tenant_id","id");
ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_parent_tenant_fk"     FOREIGN KEY ("tenant_id","parent_version_id") REFERENCES "exercise_definitions"("tenant_id","id");

CREATE INDEX "exercise_tenant_idx"         ON "exercise_definitions" ("tenant_id");
CREATE INDEX "exercise_tenant_status_idx"  ON "exercise_definitions" ("tenant_id","status");
CREATE INDEX "exercise_engine_idx"         ON "exercise_definitions" ("tenant_id","engine_binding");
CREATE INDEX "exercise_activity_type_idx"  ON "exercise_definitions" ("tenant_id","activity_type");
CREATE INDEX "exercise_curriculum_idx"     ON "exercise_definitions" ("tenant_id","curriculum_id","curriculum_version");
CREATE INDEX "exercise_content_idx"        ON "exercise_definitions" ("tenant_id","content_id");
```

### 2.4 Versioning / lifecycle semantics (Wave 1 code, capability owner `core-platform`)

- **Draft → Published → Superseded.** A PUBLISHED row is immutable; a change creates a NEW row
  (`parent_version_id` = old id, same `root_*_id`, `version` + 1) and marks the old row SUPERSEDED.
- **Version binding:** activities/assignments bind to a specific exercise/content **row id** (version-pinned);
  CORE-23's `ExerciseResolution` already carries the binding — Wave 1 adds a loader that resolves the row into
  the existing contract shape. Contract signatures are NOT changed.
- **Reuse:** `variant_of` semantics from CORE-22 (`variantOf` reference, not copy) point at library rows.
- **Idempotency:** every create/publish/supersede carries `operation_key`; retries return the existing row
  (unique `(tenant_id, operation_key)`), same pattern as CORE-18 identity and CORE-19 staff operations.
- **Audit:** capability writes `audit_logs` (existing table, existing helper pattern from `activity/delivery.ts:50`)
  — `content.created|published|superseded`, `exercise.*`; reason codes only, no content body, no PII.
- **Transfer safety:** content/exercise rows are tenant-scoped definitions (no student data) — student transfers
  (ADR-002) do not touch them.

## 3. Alternatives considered

1. **JSONB blob on existing tables** — rejected: no owner clarity, no versioning/isolation constraints.
2. **Separate content-service table set outside packages/database** — rejected: violates single-canonical-DB
   ownership (core-platform owns storage) and adds a second store.
3. **Defer again** — rejected by CORE-24 mandate (product requires persistent library).

## 4. Consequences / impact

- Additive migration only; **zero changes** to CORE-17→23 tables, contracts, or behavior.
- Tests that assert the migration journal tags (CORE-21/22/23 zero-new-tables gates pin tags `0000..0003`)
  must be extended to accept `0004` — done in Wave 1 **with this ACR as the documented justification**.
- `OWNERSHIP` map gains `content-library` (see ADR-004); machine-checkable, additive.

## 5. Rollback

Forward-only chain (R-008 discipline). 0004 is purely additive; reverse = `DROP TABLE exercise_definitions,
content_definitions` never executed automatically. No destructive statements against 0000..0003 objects.

## 6. Verification plan (Wave 1, real PostgreSQL)

fresh DB → `db-migrate.mjs` → drift-check **drift = 0** → constraint tests (status/engine CHECKs, cross-tenant FK
rejection, operation_key dedup) → lifecycle tests (draft→publish→supersede, version pinning) → concurrency
(parallel creates same operation_key → single row) → full regression 17→23 → TSC = 0 → git clean.
