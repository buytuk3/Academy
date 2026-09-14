/**
 * Curriculum Context construction (CORE-13F) — pure, deterministic,
 * tenant-safe. buildCurriculumContext() validates tenant + catalogue lookups
 * and returns the unified CurriculumContext. resolveLesson/resolveObjective
 * resolve deeper anchors with their Skill/Dimension links.
 */
import type { SubjectKey } from "./contracts.js";
import type {
  CurriculumContext,
  CurriculumObjectiveRef,
} from "./contracts.js";
import { CurriculumError } from "./contracts.js";
import type {
  CatalogBook,
  CatalogCurriculum,
  CatalogCurriculumVersion,
  CatalogLesson,
  CatalogObjective,
  CatalogUnit,
  CurriculumCatalog,
} from "./catalog.js";
import { curriculumById } from "./catalog.js";
import { effectiveVersion, versionByLabel } from "./versioning.js";

const TENANT_ID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function assertTenantContext(tenantId: string | undefined): void {
  if (tenantId === undefined || tenantId.trim() === "") {
    throw new CurriculumError("TENANT_CONTEXT_MISSING", "tenantId is required");
  }
  if (!TENANT_ID_RE.test(tenantId)) {
    throw new CurriculumError("INVALID_TENANT_ID", `invalid tenantId: ${tenantId}`);
  }
}

export interface BuildCurriculumContextInput {
  readonly tenantId: string;
  readonly country: string;
  readonly language: string;
  readonly educationSystem: string;
  readonly educationStage: string;
  readonly grade: string;
  readonly gradeKey: string;
  readonly subject: SubjectKey;
  readonly curriculumId?: string;
  readonly version?: string;
  readonly bookId?: string;
  readonly unitId?: string;
  readonly lessonId?: string;
  readonly objectiveId?: string;
}

function findVersion(
  curriculum: CatalogCurriculum,
  version?: string,
): CatalogCurriculumVersion {
  if (version !== undefined) {
    const v = versionByLabel(curriculum, version);
    if (v === undefined) {
      throw new CurriculumError("VERSION_NOT_FOUND", `version ${version} of ${curriculum.curriculumId}`);
    }
    return v;
  }
  const v = effectiveVersion(curriculum);
  if (v === undefined) {
    throw new CurriculumError("VERSION_NOT_ACTIVE", `no ACTIVE version of ${curriculum.curriculumId}`);
  }
  return v;
}

export function buildCurriculumContext(
  input: BuildCurriculumContextInput,
  catalog: CurriculumCatalog,
): CurriculumContext {
  assertTenantContext(input.tenantId);

  const curriculum =
    input.curriculumId !== undefined
      ? curriculumById(catalog, input.curriculumId, input.tenantId)
      : catalog.curricula.find(
          (c) =>
            c.country === input.country &&
            c.educationStage === input.educationStage &&
            c.grade === input.grade &&
            c.subject === input.subject &&
            (c.tenantId === undefined || c.tenantId === input.tenantId),
        );
  if (curriculum === undefined) {
    throw new CurriculumError("CURRICULUM_NOT_FOUND", "no matching curriculum in catalog");
  }

  const version = findVersion(curriculum, input.version);
  if (version.status === "SUPERSEDED") {
    // allowed when explicitly pinned by version — historical context
  }

  let book: CatalogBook | undefined;
  let unit: CatalogUnit | undefined;
  let lesson: CatalogLesson | undefined;
  let objective: CatalogObjective | undefined;

  if (input.bookId !== undefined) {
    book = version.books.find((b) => b.bookId === input.bookId);
    if (book === undefined) throw new CurriculumError("BOOK_NOT_FOUND", input.bookId);
  }
  if (book !== undefined && input.unitId !== undefined) {
    unit = book.units.find((u) => u.unitId === input.unitId);
    if (unit === undefined) throw new CurriculumError("UNIT_NOT_FOUND", input.unitId);
  }
  if (unit !== undefined && input.lessonId !== undefined) {
    lesson = unit.lessons.find((l) => l.lessonId === input.lessonId);
    if (lesson === undefined) throw new CurriculumError("LESSON_NOT_FOUND", input.lessonId);
  }
  if (lesson !== undefined && input.objectiveId !== undefined) {
    objective = lesson.objectives.find((o) => o.objectiveId === input.objectiveId);
    if (objective === undefined) throw new CurriculumError("OBJECTIVE_NOT_FOUND", input.objectiveId);
  }

  const objectiveRef: CurriculumObjectiveRef | undefined =
    objective !== undefined
      ? {
          objectiveId: objective.objectiveId,
          objectiveText: objective.objectiveText,
          skills: objective.skills,
          dimensions: objective.dimensions,
        }
      : undefined;

  return {
    tenantId: input.tenantId,
    country: curriculum.country,
    language: curriculum.language,
    educationSystem: curriculum.educationSystem,
    educationStage: curriculum.educationStage,
    grade: curriculum.grade,
    gradeKey: curriculum.gradeKey,
    subject: curriculum.subject,
    curriculum: {
      curriculumId: curriculum.curriculumId,
      curriculumName: curriculum.curriculumName,
      version: version.version,
      effectiveFrom: version.effectiveFrom,
      effectiveTo: version.effectiveTo,
      status: version.status,
    },
    book: book !== undefined ? { bookId: book.bookId, bookTitle: book.bookTitle } : undefined,
    unit: unit !== undefined ? { unitId: unit.unitId, unitTitle: unit.unitTitle } : undefined,
    lesson: lesson !== undefined ? { lessonId: lesson.lessonId, lessonTitle: lesson.lessonTitle } : undefined,
    objective: objectiveRef,
    skills: objective !== undefined ? objective.skills : [],
    dimensions: objective !== undefined ? objective.dimensions : [],
  } satisfies CurriculumContext;
}

/** Student-scoped variant: needed when the context binds to a student's evidence. */
export function buildScopedCurriculumContext(
  input: BuildCurriculumContextInput & { readonly studentId?: string },
  catalog: CurriculumCatalog,
): CurriculumContext & { readonly studentId: string } {
  assertTenantContext(input.tenantId);
  if (input.studentId === undefined || input.studentId.trim() === "") {
    throw new CurriculumError("STUDENT_CONTEXT_MISSING", "studentId is required in scoped context");
  }
  return { ...buildCurriculumContext(input, catalog), studentId: input.studentId };
}

export interface ResolvedObjective {
  readonly objective: CurriculumObjectiveRef;
  readonly skills: readonly string[];
  readonly dimensions: readonly string[];
}

/** Resolve the objective anchored by the context, with its Skill/Dimension links. */
export function resolveObjective(context: CurriculumContext): ResolvedObjective {
  if (context.objective === undefined) {
    throw new CurriculumError("OBJECTIVE_NOT_FOUND", "no objective anchored in context");
  }
  return {
    objective: context.objective,
    skills: context.objective.skills,
    dimensions: context.objective.dimensions,
  };
}
