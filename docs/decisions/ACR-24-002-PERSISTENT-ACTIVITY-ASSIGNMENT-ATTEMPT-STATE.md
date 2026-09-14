# ACR-24/002 — Persistent Activity Assignment & Attempt State

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


- **Status:** PROPOSED → approved for Wave 2 implementation pending owner review of Wave-0 closeout
- **Date:** 2026-09-11
- **Baseline:** `1d7ee7a6b3a6992652b76a9c5628438899d53606` (CORE-23f), git clean
- **Owner:** `core-platform`
- **Location:** `packages/database` (schema + capability code + canonical migration `0005`)
- **Related:** ACR-24/001 (content/exercise library — 0005 depends on 0004 tables), CORE-21 (assignment/attempt contracts — persisted, NOT changed), CORE-23 (attempt lifecycle state machine + `attemptOperationKey` — reused as-is), CORE-18 (composite tenant FK + operationKey patterns), ADR-002 (transfer safety), ADR-004 (ownership impact)

---

## 1. Problem (verified at baseline)

- `assignActivity` (`packages/database/src/activity/delivery.ts:105–131`) validates, enforces policy, writes
  **audit only**, then returns an **in-memory object** — the assignment disappears with the request.
- The CORE-23 orchestrator walks the attempt lifecycle (`CREATED→…→EVIDENCE_RECORDED`) **in memory** and writes
  only the **canonical Evidence** row; there is no persisted attempt state → no resume, no status query, no
  operational recovery.
- A real product (assignments list per student/class, attempt status, teacher monitoring) requires durable
  assignment + attempt **state**.

## 2. Decision

Two new tables owned by `core-platform`, created by canonical migration **`0005_activity_assignment_attempt_state`**
(drizzle-kit generate → fresh-DB migrate; `push` forbidden).

### 2.1 The separation invariant (absolute, test-enforced in Wave 2)

```
Content ≠ Exercise ≠ Activity ≠ Assignment ≠ Attempt ≠ Evidence ≠ Assessment
```

- **Evidence stays the single canonical learning fact** (measurements, responses, confidence, results).
- `activity_assignments` / `activity_attempts` are **operational/administrative state** — they NEVER replace
  Evidence and store **no measurement values, no scores, no response payloads, no evaluation results**.
  The only Evidence linkage is `evidence_ref` — a plain **pointer** to the canonical Evidence row id
  (no copy, no second store; existence verified through the Evidence Reader).
- Time fields on the attempt row are **operational timings/state** (start/submit/duration segments from CORE-23
  `TimeEvidence`) — the *measured* performance remains exclusively in Evidence.

### 2.2 `activity_assignments` (DDL-in-doc — NOT executed in Wave 0)

