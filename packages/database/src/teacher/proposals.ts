/**
 * E1 — Teacher Runtime reads over Learning-Loop STATE (Core Platform).
 * READ-ONLY capabilities over intervention_proposals (loop state table).
 * Evidence stays canonical and untouched — these never read or write Evidence;
 * Evidence visibility flows exclusively through listEvidenceForStudent.
 * Tenant isolation is NON-NEGOTIABLE: every query is tenant-scoped.
 * Follows the CORE-27 B3-02 canonical pattern: select().from().where().limit().
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../client.js";
import { interventionProposalsTable } from "../schema/learning-loop.js";
import type { InterventionProposal } from "../schema/learning-loop.js";

/** Fetches ONE proposal scoped to its tenant. Cross-tenant ids read as null. */
export async function getTeacherProposal(tenantId: string, proposalId: string): Promise<InterventionProposal | null> {
  const [row] = await db
    .select()
    .from(interventionProposalsTable)
    .where(and(eq(interventionProposalsTable.id, proposalId), eq(interventionProposalsTable.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export interface PendingProposalFilters {
  studentId?: string;
  skill?: string;
  limit?: number; // default 50, hard cap 200
}

/** Teacher Review Queue source: PENDING proposals awaiting a Teacher Decision. */
export async function listPendingProposals(tenantId: string, filters: PendingProposalFilters = {}): Promise<InterventionProposal[]> {
  const conditions = [
    eq(interventionProposalsTable.tenantId, tenantId),
    eq(interventionProposalsTable.status, "PENDING"),
  ];
  if (filters.studentId) conditions.push(eq(interventionProposalsTable.studentId, filters.studentId));
  if (filters.skill) conditions.push(eq(interventionProposalsTable.skill, filters.skill));
  return db
    .select()
    .from(interventionProposalsTable)
    .where(and(...conditions))
    .orderBy(desc(interventionProposalsTable.createdAt))
    .limit(Math.min(filters.limit ?? 50, 200));
}
