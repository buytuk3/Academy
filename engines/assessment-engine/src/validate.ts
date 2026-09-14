/**
 * CORE-26 / WAVE-4B — STRICT ASSESSMENT engine-input validation (owner
 * directive §1, 2026-09-12): the flexible /v1 `engineInput` envelope is a
 * TRANSPORT wrapper only. The engine OWNS a typed, validated contract at
 * its boundary — input type checks, required-field checks, rejection of
 * invalid input, and REJECTION of unknown fields (no unvalidated data may
 * reach the rubric/measurement core). Additive-only: existing exported
 * contracts and function signatures are untouched.
 *
 * Error style: deterministic reason codes (ASM_*), same convention as the
 * canonical platform error strings (CORE-05/14/16).
 */
import type {
  AssessmentDefinition,
  AssessmentItemRef,
  AssessmentKind,
  AssessmentResponse,
  ScoringMode,
} from "./contracts.js";

/** Mirrors `AssessmentKind` (contracts.ts) — runtime-checkable source of truth. */
const ASSESSMENT_KIND_LIST: readonly AssessmentKind[] = [
  "diagnostic",
  "formative",
  "summative",
  "baseline",
  "readiness",
  "progress",
  "reassessment",
];

const SCORING_MODES: readonly ScoringMode[] = ["exact", "numeric"];

export class AssessmentEngineInputError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`INVALID_ENGINE_INPUT:${reason}`);
    this.name = "AssessmentEngineInputError";
    this.reason = reason;
  }
}

export interface AssessmentTimingInput {
  readonly submittedAt?: string;
  readonly durationMs?: number;
  readonly thinkingTimeMs?: number;
  readonly responseDurationMs?: number;
  readonly attemptCount?: number;
}

/** Fully validated ASSESSMENT engine input — the ONLY shape evaluateAssessment accepts from /v1. */
export interface AssessmentEngineInput {
  readonly definition: AssessmentDefinition;
  readonly response: AssessmentResponse;
  readonly timing?: AssessmentTimingInput;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function reqString(obj: Record<string, unknown>, key: string, prefix: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim() === "") throw new AssessmentEngineInputError(`${prefix}_${key.toUpperCase()}_REQUIRED`);
  return v;
}

function optString(obj: Record<string, unknown>, key: string, prefix: string): string | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new AssessmentEngineInputError(`${prefix}_${key.toUpperCase()}_NOT_STRING`);
  return v;
}

function optNonNegNumber(obj: Record<string, unknown>, key: string, prefix: string): number | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new AssessmentEngineInputError(`${prefix}_${key.toUpperCase()}_NOT_NON_NEGATIVE_NUMBER`);
  return v;
}

function optIsoDate(obj: Record<string, unknown>, key: string, prefix: string): string | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string" || v.trim() === "" || !Number.isFinite(Date.parse(v))) throw new AssessmentEngineInputError(`${prefix}_${key.toUpperCase()}_NOT_ISO_DATE`);
  return v;
}

function stringArray(obj: Record<string, unknown>, key: string, prefix: string): readonly string[] {
  const v = obj[key];
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new AssessmentEngineInputError(`${prefix}_${key.toUpperCase()}_NOT_STRING_ARRAY`);
  return v as string[];
}

