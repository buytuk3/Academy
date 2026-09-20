import { index, integer, json, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * PHASE-20 — GRAMMAR-PARSING-ENGINE / الإعراب (governing doc v2.1 §3.7).
 * Migration: 0015_phase20_grammar_parsing_engine.sql (the DDL source of
 * truth — FKs + CHECKs live there). RLS: enabled+forced per the 0007
 * mechanism (fail-closed, tenant-scoped). Config style mirrors
 * provisional-advance.ts / escalation.ts. Additive-only per ADR-041.
 */

/** One REAL i'rab parse per (tenant, operation_key); student_id optional (staff may parse too). */
export const grammarParsingsTable = pgTable(
  "grammar_parsings",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id"),
    inputText: text("input_text").notNull(),
    tokens: json("tokens").$type<Record<string, unknown>[]>().notNull().default([]),
    tokenCount: integer("token_count").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    engineVersion: text("engine_version").notNull(),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("grammar_parsings_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("grammar_parsings_student_idx").on(t.tenantId, t.studentId, t.createdAt),
  }),
);
