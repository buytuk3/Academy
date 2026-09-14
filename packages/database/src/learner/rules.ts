/**
 * CORE-09 - deterministic, config-driven rules for level / trend / confidence.
 * No LLM, no random thresholds, no invented numbers. Every rule is explainable
 * (reason strings) and testable. Confidence is derived from evidence volume
 * and history presence; when the system cannot compute a reliable value it
 * returns INSUFFICIENT_EVIDENCE instead of inventing a number.
 */
import type { EvidenceType } from "../schema/evidence.js";

export interface LearnerModelConfig {
  minEvidenceCount: number;
  minConfidence: number;
  strongThreshold: number;
  weakThreshold: number;
  trendDelta: number;
  trendRecentCount: number;
  speedCapMs: number;
  maxEvidenceRows: number;
  maxRowsPerDimension: number;
}

export const DEFAULT_LEARNER_MODEL_CONFIG: LearnerModelConfig = {
  minEvidenceCount: 3,
  minConfidence: 0.55,
  strongThreshold: 0.85,
  weakThreshold: 0.6,
  trendDelta: 0.06,
  trendRecentCount: 3,
  speedCapMs: 120000,
  maxEvidenceRows: 500,
  maxRowsPerDimension: 200,
};

export interface DimensionDefinition {
  subject: string;
  skill: string;
  dimension: string;
  metric: string;
  higherIsBetter: boolean;
  evidenceTypes: EvidenceType[];
  label: string;
}

export const LEARNER_DIMENSION_REGISTRY: DimensionDefinition[] = [
  { subject: "reading", skill: "reading.accuracy", dimension: "accuracy", metric: "accuracy", higherIsBetter: true, evidenceTypes: ["assessment", "response", "attempt"], label: "Reading Accuracy" },
  { subject: "reading", skill: "reading.fluency", dimension: "fluency", metric: "fluency", higherIsBetter: true, evidenceTypes: ["assessment", "response", "attempt"], label: "Reading Fluency" },
  { subject: "reading", skill: "reading.pronunciation", dimension: "pronunciation", metric: "pronunciation", higherIsBetter: true, evidenceTypes: ["assessment", "mistake", "response"], label: "Pronunciation" },
  { subject: "reading", skill: "reading.prosody", dimension: "prosody", metric: "prosody", higherIsBetter: true, evidenceTypes: ["assessment", "response"], label: "Prosody" },
  { subject: "reading", skill: "reading.comprehension", dimension: "comprehension", metric: "comprehension", higherIsBetter: true, evidenceTypes: ["assessment", "response", "attempt"], label: "Comprehension" },
  { subject: "reading", skill: "reading.vocabulary", dimension: "vocabulary", metric: "vocabulary", higherIsBetter: true, evidenceTypes: ["assessment", "response"], label: "Vocabulary" },
  { subject: "reading", skill: "reading.speed", dimension: "response-speed", metric: "durationMs", higherIsBetter: false, evidenceTypes: ["time", "assessment", "attempt"], label: "Reading Response Speed" },
  { subject: "writing", skill: "writing.grammar", dimension: "grammar", metric: "grammar", higherIsBetter: true, evidenceTypes: ["assessment", "response"], label: "Writing Grammar" },
  { subject: "writing", skill: "writing.spelling", dimension: "spelling", metric: "spelling", higherIsBetter: true, evidenceTypes: ["assessment", "response"], label: "Spelling" },
  { subject: "writing", skill: "writing.coherence", dimension: "coherence", metric: "coherence", higherIsBetter: true, evidenceTypes: ["assessment"], label: "Coherence" },
  { subject: "dictation", skill: "dictation.accuracy", dimension: "accuracy", metric: "accuracy", higherIsBetter: true, evidenceTypes: ["assessment", "response", "attempt"], label: "Dictation Accuracy" },
  { subject: "dictation", skill: "dictation.speed", dimension: "response-speed", metric: "durationMs", higherIsBetter: false, evidenceTypes: ["time", "assessment"], label: "Dictation Response Speed" },
  { subject: "pronunciation", skill: "pronunciation.accuracy", dimension: "accuracy", metric: "accuracy", higherIsBetter: true, evidenceTypes: ["assessment", "mistake", "response"], label: "Pronunciation Accuracy" },
  { subject: "pronunciation", skill: "pronunciation.fluency", dimension: "fluency", metric: "fluency", higherIsBetter: true, evidenceTypes: ["assessment", "response"], label: "Pronunciation Fluency" },
  { subject: "listening", skill: "listening.comprehension", dimension: "comprehension", metric: "comprehension", higherIsBetter: true, evidenceTypes: ["assessment", "response"], label: "Listening Comprehension" },
  { subject: "listening", skill: "listening.speed", dimension: "response-speed", metric: "durationMs", higherIsBetter: false, evidenceTypes: ["time", "assessment"], label: "Listening Response Speed" },
  { subject: "mathematics", skill: "mathematics.numeracy", dimension: "numeracy", metric: "numeracy", higherIsBetter: true, evidenceTypes: ["assessment", "response", "attempt"], label: "Numeracy" },
  { subject: "mathematics", skill: "mathematics.accuracy", dimension: "accuracy", metric: "accuracy", higherIsBetter: true, evidenceTypes: ["assessment", "response", "attempt"], label: "Calculation Accuracy" },
  { subject: "mathematics", skill: "mathematics.problem-solving", dimension: "problem-solving", metric: "problem-solving", higherIsBetter: true, evidenceTypes: ["assessment", "response"], label: "Problem Solving" },
  { subject: "mathematics", skill: "mathematics.speed", dimension: "response-speed", metric: "durationMs", higherIsBetter: false, evidenceTypes: ["time", "assessment"], label: "Math Response Speed" },
  { subject: "science", skill: "science.accuracy", dimension: "accuracy", metric: "accuracy", higherIsBetter: true, evidenceTypes: ["assessment", "response"], label: "Science Accuracy" },
  { subject: "science", skill: "science.comprehension", dimension: "comprehension", metric: "comprehension", higherIsBetter: true, evidenceTypes: ["assessment", "response"], label: "Science Comprehension" },
  { subject: "grammar", skill: "grammar.accuracy", dimension: "accuracy", metric: "accuracy", higherIsBetter: true, evidenceTypes: ["assessment", "response"], label: "Grammar" },
];

