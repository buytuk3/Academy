# Architecture Decisions — CORE-13 Curriculum Foundation

Status: implemented locally; pending review. Production PostgreSQL/Redis NOT reached.

## AD-01 Persistence: NONE in CORE-13
The hierarchy has 12 levels but we do NOT create tables for them. Every level is
contract/configuration until a consumer (Reading/Dictation/Numeracy/Assessment/
Mastery) proves a persistence need. Any future migration must first pass an
architecture decision with: entity owner, legal relations, duplication check
against existing schema (evidence, slr, learner), and a real consumer. Decision:
**zero migration, zero schema change**. This keeps the longitudinal record in
Evidence (CORE-05) untouched.

## AD-02 Ownership
- Curriculum Foundation owns: hierarchy, versioning, context contracts,
  catalog queries. Package: `packages/curriculum`. Direction: packages → packages
  only (imports types from `@workspace/db`); never imported by engines; no
  knowledge of intelligence/decisions/events.
- Content ≠ Curriculum: Content Engine owns texts/audio/images/questions.
- Activity ≠ Curriculum: Activity layer owns what the student does now.
- Assessment ≠ Curriculum: Assessment Engine owns measurement (CORE-14+).
- Evidence ownership remains "core platform" (packages/database). Curriculum only
  supplies reference fields via `curriculumEvidenceLink()` — no duplication.

## AD-03 Global by Architecture, Local by Configuration
Country/language/system/stage/grade/curriculum are DATA (`config-fixtures.ts`,
tenant catalogs). Business logic contains zero country/curriculum literals.
`findCurricula`/`buildCurriculumContext` are country-agnostic; Egypt/Saudi/UK
fixtures prove it. Tenant-scoped curricula (catalog.tenantId) exist for private
configs; global entries (tenantId undefined) are shared.

## AD-04 Versioning
`catalog.versions[]` may hold 2025 (SUPERSEDED), 2026 (ACTIVE), 2027 (DRAFT)
side by side. `effectiveVersion(asOf)` picks the ACTIVE window; Evidence links
carry `curriculumRef = <id>@<version>` so old evidence never rewrites when a new
curriculum year lands → longitudinal continuity (grade/school/curriculum
changes never reset the Student Learning Record).

## AD-05 Identity & Separation
Subject ≠ Skill ≠ Dimension ≠ Objective: an objective maps to ≥1 skill, a skill
to ≥1 dimension (many-to-many allowed by catalog shape — no forced
one-to-one duplication). Curriculum ≠ Content ≠ Activity ≠ Assessment enforced
by distinct descriptor contracts cross-referencing by id only.

## AD-06 Grade is Context, not Judgement
`grade`/`gradeKey` are curriculum-location labels. No overall/global student
level exists anywhere in the foundation (no studentLevel/overallScore fields).

## AD-07 Out of scope (per CORE-13V/U)
No UI, no Curriculum Engine, no Content/Activity/Assessment storage, no ML/LLM,
no autonomous decisions, no delivery. CORE-14 (Dictation Engine Foundation)
starts only after explicit approval.
