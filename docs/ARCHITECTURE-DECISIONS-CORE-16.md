# Architecture Decisions — CORE-16 (Assessment / Student Readiness Foundation)

- Date: 2026-09-09 · Owner: assessment-engine (single owner) · Status: proposal (awaiting approval)
- Baseline: 8055072baa857603d89fb364dea9bb4a9ea2e78d (CORE-15 approved + core-15-checkpoint)

## AD-16-01 — Assessment is a Capability Engine inside the Intelligence Platform
Assessment != Readiness != Mastery != Diagnosis != Intelligence != Intervention.
The engine owns: assessment definition, structure, item/task references,
attempt context, response evaluation orchestration, rubric/scoring policy,
assessment measurements, readiness measurements, and Evidence preparation
via the canonical Evidence Writer. It owns NO evidence store, NO SLR, NO
learner model, NO intelligence, NO diagnosis, NO intervention, NO mastery,
NO curriculum store, NO teacher-decision store, NO UI, NO autonomous
delivery. packages → engines = 0 must hold.

## AD-16-02 — Assessment is not (only) a score
A rubric-scoped total MAY exist for one assessment ("in this assessment,
per this rubric, the student scored X"). A GLOBAL student score is
FORBIDDEN: no overallScore, no studentLevel, no global*Score, no average
ability. The Learner Model builds the longitudinal multidimensional
picture from Evidence — never this engine.

## AD-16-03 — Multidimensional & config-driven
Dimensions (knowledge, skill, accuracy, fluency, response-time,
comprehension, application, reasoning, consistency, completion) live in an
OPEN registry; assessment definitions select their own dimension set.
Subject != Skill != Dimension != EvidenceType (CORE-09 principle).

## AD-16-04 — Assessment types over a shared core model
diagnostic / formative / summative / baseline / readiness / progress /
reassessment are all KINDS of one AssessmentDefinition — never separate
systems.

## AD-16-05 — Readiness is advisory, deterministic, evidence-grounded
READY / NOT_READY / INSUFFICIENT_EVIDENCE / REQUIRES_TEACHER_REVIEW are
computed from prerequisite references, required evidence (count,
consistency, recency, response speed) and rubric measurement. The result
NEVER forces a path, never auto-delivers, never mutates curriculum —
Interpretation belongs to Learning Intelligence and the Teacher.

## AD-16-06 — Longitudinal continuity by reference
Grade transitions (Grade 4 → Grade 5), stage transitions and school/tenant
continuity are modeled as PRIOR CONTEXT REFERENCES + evidence references.
Historical Evidence is never cleared; a new assessment only ADDS evidence.

## AD-16-07 — Zero persistence (until proven otherwise)
No new tables, no new migrations. Evidence flows via recordEvidence() from
packages/database (lazy dynamic import — no DB client at module scope). If
a real architectural need appears: STOP and raise "ARCHITECTURE CHANGE
REQUIRED" before any change.

## AD-16-08 — Evidence-first; Teacher boundary; Inference boundary
No auto-teaching, no auto-hint, no auto-delivery, no adaptive question
selection inside the engine. Any proposal from assessment evidence passes:
Evidence → Analysis → Proposal → Teacher Review → Approve/Modify/Reject.
Recognition providers (OCR/handwriting/voice, future) stay behind an
Inference Gateway contract; deterministic RULE only in CORE-16; future
layers tagged source (RULE/STATISTICAL/ML/AI/TEACHER) per CORE-09.
