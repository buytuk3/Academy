# PHASE-16 Gates Ledger — (gate → measured → verdict → commit)

All values from real commands in the PHASE-16 session (raw logs: /home/user/phase16_logs/, register: exit_codes.txt).
**Binding preamble (DEV-014):** *PHASE-13 remains open (moved to LAST after PHASE-26 by the 2026-09-19 ruling) — this closure does not include audio-AI proof (DEP-001 stays NOT VERIFIED).*

| Gate | Measured | Verdict | Commit |
|---|---|---|---|
| typecheck (workspace) | see log | PASS | pre-gate |
| build (fresh dist) | see log | PASS | pre-gate |
| P16 E2E gate (4 tests: real-timestamp LOGIN, start/replay/submit, LOGIN_FAILED, staff+mine+RLS fail-closed) | 4/4 | PASS | gate-commit |
| db suite | 55/55 | PASS | baf4247 |
| obs suite | 6/6 | PASS | baf4247 |
| worker suite | 1/1 | PASS | baf4247 |
| api suite | 8/8 | PASS | baf4247 |
| engine suite | 24/24 | PASS | baf4247 |
| E1 full cycle | 11/11 | PASS | baf4247 |
| E4 student loop | 7/7 | PASS | baf4247 |
| p1 student UI (real browser) | 5/5 | PASS | baf4247 |
| p2 voice UI | 1/1 | PASS | baf4247 |
| p3 role shell | 8/8 | PASS | baf4247 |
| p7 teacher | 5/5 | PASS | baf4247 |
| p8 parent | 5/5 | PASS | baf4247 |
| p9 principal/admin | 5/5 | PASS | baf4247 |
| p10 engines | 5/5 | PASS | baf4247 |
| p11 engagement | 5/5 | PASS | baf4247 |
| p15 onboarding (6/6 incl. atomic-lock concurrency) | 6/6 | PASS | baf4247 |
| auth-sec (429 path intact) | 5/5 | PASS | baf4247 |
| MIG-1 new migration 0011 | interaction_events (7-class event CHECK, (tenant,operation_key) idempotency, DB-clock occurred_at, 2 indexes) — RLS enabled+forced; psql apply exit 0; ADR-037 | PASS | schema-commit |
| secret-diff (new secrets in baf4247..HEAD) | 0 hits | PASS | close |
| secret-tree (real secrets, credential-value pattern) | 0 hits | PASS | close |
| git diff --check | clean | PASS | close |
