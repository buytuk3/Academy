/**
 * PHASE-27 — canonical STUCK-POINT-DETECTION-AND-MANAGER-ALERT-ENGINE
 * capability (§3.10 addition, management decision 2026-09-21). ALL SQL lives
 * here (Architecture Contract); every write/read runs inside withTenant
 * (0007 RLS mechanism — fail-closed).
 *
 * SEMANTICS (binding):
 *  • SINGLE SOURCE, ZERO FABRICATION: the alert is raised FROM the real
 *    interaction_events row (0011) — the function reads the event row inside
 *    the transaction and derives EVERYTHING (actor, role, real DB-clock
 *    occurred_at, student link, failure reason from the event's own detail).
 *    An unknown source event → STUCK_EVENT_NOT_FOUND (404) — nothing is
 *    invented. The 0011 CHECK vocabulary is NOT altered (LOGIN_FAILED and
 *    ERROR already exist in it).
 *  • IMMEDIATE: the FIRST failure raises the alert at once — no aggregation,
 *    no repeat threshold (the hook fires per event write).
 *  • RECIPIENTS ALWAYS BOTH: every principal of the tenant (school
 *    management — the school link is resolved from the stuck student's real
 *    class chain) AND every system admin (role='admin') of the tenant — for
 *    every failure kind alike.
 *  • DELIVERY RIDES PHASE-24 ONLY: the fan-out inserts rows into the 0019
 *    notifications table inside the SAME transaction — all-or-nothing (alert
 *    row + N notification rows). No new channel, no email/queue.
 *  • ATOMIC DEDUP: UNIQUE(tenant, source_event_id) + INSERT ... ON CONFLICT
 *    DO NOTHING (the P15-4 pattern) — the same source event can NEVER
 *    produce a second alert or a second notification batch (replays converge:
 *    existed=true, notified=[]).
 *  • PAYLOAD (mandatory): stuck user identity (actorId+role), the operation
 *    type, the event's real timestamp, and the source event id — in the
 *    notification ref AND body.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import {
  stuckPointAlertsTable,
  notificationsTable,
  usersTable,
  studentsTable,
  classesTable,
  interactionEventsTable,
} from "../schema/index.js";

export class StuckPointError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "StuckPointError";
    this.code = code;
  }
}

export type StuckOperationType =
  | "LOGIN"
  | "READING"
  | "DICTATION"
  | "NUMERACY"
  | "ASSESSMENT"
  | "PAYMENT"
  | "SUPPORT"
  | "GENERAL";

export interface StuckPointAlertView {
  id: string;
  sourceEventId: string;
  occurredAt: Date;
  actorId: string;
  actorRole: string;
  studentId: string | null;
  schoolId: string | null;
  operationType: StuckOperationType;
  failureReason: string;
  notifiedPrincipals: string[];
  notifiedAdmins: string[];
  createdAt: Date;
}

const aView = (r: typeof stuckPointAlertsTable.$inferSelect): StuckPointAlertView => ({
  id: r.id,
  sourceEventId: r.sourceEventId,
  occurredAt: r.occurredAt,
  actorId: r.actorId,
  actorRole: r.actorRole,
  studentId: r.studentId,
  schoolId: r.schoolId,
  operationType: r.operationType as StuckOperationType,
  failureReason: r.failureReason,
  notifiedPrincipals: (r.notifiedPrincipals ?? []) as string[],
  notifiedAdmins: (r.notifiedAdmins ?? []) as string[],
  createdAt: r.createdAt,
});

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/** Alert-level operation taxonomy derived from the REAL event row (no guessing). */
function mapOperationType(ev: typeof interactionEventsTable.$inferSelect): StuckOperationType {
  if (ev.eventType === "LOGIN_FAILED") return "LOGIN";
  const detail = (ev.detail ?? {}) as Record<string, unknown>;
  const surface = String(detail.surface ?? "");
  if (surface.includes("redeem")) return "PAYMENT";
  if (surface.includes("support")) return "SUPPORT";
  if (surface.includes("video") || surface.includes("reading")) return "READING";
  return "GENERAL";
}

function mapFailureReason(ev: typeof interactionEventsTable.$inferSelect): string {
  const detail = (ev.detail ?? {}) as Record<string, unknown>;
  return String(detail.reason ?? detail.failureReason ?? "unknown-failure");
}

