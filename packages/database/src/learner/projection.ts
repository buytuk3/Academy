/**
 * CORE-09 - Multidimensional Learner Model projection (Core Platform).
 *
 * PURE read-only projection over canonical Evidence (Evidence Reader). It
 * NEVER writes: no recordEvidence, no db.insert, no learner table, no
 * migration. Learner identity = (tenantId, studentId); grade / curriculum /
 * school are CONTEXT SEGMENTS on a continuous timeline - grade promotion or
 * school change NEVER resets the profile.
 *
 * Architecturally DISTINCT: Subject (curriculum area) vs Skill (subject.skill)
 * vs Dimension (measured axis) vs EvidenceType (8 canonical kinds).
 * Insufficient evidence is a first-class result. Teacher and AI inputs are
 * surfaced as EXTERNAL interpretations - never merged into the rule-derived
 * level, never auto-converted into a teacher decision.
 *
 * ARCHITECTURE QUESTION (not decided here): school change ACROSS tenants.
 * Tenant isolation is enforced (build is keyed by tenantId + studentId), but
 * a student moving to a school in ANOTHER tenant needs a Tenant-Ownership
 * decision (identity transfer / record federation) out of CORE-09 scope.
 * See docs/ARCHITECTURE-QUESTIONS-CORE-09.md.
 */
import { listEvidenceForStudent } from "../evidence/evidence-reader.js";
import type { Evidence } from "../schema/evidence.js";
import {
  DEFAULT_LEARNER_MODEL_CONFIG,
  LEARNER_DIMENSION_REGISTRY,
  deriveLevel,
  deriveTrend,
  confidenceFor,
  normalizeValue,
  type DimensionDefinition,
  type LearnerModelConfig,
} from "./rules.js";
import type {
  DimensionInterpretation,
  DimensionSample,
  ExternalInterpretation,
  InterpretationSource,
  LearnerContextSegment,
  LearnerModel,
  LearnerSubject,
  Trend,
  DimensionLevel,
} from "./types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEACHER_SOURCE = "teacher";

export interface BuildLearnerModelArgs {
  tenantId: string;
  studentId: string;
  config?: Partial<LearnerModelConfig>;
  reader?: (q: { tenantId: string; studentId: string; limit?: number }) => Promise<Evidence[]>;
}

interface Bucket {
  def: DimensionDefinition;
  samples: DimensionSample[];
}

