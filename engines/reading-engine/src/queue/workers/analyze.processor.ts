/**
 * artifacts/reading-engine — analyze.processor.ts (P4.5 / C-A4)
 * The business logic of the reading analysis job. Lives in the ENGINE (owner
 * of Reading capability). The Worker runtime in apps/worker invokes this via
 * @workspace/queue createWorker. No BullMQ Worker is constructed here.
 */
import type { Job } from "bullmq";
import { pipelineConfig } from "../../../config/pipeline.config.js";
import { logger } from "../../observability/logger.js";
import { metrics } from "../../observability/metrics.js";
import { AudioEnhancement } from "../../pipeline/audio-enhancement.js";
import { FeatureExtractor } from "../../pipeline/feature-extraction.js";
import { VoiceActivityDetector } from "../../pipeline/vad.js";
import { WhisperSTT } from "../../pipeline/stt.js";
import { G2PEngine } from "../../pipeline/g2p.js";
import { ForcedAlignment } from "../../pipeline/forced-alignment.js";
import { AlignmentEngine } from "../../pipeline/alignment.js";
import { ConfidenceEngine } from "../../engines/confidence.js";
import { ReadingScoreEngine } from "../../engines/reading-score.js";
import { MasteryEngine } from "../../engines/mastery.js";
import { GapEngine } from "../../engines/gap.js";
import { RecommendationEngine } from "../../engines/recommendation.js";
import { AIFeedbackEngine } from "../../engines/ai-feedback.js";
import { ReportGenerator } from "../../report/generator.js";
import { downloadAudio, decryptAudio } from "../../security/s3-client.js";
import { db, reportsTable as reports, attemptsTable as attempts, masteryRecordsTable as masteryRecords, recordEvidence, findEvidenceByOperationKey } from "@workspace/db";
import { publishEvent } from "@workspace/events";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AnalyzeJob, AlignmentResult } from "@buytuk/contracts";

const enhancement = new AudioEnhancement();
const featureExtractor = new FeatureExtractor();
const vad = new VoiceActivityDetector();
const stt = new WhisperSTT();
const forcedAlignment = new ForcedAlignment();
const aligner = new AlignmentEngine();
const confidence = new ConfidenceEngine();
const scorer = new ReadingScoreEngine();
const mastery = new MasteryEngine();
const gap = new GapEngine();
const recommendations = new RecommendationEngine();
const aiFeedback = new AIFeedbackEngine();
const reportGen = new ReportGenerator();

export const analyzeConcurrency = pipelineConfig.workers.analyze.concurrency;

