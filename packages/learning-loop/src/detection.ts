/**
 * CORE-07 — Deterministic Detection Foundation (no LLM, no random thresholds).
 *
 * Detection ≠ Diagnosis. These rules only answer "is there a signal worth
 * investigating?". Every rule is config-driven, deterministic, explainable and
 * testable. Signals are derived purely from Evidence rows (CANONICAL source —
 * nothing duplicated).
 */
import type { Evidence } from "@workspace/db";

export type EvidenceLike = Pick<
  Evidence,
  "id" | "tenantId" | "studentId" | "evidenceType" | "subject" | "durationMs" | "occurredAt" | "response"
>;

export type DetectionKind =
  | "repeated-mistake"
  | "accuracy-decline"
  | "slow-response"
  | "no-improvement-after-intervention"
  | "skill-gap"
  | "insufficient-evidence";

export interface DetectionRuleConfig {
  /** repeated identical-mistake signals on the same skill */
  maxRepeatedMistakes: number;
  /** accuracy delta that triggers an accuracy-decline signal */
  minAccuracyDecline: number;
  /** average evidence durationMs above which a slow-response signal fires */
  maxResponseTimeMs: number;
  /** minimum evidence rows required before any signal other than insufficient-evidence */
  minEvidenceForSignal: number;
  /** minimum confidence to emit a non-insufficient signal */
  minConfidence: number;
}

export const DEFAULT_DETECTION_RULES: DetectionRuleConfig = {
  maxRepeatedMistakes: 3,
  minAccuracyDecline: 0.08,
  maxResponseTimeMs: 45_000,
  minEvidenceForSignal: 2,
  minConfidence: 0.6,
};

export interface DetectionSignal {
  kind: DetectionKind;
  tenantId: string;
  studentId: string;
  skill: string;
  evidenceRefs: string[]; // references to the canonical evidence — no copies
  confidence: number; // deterministic, derived from evidence volume/consistency
  reason: string; // explainable, human-readable
  signalKey: string; // stable logical identity → idempotency
}

export function skillOf(row: EvidenceLike): string {
  const resp = (row.response ?? {}) as Record<string, unknown>;
  return typeof resp.skill === "string" ? resp.skill : row.subject ?? "reading";
}

export function makeSignalKey(kind: DetectionKind, tenantId: string, studentId: string, skill: string): string {
  return `detect:${kind}:${tenantId}:${studentId}:${skill}`;
}

