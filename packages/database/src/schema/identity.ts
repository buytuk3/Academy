/**
 * CORE-18 (ADR-002 / R-009) — Global Student Identity.
 *
 * 18-A: the identity is a MINIMAL reference node — a platform-minted UUID
 * (identityId) and a creation timestamp. NOTHING else: no grades, no evidence,
 * no mastery, no diagnosis, no intervention, no reading data, no audio, no
 * learning scores, no teacher reports. It is NOT the Student Learning Record
 * and MUST never become one. No email, no phone, no mutable external
 * identifier (identity ≠ account ≠ contact field).
 *
 * `operationKey` is operational idempotency metadata (18-M), not student data:
 * retries of "create identity" collapse to one logical identity.
 *
 * Layering: Global Identity → Tenant/School Membership → Tenant-owned Student
 * Record → Tenant-owned Evidence.
 *
 * Ownership: core-platform (OWNERSHIP["student-identity"]).
 */
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const studentIdentitiesTable = pgTable(
  "student_identities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // 18-M: one identity per logical creation operation (retry-safe).
    opUniq: uniqueIndex("student_identities_operation_key_uniq").on(t.operationKey),
  }),
);

export type StudentIdentity = typeof studentIdentitiesTable.$inferSelect;
