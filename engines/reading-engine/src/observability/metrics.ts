/**
 * TEMPORARY COMPATIBILITY LAYER — canonical owner: packages/observability.
 * Mirrors the legacy metric names consumed by pipeline modules (vad, g2p,
 * alignment, …). Removal target: P5, when consumers switch to the canonical
 * metrics from @workspace/observability (buytuk_queue_jobs_total, …).
 */
import { Counter, Gauge, Histogram, Registry } from "prom-client";

export const registry = new Registry();

export const metrics = {
  queueLength: new Gauge({
    name: "buytuk_queue_length",
    help: "Current number of jobs in each queue",
    labelNames: ["queue"] as const,
    registers: [registry],
  }),
  jobsProcessed: new Counter({
    name: "buytuk_jobs_processed_total",
    help: "Total jobs processed per queue and status",
    labelNames: ["queue", "status"] as const,
    registers: [registry],
  }),
  pipelineDuration: new Histogram({
    name: "buytuk_pipeline_duration_seconds",
    help: "Pipeline stage duration in seconds",
    labelNames: ["stage"] as const,
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    registers: [registry],
  }),
  modelLatency: new Histogram({
    name: "buytuk_model_latency_seconds",
    help: "ML model inference latency in seconds",
    labelNames: ["model", "version"] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [registry],
  }),
  pipelineErrors: new Counter({
    name: "buytuk_pipeline_errors_total",
    help: "Pipeline errors by stage and error code",
    labelNames: ["stage", "code"] as const,
    registers: [registry],
  }),
};

export async function getMetrics(): Promise<string> {
  return registry.metrics();
}
