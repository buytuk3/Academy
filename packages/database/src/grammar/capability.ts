/**
 * PHASE-20 — canonical GRAMMAR-PARSING-ENGINE capability (governing doc
 * v2.1 §3.7). ALL SQL lives here (Architecture Contract). Every write/read
 * runs inside withTenant (0007 RLS mechanism — fail-closed). The parse
 * itself is the REAL deterministic rules engine (grammar/parser.ts — pure
 * TS, no external dependency, ADR-041); each parse is recorded ONCE per
 * (tenant, operation_key) — idempotent replays return the SAME row.
 */
import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import { grammarParsingsTable } from "../schema/index.js";
import { parseArabicGrammar, type GrammarToken } from "./parser.js";

export class GrammarParsingError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "GrammarParsingError";
    this.code = code;
  }
}

export interface GrammarParsingView {
  id: string;
  studentId: string | null;
  inputText: string;
  tokens: GrammarToken[];
  tokenCount: number;
  reviewCount: number;
  engineVersion: string;
  createdAt: Date;
}

export interface ParseAndRecordResult {
  parsing: GrammarParsingView;
  existed: boolean;
}

const toView = (r: typeof grammarParsingsTable.$inferSelect): GrammarParsingView => ({
  id: r.id,
  studentId: r.studentId,
  inputText: r.inputText,
  tokens: (r.tokens ?? []) as unknown as GrammarToken[],
  tokenCount: r.tokenCount,
  reviewCount: r.reviewCount,
  engineVersion: r.engineVersion,
  createdAt: r.createdAt,
});

/**
 * Run the REAL i'rab engine over `inputText` and record the result ONCE
 * (idempotent by (tenant, operation_key)). The parse is deterministic:
 * the same text always yields the same tokens for the same engine version.
 */
export async function parseAndRecord(q: {
  tenantId: string;
  studentId?: string;
  inputText: string;
  operationKey: string;
}): Promise<ParseAndRecordResult> {
  return withTenant(q.tenantId, async (tx) => {
    const dup = await tx
      .select()
      .from(grammarParsingsTable)
      .where(
        and(
          eq(grammarParsingsTable.tenantId, q.tenantId),
          eq(grammarParsingsTable.operationKey, q.operationKey),
        ),
      );
    if (dup[0]) {
      return { parsing: toView(dup[0]), existed: true };
    }
    const result = parseArabicGrammar(q.inputText);
    const [row] = await tx
      .insert(grammarParsingsTable)
      .values({
        id: crypto.randomUUID(),
        tenantId: q.tenantId,
        studentId: q.studentId ?? null,
        inputText: q.inputText,
        tokens: result.tokens as unknown as Record<string, unknown>[],
        tokenCount: result.tokenCount,
        reviewCount: result.reviewCount,
        engineVersion: result.engineVersion,
        operationKey: q.operationKey,
      })
      .returning();
    return { parsing: toView(row), existed: false };
  });
}

/** Read one parsing inside the tenant (RLS fail-closed; null → 404 upstream). */
export async function getGrammarParsing(q: {
  tenantId: string;
  parsingId: string;
}): Promise<GrammarParsingView | null> {
  return withTenant(q.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(grammarParsingsTable)
      .where(
        and(
          eq(grammarParsingsTable.tenantId, q.tenantId),
          eq(grammarParsingsTable.id, q.parsingId),
        ),
      );
    return row ? toView(row) : null;
  });
}

/** Student's own parses (tenant-scoped by RLS; desc by created_at). */
export async function listGrammarParsings(q: {
  tenantId: string;
  studentId?: string;
  limit?: number;
}): Promise<GrammarParsingView[]> {
  return withTenant(q.tenantId, async (tx) => {
    const filters = [eq(grammarParsingsTable.tenantId, q.tenantId)];
    if (q.studentId) filters.push(eq(grammarParsingsTable.studentId, q.studentId));
    const rows = await tx
      .select()
      .from(grammarParsingsTable)
      .where(and(...filters))
      .orderBy(desc(grammarParsingsTable.createdAt))
      .limit(Math.min(Math.max(q.limit ?? 100, 1), 500));
    return rows.map(toView);
  });
}

// re-export the parser contract types (the index wiring imports them from here)
export type { GrammarToken, GrammarParseResult } from "./parser.js";
