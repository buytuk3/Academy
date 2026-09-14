/**
 * Hierarchy normalization (CORE-13B) — a flexible, partial chain.
 * Not every country/system has every level; ORDER of present levels is what
 * is validated. Present nodes must follow the canonical order; gaps are
 * allowed (e.g. no book in some systems), required levels (country,
 * educationStage, grade, subject, curriculum) must be present.
 */
import {
  HIERARCHY_LEVELS,
  type HierarchyIssue,
  type HierarchyLevel,
  type HierarchyNormalization,
  type HierarchyState,
} from "./contracts.js";

const REQUIRED: readonly HierarchyLevel[] = [
  "country",
  "educationStage",
  "grade",
  "subject",
  "curriculum",
];

export function normalizeHierarchy(
  states: readonly HierarchyState[],
): HierarchyNormalization {
  const issues: HierarchyIssue[] = [];
  const levels: HierarchyLevel[] = [];

  for (const s of states) {
    if ((HIERARCHY_LEVELS as readonly string[]).indexOf(s.level) === -1) {
      issues.push({ code: "UNKNOWN_LEVEL", message: `unknown level: ${s.level}` });
      continue;
    }
    if (s.id.trim() === "") {
      issues.push({ code: "EMPTY_ID", message: `empty id at level ${s.level}` });
    }
    const idx = HIERARCHY_LEVELS.indexOf(s.level);
    if (levels.length > 0 && idx <= HIERARCHY_LEVELS.indexOf(levels[levels.length - 1])) {
      issues.push({
        code: "ORDER_VIOLATION",
        message: `${s.level} appears at or before ${levels[levels.length - 1]}`,
      });
      continue;
    }
    levels.push(s.level);
  }

  for (const req of REQUIRED) {
    if (!levels.includes(req)) {
      issues.push({ code: "REQUIRED_LEVEL_MISSING", message: `required level missing: ${req}` });
    }
  }

  return issues.length === 0 ? { ok: true, levels } : { ok: false, issues };
}
