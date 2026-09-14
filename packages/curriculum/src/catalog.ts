/**
 * Curriculum Catalog — CONFIGURATION data + pure queries.
 * Global by architecture, local by configuration (CORE-13C/S).
 * No country/curriculum name appears in business logic; all of it lives
 * in config-fixtures.ts and in tenant-provided catalogs.
 */
import type { SubjectKey, SkillKey, DimensionKey } from "./contracts.js";
import type { CurriculumStatus } from "./contracts.js";

export interface CatalogObjective {
  readonly objectiveId: string;
  readonly objectiveText: string;
  readonly skills: readonly SkillKey[];
  readonly dimensions: readonly DimensionKey[];
}

export interface CatalogLesson {
  readonly lessonId: string;
  readonly lessonTitle: string;
  readonly objectives: readonly CatalogObjective[];
}

export interface CatalogUnit {
  readonly unitId: string;
  readonly unitTitle: string;
  readonly lessons: readonly CatalogLesson[];
}

export interface CatalogBook {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly units: readonly CatalogUnit[];
}

export interface CatalogCurriculumVersion {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly status: CurriculumStatus;
  readonly books: readonly CatalogBook[];
}

export interface CatalogCurriculum {
  readonly curriculumId: string;
  readonly curriculumName: string;
  /** configuration data */
  readonly country: string;
  readonly language: string;
  readonly educationSystem: string;
  readonly educationStage: string;
  readonly grade: string;
  readonly gradeKey: string;
  readonly subject: SubjectKey;
  /** curriculum versions may coexist (e.g. 2026 + 2027) */
  readonly versions: readonly CatalogCurriculumVersion[];
  /**
   * Optional tenant scope: when set, only this tenant may resolve it.
   * undefined = global/shared configuration visible to every tenant.
   */
  readonly tenantId?: string;
}

export interface CurriculumCatalog {
  readonly curricula: readonly CatalogCurriculum[];
}

export interface FindCurriculaFilter {
  readonly country: string;
  readonly educationStage?: string;
  readonly grade?: string;
  readonly subject?: SubjectKey;
  /** tenant isolation: private curricula of other tenants are invisible */
  readonly tenantId: string;
}

/** Pure query — same subject+grade may resolve to several curricula (CORE-13J). */
export function findCurricula(
  catalog: CurriculumCatalog,
  filter: FindCurriculaFilter,
): readonly CatalogCurriculum[] {
  return catalog.curricula.filter((c) => {
    if (c.tenantId !== undefined && c.tenantId !== filter.tenantId) return false;
    if (c.country !== filter.country) return false;
    if (filter.educationStage !== undefined && c.educationStage !== filter.educationStage) return false;
    if (filter.grade !== undefined && c.grade !== filter.grade) return false;
    if (filter.subject !== undefined && c.subject !== filter.subject) return false;
    return true;
  });
}

export function curriculumById(
  catalog: CurriculumCatalog,
  curriculumId: string,
  tenantId: string,
): CatalogCurriculum | undefined {
  return catalog.curricula.find(
    (c) => c.curriculumId === curriculumId && (c.tenantId === undefined || c.tenantId === tenantId),
  );
}
