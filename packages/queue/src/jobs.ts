/**
 * @workspace/queue — jobs.ts
 * Canonical job name definitions and payload contracts (queue-level only;
 * domain payloads live in @buytuk/contracts).
 */
import type { AnalyzeJob } from "@buytuk/contracts";

export type { AnalyzeJob };

export type JobName = "analyze" | "realtime" | "failed-job";

export interface FailedJobData {
  originalJobId: string;
  jobData: unknown;
  failedReason: string;
  failedAt: string;
}