```sql
CREATE TABLE "activity_assignments" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  -- WHAT (references + version binding — no activity copy; activities have no table by design, CORE-21)
  "activity_id" text NOT NULL,
  "activity_version" integer NOT NULL,
  "exercise_id" text,                           -- optional library binding (ACR-24/001 table)
  "exercise_version" integer,
  "curriculum_id" text NOT NULL,
  "curriculum_version" text NOT NULL,           -- 21-O mandatory, immutable
  "stage_key" text NOT NULL,
  "grade_level" text NOT NULL,
  "subject" text NOT NULL,
  -- WHO/TARGET (CORE-21 assignedTo: Student | Class | Grade | Stage | School — at least one anchor)
  "target_student_id" text,
  "target_class_id" text,
  "target_grade_level" text,
  "target_stage_key" text,
  "target_school_id" text NOT NULL,             -- scope anchor — isolation boundary (21-M)
  -- WHO ASSIGNED
  "assigned_by" text NOT NULL,                  -- users.id, same tenant
  "assigned_by_role" text NOT NULL,
  "source" text NOT NULL,                       -- CHECK = CORE-21 ASSIGNMENT_SOURCES (closed contract)
  "status" text NOT NULL DEFAULT 'ACTIVE',      -- ACTIVE | CANCELLED | CLOSED  (CHECK)
  "due_at" timestamptz,
  "operation_key" text NOT NULL,                -- 19-X idempotency anchor
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "assignment_status_check"   CHECK ("status" IN ('ACTIVE','CANCELLED','CLOSED')),
  CONSTRAINT "assignment_source_check"   CHECK ("source" IN ('teacherAssigned','recommended','curriculumRequired','reassessment','reinforcement')),
  CONSTRAINT "assignment_has_anchor"     CHECK ("target_student_id" IS NOT NULL OR "target_class_id" IS NOT NULL OR "target_grade_level" IS NOT NULL OR "target_stage_key" IS NOT NULL)
);

ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_id_tenant_uniq"        UNIQUE ("id","tenant_id");
ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_op_key_tenant_uniq"    UNIQUE ("tenant_id","operation_key");   -- idempotency
ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_target_student_fk"     FOREIGN KEY ("tenant_id","target_student_id") REFERENCES "students"("tenant_id","id");
ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_target_class_fk"       FOREIGN KEY ("tenant_id","target_class_id")   REFERENCES "classes"("tenant_id","id");
ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_target_school_fk"      FOREIGN KEY ("tenant_id","target_school_id")  REFERENCES "schools"("tenant_id","id");
ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_assigned_by_fk"        FOREIGN KEY ("tenant_id","assigned_by")       REFERENCES "users"("tenant_id","id");
ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_exercise_fk"           FOREIGN KEY ("tenant_id","exercise_id")       REFERENCES "exercise_definitions"("tenant_id","id");

CREATE INDEX "assignment_tenant_idx"          ON "activity_assignments" ("tenant_id");
CREATE INDEX "assignment_tenant_status_idx"   ON "activity_assignments" ("tenant_id","status");
CREATE INDEX "assignment_tenant_student_idx"  ON "activity_assignments" ("tenant_id","target_student_id");
CREATE INDEX "assignment_tenant_class_idx"    ON "activity_assignments" ("tenant_id","target_class_id");
CREATE INDEX "assignment_tenant_activity_idx" ON "activity_assignments" ("tenant_id","activity_id");
CREATE INDEX "assignment_tenant_school_idx"   ON "activity_assignments" ("tenant_id","target_school_id");
```

### 2.3 `activity_attempts` (DDL-in-doc — NOT executed in Wave 0)

```sql
CREATE TABLE "activity_attempts" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" text NOT NULL,
  "assignment_id" text,                         -- optional origin assignment
  "activity_id" text NOT NULL,
  "exercise_id" text,
  -- curriculum anchor snapshot of the EXECUTION context (references only, 21-O)
  "curriculum_id" text NOT NULL,
  "curriculum_version" text NOT NULL,
  "stage_key" text NOT NULL,
  "grade_level" text NOT NULL,
  "subject" text NOT NULL,
  "attempt_number" integer NOT NULL,
  -- lifecycle state = CORE-23 ATTEMPT_STATES (same values; transitions enforced in code via applyAttemptEvent)
  "state" text NOT NULL DEFAULT 'CREATED',
  "started_at" timestamptz,
  "submitted_at" timestamptz,
  "duration_ms" integer,
  -- operational time segments (CORE-23 TimeEvidence) — state, NOT measurements
  "activity_duration_ms" integer,
  "response_duration_ms" integer,
  "thinking_duration_ms" integer,
  "listening_duration_ms" integer,
  "pause_duration_ms" integer,
  "replay_duration_ms" integer,
  -- POINTER to the canonical Evidence row (set at EVIDENCE_RECORDED) — never a copy
  "evidence_ref" text,
  "operation_key" text NOT NULL,                -- CORE-23 attemptOperationKey
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "attempt_state_check"    CHECK ("state" IN ('CREATED','STARTED','IN_PROGRESS','SUBMITTED','MEASURED','EVIDENCE_RECORDED')),
  CONSTRAINT "attempt_number_check"   CHECK ("attempt_number" >= 1),
  CONSTRAINT "attempt_time_order"     CHECK ("submitted_at" IS NULL OR "started_at" IS NULL OR "submitted_at" >= "started_at")
);

ALTER TABLE "activity_attempts" ADD CONSTRAINT "attempt_id_tenant_uniq"     UNIQUE ("id","tenant_id");
ALTER TABLE "activity_attempts" ADD CONSTRAINT "attempt_op_key_tenant_uniq" UNIQUE ("tenant_id","operation_key");                      -- creation idempotency
ALTER TABLE "activity_attempts" ADD CONSTRAINT "attempt_logical_uniq"       UNIQUE ("tenant_id","student_id","activity_id","attempt_number"); -- concurrency anchor
ALTER TABLE "activity_attempts" ADD CONSTRAINT "attempt_student_fk"         FOREIGN KEY ("tenant_id","student_id")    REFERENCES "students"("tenant_id","id");
ALTER TABLE "activity_attempts" ADD CONSTRAINT "attempt_assignment_fk"      FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "activity_assignments"("tenant_id","id");
ALTER TABLE "activity_attempts" ADD CONSTRAINT "attempt_exercise_fk"        FOREIGN KEY ("tenant_id","exercise_id")   REFERENCES "exercise_definitions"("tenant_id","id");

CREATE INDEX "attempt_tenant_idx"         ON "activity_attempts" ("tenant_id");
CREATE INDEX "attempt_tenant_student_idx" ON "activity_attempts" ("tenant_id","student_id");
CREATE INDEX "attempt_tenant_state_idx"   ON "activity_attempts" ("tenant_id","state");
CREATE INDEX "attempt_assignment_idx"     ON "activity_attempts" ("tenant_id","assignment_id");
CREATE INDEX "attempt_activity_idx"       ON "activity_attempts" ("tenant_id","activity_id");
```