export async function processAnalyzeJob(job: Job<AnalyzeJob>) {
  const { studentId, passageId, sessionId, audioKey, expectedText, correlationId, attemptId, tenantId, executionAttemptId } = job.data;
  const log = logger.child({ jobId: job.id, correlationId, studentId, passageId, tenantId });
  if (!tenantId) throw new Error("TENANT_CONTEXT_MISSING");

  // CORE-26C (R-026-05) — queue REPLAY/RECOVERY convergence: a re-delivered
  // job whose report is ALREADY persisted is a retry/replay after completion
  // (worker crash-restart, BullMQ re-run, duplicate delivery). The pipeline
  // must NOT run again — converge the persistent lifecycle idempotently and
  // return (no duplicate report/mastery/evidence rows — effect-level idempotency).
  if (attemptId) {
    const [existingReport] = await db
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.attemptId, attemptId))
      .limit(1);
    if (existingReport) {
      log.info({ attemptId }, "Analyze job replay detected — converging without re-run");
      if (executionAttemptId) {
        // Resume the persistent lifecycle with the REAL canonical evidence
        // pointer (same operationKey the first run wrote) — idempotent.
        const evRow = await findEvidenceByOperationKey({ tenantId, operationKey: `reading:analyze:${attemptId}` });
        if (evRow) {
          const { completeAsyncExecution } = await import("@workspace/db");
          await completeAsyncExecution({ tenantId, executionAttemptId, evidenceRef: evRow.id }).catch(() => undefined);
        }
      }
      return { success: true, replayed: true, duration: 0 };
    }
  }

  const startTime = Date.now();
  const SAMPLE_RATE = 16000;

  log.info("Starting analysis pipeline");

  // Stage 1: Download
  await job.updateProgress(5);
  log.info("Stage 1: Downloading audio");
  const { encryptedBuffer, encryptedKey } = await downloadAudio(audioKey);

  // Stage 2: Decrypt
  await job.updateProgress(10);
  log.info("Stage 2: Decrypting audio");
  const rawPcm = await decryptAudio(encryptedBuffer, encryptedKey);

  // Stage 3: Enhancement
  await job.updateProgress(15);
  log.info("Stage 3: Audio enhancement");
  enhancement.validate(rawPcm, SAMPLE_RATE);
  const enhancedPcm = await enhancement.denoise(rawPcm, correlationId);

  // Stage 4: Feature Extraction
  await job.updateProgress(20);
  log.info("Stage 4: Feature extraction");
  const features = featureExtractor.extract(enhancedPcm, SAMPLE_RATE, correlationId);

  // Stage 5: VAD
  await job.updateProgress(25);
  log.info("Stage 5: Voice activity detection");
  const segments = await vad.detect(enhancedPcm, SAMPLE_RATE, correlationId);
  const mergedSegments = vad.mergeSegments(segments);

  if (mergedSegments.length === 0) {
    throw new Error("No speech detected");
  }

  // Stage 6: STT
  await job.updateProgress(35);
  log.info("Stage 6: Speech transcription");
  const sttResult = await stt.transcribe(enhancedPcm, SAMPLE_RATE, correlationId);

  // Stage 7: G2P
  await job.updateProgress(45);
  log.info("Stage 7: G2P conversion");
  const diacritizedExpected = await new G2PEngine().diacritizeSentence(expectedText, correlationId);

  // Stage 8: Forced Alignment
  await job.updateProgress(60);
  log.info("Stage 8: Forced alignment");
  const wordAlignments = await forcedAlignment.align(
    enhancedPcm, SAMPLE_RATE, sttResult.text, correlationId,
  );

  // Stage 9: DTW Alignment
  await job.updateProgress(70);
  log.info("Stage 9: DTW alignment");
  const expectedWords = expectedText.split(/\s+/).filter(Boolean);
  const actualWords = sttResult.text.split(/\s+/).filter(Boolean);
  const wordDTW = aligner.align(expectedWords, actualWords, correlationId);

  const wer = wordDTW.ops.filter((o) => o.type !== "match").length / Math.max(expectedWords.length, 1);

  const alignment: AlignmentResult = {
    wordOps: wordDTW.ops,
    phonemeOps: [],
    wordErrorRate: wer,
    phonemeErrorRate: 0,
    totalErrors: wordDTW.ops.filter((o) => o.type !== "match").length,
  };

  // Stage 10: Scoring
  await job.updateProgress(80);
  log.info("Stage 10: Calculating scores");

  const durationSec = enhancedPcm.length / SAMPLE_RATE;
  const readingScore = scorer.compute(
    alignment, wordAlignments, features, durationSec, expectedWords.length,
  );

  const historyRows = await db
    .select({ score: reports.overallScore })
    .from(reports)
    .innerJoin(attempts, eq(reports.attemptId, attempts.id))
    .where(eq(attempts.studentId, studentId));

  const history = historyRows.map((r) => r.score);
  const masteryResult = mastery.compute(readingScore.overall, history);
  const gapResult = gap.compute(alignment.wordOps, wordAlignments, expectedWords);
  const recs = recommendations.compute(readingScore, gapResult, masteryResult);

  const feedbacks = await aiFeedback.generate(
    [],
    gapResult,
    { name: `Student ${studentId}`, level: masteryResult.level, nativeLanguage: "ar" },
  );

  // Stage 11: Save Report
  await job.updateProgress(95);
  log.info("Stage 11: Saving report");

  const aid = attemptId!;
  const report = reportGen.build(
    expectedText, sttResult.text, alignment, wordAlignments,
    readingScore, masteryResult, gapResult, recs, feedbacks,
    aid, passageId, studentId, tenantId,
  );

  const [reportRow] = await db.insert(reports).values({
    attemptId: aid,
    tenantId,
    overallScore: readingScore.overall,
    accuracyScore: readingScore.accuracy,
    pronunciationScore: readingScore.pronunciation,
    fluencyScore: readingScore.fluency,
    prosodyScore: readingScore.prosody,
    wpm: readingScore.wpm,
    data: report as any,
  })
    .returning({ id: reports.id });

  const [masteryRow] = await db
    .insert(masteryRecords)
    .values({
      studentId,
      passageId,
      tenantId,
      level: masteryResult.level,
      score: readingScore.overall,
      attempts: masteryResult.attempts,
      trend: masteryResult.trend,
    })
    .onConflictDoUpdate({
      target: [masteryRecords.studentId, masteryRecords.passageId],
      set: {
        level: masteryResult.level,
        score: readingScore.overall,
        attempts: masteryResult.attempts,
        trend: masteryResult.trend,
        updatedAt: new Date(),
      },
    })
    .returning({ id: masteryRecords.id });

  const totalDuration = (Date.now() - startTime) / 1000;

  // CORE-03A — Reading Engine is the FIRST evidence producer.
  // We record a reference/summary assessment event only: Reading remains the
  // owner of specialized measurements (scores live in reports + mastery); the
  // platform Evidence log gets the event + summary references to build the
  // Student Learning Record on top of every engine. No ownership transfer.
  const evidenceRow = await recordEvidence({
    tenantId,
    studentId,
    actorRole: "system",
    occurredAt: new Date(),
    evidenceType: "assessment",
    subject: "reading",
    sessionId,
    attemptId: aid,
    passageId,
    action: "reading.analyzed",
    response: {
      overall: readingScore.overall,
      accuracy: readingScore.accuracy,
      fluency: readingScore.fluency,
      pronunciation: readingScore.pronunciation,
      prosody: readingScore.prosody,
      wpm: readingScore.wpm,
      durationSec,
      wordErrorRate: alignment.wordErrorRate,
      phonemeErrorRate: alignment.phonemeErrorRate,
      totalErrors: alignment.totalErrors,
    },
    result: "completed",
    durationMs: Math.round(totalDuration * 1000),
    sourceEngine: "reading-engine",
    tool: "analyze-processor",
    // CORE-05 idempotency: stable logical-event key — a queue retry of the
    // same job (same attempt) collides on (tenant_id, operation_key) and
    // resolves to the existing evidence row instead of duplicating.
    operationKey: `reading:analyze:${attemptId ?? "na"}`,
    metadata: { masteryLevel: masteryResult.level, masteryTrend: masteryResult.trend },
  });

  // CORE-06 — Reading Engine is the FIRST EVENT PRODUCER. Events are emitted
  // only after the analyze operation ACTUALLY completed (report + mastery +
  // evidence persisted). Evidence is recorded via the canonical writer above;
  // these events flow through the outbox to the platform EvidenceConsumer,
  // which links them via recordEvidence (operationKey event:{id}) — no direct
  // table access, no engine-owned storage.
  await publishEvent(
    {
      id: randomUUID(),
      type: "ReadingAnalyzed",
      version: 1,
      occurredAt: new Date().toISOString(),
      actor: { id: "system", role: "system" },
      tenantId,
      studentId,
      payload: {
        sessionId,
        reportId: reportRow.id,
        scoreSummary: {
          accuracy: readingScore.accuracy,
          fluency: readingScore.fluency,
          prosody: readingScore.prosody,
        },
        evidenceRef: evidenceRow.id,
        attemptId: aid,
        passageId,
      },
    },
    { jobId: job.id ?? undefined, traceId: correlationId, correlationId },
  );
  await publishEvent(
    {
      id: randomUUID(),
      type: "MasteryUpdated",
      version: 1,
      occurredAt: new Date().toISOString(),
      actor: { id: "system", role: "system" },
      tenantId,
      studentId,
      payload: {
        masteryRecordId: masteryRow.id,
        skillId: `reading:${passageId}`,
        level: masteryResult.level,
      },
    },
    { jobId: job.id ?? undefined, traceId: correlationId, correlationId },
  );

  metrics.pipelineDuration.labels("total").observe(totalDuration);

  // CORE-25 / WAVE-4A — close the PERSISTENT attempt lifecycle when the
  // canonical Execution capability owns this attempt (executionAttemptId
  // present): MEASURED → EVIDENCE_RECORDED with the REAL canonical evidence
  // pointer written above. Ordering is fail-closed: evidence + report +
  // mastery are ALREADY persisted; a worker retry of this job converges
  // (completeAsyncExecution is idempotent via CAS replay — no double record).
  if (executionAttemptId) {
    const { completeAsyncExecution } = await import("@workspace/db");
    await completeAsyncExecution({ tenantId, executionAttemptId, evidenceRef: evidenceRow.id });
    log.info({ executionAttemptId, evidenceRef: evidenceRow.id }, "Persistent attempt closed (EVIDENCE_RECORDED)");
  }

  await job.updateProgress(100);
  log.info({ totalDuration, score: readingScore.overall }, "Pipeline completed");

  return { success: true, report, duration: totalDuration };
}
