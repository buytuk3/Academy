/**
 * CORE-10 - intervention history reader (outcome-aware intelligence).
 *
 * History is DERIVED from canonical Evidence (outcome evidence rows) - no new
 * table, no evidence duplication. The reader is injected (HistoryReader) so a
 * production implementation can later join the learning-loop REFERENCE tables
 * (learning_diagnoses / intervention_proposals / learning_reassessments /
 * learning_outcomes) once a live database is available (OPEN
 * environment validation) without changing the package.
 */
import type { Evidence } from "@workspace/db";

export interface InterventionHistoryEntry {
  diagnosisId: string | null;
  interventionId: string | null;
  reassessmentId: string | null;
  outcome: string | null;
  skill: string | null;
  occurredAt: Date;
  evidenceRefs: string[];
}

export type HistoryReader = (q: { tenantId: string; studentId: string; rows: Evidence[] }) => Promise<InterventionHistoryEntry[]>;

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export const evidenceDerivedHistory: HistoryReader = async ({ rows }) =>
  rows
    .filter((r) => r.evidenceType === "outcome")
    .map((r) => {
      const resp = asRecord(r.response);
      const refs = Array.isArray(resp.evidenceRefs) ? resp.evidenceRefs.map(String) : [r.id];
      return {
        diagnosisId: str(resp.diagnosisId),
        interventionId: str(resp.interventionId),
        reassessmentId: str(resp.reassessmentId),
        outcome: str(resp.outcome),
        skill: str(resp.skill) ?? r.subject,
        occurredAt: r.occurredAt,
        evidenceRefs: refs,
      };
    })
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
