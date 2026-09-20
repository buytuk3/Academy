/**
 * PHASE-19 — canonical CROSS-STAGE-ESCALATION-ENGINE capability (governing
 * doc v2.1 §3.6). ALL SQL lives here (Architecture Contract). Every
 * write/read runs inside withTenant (0007 RLS mechanism — fail-closed).
 * §3.6 derivation reads ONLY the real §3.4 stage_progressions stream
 * (reuse-first — no new data source, ADR-040): an open educational debt
 * (PROVISIONAL_PENDING) on one stage + persistent failure (>= threshold
 * failed attempts) on ANOTHER stage → exactly ONE escalation per
 * (student, from, to) — the UNIQUE lock + onConflictDoNothing make
 * re-evaluation idempotent. Acknowledgement is a single conditional UPDATE
 * (P15-4 pattern) — parallel acks converge; replays collapse on the
 * (tenant, operation_key) idempotency.
 */
import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import { stageEscalationsTable, stageProgressionsTable } from "../schema/index.js";

export class EscalationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "EscalationError";
    this.code = code;
  }
}

/** §3.6 fixed policy: persistent-failure threshold on the non-debt stage. */
export const ESCALATION_GAP_ATTEMPT_THRESHOLD = 2;

export type EscalationStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export interface EscalationView {
  id: string;
  studentId: string;
  fromStage: string;
  toStage: string;
  severity: "HIGH" | "CRITICAL";
  debtStatusSnapshot: string;
  failedAttemptsTotal: number;
  triggerSummary: Record<string, unknown>;
  status: EscalationStatus;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
}

export interface EvaluateEscalationResult {
  created: number;
  items: EscalationView[];
}

export interface AcknowledgeEscalationResult {
  item: EscalationView;
  changed: boolean;
  existed: boolean;
}

const toView = (r: typeof stageEscalationsTable.$inferSelect): EscalationView => ({
  id: r.id,
  studentId: r.studentId,
  fromStage: r.fromStage,
  toStage: r.toStage,
  severity: r.severity as "HIGH" | "CRITICAL",
  debtStatusSnapshot: r.debtStatusSnapshot,
  failedAttemptsTotal: r.failedAttemptsTotal,
  triggerSummary: r.triggerSummary,
  status: r.status as EscalationStatus,
  acknowledgedBy: r.acknowledgedBy,
  acknowledgedAt: r.acknowledgedAt,
  createdAt: r.createdAt,
});

/**
 * §3.6 engine: derive cross-stage escalations from the REAL §3.4
 * progression rows. Idempotent — replaying an evaluation never duplicates
 * (UNIQUE lock) and never re-raises an acknowledged escalation.
 */
export async function evaluateEscalation(q: {
  tenantId: string;
  studentId: string;
  operationKey: string;
}): Promise<EvaluateEscalationResult> {
  return withTenant(q.tenantId, async (tx) => {
    const progressions = await tx
      .select()
      .from(stageProgressionsTable)
      .where(
        and(
          eq(stageProgressionsTable.tenantId, q.tenantId),
          eq(stageProgressionsTable.studentId, q.studentId),
        ),
      );
    // §3.6 trigger: the OPEN educational debt (provisional advance carried it)
    const debtStage = progressions.find((r) => r.debtStatus === "PROVISIONAL_PENDING");
    if (!debtStage) {
      return { created: 0, items: [] }; // no debt → no escalation (real-data-only)
    }
    // …AND the gap PERSISTING on another stage (not advanced, not the debt stage)
    const gapStages = progressions.filter(
      (r) =>
        r.stageKey !== debtStage.stageKey &&
        r.status !== "ADVANCED" &&
        r.status !== "CLOSED" &&
        r.attemptCount >= ESCALATION_GAP_ATTEMPT_THRESHOLD,
    );
    let created = 0;
    for (const g of gapStages) {
      const existing = await tx
        .select()
        .from(stageEscalationsTable)
        .where(
          and(
            eq(stageEscalationsTable.tenantId, q.tenantId),
            eq(stageEscalationsTable.studentId, q.studentId),
            eq(stageEscalationsTable.fromStage, debtStage.stageKey),
            eq(stageEscalationsTable.toStage, g.stageKey),
          ),
        );
      if (existing[0]) continue; // already raised — idempotent re-evaluation
      const [ins] = await tx
        .insert(stageEscalationsTable)
        .values({
          id: crypto.randomUUID(),
          tenantId: q.tenantId,
          studentId: q.studentId,
          fromStage: debtStage.stageKey,
          toStage: g.stageKey,
          severity: g.attemptCount >= ADVANCE_FAILURE_TIER ? "CRITICAL" : "HIGH",
          debtStatusSnapshot: debtStage.debtStatus,
          failedAttemptsTotal: debtStage.attemptCount + g.attemptCount,
          triggerSummary: {
            debtStage: { stageKey: debtStage.stageKey, status: debtStage.status, attemptCount: debtStage.attemptCount },
            gapStage: { stageKey: g.stageKey, status: g.status, attemptCount: g.attemptCount, threshold: ESCALATION_GAP_ATTEMPT_THRESHOLD },
          },
          operationKey: `${q.operationKey}:${debtStage.stageKey}:${g.stageKey}`,
        })
        .onConflictDoNothing()
        .returning();
      if (ins) created += 1;
    }
    const items = await tx
      .select()
      .from(stageEscalationsTable)
      .where(
        and(
          eq(stageEscalationsTable.tenantId, q.tenantId),
          eq(stageEscalationsTable.studentId, q.studentId),
        ),
      )
      .orderBy(desc(stageEscalationsTable.createdAt));
    return { created, items: items.map(toView) };
  });
}

