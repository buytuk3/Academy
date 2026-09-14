/**
 * @workspace/queue — idempotency.ts
 * Pure idempotency helpers (no Redis side effects — safe to unit-test).
 */
import type { Queue } from "bullmq";

/** Deterministic job id derived from the correlation id. */
export function makeJobId(correlationId: string): string {
  return correlationId;
}

/** True when a job with this id already exists (duplicate submission). */
export async function isDuplicateJob(queue: Queue, jobId: string): Promise<boolean> {
  try {
    return (await queue.getJob(jobId)) !== null;
  } catch {
    return false;
  }
}