function parseItem(raw: unknown, i: number): AssessmentItemRef {
  if (!isPlainObject(raw)) throw new AssessmentEngineInputError(`DEFINITION_ITEMS_${i}_NOT_OBJECT`);
  const it = raw as Record<string, unknown>;
  for (const key of Object.keys(it)) {
    if (!["itemRef", "promptRef", "expectedAnswer", "scoring", "weight", "dimension"].includes(key)) {
      throw new AssessmentEngineInputError(`DEFINITION_ITEMS_${i}_UNKNOWN_FIELD:${key}`);
    }
  }
  const itemRef = reqString(it, "itemRef", `DEFINITION_ITEMS_${i}`);
  const expectedAnswer = reqString(it, "expectedAnswer", `DEFINITION_ITEMS_${i}`);
  const scoring = it.scoring;
  if (typeof scoring !== "string" || !SCORING_MODES.includes(scoring as ScoringMode)) {
    throw new AssessmentEngineInputError(`DEFINITION_ITEMS_${i}_SCORING_INVALID`);
  }
  const weight = it.weight;
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
    throw new AssessmentEngineInputError(`DEFINITION_ITEMS_${i}_WEIGHT_NOT_POSITIVE_NUMBER`);
  }
  const promptRef = optString(it, "promptRef", `DEFINITION_ITEMS_${i}`);
  const dimension = optString(it, "dimension", `DEFINITION_ITEMS_${i}`);
  return {
    itemRef,
    expectedAnswer,
    scoring: scoring as ScoringMode,
    weight,
    ...(promptRef !== undefined ? { promptRef } : {}),
    ...(dimension !== undefined ? { dimension } : {}),
  };
}

function parseDefinition(raw: unknown): AssessmentDefinition {
  if (!isPlainObject(raw)) throw new AssessmentEngineInputError("DEFINITION_NOT_OBJECT");
  const d = raw as Record<string, unknown>;
  for (const key of Object.keys(d)) {
    if (!["definitionId", "title", "kind", "subject", "targets", "items", "dimensions", "passThreshold", "timeLimitMs", "maxAttempts"].includes(key)) {
      throw new AssessmentEngineInputError(`DEFINITION_UNKNOWN_FIELD:${key}`);
    }
  }
  const definitionId = reqString(d, "definitionId", "DEFINITION");
  const title = reqString(d, "title", "DEFINITION");
  const subject = reqString(d, "subject", "DEFINITION");
  const kind = d.kind;
  if (typeof kind !== "string" || !ASSESSMENT_KIND_LIST.includes(kind as AssessmentKind)) {
    throw new AssessmentEngineInputError("DEFINITION_KIND_INVALID");
  }
  if (d.items === undefined || !Array.isArray(d.items) || d.items.length === 0) {
    throw new AssessmentEngineInputError("DEFINITION_ITEMS_REQUIRED_NON_EMPTY");
  }
  const items = d.items.map(parseItem);
  // duplicate itemRefs are structurally invalid — the rubric would double-count
  const refs = items.map((x) => x.itemRef);
  if (new Set(refs).size !== refs.length) throw new AssessmentEngineInputError("DEFINITION_ITEMS_DUPLICATE_ITEM_REF");
  const dimensions = stringArray(d, "dimensions", "DEFINITION");
  const passThreshold = d.passThreshold;
  if (typeof passThreshold !== "number" || !Number.isFinite(passThreshold) || passThreshold < 0 || passThreshold > 1) {
    throw new AssessmentEngineInputError("DEFINITION_PASS_THRESHOLD_NOT_IN_UNIT_RANGE");
  }
  const timeLimitMs = optNonNegNumber(d, "timeLimitMs", "DEFINITION");
  const maxAttempts = optNonNegNumber(d, "maxAttempts", "DEFINITION");
  // targets: reference-only object of string arrays
  const targetsRaw = d.targets;
  let targets: { readonly objectiveIds?: readonly string[]; readonly skills?: readonly string[]; readonly dimensions?: readonly string[] } = {};
  if (targetsRaw !== undefined) {
    if (!isPlainObject(targetsRaw)) throw new AssessmentEngineInputError("DEFINITION_TARGETS_NOT_OBJECT");
    const t = targetsRaw as Record<string, unknown>;
    for (const key of Object.keys(t)) {
      if (!["objectiveIds", "skills", "dimensions"].includes(key)) throw new AssessmentEngineInputError(`DEFINITION_TARGETS_UNKNOWN_FIELD:${key}`);
    }
    targets = {
      ...(t.objectiveIds !== undefined ? { objectiveIds: stringArray(t, "objectiveIds", "DEFINITION_TARGETS") } : {}),
      ...(t.skills !== undefined ? { skills: stringArray(t, "skills", "DEFINITION_TARGETS") } : {}),
      ...(t.dimensions !== undefined ? { dimensions: stringArray(t, "dimensions", "DEFINITION_TARGETS") } : {}),
    };
  }
  return {
    definitionId,
    title,
    kind: kind as AssessmentKind,
    subject,
    targets,
    items,
    dimensions,
    passThreshold,
    ...(timeLimitMs !== undefined ? { timeLimitMs } : {}),
    ...(maxAttempts !== undefined ? { maxAttempts } : {}),
  };
}