/** severity tier: a gap stage at >= 3 failed attempts is CRITICAL. */
const ADVANCE_FAILURE_TIER = 3;

/** §3.6 staff read path (tenant-scoped by RLS; desc by created_at). */
export async function listEscalations(q: {
  tenantId: string;
  studentId?: string;
}): Promise<EscalationView[]> {
  return withTenant(q.tenantId, async (tx) => {
    const filters = [eq(stageEscalationsTable.tenantId, q.tenantId)];
    if (q.studentId) filters.push(eq(stageEscalationsTable.studentId, q.studentId));
    const rows = await tx
      .select()
      .from(stageEscalationsTable)
      .where(and(...filters))
      .orderBy(desc(stageEscalationsTable.createdAt));
    return rows.map(toView);
  });
}

/**
 * §3.6 acknowledgement — teacher takes the escalation. Single conditional
 * UPDATE (status OPEN → ACKNOWLEDGED); replays with the same operation key
 * converge without a second write; parallel acks converge via the CAS.
 */
export async function acknowledgeEscalation(input: {
  tenantId: string;
  escalationId: string;
  teacherId: string;
  operationKey: string;
}): Promise<AcknowledgeEscalationResult> {
  return withTenant(input.tenantId, async (tx) => {
    const dup = await tx
      .select({ id: stageEscalationsTable.id })
      .from(stageEscalationsTable)
      .where(
        and(
          eq(stageEscalationsTable.tenantId, input.tenantId),
          eq(stageEscalationsTable.operationKey, input.operationKey),
        ),
      );
    if (dup.length > 0) {
      const [row] = await tx
        .select()
        .from(stageEscalationsTable)
        .where(eq(stageEscalationsTable.id, input.escalationId));
      if (!row) throw new EscalationError("ESCALATION_NOT_FOUND");
      return { item: toView(row), changed: false, existed: true };
    }
    const found = await tx
      .select()
      .from(stageEscalationsTable)
      .where(
        and(
          eq(stageEscalationsTable.tenantId, input.tenantId),
          eq(stageEscalationsTable.id, input.escalationId),
        ),
      );
    const row = found[0];
    if (!row) throw new EscalationError("ESCALATION_NOT_FOUND");
    const [upd] = await tx
      .update(stageEscalationsTable)
      .set({
        status: "ACKNOWLEDGED",
        acknowledgedBy: input.teacherId,
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(stageEscalationsTable.id, row.id),
          eq(stageEscalationsTable.status, "OPEN"),
        ),
      )
      .returning();
    if (upd) {
      return { item: toView(upd), changed: true, existed: false };
    }
    // lost the CAS race — already acknowledged by a parallel/replay call
    const [fresh] = await tx
      .select()
      .from(stageEscalationsTable)
      .where(eq(stageEscalationsTable.id, row.id));
    return { item: toView(fresh), changed: false, existed: false };
  });
}
