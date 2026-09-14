/**
 * CORE-12 - Student Pattern detection (deterministic rules; owner
 * packages/intelligence). Pure read-only: builds patterns over Evidence rows +
 * Learner Model (injected readers). Writes NOTHING, creates NO evidence/SLR
 * copy, no migrations. TypeFilter on evidenceType keeps shape checks local.
 */
import { buildLearnerModel, listEvidenceForStudent } from "@workspace/db";
import type { Evidence } from "@workspace/db";
import { bucketMistakes, mistakePattern, spanDays } from "./signals.js";
import type { EvidenceRow, EvidenceReader } from "./intelligence.js";
import {
  DEFAULT_PATTERN_CONFIG,
  type CurriculumContext,
  type PatternConfig,
  type PatternPersistence,
  type StudentPattern,
} from "./pattern-contracts.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BuildPatternArgs {
  tenantId: string;
  studentId: string;
  evidenceReader?: EvidenceReader;
  learnerBuilder?: (q: { tenantId: string; studentId: string }) => Promise<import("@workspace/db").LearnerModel | null>;
  config?: Partial<PatternConfig>;
  curriculumContext?: CurriculumContext;
  now?: Date;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function distinctSessions(rows: EvidenceLike[], subject: string, dimension: string): number {
  const matching =
    dimension === "response-speed"
      ? rows.filter((r) => r.subject === subject && typeof (r as { durationMs?: unknown }).durationMs === "number")
      : rows.filter((r) => r.subject === subject);
  const set = new Set<string>();
  for (const r of matching) if (r.sessionId) set.add(r.sessionId);
  return set.size;
}

interface EvidenceLike {
  id: string;
  occurredAt: Date;
  sessionId: string | null;
  subject: string | null;
  evidenceType: string;
  response: unknown;
}

function toEvidenceLike(rows: EvidenceRow[]): EvidenceLike[] {
  return rows.map((r) => ({ id: r.id, occurredAt: r.occurredAt, sessionId: r.sessionId, subject: r.subject, evidenceType: r.evidenceType, response: r.response }));
}

