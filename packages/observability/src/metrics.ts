/**
 * @workspace/observability — metrics.ts
 * Canonical Prometheus metrics owner (registry + standard counters).
 */
import { Counter, Gauge, Histogram, Registry } from "prom-client";

export interface AppMetrics {
  registry: Registry;
  httpRequests: Counter;
  inferenceLatency: Histogram;
  queueJobs: Counter;
  errors: Counter;
  inferenceInFlight: Gauge;
  eventsProduced: Counter;
  eventsConsumed: Counter;
  eventsFailed: Counter;
  eventsRetried: Counter;
  eventProcessingDuration: Histogram;
  securityEvents: Counter;
}

export function createMetrics(registry: Registry = new Registry()): AppMetrics {
  const metrics: AppMetrics = {
    registry,
    httpRequests: new Counter({
      name: "buytuk_http_requests_total",
      help: "Total HTTP requests handled",
      labelNames: ["route", "status"],
      registers: [registry],
    }),
    inferenceLatency: new Histogram({
      name: "buytuk_inference_latency_seconds",
      help: "Inference gateway latency",
      labelNames: ["model"],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [registry],
    }),
    queueJobs: new Counter({
      name: "buytuk_queue_jobs_total",
      help: "Queue jobs processed",
      labelNames: ["queue", "state"],
      registers: [registry],
    }),
    errors: new Counter({
      name: "buytuk_errors_total",
      help: "Total errors",
      labelNames: ["component"],
      registers: [registry],
    }),
    inferenceInFlight: new Gauge({
      name: "buytuk_inference_in_flight",
      help: "Inference requests currently in flight",
      registers: [registry],
    }),
    eventsProduced: new Counter({
      name: "buytuk_events_produced_total",
      help: "Learning events produced",
      labelNames: ["eventType"],
      registers: [registry],
    }),
    eventsConsumed: new Counter({
      name: "buytuk_events_consumed_total",
      help: "Learning events consumed",
      labelNames: ["eventType", "consumer"],
      registers: [registry],
    }),
    eventsFailed: new Counter({
      name: "buytuk_events_failed_total",
      help: "Learning event processing failures",
      labelNames: ["eventType", "errorClass"],
      registers: [registry],
    }),
    eventsRetried: new Counter({
      name: "buytuk_events_retried_total",
      help: "Learning event retries",
      labelNames: ["eventType"],
      registers: [registry],
    }),
    eventProcessingDuration: new Histogram({
      name: "buytuk_event_processing_duration_seconds",
      help: "Event consumer processing duration",
      labelNames: ["eventType"],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [registry],
    }),
    securityEvents: new Counter({
      name: "buytuk_security_events_total",
      help: "Security-relevant events",
      labelNames: ["type"],
      registers: [registry],
    }),
  };
  return metrics;
}

let singleton: AppMetrics | undefined;

/** Process-wide default metrics registry (single owner). */
export function getMetrics(): AppMetrics {
  return (singleton ??= createMetrics());
}
