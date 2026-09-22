import { config, configWarnings } from "@workspace/config";
import { createLogger } from "@workspace/observability";
import { createWorker, analyzeQueue } from "@workspace/queue";
import { getS3StartupStatus } from "../../../engines/reading-engine/src/security/s3-client.js";
import { processAnalyzeJob } from "@engine/analyze-processor";

/**
 * apps/worker — Unified Worker Runtime (P4.5 / C-A4).
 * Runs heavy jobs through the canonical queue owner. Business logic lives in
 * the engine (analyze.processor). Worker is a runtime, never an engine.
 * Start: pnpm --filter buytuk-worker start   (requires DATABASE_URL + REDIS_URL)
 */
const logger = createLogger({ level: config.observability.logLevel, name: "buytuk-worker" });

logger.info("BuyTuk unified worker starting");
for (const warning of configWarnings) {
  logger.warn({ component: "config" }, warning);
}
const s3 = getS3StartupStatus();
if (s3.ready) {
  logger.info({ mode: s3.mode, bucket: s3.bucket, region: s3.region, endpointUrl: s3.endpointUrl, hasSessionToken: s3.hasSessionToken, usingLocalEndpointFallback: s3.usingLocalEndpointFallback }, "Worker S3 startup check passed");
} else {
  logger.warn({ mode: s3.mode, bucket: s3.bucket, region: s3.region, endpointUrl: s3.endpointUrl, hasPartialCredentials: s3.hasPartialCredentials, hasSessionToken: s3.hasSessionToken }, s3.message);
}

const worker = createWorker("analyze", async (job) => {
  const result = await processAnalyzeJob(job);
  try {
    const { tenantId, studentId } = job.data;
    if (tenantId && studentId) {
      const { runLearningLoop } = await import("@workspace/learning-loop");
      const { listEvidenceForStudent } = await import("@workspace/db");
      const rows = await listEvidenceForStudent({ tenantId, studentId });
      const trace = await runLearningLoop({ tenantId, studentId, rows });
      logger.info({ jobId: job.id, stoppedAt: trace.stoppedAt, stopReason: trace.stopReason }, "Learning loop invoked (post-evidence, worker)");
    }
  } catch (err) {
    logger.error({ err, jobId: job.id }, "Learning loop failed after analyze — evidence unaffected, resumable");
  }
  return result;
}, {
  concurrency: 3,
  autorun: true,
});

worker.on("error", (err) => logger.error({ err }, "Worker error"));
worker.on("ready", () => logger.info("Analyze worker ready"));

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down worker");
  await worker.close();
  await analyzeQueue.close().catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
