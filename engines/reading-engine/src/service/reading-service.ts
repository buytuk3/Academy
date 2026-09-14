/**
 * CORE-02 / CORE-01 — Reading Engine service facade on the CANONICAL database.
 *
 * Transport-free domain entry points. All database access now goes through
 * @workspace/db (packages/database — the single source of truth): canonical
 * uuid id columns and explicit tenant context. The legacy engine shim
 * (src/db) is no longer touched by the runtime (zero-consumer target).
 *
 * Identity contract (CORE-02A/02E): HTTP → API → Contracts → Service → Queue
 * → Worker → Database all use uuid/text ids — no number↔uuid conversion in
 * the middle of the system.
 * Tenant contract (CORE-02B/02C): the tenant travels explicitly from the
 * authenticated identity into every write (and into AnalyzeJob); the worker
 * never guesses it. Reads rely on globally-unique uuid ids (no implicit
 * tenant resolution needed).
 * Session lifecycle (CORE-02D): canonical reading_sessions lifecycle with
 * status draft → completed, chronological order via createdAt.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { config } from "@workspace/config";
import { logger } from "../observability/logger.js";
import { getMetrics } from "../observability/metrics.js";
import {
  db,
  healthCheck as dbHealthCheck,
  attemptsTable as attempts,
  passagesTable as passages,
  readingSessionsTable as sessions,
  reportsTable as reports,
} from "@workspace/db";
import { healthCheck as inferenceHealthCheck } from "../pipeline/inference-client.js";
import { addAnalyzeJob, getJobStatus, queueHealthCheck } from "../queue/bullmq.js";
import { presignUrl } from "../security/s3-client.js";

/** Tenant/school/role context captured from the canonical D-03 access token. */
export interface ReadingContext {
  userId: string;
  role: string;
  tenantId: string;
  schoolId?: string;
  organizationId?: string;
}

export interface PassageInput {
  title: string;
  text: string;
  difficulty?: number;
  grade?: string;
  classroomId?: string;
  teacherId?: string;
}

export interface AnalyzeInput {
  studentId: string;
  passageId: string;
  sessionId: string;
  audioKey: string;
  expectedText?: string;
  /** CORE-25 / WAVE-4A: persistent execution attempt id (canonical lifecycle owner). */
  executionAttemptId?: string;
}

function requireTenant(ctx: ReadingContext): string {
  if (!ctx.tenantId) throw new Error("TENANT_CONTEXT_MISSING");
  return ctx.tenantId;
}

export async function getHealth() {
  const [dbOk, redisOk, inferenceOk] = await Promise.all([
    dbHealthCheck().catch(() => false),
    queueHealthCheck().catch(() => false),
    inferenceHealthCheck().catch(() => false),
  ]);
  return {
    ok: true,
    version: process.env.APP_VERSION || "4.0.0",
    db: dbOk,
    redis: redisOk,
    inference: inferenceOk,
  };
}

export async function metricsText(): Promise<string> {
  return getMetrics();
}

export async function listPassages(
  _ctx: ReadingContext,
  opts: { classroomId?: string; grade?: string; limit?: number; offset?: number },
) {
  const conditions: any[] = [];
  if (opts.classroomId) conditions.push(eq(passages.classroomId, opts.classroomId));
  if (opts.grade) conditions.push(eq(passages.grade, opts.grade));
  const limit = Math.min(opts.limit ?? 50, 100);
  const offset = opts.offset ?? 0;
  return db
    .select()
    .from(passages)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(passages.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function createPassage(ctx: ReadingContext, input: PassageInput) {
  const tenantId = requireTenant(ctx);
  const [row] = await db
    .insert(passages)
    .values({
      ...input,
      tenantId,
      teacherId: input.teacherId ?? ctx.userId,
    })
    .returning();
  return row;
}

export async function getPassage(id: string) {
  const [row] = await db.select().from(passages).where(eq(passages.id, id)).limit(1);
  return row ?? null;
}

export async function listSessionsByStudent(studentId: string) {
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.studentId, studentId))
    .orderBy(desc(sessions.createdAt))
    .limit(100);
}

export async function getAttempt(id: string) {
  const [row] = await db.select().from(attempts).where(eq(attempts.id, id)).limit(1);
  return row ?? null;
}

export async function enqueueAnalysis(ctx: ReadingContext, input: AnalyzeInput) {
  const tenantId = requireTenant(ctx);
  const { studentId, passageId, sessionId, audioKey, expectedText } = input;
  const correlationId = randomUUID();
  const [attemptRow] = await db
    .insert(attempts)
    .values({ sessionId, studentId, passageId, audioKey, tenantId, jobStatus: "queued", correlationId })
    .returning();
  const job = await addAnalyzeJob({
    studentId,
    passageId,
    sessionId,
    audioKey,
    expectedText: expectedText || "",
    correlationId,
    attemptId: attemptRow.id,
    tenantId,
    ...(input.executionAttemptId ? { executionAttemptId: input.executionAttemptId } : {}),
  });
  logger.info({ jobId: job.id, attemptId: attemptRow.id }, "Analysis job queued via REST");
  return { jobId: String(job.id), attemptId: attemptRow.id };
}

export async function getAnalysisJob(jobId: string) {
  const status = await getJobStatus(jobId);
  return status ?? null;
}

export async function listReportsByStudent(studentId: string) {
  const rows = await db
    .select()
    .from(reports)
    .innerJoin(attempts, eq(reports.attemptId, attempts.id))
    .where(eq(attempts.studentId, studentId))
    .orderBy(desc(reports.createdAt))
    .limit(100);
  return rows.map((r) => r.reports);
}

export async function getReport(id: string) {
  const [row] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return row ?? null;
}

export function presignAudio(key: string, op: "getObject" | "putObject") {
  return presignUrl(key, op);
}
