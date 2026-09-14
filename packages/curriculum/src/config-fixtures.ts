/**
 * Sample curriculum CONFIGURATION (data, not logic) — CORE-13C/S.
 * Proves the platform is global by architecture: the same code path serves
 * Egypt / Saudi Arabia / UK. These fixtures are used by the CORE-13 test
 * suite and are the template for tenant-provided catalogs.
 */
import type { CurriculumCatalog } from "./catalog.js";

const FRACTIONS = {
  unitId: "u-fractions",
  unitTitle: "Fractions",
  lessons: [
    {
      lessonId: "l-equiv-fractions",
      lessonTitle: "Equivalent Fractions",
      objectives: [
        {
          objectiveId: "o-equiv-fractions",
          objectiveText: "Understand equivalent fractions",
          skills: ["fraction-comparison"],
          dimensions: ["conceptual-understanding"],
        },
        {
          objectiveId: "o-add-fractions",
          objectiveText: "Add fractions with like denominators",
          skills: ["fraction-addition"],
          dimensions: ["procedural-fluency"],
        },
      ],
    },
  ],
};

export const EGYPT_CATALOG: CurriculumCatalog = {
  curricula: [
    {
      curriculumId: "eg-math-primary",
      curriculumName: "Egypt Primary Mathematics",
      country: "EG",
      language: "ar",
      educationSystem: "Ministry of Education EG",
      educationStage: "primary",
      grade: "4",
      gradeKey: "EG-PR-04",
      subject: "mathematics",
      versions: [
        {
          version: "2025",
          effectiveFrom: "2025-09-01",
          effectiveTo: "2026-08-31",
          status: "SUPERSEDED",
          books: [{ bookId: "eg-math-4-2025", bookTitle: "Mathematics Book 4 (2025)", units: [FRACTIONS] }],
        },
        {
          version: "2026",
          effectiveFrom: "2026-09-01",
          status: "ACTIVE",
          books: [{ bookId: "eg-math-4-2026", bookTitle: "Mathematics Book 4 (2026)", units: [FRACTIONS] }],
        },
        {
          version: "2027",
          effectiveFrom: "2027-09-01",
          status: "DRAFT",
          books: [{ bookId: "eg-math-4-2027", bookTitle: "Mathematics Book 4 (2027)", units: [FRACTIONS] }],
        },
      ],
    },
    // Multi-curriculum (CORE-13J): same subject+grade, alternative curricula
    {
      curriculumId: "eg-math-primary-accelerated",
      curriculumName: "Egypt Primary Mathematics — Accelerated",
      country: "EG",
      language: "ar",
      educationSystem: "Ministry of Education EG",
      educationStage: "primary",
      grade: "4",
      gradeKey: "EG-PR-04",
      subject: "mathematics",
      versions: [
        {
          version: "2026",
          effectiveFrom: "2026-09-01",
          status: "ACTIVE",
          books: [{ bookId: "eg-math-4-acc", bookTitle: "Accelerated Math 4", units: [FRACTIONS] }],
        },
      ],
    },
    {
      curriculumId: "eg-math-primary-international",
      curriculumName: "Egypt International Mathematics (EN)",
      country: "EG",
      language: "en",
      educationSystem: "International Schools EG",
      educationStage: "primary",
      grade: "4",
      gradeKey: "EG-PR-04",
      subject: "mathematics",
      versions: [
        {
          version: "2026",
          effectiveFrom: "2026-09-01",
          status: "ACTIVE",
          books: [{ bookId: "eg-math-4-intl", bookTitle: "International Math 4", units: [FRACTIONS] }],
        },
      ],
    },
    {
      curriculumId: "eg-math-primary-g5",
      curriculumName: "Egypt Primary Mathematics — Grade 5",
      country: "EG",
      language: "ar",
      educationSystem: "Ministry of Education EG",
      educationStage: "primary",
      grade: "5",
      gradeKey: "EG-PR-05",
      subject: "mathematics",
      versions: [
        {
          version: "2026",
          effectiveFrom: "2026-09-01",
          status: "ACTIVE",
          books: [{ bookId: "eg-math-5-2026", bookTitle: "Mathematics Book 5 (2026)", units: [FRACTIONS] }],
        },
      ],
    },
  ],
};

export const SAUDI_CATALOG: CurriculumCatalog = {
  curricula: [
    {
      curriculumId: "sa-math-primary",
      curriculumName: "Saudi Primary Mathematics",
      country: "SA",
      language: "ar",
      educationSystem: "Ministry of Education SA",
      educationStage: "primary",
      grade: "4",
      gradeKey: "SA-PR-04",
      subject: "mathematics",
      versions: [
        {
          version: "2026",
          effectiveFrom: "2026-08-01",
          status: "ACTIVE",
          books: [{ bookId: "sa-math-4", bookTitle: "الرياضيات الصف الرابع", units: [FRACTIONS] }],
        },
      ],
    },
  ],
};

export const UK_CATALOG: CurriculumCatalog = {
  curricula: [
    {
      curriculumId: "uk-math-key-stage-2",
      curriculumName: "UK National Curriculum Mathematics — KS2",
      country: "UK",
      language: "en",
      educationSystem: "National Curriculum UK",
      educationStage: "key-stage-2",
      grade: "year-4",
      gradeKey: "UK-KS2-Y4",
      subject: "mathematics",
      versions: [
        {
          version: "2026",
          effectiveFrom: "2026-09-01",
          status: "ACTIVE",
          books: [{ bookId: "uk-math-y4", bookTitle: "Power Maths Year 4", units: [FRACTIONS] }],
        },
      ],
    },
  ],
};

/** Tenant-scoped private curriculum — visible only to its tenant (CORE-13T). */
export const TENANT_PRIVATE_CATALOG: CurriculumCatalog = {
  curricula: [
    {
      curriculumId: "t1-private-literacy",
      curriculumName: "Tenant-1 Private Literacy",
      country: "EG",
      language: "ar",
      educationSystem: "Private School Network",
      educationStage: "primary",
      grade: "4",
      gradeKey: "EG-PR-04",
      subject: "literacy",
      tenantId: "11111111-1111-4111-8111-111111111111",
      versions: [
        {
          version: "2026",
          effectiveFrom: "2026-09-01",
          status: "ACTIVE",
          books: [{ bookId: "t1-lit-4", bookTitle: "T1 Literacy 4", units: [] }],
        },
      ],
    },
  ],
};

export const MERGED_CATALOG: CurriculumCatalog = {
  curricula: [
    ...EGYPT_CATALOG.curricula,
    ...SAUDI_CATALOG.curricula,
    ...UK_CATALOG.curricula,
    ...TENANT_PRIVATE_CATALOG.curricula,
  ],
};