export async function buildLearnerModel(args: BuildLearnerModelArgs): Promise<LearnerModel> {
  const tenantId = args.tenantId;
  const studentId = args.studentId;
  assertUuid(tenantId, "tenantId", "TENANT_CONTEXT_MISSING", "INVALID_TENANT_ID");
  assertUuid(studentId, "studentId", "STUDENT_CONTEXT_MISSING", "INVALID_STUDENT_ID");
  const config: LearnerModelConfig = { ...DEFAULT_LEARNER_MODEL_CONFIG, ...(args.config ?? {}) };
  const reader = args.reader ?? listEvidenceForStudent;
  const rows = await reader({ tenantId, studentId, limit: config.maxEvidenceRows });

  const teacherRows = rows.filter(isTeacherRow);
  const aiRows = rows.filter(isAiRow);
  const ruleRows = rows.filter((r) => !isTeacherRow(r) && !isAiRow(r));
  const chronological = [...ruleRows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const contexts = buildContexts(chronological);
  const buckets = collectBuckets(chronological, config);

  const interpretations: DimensionInterpretation[] = [];
  for (const key of bucketKeysInRegistryOrder(buckets)) {
    const bucket = buckets.get(key);
    if (bucket) interpretations.push(interpretDimension(bucket, config));
  }
  for (const def of LEARNER_DIMENSION_REGISTRY) {
    const key = def.subject + "|" + def.dimension;
    if (!buckets.has(key)) interpretations.push(insufficient(def));
  }

  const subjects = groupBySubject(interpretations);
  const teacherInterpretations = teacherRows.map((r) => toExternal(r, "TEACHER"));
  const aiInterpretations = aiRows.map((r) => toExternal(r, "AI"));

  return {
    tenantId,
    studentId,
    builtAt: new Date(),
    interpretationSource: "RULE",
    contexts,
    subjects,
    dimensions: interpretations,
    teacherInterpretations,
    aiInterpretations,
  };
}

// ===== internal helpers =====

function assertUuid(value: string, label: string, missingError: string, invalidError: string): void {
  if (!value) throw new Error(missingError);
  if (!UUID_RE.test(value)) throw new Error(invalidError);
}

function isTeacherRow(row: Evidence): boolean {
  return (row.sourceEngine ?? "").toLowerCase() === TEACHER_SOURCE;
}

function isAiRow(row: Evidence): boolean {
  const source = (row.sourceEngine ?? "").toLowerCase();
  const resp = (row.response ?? {}) as Record<string, unknown>;
  return source.includes("ai") || resp.interpretationSource === "AI";
}

function subjectOf(row: Evidence): string {
  if (row.subject) return row.subject;
  const resp = (row.response ?? {}) as Record<string, unknown>;
  if (typeof resp.skill === "string" && resp.skill.includes(".")) return resp.skill.split(".")[0];
  return "reading";
}

function metricValue(row: Evidence, def: DimensionDefinition): number | null {
  if (def.metric === "durationMs") {
    return typeof row.durationMs === "number" ? row.durationMs : null;
  }
  const resp = (row.response ?? {}) as Record<string, unknown>;
  const v = resp[def.metric];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pushSample(
  buckets: Map<string, Bucket>,
  subject: string,
  def: DimensionDefinition,
  row: Evidence,
  rawValue: number,
  config: LearnerModelConfig,
): void {
  const key = subject + "|" + def.dimension;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { def, samples: [] };
    buckets.set(key, bucket);
  }
  bucket.samples.push({
    evidenceId: row.id,
    occurredAt: row.occurredAt,
    value: rawValue,
    normalized: normalizeValue(rawValue, def, config),
  });
}

function collectBuckets(rows: Evidence[], config: LearnerModelConfig): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  const registered = new Set<string>();
  for (const def of LEARNER_DIMENSION_REGISTRY) registered.add(def.subject + "|" + def.dimension);
  const autoSeen = new Set<string>();

  for (const row of rows) {
    const subject = subjectOf(row);
    for (const def of LEARNER_DIMENSION_REGISTRY) {
      if (def.subject !== subject) continue;
      const value = metricValue(row, def);
      if (value === null) continue;
      pushSample(buckets, subject, def, row, value, config);
    }
    const resp = (row.response ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(resp)) {
      const v = resp[key];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const dimKey = subject + "|" + key;
      if (registered.has(dimKey) || autoSeen.has(dimKey)) continue;
      autoSeen.add(dimKey);
      const lower = /time|speed|latency/i.test(key);
      const def: DimensionDefinition = {
        subject,
        skill: subject + "." + key,
        dimension: key,
        metric: key,
        higherIsBetter: !lower,
        evidenceTypes: ["assessment", "response", "attempt", "time"],
        label: subject + " " + key,
      };
      pushSample(buckets, subject, def, row, v, config);
    }
  }
  for (const bucket of buckets.values()) {
    bucket.samples.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    if (bucket.samples.length > config.maxRowsPerDimension) {
      bucket.samples = bucket.samples.slice(-config.maxRowsPerDimension);
    }
  }
  return buckets;
}

