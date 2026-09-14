/**
 * CORE-04 — Student Learning Record (Core Platform).
 *
 * SLR = LONGITUDINAL learning record/view built ON TOP of Evidence. It is a
 * READ-ONLY projection layer: it consumes the Evidence Reader
 * (listEvidenceForStudent / getEvidenceChain) and NEVER persists a second copy
 * of evidence — there is no SLR table, no SLR migration, no db.insert here.
 *
 * Multidimensional by design: no overall score. Strands group evidence by
 * subject; dimensions are metric keys found in evidence `response` (data-defined
 * → future skills need no core change). Grade / school / curriculum are
 * CONTEXT SEGMENTS on a continuous student timeline — never reset keys:
 * a student's record is never zeroed on grade promotion, school change,
 * curriculum change, or subject change. Tenant/student isolation is enforced
 * in every entry point.
 *
 * Ownership: SLR → Core Platform. Nothing in any Engine owns SLR.
 */
import { listEvidenceForStudent, getEvidenceChain } from "../evidence/evidence-reader.js";
import type { Evidence } from "../schema/evidence.js";
import { skillDefinitionFor } from "./skills.js";

export interface SlrEvent {
  evidenceId: string;
  occurredAt: Date;
  evidenceType: string;
  subject: string | null;
  action: string | null;
  sessionId: string | null;
  attemptId: string | null;
  passageId: string | null;
  inResponseToId: string | null;
  /** Longitudinal hops resolved by reference (diagnosis → intervention → reassessment → outcome). */
  chain?: Evidence[];
}

export interface ContextSegment {
  subject: string | null;
  grade: string | null;
  curriculumBook: string | null;
  from: Date;
  to: Date;
  evidenceCount: number;
}

export interface StrandIndicator {
  metric: string;
  values: number[];
  latest?: number;
}

export interface StrandProgress {
  evidenceCount: number;
  firstOccurredAt: Date | null;
  lastOccurredAt: Date | null;
  trend: "up" | "down" | "flat" | "insufficient";
  /** Multidimensional indicators — never collapsed into an overall score. */
  indicators: StrandIndicator[];
}

export interface StrandReferences {
  evidenceIds: string[];
  assessmentIds: string[];
  diagnosisIds: string[];
  interventionIds: string[];
  masteryIds: string[];
  outcomeIds: string[];
}

export interface SkillStrand {
  subject: string;
  label: string;
  dimensions: string[];
  references: StrandReferences;
  progress: StrandProgress;
}

export interface StudentTimeline {
  tenantId: string;
  studentId: string;
  builtAt: Date;
  /** Temporal context over a continuous record — never a reset boundary. */
  contexts: ContextSegment[];
  strands: SkillStrand[];
  events: SlrEvent[];
}

export interface BuildTimelineArgs {
  tenantId: string;
  studentId: string;
  /** Resolve longitudinal chains through the Evidence Reader (reference hops). */
  resolveChains?: boolean;
}

function requireContext(tenantId: string, studentId: string): void {
  if (!tenantId) throw new Error("TENANT_CONTEXT_MISSING");
  if (!studentId) throw new Error("STUDENT_CONTEXT_MISSING");
}

