/**
 * CORE-06 — In-process typed event dispatcher + durable outbox.
 * publishEvent APPENDS the event envelope to the outbox (same DB). Processing
 * happens in outbox.ts; consumers are typed per event type. Correlation
 * context (requestId/correlationId/traceId/jobId) is persisted on the row.
 */
import { randomUUID } from "node:crypto";
import { db, eventOutboxTable } from "@workspace/db";
import type { LearningEvent, LearningEventType } from "@buytuk/contracts";
import { createLogger, getContext, getMetrics, safeLog, ClassifiedError } from "@workspace/observability";
import { EVENT_TO_EVIDENCE_TYPE } from "./evidence-consumer.js";

const log = createLogger({ name: "events" });

export type EventConsumer = (ev: LearningEvent) => Promise<unknown>;

const consumers = new Map<LearningEventType, EventConsumer>();

export function registerConsumer(type: LearningEventType, fn: EventConsumer): void {
  consumers.set(type, fn);
}

export function consumerFor(type: LearningEventType): EventConsumer | undefined {
  return consumers.get(type);
}

export interface PublishOptions {
  traceId?: string;
  requestId?: string;
  correlationId?: string;
  jobId?: string;
}

export async function publishEvent(ev: LearningEvent, opts: PublishOptions = {}): Promise<LearningEvent> {
  // Mandatory event context (tenant isolation + actor + occurredAt).
  if (!ev.tenantId) throw new ClassifiedError("validation", "EVENT_TENANT_CONTEXT_MISSING");
  if (!ev.studentId) throw new ClassifiedError("validation", "EVENT_STUDENT_CONTEXT_MISSING");
  if (!ev.actor?.id || !ev.actor?.role) throw new ClassifiedError("validation", "EVENT_ACTOR_REQUIRED");
  if (!ev.occurredAt || Number.isNaN(new Date(ev.occurredAt).getTime())) throw new ClassifiedError("validation", "EVENT_INVALID_OCCURRED_AT");
  if (!ev.id) throw new ClassifiedError("validation", "EVENT_ID_REQUIRED");
  if (!(ev.type in EVENT_TO_EVIDENCE_TYPE)) throw new ClassifiedError("validation", "INVALID_EVENT_TYPE");

  const ctx = getContext();
  const traceId = opts.traceId ?? ctx?.traceId ?? randomUUID();
  const row = {
    id: ev.id,
    tenantId: ev.tenantId,
    type: ev.type,
    envelope: ev as unknown as Record<string, unknown>,
    status: "pending" as const,
    attempts: 0,
    traceId,
    requestId: opts.requestId ?? ctx?.requestId ?? null,
    correlationId: opts.correlationId ?? ctx?.correlationId ?? null,
    jobId: opts.jobId ?? null,
  };
  await db.insert(eventOutboxTable).values(row).returning({ id: eventOutboxTable.id });
  getMetrics().eventsProduced.inc({ eventType: ev.type });
  log.info(
    safeLog({ eventId: ev.id, eventType: ev.type, tenantId: ev.tenantId, studentId: ev.studentId, traceId, requestId: row.requestId, jobId: row.jobId }),
    "Event produced",
  );
  return ev;
}
