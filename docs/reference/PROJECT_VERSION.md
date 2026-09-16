# PROJECT_VERSION — BuyTuk Academy

## Current version governance (ADR-028 — binding from 2026-09-16)

Sequential version system: **BuyTuk Academy 1.7 → 1.8 → 1.9 → 1.10 → …** (no reuse, no undocumented jumps). Phase ≠ Version (PHASE-4 may produce 1.8; never "PHASE-4 = version 4"). The version is frozen during work; the previous version stays Last Known Good until CLOSE + a valid Complete Project Reference, then the new version is adopted. **Downloadable Official Release (D-12, owner adoption 2026-09-16): «الإصدار الرسمي لا يُعتبر Released/Official إلا بوجود Complete Project Reference Archive مستقل، قابل للتنزيل فعليًا، قابل للتحقق والاستخراج، وله SHA-256 مسجل»** — the downloadable verified archive is part of every phase's Definition of Done. Full rules: [`docs/decisions/ADR-028-REFERENCE-ARCHIVE-AND-VERSION-GOVERNANCE.md`](../decisions/ADR-028-REFERENCE-ARCHIVE-AND-VERSION-GOVERNANCE.md).

### Version chain registry (canonical)

| Version | Phase | Phase commit (HEAD) | Close Record | Complete Project Reference | SHA-256 |
|---|---|---|---|---|---|
| **BuyTuk Academy 1.7** (current Last Known Good — designated by ADR-028) | PHASE-3 — CLOSED / PASS | `ad538c9ab1eaaf909b0aa8ee24382c714413d07a` | `docs/reports/PHASE-3-CLOSE-RECORD-2026-09-16.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-3-2026-09-16.tar.gz` | `9feb51aa11eb1862cfb4d0337d38fccd2902ec5791d3ea30c26b82d8529edb63` |
| *(next — NOT yet assigned)* | assigned ONLY at next phase CLOSE + ARCHIVE (expected: PHASE-4 → BuyTuk Academy 1.8) | — | — | — | — |

Starting-point anchoring: `VERSION` file = `BuyTuk.V.01.7`, `package.json` = `0.1.7` (both untouched in this governance turn), plus the owner's ruling chain. Pre-system lineage preserved: tag `BuyTuk.V0.1.3` → `41b0bba3501eb221d16f474299e44d39c709b104`.

## Current Git evidence (verified 2026-09-16, ADR-028 governance turn)

| Item | Value |
|---|---|
| Local branch | `main` |
| Local HEAD SHA | `3ed13c55b1985bdb92c9373b6f166a6d1b22474f` (PHASE-3 CLOSE RECORD commit) |
| PHASE-3 phase commit | `ad538c9ab1eaaf909b0aa8ee24382c714413d07a` |
| Local tag `BuyTuk.V0.1.3` | VERIFIED — points to `41b0bba3501eb221d16f474299e44d39c709b104` (unchanged, untouched) |
| Working tree | CLEAN |
| Push to remote | BLOCKED / PENDING ACCESS (no push performed; remote tag absent) |

## Interpretation
- The repository is governed as a cumulative unified project with immutable reference archives per phase (ADR-028).
- The official PHASE-3 reference archive is adopted (`9feb51aa…`, HEAD `ad538c9…`) — no re-creation needed.
- Any formal remote push/tag-push remains a later gated action and must not be assumed from this document alone.

---

## Historical record (PHASE-0-era turn evidence — superseded by the sections above, preserved for accuracy)

| Item | Value |
|---|---|
| Repository baseline name | `BuyTuk.V0.1.3` |
| Meaning of `BuyTuk.V0.1.3` | The cumulative unified project baseline that SHALL include V0.1.2 baseline, approved P2 Real LLM work, CORE-33, P2-VOICE inspection artifacts, reference documentation, traceability, roadmap, ADRs, closeouts, tests, and git history. |
| Baseline proof status in that turn | `PARTIALLY VERIFIED` |
| Immutable requirement document | `docs/reference/BUY-TUK-ACADEMY-V1.0.0.md` |
| Governance protocol | `docs/reference/MANDATORY_EXECUTION_PROTOCOL.md` |

Git evidence verified in that earlier turn: local branch `main`, HEAD `1c57206`, upstream `origin/main` at `3ff0664`, ahead 1, tag `PENDING / NOT VERIFIED` at that time, no push. (Superseded: the tag has since been created and verified locally; the push remains blocked.)
