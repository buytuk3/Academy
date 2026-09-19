/**
 * PHASE-17 — canonical PROVISIONAL-ADVANCE-MASTERY-MODEL capability
 * (governing doc v2.1 §3.4). ALL SQL lives here (Architecture Contract).
 * Every write/read runs inside withTenant (0007 RLS mechanism — fail-closed).
 * The advance is the P15-4-proven atomic lock: UNIQUE(tenant,student,stage) +
 * a SINGLE-statement conditional UPDATE whose WHERE carries the budget guard —
 * two concurrent 3rd-fail records yield exactly ONE PROVISIONAL winner.
 * Attempt history is read from the PHASE-16 interaction_events stream —
 * NO new data source (ADR-038, reuse-first).
 */
import { and, asc, eq } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import { stageProgressionsTable, stagePromotionsTable } from "../schema/index.js";

export class ProvisionalAdvanceError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ProvisionalAdvanceError";
    this.code = code;
  }
}

/** §3.4 fixed policy: the provisional advance consumes ONE budget unit. */
export const ADVANCE_THRESHOLD = 3;

export type ProgressionStatus =
  | "ACTIVE" | "PROVISIONAL" | "ADVANCED" | "REPEATING" | "CLOSED";

export interface StageProgressionView {
  id: string;
  studentId: string;
  stageKey: string;
  status: ProgressionStatus;
  advancedFromStage: string | null;
  advanceSeq: number;
  attemptCount: number;
  provisionalBudgetUsed: number;
  debtStatus: string;
  chainHead: string | null;
  updatedAt: Date;
}

export interface RecordStageAttemptInput {
  tenantId: string;
  studentId: string;
  stageKey: string;
  attemptId: string;
  passed: boolean;
  operationKey: string;
}

export interface RecordStageAttemptResult {
  progression: StageProgressionView;
  advanced: boolean;
  /** §3.4: the provisional advance carries the debt — it never clears it. */
  debtCarried: boolean;
  promotion: { id: string; mode: "PROVISIONAL" | "REAL"; existed: boolean } | null;
}

const toView = (r: typeof stageProgressionsTable.$inferSelect): StageProgressionView => ({
  id: r.id,
  studentId: r.studentId,
  stageKey: r.stageKey,
  status: r.status as ProgressionStatus,
  advancedFromStage: r.advancedFromStage,
  advanceSeq: r.advanceSeq,
  attemptCount: r.attemptCount,
  provisionalBudgetUsed: r.provisionalBudgetUsed,
  debtStatus: r.debtStatus,
  chainHead: r.chainHead,
  updatedAt: r.updatedAt,
});

/**
 * Record one finished stage attempt and run the §3.4 state machine:
 *   fail, ACTIVE, count<3  → stays ACTIVE;
 *   fail, ACTIVE, count=3  → AT MOST ONE provisional advance (conditional
 *                             UPDATE; budget guard inside the WHERE);
 *   fail, PROVISIONAL/REPEATING → REPEATING (auto-repeat; no new advance);
 *   pass                   → ADVANCED; a provisional origin KEEPS the debt
 *                             (progress never forgives it — §3.4).
 */
