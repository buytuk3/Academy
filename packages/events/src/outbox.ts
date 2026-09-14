/**
 * CORE-06 — Outbox processor (in-process consumer runner).
 * Flow: Event → Processing → Failure → Retry (observable, no loss).
 *  - pending rows processed in creation order (occurredAt/createdAt asc);
 *  - tenant isolation re-verified at consumption (envelope.tenantId === row.tenantId);
 *  - failures are classified (ErrorClass), persisted on the row (attempts,
 *    last_error, error_class, next_attempt_at) and retryable — nothing is lost;
 *  - a processed row is never reprocessed (status marker) and the evidence write
 *    is idempotent via operationKey — retry cannot duplicate evidence.
 */
import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, eventOutboxTable, type EventOutboxRow } from "@workspace/db";
import type { LearningEvent } from "@buytuk/contracts";
import {
  createLogger, getMetrics, runWithContext, startContext, safeLog,
  classifyError, recordSecurityEvent,
} from "@workspace/observability";
import { consumerFor } from "./dispatcher.js";
import { evidenceConsumerFor } from "./evidence-consumer.js";

const log = createLogger({ name: "events" });

export interface OutboxProcessResult {
  processed: number;
  failed: number;
}

function backoffMs(attempts: number): number {
  return attempts <= 1 ? 5_000 : attempts <= 2 ? 30_000 : 300_000;
}

export async function processEventOutbox(opts: { limit?: number } = {}): Promise<OutboxProcessResult> {
  const rows = await db
    .select()
    .from(eventOutboxTable)
    .where(eq(eventOutboxTable.status, "pending"))
    .orderBy(asc(eventOutboxTable.createdAt))
    .limit(opts.limit ?? 10);

  let processed = 0;
  let failed = 0;
  const metrics = getMetrics();

  for (const row of rows) {
    const ev = row.envelope as LearningEvent;

    // Tenant isolation: the consumer must never process an event of a
    // different tenant than the one recorded on the outbox row.
    if (ev.tenantId !== row.tenantId) {
      recordSecurityEvent(log, metrics, "cross-tenant-attempt", { tenantId: row.tenantId, studentId: ev.studentId });
      await markFailed(row, "TENANT_MISMATCH", "security");
      failed += 1;
      continue;
    }

    await db.update(eventOutboxTable).set({ status: "processing" }).where(eq(eventOutboxTable.id, row.id));

    const consumer = consumerFor(ev.type) ?? evidenceConsumerFor(ev.type);
    if (!consumer) {
      await markProcessed(row, null);
      processed += 1;
      continue;
    }

    const started = Date.now();
    try {
      const result = await runWithContext(
        startContext({
          requestId: row.requestId ?? undefined,
          correlationId: row.correlationId ?? undefined,
          tenantId: row.tenantId,
          traceId: row.traceId ?? randomUUID(),
          eventId: row.id,
        }),
        () => consumer(ev),
      );
      const evidenceId = (result as { id?: string } | undefined)?.id ?? null;
      await markProcessed(row, evidenceId);
      metrics.eventsConsumed.inc({ eventType: ev.type, consumer: consumer.name ?? "anonymous" });
      metrics.eventProcessingDuration.observe({ eventType: ev.type }, (Date.now() - started) / 1000);
      log.info(safeLog({ eventId: row.id, eventType: ev.type, tenantId: row.tenantId, traceId: row.traceId, evidenceId, jobId: row.jobId }), "Event consumed");
      processed += 1;
    } catch (err) {
      const errorClass = classifyError(err);
      const attempts = row.attempts + 1;
      await markFailed(row, err instanceof Error ? err.message : String(err), errorClass, attempts);
      metrics.eventsFailed.inc({ eventType: ev.type, errorClass });
      if (attempts >= 2) metrics.eventsRetried.inc({ eventType: ev.type });
      if (errorClass === "security") {
        recordSecurityEvent(log, metrics, "suspicious-access", { tenantId: row.tenantId, studentId: ev.studentId, detail: { eventId: row.id } });
      }
      log.error(safeLog({ eventId: row.id, eventType: ev.type, tenantId: row.tenantId, traceId: row.traceId, errorClass, error: err instanceof Error ? err.message : String(err) }), "Event processing failed");
      failed += 1;
    }
  }
  return { processed, failed };
}

async function markProcessed(row: EventOutboxRow, evidenceId: string | null): Promise<void> {
  await db.update(eventOutboxTable)
    .set({ status: "processed", processedAt: new Date(), evidenceId })
    .where(eq(eventOutboxTable.id, row.id));
}

async function markFailed(row: EventOutboxRow, error: string, errorClass: string, attempts?: number): Promise<void> {
  await db.update(eventOutboxTable)
    .set({
      status: "failed",
      attempts: attempts ?? row.attempts + 1,
      lastError: error,
      errorClass,
      nextAttemptAt: new Date(Date.now() + backoffMs((attempts ?? row.attempts + 1))),
    })
    .where(eq(eventOutboxTable.id, row.id));
}

/** Retry path: move a failed row back to pending (used by tests/operators). */
export async function retryFailedEvent(id: string): Promise<void> {
  await db.update(eventOutboxTable).set({ status: "pending", lastError: null, errorClass: null, nextAttemptAt: null }).where(eq(eventOutboxTable.id, id));
}

export type { CorrelationContext } from "@workspace/observability";
