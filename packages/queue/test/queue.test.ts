import { describe, it, expect } from "vitest";
import { makeJobId, isDuplicateJob } from "../src/idempotency.js";
import type { AnalyzeJob, JobName, FailedJobData } from "../src/jobs.js";

describe("queue: idempotency helpers (no Redis required)", () => {
  it("makeJobId derives the deterministic job id from correlationId", () => {
    expect(makeJobId("corr-123")).toBe("corr-123");
  });

  it("isDuplicateJob returns true only for existing job ids", async () => {
    const fakeQueue = {
      getJob: async (id: string) => (id === "dup" ? { id } : null),
    } as unknown as Parameters<typeof isDuplicateJob>[0];
    expect(await isDuplicateJob(fakeQueue, "dup")).toBe(true);
    expect(await isDuplicateJob(fakeQueue, "fresh")).toBe(false);
  });
});

describe("queue: job contracts", () => {
  it("AnalyzeJob payload contract carries routing fields", () => {
    const job: AnalyzeJob = {
      studentId: "00000000-0000-4000-8000-000000000001",
      passageId: "00000000-0000-4000-8000-000000000002",
      sessionId: "00000000-0000-4000-8000-000000000003",
      audioKey: "attempts/1/audio.encrypted",
      expectedText: "",
      correlationId: "c1",
      attemptId: "00000000-0000-4000-8000-000000000004",
      tenantId: "00000000-0000-4000-8000-000000000000",
    };
    expect(job.correlationId).toBe("c1");
    expect(job.attemptId).toBe("00000000-0000-4000-8000-000000000004");
    expect(job.sessionId).toBe("00000000-0000-4000-8000-000000000003");
    expect(job.tenantId).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("JobName is a closed union incl. DLQ", () => {
    const names: JobName[] = ["analyze", "realtime", "failed-job"];
    expect(names).toHaveLength(3);
    const failed: FailedJobData = {
      originalJobId: "j1",
      jobData: {},
      failedReason: "boom",
      failedAt: new Date().toISOString(),
    };
    expect(failed.failedReason).toBe("boom");
  });
});

// Integration tests require a live Redis — marked SKIPPED explicitly
// (never reported as passing; see P3 report §17).
describe.skip("queue: Redis integration (enqueue/retry/backoff/DLQ)", () => {
  it("createQueue + enqueue + retry + DLQ flow", async () => {
    // Requires: running Redis at config.redis.url
    expect(true).toBe(true);
  });
  it("worker retry/backoff/failure + idempotent submission", async () => {
    // Requires: running Redis at config.redis.url
    expect(true).toBe(true);
  });
});
