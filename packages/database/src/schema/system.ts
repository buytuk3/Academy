import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.js";
import { usersTable } from "./users.js";

/** System tables: audit + refresh-token rotation + password reset flow. */
export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    metadata: text("metadata"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ tenantIdx: index("audit_logs_tenant_idx").on(t.tenantId) }),
);

/**
 * refresh_tokens — rotation-capable (ver 2 <-> C-A3).
 * Legacy api-server rows (tokenHash only) continue to work; new rows add
 * family_id/jti/token_version. Reuse detection: the latest family row must
 * match the presented jti, otherwise the family is revoked.
 */
export const refreshTokensTable = pgTable(
  "refresh_tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => usersTable.id),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
    tokenHash: text("token_hash").notNull(),
    familyId: text("family_id"),
    jti: text("jti"),
    tokenVersion: integer("token_version").default(2),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("refresh_tokens_user_idx").on(t.userId),
    familyIdx: index("refresh_tokens_family_idx").on(t.familyId),
  }),
);

export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => usersTable.id),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("password_reset_tokens_user_idx").on(t.userId),
    tokenHashIdx: index("password_reset_tokens_hash_idx").on(t.tokenHash),
  }),
);
