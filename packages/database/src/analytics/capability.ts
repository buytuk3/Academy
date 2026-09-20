/**
 * PHASE-21 — canonical EXAM-BEHAVIORAL-ANALYTICS capability (governing doc
 * v2.1 §3.9). ALL SQL lives here (Architecture Contract). Every read/write
 * runs inside withTenant (0007 RLS mechanism — fail-closed).
 *
 * DATA SOURCE (binding, ADR-042): the REAL interaction_events stream
 * (PHASE-16, migration 0011) — ATTEMPT_START / ATTEMPT_SUBMIT /
 * ATTEMPT_FAILED rows with occurred_at = the DB clock — joined through the
 * canonical attempt→evidenceRef→evidence chain (errorType) for the
 * correct/wrong classification. NO synthetic seeds, NO new data source.
 *
 * §3.9 derivations (all from real DB-clock timestamps):
 *   - time-per-question  : per attempt_id, last ATTEMPT_SUBMIT.occurred_at −
 *                          first ATTEMPT_START.occurred_at (wall clock);
 *   - answer changes     : per attempt_id, max(0, ATTEMPT_SUBMIT count − 1)
 *                          (each converged resubmit = a changed answer; the
 *                          semantics are documented in ADR-042);
 *   - correct/wrong seq  : attempts with classified evidence, ordered by
 *                          their first submit's occurred_at.
 * The stored snapshot lets the principal class/school dashboard read ONE
 * row per student — existing RLS read paths only, zero new access logic.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import {
  examBehaviorSnapshotsTable,
  interactionEventsTable,
  activityAttemptsTable,
  evidenceTable,
  studentsTable,
} from "../schema/index.js";

export class ExamBehaviorError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ExamBehaviorError";
    this.code = code;
  }
}

export const BEHAVIOR_ENGINE_VERSION = "1.0.0-events-derived";

export interface BehaviorSequenceEntry {
  attemptId: string;
  occurredAt: string;
  correct: boolean;
}

export interface ExamBehaviorMetrics {
  questionsStarted: number;
  submissions: number;
  answerChanges: number;
  avgTimeMs: number;
  correctCount: number;
  wrongCount: number;
  failedEvents: number;
  sequence: BehaviorSequenceEntry[];
}

export interface ExamBehaviorSnapshotView {
  id: string;
  studentId: string;
  classId: string | null;
  schoolId: string | null;
  questionsStarted: number;
  submissions: number;
  answerChanges: number;
  avgTimeMs: number;
  correctCount: number;
  wrongCount: number;
  failedEvents: number;
  sequence: BehaviorSequenceEntry[];
  engineVersion: string;
  createdAt: Date;
}

/**
 * Derive the §3.9 metrics for ONE student from the REAL event stream +
 * canonical attempt→evidence chain (all inside withTenant — RLS fail-closed).
 */
export async function computeExamBehavior(q: {
  tenantId: string;
  studentId: string;
}): Promise<ExamBehaviorMetrics> {
  return withTenant(q.tenantId, async (tx) => {
    const events = await tx
      .select({
        id: interactionEventsTable.id,
        eventType: interactionEventsTable.eventType,
        attemptId: interactionEventsTable.attemptId,
        occurredAt: interactionEventsTable.occurredAt,
      })
      .from(interactionEventsTable)
      .where(
        and(
          eq(interactionEventsTable.tenantId, q.tenantId),
          eq(interactionEventsTable.studentId, q.studentId),
          inArray(interactionEventsTable.eventType, ["ATTEMPT_START", "ATTEMPT_SUBMIT", "ATTEMPT_FAILED"]),
        ),
      )
      .orderBy(asc(interactionEventsTable.occurredAt));

    const failedEvents = events.filter((e) => e.eventType === "ATTEMPT_FAILED").length;
    const starts = new Map<string, Date>();
    const submits = new Map<string, Date[]>();
    for (const e of events) {
      if (!e.attemptId) continue;
      if (e.eventType === "ATTEMPT_START" && !starts.has(e.attemptId)) {
        starts.set(e.attemptId, e.occurredAt);
      }
      if (e.eventType === "ATTEMPT_SUBMIT") {
        const list = submits.get(e.attemptId) ?? [];
        list.push(e.occurredAt);
        submits.set(e.attemptId, list);
      }
    }

    // canonical attempt→evidence chain for correct/wrong (REAL rows only)
    const attemptIds = [...new Set([...starts.keys(), ...submits.keys()])];
    const evidenceById = new Map<string, { errorType: string | null }>();
    if (attemptIds.length > 0) {
      const attemptRows = await tx
        .select({ id: activityAttemptsTable.id, evidenceRef: activityAttemptsTable.evidenceRef })
        .from(activityAttemptsTable)
        .where(
          and(
            eq(activityAttemptsTable.tenantId, q.tenantId),
            eq(activityAttemptsTable.studentId, q.studentId),
            inArray(activityAttemptsTable.id, attemptIds),
          ),
        );
      const refs = attemptRows.filter((r) => r.evidenceRef).map((r) => r.evidenceRef as string);
      const evidenceRows = refs.length
        ? await tx
            .select({ id: evidenceTable.id, errorType: evidenceTable.errorType })
            .from(evidenceTable)
            .where(and(eq(evidenceTable.tenantId, q.tenantId), inArray(evidenceTable.id, refs)))
        : [];
      for (const row of evidenceRows) evidenceById.set(row.id, { errorType: row.errorType ?? null });
      for (const ar of attemptRows) {
        if (ar.evidenceRef && !evidenceById.has(ar.evidenceRef)) {
          const ev = evidenceRows.find((r) => r.id === ar.evidenceRef);
          if (ev) evidenceById.set(ar.evidenceRef, { errorType: ev.errorType ?? null });
        }
      }
      // remember each attempt's evidenceRef for the classification pass
      for (const ar of attemptRows) {
        if (ar.evidenceRef) evidenceById.set(`attempt:${ar.id}`, { errorType: ar.evidenceRef });
      }
    }

    let submissions = 0;
    let answerChanges = 0;
    let timeSum = 0;
    let timeSamples = 0;
    const sequence: BehaviorSequenceEntry[] = [];
    let correctCount = 0;
    let wrongCount = 0;
    const classified: Array<{ attemptId: string; at: Date; correct: boolean }> = [];
    for (const [attemptId, subList] of submits) {
      const sorted = [...subList].sort((a, b) => a.getTime() - b.getTime());
      submissions += sorted.length;
      answerChanges += Math.max(0, sorted.length - 1);
      const startAt = starts.get(attemptId);
      if (startAt) {
        timeSum += sorted[sorted.length - 1].getTime() - startAt.getTime();
        timeSamples += 1;
      }
      const refEntry = evidenceById.get(`attempt:${attemptId}`);
      if (refEntry) {
        const [evRow] = await tx
          .select({ errorType: evidenceTable.errorType })
          .from(evidenceTable)
          .where(and(eq(evidenceTable.tenantId, q.tenantId), eq(evidenceTable.id, refEntry.errorType)));
        if (evRow) {
          const correct = evRow.errorType == null || evRow.errorType === "";
          if (correct) correctCount += 1; else wrongCount += 1;
          classified.push({ attemptId, at: sorted[0], correct });
        }
      }
    }
    sequence.push(
      ...classified
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .map((c) => ({ attemptId: c.attemptId, occurredAt: c.at.toISOString(), correct: c.correct })),
    );
    return {
      questionsStarted: starts.size,
      submissions,
      answerChanges,
      avgTimeMs: timeSamples > 0 ? Math.round(timeSum / timeSamples) : 0,
      correctCount,
      wrongCount,
      failedEvents,
      sequence,
    };
  });
}

