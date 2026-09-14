import { analyzeQueue } from "@workspace/queue";

const jobId = process.env.JOB_ID;
if (!jobId) throw new Error("JOB_ID is required");

async function main() {
  const job = await analyzeQueue.getJob(jobId);
  if (!job) {
    console.log(JSON.stringify({ found: false, jobId }, null, 2));
    return;
  }
  const state = await job.getState();
  console.log(JSON.stringify({
    found: true,
    jobId,
    state,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason ?? null,
    data: job.data,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
