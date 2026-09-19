/**
 * PHASE-18 — canonical SPACED-REVIEW-ENGINE capability (governing doc v2.1
 * §3.5). ALL SQL lives here (Architecture Contract). Every write/read runs
 * inside withTenant (0007 RLS mechanism — fail-closed). Items are derived
 * ONLY from real attempt outcomes — the §3.4 stage_progressions stream
 * (no new data source; ADR-039 reuse-first). The interval ladder is the
 * fixed §3.5 policy [1,3,7,14,30] days; a lapse resets to box 1; mastery =
 * a correct recall at the top of the ladder. Completions are idempotent via
 * (tenant, operation_key); the ledger is append-only bookkeeping.
 */
import { and, asc, eq, lte } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import {
  reviewItemsTable,
  reviewCompletionsTable,
  stageProgressionsTable,
} from "../schema/index.js";

export class SpacedReviewError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "SpacedReviewError";
    this.code = code;
  }
}

/** §3.5 fixed policy: expanding interval ladder (days), box 1..5. */
export const SPACED_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;
export const SPACED_TOP_BOX = SPACED_INTERVAL_DAYS.length;

export type ReviewItemStatus = "DUE" | "SNOOZED" | "MASTERED";

export interface ReviewItemView {
  id: string;
  studentId: string;
  stageKey: string;
  itemKey: string;
  box: number;
  intervalDays: number;
  dueAt: Date;
  status: ReviewItemStatus;
  lastOutcome: string;
  updatedAt: Date;
}

export interface CompleteReviewInput {
  tenantId: string;
  studentId: string;
  itemId: string;
  passed: boolean;
  operationKey: string;
}

export interface CompleteReviewResult {
  item: ReviewItemView;
  ledger: { id: string; boxFrom: number; boxTo: number; intervalDays: number; existed: boolean };
}

const toView = (r: typeof reviewItemsTable.$inferSelect): ReviewItemView => ({
  id: r.id,
  studentId: r.studentId,
  stageKey: r.stageKey,
  itemKey: r.itemKey,
  box: r.box,
  intervalDays: r.intervalDays,
  dueAt: r.dueAt,
  status: r.status as ReviewItemStatus,
  lastOutcome: r.lastOutcome,
  updatedAt: r.updatedAt,
});

/**
 * §3.5 derivation: create/promote review items from the student's REAL
 * stage_progressions rows. Idempotent — replaying a refresh never duplicates
 * items and never re-promotes on an already-consumed REAL pass.
 */
export async function refreshReviewSchedule(q: {
  tenantId: string;
  studentId: string;
  operationKey: string;
}): Promise<{ created: number; promoted: number; items: ReviewItemView[] }> {
  return withTenant(q.tenantId, async (tx) => {
    const progressions = await tx
      .select()
      .from(stageProgressionsTable)
      .where(
        and(
          eq(stageProgressionsTable.tenantId, q.tenantId),
          eq(stageProgressionsTable.studentId, q.studentId),
        ),
      )
      .orderBy(asc(stageProgressionsTable.stageKey));
    let created = 0;
    let promoted = 0;
    for (const p of progressions) {
      if (p.attemptCount < 1) continue;
      const existing = await tx
        .select()
        .from(reviewItemsTable)
        .where(
          and(
            eq(reviewItemsTable.tenantId, q.tenantId),
            eq(reviewItemsTable.studentId, q.studentId),
            eq(reviewItemsTable.stageKey, p.stageKey),
            eq(reviewItemsTable.itemKey, p.stageKey),
          ),
        );
      let item = existing[0];
      if (!item) {
        const [ins] = await tx
          .insert(reviewItemsTable)
          .values({
            id: crypto.randomUUID(),
            tenantId: q.tenantId,
            studentId: q.studentId,
            stageKey: p.stageKey,
            itemKey: p.stageKey,
            box: 1,
            intervalDays: SPACED_INTERVAL_DAYS[0],
            dueAt: new Date(),
            status: "DUE",
            lastOutcome: "FAILED_ATTEMPTS",
            lastAttemptId: p.lastAttemptId,
            operationKey: `${q.operationKey}:${p.stageKey}`,
          })
          .onConflictDoNothing()
          .returning();
        if (ins) {
          item = ins;
          created += 1;
        } else {
          const [again] = await tx
            .select()
            .from(reviewItemsTable)
            .where(
              and(
                eq(reviewItemsTable.tenantId, q.tenantId),
                eq(reviewItemsTable.studentId, q.studentId),
                eq(reviewItemsTable.stageKey, p.stageKey),
                eq(reviewItemsTable.itemKey, p.stageKey),
              ),
            );
          item = again;
        }
      }
      // a §3.4 REAL pass (ADVANCED) promotes the review item one box — once.
      if (p.status === "ADVANCED" && item && item.lastOutcome !== "REAL_PASS") {
        const nextBox = Math.min(item.box + 1, SPACED_TOP_BOX);
        const interval = SPACED_INTERVAL_DAYS[nextBox - 1];
        await tx
          .update(reviewItemsTable)
          .set({
            box: nextBox,
            intervalDays: interval,
            dueAt: new Date(Date.now() + interval * 86_400_000),
            status: nextBox >= SPACED_TOP_BOX ? "MASTERED" : "SNOOZED",
            lastOutcome: "REAL_PASS",
            updatedAt: new Date(),
          })
          .where(eq(reviewItemsTable.id, item.id));
        promoted += 1;
      }
    }
    const items = await tx
      .select()
      .from(reviewItemsTable)
      .where(
        and(
          eq(reviewItemsTable.tenantId, q.tenantId),
          eq(reviewItemsTable.studentId, q.studentId),
        ),
      )
      .orderBy(asc(reviewItemsTable.stageKey));
    return { created, promoted, items: items.map(toView) };
  });
}