/** Store the computed §3.9 snapshot (idempotent by (tenant, operation_key)). */
export async function recordExamBehaviorSnapshot(q: {
  tenantId: string;
  studentId: string;
  operationKey: string;
}): Promise<{ snapshot: ExamBehaviorSnapshotView; existed: boolean }> {
  return withTenant(q.tenantId, async (tx) => {
    const dup = await tx
      .select()
      .from(examBehaviorSnapshotsTable)
      .where(
        and(
          eq(examBehaviorSnapshotsTable.tenantId, q.tenantId),
          eq(examBehaviorSnapshotsTable.operationKey, q.operationKey),
        ),
      );
    if (dup[0]) return { snapshot: toView(dup[0]), existed: true };
    const metrics = await computeExamBehavior({ tenantId: q.tenantId, studentId: q.studentId });
    const [student] = await tx
      .select({ classId: studentsTable.classId, schoolId: studentsTable.schoolId })
      .from(studentsTable)
      .where(
        and(eq(studentsTable.tenantId, q.tenantId), eq(studentsTable.id, q.studentId)),
      );
    const [row] = await tx
      .insert(examBehaviorSnapshotsTable)
      .values({
        id: crypto.randomUUID(),
        tenantId: q.tenantId,
        studentId: q.studentId,
        classId: student?.classId ?? null,
        schoolId: student?.schoolId ?? null,
        questionsStarted: metrics.questionsStarted,
        submissions: metrics.submissions,
        answerChanges: metrics.answerChanges,
        avgTimeMs: metrics.avgTimeMs,
        correctCount: metrics.correctCount,
        wrongCount: metrics.wrongCount,
        failedEvents: metrics.failedEvents,
        sequence: metrics.sequence as unknown as Record<string, unknown>[],
        metrics: { ...metrics, sequence: undefined },
        engineVersion: BEHAVIOR_ENGINE_VERSION,
        operationKey: q.operationKey,
      })
      .returning();
    return { snapshot: toView(row), existed: false };
  });
}

/** Principal class/school dashboard — EXISTING RLS read paths ONLY. */
export async function listExamBehaviorSnapshots(q: {
  tenantId: string;
  classId?: string;
  studentId?: string;
  limit?: number;
}): Promise<ExamBehaviorSnapshotView[]> {
  return withTenant(q.tenantId, async (tx) => {
    const filters = [eq(examBehaviorSnapshotsTable.tenantId, q.tenantId)];
    if (q.classId) filters.push(eq(examBehaviorSnapshotsTable.classId, q.classId));
    if (q.studentId) filters.push(eq(examBehaviorSnapshotsTable.studentId, q.studentId));
    const rows = await tx
      .select()
      .from(examBehaviorSnapshotsTable)
      .where(and(...filters))
      .orderBy(desc(examBehaviorSnapshotsTable.createdAt))
      .limit(Math.min(Math.max(q.limit ?? 200, 1), 1000));
    return rows.map(toView);
  });
}

const toView = (r: typeof examBehaviorSnapshotsTable.$inferSelect): ExamBehaviorSnapshotView => ({
  id: r.id,
  studentId: r.studentId,
  classId: r.classId,
  schoolId: r.schoolId,
  questionsStarted: r.questionsStarted,
  submissions: r.submissions,
  answerChanges: r.answerChanges,
  avgTimeMs: r.avgTimeMs,
  correctCount: r.correctCount,
  wrongCount: r.wrongCount,
  failedEvents: r.failedEvents,
  sequence: (r.sequence ?? []) as unknown as BehaviorSequenceEntry[],
  engineVersion: r.engineVersion,
  createdAt: r.createdAt,
});
