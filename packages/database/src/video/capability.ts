/**
 * PHASE-22 — canonical VIDEO-LESSON-CONTENT capability (governing doc v2.1
 * §3.8). ALL SQL lives here (Architecture Contract). Every write/read runs
 * inside withTenant (0007 RLS mechanism — fail-closed).
 *
 * §3.8 model (ADR-043): a video lesson = a row in the EXISTING content
 * registry (content_definitions, created via the proven LESSON recipe —
 * loose reference lesson_content_id) + THIS table's video-specific state
 * (storage_key loose pointer — the attempts.audio_key convention; duration;
 * lifecycle PROCESSING→READY via a SINGLE-statement conditional UPDATE —
 * the P15-4-proven atomic publish; replays converge; publish replay with
 * the same operation key collapses). Students read ONLY READY rows.
 */
import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import { videoLessonsTable } from "../schema/index.js";

export class VideoLessonError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "VideoLessonError";
    this.code = code;
  }
}

export type VideoLessonStatus = "PROCESSING" | "READY" | "BLOCKED";

export interface VideoLessonView {
  id: string;
  lessonContentId: string | null;
  title: string;
  storageKey: string;
  durationSec: number;
  status: VideoLessonStatus;
  publishedAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

export interface PublishVideoLessonResult {
  lesson: VideoLessonView;
  changed: boolean;
  existed: boolean;
}

const toView = (r: typeof videoLessonsTable.$inferSelect): VideoLessonView => ({
  id: r.id,
  lessonContentId: r.lessonContentId,
  title: r.title,
  storageKey: r.storageKey,
  durationSec: r.durationSec,
  status: r.status as VideoLessonStatus,
  publishedAt: r.publishedAt,
  createdBy: r.createdBy,
  createdAt: r.createdAt,
});

/**
 * Register ONE video lesson over the existing content chain (idempotent by
 * (tenant, operation_key) — replays return the SAME row).
 */
export async function registerVideoLesson(q: {
  tenantId: string;
  title: string;
  storageKey: string;
  durationSec?: number;
  lessonContentId?: string;
  createdBy: string;
  operationKey: string;
}): Promise<{ lesson: VideoLessonView; existed: boolean }> {
  return withTenant(q.tenantId, async (tx) => {
    const dup = await tx
      .select()
      .from(videoLessonsTable)
      .where(
        and(
          eq(videoLessonsTable.tenantId, q.tenantId),
          eq(videoLessonsTable.operationKey, q.operationKey),
        ),
      );
    if (dup[0]) return { lesson: toView(dup[0]), existed: true };
    const [row] = await tx
      .insert(videoLessonsTable)
      .values({
        id: crypto.randomUUID(),
        tenantId: q.tenantId,
        lessonContentId: q.lessonContentId ?? null,
        title: q.title,
        storageKey: q.storageKey,
        durationSec: q.durationSec ?? 0,
        status: "PROCESSING",
        createdBy: q.createdBy,
        operationKey: q.operationKey,
      })
      .returning();
    return { lesson: toView(row), existed: false };
  });
}

/**
 * THE atomic publish (P15-4 pattern): ONE conditional UPDATE
 * (PROCESSING → READY); parallel/replay publishes converge — the CAS loser
 * and the operation-key replay both observe the winner's row (no second
 * write).
 */
export async function publishVideoLesson(q: {
  tenantId: string;
  videoLessonId: string;
  publisherId: string;
  operationKey: string;
}): Promise<PublishVideoLessonResult> {
  return withTenant(q.tenantId, async (tx) => {
    const found = await tx
      .select()
      .from(videoLessonsTable)
      .where(
        and(
          eq(videoLessonsTable.tenantId, q.tenantId),
          eq(videoLessonsTable.id, q.videoLessonId),
        ),
      );
    const row = found[0];
    if (!row) throw new VideoLessonError("VIDEO_LESSON_NOT_FOUND");
    if (row.publishOperationKey === q.operationKey) {
      return { lesson: toView(row), changed: false, existed: true }; // replay
    }
    const [upd] = await tx
      .update(videoLessonsTable)
      .set({
        status: "READY",
        publishedAt: new Date(),
        publishedBy: q.publisherId,
        publishOperationKey: q.operationKey,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(videoLessonsTable.id, row.id),
          eq(videoLessonsTable.status, "PROCESSING"),
        ),
      )
      .returning();
    if (upd) return { lesson: toView(upd), changed: true, existed: false };
    // lost the CAS race — a parallel publish won; observe the winner
    const [fresh] = await tx
      .select()
      .from(videoLessonsTable)
      .where(eq(videoLessonsTable.id, row.id));
    return { lesson: toView(fresh), changed: false, existed: false };
  });
}

/** Read one video lesson (RLS fail-closed; null → 404 upstream). */
export async function getVideoLesson(q: {
  tenantId: string;
  videoLessonId: string;
}): Promise<VideoLessonView | null> {
  return withTenant(q.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(videoLessonsTable)
      .where(
        and(
          eq(videoLessonsTable.tenantId, q.tenantId),
          eq(videoLessonsTable.id, q.videoLessonId),
        ),
      );
    return row ? toView(row) : null;
  });
}

/** Staff list (tenant-scoped by RLS; desc by created_at). */
export async function listVideoLessons(q: {
  tenantId: string;
  limit?: number;
}): Promise<VideoLessonView[]> {
  return withTenant(q.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(videoLessonsTable)
      .where(eq(videoLessonsTable.tenantId, q.tenantId))
      .orderBy(desc(videoLessonsTable.createdAt))
      .limit(Math.min(Math.max(q.limit ?? 200, 1), 1000));
    return rows.map(toView);
  });
}
