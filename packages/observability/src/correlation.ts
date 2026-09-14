/**
 * @workspace/observability — correlation.ts
 * Canonical request/correlation context provider using AsyncLocalStorage.
 * Enables the trace chain: Request -> API -> Engine -> Queue -> Worker -> Inference -> DB.
 */
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

export interface CorrelationContext {
  requestId: string;
  correlationId: string;
  tenantId?: string;
  schoolId?: string;
  organizationId?: string;
  traceId?: string;
  eventId?: string;
  jobId?: string;
}

const store = new AsyncLocalStorage<CorrelationContext>();

export function newRequestId(): string {
  return randomUUID();
}

export function newCorrelationId(): string {
  return randomUUID();
}

export function startContext(partial: Partial<CorrelationContext> = {}): CorrelationContext {
  return {
    requestId: partial.requestId ?? newRequestId(),
    correlationId: partial.correlationId ?? newCorrelationId(),
    tenantId: partial.tenantId,
    schoolId: partial.schoolId,
    organizationId: partial.organizationId,
    traceId: partial.traceId,
    eventId: partial.eventId,
    jobId: partial.jobId,
  };
}

export function runWithContext<T>(ctx: CorrelationContext, fn: () => T): T {
  return store.run(ctx, fn);
}

export function getContext(): CorrelationContext | undefined {
  return store.getStore();
}
