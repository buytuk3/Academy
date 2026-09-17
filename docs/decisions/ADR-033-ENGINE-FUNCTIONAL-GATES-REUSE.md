# ADR-033 — PHASE-10 Engine Functional Gates: Adapter Reuse Without New Surfaces; Ratings Deferral

Status: ADOPTED (2026-09-17, PHASE-10 closeout) · Relates to: ADR-028 (D-3), ADR-029 (Express 5 gateway), ADR-031/032 (additive thin adapters), CORE-15/25/26B (engine bindings + adapters), ACR-24-001 (content/exercise library)

## Context
PHASE-10 acceptance (MASTER_ROADMAP): «per-engine functional gates pass» for ENGINES-ASSESSMENT-DICTATION-DIAGNOSIS-CONTENT-LESSON. Trace at phase open (from the pinned 1.13 tree @ `6590522`): the three sync engines are ALREADY implemented and wired in the canonical engine-adapters registry (DICTATION → compareDictation+computeMeasurements; NUMERACY → analyzeNumeracy with the 16-kind error taxonomy; ASSESSMENT → evaluateAssessment rubric), invoked ONLY through the canonical `/v1/attempts` execution runtime (binding-resolved, strict engine-owned input validation, canonical Evidence single-writer), with READING proven async via the analyze queue (P1/P2). Content/Lesson are covered by the CORE-24 library (`content_definitions` open registry kinds: PASSAGE/LESSON) with existing `/v1/lessons`, `/v1/exercises`, publish/supersede surfaces.

## Decision
1. **Zero new endpoints, zero migrations, zero new libraries.** The stage's deliverable is PROOF, not plumbing: the per-engine gates drive real student attempts through the canonical attempts flow against REAL engine-bound exercises and assert the REAL canonical Evidence rows (sourceEngine numeracy-engine / dictation-engine / assessment-engine) and the measured values (wrong numeracy answer → accuracy 0; perfect dictation transcription → accuracy 1; all-correct 2-item rubric → rubricScore 1).
2. **Teacher shell panels become real thin clients** over the existing canonical surfaces: passages → `GET /v1/lessons?kind=PASSAGE`, lessons → `GET /v1/lessons`, exercises → `GET /v1/exercises`, voice-qa → `GET /v1/exercises?engineBinding=READING` (the async READING engine stays queue-proven, P1/P2), analytics → `GET /v1/oversight/aggregates` (CLASS-scope teacher → real empty groups; k-anonymity intact). Zero mock data (ACR-E5-001).
3. **Ratings stays an explicit placeholder re-targeted PHASE-11.** No canonical ratings table exists in the schema; creating one would require migration 0009 + a new write path — a NEW capability, not an engine-functional proof, and the coordination/gamification family (PHASE-11) is its roadmap home. Reuse-first and the zero-migration constraint win; the placeholder keeps the honest «غير مدعومة بعد» UX.
4. **Diagnosis** is covered by the canonical learning-loop diagnose step already proven end-to-end in P1/E1 (learning_diagnoses → intervention_proposals); no separate gate is added (no new code to test).

## Alternatives rejected
- **New `/v1/engines/*` endpoints wrapping the adapters** — duplicates the canonical attempts surface (the adapters are already bound there by CORE-25/26B); a second path would split the evidence-writer seam and violate the Architecture Contract (thin adapters, one canonical flow).
- **Migration 0009 for `ratings`** — unjustified by the stage acceptance («per-engine functional gates pass»); ratings are not an engine measurement and have no canonical table today; deferral documented instead of a speculative schema.
- **Mock engine harness in the gate** — the adapters invoke the REAL engines; mocking would prove nothing. The gate runs the real stack (browser + API + PG + Redis).
- **Separate per-engine E2E files** — one gate file with per-engine cases keeps the matrix green-run cheap and mirrors the p7/p8/p9 single-file pattern.

## Consequences
- PHASE-10 closes on existing surfaces with a new real-browser gate `tests/core-32/p10-engines-capabilities.e2e.test.ts` (5/5).
- Deferred (roadmap-anchored): ratings table + UX → PHASE-11; admin models/settings surfaces → PHASE-12; READING sync adapter intentionally absent (async by design).
