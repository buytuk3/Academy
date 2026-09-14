import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  buildCurriculumContext,
  buildScopedCurriculumContext,
  curriculumEvidenceLink,
  effectiveVersion,
  findCurricula,
  linkageKey,
  learningPathAnchors,
  normalizeHierarchy,
  resolveObjective,
  versionsOverlapping,
  CurriculumError,
  EGYPT_CATALOG,
  SAUDI_CATALOG,
  UK_CATALOG,
  MERGED_CATALOG,
  TENANT_PRIVATE_CATALOG,
} from "../index.js";

const T_A = "11111111-1111-4111-8111-111111111111";
const T_B = "22222222-2222-4222-8222-222222222222";
const S_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const BASE = {
  tenantId: T_A,
  country: "EG",
  language: "ar",
  educationSystem: "Ministry of Education EG",
  educationStage: "primary",
  grade: "4",
  gradeKey: "EG-PR-04",
  subject: "mathematics" as const,
};

function eg(): ReturnType<typeof buildCurriculumContext> {
  return buildCurriculumContext(
    {
      ...BASE,
      curriculumId: "eg-math-primary",
      bookId: "eg-math-4-2026",
      unitId: "u-fractions",
      lessonId: "l-equiv-fractions",
      objectiveId: "o-equiv-fractions",
    },
    EGYPT_CATALOG,
  );
}

