# ADR-028 — COMPLETE PROJECT REFERENCE ARCHIVES & SEQUENTIAL VERSION GOVERNANCE

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md) (**unmodified by this ADR**)
> **Execution Protocol:** [`docs/reference/MANDATORY_EXECUTION_PROTOCOL.md`](../reference/MANDATORY_EXECUTION_PROTOCOL.md)
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

**Date:** 2026-09-16 · **Status:** APPROVED — **FORMALLY ADOPTED by owner (2026-09-16 adoption ruling: «consider this message the official adoption of ADR-028»)** — binding governance, part of the Execution Reference · **Amended:** 2026-09-16 — **D-12 added by the same owner adoption** (Downloadable Official Release) · **Amends:** `docs/reference/EXECUTION-REFERENCE.md`
**Scope of this record:** governance documentation ONLY. No code changes, no V1 changes, no `_history/` changes, no tag changes, no archive re-creation, no version bump. PHASE-3 remains CLOSED / PASS (owner-adopted). PHASE-4 was NOT STARTED at adoption time and was later CLOSED / PASS — first version issuance under this ADR: **BuyTuk Academy 1.8** (see Version Chain Registry).

## Context

After the formal adoption of PHASE-3 (CLOSE RECORD `3ed13c55b1985bdb92c9373b6f166a6d1b22474f`), the owner establishes binding rules that make the full post-phase snapshot the official project reference — replacing reliance on the engineer's memory or prior chat summaries — and introduce a sequential project version system governing all future phases.

## Decisions

### D-1 — Complete Project Reference = the official reference after every phase (Rule 1)
After every successfully closed Phase/Stage, a **Complete Project Reference Archive** must be created containing the ENTIRE project in its final post-phase state — not only changed files. This archive is: the strategic copy of the project; the official reference of the phase; the independent recovery point on context loss; the artifact deliverable to any new engineer; the basis for verifying the next phase; the substitute for relying on memory or prior conversations. **A phase may never be considered finally complete without this archive existing and verified.**

### D-2 — Required and prohibited contents (Rule 2)
**Must preserve:** full source code; git repository/history per project rules; current HEAD; all commits and preserved tags; V1 immutable reference; ADRs and governance; `TRACEABILITY_MATRIX`; `MASTER_ROADMAP`; `STAGE_STATUS`; `CHANGE_DEVIATION_RECORD`; all prior Phase Closeout / Close Records; migrations/schemas; tests; scripts; configuration; `.env.example`; `_history/`; previous references/archives; any artifacts required to re-understand the current state.
**Prohibited:** real secrets; real `.env`; `node_modules`; unnecessary build outputs; temporary/generated garbage — unless a specific artifact is explicitly required as part of the auditable reference.

### D-3 — Mandatory SHA-256 and integrity proof (Rule 3)
Every Complete Project Reference must record: **filename, exact byte size, SHA-256, creation date, Git HEAD, project version, phase, the phase-close commit, file/directory counts (or meaningful inventory).** Mandatory verification: `sha256sum ARCHIVE` then `tar -tzf ARCHIVE >/dev/null` with **exit 0** and no errors. "The archive was created" is not acceptable without proof that it is readable, extractable, and intact.

### D-4 — Sequential version system (Rule 4)
The project carries a clear sequential version number: "BuyTuk Academy 1.7" → "1.8" → "1.9" → "1.10" … No previous version number is ever reused, and no undocumented jumps. Every official Complete Project Reference carries a clear version number, shown in the project reference, in the phase record, and in the archive filename where appropriate.

### D-5 — PHASE is not VERSION (Rule 5)
The phase number and the project version are different things: PHASE-4 may produce "BuyTuk Academy 1.8", then PHASE-5 → "1.9". Never assume "PHASE-4 = version 4". The version represents the state of the whole project; the Phase represents the unit of work and execution.

