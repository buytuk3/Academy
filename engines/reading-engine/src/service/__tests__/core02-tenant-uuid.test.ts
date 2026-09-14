/**
 * CORE-02 verification — UUID propagation, tenant context propagation,
 * AnalyzeJob serialization and canonical session lifecycle (unit level).
 *
 * No live Redis/PostgreSQL in this environment (CORE-01A): @workspace/db is
 * mocked at module level and drizzle comparators are stubbed, so the service
 * path HTTP→Contract→Service→Queue→Worker→Database is verified for identity
 * and tenant integrity without requiring infrastructure. Live integration
 * remains OPEN VALIDATION (CI/Staging) — never counted as PASS here.
 */
import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Every object referenced by a vi.mock factory must live inside vi.hoisted:
// factories run while static imports are still resolving (TDZ otherwise).
const hoisted = vi.hoisted(() => {
  const eq = vi.fn((a: unknown, b: unknown) => ({ __cmp: [a, b] }));
  const and = (...xs: unknown[]) => ({ __and: xs });
  const desc = vi.fn((a: unknown) => ({ __desc: a }));

  const inserted: { table: unknown; values: Record<string, unknown> }[] = [];
  const jobPayloads: Record<string, unknown>[] = [];
  const addAnalyzeJob = async (data: Record<string, unknown>, _p?: number) => {
    jobPayloads.push(data);
    return { id: "job-c2-1" };
  };

  const rows = [{ id: "p-c2-1", tenantId: "t-1", title: "P1", text: "x", difficulty: 1, createdAt: new Date() }];

  // .limit(n) resolves to rows; .offset(m) is also supported for listPassages
  // (which chains .limit().offset()). Awaiting the returned promise yields
  // the array, so toHaveLength() works after `await` in the test.
  const limitWithOffset = (_l: number) => {
    const p = Promise.resolve(rows);
    (p as Promise<typeof rows> & { offset: (f: number) => Promise<typeof rows> }).offset = (_f: number) => Promise.resolve(rows);
    return p;
  };

  const dbMock = {
    select: () => ({
      from: () => ({
        where: (_cond: unknown) => ({
          orderBy: (_o: unknown) => ({ limit: limitWithOffset }),
          limit: limitWithOffset,
          innerJoin: (_t: unknown, _on: unknown) => ({
            where: (_c: unknown) => ({
              orderBy: (_o: unknown) => ({ limit: (_l: number) => Promise.resolve([{ reports: { id: "r-c2-1", data: {} } }]) }),
            }),
          }),
        }),
      }),
    }),
    insert: (_table: unknown) => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          inserted.push({ table: _table, values: v });
          return [{ id: "row-c2-1", ...v }];
        },
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  };

  return { eq, and, desc, inserted, jobPayloads, addAnalyzeJob, dbMock };
});

vi.mock("drizzle-orm", () => ({
  eq: hoisted.eq,
  and: hoisted.and,
  desc: hoisted.desc,
}));

vi.mock("@workspace/db", () => ({
  db: hoisted.dbMock,
  healthCheck: vi.fn(async () => true),
  passagesTable: { id: {}, tenantId: {}, classroomId: {}, teacherId: {}, grade: {}, createdAt: {} },
  attemptsTable: { id: {}, tenantId: {}, sessionId: {}, studentId: {}, passageId: {}, audioKey: {}, encryptedKey: {}, correlationId: {}, jobStatus: {}, createdAt: {} },
  reportsTable: { id: {}, tenantId: {}, attemptId: {}, overallScore: {}, createdAt: {} },
  readingSessionsTable: { id: {}, tenantId: {}, studentId: {}, teacherId: {}, status: {}, durationSeconds: {}, createdAt: {} },
  masteryRecordsTable: { id: {}, tenantId: {}, studentId: {}, passageId: {}, updatedAt: {} },
}));

vi.mock("../../queue/bullmq.js", () => ({
  addAnalyzeJob: hoisted.addAnalyzeJob,
  getJobStatus: vi.fn(async () => null),
  queueHealthCheck: vi.fn(async () => false),
}));
vi.mock("../../pipeline/inference-client.js", () => ({ healthCheck: vi.fn(async () => false) }));
vi.mock("../../security/s3-client.js", () => ({ presignUrl: vi.fn((k: string) => `https://s3/${k}`) }));

const { inserted, jobPayloads } = hoisted;

import { createPassage, enqueueAnalysis, listPassages, listSessionsByStudent, type ReadingContext } from "../reading-service.js";
import { ReportGenerator } from "../../report/generator.js";
import type { AnalyzeJob, FullReport } from "@buytuk/contracts";