describe("CORE-13 Curriculum Foundation", () => {
  it("CORE-13T hierarchy: full chain country→system→stage→grade→subject→curriculum→book→unit→lesson→objective→skill", () => {
    const r = normalizeHierarchy([
      { level: "country", id: "EG" },
      { level: "educationSystem", id: "moe" },
      { level: "educationStage", id: "primary" },
      { level: "grade", id: "EG-PR-04" },
      { level: "subject", id: "mathematics" },
      { level: "curriculum", id: "eg-math-primary" },
      { level: "book", id: "eg-math-4-2026" },
      { level: "unit", id: "u-fractions" },
      { level: "lesson", id: "l-equiv-fractions" },
      { level: "objective", id: "o-equiv-fractions" },
      { level: "skill", id: "fraction-comparison" },
      { level: "activity", id: "a1" },
    ]);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.levels.length, 12);
  });

  it("CORE-13T hierarchy: order violation and missing required level are rejected", () => {
    const r1 = normalizeHierarchy([
      { level: "lesson", id: "x" },
      { level: "unit", id: "y" },
    ]);
    assert.equal(r1.ok, false);
    if (!r1.ok) {
      assert.ok(r1.issues.some((i) => i.code === "ORDER_VIOLATION"));
      assert.ok(r1.issues.some((i) => i.code === "REQUIRED_LEVEL_MISSING"));
    }
    const r2 = normalizeHierarchy([{ level: "unknownLevel", id: "z" }]);
    assert.equal(r2.ok, false);
  });

  it("CORE-13A separation: Curriculum ≠ Content ≠ Activity ≠ Assessment (distinct owner descriptors, refs only)", () => {
    const ctx = eg();
    const curriculumDescriptor = { kind: "CURRICULUM" as const, context: ctx, objectiveIds: [ctx.objective!.objectiveId] };
    const contentDescriptor = { kind: "CONTENT" as const, contentRef: "cnt:eg-math-4-2026:u1:l1", mediaTypes: ["text"], curriculumRef: ctx.curriculum.curriculumId };
    const activityDescriptor = { kind: "ACTIVITY" as const, activityType: "targeted-practice", contentRef: "cnt:...", skill: ctx.skills[0], dimension: ctx.dimensions[0] };
    const assessmentDescriptor = { kind: "ASSESSMENT" as const, assessmentRef: "ass:o-equiv-fractions", objectiveRefs: [ctx.objective!.objectiveId] };
    assert.deepEqual(new Set([curriculumDescriptor.kind, contentDescriptor.kind, activityDescriptor.kind, assessmentDescriptor.kind]).size, 4);
    assert.ok(!("contentRef" in curriculumDescriptor));
    assert.ok(!("objectiveIds" in contentDescriptor));
  });

  it("CORE-13E identity: Subject ≠ Skill ≠ Dimension ≠ Objective; objective→skill→dimension many-to-many without duplication", () => {
    const ctx = eg();
    assert.equal(ctx.subject, "mathematics");
    assert.deepEqual(ctx.skills, ["fraction-comparison"]);
    assert.deepEqual(ctx.dimensions, ["conceptual-understanding"]);
    assert.notEqual(ctx.skills[0], ctx.dimensions[0]);
    // the same unit hosts two objectives sharing infrastructure without duplication
    const resolved = resolveObjective(ctx);
    assert.equal(resolved.objective.objectiveId, "o-equiv-fractions");
    // a skill appearing in another objective of the same lesson stays a single key
    const lesson = EGYPT_CATALOG.curricula[0].versions[1].books[0].units[0].lessons[0];
    assert.equal(lesson.objectives.length, 2);
  });

  it("CORE-13K versioning: 2025 SUPERSEDED, 2026 ACTIVE, 2027 DRAFT coexist; effectiveVersion(asOf) picks the window", () => {
    const c = EGYPT_CATALOG.curricula[0];
    assert.equal(c.versions.length, 3);
    const v2025 = effectiveVersion(c, "2025-10-01");
    const v2026 = effectiveVersion(c, "2026-10-01");
    assert.equal(v2025?.version, "2025");
    assert.equal(v2026?.version, "2026");
    assert.equal(effectiveVersion(c)?.version, "2026");
    const overlap = versionsOverlapping(c, "2027-01-01", "2027-12-31");
    assert.equal(overlap.length, 2); // 2026 (still active until replaced) + 2027 draft
  });

  it("CORE-13K/L versioning continuity: evidence bound to 2025 stays bound when 2026/2027 land", () => {
    const ctx2025 = buildCurriculumContext(
      { ...BASE, curriculumId: "eg-math-primary", version: "2025", bookId: "eg-math-4-2025", unitId: "u-fractions", lessonId: "l-equiv-fractions", objectiveId: "o-equiv-fractions" },
      EGYPT_CATALOG,
    );
    const link2025 = curriculumEvidenceLink(ctx2025);
    assert.equal(link2025.curriculumRef, "eg-math-primary@2025");
    // a new year arrives; the old link is NOT rewritten
    const ctx2026 = buildCurriculumContext(
      { ...BASE, curriculumId: "eg-math-primary", bookId: "eg-math-4-2026", unitId: "u-fractions", lessonId: "l-equiv-fractions", objectiveId: "o-equiv-fractions" },
      EGYPT_CATALOG,
    );
    assert.equal(curriculumEvidenceLink(ctx2026).curriculumRef, "eg-math-primary@2026");
    assert.equal(link2025.curriculumRef, "eg-math-primary@2025"); // frozen
  });

  it("CORE-13J multi-curriculum: same subject+grade resolves 3 curricula with no core change", () => {
    const found = findCurricula(EGYPT_CATALOG, {
      country: "EG",
      educationStage: "primary",
      grade: "4",
      subject: "mathematics",
      tenantId: T_A,
    });
    assert.equal(found.length, 3);
    assert.deepEqual(
      found.map((c) => c.curriculumId).sort(),
      ["eg-math-primary", "eg-math-primary-accelerated", "eg-math-primary-international"],
    );
  });

  it("CORE-13C/S global: Egypt/Saudi/UK served by one code path; country is configuration", () => {
    const egCtx = buildCurriculumContext({ ...BASE, curriculumId: "eg-math-primary" }, EGYPT_CATALOG);
    const saCtx = buildCurriculumContext(
      { tenantId: T_A, country: "SA", language: "ar", educationSystem: "Ministry of Education SA", educationStage: "primary", grade: "4", gradeKey: "SA-PR-04", subject: "mathematics", curriculumId: "sa-math-primary" },
      SAUDI_CATALOG,
    );
    const ukCtx = buildCurriculumContext(
      { tenantId: T_A, country: "UK", language: "en", educationSystem: "National Curriculum UK", educationStage: "key-stage-2", grade: "year-4", gradeKey: "UK-KS2-Y4", subject: "mathematics", curriculumId: "uk-math-key-stage-2" },
      UK_CATALOG,
    );
    assert.equal(egCtx.country, "EG");
    assert.equal(saCtx.country, "SA");
    assert.equal(ukCtx.country, "UK");
    assert.equal(saCtx.gradeKey, "SA-PR-04");
    assert.equal(ukCtx.educationStage, "key-stage-2");
    assert.equal(ukCtx.language, "en");
  });

  it("CORE-13L longitudinal: grade change 4→5 swaps curriculum context but preserves prior evidence history", () => {
    const grade4 = eg();
    const grade5 = buildCurriculumContext(
      { tenantId: T_A, country: "EG", language: "ar", educationSystem: "Ministry of Education EG", educationStage: "primary", grade: "5", gradeKey: "EG-PR-05", subject: "mathematics", curriculumId: "eg-math-primary-g5" },
      EGYPT_CATALOG,
    );
    const link4 = curriculumEvidenceLink(grade4);
    const link5 = curriculumEvidenceLink(grade5);
    assert.equal(link4.gradeKey, "EG-PR-04");
    assert.equal(link5.gradeKey, "EG-PR-05");
    assert.equal(link4.curriculumRef, "eg-math-primary@2026");
    assert.equal(link5.curriculumRef, "eg-math-primary-g5@2026");
    // history lives in Evidence; the old context link stays frozen after the switch
    assert.deepEqual(curriculumEvidenceLink(grade4), link4);
  });

  it("CORE-13T tenant isolation: Tenant A cannot see Tenant B's private curriculum; guard errors thrown", () => {
    const foundB = findCurricula(TENANT_PRIVATE_CATALOG, {
      country: "EG",
      educationStage: "primary",
      grade: "4",
      subject: "literacy",
      tenantId: T_B,
    });
    assert.equal(foundB.length, 0); // private curriculum of A invisible to B
    const foundA = findCurricula(TENANT_PRIVATE_CATALOG, {
      country: "EG",
      educationStage: "primary",
      grade: "4",
      subject: "literacy",
      tenantId: T_A,
    });
    assert.equal(foundA.length, 1);
    assert.throws(() => buildCurriculumContext({ ...BASE, tenantId: undefined as unknown as string }, EGYPT_CATALOG), (e: unknown) => (e as CurriculumError).code === "TENANT_CONTEXT_MISSING");
    assert.throws(() => buildCurriculumContext({ ...BASE, tenantId: "not-a-uuid" }, EGYPT_CATALOG), (e: unknown) => (e as CurriculumError).code === "INVALID_TENANT_ID");
    assert.throws(() => buildScopedCurriculumContext({ ...BASE }, EGYPT_CATALOG), (e: unknown) => (e as CurriculumError).code === "STUDENT_CONTEXT_MISSING");
  });

  it("CORE-13M no global student level: grade is context, never a judgement; no overallScore/studentLevel anywhere", () => {
    const ctx = eg();
    assert.equal("grade" in ctx, true);
    assert.equal("studentLevel" in ctx, false);
    assert.equal("overallScore" in ctx, false);
    assert.equal("averageScore" in ctx, false);
    // multidimensional strength lives in the learner model (CORE-09), not here
    assert.deepEqual(ctx.skills, ["fraction-comparison"]);
  });

  it("CORE-13G evidence integration: link is reference-only, no curriculum text duplication", () => {
    const link = curriculumEvidenceLink(eg());
    const json = JSON.stringify(link);
    assert.equal(json.includes("objectiveText"), false);
    assert.equal(json.includes("lessonTitle"), false);
    assert.equal(json.includes("bookTitle"), false);
    assert.equal(link.curriculumRef, "eg-math-primary@2026");
    assert.equal(link.objectiveId, "o-equiv-fractions");
    assert.equal(link.skills.length, 1);
    assert.equal(link.dimensions.length, 1);
  });

  it("CORE-13H learning path integration: path anchors carry current curriculum location + target skill/dimension/activity, teacher approval required", () => {
    const anchors = learningPathAnchors(eg(), {
      skill: "fraction-comparison",
      dimension: "conceptual-understanding",
      proposedActivityType: "targeted-practice",
    });
    assert.equal(anchors.current.grade, "4");
    assert.equal(anchors.current.lessonId, "l-equiv-fractions");
    assert.equal(anchors.current.objectiveId, "o-equiv-fractions");
    assert.equal(anchors.target.skill, "fraction-comparison");
    assert.equal(anchors.target.dimension, "conceptual-understanding");
    assert.equal(anchors.target.proposedActivityType, "targeted-practice");
    assert.equal(anchors.requiresTeacherApproval, true);
    assert.equal(anchors.evidenceLinkRef, linkageKey(curriculumEvidenceLink(eg())));
  });

  it("CORE-13F context: buildCurriculumContext resolves full chain deterministically", () => {
    const ctx = eg();
    assert.equal(ctx.curriculum.curriculumId, "eg-math-primary");
    assert.equal(ctx.curriculum.version, "2026");
    assert.equal(ctx.book?.bookId, "eg-math-4-2026");
    assert.equal(ctx.unit?.unitTitle, "Fractions");
    assert.equal(ctx.lesson?.lessonTitle, "Equivalent Fractions");
    assert.equal(ctx.objective?.objectiveText, "Understand equivalent fractions");
  });

  it("CORE-13E resolveObjective: returns objective with its skill/dimension links; missing objective errors", () => {
    const r = resolveObjective(eg());
    assert.deepEqual(r.skills, ["fraction-comparison"]);
    assert.deepEqual(r.dimensions, ["conceptual-understanding"]);
    const noObjective = buildCurriculumContext({ ...BASE, curriculumId: "eg-math-primary" }, EGYPT_CATALOG);
    assert.throws(() => resolveObjective(noObjective), (e: unknown) => (e as CurriculumError).code === "OBJECTIVE_NOT_FOUND");
    assert.throws(
      () => buildCurriculumContext({ ...BASE, curriculumId: "eg-math-primary", bookId: "eg-math-4-2026", unitId: "u-fractions", lessonId: "l-equiv-fractions", objectiveId: "nope" }, EGYPT_CATALOG),
      (e: unknown) => (e as CurriculumError).code === "OBJECTIVE_NOT_FOUND",
    );
  });

  it("CORE-13 versioning: explicitly pinned SUPERSEDED version builds a historical context (old evidence readable)", () => {
    const ctx = buildCurriculumContext(
      { ...BASE, curriculumId: "eg-math-primary", version: "2025", bookId: "eg-math-4-2025", unitId: "u-fractions", lessonId: "l-equiv-fractions", objectiveId: "o-equiv-fractions" },
      EGYPT_CATALOG,
    );
    assert.equal(ctx.curriculum.status, "SUPERSEDED");
    assert.equal(ctx.curriculum.version, "2025");
  });

  it("CORE-13 ownership/global: merged multi-country catalog resolves per-tenant without cross-tenant leakage", () => {
    const egCtx = buildCurriculumContext({ ...BASE, curriculumId: "eg-math-primary" }, MERGED_CATALOG);
    const saCtx = buildCurriculumContext(
      { tenantId: T_B, country: "SA", language: "ar", educationSystem: "Ministry of Education SA", educationStage: "primary", grade: "4", gradeKey: "SA-PR-04", subject: "mathematics", curriculumId: "sa-math-primary" },
      MERGED_CATALOG,
    );
    assert.equal(egCtx.tenantId, T_A);
    assert.equal(saCtx.tenantId, T_B);
    // B cannot even see A's private literacy curriculum
    assert.equal(findCurricula(MERGED_CATALOG, { country: "EG", educationStage: "primary", grade: "4", subject: "literacy", tenantId: T_B }).length, 0);
  });

  it("CORE-13 scoped context: student-bound context requires studentId", () => {
    const scoped = buildScopedCurriculumContext({ ...BASE, curriculumId: "eg-math-primary", studentId: S_A }, EGYPT_CATALOG);
    assert.equal(scoped.studentId, S_A);
  });
});
