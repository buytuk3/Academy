/**
 * @workspace/observability — trace.ts
 * Minimal manual span/trace helpers. OTel-ready boundary: when OpenTelemetry
 * is adopted, these functions delegate to the OTel SDK without changing engines.
 */
import { randomUUID } from "node:crypto";

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startedAt: number;
}

export function startSpan(name: string, parent?: TraceSpan): TraceSpan {
  return {
    traceId: parent?.traceId ?? randomUUID(),
    spanId: randomUUID(),
    parentSpanId: parent?.spanId,
    name,
    startedAt: Date.now(),
  };
}

export function endSpan(span: TraceSpan): { traceId: string; spanId: string; durationMs: number } {
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    durationMs: Date.now() - span.startedAt,
  };
}
