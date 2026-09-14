# Architecture Decisions — CORE-15 (Numeracy Engine Foundation)

- Date: 2026-09-09 · Owner: numeracy-engine (single owner) · Status: proposal (awaiting approval)
- Baseline: d233c9ab14828432d88795f3593062ee9e6c9335 (CORE-14 approved + risk register)

## AD-15-01 — Numeracy is a Capability Engine, not a system of record
Numeracy != Assessment != Mastery != Diagnosis != Intelligence.
The engine owns ONLY: response parsing/normalization, deterministic
comparison, step analysis, error-pattern extraction, multidimensional
measurements, response-time measurement, and Evidence preparation via the
canonical Evidence Writer. It owns NO evidence store, NO SLR, NO learner
model, NO intelligence, NO decisions, NO curriculum store, NO UI, NO DB
tables. packages → engines = 0 must hold.

## AD-15-02 — Zero persistence (until proven otherwise)
No new tables, no new migrations. All measurements flow to Evidence via
recordEvidence() from packages/database (lazy dynamic import — no DB
client at module scope). If a real architectural need appears, STOP and
raise "ARCHITECTURE CHANGE REQUIRED" before any change.

## AD-15-03 — Step-aware, not step-forced
Activities MAY provide intermediate steps (final-only is fully supported).
Steps are used only for error-pattern extraction (carry, borrow, place
value, operation, sequencing, multiplication-table, division-remainder);
student steps are never re-stored as a second copy of activity data.

## AD-15-04 — Evidence-first, not Teaching-first
No in-engine feedback decisions, no auto-hint, no auto-teach, no
auto-delivery. The chain stays: Measurement → Evidence → Learner Model →
Intelligence → Proposal → Teacher Review → Delivery → Reassessment →
Outcome. requiresTeacherApproval stays true for any proposal path.

## AD-15-05 — Digits are policies, not core logic
Western and Arabic-Indic digit scripts fold deterministically to ASCII via
injectable DigitNormalizationPolicy. A third digit system = a new policy
pack, no engine change. Comparison core is language-agnostic.

## AD-15-06 — Inference boundary
Handwriting/OCR/voice recognition are replaceable interfaces behind an
Inference Gateway contract (unused in CORE-15). No direct provider/LLM
imports. Deterministic RULE comparison only; statistical/ML layers may
come later tagged with source (RULE/STATISTICAL/ML/AI/TEACHER) per
CORE-09.

## AD-15-07 — Curriculum by reference only
CurriculumContext from packages/curriculum is referenced (country,
language, stage, grade, subject, curriculum, book, unit, lesson, objective,
skill, dimension). Never copied; no dependency on any curriculum store.

## AD-15-08 — Multidimensional measurements, no aggregate score
Accuracy/step-accuracy/error-count/error-patterns/time are measurement
dimensions mapped via a config-driven registry. No overallScore, no
studentLevel, no globalMathScore, no numeracyScore.
