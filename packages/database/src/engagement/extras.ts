/**
 * PHASE-23 — canonical STUDENT-ENGAGEMENT-EXTRAS capability (governing doc
 * §5.2.3 + §3.10 renumbered: points-spend / notes / support). ALL SQL lives
 * here (Architecture Contract). Every write/read runs inside withTenant
 * (0007 RLS mechanism — fail-closed).
 *
 * REDEMPTION (§5.2.3 صرف النقاط) — the P15-4-proven atomic pattern with a
 * transactional idempotency guard:
 *   1. INSERT the redemption row FIRST (UNIQUE(tenant,operation_key) +
 *      ON CONFLICT DO NOTHING) — a replay returns the EXISTING redemption
 *      with NO second debit;
 *   2. then the SINGLE conditional debit UPDATE on the EXISTING
 *      wallet_accounts (balance >= cost) — an insufficient balance THROWS,
 *      rolling the whole transaction back (no phantom redemption row);
 *   3. parallel same-key calls converge (PostgreSQL ON CONFLICT semantics).
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import {
  pointRedemptionsTable,
  studentNotesTable,
  supportTicketsTable,
  walletAccountsTable,
} from "../schema/index.js";

export class EngagementExtrasError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "EngagementExtrasError";
    this.code = code;
  }
}

export interface RedemptionView {
  id: string;
  studentId: string;
  item: string;
  cost: number;
  createdAt: Date;
}

export interface NoteView {
  id: string;
  studentId: string;
  authorId: string;
  category: "ACADEMIC" | "BEHAVIORAL" | "GENERAL";
  body: string;
  createdAt: Date;
}

export interface TicketView {
  id: string;
  createdBy: string;
  creatorRole: string;
  subject: string;
  body: string;
  status: "OPEN" | "RESOLVED";
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

const rView = (r: typeof pointRedemptionsTable.$inferSelect): RedemptionView => ({
  id: r.id, studentId: r.studentId, item: r.item, cost: r.cost, createdAt: r.createdAt,
});
const nView = (r: typeof studentNotesTable.$inferSelect): NoteView => ({
  id: r.id, studentId: r.studentId, authorId: r.authorId,
  category: r.category as NoteView["category"], body: r.body, createdAt: r.createdAt,
});
const tView = (r: typeof supportTicketsTable.$inferSelect): TicketView => ({
  id: r.id, createdBy: r.createdBy, creatorRole: r.creatorRole, subject: r.subject,
  body: r.body, status: r.status as TicketView["status"], resolvedBy: r.resolvedBy,
  resolvedAt: r.resolvedAt, createdAt: r.createdAt,
});

/** §5.2.3: redeem points for ONE item — atomic debit + idempotent ledger. */
export async function redeemPoints(input: {
  tenantId: string;
  studentId: string;
  item: string;
  cost: number;
  operationKey: string;
}): Promise<{ redemption: RedemptionView; balance: number; existed: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const dup = await tx
      .select()
      .from(pointRedemptionsTable)
      .where(
        and(
          eq(pointRedemptionsTable.tenantId, input.tenantId),
          eq(pointRedemptionsTable.operationKey, input.operationKey),
        ),
      );
    if (dup[0]) {
      const [acct] = await tx
        .select({ balance: walletAccountsTable.balance })
        .from(walletAccountsTable)
        .where(
          and(
            eq(walletAccountsTable.tenantId, input.tenantId),
            eq(walletAccountsTable.studentId, input.studentId),
          ),
        );
      return { redemption: rView(dup[0]), balance: acct?.balance ?? 0, existed: true };
    }
    const [red] = await tx
      .insert(pointRedemptionsTable)
      .values({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        studentId: input.studentId,
        item: input.item,
        cost: input.cost,
        operationKey: input.operationKey,
      })
      .onConflictDoNothing()
      .returning();
    if (!red) throw new EngagementExtrasError("REDEMPTION_IDEMPOTENCY_UNRESOLVED");
    // THE atomic debit (P15-4 pattern): ONE conditional UPDATE — the balance
    // guard (balance >= cost) lives INSIDE the statement; zero rows → THROW →
    // the whole tx (incl. the redemption row) rolls back.
    const [debited] = await tx
      .update(walletAccountsTable)
      .set({ balance: walletAccountsTable.balance - input.cost })
      .where(
        and(
          eq(walletAccountsTable.tenantId, input.tenantId),
          eq(walletAccountsTable.studentId, input.studentId),
          gte(walletAccountsTable.balance, input.cost),
        ),
      )
      .returning({ balance: walletAccountsTable.balance });
    if (!debited) {
      throw new EngagementExtrasError("INSUFFICIENT_BALANCE");
    }
    return { redemption: rView(red), balance: debited.balance, existed: false };
  });
}

