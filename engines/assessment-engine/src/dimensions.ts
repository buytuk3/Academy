/**
 * CORE-16 — open dimension registry (config-driven, extensible).
 * Same principle as CORE-09: Subject != Skill != Dimension != EvidenceType.
 * The list is a registry, NOT a closed union — any new dimension resolves
 * deterministically via dimensionDefFor().
 */
export interface AssessmentDimensionDef {
  readonly dimension: string;
  readonly label: string;
  readonly higherIsBetter: boolean;
}

export const ASSESSMENT_DIMENSION_REGISTRY: readonly AssessmentDimensionDef[] = [
  { dimension: "knowledge", label: "Knowledge", higherIsBetter: true },
  { dimension: "skill", label: "Skill", higherIsBetter: true },
  { dimension: "accuracy", label: "Accuracy", higherIsBetter: true },
  { dimension: "fluency", label: "Fluency", higherIsBetter: true },
  { dimension: "response-time", label: "Response Time", higherIsBetter: false },
  { dimension: "comprehension", label: "Comprehension", higherIsBetter: true },
  { dimension: "application", label: "Application", higherIsBetter: true },
  { dimension: "reasoning", label: "Reasoning", higherIsBetter: true },
  { dimension: "consistency", label: "Consistency", higherIsBetter: true },
  { dimension: "completion", label: "Completion", higherIsBetter: true },
];

export function dimensionDefFor(dimension: string): AssessmentDimensionDef {
  const found = ASSESSMENT_DIMENSION_REGISTRY.find((d) => d.dimension === dimension);
  return found ?? { dimension, label: dimension, higherIsBetter: true };
}