export function dimensionDefinitionFor(subject: string, dimension: string): DimensionDefinition | undefined {
  return LEARNER_DIMENSION_REGISTRY.find((d) => d.subject === subject && d.dimension === dimension);
}

export function normalizeValue(value: number, def: DimensionDefinition, config: LearnerModelConfig): number {
  if (!def.higherIsBetter) {
    return clamp01(1 - value / config.speedCapMs);
  }
  return clamp01(value > 2 ? value / 100 : value);
}

export function deriveTrend(recentMean: number, olderMean: number, def: DimensionDefinition, config: LearnerModelConfig): Trend {
  const delta = recentMean - olderMean;
  if (delta >= config.trendDelta) return def.higherIsBetter ? "IMPROVING" : "DECLINING";
  if (delta <= -config.trendDelta) return def.higherIsBetter ? "DECLINING" : "IMPROVING";
  return "STABLE";
}

export function deriveLevel(recentMean: number, trend: Trend, def: DimensionDefinition, config: LearnerModelConfig): DimensionLevel {
  const hi = def.higherIsBetter;
  if (recentMean >= config.strongThreshold) return hi ? "strong" : "fast";
  if (recentMean <= config.weakThreshold) return hi ? "weak" : "slow";
  if (trend === "IMPROVING") return "improving";
  if (trend === "DECLINING") return "declining";
  return "developing";
}

export function confidenceFor(sampleCount: number, hasHistory: boolean, config: LearnerModelConfig): number {
  const base = 0.45 + 0.08 * Math.min(sampleCount, 5);
  const capped = Math.min(0.9, base);
  const value = hasHistory ? capped : Math.min(capped, 0.6);
  return Math.round(value * 100) / 100;
}

import type { DimensionLevel, Trend } from "./types.js";

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
