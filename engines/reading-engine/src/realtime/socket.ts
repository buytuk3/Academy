import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { Server, type Socket } from "socket.io";
import { config } from "@workspace/config";
import { logger } from "../observability/logger.js";
import { encryptAudio } from "../security/encryption.js";
import { uploadAudio } from "../security/s3-client.js";
import { addAnalyzeJob, analyzeQueue, createQueueEvents } from "../queue/bullmq.js";
import * as securityNs from "@workspace/security";
// P5.3: canonical auth (D-03 / C-A2 legacy grace). Adapter preserves legacy null-on-invalid behavior.
const verifyLegacyToken = (token: string, _secret?: string): any => {
  try { return securityNs.verifyAccessToken(token, {} as any); } catch { return null; }
};
import { attemptsTable as attempts, db, readingSessionsTable as sessions, reportsTable as reports } from "@workspace/db";
import type { AnalyzeJob, FullReport } from "@buytuk/contracts";

interface SessionState {
  sessionId: string;
  attemptId: string;
  chunks: Float32Array[];
  totalSamples: number;
  expectedText: string;
  passageId: string;
  studentId: string;
  tenantId: string;
}

const SAMPLE_RATE = 16000;

function stageFor(progress: number): string {
  if (progress < 10) return "downloading";
  if (progress < 15) return "decrypting";
  if (progress < 20) return "denoising";
  if (progress < 25) return "feature_extraction";
  if (progress < 35) return "vad";
  if (progress < 50) return "stt";
  if (progress < 60) return "g2p";
  if (progress < 70) return "forced_alignment";
  if (progress < 80) return "dtw_alignment";
  if (progress < 95) return "scoring";
  return "saving";
}

/**
 * Socket.IO realtime layer (canonical session lifecycle — CORE-02D):
 *   session:start → reading_session (status draft) + attempt rows
 *   audio_chunk   → buffers PCM float chunks
 *   session:stop  → session status completed + duration recorded,
 *                   audio encrypted → S3 → analyze job enqueued (with tenantId)
 * Emits: session_started, analyze_started, pipeline_status, report_ready, pipeline_error
 */
