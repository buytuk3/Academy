# Architecture Decisions — CORE-14 Dictation Engine Foundation

Status: implemented locally; pending review. Production PostgreSQL/Redis NOT reached.

## AD-01 Ownership
`engines/dictation-engine` owns ONLY dictation-specific measurement/comparison/
language-policy logic. It owns NO Evidence, NO SLR, NO Learner Model, NO
Intelligence, NO Decisions, NO Intervention, NO Mastery, NO Curriculum — each
has its canonical owner elsewhere. Direction: engines → packages only
(imports `@workspace/db` via the Evidence Writer contract and
`@workspace/curriculum` types for reference-only links). No `packages → engines`.

## AD-02 Deterministic first (CORE-14T)
Comparison is RULE-based: LCS word-alignment + Levenshtein for misspellings,
Arabic/English normalization packs. `DICTATION_MEASUREMENT_SOURCE = "RULE"`.
Statistical/ML/AI layers are later; ML/LLM never owns a decision.

## AD-03 Language as plug-in packs (CORE-14H/I)
Normalization/Comparison/Scoring are injectable policy interfaces. Arabic and
English are packs registered in `language.ts`; a third language = a new pack,
zero core-engine change. Arabic folds alef forms + harakat by default while
keeping spelling-sensitive taa-marbuta/alef-maqsura; knobs exist per activity.

## AD-04 Time evidence (CORE-14P)
`listeningDurationMs`, `responseDurationMs`, `totalActivityDurationMs` are
distinct; `responseTimeMs` prefers response duration when present. Listening is
never conflated with answering.

## AD-05 Evidence path (CORE-14J/K)
Engine → Measurements → canonical Evidence Writer (`recordEvidence`) → Evidence.
`evidenceType: attempt`, `sourceEngine: dictation-engine`, stable
`operationKey: dictation:attempt:{attemptId}`. No `dictation_evidence` table,
no second evidence store, no fs/audio storage, no DB client in the engine.

## AD-06 Inference boundary (CORE-14R/S)
`SpeechRecognitionProvider` + `InferenceGateway` contracts exist but are NOT
invoked in CORE-14. Future path: Engine → Contract → Inference Gateway →
Provider/Model → Measurement → Evidence. The engine never calls a provider
directly; STT stays replaceable.

## AD-07 No persistence (CORE-14X)
Zero migrations, zero tables. If a real consumer proves a persistence need, the
request must stop with `ARCHITECTURE CHANGE REQUIRED` carrying entity ownership,
reason, relationships, duplication analysis vs existing schema (evidence/slr/
learner), migration impact, and alternatives — before any migration.

## AD-08 Adaptive dictation (CORE-14M)
Failure → replay/segmentation/speed/time/hint/reassessment flows are decided by
Learning Intelligence / Intervention / Teacher Decision layers later — never by
the engine. No autonomous delivery, no teacher-decision logic inside the engine.

## AD-09 Security (CORE-14Q)
Audio is an object-storage REFERENCE (`audioRef`) only; never inline bytes,
never the DB, never read by the engine. Tenant/student guards emit the
canonical errors (TENANT_CONTEXT_MISSING / INVALID_TENANT_ID /
STUDENT_CONTEXT_MISSING / INVALID_STUDENT_ID).
