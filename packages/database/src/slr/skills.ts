/**
 * CORE-04 — Data-defined skill registry (extensible strands).
 *
 * Skills/dimensions are DATA, not schema: adding Mathematics, Science or any
 * future skill requires ZERO core changes — engines emit metric keys in their
 * evidence `response`, and the SLR projection derives dimensions from them.
 * This registry only annotates known subjects with canonical labels/order;
 * unknown subjects/dimensions still project automatically.
 */
export interface SkillDefinition {
  subject: string;
  label: string;
  /** Canonical dimension ordering for known subjects (non-exhaustive). */
  dimensions: string[];
}

export const SKILL_REGISTRY: SkillDefinition[] = [
  { subject: "reading", label: "Reading", dimensions: ["accuracy", "fluency", "pronunciation", "prosody", "comprehension", "vocabulary", "response-speed"] },
  { subject: "writing", label: "Writing", dimensions: ["grammar", "spelling", "coherence"] },
  { subject: "dictation", label: "Dictation", dimensions: ["accuracy", "response-speed"] },
  { subject: "pronunciation", label: "Pronunciation", dimensions: ["accuracy", "fluency"] },
  { subject: "listening", label: "Listening", dimensions: ["comprehension", "response-speed"] },
  { subject: "mathematics", label: "Mathematics", dimensions: ["accuracy", "response-speed"] },
  { subject: "science", label: "Science", dimensions: ["accuracy", "comprehension"] },
];

export function skillDefinitionFor(subject: string): SkillDefinition | undefined {
  return SKILL_REGISTRY.find((s) => s.subject === subject);
}
