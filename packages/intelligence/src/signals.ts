/**
 * CORE-10 - time-aware, deterministic signal analysis (Layer 1 Rules).
 * Groups mistake evidence by skill/error-type across SESSIONS so a burst in
 * one session (TEMPORARY_EVENT) is never equal to the same mistake repeated
 * across many sessions (PERSISTENT_PATTERN). All counts/reasons are derived
 * from the injected evidence rows - no guesses.
 */
import type { Evidence } from "@workspace/db";
import type { IntelligenceConfig, IntelligenceSignalKind } from "./contracts.js";

export interface MistakeBucket {
  key: string;
  skill: string | null;
  errorType: string | null;
  dimension: string | null;
  evidenceIds: string[];
  sessions: Set<string>;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
}

export interface MistakePattern {
  signal: IntelligenceSignalKind;
  source: "RULE";
  confidence: number;
  explanation: string;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function bucketMistakes(rows: Evidence[]): MistakeBucket[] {
  const map = new Map<string, MistakeBucket>();
  for (const row of rows) {
    if (row.evidenceType !== "mistake") continue;
    const resp = asRecord(row.response);
    const skill = typeof resp.skill === "string" ? resp.skill : row.subject ?? null;
    const errorType = typeof resp.errorType === "string" ? resp.errorType : null;
    const dimension = typeof resp.dimension === "string" ? resp.dimension : null;
    const key = errorType ?? skill ?? "mistake";
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, skill, errorType, dimension, evidenceIds: [], sessions: new Set(), firstSeenAt: null, lastSeenAt: null };
      map.set(key, bucket);
    }
    bucket.evidenceIds.push(row.id);
    if (row.sessionId) bucket.sessions.add(row.sessionId);
    if (!bucket.firstSeenAt || row.occurredAt < bucket.firstSeenAt) bucket.firstSeenAt = row.occurredAt;
    if (!bucket.lastSeenAt || row.occurredAt > bucket.lastSeenAt) bucket.lastSeenAt = row.occurredAt;
  }
  return [...map.values()];
}

export function mistakePattern(bucket: MistakeBucket, config: IntelligenceConfig): MistakePattern {
  const count = bucket.evidenceIds.length;
  const sessions = bucket.sessions.size;
  const persistent = count >= config.minMistakeCount && sessions >= config.minSessionsForPattern;
  if (persistent) {
    const confidence = Math.round(Math.min(0.9, 0.5 + 0.05 * Math.min(count, 6) + 0.03 * Math.min(sessions - 1, 4)) * 100) / 100;
    return {
      signal: "PERSISTENT_PATTERN",
      source: "RULE",
      confidence,
      explanation:
        "RULE: same mistake pattern '" + bucket.key + "' observed " + count + " time(s) across " + sessions +
        " session(s) (min " + config.minMistakeCount + " / " + config.minSessionsForPattern + ") - persistent, not a one-off.",
    };
  }
  return {
    signal: "TEMPORARY_EVENT",
    source: "RULE",
    confidence: 0.3,
    explanation:
      "RULE: mistake pattern '" + bucket.key + "' observed " + count + " time(s) within a single session - temporary event, no diagnosis warranted yet.",
  };
}

export function spanDays(from: Date | null, to: Date | null): number {
  if (!from || !to) return 0;
  return Math.max(0, (to.getTime() - from.getTime()) / 86_400_000);
}
