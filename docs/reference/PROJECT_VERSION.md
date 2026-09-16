# PROJECT_VERSION — BuyTuk Academy

## Current version governance (ADR-028 — binding from 2026-09-16)

Sequential version system: **BuyTuk Academy 1.7 → 1.8 → 1.9 → 1.10 → …** (no reuse, no undocumented jumps). Phase ≠ Version (PHASE-4 may produce 1.8; never "PHASE-4 = version 4"). The version is frozen during work; the previous version stays Last Known Good until CLOSE + a valid Complete Project Reference, then the new version is adopted. **Downloadable Official Release (D-12, owner adoption 2026-09-16): «الإصدار الرسمي لا يُعتبر Released/Official إلا بوجود Complete Project Reference Archive مستقل، قابل للتنزيل فعليًا، قابل للتحقق والاستخراج، وله SHA-256 مسجل»** — the downloadable verified archive is part of every phase's Definition of Done. Full rules: [`docs/decisions/ADR-028-REFERENCE-ARCHIVE-AND-VERSION-GOVERNANCE.md`](../decisions/ADR-028-REFERENCE-ARCHIVE-AND-VERSION-GOVERNANCE.md).

### Version chain registry (canonical)

| Version | Phase | Phase commit (HEAD) | Close Record | Complete Project Reference | SHA-256 |
|---|---|---|---|---|---|
| **BuyTuk Academy 1.7** (superseded by 1.8 — preserved per D-9) | PHASE-3 — CLOSED / PASS | `ad538c9ab1eaaf909b0aa8ee24382c714413d07a` | `docs/reports/PHASE-3-CLOSE-RECORD-2026-09-16.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-3-2026-09-16.tar.gz` | `9feb51aa11eb1862cfb4d0337d38fccd2902ec5791d3ea30c26b82d8529edb63` |
| **BuyTuk Academy 1.8** (superseded by 1.9 — preserved per D-9) | PHASE-4 — CLOSED / PASS | `bc0a6cacc06bbf1a450f6a239ffed07765542ebc` | `docs/reports/PHASE-4-API-GATEWAY-ALIGNMENT-CLOSEOUT-2026-09-16.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-4-2026-09-16.tar.gz` | `3adc5c04d6e48afeeed5cebd6d60e2508d9fbca8b3bb156e17971277d8e5f20d` |
| **BuyTuk Academy 1.9** (current Last Known Good — adopted at the PHASE-5 closeout, 2026-09-16; D-12 proof: downloadable + `tar -tzf` exit 0; download: https://www.genspark.ai/api/files/s/8IRviRWG) | PHASE-5 — CLOSED / PASS | `4a2104a132e52600574db70f8eb143c33dff8a34` | `docs/reports/PHASE-5-SHARED-INFRA-AND-INFERENCE-CLOSEOUT-2026-09-16.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-5-2026-09-16.tar.gz` | `b870b2c7c2963ea8f320ee40083a2a02820c45fde09fc9b8f19f2d5c1215a3f9` |
| *(next — NOT yet assigned)* | assigned ONLY at next phase CLOSE + ARCHIVE (expected: PHASE-6 → BuyTuk Academy 1.10) | — | — | — | — |

Starting-point anchoring: `VERSION` file = `BuyTuk.V.01.7`, `package.json` = `0.1.7` (both untouched in this governance turn), plus the owner's ruling chain. Pre-system lineage preserved: tag `BuyTuk.V0.1.3` → `41b0bba3501eb221d16f474299e44d39c709b104`.

## Current Git evidence (verified 2026-09-16 — PHASE-5 closeout / version 1.9 adoption)

| Item | Value |
|---|---|
| Local branch | `main` |
| Version anchor — PHASE-5 phase commit | `4a2104a132e52600574db70f8eb143c33dff8a34` |
| PHASE-4 phase commit | `bc0a6cacc06bbf1a450f6a239ffed07765542ebc` |
| PHASE-3 phase commit | `ad538c9ab1eaaf909b0aa8ee24382c714413d07a` |
| Local tag `BuyTuk.V0.1.3` | VERIFIED — points to `41b0bba3501eb221d16f474299e44d39c709b104` (unchanged, untouched) |
| Working tree | CLEAN |
| Push to remote | BLOCKED / PENDING ACCESS (no push performed; remote tag absent) |

## Interpretation
- The repository is governed as a cumulative unified project with immutable reference archives per phase (ADR-028).
- The official PHASE-3 reference archive is adopted (`9feb51aa…`, HEAD `ad538c9…`) — no re-creation needed.
- The official PHASE-4 reference archive is adopted (`3adc5c04…`, HEAD `bc0a6ca…`) — **BuyTuk Academy 1.8** released per D-12 (downloadable, integrity-verified, SHA-256 recorded).
- The official PHASE-5 reference archive is adopted (`b870b2c7…`, HEAD `4a2104a…`) — **BuyTuk Academy 1.9** released per D-12 (downloadable, integrity-verified, SHA-256 recorded).
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