### D-6 — The version does not change during work (Rule 6)
When a new phase starts, the version number is NOT raised merely for starting work. The previous version remains **Last Known Good / Current Reference** until `READ → TRACE → PLAN → IMPLEMENT → TEST → PROVE → CLOSE → ARCHIVE` completes, and only after a successful close with a valid Complete Project Reference is the new version adopted.

### D-7 — No approval by memory (Rule 7)
Binding rule: **«No new phase may be approved based on the engineer's memory or an old chat summary when the previous Complete Project Reference can be consulted.»** Every new phase starts from the last approved Complete Project Reference, then verifies: Git HEAD; project version; stage status; previous close records; open deviations; traceability; ADRs; current tests — and only then begins READ.

### D-8 — Rollback rule (Rule 8)
If context is lost, the engineer changes, or information conflicts: the Complete Project Reference is the operational source of truth for the prior state. The state is never invented from memory.

### D-9 — No overwriting of archives (Rule 9)
Every Complete Project Reference remains preserved after a phase close. Never: overwrite, delete, rename in an identity-losing way, replace, squash history, or delete a previous archive. Each archive has its own SHA and remains part of the project chain.

### D-10 — Version chain registry (Rule 10)
A clear chain: "BuyTuk Academy 1.7" → 1.8 → 1.9 → 1.10 → … Each version is bound to: **Phase + HEAD + Close Record + Complete Project Reference + SHA-256** — so that at any time we know: what is the project state? from which commit? what was done? what remains? what open exceptions? and what full file represents this state?

### D-11 — Governance placement (Rule 11)
This rule set is recorded as this ADR and cross-referenced in `EXECUTION-REFERENCE.md`, `MASTER_ROADMAP.md`, `STAGE_STATUS.md`, `CHANGE_DEVIATION_RECORD.md`, and `PROJECT_VERSION.md`. The original V1 document is NOT modified.

### D-12 — Downloadable Official Release (owner adoption ruling, 2026-09-16)
Binding clarification adopted by the owner: **«الإصدار الرسمي لا يُعتبر Released/Official إلا بوجود Complete Project Reference Archive مستقل، قابل للتنزيل فعليًا، قابل للتحقق والاستخراج، وله SHA-256 مسجل.»**

- Existence in Git, or a version number recorded in governance files alone, does **NOT** make a version officially complete/released.
- Every official version must be unambiguously bound to: **Project Version · Phase · Phase Close Record · HEAD/Commit · SHA-256 · a downloadable Complete Project Reference Archive · a passed archive integrity test**.
- **Definition of Done for every future phase** — a phase may NOT be closed as CLOSED/PASS unless ALL of the following are done:
  1. The phase is completed.
  2. A Close Record is created.
  3. A full Complete Project Reference Archive is created.
  4. The archive is confirmed **downloadable** (delivered/uploaded with a working link recorded in the phase record).
  5. The archive is verified intact and successfully extracted/read.
  6. SHA-256 of the final file is computed.
  7. Filename + SHA-256 + size + date + version + HEAD + phase + close commit are recorded in the governance registry.

  Without the downloadable, verified archive → the phase is **NOT finally complete**.
- **No replacement of previous versions** (reinforces D-9): every official version keeps its own independent archive; never overwrite, delete, identity-losing rename, replace an older version's archive with a new one, delete a recorded SHA, or rely on "the latest copy" instead of the version chain. The owner must be able to return to **any** previous official version as an independent snapshot.
- **Sequence** (per D-4/D-5): BuyTuk Academy 1.7 → 1.8 → 1.9 → 1.10 → 1.11 … — no skips or number reuse without explicit governance documentation; Phase ≠ Version; the new version is officially bound to its phase at close.

## Version chain registry (canonical seed — evidence-based)

