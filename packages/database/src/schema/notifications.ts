import { index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * PHASE-24 — NOTIFICATIONS (§5.2.4: notification center + per-role
 * customization). Migration: 0019_phase24_notifications.sql (the DDL source
 * of truth — FKs + CHECKs live there). RLS: enabled+forced per the 0007
 * mechanism (fail-closed, tenant-scoped). Config style mirrors
 * engagement-extras.ts / video.ts. Additive-only per ADR-045 — the balance
 * of transport integrations (WebSocket/email/FCM) is deferred (DEV-024,
 * ZERO new dependencies).
 */

/** §5.2.4 — one notification per (tenant, operation_key); recipient-scoped reads. */
export const notificationsTable = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    recipientRole: text("recipient_role").notNull(),
    type: text("type").notNull().default("GENERAL"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    ref: jsonb("ref").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    readOperationKey: text("read_operation_key"),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("notifications_op_uniq").on(t.tenantId, t.operationKey),
    recipientIdx: index("notifications_recipient_idx").on(t.tenantId, t.recipientId, t.createdAt),
  }),
);

/** §5.2.4 تخصيص الإشعارات حسب الدور — per-user channel preferences (upsert-idempotent). */
export const notificationPrefsTable = pgTable(
  "notification_prefs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id").notNull(),
    prefs: jsonb("prefs").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userUniq: unique("notification_prefs_user_uniq").on(t.tenantId, t.userId),
  }),
);