export function attachSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (config.security.corsOrigin || "*")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
  });

  const states = new Map<string, SessionState>();

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const secret = config.jwt.secret;
    if (!token || !secret) {
      next(new Error("AUTH_REQUIRED"));
      return;
    }
    try {
      const payload = verifyLegacyToken(token, secret) as {
        sub?: number | string;
        id?: number | string;
        role?: string;
        tenantId?: string;
      };
      (socket as Socket & { user: { id: string; role: string; tenantId?: string } }).user = {
        id: String(payload.sub ?? payload.id ?? ""),
        role: payload.role || "student",
        tenantId: payload.tenantId,
      };
      next();
    } catch {
      next(new Error("INVALID_TOKEN"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const stateKey = socket.id;
    const socketUser = (socket as Socket & { user?: { id: string; role: string; tenantId?: string } }).user;
    const tenantId = socketUser?.tenantId ?? "";

    socket.on("session:start", async (payload: any, ack?: (r: any) => void) => {
      try {
        const studentId = String(payload?.studentId ?? "");
        const passageId = String(payload?.passageId ?? "");
        const expectedText: string = payload?.expectedText || "";
        if (!studentId || !passageId) {
          ack?.({ ok: false, error: "studentId and passageId are required" });
          return;
        }
        if (!tenantId) throw new Error("TENANT_CONTEXT_MISSING");

        const teacherId = socketUser?.role === "student" ? undefined : socketUser?.id;

        const [sessionRow] = await db
          .insert(sessions)
          .values({ tenantId, studentId, teacherId, sessionType: "reading", status: "draft" })
          .returning();

        const [attemptRow] = await db
          .insert(attempts)
          .values({ sessionId: sessionRow.id, studentId, passageId, tenantId, jobStatus: "streaming" })
          .returning();

        states.set(stateKey, {
          sessionId: sessionRow.id,
          attemptId: attemptRow.id,
          chunks: [],
          totalSamples: 0,
          expectedText,
          passageId,
          studentId,
          tenantId,
        });

        const result = { ok: true, sessionId: sessionRow.id, attemptId: attemptRow.id };
        socket.emit("session_started", result);
        ack?.(result);
      } catch (err: any) {
        logger.error({ err }, "session:start failed");
        ack?.({ ok: false, error: err?.message || "SESSION_START_FAILED" });
      }
    });

    socket.on("audio_chunk", (chunk: Float32Array) => {
      const state = states.get(stateKey);
      if (!state) return;
      const samples = new Float32Array(chunk);
      state.chunks.push(samples);
      state.totalSamples += samples.length;
    });

    socket.on("session:stop", async (ack?: (r: any) => void) => {
      const state = states.get(stateKey);
      if (!state) {
        socket.emit("pipeline_error", { message: "NO_ACTIVE_SESSION" });
        ack?.({ ok: false, error: "NO_ACTIVE_SESSION" });
        return;
      }

      try {
        const pcm = new Float32Array(state.totalSamples);
        let offset = 0;
        for (const chunk of state.chunks) {
          pcm.set(chunk, offset);
          offset += chunk.length;
        }
        if (pcm.length === 0) throw new Error("EMPTY_AUDIO");

        const { encryptedBuffer, encryptedKey } = await encryptAudio(pcm);
        const audioKey = `attempts/${state.attemptId}/audio.encrypted`;
        await uploadAudio(audioKey, encryptedBuffer, "application/octet-stream", {
          "x-amz-key": encryptedKey,
        });

        const correlationId = randomUUID();
        await db
          .update(attempts)
          .set({ audioKey, encryptedKey, correlationId, jobStatus: "queued" })
          .where(eq(attempts.id, state.attemptId));

        await db
          .update(sessions)
          .set({
            status: "completed",
            durationSeconds: Math.round(state.totalSamples / SAMPLE_RATE),
            updatedAt: new Date(),
          })
          .where(eq(sessions.id, state.sessionId));

        const job = await addAnalyzeJob({
          studentId: state.studentId,
          passageId: state.passageId,
          sessionId: state.sessionId,
          audioKey,
          expectedText: state.expectedText,
          correlationId,
          attemptId: state.attemptId,
          tenantId: state.tenantId,
        });

        states.delete(stateKey);
        const result = {
          ok: true,
          jobId: String(job.id),
          attemptId: state.attemptId,
          correlationId,
        };
        socket.emit("analyze_started", result);
        ack?.(result);
      } catch (err: any) {
        logger.error({ err }, "session:stop failed");
        socket.emit("pipeline_error", { message: err?.message || "SESSION_STOP_FAILED" });
        ack?.({ ok: false, error: err?.message || "SESSION_STOP_FAILED" });
      }
    });

    socket.on("disconnect", () => {
      states.delete(stateKey);
    });
  });

  // ===== Queue events → realtime push =====
  const events = createQueueEvents("analyze");

  events.on("progress", ({ jobId, data }) => {
    io.emit("pipeline_status", { jobId, stage: stageFor(Number(data)) });
  });

  events.on("completed", async ({ jobId }) => {
    try {
      const job = (await analyzeQueue.getJob(jobId)) as Job<AnalyzeJob> | undefined;
      if (!job) return;
      const attemptId = job.data.attemptId;
      if (!attemptId) return;
      const [report] = await db
        .select()
        .from(reports)
        .where(eq(reports.attemptId, attemptId))
        .limit(1);
      io.emit("report_ready", {
        jobId,
        attemptId,
        report: (report?.data ?? null) as FullReport | null,
      });
    } catch (err) {
      logger.error({ err, jobId }, "report_ready emission failed");
    }
  });

  events.on("failed", ({ jobId, failedReason }) => {
    io.emit("pipeline_error", { jobId, message: failedReason });
  });

  return io;
}
