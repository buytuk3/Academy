/**
 * CORE-24 / Wave 2 (ACR-24/002, ADR-004) — Persistent Activity Assignment &
 * Attempt State (owner: core-platform).
 *
 * SEPARATION INVARIANT (unbreakable, owner decision):
 *   Content ≠ Exercise ≠ Activity ≠ Assignment ≠ Attempt ≠ Evidence ≠ Assessment
 *
 * These tables store OPERATIONAL/ADMINISTRATIVE STATE ONLY:
 *   - Evidence stays the single canonical learning fact (recordEvidence,
 *     dedup on (tenant_id, operation_key)). The attempt row links to its
 *     canonical fact via `evidence_ref` — a plain POINTER (no copy, no
 *     second store); NO measurement values, NO scores, NO response payloads
 *     are stored here. Time columns are operational timings/state (CORE-23
 *     TimeEvidence segments), never measured performance.
 *   - Activities have NO table by design (CORE-21): activity_id + version are
 *     REFERENCES. Exercise link is version-pinned into the ACR-24/001 library.
 *   - Lifecycle: assignments ACTIVE → CANCELLED | CLOSED (one-way, terminal);
 *     attempts carry EXACTLY the CORE-23 ATTEMPT_STATES values — transitions
 *     remain enforced IN CODE via applyAttemptEvent (no second state machine),
 *     persisted with compare-and-set (UPDATE … WHERE state = expected).
 *   - Idempotency: (tenant_id, operation_key) unique — the EXISTING platform
 *     pattern; plus a logical uniqueness (tenant, student, activity,
 *     attempt_number) so parallel duplicate submissions converge on ONE row.
 *   - Tenant isolation at DB level: composite tenant-safe FKs (CORE-18/19
 *     pattern) — cross-tenant references are impossible by constraint.
 *   - Transfer safety (ADR-002): rows are NEVER rewritten on student
 *     transfer; a new-school assignment is a NEW row.
 */
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.js";
import { usersTable } from "./users.js";
import { classesTable, schoolsTable, studentsTable } from "./schools.js";
import { exerciseDefinitionsTable } from "./content-library.js";

// ===== activity_assignments (ACR-24/002 §2.2) =====

export const activityAssignmentsTable = pgTable(
  "activity_assignments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    // WHAT — references + version binding (no activity copy: activities have no table, CORE-21)
    activityId: text("activity_id").notNull(),
    activityVersion: integer("activity_version").notNull(),
    exerciseId: text("exercise_id"), // OPTIONAL library binding (ACR-24/001 table)
    exerciseVersion: integer("exercise_version"),
    // curriculum anchor — MANDATORY immutable version (21-O)
    curriculumId: text("curriculum_id").notNull(),
    curriculumVersion: text("curriculum_version").notNull(),
    stageKey: text("stage_key").notNull(),
    gradeLevel: text("grade_level").notNull(),
    subject: text("subject").notNull(),
    // TARGET — CORE-21 assignedTo (Student | Class | Grade | Stage | School); school = isolation anchor
    targetStudentId: text("target_student_id"),
    targetClassId: text("target_class_id"),
    targetGradeLevel: text("target_grade_level"),
    targetStageKey: text("target_stage_key"),
    targetSchoolId: text("target_school_id").notNull(),
    // WHO ASSIGNED
    assignedBy: text("assigned_by").notNull(),
    assignedByRole: text("assigned_by_role").notNull(),
    // closed contract vocabulary (CORE-21 ASSIGNMENT_SOURCES — CHECK)
    source: text("source").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Tenant-safe FK target (attempts pin their assignment per tenant).
    idTenantUniq: unique("assignment_id_tenant_uniq").on(t.id, t.tenantId),
    // Idempotency (existing platform pattern).
    opUniq: unique("assignment_op_key_tenant_uniq").on(t.tenantId, t.operationKey),
    // Composite tenant-safe FKs — cross-tenant references impossible (19-J pattern).
    assignedByTenantFk: foreignKey({
      name: "assignment_assigned_by_tenant_fk",
      columns: [t.assignedBy, t.tenantId],
      foreignColumns: [usersTable.id, usersTable.tenantId],
    }),
    studentTenantFk: foreignKey({
      name: "assignment_target_student_tenant_fk",
      columns: [t.targetStudentId, t.tenantId],
      foreignColumns: [studentsTable.id, studentsTable.tenantId],
    }),
    classTenantFk: foreignKey({
      name: "assignment_target_class_tenant_fk",
      columns: [t.targetClassId, t.tenantId],
      foreignColumns: [classesTable.id, classesTable.tenantId],
    }),
    schoolTenantFk: foreignKey({
      name: "assignment_target_school_tenant_fk",
      columns: [t.targetSchoolId, t.tenantId],
      foreignColumns: [schoolsTable.id, schoolsTable.tenantId],
    }),
    exerciseTenantFk: foreignKey({
      name: "assignment_exercise_tenant_fk",
      columns: [t.exerciseId, t.tenantId],
      foreignColumns: [exerciseDefinitionsTable.id, exerciseDefinitionsTable.tenantId],
    }),
    statusCheck: check(
      "assignment_status_check",
      sql`status in ('ACTIVE', 'CANCELLED', 'CLOSED')`,
    ),
    sourceCheck: check(
      "assignment_source_check",
      sql`source in ('teacherAssigned', 'recommended', 'curriculumRequired', 'reassessment', 'reinforcement')`,
    ),
    // at least ONE assignment anchor (student/class/grade/stage)
    hasAnchor: check(
      "assignment_has_anchor",
      sql`target_student_id is not null or target_class_id is not null or target_grade_level is not null or target_stage_key is not null`,
    ),
    tenantIdx: index("assignment_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("assignment_tenant_status_idx").on(t.tenantId, t.status),
    tenantStudentIdx: index("assignment_tenant_student_idx").on(t.tenantId, t.targetStudentId),
    tenantClassIdx: index("assignment_tenant_class_idx").on(t.tenantId, t.targetClassId),
    tenantActivityIdx: index("assignment_tenant_activity_idx").on(t.tenantId, t.activityId),
    tenantSchoolIdx: index("assignment_tenant_school_idx").on(t.tenantId, t.targetSchoolId),
  }),
);

