/**
 * E4/P0 — Mastery READ capability over mastery_records (SELECT ONLY).
 * mastery_records has exactly ONE writer today: the reading analyze processor
 * (upsert on student+passage). This adds NO second writer and NO new table —
 * it only exposes the existing rows read-only for the Student Dashboard /
 * Mastery View. Generalizing the WRITE to other engines = ACR-E4-001 (pending
 * owner approval, NOT implemented here).
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../client.js";
import { masteryRecordsTable } from "../schema/reading.js";

export interface MasteryRecordView {
  passageId: string;
  level: string;
  score: number;
  attempts: number;
  trend: string | null;
  updatedAt: string;
}

export async function listMasteryRecords(tenantId: string, studentId: string, limit = 50): Promise<MasteryRecordView[]> {
  if (!tenantId) throw new Error("TENANT_CONTEXT_MISSING");
  if (!studentId) throw new Error("STUDENT_CONTEXT_MISSING");
  const rows = await db
    .select()
    .from(masteryRecordsTable)
    .where(and(eq(masteryRecordsTable.tenantId, tenantId), eq(masteryRecordsTable.studentId, studentId)))
    .orderBy(desc(masteryRecordsTable.updatedAt))
    .limit(Math.min(limit, 200));
  return rows.map((m) => ({
    passageId: m.passageId,
    level: m.level,
    score: m.score,
    attempts: m.attempts,
    trend: m.trend ?? null,
    updatedAt: new Date(m.updatedAt).toISOString(),
  }));
}
