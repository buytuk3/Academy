/**
 * Curriculum Versioning (CORE-13K) — versions coexist; old evidence stays
 * bound to the version in which it occurred (longitudinal record, CORE-13L).
 */
import type { CatalogCurriculum, CatalogCurriculumVersion } from "./catalog.js";

/**
 * The version in force at `asOfIso`. The DATE WINDOW governs resolution, not the
 * current lifecycle status: a SUPERSEDED version (e.g. 2025) still resolves for
 * evidence dated inside its window — historical contexts stay stable (CORE-13K/L).
 * Default (no asOf): latest ACTIVE version.
 */
export function effectiveVersion(
  curriculum: CatalogCurriculum,
  asOfIso?: string,
): CatalogCurriculumVersion | undefined {
  const active = curriculum.versions.filter((v) => v.status === "ACTIVE");
  if (asOfIso !== undefined) {
    const inWindow = curriculum.versions.filter((v) => {
      const to = v.effectiveTo ?? "9999-12-31";
      return v.effectiveFrom <= asOfIso && asOfIso < to;
    });
    if (inWindow.length > 0) {
      const activeInWindow = inWindow.filter((v) => v.status === "ACTIVE");
      const pool = activeInWindow.length > 0 ? activeInWindow : inWindow;
      return pool.reduce((a, b) => (a.effectiveFrom > b.effectiveFrom ? a : b));
    }
  }
  if (active.length === 0) return undefined;
  return active.reduce((a, b) => (a.effectiveFrom > b.effectiveFrom ? a : b));
}

export function versionByLabel(
  curriculum: CatalogCurriculum,
  version: string,
): CatalogCurriculumVersion | undefined {
  return curriculum.versions.find((v) => v.version === version);
}

/** Versions overlapping [from,to] — proves 2026 + 2027 can coexist. */
export function versionsOverlapping(
  curriculum: CatalogCurriculum,
  from: string,
  to: string,
): readonly CatalogCurriculumVersion[] {
  return curriculum.versions.filter((v) => {
    const vTo = v.effectiveTo ?? "9999-12-31";
    return v.effectiveFrom <= to && from <= vTo;
  });
}

export function isSuperseded(version: CatalogCurriculumVersion): boolean {
  return version.status === "SUPERSEDED";
}
