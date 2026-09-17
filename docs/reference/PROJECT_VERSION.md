# PROJECT_VERSION — BuyTuk Academy

## Current version governance (ADR-028 — binding from 2026-09-16)

Sequential version system: **BuyTuk Academy 1.7 → 1.8 → 1.9 → 1.10 → …** (no reuse, no undocumented jumps). Phase ≠ Version (PHASE-4 may produce 1.8; never "PHASE-4 = version 4"). The version is frozen during work; the previous version stays Last Known Good until CLOSE + a valid Complete Project Reference, then the new version is adopted. **Downloadable Official Release (D-12, owner adoption 2026-09-16): «الإصدار الرسمي لا يُعتبر Released/Official إلا بوجود Complete Project Reference Archive مستقل، قابل للتنزيل فعليًا، قابل للتحقق والاستخراج، وله SHA-256 مسجل»** — the downloadable verified archive is part of every phase's Definition of Done. Full rules: [`docs/decisions/ADR-028-REFERENCE-ARCHIVE-AND-VERSION-GOVERNANCE.md`](../decisions/ADR-028-REFERENCE-ARCHIVE-AND-VERSION-GOVERNANCE.md).

### Version chain registry (canonical)

| Version | Phase | Phase commit (HEAD) | Close Record | Complete Project Reference | SHA-256 |
|---|---|---|---|---|---|
| **BuyTuk Academy 1.7** (superseded by 1.8 — preserved per D-9) | PHASE-3 — CLOSED / PASS | `ad538c9ab1eaaf909b0aa8ee24382c714413d07a` | `docs/reports/PHASE-3-CLOSE-RECORD-2026-09-16.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-3-2026-09-16.tar.gz` | `9feb51aa11eb1862cfb4d0337d38fccd2902ec5791d3ea30c26b82d8529edb63` |
| **BuyTuk Academy 1.8** (superseded by 1.9 — preserved per D-9) | PHASE-4 — CLOSED / PASS | `bc0a6cacc06bbf1a450f6a239ffed07765542ebc` | `docs/reports/PHASE-4-API-GATEWAY-ALIGNMENT-CLOSEOUT-2026-09-16.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-4-2026-09-16.tar.gz` | `3adc5c04d6e48afeeed5cebd6d60e2508d9fbca8b3bb156e17971277d8e5f20d` |
| **BuyTuk Academy 1.9** (superseded by 1.10 — preserved per D-9; adopted at the PHASE-5 closeout, 2026-09-16; D-12 proof: downloadable + `tar -tzf` exit 0; download: https://www.genspark.ai/api/files/s/8IRviRWG) | PHASE-5 — CLOSED / PASS | `4a2104a132e52600574db70f8eb143c33dff8a34` | `docs/reports/PHASE-5-SHARED-INFRA-AND-INFERENCE-CLOSEOUT-2026-09-16.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-5-2026-09-16.tar.gz` | `b870b2c7c2963ea8f320ee40083a2a02820c45fde09fc9b8f19f2d5c1215a3f9` |
| **BuyTuk Academy 1.10** (superseded by 1.11 — preserved per D-9; adopted at the PHASE-6 closeout, 2026-09-16; D-12 proof: verified 29-part delivery channel — single-file serving truncates large files on this platform; register: MANIFEST/SIDECAR-PHASE6 + PHASE-6 closeout D-12 addendum) | PHASE-6 — CLOSED / PASS | `812539e02e96552234ca0c19ee98e98d97dd8baa` | `docs/reports/PHASE-6-STUDENT-LEARNING-LOOP-E2E-CLOSEOUT-2026-09-16.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-6-2026-09-16.tar.gz` | `104b69cb09d75bfe672d1e7f196fdefb2ee1a7f01dd985c73d4c89b2433687dd` |
| **BuyTuk Academy 1.11** (superseded by 1.12 — preserved per D-9; adopted at the PHASE-7 closeout, 2026-09-16, delivery verification finalized 2026-09-17 UTC; D-12 proof: verified 29-part delivery channel — per-part SHA match + reassembly = exact official size 453,729,458 B + SHA-256 `7032c8ec…` + `tar -tzf` exit 0 + `cmp` byte-identical; register: MANIFEST/SIDECAR-PHASE7) | PHASE-7 — CLOSED / PASS | `ac00b9baa7f508ceaaffc2a86b47b6ff63bc63ba` | `docs/reports/PHASE-7-TEACHER-CAPABILITIES-CLOSEOUT-2026-09-16.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-7-2026-09-16.tar.gz` | `7032c8ec608163bccac0e033e4cfe246f0ce68f4d00ad544e13f1b2bb97cc414` |
| **BuyTuk Academy 1.12** (current Last Known Good — adopted at the PHASE-8 closeout, 2026-09-16, delivery verification finalized 2026-09-17 UTC; D-12 proof: verified 29-part delivery channel — per-part SHA match + reassembly = exact official size 453,830,248 B + SHA-256 `b46db8e8…` + `tar -tzf` exit 0 + `cmp` byte-identical; register: MANIFEST/SIDECAR-PHASE8) | PHASE-8 — CLOSED / PASS | `eb91b8f5f3b1306758055aa41357f4982854c58a` | `docs/reports/PHASE-8-PARENT-CAPABILITIES-CLOSEOUT-2026-09-16.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-8-2026-09-16.tar.gz` | `b46db8e8f6a175f21a84d442f04cb28f39a170cc4025dd4336dffb21e4b317d8` |
| **BuyTuk Academy 1.13** (current — adopted at the PHASE-9 closeout, 2026-09-17; D-12 proof: single-file delivery via external host — gofile.io download page, server-reported size 458,388,362 B for the 1.12 reference; 1.13 archive shipped with server-round-trip SHA-256 + `tar -tzf` exit 0 proof per D-3) | PHASE-9 — CLOSED / PASS | `6afd0174014713ef3cc0d6259c5495325354bb14` | `docs/reports/PHASE-9-PRINCIPAL-ADMIN-CAPABILITIES-CLOSEOUT-2026-09-17.md` | `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-9-2026-09-17.tar.gz` | *(recorded at closeout — see the closeout report + MANIFEST-PHASE9)* |

Starting-point anchoring: `VERSION` file = `BuyTuk.V.01.7`, `package.json` = `0.1.7` (both untouched in this governance turn), plus the owner's ruling chain. Pre-system lineage preserved: tag `BuyTuk.V0.1.3` → `41b0bba3501eb221d16f474299e44d39c709b104`.

## Git evidence (2026-09-16 — PHASE-5 closeout / version 1.9 adoption — superseded by the PHASE-6 section below, preserved for accuracy)

| Item | Value |
|---|---|
| Local branch | `main` |
| Version anchor — PHASE-5 phase commit | `4a2104a132e52600574db70f8eb143c33dff8a34` |
| PHASE-4 phase commit | `bc0a6cacc06bbf1a450f6a239ffed07765542ebc` |
| PHASE-3 phase commit | `ad538c9ab1eaaf909b0aa8ee24382c714413d07a` |
| Local tag `BuyTuk.V0.1.3` | VERIFIED — points to `41b0bba3501eb221d16f474299e44d39c709b104` (unchanged, untouched) |
| Working tree | CLEAN |
| Push to remote | BLOCKED / PENDING ACCESS (no push performed; remote tag absent) |

## Git evidence (2026-09-16 — PHASE-6 closeout / version 1.10 adoption — preserved below; superseded by the PHASE-7 section)

| Item | Value |
|---|---|
| Local branch | `main` |
| Version anchor — PHASE-6 phase commit | `812539e02e96552234ca0c19ee98e98d97dd8baa` |
| PHASE-5 phase commit | `4a2104a132e52600574db70f8eb143c33dff8a34` |
| Local tag `BuyTuk.V0.1.3` | VERIFIED — points to `41b0bba3501eb221d16f474299e44d39c709b104` (unchanged, untouched; tag object `77e58b00e456dbad9b77df500d3eda54afca3902`) |
| Working tree | CLEAN |
| Push to remote | BLOCKED / PENDING ACCESS (no push performed; remote tag absent) |

## Git evidence (2026-09-17 — PHASE-7 closeout / version 1.11 adoption — preserved below; superseded by the PHASE-8 section)

| Item | Value |
|---|---|
| Local branch | `main` |
| Version anchor — PHASE-7 phase commit | `ac00b9baa7f508ceaaffc2a86b47b6ff63bc63ba` |
| PHASE-6 phase commit | `812539e02e96552234ca0c19ee98e98d97dd8baa` |
| Local tag `BuyTuk.V0.1.3` | VERIFIED — points to `41b0bba3501eb221d16f474299e44d39c709b104` (unchanged, untouched; tag object `77e58b00e456dbad9b77df500d3eda54afca3902`) |
| Working tree | CLEAN |
| Push to remote | BLOCKED / PENDING ACCESS (no push performed; remote tag absent) |

## Current Git evidence (verified 2026-09-17 — PHASE-8 closeout / version 1.12 adoption)

| Item | Value |
|---|---|
| Local branch | `main` |
| Version anchor — PHASE-8 phase commit | `eb91b8f5f3b1306758055aa41357f4982854c58a` |
| PHASE-7 phase commit | `ac00b9baa7f508ceaaffc2a86b47b6ff63bc63ba` |
| Local tag `BuyTuk.V0.1.3` | VERIFIED — points to `41b0bba3501eb221d16f474299e44d39c709b104` (unchanged, untouched; tag object `77e58b00e456dbad9b77df500d3eda54afca3902`) |
| Working tree | CLEAN |
| Push to remote | BLOCKED / PENDING ACCESS (no push performed; remote tag absent) |

## Interpretation
- The repository is governed as a cumulative unified project with immutable reference archives per phase (ADR-028).
- The official PHASE-3 reference archive is adopted (`9feb51aa…`, HEAD `ad538c9…`) — no re-creation needed.
- The official PHASE-4 reference archive is adopted (`3adc5c04…`, HEAD `bc0a6ca…`) — **BuyTuk Academy 1.8** released per D-12 (downloadable, integrity-verified, SHA-256 recorded).
- The official PHASE-5 reference archive is adopted (`b870b2c7…`, HEAD `4a2104a…`) — **BuyTuk Academy 1.9** released per D-12 (downloadable, integrity-verified, SHA-256 recorded).
- The official PHASE-6 reference archive is adopted (`104b69cb…`, HEAD `812539e…`) — **BuyTuk Academy 1.10** released per D-12 (verified 29-part delivery channel; single-file serving truncates large files on this platform — see the PHASE-6 closeout D-12 addendum).
- The official PHASE-7 reference archive is adopted (`7032c8ec…`, HEAD `ac00b9b…`) — **BuyTuk Academy 1.11** released per D-12 (verified 29-part delivery channel: per-part SHA + reassembly = exact official size/SHA + `cmp` byte-identical).
- The official PHASE-8 reference archive is adopted (`b46db8e8…`, HEAD `eb91b8f…`) — **BuyTuk Academy 1.12** released per D-12 (verified 29-part delivery channel: per-part SHA + reassembly = exact official size/SHA + `cmp` byte-identical).
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
