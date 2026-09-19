/**
 * PHASE-17 — §3.4 attempts feed built ON TOP of the PHASE-16 interaction
 * event log (ADR-038 reuse-first): stage attempt facts are derived from
 * `interaction_events` (ATTEMPT_SUBMIT rows with the REAL measured engine
 * echo in `detail`). ALL SQL inside withTenant (RLS fail-closed).
 * NO new data source — the interaction log is the ONLY source.
 */
import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import { interactionEventsTable } from "../schema/index.js";

export interface StageAttemptFact {
  eventId: string;
  attemptId: string | null;
  studentId: string | null;
  occurredAt: Date;
  passed: boolean;
  detail: Record<string, unknown>;
}

/** Real ATTEMPT_SUBMIT events for one student (desc by DB clock), §3.4 inputs. */
export async function listStageAttemptFacts(q: {
  tenantId: string;
  studentId: string;
  limit?: number;
}): Promise<StageAttemptFact[]> {
  return withTenant(q.tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: interactionEventsTable.id,
        attemptId: interactionEventsTable.attemptId,
        studentId: interactionEventsTable.studentId,
        occurredAt: interactionEventsTable.occurredAt,
        detail: interactionEventsTable.detail,
      })
      .from(interactionEventsTable)
      .where(
        and(
          eq(interactionEventsTable.tenantId, q.tenantId),
          eq(interactionEventsTable.studentId, q.studentId),
          eq(interactionEventsTable.eventType, "ATTEMPT_SUBMIT"),
        ),
      )
      .orderBy(desc(interactionEventsTable.occurredAt))
      .limit(Math.min(Math.max(q.limit ?? 100, 1), 500));
    return rows.map((r) => {
      const detail = (r.detail ?? {}) as Record<string, unknown>;
      const passed = detail.finalCorrect === true;
      return {
        eventId: r.id,
        attemptId: r.attemptId,
        studentId: r.studentId,
        occurredAt: r.occurredAt,
        passed,
        detail,
      };
    });
  });
}
