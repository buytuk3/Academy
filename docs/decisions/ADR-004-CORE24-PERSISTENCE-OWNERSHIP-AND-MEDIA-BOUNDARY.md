# ADR-004 — CORE-24 Persistence Ownership, Layer-Separation Invariant & Media Boundary

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


- **Status:** ACCEPTED (Wave 0 — documentation only; implementation gated by Wave 1/2 closeouts)
- **Date:** 2026-09-11
- **Baseline:** `1d7ee7a6b3a6992652b76a9c5628438899d53606` (CORE-23f), git clean (DIRTY=0)
- **Implements:** ACR-24/001 (Persistent Content & Exercise Library), ACR-24/002 (Persistent Activity Assignment & Attempt State) — both PROPOSED for owner review at Wave-0 closeout
- **Supersedes:** nothing (additive)
- **Related:** ADR-002 (student transfer identity — transfer safety preserved), ADR-003 (child data retention — future, R-010), CORE-22 closeout ("persisted content library = future ACR" — this ADR fulfills that), CORE-24 Product Gap & Architecture Report (§16/§17/§23)

---

## 1. Context

CORE-24 (approved INSPECT) established that the teaching architecture (CORE-17→23) is verified and complete,
and the product gap is persistence + API + runtime wiring + web. Two ACRs define additive persistence:

- **ACR-24/001** → tables `content_definitions`, `exercise_definitions` (migration `0004`).
- **ACR-24/002** → tables `activity_assignments`, `activity_attempts` (migration `0005`).

This ADR records the ownership, separation, media and migration-discipline decisions that govern both.

## 2. Decision 1 — Ownership: core-platform, additive, zero transfers

**The owner of all four new tables and their capability code is `core-platform`, located in `packages/database`.**

Ownership verification at Wave 0 (machine-checkable map, `packages/database/src/evidence/ownership.ts`, quoted
from the file at baseline): 23 keys — `reading.measurements`→`reading-engine`; `evidence`,
`student-learning-record`, `learning-loop`, `learner-model`, `student-identity`, `student-membership`,
`student-history-share`, `organization`, `school`, `staff-membership`, `authorization-scope`,
`educational-aggregation`, `educational-access-policy`, `activity-foundation`, `content-foundation`
→`core-platform`; `assessment`→`assessment-engine`; `mastery`→`mastery-engine`; `diagnosis`→`learning-diagnosis`;
`intervention`→`intervention-engine`. **No key is reassigned by CORE-24.**

The map gains three **additive** keys, applied in code WITH their migrations (not in Wave 0, which is docs-only):

| New key | Owner | Introduced by | Wave |
|---|---|---|---|
| `content-library` | core-platform | ACR-24/001 | Wave 1 |
| `activity-assignment-state` | core-platform | ACR-24/002 | Wave 2 |
| `activity-attempt-state` | core-platform | ACR-24/002 | Wave 2 |

Rationale: `packages/database` is already the canonical storage/capability owner for identity (CORE-18),
organization/scope (CORE-19), oversight (CORE-20), activity/content contracts (CORE-21/22) and execution (CORE-23).
Engines keep measurement ownership; no engine gains or loses storage; no second store is created.

## 3. Decision 2 — The separation invariant (test-enforced from Wave 1 onward)

```
Content ≠ Exercise ≠ Activity ≠ Assignment ≠ Attempt ≠ Evidence ≠ Assessment
```

- **Evidence remains the single canonical learning fact.** The canonical Evidence Writer
  (`recordEvidence`, dedup on `(tenant_id, operation_key)`) stays the ONLY path that records learning facts.
- The new tables store **definitions and operational/administrative state only**:
  - `content_definitions` / `exercise_definitions`: library definitions — NO evidence rows, NO attempt results,
    NO student data of any kind (no student-owned column exists).
  - `activity_assignments` / `activity_attempts`: assignment lifecycle and attempt lifecycle state. The attempt
    row links to its canonical fact via a **pointer** (`evidence_ref` → Evidence row id) — never a copy; no
    measurement values, scores, or response payloads are stored on the attempt row.
- Curriculum stays canonical (CORE-13); every persisted definition/assignment/attempt carries the mandatory
  immutable `curriculum_version` reference (21-O).
- Version binding: activities/assignments/exercises pin concrete definition row versions; superseded versions are
  never mutated (new row + SUPERSEDED status).

## 4. Decision 3 — Media boundary: NO shared Media Platform (owner decision, 2026-09-11)

- Audio/media handling **stays owned by `reading-engine`** (its `security/s3-client.ts` upload/download/presign,
  S3+KMS, `/api/audio/presign`) for the reading flow.
- Library content stores **references only** (`body_ref`); audio is NEVER inline (R-003/R-004), and binaries are
  never stored in PostgreSQL.
- A shared media abstraction (e.g. for Dictation/Listening/Content media) is **deferred** until a real need from
  those flows exists; it then requires a **standalone ACR** before any implementation.
- Access control, retention and signed-URL policy for reading audio remain with the reading engine boundary;
  child-data retention of audio is governed by R-010 / future ADR-003 execution.

## 5. Decision 4 — Migration discipline (unchanged from R-008/ADR-001)

- Path: Schema (`packages/database/src/schema`) → drizzle-kit generate → review SQL → fresh-DB `db-migrate.mjs`
  → drift-check **drift = 0** → tests. `db.push` is dev-only, never production.
- `0004`/`0005` are **purely additive**; zero destructive statements against `0000..0003` objects; forward-only,
  no automatic rollback (reverse DDL documented in the ACRs, never executed by tooling).
- Existing test gates that pin migration tags `0000..0003` (CORE-21/22/23 zero-new-tables assertions) are extended
  to include the new tags **with these ACRs as the documented justification** — no silent gate edits.
- Pre-check executed at Wave 0 (this baseline): **zero** occurrences of `content_definitions` /
  `exercise_definitions` / `activity_assignments` / `activity_attempts` (or their record-contract names) in
  schema or migrations — no conflicting alternative appeared after the CORE-24 report.

## 6. Security & privacy invariants carried by the ACRs

Composite tenant FKs (CORE-18/19 pattern) reject cross-tenant writes at the DB level; every mutation carries
`operation_key` idempotency; capability audit uses the existing `audit_logs` with reason codes only — no PII, no
religion values, no content bodies, no audio in logs; student transfer (ADR-002) never rewrites assignment/attempt
rows or evidence.

## 7. Consequences

- Waves 1/2 are mechanical implementations of these decisions (schema → migrate → capability code → tests).
- Zero behavioral change to CORE-17→23: contracts, orchestrators, engines, events, evidence path untouched.
- Risk register: R-011/R-012 remain configuration policies; R-010 (child data retention) is untouched and remains
  the gate for real-school onboarding (Wave 8/9); this ADR adds no new risks.

## 8. Verification gates (per Wave, unchanged from CORE-24 mandate)

TSC = 0 · regression 17→23 green · drift = 0 · fresh-DB migrate from zero · idempotency + concurrency proofs ·
tenant-isolation proofs · audit hygiene · `git status` clean at every closeout.
