import { index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * PHASE-22 — VIDEO-LESSON-CONTENT (governing doc v2.1 §3.8).
 * Migration: 0017_phase22_video_lesson_content.sql (the DDL source of truth
 * — FKs + CHECKs live there). RLS: enabled+forced per the 0007 mechanism
 * (fail-closed, tenant-scoped). Config style mirrors escalation.ts /
 * exam-analytics.ts. Additive-only per ADR-043. storage_key is a LOOSE
 * pointer (the attempts.audio_key convention — PHASE-11); the bytes live in
 * the deployment object store.
 */
export const videoLessonsTable = pgTable(
  "video_lessons",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    lessonContentId: text("lesson_content_id"),
    title: text("title").notNull(),
    storageKey: text("storage_key").notNull(),
    durationSec: integer("duration_sec").notNull().default(0),
    status: text("status").notNull().default("PROCESSING"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: text("published_by"),
    publishOperationKey: text("publish_operation_key"),
    operationKey: text("operation_key").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("video_lessons_op_uniq").on(t.tenantId, t.operationKey),
    statusIdx: index("video_lessons_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);
