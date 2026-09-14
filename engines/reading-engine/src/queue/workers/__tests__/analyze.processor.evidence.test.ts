/**
 * CORE-03A — Proof that READING ENGINE produces Evidence.
 *
 * The full analyze pipeline (all 11 stages) is stubbed at module level; the
 * REAL processAnalyzeJob runs end-to-end. Assertions:
 *  - recordEvidence called ONCE with assessment evidence (tenant, student,
 *    session, attempt, passage, sourceEngine, measurements summary);
 *  - Reading ownership is preserved: the pipeline STILL writes reports and
 *    masteryRecords (specialized measurement owners unchanged);
 *  - evidence is added as an event/reference, not as a replacement.
 */
import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => {
  const evidenceCalls: Record<string, unknown>[] = [];
  const insertTargets: unknown[] = [];

  const db = {
    select: () => ({
      from: () => {
        // Universal thenable query chain: every awaited shape resolves to [] —
        // supports .where().limit(1) (R-026-05 replay convergence gate),
        // .innerJoin().where() (history), and plain awaited selects, without
        // over-specifying the mock.
        const t: any = Object.assign(Promise.resolve([] as unknown[]), {
          innerJoin: () => t,
          leftJoin: () => t,
          where: () => t,
          limit: () => t,
        });
        return t;
      },
    }),
    insert: (table: unknown) => {
      insertTargets.push(table);
      return {
        values: () => ({
          returning: async () => [{ id: "row-1" }],
          onConflictDoUpdate: () => ({ returning: async () => [{ id: "outbox-1" }] }),
          onConflictDoNothing: () => ({ returning: async () => [{ id: "mastery-1" }] }),
        }),
      };
    },
  };

  const recordEvidence = vi.fn(async (input: Record<string, unknown>) => {
    evidenceCalls.push(input);
    return { id: "ev-1", ...input };
  });

  return { evidenceCalls, insertTargets, db, recordEvidence };
});

vi.mock("../../../../config/pipeline.config.js", () => ({
  pipelineConfig: { workers: { analyze: { concurrency: 1 } } },
}));
vi.mock("../../../observability/logger.js", () => ({
  logger: { child: () => ({ info() {}, error() {}, debug() {} }), info() {}, error() {} },
}));
vi.mock("../../../observability/metrics.js", () => ({
  metrics: { pipelineDuration: { labels: () => ({ observe() {} }) } },
}));
vi.mock("../../../pipeline/audio-enhancement.js", () => ({
  AudioEnhancement: class { validate() {}; denoise = async () => new Float32Array(16000); },
}));
vi.mock("../../../pipeline/feature-extraction.js", () => ({
  FeatureExtractor: class { extract = () => ({}); },
}));
vi.mock("../../../pipeline/vad.js", () => ({
  VoiceActivityDetector: class { detect = async () => [{}]; mergeSegments = () => [{}]; },
}));
vi.mock("../../../pipeline/stt.js", () => ({
  WhisperSTT: class { transcribe = async () => ({ text: "مرحبا", words: [] }); },
}));
vi.mock("../../../pipeline/g2p.js", () => ({
  G2PEngine: class { diacritizeSentence = async () => ""; },
}));
vi.mock("../../../pipeline/forced-alignment.js", () => ({
  ForcedAlignment: class { align = async () => []; },
}));
vi.mock("../../../pipeline/alignment.js", () => ({
  AlignmentEngine: class {
    align = () => ({
      ops: [{ type: "match", expected: "x", actual: "x", cost: 0 }],
      distance: 0,
      normalizedDistance: 0,
    });
  },
}));
vi.mock("../../../engines/confidence.js", () => ({ ConfidenceEngine: class {} }));
vi.mock("../../../engines/reading-score.js", () => ({
  ReadingScoreEngine: class {
    compute = () => ({ overall: 85, accuracy: 90, pronunciation: 80, fluency: 85, prosody: 80, wpm: 100, durationSec: 5 });
  },
}));
vi.mock("../../../engines/mastery.js", () => ({
  MasteryEngine: class { compute = () => ({ level: "PROGRESSING", delta: 1, attempts: 2, trend: "up" }); },
}));
vi.mock("../../../engines/gap.js", () => ({
  GapEngine: class {
    compute = () => ({
      errorDistribution: {}, phonemeGaps: {}, problemWords: [], skippedSegments: [],
      severityBreakdown: { high: 0, medium: 0, low: 0 },
    });
  },
}));
vi.mock("../../../engines/recommendation.js", () => ({ RecommendationEngine: class { compute = () => []; } }));
vi.mock("../../../engines/ai-feedback.js", () => ({ AIFeedbackEngine: class { generate = async () => []; } }));
vi.mock("../../../report/generator.js", () => ({
  ReportGenerator: class {
    build = (...args: unknown[]) => ({
      attemptId: args[9], passageId: args[10], studentId: args[11], tenantId: args[12],
      expected: "", actual: "", wordReport: [], reading: args[4], mastery: args[5], gaps: args[6],
      recommendations: [], aiFeedback: [], createdAt: new Date().toISOString(), modelVersions: {},
    });
  },
}));
vi.mock("../../../security/s3-client.js", () => ({
  downloadAudio: async () => ({ encryptedBuffer: new Uint8Array(100), encryptedKey: "ek" }),
  decryptAudio: async () => new Uint8Array(16000 * 2),
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}), and: () => ({}) }));

