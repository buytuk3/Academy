import { config } from "@workspace/config";
import { createLogger } from "@workspace/observability";
import { createWorker, analyzeQueue } from "@workspace/queue";
import { processAnalyzeJob } from "@engine/analyze-processor";

/**
 * apps/worker — Unified Worker Runtime (P4.5 / C-A4).
 * Runs heavy jobs through the canonical queue owner. Business logic lives in
 * the engine (analyze.processor). Worker is a runtime, never an engine.
 * Start: pnpm --filter buytuk-worker start   (requires DATABASE_URL + REDIS_URL)
 */
const logger = createLogger({ level: config.observability.logLevel, name: "buytuk-worker" });

logger.info("BuyTuk unified worker starting");

const worker = createWorker("analyze", async (job) => {
  // ADR-027/V-3 — fail-closed ordering: the loop triggers ONLY after the
  // analyze pipeline RESOLVED (canonical evidence + report + mastery already
  // persisted). A failed job never triggers the loop.
  const result = await processAnalyzeJob(job);
  // ADR-027/V-3 — Learning Loop runtime call site #1 (async reading flow).
  // Trigger: canonical evidence write COMPLETED above. First pass runs
  // WITHOUT a teacher decision — the loop stops at the Teacher Decision Gate
  // by design (proposal stays PENDING). Loop failure NEVER fails the job
  // (evidence is canonical) — the loop is idempotently resumable with the
  // same evidence rows (R-027-05 restored-identity semantics).
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