function parseResponse(raw: unknown): AssessmentResponse {
  if (!isPlainObject(raw)) throw new AssessmentEngineInputError("RESPONSE_NOT_OBJECT");
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    if (key !== "items") throw new AssessmentEngineInputError(`RESPONSE_UNKNOWN_FIELD:${key}`);
  }
  if (r.items === undefined || !Array.isArray(r.items)) throw new AssessmentEngineInputError("RESPONSE_ITEMS_REQUIRED_ARRAY");
  const items = r.items.map((raw2, i) => {
    if (!isPlainObject(raw2)) throw new AssessmentEngineInputError(`RESPONSE_ITEMS_${i}_NOT_OBJECT`);
    const it = raw2 as Record<string, unknown>;
    for (const key of Object.keys(it)) {
      if (!["itemRef", "response"].includes(key)) throw new AssessmentEngineInputError(`RESPONSE_ITEMS_${i}_UNKNOWN_FIELD:${key}`);
    }
    return { itemRef: reqString(it, "itemRef", `RESPONSE_ITEMS_${i}`), response: reqString(it, "response", `RESPONSE_ITEMS_${i}`) };
  });
  return { items };
}

function parseTiming(raw: unknown): AssessmentTimingInput {
  if (!isPlainObject(raw)) throw new AssessmentEngineInputError("TIMING_NOT_OBJECT");
  const t = raw as Record<string, unknown>;
  for (const key of Object.keys(t)) {
    if (!["submittedAt", "durationMs", "thinkingTimeMs", "responseDurationMs", "attemptCount"].includes(key)) {
      throw new AssessmentEngineInputError(`TIMING_UNKNOWN_FIELD:${key}`);
    }
  }
  return {
    ...(optIsoDate(t, "submittedAt", "TIMING") !== undefined ? { submittedAt: t.submittedAt as string } : {}),
    ...(optNonNegNumber(t, "durationMs", "TIMING") !== undefined ? { durationMs: t.durationMs as number } : {}),
    ...(optNonNegNumber(t, "thinkingTimeMs", "TIMING") !== undefined ? { thinkingTimeMs: t.thinkingTimeMs as number } : {}),
    ...(optNonNegNumber(t, "responseDurationMs", "TIMING") !== undefined ? { responseDurationMs: t.responseDurationMs as number } : {}),
    ...(optNonNegNumber(t, "attemptCount", "TIMING") !== undefined ? { attemptCount: t.attemptCount as number } : {}),
  };
}

/** The ONLY gate between the /v1 transport envelope and the ASSESSMENT measurement core. */
export function parseAssessmentEngineInput(raw: unknown): AssessmentEngineInput {
  if (!isPlainObject(raw)) throw new AssessmentEngineInputError("INPUT_NOT_OBJECT");
  const input = raw as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!["definition", "response", "timing"].includes(key)) {
      throw new AssessmentEngineInputError(`ASM_UNKNOWN_FIELD:${key}`);
    }
  }
  if (input.definition === undefined) throw new AssessmentEngineInputError("DEFINITION_REQUIRED");
  if (input.response === undefined) throw new AssessmentEngineInputError("RESPONSE_REQUIRED");
  const definition = parseDefinition(input.definition);
  const response = parseResponse(input.response);
  const timing = input.timing !== undefined ? parseTiming(input.timing) : undefined;
  return { definition, response, ...(timing !== undefined ? { timing } : {}) };
}
