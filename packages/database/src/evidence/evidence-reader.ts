/**
 * CORE-03B — Evidence Reader (Core Platform ownership).
 *
 * The canonical READ surface for Evidence. Downstream layers (Assessment,
 * Diagnosis, Intervention, Mastery, Learning Intelligence) and the future
 * Student Learning Record (CORE-04) consume Evidence through this module —
 * the single longitudinal Evidence log. Nothing here duplicates evidence:
 * it reads the SAME canonical table the writer writes.
 *
 * Ownership: Evidence → Core Platform. SLR (Core Platform) will AGGREGATE
 * from this reader; it never re-stores a second copy of evidence.
 */
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../client.js";
import { evidenceTable, type Evidence, type EvidenceType } from "../schema/evidence.js";

export interface EvidenceQuery {
  tenantId: string;
  studentId: string;
  /** Filter by one of the eight canonical evidence kinds. */
  evidenceType?: EvidenceType;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

/** Central read primitive: per-student evidence, tenant-scoped, type-filterable. */
export async function listEvidenceForStudent(q: EvidenceQuery): Promise<Evidence[]> {
  if (!q.tenantId) throw new Error("TENANT_CONTEXT_MISSING");
  if (!q.studentId) throw new Error("STUDENT_CONTEXT_MISSING");
  const conditions = [eq(evidenceTable.tenantId, q.tenantId), eq(evidenceTable.studentId, q.studentId)];
  if (q.evidenceType) conditions.push(eq(evidenceTable.evidenceType, q.evidenceType));
  if (q.from) conditions.push(gte(evidenceTable.occurredAt, q.from));
  if (q.to) conditions.push(lte(evidenceTable.occurredAt, q.to));
  return db
    .select()
    .from(evidenceTable)
    .where(and(...conditions))
    .orderBy(desc(evidenceTable.occurredAt))
    .limit(q.limit ?? 100)
    .offset(q.offset ?? 0);
}

/** Total count for the SAME filters (contract pagination envelope — no row drain). */
export async function countEvidenceForStudent(q: Omit<EvidenceQuery, "limit" | "offset">): Promise<number> {
  if (!q.tenantId) throw new Error("TENANT_CONTEXT_MISSING");
  if (!q.studentId) throw new Error("STUDENT_CONTEXT_MISSING");
  const conditions = [eq(evidenceTable.tenantId, q.tenantId), eq(evidenceTable.studentId, q.studentId)];
  if (q.evidenceType) conditions.push(eq(evidenceTable.evidenceType, q.evidenceType));
  if (q.from) conditions.push(gte(evidenceTable.occurredAt, q.from));
  if (q.to) conditions.push(lte(evidenceTable.occurredAt, q.to));
  const [{ value }] = await db.select({ value: count() }).from(evidenceTable).where(and(...conditions));
  return value;
}

/**
 * CORE-05 boundary helper — evidence CONSUMERS (engines, runtime adapters)
 * resolve the canonical row by its idempotent operationKey through this
 * reader — never by importing the evidence table directly (no engine owns
 * evidence storage; the writer + reader are the only core surfaces).
 */
export async function findEvidenceByOperationKey(q: { tenantId: string; operationKey: string }): Promise<Evidence | null> {
  if (!q.tenantId) throw new Error("TENANT_CONTEXT_MISSING");
  const [row] = await db
    .select()
    .from(evidenceTable)
    .where(and(eq(evidenceTable.tenantId, q.tenantId), eq(evidenceTable.operationKey, q.operationKey)))
    .limit(1);
  return row ?? null;
}

/**
 * Resolves the longitudinal chain rooted at a given evidence row, in
 * root→leaf order (e.g. diagnosis → intervention → reassessment → outcome).
 * Chains are built by REFERENCE (in_response_to_id) — no evidence content is
 * ever duplicated.
 */
export async function getEvidenceChain(q: { tenantId: string; evidenceId: string }): Promise<Evidence[]> {
  if (!q.tenantId) throw new Error("TENANT_CONTEXT_MISSING");
  const chain: Evidence[] = [];
  let currentId: string | null = q.evidenceId;
  while (currentId) {
    const [row] = await db
      .select()
      .from(evidenceTable)
      .where(and(eq(evidenceTable.id, currentId), eq(evidenceTable.tenantId, q.tenantId)))
      .limit(1);
    if (!row) break;
    chain.unshift(row);
    currentId = row.inResponseToId ?? null;
  }
  return chain;
}