export async function buildStudentPatterns(args: BuildPatternArgs): Promise<StudentPattern[]> {
  const { tenantId, studentId } = args;
  if (!tenantId) throw new Error("TENANT_CONTEXT_MISSING");
  if (!studentId) throw new Error("STUDENT_CONTEXT_MISSING");
  if (!UUID_RE.test(tenantId)) throw new Error("INVALID_TENANT_ID");
  if (!UUID_RE.test(studentId)) throw new Error("INVALID_STUDENT_ID");
  const cfg: PatternConfig = { ...DEFAULT_PATTERN_CONFIG, ...(args.config ?? {}) };
  const cc: CurriculumContext = args.curriculumContext ?? {};
  const reader = args.evidenceReader ?? (listEvidenceForStudent as unknown as EvidenceReader);
  const rows = (await reader({ tenantId, studentId, limit: 1000 })) as EvidenceRow[];
  const like = toEvidenceLike(rows);
  const learnerBuilder = args.learnerBuilder ?? buildLearnerModel;
  const learner = await learnerBuilder({ tenantId, studentId }).catch(() => null);
  const patterns: StudentPattern[] = [];
  const seen = new Set<string>();

  const push = (p: Omit<StudentPattern, "curriculumContext">) => {
    if (seen.has(p.patternId)) return;
    seen.add(p.patternId);
    patterns.push({ ...p, curriculumContext: cc });
  };

  if (learner) {
    for (const d of learner.dimensions) {
      const key = d.subject + ":" + d.dimension;
      const id = (t: string) => "pattern:" + tenantId + ":" + studentId + ":" + t + ":" + key;
      const sessions = distinctSessions(like, d.subject, d.dimension);
      const span = spanDays(d.from, d.to);
      // PERFORMANCE
      if (d.confidence >= cfg.minConfidence && (d.level === "strong" || d.level === "improving")) {
        push({
          patternId: id("PERFORMANCE_PATTERN"), tenantId, studentId, subject: d.subject, skill: d.skill, dimension: d.dimension,
          patternType: "PERFORMANCE_PATTERN", persistence: "N/A", firstSeenAt: d.from, lastSeenAt: d.to,
          evidenceRefs: d.evidenceRefs, evidenceCount: d.sampleCount, sessionCount: sessions, spanDays: span,
          confidence: d.confidence, detectionRule: "performance:level=" + d.level,
          explanation: "RULE: " + d.level + " performance on " + d.dimension + " (" + d.subject + ") with " + d.sampleCount + " samples; " + d.reason,
          source: "RULE", status: "active",
        });
      }
      if (d.confidence >= cfg.minConfidence && (d.level === "weak" || d.level === "declining")) {
        push({
          patternId: id("PERFORMANCE_PATTERN"), tenantId, studentId, subject: d.subject, skill: d.skill, dimension: d.dimension,
          patternType: "PERFORMANCE_PATTERN", persistence: "N/A", firstSeenAt: d.from, lastSeenAt: d.to,
          evidenceRefs: d.evidenceRefs, evidenceCount: d.sampleCount, sessionCount: sessions, spanDays: span,
          confidence: d.confidence, detectionRule: "performance:level=" + d.level,
          explanation: "RULE: " + d.level + " performance on " + d.dimension + " (" + d.subject + ") with " + d.sampleCount + " samples; " + d.reason,
          source: "RULE", status: "active",
        });
      }
      // SPEED
      if (d.dimension === "response-speed" && d.level === "slow") {
        const persistent = span >= cfg.slowSpanDays;
        push({
          patternId: id("SPEED_PATTERN"), tenantId, studentId, subject: d.subject, skill: d.skill, dimension: d.dimension,
          patternType: "SPEED_PATTERN", persistence: persistent ? "PERSISTENT" : "TEMPORARY",
          firstSeenAt: d.from, lastSeenAt: d.to, evidenceRefs: d.evidenceRefs, evidenceCount: d.sampleCount,
          sessionCount: sessions, spanDays: span, confidence: Math.min(d.confidence, 0.85),
          detectionRule: "speed:slow:" + (persistent ? "persistent(span>=" + cfg.slowSpanDays + "d)" : "temporary(span<" + cfg.slowSpanDays + "d)"),
          explanation: "RULE: response speed slow over " + span + " day(s) - " + (persistent ? "persistent, not a one-off" : "temporary window only") + " (" + d.sampleCount + " samples)",
          source: "RULE", status: persistent ? "active" : "temporary",
        });
      }
      // IMPROVEMENT / REGRESSION
      if (d.sampleCount >= cfg.trendSamples && d.trend === "IMPROVING") {
        push({
          patternId: id("IMPROVEMENT_PATTERN"), tenantId, studentId, subject: d.subject, skill: d.skill, dimension: d.dimension,
          patternType: "IMPROVEMENT_PATTERN", persistence: "N/A", firstSeenAt: d.from, lastSeenAt: d.to,
          evidenceRefs: d.evidenceRefs, evidenceCount: d.sampleCount, sessionCount: sessions, spanDays: span,
          confidence: d.confidence, detectionRule: "improvement:trend=IMPROVING",
          explanation: "RULE: " + d.dimension + " (" + d.subject + ") improving over " + d.sampleCount + " samples; " + d.reason,
          source: "RULE", status: "active",
        });
      }
      if (d.sampleCount >= cfg.trendSamples && d.trend === "DECLINING") {
        push({
          patternId: id("REGRESSION_PATTERN"), tenantId, studentId, subject: d.subject, skill: d.skill, dimension: d.dimension,
          patternType: "REGRESSION_PATTERN", persistence: "N/A", firstSeenAt: d.from, lastSeenAt: d.to,
          evidenceRefs: d.evidenceRefs, evidenceCount: d.sampleCount, sessionCount: sessions, spanDays: span,
          confidence: d.confidence, detectionRule: "regression:trend=DECLINING",
          explanation: "RULE: " + d.dimension + " (" + d.subject + ") declining over " + d.sampleCount + " samples; " + d.reason,
          source: "RULE", status: "active",
        });
      }
      // INSUFFICIENT EVIDENCE
      if (d.sampleCount === 0 || d.sampleCount < cfg.minSamples) {
        const nsamples = d.sampleCount;
        push({
          patternId: id("INSUFFICIENT_EVIDENCE_PATTERN"), tenantId, studentId, subject: d.subject, skill: d.skill, dimension: d.dimension,
          patternType: "INSUFFICIENT_EVIDENCE_PATTERN", persistence: "N/A", firstSeenAt: d.from, lastSeenAt: d.to,
          evidenceRefs: d.evidenceRefs, evidenceCount: nsamples, sessionCount: sessions, spanDays: span,
          confidence: 0, detectionRule: "insufficient:sampleCount=" + nsamples + "(<" + cfg.minSamples + ")",
          explanation: "RULE: not enough evidence to interpret " + d.dimension + " (" + d.subject + ") - INSUFFICIENT_EVIDENCE, no guess made",
          source: "RULE", status: "insufficient",
        });
      }
    }
  }

  // PERSISTENCE (time/session-aware mistake patterns from evidence rows)
  for (const bucket of bucketMistakes(rows as never as Evidence[])) {
    const count = bucket.evidenceIds.length;
    const sessions = bucket.sessions.size;
    const persistent = count >= cfg.minMistakeCount && sessions >= cfg.minMistakeSessions;
    const subject = bucket.skill ? bucket.skill.split(".")[0] : "reading";
    const skill = bucket.skill ?? subject + ".skill";
    const dimension = bucket.errorType ?? "accuracy";
    const id = "pattern:" + tenantId + ":" + studentId + ":PERSISTENCE_PATTERN:" + subject + ":" + bucket.key;
    const pattern = mistakePattern(bucket, { minMistakeCount: cfg.minMistakeCount, minSessionsForPattern: cfg.minMistakeSessions } as never);
    push({
      patternId: id, tenantId, studentId, subject, skill, dimension,
      patternType: "PERSISTENCE_PATTERN", persistence: persistent ? "PERSISTENT" : "TEMPORARY",
      firstSeenAt: bucket.firstSeenAt, lastSeenAt: bucket.lastSeenAt,
      evidenceRefs: bucket.evidenceIds, evidenceCount: count, sessionCount: sessions,
      spanDays: spanDays(bucket.firstSeenAt, bucket.lastSeenAt),
      confidence: pattern.confidence, detectionRule: "persistence:" + (persistent ? "persistent(count>=" + cfg.minMistakeCount + ",sessions>=" + cfg.minMistakeSessions + ")" : "temporary(single-session)"),
      explanation: pattern.explanation,
      source: "RULE", status: persistent ? "active" : "temporary",
    });
  }

  return patterns;
}

export function patternPriority(pattern: StudentPattern): number {
  if (pattern.patternType === "REGRESSION_PATTERN") return 40;
  if (pattern.patternType === "PERSISTENCE_PATTERN") return pattern.persistence === "PERSISTENT" ? 35 : 1;
  if (pattern.patternType === "PERFORMANCE_PATTERN") return pattern.explanation.includes("weak") || pattern.explanation.includes("declining") ? 30 : 10;
  if (pattern.patternType === "SPEED_PATTERN") return pattern.persistence === "PERSISTENT" ? 25 : 2;
  if (pattern.patternType === "INSUFFICIENT_EVIDENCE_PATTERN") return 15;
  if (pattern.patternType === "IMPROVEMENT_PATTERN") return 5;
  return 0;
}
