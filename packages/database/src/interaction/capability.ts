/**
 * PHASE-16 — canonical INTERACTION-EVENT-LOG capability (governing doc v2.1 §3.3).
 * ALL SQL lives here (Architecture Contract). Every write/read runs inside
 * withTenant (0007 RLS mechanism — fail-closed). Idempotent via
 * (tenant_id, operation_key). Fire-and-forget semantics are implemented at the
 * /v1 adapter (the event stream must NEVER break the main request).
 */
import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import { interactionEventsTable } from "../schema/index.js";

export class InteractionCapabilityError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "InteractionCapabilityError";
    this.code = code;
  }
}

export type InteractionEventType =
  | "LOGIN" | "LOGIN_FAILED" | "LOGOUT"
  | "ATTEMPT_START" | "ATTEMPT_SUBMIT" | "ATTEMPT_FAILED"
  | "ERROR";

export interface RecordInteractionEventInput {
  tenantId: string;
  actorId: string;
  actorRole: string;
  eventType: InteractionEventType;
  studentId?: string;
  schoolId?: string;
  classId?: string;
  attemptId?: string;
  detail?: Record<string, unknown>;
  operationKey: string;
}

/** Append one interaction event (idempotent on operation_key). */
export async function recordInteractionEvent(
  input: RecordInteractionEventInput,
): Promise<{ id: string; existed: boolean; occurredAt: Date }> {
  return withTenant(input.tenantId, async (tx) => {
    const dup = await tx
      .select({ id: interactionEventsTable.id, occurredAt: interactionEventsTable.occurredAt })
      .from(interactionEventsTable)
      .where(
        and(
          eq(interactionEventsTable.tenantId, input.tenantId),
          eq(interactionEventsTable.operationKey, input.operationKey),
        ),
      );
    if (dup.length > 0) return { id: dup[0].id, existed: true, occurredAt: dup[0].occurredAt };
    const [row] = await tx
      .insert(interactionEventsTable)
      .values({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        studentId: input.studentId ?? null,
        actorId: input.actorId,
        actorRole: input.actorRole,
        eventType: input.eventType,
        schoolId: input.schoolId ?? null,
        classId: input.classId ?? null,
        attemptId: input.attemptId ?? null,
        detail: input.detail ?? {},
        operationKey: input.operationKey,
      })
      .returning({ id: interactionEventsTable.id, occurredAt: interactionEventsTable.occurredAt });
    return { id: row.id, existed: false, occurredAt: row.occurredAt };
  });
}

export interface ListInteractionEventsQuery {
  tenantId: string;
  studentId?: string;
  eventType?: InteractionEventType;
  limit?: number;
}

export interface InteractionEventView {
  id: string;
  eventType: string;
  actorId: string;
  actorRole: string;
  studentId: string | null;
  schoolId: string | null;
  classId: string | null;
  attemptId: string | null;
  detail: Record<string, unknown>;
  occurredAt: Date;
}

/** Staff/student read path (tenant-scoped by RLS; desc by occurred_at). */
export async function listInteractionEvents(
  q: ListInteractionEventsQuery,
): Promise<InteractionEventView[]> {
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 500);
  return withTenant(q.tenantId, async (tx) => {
    const filters = [eq(interactionEventsTable.tenantId, q.tenantId)];
    if (q.studentId) filters.push(eq(interactionEventsTable.studentId, q.studentId));
    if (q.eventType) filters.push(eq(interactionEventsTable.eventType, q.eventType));
    return tx
      .select({
        id: interactionEventsTable.id,
        eventType: interactionEventsTable.eventType,
        actorId: interactionEventsTable.actorId,
        actorRole: interactionEventsTable.actorRole,
        studentId: interactionEventsTable.studentId,
        schoolId: interactionEventsTable.schoolId,
        classId: interactionEventsTable.classId,
        attemptId: interactionEventsTable.attemptId,
        detail: interactionEventsTable.detail,
        occurredAt: interactionEventsTable.occurredAt,
      })
      .from(interactionEventsTable)
      .where(and(...filters))
      .orderBy(desc(interactionEventsTable.occurredAt))
      .limit(limit);
  });
}
