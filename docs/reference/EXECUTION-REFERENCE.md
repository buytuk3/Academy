# EXECUTION REFERENCE — BuyTuk Academy

## Official execution index
- **Immutable requirement baseline:** `docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`
- **Mandatory project protocol:** `docs/reference/MANDATORY_EXECUTION_PROTOCOL.md`
- **Project version / baseline status:** `docs/reference/PROJECT_VERSION.md`
- **Compliance / traceability:** `docs/buytuk-master/TRACEABILITY_MATRIX.md`
- **Execution roadmap:** `docs/buytuk-master/MASTER_ROADMAP.md`
- **Stage status register:** `docs/buytuk-master/STAGE_STATUS.md`
- **Change / deviation record:** `docs/buytuk-master/CHANGE_DEVIATION_RECORD.md`
- **Phase closeouts:** `docs/reports/`

## Execution rule
All implementation work in this repository must follow:
`READ → TRACE → PLAN → IMPLEMENT → TEST → PROVE → CLOSE → NEXT`

## Repository authority model
1. `BUY-TUK-ACADEMY-V1.0.0.md` defines the minimum required platform scope.
2. `TRACEABILITY_MATRIX.md` links requirements to decisions, implementation, tests, gates, and closeouts.
3. `MASTER_ROADMAP.md` defines stage order using dependency-first execution.
4. `STAGE_STATUS.md` records current status using the allowed stage vocabulary only.
5. `CHANGE_DEVIATION_RECORD.md` records every intentional deviation or gap.
6. `PHASE-0-GOVERNANCE-CLOSEOUT-2026-09-15.md` records the governance closeout for this phase.

## What this file does not allow
- No undocumented stage hopping
- No unclassified enhancements
- No marking a requirement as complete without evidence
- No reopening closed work without regression evidence

## Reference archive & version governance (ADR-028 — binding from 2026-09-16)
- After every successfully closed phase, a verified **Complete Project Reference Archive** (full post-phase snapshot, not only changed files) is MANDATORY — a phase is not finally complete without it.
- Versions run sequentially (**BuyTuk Academy 1.7 → 1.8 → 1.9 → …**): no reuse of a previous number, no undocumented jumps; **Phase ≠ Version**; the version is frozen during work and adopted only at CLOSE + valid archive.
- **No approval by memory:** every new phase starts from the last approved Complete Project Reference and verifies Git HEAD, project version, stage status, previous close records, open deviations, traceability, ADRs, and current tests — before READ begins.
- On context loss / engineer change / conflicting information, the last approved reference is the operational source of truth — state is never invented from memory.
- Archives are immutable: never overwritten, deleted, identity-losing renamed, or replaced; each keeps its SHA-256. Mandatory proof per archive: `sha256sum` + `tar -tzf ARCHIVE >/dev/null` = exit 0.
- **Downloadable Official Release (D-12 — owner adoption 2026-09-16):** an official version is **NOT** considered Released/Official unless an independent Complete Project Reference Archive exists that is **actually downloadable, verifiable and extractable, with a recorded SHA-256**. The downloadable verified archive is part of every phase's **Definition of Done** (close the phase as finally complete only with it); every official version stays independently retrievable per the version chain (BuyTuk Academy 1.7 → 1.8 → 1.9 → …; Phase ≠ Version).
- Full rules and the canonical Version Chain Registry: [`docs/decisions/ADR-028-REFERENCE-ARCHIVE-AND-VERSION-GOVERNANCE.md`](../decisions/ADR-028-REFERENCE-ARCHIVE-AND-VERSION-GOVERNANCE.md).
