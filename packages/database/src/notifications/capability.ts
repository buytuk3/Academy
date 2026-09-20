/**
 * PHASE-24 — canonical NOTIFICATIONS capability (governing doc §5.2.4).
 * ALL SQL lives here (Architecture Contract). Every write/read runs inside
 * withTenant (0007 RLS mechanism — fail-closed).
 *
 * NOTIFICATION CENTER — the P15-4-proven atomic patterns with idempotency:
 *   • CREATE: (tenant, operation_key) UNIQUE — a replay returns the
 *     EXISTING notification with NO duplicate row;
 *   • MARK-READ: ONE conditional UPDATE (read_at IS NULL inside the WHERE —
 *     the CAS pattern) with the read key persisted inside the same
 *     statement; parallel + replay converge (changed=false, existed=true);
 *   • PREFS: upsert by UNIQUE(tenant,user) — naturally idempotent.
 * REUSE-FIRST (DEV-024): transports (WebSocket/email/FCM) are deferred —
 * ZERO new dependencies (ADR-045).
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import { notificationsTable, notificationPrefsTable, usersTable } from "../schema/index.js";

export class NotificationCenterError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "NotificationCenterError";
    this.code = code;
  }
}

export type NotificationType = "GENERAL" | "ACADEMIC" | "BEHAVIORAL" | "SUPPORT" | "SYSTEM";
export type NotificationChannel = "IN_APP" | "EMAIL" | "PUSH";

export interface NotificationPrefs {
  channels: NotificationChannel[];
  muted: boolean;
}

export interface NotificationView {
  id: string;
  recipientId: string;
  recipientRole: string;
  type: NotificationType;
  title: string;
  body: string;
  ref: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

export interface PrefsView {
  userId: string;
  prefs: NotificationPrefs;
  updatedAt: Date;
}

const nView = (r: typeof notificationsTable.$inferSelect): NotificationView => ({
  id: r.id,
  recipientId: r.recipientId,
  recipientRole: r.recipientRole,
  type: r.type as NotificationType,
  title: r.title,
  body: r.body,
  ref: (r.ref ?? {}) as Record<string, unknown>,
  readAt: r.readAt,
  createdAt: r.createdAt,
});

const pView = (r: typeof notificationPrefsTable.$inferSelect): PrefsView => ({
  userId: r.userId,
  prefs: r.prefs as NotificationPrefs,
  updatedAt: r.updatedAt,
});

/** §5.2.4: staff creates a notification for a tenant user (idempotent). */
export async function createNotification(input: {
  tenantId: string;
  recipientId: string;
  recipientRole: string;
  type: NotificationType;
  title: string;
  body: string;
  ref?: Record<string, unknown>;
  operationKey: string;
}): Promise<{ notification: NotificationView; existed: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const dup = await tx
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.tenantId, input.tenantId),
          eq(notificationsTable.operationKey, input.operationKey),
        ),
      );
    if (dup[0]) {
      return { notification: nView(dup[0]), existed: true };
    }
    // fail-closed recipient validation: the recipient must be a user of the
    // SAME tenant (no cross-tenant targeting even by a buggy staff client).
    const [recipient] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.id, input.recipientId), eq(usersTable.tenantId, input.tenantId)));
    if (!recipient) {
      throw new NotificationCenterError("RECIPIENT_NOT_FOUND");
    }
    const [row] = await tx
      .insert(notificationsTable)
      .values({
        id: randomUUID(),
        tenantId: input.tenantId,
        recipientId: input.recipientId,
        recipientRole: input.recipientRole,
        type: input.type,
        title: input.title,
        body: input.body,
        ref: input.ref ?? {},
        operationKey: input.operationKey,
      })
      .returning();
    return { notification: nView(row), existed: false };
  });
}

/** Recipient-scoped list (most recent first). limit clamped 1..500 (default 100). */
export async function listNotifications(input: {
  tenantId: string;
  recipientId: string;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<NotificationView[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.tenantId, input.tenantId),
          eq(notificationsTable.recipientId, input.recipientId),
          ...(input.unreadOnly ? [isNull(notificationsTable.readAt)] : []),
        ),
      )
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit);
    return rows.map(nView);
  });
}

/** Staff tenant-wide listing (RLS-scoped to the tenant; optional recipient filter). */
export async function listTenantNotifications(input: {
  tenantId: string;
  recipientId?: string;
  limit?: number;
}): Promise<NotificationView[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.tenantId, input.tenantId),
          ...(input.recipientId ? [eq(notificationsTable.recipientId, input.recipientId)] : []),
        ),
      )
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit);
    return rows.map(nView);
  });
}

export async function getUnreadCount(input: {
  tenantId: string;
  recipientId: string;
}): Promise<number> {
  return withTenant(input.tenantId, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.tenantId, input.tenantId),
          eq(notificationsTable.recipientId, input.recipientId),
          isNull(notificationsTable.readAt),
        ),
      );
    return Number(row?.n ?? 0);
  });
}

/**
 * THE atomic mark-read (P15-4 CAS pattern): ONE conditional UPDATE — the
 * unread guard (read_at IS NULL) lives INSIDE the statement and the read
 * key is persisted in the same statement. No row updated → the row was
 * already read (existed=true, changed=false) or does not exist (404).
 */
export async function markNotificationRead(input: {
  tenantId: string;
  notificationId: string;
  recipientId: string;
  operationKey: string;
}): Promise<{ notification: NotificationView; changed: boolean; existed: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const [updated] = await tx
      .update(notificationsTable)
      .set({ readAt: new Date(), readOperationKey: input.operationKey })
      .where(
        and(
          eq(notificationsTable.tenantId, input.tenantId),
          eq(notificationsTable.id, input.notificationId),
          eq(notificationsTable.recipientId, input.recipientId),
          isNull(notificationsTable.readAt),
        ),
      )
      .returning();
    if (updated) {
      return { notification: nView(updated), changed: true, existed: false };
    }
    const [existing] = await tx
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.tenantId, input.tenantId),
          eq(notificationsTable.id, input.notificationId),
          eq(notificationsTable.recipientId, input.recipientId),
        ),
      );
    if (!existing) {
      throw new NotificationCenterError("NOTIFICATION_NOT_FOUND");
    }
    return { notification: nView(existing), changed: false, existed: true };
  });
}

/** §5.2.4 per-user channel prefs — upsert is naturally idempotent (UNIQUE(tenant,user)). */
export async function upsertNotificationPrefs(input: {
  tenantId: string;
  userId: string;
  prefs: NotificationPrefs;
}): Promise<PrefsView> {
  return withTenant(input.tenantId, async (tx) => {
    const [row] = await tx
      .insert(notificationPrefsTable)
      .values({
        id: randomUUID(),
        tenantId: input.tenantId,
        userId: input.userId,
        prefs: input.prefs,
      })
      .onConflictDoUpdate({
        target: [notificationPrefsTable.tenantId, notificationPrefsTable.userId],
        set: { prefs: input.prefs, updatedAt: new Date() },
      })
      .returning();
    return pView(row);
  });
}

export async function getNotificationPrefs(input: {
  tenantId: string;
  userId: string;
}): Promise<PrefsView | null> {
  return withTenant(input.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(notificationPrefsTable)
      .where(
        and(
          eq(notificationPrefsTable.tenantId, input.tenantId),
          eq(notificationPrefsTable.userId, input.userId),
        ),
      );
    return row ? pView(row) : null;
  });
}