### 2.4 Lifecycle, idempotency, concurrency, recovery, transfer (Wave 2 semantics)

- **Attempt lifecycle:** the DB CHECK stores exactly the CORE-23 `ATTEMPT_STATES` values; transitions remain
  enforced **in code** by the existing `applyAttemptEvent` (no second state machine). Persistence uses
  compare-and-set (`UPDATE … WHERE state = <expected>` returning rows) — two racing transitions cannot both win.
- **Assignment lifecycle:** `ACTIVE → CANCELLED | CLOSED` (terminal, one-way). Cancelling does not delete rows.
- **Idempotency:** creation keyed by `operation_key` (assignments: caller-supplied; attempts: CORE-23
  `attemptOperationKey`); retry/concurrent duplicates hit the unique indexes and return the existing row.
  Evidence dedup stays on the canonical writer `(tenant_id, operation_key)` — proven in CORE-23 tests 11/12.
- **Recovery:** persisted `state` + timestamps enable `start/resume/status` (Wave 3 `/v1/attempts/*`) and worker
  retry without duplicate Evidence/Outcome/Decision.
- **Tenant/student/school isolation:** composite tenant FKs (CORE-18/19 pattern) — a cross-tenant write is
  rejected by the DB, not by application code alone.
- **Transfer safety (ADR-002 continuity):** assignment/attempt rows are **never rewritten** on student transfer;
  they keep their original tenant/student references; a new-school assignment is a NEW row. Evidence immutability
  across A→B→A is already proven (CORE-23 test 17) and must remain green in Wave 2.
- **Audit:** existing `audit_logs` — `assignment.created|cancelled|closed`, `attempt.started|submitted|state_changed`;
  reason codes only (no PII, no religion, no content body).

## 3. Alternatives considered

1. **Continue in-memory only** — rejected: product requires durable state (CORE-24 report §8/§17).
2. **Store results/responses on the attempt row** — rejected: violates Evidence-canonicality; would create a
   second source of truth.
3. **Reuse reading-owned `attempts` table** — rejected: wrong owner (reading-engine owns reading attempts);
   generic attempt state is core-platform; mixing would transfer ownership implicitly.

## 4. Consequences / impact

- Additive migration only; zero changes to CORE-17→23 tables, contracts, or behavior.
- CORE-21/22/23 test gates pin migration tags `0000..0003`; Wave 2 extends them to include `0005`
  **with this ACR as the documented justification**.
- `OWNERSHIP` map gains `activity-assignment-state` / `activity-attempt-state` (ADR-004), additive only.

## 5. Rollback

Forward-only (R-008). 0005 purely additive; reverse = `DROP TABLE activity_attempts, activity_assignments`,
never automatic; no destructive statements against `0000..0004` objects.

## 6. Verification plan (Wave 2, real PostgreSQL)

fresh DB → migrate 0000..0005 → **drift = 0** → constraint tests (state/source/status CHECKs, has_anchor,
cross-tenant FK rejection, logical-uniqueness) → lifecycle tests (full walk + invalid transitions + CAS race) →
idempotency (same operation_key → same row) → concurrency (parallel duplicate submissions → single attempt row +
single Evidence) → transfer safety (A→B→A, rows unrewritten) → regression 17→23 → TSC = 0 → git clean.
