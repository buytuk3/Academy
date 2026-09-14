/**
 * CORE-07 — Learning Loop schema (Core Platform).
 *
 * Four tables store ONLY loop state + REFERENCES to canonical Evidence — never a
 * copy of evidence, never an overall student score, never a student.level column.
 *   learning_diagnoses        → detection output, evidence-linked
 *   intervention_proposals    → proposal + Teacher Decision boundary (PENDING /
 *                               APPROVED / MODIFIED / REJECTED) + who/when/what
 *   learning_reassessments    → baseline evidence ref → reassessment evidence ref
 *   learning_outcomes         → IMPROVED / NO_CHANGE / DECLINED / INSUFFICIENT_EVIDENCE
 * Every table carries (tenant_id, operation_key) UNIQUE for database-backed
 * idempotency (same principles as CORE-05/06 — no in-memory dedupe).
 */
import { pgTable, text, timestamp, real, jsonb, integer, index, unique } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./schools";
import { evidenceTable } from "./evidence";

export const diagnosisStatusEnum = ["candidate", "active", "closed"] as const;
export const interventionStatusEnum = ["PENDING", "APPROVED", "MODIFIED", "REJECTED", "DELIVERED", "COMPLETED"] as const;
export const outcomeResultEnum = ["IMPROVED", "NO_CHANGE", "DECLINED", "INSUFFICIENT_EVIDENCE"] as const;
export const adaptActionEnum = [
  "continue-progression",
  "repeat",
  "simplify",
  "increase-support",
  "change-activity",
  "increase-practice",
  "escalate-to-teacher",
  "gather-more-evidence",
] as const;

export const learningDiagnosesTable = pgTable(
  "learning_diagnoses",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull().references(() => studentsTable.id, { onDelete: "restrict" }),
    skill: text("skill").notNull(),
    objectiveId: text("objective_id"),
    signalKey: text("signal_key").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    evidenceRefs: jsonb("evidence_refs").notNull(), // evidence id references — no copied rows
    confidence: real("confidence").notNull(),
    reason: text("reason").notNull(),
    status: text("status", { enum: [...diagnosisStatusEnum] }).notNull().default("candidate"),
    source: text("source").notNull(),
    previousDiagnosisId: text("previous_diagnosis_id"), // FK enforced in migration 006 (self-ref kept out of drizzle to avoid TS7022)
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("learning_diagnoses_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("learning_diagnoses_student_idx").on(t.tenantId, t.studentId),
  }),
);

export const interventionProposalsTable = pgTable(
  "intervention_proposals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull().references(() => studentsTable.id, { onDelete: "restrict" }),
    diagnosisId: text("diagnosis_id").notNull().references(() => learningDiagnosesTable.id, { onDelete: "restrict" }),
    skill: text("skill").notNull(),
    activityType: text("activity_type").notNull(),
    config: jsonb("config"), // activity configuration — never the diagnosis itself
    suggestedBy: text("suggested_by").notNull().default("learning-loop"),
    status: text("status", { enum: [...interventionStatusEnum] }).notNull().default("PENDING"),
    originalProposal: jsonb("original_proposal"), // what was proposed before any teacher change
    decision: jsonb("decision"), // { action, actorId, actorRole, decidedAt, modifications?, rejectionReason? }
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    deliveryAuthorization: jsonb("delivery_authorization"), // CORE-08: bound Delivery Authorization issued on approval/modification
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("intervention_proposals_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("intervention_proposals_student_idx").on(t.tenantId, t.studentId),
  }),
);

export const learningReassessmentsTable = pgTable(
  "learning_reassessments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull().references(() => studentsTable.id, { onDelete: "restrict" }),
    diagnosisId: text("diagnosis_id").notNull().references(() => learningDiagnosesTable.id, { onDelete: "restrict" }),
    interventionId: text("intervention_id").notNull().references(() => interventionProposalsTable.id, { onDelete: "restrict" }),
    skill: text("skill").notNull(),
    activityUsed: text("activity_used"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    baselineEvidenceRef: text("baseline_evidence_ref").references(() => evidenceTable.id, { onDelete: "set null" }),
    reassessmentEvidenceRef: text("reassessment_evidence_ref").references(() => evidenceTable.id, { onDelete: "set null" }),
    indicators: jsonb("indicators"), // filled at Compare stage (metric deltas — not evidence copies)
    trend: text("trend"),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("learning_reassessments_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("learning_reassessments_student_idx").on(t.tenantId, t.studentId),
  }),
);

export const learningOutcomesTable = pgTable(
  "learning_outcomes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull().references(() => studentsTable.id, { onDelete: "restrict" }),
    diagnosisId: text("diagnosis_id").notNull().references(() => learningDiagnosesTable.id, { onDelete: "restrict" }),
    interventionId: text("intervention_id").notNull().references(() => interventionProposalsTable.id, { onDelete: "restrict" }),
    reassessmentId: text("reassessment_id").notNull().references(() => learningReassessmentsTable.id, { onDelete: "restrict" }),
    result: text("result", { enum: [...outcomeResultEnum] }).notNull(),
    evidenceRefs: jsonb("evidence_refs").notNull(), // [baselineEvidenceRef, reassessmentEvidenceRef]
    comparison: jsonb("comparison"), // multidimensional deltas — NO overall score
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    confidence: real("confidence").notNull(),
    source: text("source").notNull(),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("learning_outcomes_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("learning_outcomes_student_idx").on(t.tenantId, t.studentId),
  }),
);

export type LearningDiagnosis = typeof learningDiagnosesTable.$inferSelect;
export type InterventionProposal = typeof interventionProposalsTable.$inferSelect;
export type LearningReassessment = typeof learningReassessmentsTable.$inferSelect;
export type LearningOutcome = typeof learningOutcomesTable.$inferSelect;