/** Redemption history for ONE student (RLS-scoped). */
export async function listRedemptions(q: {
  tenantId: string;
  studentId: string;
}): Promise<RedemptionView[]> {
  return withTenant(q.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(pointRedemptionsTable)
      .where(
        and(
          eq(pointRedemptionsTable.tenantId, q.tenantId),
          eq(pointRedemptionsTable.studentId, q.studentId),
        ),
      )
      .orderBy(desc(pointRedemptionsTable.createdAt));
    return rows.map(rView);
  });
}

/** Staff adds a note about a student (idempotent by operation key). */
export async function addStudentNote(input: {
  tenantId: string;
  studentId: string;
  authorId: string;
  category: "ACADEMIC" | "BEHAVIORAL" | "GENERAL";
  body: string;
  operationKey: string;
}): Promise<{ note: NoteView; existed: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const dup = await tx
      .select()
      .from(studentNotesTable)
      .where(
        and(
          eq(studentNotesTable.tenantId, input.tenantId),
          eq(studentNotesTable.operationKey, input.operationKey),
        ),
      );
    if (dup[0]) return { note: nView(dup[0]), existed: true };
    const [row] = await tx
      .insert(studentNotesTable)
      .values({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        studentId: input.studentId,
        authorId: input.authorId,
        category: input.category,
        body: input.body,
        operationKey: input.operationKey,
      })
      .returning();
    return { note: nView(row), existed: false };
  });
}

/** Notes for ONE student (staff view) — RLS-scoped. */
export async function listStudentNotes(q: {
  tenantId: string;
  studentId: string;
}): Promise<NoteView[]> {
  return withTenant(q.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(studentNotesTable)
      .where(
        and(
          eq(studentNotesTable.tenantId, q.tenantId),
          eq(studentNotesTable.studentId, q.studentId),
        ),
      )
      .orderBy(desc(studentNotesTable.createdAt));
    return rows.map(nView);
  });
}

/** Any authenticated member opens a support ticket (idempotent). */
export async function createSupportTicket(input: {
  tenantId: string;
  createdBy: string;
  creatorRole: string;
  subject: string;
  body: string;
  operationKey: string;
}): Promise<{ ticket: TicketView; existed: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const dup = await tx
      .select()
      .from(supportTicketsTable)
      .where(
        and(
          eq(supportTicketsTable.tenantId, input.tenantId),
          eq(supportTicketsTable.operationKey, input.operationKey),
        ),
      );
    if (dup[0]) return { ticket: tView(dup[0]), existed: true };
    const [row] = await tx
      .insert(supportTicketsTable)
      .values({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        createdBy: input.createdBy,
        creatorRole: input.creatorRole,
        subject: input.subject,
        body: input.body,
        operationKey: input.operationKey,
      })
      .returning();
    return { ticket: tView(row), existed: false };
  });
}

/** Staff: all tenant tickets (RLS-scoped). */
export async function listSupportTickets(q: {
  tenantId: string;
  createdBy?: string;
}): Promise<TicketView[]> {
  return withTenant(q.tenantId, async (tx) => {
    const filters = [eq(supportTicketsTable.tenantId, q.tenantId)];
    if (q.createdBy) filters.push(eq(supportTicketsTable.createdBy, q.createdBy));
    const rows = await tx
      .select()
      .from(supportTicketsTable)
      .where(and(...filters))
      .orderBy(desc(supportTicketsTable.createdAt));
    return rows.map(tView);
  });
}

/**
 * Staff resolves a ticket — THE atomic CAS (P15-4 pattern): ONE conditional
 * UPDATE (OPEN → RESOLVED) with the resolve key persisted inside the same
 * statement; replays (same key) and parallel resolves converge.
 */
export async function resolveSupportTicket(input: {
  tenantId: string;
  ticketId: string;
  resolverId: string;
  operationKey: string;
}): Promise<{ ticket: TicketView; changed: boolean; existed: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const found = await tx
      .select()
      .from(supportTicketsTable)
      .where(
        and(
          eq(supportTicketsTable.tenantId, input.tenantId),
          eq(supportTicketsTable.id, input.ticketId),
        ),
      );
    const row = found[0];
    if (!row) throw new EngagementExtrasError("TICKET_NOT_FOUND");
    if (row.resolveOperationKey === input.operationKey) {
      return { ticket: tView(row), changed: false, existed: true };
    }
    const [upd] = await tx
      .update(supportTicketsTable)
      .set({
        status: "RESOLVED",
        resolvedBy: input.resolverId,
        resolvedAt: new Date(),
        resolveOperationKey: input.operationKey,
      })
      .where(
        and(
          eq(supportTicketsTable.id, row.id),
          eq(supportTicketsTable.status, "OPEN"),
        ),
      )
      .returning();
    if (upd) return { ticket: tView(upd), changed: true, existed: false };
    const [fresh] = await tx
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, row.id));
    return { ticket: tView(fresh), changed: false, existed: false };
  });
}
