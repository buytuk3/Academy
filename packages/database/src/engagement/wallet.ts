/**
 * PHASE-11 — Wallet/points canonical capability (DEV-005 baseline). SELECT +
 * tightly-scoped write (credit) inside withTenant → RLS. Idempotency is
 * DATABASE-backed ((tenant_id, operation_key) UNIQUE — CORE-05/06/07 style).
 * Badges / points-store purchases are NOT in scope (deferred, ADR-034).
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../client.js";
import { withTenant } from "../tenancy.js";
import { studentsTable, walletAccountsTable, walletLedgerTable } from "../schema/index.js";
import { AuthCapabilityError } from "../auth/session.js";

export type WalletView = {
  studentId: string;
  balance: number;
  ledger: { id: string; delta: number; reason: string; createdAt: Date }[];
};

export async function getWalletView(tenantId: string, studentId: string): Promise<WalletView> {
  return withTenant(tenantId, async (tx) => {
    let [account] = await tx
      .select()
      .from(walletAccountsTable)
      .where(and(eq(walletAccountsTable.tenantId, tenantId), eq(walletAccountsTable.studentId, studentId)))
      .limit(1);
    if (!account) {
      [account] = await tx
        .insert(walletAccountsTable)
        .values({ id: crypto.randomUUID(), tenantId, studentId })
        .returning();
    }
    const ledger = await tx
      .select({ id: walletLedgerTable.id, delta: walletLedgerTable.delta, reason: walletLedgerTable.reason, createdAt: walletLedgerTable.createdAt })
      .from(walletLedgerTable)
      .where(and(eq(walletLedgerTable.tenantId, tenantId), eq(walletLedgerTable.studentId, studentId)))
      .orderBy(desc(walletLedgerTable.createdAt))
      .limit(50);
    return { studentId, balance: account.balance, ledger };
  });
}

export type CreditResult = { balance: number; created: boolean };

/** Staff-only credit (router enforces roles). points: 1..100000. Idempotent on operationKey. */
export async function creditWallet(input: {
  tenantId: string; actorId: string; studentId: string; points: number; reason: string; operationKey: string;
}): Promise<CreditResult> {
  const { tenantId, actorId, studentId, points, reason, operationKey } = input;
  if (!Number.isInteger(points) || points < 1 || points > 100000) {
    throw new AuthCapabilityError(400, "INVALID_POINTS");
  }
  if (!reason.trim()) throw new AuthCapabilityError(400, "REASON_REQUIRED");
  return withTenant(tenantId, async (tx) => {
    // The student MUST belong to the caller's tenant (cross-tenant credit →
    // 404 STUDENT_NOT_FOUND_IN_TENANT, existence-hiding — never create a
    // wallet for a foreign-tenant student).
    const [student] = await tx
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)))
      .limit(1);
    if (!student) throw new AuthCapabilityError(404, "STUDENT_NOT_FOUND_IN_TENANT");
    let [account] = await tx
      .select()
      .from(walletAccountsTable)
      .where(and(eq(walletAccountsTable.tenantId, tenantId), eq(walletAccountsTable.studentId, studentId)))
      .limit(1);
    if (!account) {
      [account] = await tx
        .insert(walletAccountsTable)
        .values({ id: crypto.randomUUID(), tenantId, studentId })
        .returning();
    }
    const inserted = await tx
      .insert(walletLedgerTable)
      .values({
        id: crypto.randomUUID(), tenantId, walletId: account.id, studentId,
        delta: points, reason: reason.trim(), actorId, operationKey,
      })
      .onConflictDoNothing({ target: [walletLedgerTable.tenantId, walletLedgerTable.operationKey] })
      .returning();
    if (inserted.length > 0) {
      const [updated] = await tx
        .update(walletAccountsTable)
        .set({ balance: account.balance + points })
        .where(eq(walletAccountsTable.id, account.id))
        .returning({ balance: walletAccountsTable.balance });
      return { balance: updated.balance, created: true };
    }
    // Idempotent replay: same operationKey → return the CURRENT balance, no double credit.
    const [fresh] = await tx
      .select({ balance: walletAccountsTable.balance })
      .from(walletAccountsTable)
      .where(eq(walletAccountsTable.id, account.id))
      .limit(1);
    return { balance: fresh.balance, created: false };
  });
}