function bucketKeysInRegistryOrder(buckets: Map<string, Bucket>): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const def of LEARNER_DIMENSION_REGISTRY) {
    const key = def.subject + "|" + def.dimension;
    if (buckets.has(key) && !seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }
  for (const key of buckets.keys()) {
    if (!seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }
  return ordered;
}

function interpretDimension(bucket: Bucket, config: LearnerModelConfig): DimensionInterpretation {
  const def = bucket.def;
  const samples = bucket.samples;
  const n = samples.length;
  const refs = samples.map((s) => s.evidenceId);
  const from = samples.length > 0 ? samples[0].occurredAt : null;
  const to = samples.length > 0 ? samples[samples.length - 1].occurredAt : null;
  if (n < config.minEvidenceCount) {
    return {
      subject: def.subject, skill: def.skill, dimension: def.dimension,
      level: "insufficient", trend: "INSUFFICIENT_EVIDENCE",
      interpretationSource: "RULE", confidence: 0,
      evidenceRefs: refs, sampleCount: n, recentMean: null, olderMean: null, from, to,
      reason: "insufficient evidence: " + n + " sample(s) below minEvidenceCount " + config.minEvidenceCount,
    };
  }
  const recent = samples.slice(-config.trendRecentCount);
  const older = samples.slice(0, -config.trendRecentCount);
  const recentMean = meanOf(recent);
  const olderMean = older.length > 0 ? meanOf(older) : null;
  const trend: Trend = olderMean === null ? "INSUFFICIENT_EVIDENCE" : deriveTrend(recentMean, olderMean, def, config);
  const confidence = confidenceFor(n, olderMean !== null, config);
  const level: DimensionLevel = deriveLevel(recentMean, trend, def, config);
  const reason =
    "RULE: " + n + " samples; recent " + recentMean.toFixed(3) +
    "; older " + (olderMean === null ? "n/a" : olderMean.toFixed(3)) +
    "; confidence " + confidence;
  return {
    subject: def.subject, skill: def.skill, dimension: def.dimension,
    level, trend, interpretationSource: "RULE", confidence,
    evidenceRefs: refs, sampleCount: n, recentMean, olderMean, from, to, reason,
  };
}

function meanOf(samples: DimensionSample[]): number {
  let sum = 0;
  for (const s of samples) sum += s.normalized;
  return sum / samples.length;
}

function insufficient(def: DimensionDefinition): DimensionInterpretation {
  return {
    subject: def.subject, skill: def.skill, dimension: def.dimension,
    level: "insufficient", trend: "INSUFFICIENT_EVIDENCE",
    interpretationSource: "RULE", confidence: 0,
    evidenceRefs: [], sampleCount: 0, recentMean: null, olderMean: null,
    from: null, to: null, reason: "no evidence yet",
  };
}

function groupBySubject(interpretations: DimensionInterpretation[]): LearnerSubject[] {
  const order: string[] = [];
  const map = new Map<string, LearnerSubject>();
  for (const interp of interpretations) {
    let s = map.get(interp.subject);
    if (!s) {
      s = { subject: interp.subject, skills: [], dimensions: [] };
      map.set(interp.subject, s);
      order.push(interp.subject);
    }
    s.dimensions.push(interp);
    if (!s.skills.includes(interp.skill)) s.skills.push(interp.skill);
  }
  return order.map((subject) => map.get(subject) as LearnerSubject);
}

function buildContexts(rows: Evidence[]): LearnerContextSegment[] {
  if (rows.length === 0) return [];
  const out: LearnerContextSegment[] = [];
  let cur: LearnerContextSegment | null = null;
  for (const r of rows) {
    const grade = r.grade ?? null;
    const book = r.curriculumBook ?? null;
    if (cur === null || cur.grade !== grade || cur.curriculumBook !== book) {
      cur = { grade, curriculumBook: book, from: r.occurredAt, to: r.occurredAt, evidenceCount: 1 };
      out.push(cur);
    } else {
      cur.to = r.occurredAt;
      cur.evidenceCount += 1;
    }
  }
  return out;
}

function toExternal(row: Evidence, source: InterpretationSource): ExternalInterpretation {
  const resp = (row.response ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    subject: row.subject,
    skill: str(resp.skill),
    dimension: str(resp.dimension),
    source,
    evidenceId: row.id,
    occurredAt: row.occurredAt,
    claimedLevel: str(resp.level) ?? str(resp.claimedLevel),
    value: num(resp.value),
    confidence: num(resp.confidence),
    note: str(resp.note),
  };
}
