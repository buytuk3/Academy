/**
 * @workspace/queue — canonical queue owner.
 * Exports the shared Redis client, queues (analyze, realtime, DLQ),
 * factories, event/DLQ wiring and idempotency helpers.
 * Dependency direction: queue -> config, queue -> observability, queue -> contracts.
 * NO reverse edges (config/observability never import queue).
 */
import { Queue } from "bullmq";
import { config } from "@workspace/config";
import { createLogger, getMetrics } from "@workspace/observability";
import { redis, queuePrefix } from "./client.js";
import { createQueueEvents } from "./factories.js";
import { makeJobId } from "./idempotency.js";
import type { AnalyzeJob } from "./jobs.js";

export { redis, queuePrefix } from "./client.js";
export { createQueue, createWorker, createQueueEvents, makeQueueOptions } from "./factories.js";
export { makeJobId, isDuplicateJob } from "./idempotency.js";
export type { AnalyzeJob, JobName, FailedJobData } from "./jobs.js";

const log = createLogger({ level: config.observability.logLevel, name: "queue" });

const baseJobOptions = {
  attempts: config.queue.attempts,
  backoff: { type: config.queue.backoffType, delay: config.queue.backoffDelay },
  removeOnComplete: { count: config.queue.removeOnCompleteCount, age: config.queue.removeOnCompleteAge },
  removeOnFail: { count: config.queue.removeOnFailCount, age: config.queue.removeOnFailAge },
} as const;

export const analyzeQueue = new Queue("analyze", { connection: redis, prefix: queuePrefix, defaultJobOptions: baseJobOptions });
export const dlq = new Queue("analyze-dlq", {
  connection: redis,
  defaultJobOptions: { removeOnComplete: { count: 100 }, removeOnFail: { count: 1000 } },
});
export const realtimeQueue = new Queue("realtime", {
  connection: redis,
  defaultJobOptions: { ...baseJobOptions, attempts: 2, priority: 1 },
});

/** Wires completed/failed/stalled events + DLQ forwarding (legacy bullmq.ts behavior). */
export function attachAnalyzeEvents(): void {
  const events = createQueueEvents("analyze");
  const metrics = getMetrics();

  events.on("completed", ({ jobId }) => {
    log.info({ jobId }, "Job completed");
    metrics.queueJobs.inc({ queue: "analyze", state: "completed" });
  });

  events.on("failed", async ({ jobId, failedReason }) => {
    log.error({ jobId, reason: failedReason }, "Job failed");
    metrics.queueJobs.inc({ queue: "analyze", state: "failed" });
    const job = await analyzeQueue.getJob(jobId);
    if (job) {
      await dlq.add("failed-job", {
        originalJobId: jobId,
        jobData: job.data,
        failedReason,
        failedAt: new Date().toISOString(),
      });
    }
  });

  events.on("stalled", ({ jobId }) => {
    log.warn({ jobId }, "Job stalled");
    metrics.queueJobs.inc({ queue: "analyze", state: "stalled" });
  });
}

// Side effect at import — matches the legacy bullmq.ts behavior of wiring events eagerly.
attachAnalyzeEvents();

export async function addAnalyzeJob(data: AnalyzeJob, priority?: number) {
  const jobId = makeJobId(data.correlationId);
  const existing = await analyzeQueue.getJob(jobId).catch(() => null);
  if (existing) return existing; // idempotent re-submission
  const job = await analyzeQueue.add("analyze", data, { priority, jobId });
  getMetrics().queueJobs.inc({ queue: "analyze", state: "queued" });
  log.info({ jobId: job.id, correlationId: data.correlationId }, "Job queued");
  return job;
}

export async function getJobStatus(jobId: string) {
  const job = await analyzeQueue.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();
  return { id: job.id, state, progress: job.progress, data: job.data };
}

export async function queueHealthCheck(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