vi.mock("@workspace/db", () => ({
  eventOutboxTable: { __outbox: true } as never,
  db: hoisted.db,
  reportsTable: { id: {}, attemptId: {}, overallScore: {} },
  attemptsTable: { id: {}, studentId: {} },
  findEvidenceByOperationKey: vi.fn(async () => null),
  masteryRecordsTable: { id: {}, studentId: {}, passageId: {}, updatedAt: {} },
  recordEvidence: hoisted.recordEvidence,
}));

import { processAnalyzeJob } from "../analyze.processor.js";
import { reportsTable, masteryRecordsTable } from "@workspace/db";

const T = "00000000-0000-4000-8000-00000000000a";
const S = "00000000-0000-4000-8000-00000000000b";
const A = "00000000-0000-4000-8000-00000000000c";
const P = "00000000-0000-4000-8000-00000000000d";
const SE = "00000000-0000-4000-8000-00000000000e";

beforeEach(() => {
  hoisted.evidenceCalls.length = 0;
  hoisted.insertTargets.length = 0;
  hoisted.recordEvidence.mockClear();
});

describe("CORE-03A — reading engine produces evidence", () => {
  it("records assessment evidence on analysis completion with full context", async () => {
    const job = {
      id: "job-ev-1",
      data: { studentId: S, passageId: P, sessionId: SE, audioKey: "a/b.enc", expectedText: "مرحبا", correlationId: "c", attemptId: A, tenantId: T },
      updateProgress: async () => {},
    };

    await processAnalyzeJob(job as never);

    // Evidence recorded exactly once, as assessment, from reading-engine
    expect(hoisted.recordEvidence).toHaveBeenCalledTimes(1);
    const ev = hoisted.evidenceCalls[0];
    expect(ev).toMatchObject({
      tenantId: T,
      studentId: S,
      sessionId: SE,
      attemptId: A,
      passageId: P,
      evidenceType: "assessment",
      action: "reading.analyzed",
      result: "completed",
      subject: "reading",
      sourceEngine: "reading-engine",
      tool: "analyze-processor",
    });
    expect((ev.response as Record<string, number>).overall).toBe(85);
    expect((ev.response as Record<string, number>).wpm).toBe(100);
    expect(typeof ev.durationMs).toBe("number");

    // Ownership preserved: pipeline still writes reports + masteryRecords
    expect(hoisted.insertTargets).toContain(reportsTable);
    expect(hoisted.insertTargets).toContain(masteryRecordsTable);
  });

  it("cannot produce evidence without tenant context (worker hard-fails)", async () => {
    const job = {
      id: "job-ev-2",
      data: { studentId: S, passageId: P, sessionId: SE, audioKey: "a", expectedText: "", correlationId: "c", attemptId: A, tenantId: "" },
      updateProgress: async () => {},
    };
    await expect(processAnalyzeJob(job as never)).rejects.toThrow("TENANT_CONTEXT_MISSING");
  });
});