export type ActivityAssignmentRow = typeof activityAssignmentsTable.$inferSelect;

// ===== activity_attempts (ACR-24/002 §2.3) =====

export const activityAttemptsTable = pgTable(
  "activity_attempts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull(),
    assignmentId: text("assignment_id"), // optional origin assignment
    activityId: text("activity_id").notNull(),
    exerciseId: text("exercise_id"),
    // curriculum anchor snapshot of the EXECUTION context (references only, 21-O)
    curriculumId: text("curriculum_id").notNull(),
    curriculumVersion: text("curriculum_version").notNull(),
    stageKey: text("stage_key").notNull(),
    gradeLevel: text("grade_level").notNull(),
    subject: text("subject").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    // EXACTLY the CORE-23 ATTEMPT_STATES values (transitions enforced in code)
    state: text("state").notNull().default("CREATED"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    // operational time segments (CORE-23 TimeEvidence) — state, NOT measurements
    activityDurationMs: integer("activity_duration_ms"),
    responseDurationMs: integer("response_duration_ms"),
    thinkingDurationMs: integer("thinking_duration_ms"),
    listeningDurationMs: integer("listening_duration_ms"),
    pauseDurationMs: integer("pause_duration_ms"),
    replayDurationMs: integer("replay_duration_ms"),
    // POINTER to the canonical Evidence row (set at EVIDENCE_RECORDED) — never a copy
    evidenceRef: text("evidence_ref"),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idTenantUniq: unique("attempt_id_tenant_uniq").on(t.id, t.tenantId),
    opUniq: unique("attempt_op_key_tenant_uniq").on(t.tenantId, t.operationKey),
    // CONCURRENCY ANCHOR: parallel duplicate submissions (even with different
    // operation keys) converge on ONE logical attempt row.
    logicalUniq: unique("attempt_logical_uniq").on(t.tenantId, t.studentId, t.activityId, t.attemptNumber),
    studentTenantFk: foreignKey({
      name: "attempt_student_tenant_fk",
      columns: [t.studentId, t.tenantId],
      foreignColumns: [studentsTable.id, studentsTable.tenantId],
    }),
    assignmentTenantFk: foreignKey({
      name: "attempt_assignment_tenant_fk",
      columns: [t.assignmentId, t.tenantId],
      foreignColumns: [activityAssignmentsTable.id, activityAssignmentsTable.tenantId],
    }),
    exerciseTenantFk: foreignKey({
      name: "attempt_exercise_tenant_fk",
      columns: [t.exerciseId, t.tenantId],
      foreignColumns: [exerciseDefinitionsTable.id, exerciseDefinitionsTable.tenantId],
    }),
    stateCheck: check(
      "attempt_state_check",
      sql`state in ('CREATED', 'STARTED', 'IN_PROGRESS', 'SUBMITTED', 'MEASURED', 'EVIDENCE_RECORDED')`,
    ),
    numberCheck: check(
      "attempt_number_check",
      sql`attempt_number >= 1`,
    ),
    timeOrder: check(
      "attempt_time_order",
      sql`submitted_at is null or started_at is null or submitted_at >= started_at`,
    ),
    tenantIdx: index("attempt_tenant_idx").on(t.tenantId),
    tenantStudentIdx: index("attempt_tenant_student_idx").on(t.tenantId, t.studentId),
    tenantStateIdx: index("attempt_tenant_state_idx").on(t.tenantId, t.state),
    assignmentIdx: index("attempt_assignment_idx").on(t.tenantId, t.assignmentId),
    activityIdx: index("attempt_activity_idx").on(t.tenantId, t.activityId),
  }),
);

export type ActivityAttemptRow = typeof activityAttemptsTable.$inferSelect;