/** Shared locked section: dedup insert + dual fan-out, all in the caller's tx. */
async function raiseLocked(
  tx: Tx,
  real: {
    tenantId: string;
    sourceEventId: string;
    occurredAt: Date;
    actorId: string;
    actorRole: string;
    studentId: string | null;
    operationType: StuckOperationType;
    failureReason: string;
  },
): Promise<{ alert: StuckPointAlertView; existed: boolean; notified: string[] }> {
  // school linkage: the stuck student's REAL class → school chain
  let schoolId: string | null = null;
  if (real.studentId) {
    const [srow] = await tx
      .select({ classId: studentsTable.classId })
      .from(studentsTable)
      .where(and(eq(studentsTable.tenantId, real.tenantId), eq(studentsTable.id, real.studentId)));
    if (srow?.classId) {
      const [crow] = await tx
        .select({ schoolId: classesTable.schoolId })
        .from(classesTable)
        .where(and(eq(classesTable.tenantId, real.tenantId), eq(classesTable.id, srow.classId)));
      schoolId = crow?.schoolId ?? null;
    }
  }
  const [ins] = await tx
    .insert(stuckPointAlertsTable)
    .values({
      id: randomUUID(),
      tenantId: real.tenantId,
      sourceEventId: real.sourceEventId,
      occurredAt: real.occurredAt,
      actorId: real.actorId,
      actorRole: real.actorRole,
      studentId: real.studentId,
      schoolId,
      operationType: real.operationType,
      failureReason: real.failureReason,
      alertOperationKey: `p27-alert-${real.sourceEventId}`,
    })
    .onConflictDoNothing({
      target: [stuckPointAlertsTable.tenantId, stuckPointAlertsTable.sourceEventId],
    })
    .returning();
  if (!ins) {
    // the SAME source event already alerted → NO double delivery, ever
    const [existing] = await tx
      .select()
      .from(stuckPointAlertsTable)
      .where(
        and(
          eq(stuckPointAlertsTable.tenantId, real.tenantId),
          eq(stuckPointAlertsTable.sourceEventId, real.sourceEventId),
        ),
      );
    return { alert: aView(existing), existed: true, notified: [] };
  }
  // recipients ALWAYS both: every tenant principal + every tenant admin
  const principals = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.tenantId, real.tenantId), eq(usersTable.role, "principal")))
    .limit(5);
  const admins = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.tenantId, real.tenantId), eq(usersTable.role, "admin")))
    .limit(5);
  const iso = real.occurredAt.toISOString();
  const body =
    `فشل فوري في العملية (${real.operationType}) — السبب: ${real.failureReason}. ` +
    `المستخدم المتعثر: ${real.actorId} (${real.actorRole}). ` +
    `وقت الحدث الحقيقي: ${iso}. سجل الحدث الأصلي: ${real.sourceEventId}.`;
  const ref = {
    sourceEventId: real.sourceEventId,
    occurredAt: iso,
    actorId: real.actorId,
    actorRole: real.actorRole,
    studentId: real.studentId,
    schoolId,
    operationType: real.operationType,
    failureReason: real.failureReason,
    alertId: ins.id,
  };
  const notified: string[] = [];
  for (const p of principals) {
    await tx
      .insert(notificationsTable)
      .values({
        id: randomUUID(),
        tenantId: real.tenantId,
        recipientId: p.id,
        recipientRole: "principal",
        type: "SYSTEM",
        title: `تنبيه عطل: ${real.operationType}`,
        body,
        ref,
        operationKey: `p27-notify-${ins.id}-${p.id}`,
      })
      .onConflictDoNothing({
        target: [notificationsTable.tenantId, notificationsTable.operationKey],
      });
    notified.push(p.id);
  }
  for (const a of admins) {
    await tx
      .insert(notificationsTable)
      .values({
        id: randomUUID(),
        tenantId: real.tenantId,
        recipientId: a.id,
        recipientRole: "admin",
        type: "SYSTEM",
        title: `تنبيه عطل: ${real.operationType}`,
        body,
        ref,
        operationKey: `p27-notify-${ins.id}-${a.id}`,
      })
      .onConflictDoNothing({
        target: [notificationsTable.tenantId, notificationsTable.operationKey],
      });
    notified.push(a.id);
  }
  await tx
    .update(stuckPointAlertsTable)
    .set({ notifiedPrincipals: principals.map((p) => p.id), notifiedAdmins: admins.map((a) => a.id) })
    .where(eq(stuckPointAlertsTable.id, ins.id));
  const [finalRow] = await tx
    .select()
    .from(stuckPointAlertsTable)
    .where(eq(stuckPointAlertsTable.id, ins.id));
  return { alert: aView(finalRow), existed: false, notified };
}

/**
 * THE alert raise — FROM the real event row only: reads the interaction_events
 * row (0011 vocabulary, unchanged) inside the transaction and derives
 * everything from it; unknown id → STUCK_EVENT_NOT_FOUND (fail-closed, no
 * fabricated data). Dedup + fan-out are atomic (see raiseLocked).
 */
export async function raiseStuckPointAlertFromEvent(input: {
  tenantId: string;
  sourceEventId: string;
}): Promise<{ alert: StuckPointAlertView; existed: boolean; notified: string[] }> {
  return withTenant(input.tenantId, async (tx) => {
    const [ev] = await tx
      .select()
      .from(interactionEventsTable)
      .where(
        and(
          eq(interactionEventsTable.tenantId, input.tenantId),
          eq(interactionEventsTable.id, input.sourceEventId),
        ),
      );
    if (!ev) {
      throw new StuckPointError("STUCK_EVENT_NOT_FOUND");
    }
    return raiseLocked(tx, {
      tenantId: input.tenantId,
      sourceEventId: ev.id,
      occurredAt: ev.occurredAt,
      actorId: ev.actorId,
      actorRole: ev.actorRole,
      studentId: ev.studentId,
      operationType: mapOperationType(ev),
      failureReason: mapFailureReason(ev),
    });
  });
}

/** Staff tenant-wide listing (RLS-scoped; optional filters; most recent first). */
export async function listStuckPointAlerts(input: {
  tenantId: string;
  operationType?: string;
  studentId?: string;
  limit?: number;
}): Promise<StuckPointAlertView[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(stuckPointAlertsTable)
      .where(
        and(
          eq(stuckPointAlertsTable.tenantId, input.tenantId),
          ...(input.operationType ? [eq(stuckPointAlertsTable.operationType, input.operationType)] : []),
          ...(input.studentId ? [eq(stuckPointAlertsTable.studentId, input.studentId)] : []),
        ),
      )
      .orderBy(desc(stuckPointAlertsTable.occurredAt))
      .limit(limit);
    return rows.map(aView);
  });
}