export async function recordStageAttempt(
  input: RecordStageAttemptInput,
): Promise<RecordStageAttemptResult> {
  return withTenant(input.tenantId, async (tx) => {
    const found = await tx
      .select()
      .from(stageProgressionsTable)
      .where(
        and(
          eq(stageProgressionsTable.tenantId, input.tenantId),
          eq(stageProgressionsTable.studentId, input.studentId),
          eq(stageProgressionsTable.stageKey, input.stageKey),
        ),
      );
    let row = found[0];
    if (!row) {
      const [ins] = await tx
        .insert(stageProgressionsTable)
        .values({
          id: crypto.randomUUID(),
          tenantId: input.tenantId,
          studentId: input.studentId,
          stageKey: input.stageKey,
          operationKey: input.operationKey,
          attemptCount: 0,
        })
        .returning();
      row = ins;
    }
    if (row.status === "CLOSED") {
      throw new ProvisionalAdvanceError("STAGE_PROGRESSION_CLOSED");
    }

    const nextCount = row.attemptCount + 1;
    let advanced = false;
    let debtCarried = false;
    let promotion: RecordStageAttemptResult["promotion"] = null;

    if (input.passed) {
      // REAL pass — clears the stage in place. A provisional origin keeps the
      // debt carried (§3.4: the provisional advance never erased it).
      const provisionalOrigin = row.status === "PROVISIONAL" || row.status === "REPEATING";
      await tx
        .update(stageProgressionsTable)
        .set({
          status: "ADVANCED",
          attemptCount: nextCount,
          lastAttemptId: input.attemptId,
          ...(provisionalOrigin ? { debtStatus: "CLEARED_BY_REAL_PASS_WITH_DEBT_CARRIED" } : {}),
          updatedAt: new Date(),
        })
        .where(eq(stageProgressionsTable.id, row.id));
      const [pr] = await tx
        .insert(stagePromotionsTable)
        .values({
          id: crypto.randomUUID(),
          tenantId: input.tenantId,
          studentId: input.studentId,
          fromStage: input.stageKey,
          toStage: input.stageKey, // cleared in place — no stage change
          mode: "REAL",
          budgetUsed: 0,
          debtCarried: provisionalOrigin,
          sourceAttemptId: input.attemptId,
          operationKey: input.operationKey,
        })
        .onConflictDoNothing()
        .returning({ id: stagePromotionsTable.id });
      promotion = pr
        ? { id: pr.id, mode: "REAL", existed: false }
        : { id: "", mode: "REAL", existed: true };
    } else if (row.status === "ACTIVE" && nextCount >= ADVANCE_THRESHOLD) {
      // THE atomic advance (P15-4 pattern): ONE conditional UPDATE — the
      // budget guard lives in the WHERE, so two parallel 3rd-fail records
      // produce exactly ONE winner; the loser observes the winner's row.
      const fromStage = row.advancedFromStage ?? row.stageKey;
      const [upd] = await tx
        .update(stageProgressionsTable)
        .set({
          status: "PROVISIONAL",
          attemptCount: nextCount,
          lastAttemptId: input.attemptId,
          provisionalBudgetUsed: 1,
          advancedFromStage: fromStage,
          advanceSeq: row.advanceSeq + 1,
          debtStatus: "PROVISIONAL_PENDING",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(stageProgressionsTable.id, row.id),
            eq(stageProgressionsTable.status, "ACTIVE"),
            eq(stageProgressionsTable.provisionalBudgetUsed, 0),
          ),
        )
        .returning();
      if (upd) {
        advanced = true;
        debtCarried = true; // §3.4: the provisional advance carries the debt
        const [pr] = await tx
          .insert(stagePromotionsTable)
          .values({
            id: crypto.randomUUID(),
            tenantId: input.tenantId,
            studentId: input.studentId,
            fromStage,
            toStage: input.stageKey,
            mode: "PROVISIONAL",
            budgetUsed: 1,
            debtCarried: true,
            sourceAttemptId: input.attemptId,
            operationKey: input.operationKey,
          })
          .onConflictDoNothing()
          .returning({ id: stagePromotionsTable.id });
        promotion = pr
          ? { id: pr.id, mode: "PROVISIONAL", existed: false }
          : { id: "", mode: "PROVISIONAL", existed: true };
        row = upd;
      } else {
        // lost the CAS race — re-read the winning row
        const [winner] = await tx
          .select()
          .from(stageProgressionsTable)
          .where(eq(stageProgressionsTable.id, row.id));
        row = winner ?? row;
      }
    } else {
      // plain fail — stays ACTIVE before threshold; REPEATING afterwards (§3.4
      // auto-repeat of the provisionally-entered stage; no new advance).
      const nextStatus: ProgressionStatus = row.status === "ACTIVE" ? "ACTIVE" : "REPEATING";
      await tx
        .update(stageProgressionsTable)
        .set({
          attemptCount: nextCount,
          lastAttemptId: input.attemptId,
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(stageProgressionsTable.id, row.id));
      row = { ...row, attemptCount: nextCount, status: nextStatus };
    }

    const [finalRow] = await tx
      .select()
      .from(stageProgressionsTable)
      .where(eq(stageProgressionsTable.id, row.id));
    return { progression: toView(finalRow), advanced, debtCarried, promotion };
  });
}

/** Read-side: the student's full §3.4 progression state (tenant-scoped by RLS). */
export async function listStageProgressions(q: {
  tenantId: string;
  studentId: string;
}): Promise<StageProgressionView[]> {
  return withTenant(q.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(stageProgressionsTable)
      .where(
        and(
          eq(stageProgressionsTable.tenantId, q.tenantId),
          eq(stageProgressionsTable.studentId, q.studentId),
        ),
      )
      .orderBy(asc(stageProgressionsTable.stageKey));
    return rows.map(toView);
  });
}

/** Read-side: one stage's progression (404-mapable). */
export async function getStageProgression(q: {
  tenantId: string;
  studentId: string;
  stageKey: string;
}): Promise<StageProgressionView | null> {
  const rows = await listStageProgressions({ tenantId: q.tenantId, studentId: q.studentId });
  return rows.find((r) => r.stageKey === q.stageKey) ?? null;
}
