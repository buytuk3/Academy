/**
 * PHASE-11 — Messaging canonical capability (DEV-006 baseline: messages).
 * Same-tenant recipients only (cross-tenant → 404 RECIPIENT_NOT_IN_TENANT —
 * existence-hiding, same posture as STUDENT_NOT_FOUND_IN_TENANT). Idempotent
 * on (tenant_id, operation_key). Notifications: NOT in scope (ADR-034).
 */
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "../client.js";
import { withTenant } from "../tenancy.js";
import { messagesTable, usersTable } from "../schema/index.js";
import { AuthCapabilityError } from "../auth/session.js";

export type MessageView = {
  id: string; fromUserId: string; toUserId: string; body: string; createdAt: Date;
};

export async function sendMessage(input: {
  tenantId: string; senderId: string; recipientId: string; body: string; operationKey: string;
}): Promise<MessageView> {
  const { tenantId, senderId, recipientId, body, operationKey } = input;
  if (!body.trim() || body.length > 2000) throw new AuthCapabilityError(400, "INVALID_MESSAGE_BODY");
  return withTenant(tenantId, async (tx) => {
    const [recipient] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.id, recipientId), eq(usersTable.tenantId, tenantId)))
      .limit(1);
    if (!recipient) throw new AuthCapabilityError(404, "RECIPIENT_NOT_IN_TENANT");
    const [row] = await tx
      .insert(messagesTable)
      .values({
        id: crypto.randomUUID(), tenantId, senderId, recipientId,
        body: body.trim(), operationKey,
      })
      .onConflictDoNothing({ target: [messagesTable.tenantId, messagesTable.operationKey] })
      .returning();
    if (row) return { id: row.id, fromUserId: row.senderId, toUserId: row.recipientId, body: row.body, createdAt: row.createdAt };
    const [existing] = await tx
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.tenantId, tenantId), eq(messagesTable.operationKey, operationKey)))
      .limit(1);
    return { id: existing.id, fromUserId: existing.senderId, toUserId: existing.recipientId, body: existing.body, createdAt: existing.createdAt };
  });
}

export async function listMessagesForUser(tenantId: string, userId: string): Promise<MessageView[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: messagesTable.id, fromUserId: messagesTable.senderId, toUserId: messagesTable.recipientId,
        body: messagesTable.body, createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.tenantId, tenantId),
        or(eq(messagesTable.senderId, userId), eq(messagesTable.recipientId, userId)),
      ))
      .orderBy(desc(messagesTable.createdAt))
      .limit(100);
    return rows;
  });
}