/**
 * §3.5 completion: a correct recall moves UP the ladder (self-paced early
 * revision is allowed — due_at is the recommendation, ADR-039); a lapse
 * resets to box 1. Idempotent by (tenant, operation_key). Mastery at the top.
 */
export async function completeReview(input: CompleteReviewInput): Promise<CompleteReviewResult> {
  return withTenant(input.tenantId, async (tx) => {
    const dup = await tx
      .select({ id: reviewCompletionsTable.id })
      .from(reviewCompletionsTable)
      .where(
        and(
          eq(reviewCompletionsTable.tenantId, input.tenantId),
          eq(reviewCompletionsTable.operationKey, input.operationKey),
        ),
      );
    if (dup.length > 0) {
      const [item] = await tx
        .select()
        .from(reviewItemsTable)
        .where(
          and(
            eq(reviewItemsTable.tenantId, input.tenantId),
            eq(reviewItemsTable.id, input.itemId),
          ),
        );
      if (!item) throw new SpacedReviewError("REVIEW_ITEM_NOT_FOUND");
      return {
        item: toView(item),
        ledger: { id: dup[0].id, boxFrom: item.box, boxTo: item.box, intervalDays: item.intervalDays, existed: true },
      };
    }
    const found = await tx
      .select()
      .from(reviewItemsTable)
      .where(
        and(
          eq(reviewItemsTable.tenantId, input.tenantId),
          eq(reviewItemsTable.id, input.itemId),
        ),
      );
    const item = found[0];
    if (!item) throw new SpacedReviewError("REVIEW_ITEM_NOT_FOUND");
    if (item.studentId !== input.studentId) {
      throw new SpacedReviewError("STUDENT_CONTEXT_MISMATCH");
    }
    if (item.status === "MASTERED" && input.passed) {
      throw new SpacedReviewError("REVIEW_ALREADY_MASTERED");
    }
    const boxFrom = item.box;
    let boxTo: number;
    let status: ReviewItemStatus;
    let outcome: string;
    let dueAt: Date;
    if (input.passed) {
      boxTo = Math.min(boxFrom + 1, SPACED_TOP_BOX);
      status = boxTo >= SPACED_TOP_BOX ? "MASTERED" : "SNOOZED";
      outcome = "REVIEW_PASS";
      const interval = SPACED_INTERVAL_DAYS[boxTo - 1];
      dueAt = new Date(Date.now() + interval * 86_400_000);
    } else {
      boxTo = 1; // §3.5 lapse → reset to box 1
      status = "DUE";
      outcome = "REVIEW_LAPSE";
      dueAt = new Date(); // a lapse means re-study NOW (immediately due)
    }
    const interval = SPACED_INTERVAL_DAYS[boxTo - 1];
    await tx
      .update(reviewItemsTable)
      .set({ box: boxTo, intervalDays: interval, dueAt, status, lastOutcome: outcome, updatedAt: new Date() })
      .where(eq(reviewItemsTable.id, item.id));
    const [ledger] = await tx
      .insert(reviewCompletionsTable)
      .values({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        studentId: input.studentId,
        itemId: item.id,
        passed: input.passed ? 1 : 0,
        boxFrom,
        boxTo,
        intervalDays: interval,
        operationKey: input.operationKey,
      })
      .returning({ id: reviewCompletionsTable.id });
    const [fresh] = await tx
      .select()
      .from(reviewItemsTable)
      .where(eq(reviewItemsTable.id, item.id));
    return {
      item: toView(fresh),
      ledger: { id: ledger.id, boxFrom, boxTo, intervalDays: interval, existed: false },
    };
  });
}

/** §3.5 read-side: the student's due review queue (tenant-scoped by RLS). */
export async function listDueReviews(q: {
  tenantId: string;
  studentId: string;
}): Promise<ReviewItemView[]> {
  return withTenant(q.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(reviewItemsTable)
      .where(
        and(
          eq(reviewItemsTable.tenantId, q.tenantId),
          eq(reviewItemsTable.studentId, q.studentId),
          eq(reviewItemsTable.status, "DUE"),
          lte(reviewItemsTable.dueAt, new Date()),
        ),
      )
      .orderBy(asc(reviewItemsTable.dueAt));
    return rows.map(toView);
  });
}