/** Data-defined dimensions: numeric metric keys emitted inside evidence response. */
function numericMetrics(response: unknown): Record<string, number> {
  if (!response || typeof response !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(response as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function referenceBucket(ev: Evidence): keyof StrandReferences | null {
  switch (ev.evidenceType) {
    case "assessment":
      return "assessmentIds";
    case "intervention":
      return "interventionIds";
    case "outcome":
      return "outcomeIds";
    case "decision":
      if (/diagnosis/i.test(ev.action ?? "") || ev.sourceEngine === "learning-diagnosis") return "diagnosisIds";
      if (/mastery/i.test(ev.action ?? "") || ev.sourceEngine === "mastery-engine") return "masteryIds";
      return null;
    default:
      if (/mastery/i.test(ev.action ?? "") || ev.sourceEngine === "mastery-engine") return "masteryIds";
      return null;
  }
}

function emptyReferences(): StrandReferences {
  return { evidenceIds: [], assessmentIds: [], diagnosisIds: [], interventionIds: [], masteryIds: [], outcomeIds: [] };
}

export async function buildStudentTimeline(args: BuildTimelineArgs): Promise<StudentTimeline> {
  requireContext(args.tenantId, args.studentId);

  // Single read source: the canonical Evidence Reader. Nothing is copied to storage.
  const evidence = await listEvidenceForStudent({ tenantId: args.tenantId, studentId: args.studentId, limit: 1000 });
  const ordered = [...evidence].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  // Events = references into the evidence log (chronological, longitudinal).
  const events: SlrEvent[] = [];
  for (const ev of ordered) {
    const event: SlrEvent = {
      evidenceId: ev.id,
      occurredAt: ev.occurredAt,
      evidenceType: ev.evidenceType,
      subject: ev.subject ?? null,
      action: ev.action ?? null,
      sessionId: ev.sessionId ?? null,
      attemptId: ev.attemptId ?? null,
      passageId: ev.passageId ?? null,
      inResponseToId: ev.inResponseToId ?? null,
    };
    const isChainRoot = ev.inResponseToId !== null || referenceBucket(ev) !== null;
    if (args.resolveChains && isChainRoot) {
      const chain = await getEvidenceChain({ tenantId: args.tenantId, evidenceId: ev.id });
      if (chain.length > 0) event.chain = chain;
    }
    events.push(event);
  }

  // Context segments: grade / curriculum / subject as TEMPORAL CONTEXT over one
  // continuous record — the timeline is never reset.
  const contexts: ContextSegment[] = [];
  let current: ContextSegment | null = null;
  for (const ev of ordered) {
    const seg: ContextSegment = {
      subject: ev.subject ?? null,
      grade: ev.grade ?? null,
      curriculumBook: ev.curriculumBook ?? null,
      from: ev.occurredAt,
      to: ev.occurredAt,
      evidenceCount: 1,
    };
    if (
      current &&
      current.subject === seg.subject &&
      current.grade === seg.grade &&
      current.curriculumBook === seg.curriculumBook
    ) {
      current.to = ev.occurredAt;
      current.evidenceCount += 1;
    } else {
      contexts.push(seg);
      current = seg;
    }
  }

  // Strands: multidimensional per subject; dimensions derived from evidence data.
  const bySubject = new Map<string, Evidence[]>();
  for (const ev of ordered) {
    const subject = ev.subject ?? "unknown";
    const list = bySubject.get(subject);
    if (list) list.push(ev);
    else bySubject.set(subject, [ev]);
  }

  const strands: SkillStrand[] = [];
  for (const [subject, rows] of bySubject) {
    const def = skillDefinitionFor(subject);
    const metrics = new Map<string, number[]>();
    for (const ev of rows) {
      for (const [k, v] of Object.entries(numericMetrics(ev.response))) {
        const arr = metrics.get(k);
        if (arr) arr.push(v);
        else metrics.set(k, [v]);
      }
    }
    const dimensions = Array.from(new Set([...(def?.dimensions ?? []), ...metrics.keys()]));
    const indicators: StrandIndicator[] = [...metrics.entries()].map(([metric, values]) => ({
      metric,
      values,
      latest: values[values.length - 1],
    }));
    let trend: StrandProgress["trend"] = "insufficient";
    if (indicators.length > 0) {
      const primary = indicators.find((i) => i.metric === "accuracy") ?? indicators[0];
      if (primary.values.length >= 2) {
        const prev = primary.values[primary.values.length - 2];
        const last = primary.values[primary.values.length - 1];
        trend = last > prev ? "up" : last < prev ? "down" : "flat";
      }
    }
    const references = emptyReferences();
    for (const ev of rows) {
      references.evidenceIds.push(ev.id);
      const bucket = referenceBucket(ev);
      if (bucket) references[bucket].push(ev.id);
    }
    strands.push({
      subject,
      label: def?.label ?? subject,
      dimensions,
      references,
      progress: {
        evidenceCount: rows.length,
        firstOccurredAt: rows[0].occurredAt,
        lastOccurredAt: rows[rows.length - 1].occurredAt,
        trend,
        indicators,
      },
    });
  }

  return { tenantId: args.tenantId, studentId: args.studentId, builtAt: new Date(), contexts, strands, events };
}