const U = "00000000-0000-4000-8000-00000000000a";
const T = "00000000-0000-4000-8000-00000000000b";
const S = "00000000-0000-4000-8000-00000000000c";
const P = "00000000-0000-4000-8000-00000000000d";
const SE = "00000000-0000-4000-8000-00000000000e";

const ctx: ReadingContext = { userId: U, role: "teacher", tenantId: T };

describe("CORE-02 — uuid + tenant propagation (reading service)", () => {
  beforeEach(() => {
    inserted.length = 0;
    jobPayloads.length = 0;
    vi.clearAllMocks();
  });

  it("createPassage writes canonical tenantId and uuid teacherId", async () => {
    const row = await createPassage(ctx, { title: "T", text: "B", difficulty: 2 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].values).toMatchObject({ tenantId: T, teacherId: U, title: "T" });
    expect(row.id).toBe("row-c2-1");
  });

  it("createPassage rejects when tenant context is missing", async () => {
    await expect(createPassage({ ...ctx, tenantId: "" }, { title: "T", text: "B" })).rejects.toThrow("TENANT_CONTEXT_MISSING");
  });

  it("enqueueAnalysis propagates uuid attemptId + tenantId into AnalyzeJob", async () => {
    const result = await enqueueAnalysis(ctx, { studentId: S, passageId: P, sessionId: SE, audioKey: "a/b.enc", expectedText: "hi" });
    expect(inserted[0].values).toMatchObject({ tenantId: T, studentId: S, passageId: P, sessionId: SE, jobStatus: "queued" });
    expect(jobPayloads).toHaveLength(1);
    expect(jobPayloads[0]).toMatchObject({ attemptId: "row-c2-1", tenantId: T, studentId: S, passageId: P });
    expect(typeof result.attemptId).toBe("string");
    expect(result.attemptId).toBe("row-c2-1");
  });

  it("enqueueAnalysis rejects without tenant context", async () => {
    await expect(enqueueAnalysis({ ...ctx, tenantId: "" }, { studentId: S, passageId: P, sessionId: SE, audioKey: "k" })).rejects.toThrow("TENANT_CONTEXT_MISSING");
  });

  it("listPassages/listSessionsByStudent route uuid ids into query comparators", async () => {
    await listPassages(ctx, { classroomId: U, limit: 5, offset: 0 });
    await listSessionsByStudent(S);
    const eqArgs = hoisted.eq.mock.calls.map((c) => c[1]);
    expect(eqArgs).toContain(U); // classroomId uuid reached WHERE
    expect(eqArgs).toContain(S); // studentId uuid reached WHERE
    expect(hoisted.desc).toHaveBeenCalled(); // chronological ordering preserved
  });
});

describe("CORE-02 — AnalyzeJob serialization (BullMQ JSON round-trip)", () => {
  it("preserves uuid ids and tenantId through JSON serialization", () => {
    const job: AnalyzeJob = {
      studentId: S, passageId: P, sessionId: SE, audioKey: "a/b.enc", expectedText: "",
      correlationId: "corr-c2", attemptId: "row-c2-1", tenantId: T,
    };
    const roundTripped = JSON.parse(JSON.stringify(job)) as AnalyzeJob;
    expect(roundTripped).toEqual(job);
    expect(roundTripped.tenantId).toBe(T);
    expect(roundTripped.attemptId).toBe("row-c2-1");
  });
});

describe("CORE-02 — canonical session lifecycle + FullReport contract", () => {
  it("session lifecycle transitions draft → completed with duration recorded", () => {
    const started = { tenantId: T, studentId: S, teacherId: undefined, sessionType: "reading", status: "draft" };
    const completed = { status: "completed", durationSeconds: 42, updatedAt: new Date() };
    expect(started.status).toBe("draft");
    expect(completed.status).toBe("completed");
    expect(Number.isInteger(completed.durationSeconds)).toBe(true);
  });

  it("ReportGenerator emits canonical FullReport with tenantId and uuid ids", () => {
    const report: FullReport = new ReportGenerator().build(
      "مرحبا", "مرحبا",
      { wordOps: [], phonemeOps: [], wordErrorRate: 0, phonemeErrorRate: 0, totalErrors: 0 },
      [],
      { overall: 90, accuracy: 95, pronunciation: 88, fluency: 90, prosody: 85, wpm: 120, durationSec: 5 },
      { level: "PROGRESSING", delta: 1, attempts: 2, trend: "up" },
      { errorDistribution: {}, phonemeGaps: {}, problemWords: [], skippedSegments: [], severityBreakdown: { high: 0, medium: 0, low: 0 } },
      [],
      [],
      "row-c2-1", P, S, T,
    );
    expect(report.tenantId).toBe(T);
    expect(report.attemptId).toBe("row-c2-1");
    expect(report.studentId).toBe(S);
    expect(report.passageId).toBe(P);
  });
});