| Version | Phase | Phase commit (HEAD) | Close Record | Complete Project Reference | SHA-256 |
|---|---|---|---|---|---|
| **BuyTuk Academy 1.7** (superseded by 1.8 — preserved per D-9) | PHASE-3 — CLOSED / PASS | `ad538c9ab1eaaf909b0aa8ee24382c714413d07a` | `docs/reports/PHASE-3-CLOSE-RECORD-2026-09-16.md` (+ `PHASE-3-CORE-WEB-PORTAL-SHELL-CLOSEOUT-2026-09-16.md`) | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-3-2026-09-16.tar.gz` | `9feb51aa11eb1862cfb4d0337d38fccd2902ec5791d3ea30c26b82d8529edb63` |
| **BuyTuk Academy 1.8** (superseded by 1.9 — preserved per D-9) | PHASE-4 — CLOSED / PASS | `bc0a6cacc06bbf1a450f6a239ffed07765542ebc` | `docs/reports/PHASE-4-API-GATEWAY-ALIGNMENT-CLOSEOUT-2026-09-16.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-4-2026-09-16.tar.gz` | `3adc5c04d6e48afeeed5cebd6d60e2508d9fbca8b3bb156e17971277d8e5f20d` |
| **BuyTuk Academy 1.9** (current Last Known Good — adopted at the PHASE-5 closeout, 2026-09-16; D-12 proof: downloadable + `tar -tzf` exit 0) | PHASE-5 — CLOSED / PASS | `4a2104a132e52600574db70f8eb143c33dff8a34` | `docs/reports/PHASE-5-SHARED-INFRA-AND-INFERENCE-CLOSEOUT-2026-09-16.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-5-2026-09-16.tar.gz` | `b870b2c7c2963ea8f320ee40083a2a02820c45fde09fc9b8f19f2d5c1215a3f9` |
| *(next — NOT yet assigned)* | assigned ONLY at the next phase CLOSE + ARCHIVE (expected: PHASE-6 → **BuyTuk Academy 1.10**) | — | — | — | — |

**Pre-system lineage (preserved identifiers — unchanged, per D-9):** local tag `BuyTuk.V0.1.3` → `41b0bba3501eb221d16f474299e44d39c709b104`; earlier reference archives remain preserved with their own SHAs: POST-PHASE-2 `6a82efd9…`, OFFICIAL V0.1.3 `c0258c26…`, PHASE-1 `8922dbd2…`, CONSOLIDATED V3 `e541b44a…`, OLD V0.1.5 `4e29ad83…`.

**Starting-point note (documented decision, not invented):** the "1.7" designation is anchored to actual repository evidence — `VERSION` = `BuyTuk.V.01.7`, `package.json` = `0.1.7` — and to the owner's ruling chain in this decision (1.7 current → 1.8 at the next closeout). **No version file is bumped in this governance turn**; the first version issuance under the new system occurs at the next phase closeout.

## Mandatory closeout procedure going forward (per phase, after CLOSE)

1. Build the Complete Project Reference from the actual working tree (full snapshot, exclusions per D-2).
2. Compute and record: `sha256sum ARCHIVE` (filename, exact byte size, SHA-256, creation date, Git HEAD, project version, phase, phase-close commit, file/dir counts / inventory).
3. Verify integrity: `tar -tzf ARCHIVE >/dev/null` must exit 0; presence gates for the D-2 critical items (`.git/HEAD`, V1, governance docs, `_history/`, previous references, `.env.example`).
4. Confirm **DOWNLOADABILITY** (D-12): deliver/upload the archive with a working download link and record that link in the phase record — the version is not official without a downloadable archive.
5. Update the Version Chain Registry above + MANIFEST + SIDECAR + phase archive closeout — all with the SAME final SHA-256.
6. Only then: adopt the new version number and mark the phase finally complete.

## Application

- **Applies from the NEXT phase closeout onward** (first issuance under the new system expected at the PHASE-4 closeout → BuyTuk Academy 1.8). **COMPLETED: BuyTuk Academy 1.8 adopted at the PHASE-4 closeout (2026-09-16) — registry updated. COMPLETED: BuyTuk Academy 1.9 adopted at the PHASE-5 closeout (2026-09-16) — registry updated.**
- **No retroactive archive re-creation** — owner ruling: the adopted POST-PHASE-3 reference stands as the official PHASE-3 reference.
