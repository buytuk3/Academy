/**
 * CORE-06 — Durable event outbox (same database as evidence — NO second store).
 * Outbox ≠ Evidence: the outbox holds pending EVENT ENVELOPES for internal
 * event-driven consumers; canonical evidence is written ONLY by recordEvidence.
 */
import { pgTable, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const eventStatusEnum = ["pending", "processing", "processed", "failed"] as const;

export const eventOutboxTable = pgTable(
  "event_outbox",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    envelope: jsonb("envelope").notNull(),
    status: text("status", { enum: [...eventStatusEnum] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    errorClass: text("error_class"),
    // correlation chain: Request ID → Trace ID → Event ID → Job ID
    traceId: text("trace_id"),
    requestId: text("request_id"),
    correlationId: text("correlation_id"),
    jobId: text("job_id"),
    evidenceId: text("evidence_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("event_outbox_status_idx").on(t.status, t.createdAt),
    tenantIdx: index("event_outbox_tenant_idx").on(t.tenantId),
  }),
);

export type EventOutboxRow = typeof eventOutboxTable.$inferSelect;