const NUM = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Deterministic detector. Same rows + same rules → same signals. */
export function detectSignals(rows: EvidenceLike[], rules: DetectionRuleConfig = DEFAULT_DETECTION_RULES): DetectionSignal[] {
  if (rows.length === 0) return [];
  const tenantId = rows[0].tenantId;
  const studentId = rows[0].studentId;
  const sorted = [...rows].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  const out: DetectionSignal[] = [];

  const push = (kind: DetectionKind, skill: string, refs: string[], confidence: number, reason: string) => {
    out.push({
      kind,
      tenantId,
      studentId,
      skill,
      evidenceRefs: refs,
      confidence: Math.round(confidence * 100) / 100,
      reason,
      signalKey: makeSignalKey(kind, tenantId, studentId, skill),
    });
  };

  // --- repeated-mistake: N identical-mistake evidence rows on the same skill ---
  const mistakesBySkill = new Map<string, EvidenceLike[]>();
  for (const r of sorted) if (r.evidenceType === "mistake") {
    const key = skillOf(r);
    mistakesBySkill.set(key, [...(mistakesBySkill.get(key) ?? []), r]);
  }
  for (const [skill, refs] of mistakesBySkill) {
    if (refs.length >= rules.maxRepeatedMistakes) {
      push("repeated-mistake", skill, refs.map((r) => r.id), Math.min(0.95, 0.5 + refs.length * 0.1), `الطالب أخطأ ${refs.length} مرات في مهارة "${skill}" — إشارة تستحق التحقيق`);
    }
  }

  // --- accuracy-decline: last two assessments on the same skill ---
  const assessmentsBySkill = new Map<string, EvidenceLike[]>();
  for (const r of sorted) if (r.evidenceType === "assessment") {
    const key = skillOf(r);
    assessmentsBySkill.set(key, [...(assessmentsBySkill.get(key) ?? []), r]);
  }
  for (const [skill, refs] of assessmentsBySkill) {
    const acc = refs.map((r) => NUM((r.response as Record<string, unknown>)?.accuracy)).filter((x): x is number => x !== undefined);
    if (acc.length >= 2) {
      const prev = acc[acc.length - 2];
      const last = acc[acc.length - 1];
      if (prev - last >= rules.minAccuracyDecline) {
        push("accuracy-decline", skill, refs.slice(-2).map((r) => r.id), Math.min(0.9, 0.5 + (prev - last) * 3), `انخفضت دقة الطالب في "${skill}" من ${Math.round(prev)} إلى ${Math.round(last)}`);
      }
    }
  }

  // --- slow-response: average durationMs above threshold ---
  const timed = sorted.filter((r) => NUM(r.durationMs) !== undefined);
  if (timed.length > 0) {
    const avg = timed.reduce((s, r) => s + (NUM(r.durationMs) ?? 0), 0) / timed.length;
    if (avg > rules.maxResponseTimeMs) {
      push("slow-response", skillOf(timed[timed.length - 1]), timed.map((r) => r.id), 0.65, `متوسط زمن الاستجابة ${Math.round(avg)}ms تجاوز الحد`);
    }
  }

  // --- no-improvement-after-intervention: assessment before ≈ after on same skill ---
  for (const [skill, refs] of assessmentsBySkill) {
    const acc = refs.map((r) => NUM((r.response as Record<string, unknown>)?.accuracy)).filter((x): x is number => x !== undefined);
    if (acc.length >= 2 && Math.abs(acc[acc.length - 1] - acc[acc.length - 2]) < rules.minAccuracyDecline && refs.length >= rules.minEvidenceForSignal) {
      push("no-improvement-after-intervention", skill, refs.slice(-2).map((r) => r.id), 0.6, `لا تحسّن ملموس بعد التدخل في "${skill}" (${Math.round(acc[acc.length - 2])} → ${Math.round(acc[acc.length - 1])})`);
    }
  }

  // --- skill-gap: assessment accuracy in one skill vs a linked skill (derived) ---
  const accBySkill = new Map<string, number>();
  for (const [skill, refs] of assessmentsBySkill) {
    const acc = refs.map((r) => NUM((r.response as Record<string, unknown>)?.accuracy)).filter((x): x is number => x !== undefined);
    if (acc.length > 0) accBySkill.set(skill, acc[acc.length - 1]);
  }
  const skills = [...accBySkill.keys()];
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const a = accBySkill.get(skills[i]) as number;
      const b = accBySkill.get(skills[j]) as number;
      if (Math.abs(a - b) >= 2 * rules.minAccuracyDecline) {
        const skill = a < b ? skills[i] : skills[j];
        push("skill-gap", skill, [], 0.6, `فجوة بين مهارتين مرتبطتين: "${skills[i]}" (${Math.round(a)}) مقابل "${skills[j]}" (${Math.round(b)})`);
      }
    }
  }

  // --- insufficient-evidence: never claim a pattern we cannot back ---
  if (out.length === 0 && rows.length < rules.minEvidenceForSignal) {
    push("insufficient-evidence", skillOf(sorted[sorted.length - 1]), rows.map((r) => r.id), 0.3, `الأدلة غير كافية (${rows.length} من ${rules.minEvidenceForSignal}) لتشخيص موثوق`);
  }
  return out.filter((s) => s.kind === "insufficient-evidence" || s.confidence >= rules.minConfidence);
}
