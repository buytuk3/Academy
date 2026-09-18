# PHASE-15 Gates Ledger — (gate → measured → verdict → commit)

All values from real commands in the PHASE-15 session (raw logs: /home/user/phase15_logs/, register: exit_codes.txt).
**Binding preamble (DEV-014):** *PHASE-13 remains open awaiting a GPU environment — this closure does not include audio-AI proof (DEP-001 stays NOT VERIFIED).*

| Gate | Measured | Verdict | Commit |
|---|---|---|---|
| typecheck (workspace) | see log | PASS | 9d0180f/102df48 |
| build (fresh dist) | see log | PASS | 102df48 |
| P15 E2E gate (6 tests: pending-default, approval flow, exclusivity, REAL-concurrency atomic lock, multi-school+override, RLS fail-closed) | 6/6 | PASS | 08edda7 |
| db suite | 55/55 | PASS | 9425131 |
| obs suite | 6/6 | PASS | 9425131 |
| worker suite | 1/1 | PASS | 9425131 |
| api suite | 8/8 | PASS | 9425131 |
| engine suite | 24/24 | PASS | 9425131 |
| E1 full cycle | 11/11 | PASS | 9425131 |
| E4 student loop | 7/7 | PASS | 9425131 |
| p1 student UI (real browser) | 5/5 | PASS | 9425131 |
| p2 voice UI | 1/1 | PASS | 9425131 |
| p3 role shell | 8/8 | PASS | 9425131 |
| p7 teacher | 5/5 | PASS | 9425131 |
| p8 parent | 5/5 | PASS | 9425131 |
| p9 principal/admin | 5/5 | PASS | 9425131 |
| p10 engines | 5/5 | PASS | 9425131 |
| p11 engagement | 5/5 | PASS | 9425131 |
| auth-sec (429 path intact) | 5/5 | PASS | 9425131 |
| MIG-1 new migration 0010 | 3 tables RLS-enabled+forced (school_requests, teaching_slots, teaching_slot_overrides); psql apply exit 0; justified by ADR-036 | PASS | 9d0180f |
| secret-diff (new secrets in 9425131..HEAD) | 0 hits | PASS | close |
| secret-tree (real secrets, credential-value pattern) | 0 hits (classification committed) | PASS | close |
| git diff --check | clean | PASS | close |
