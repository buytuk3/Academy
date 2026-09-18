# PHASE-14 Gates Ledger — (gate → measured → verdict → commit)

All values from real commands in the PHASE-14 session (raw logs: /home/user/phase14_logs/, register: exit_codes.txt).
**Binding preamble (DEV-014):** *PHASE-13 remains open awaiting a GPU environment — this closure does not include audio-AI proof (DEP-001 stays NOT VERIFIED).*

| Gate | Measured | Verdict | Commit |
|---|---|---|---|
| typecheck | see log | PASS | 239fc9b |
| build (fresh dist) | see log | PASS | 239fc9b |
| p1 solo (anomaly re-proof on clean Redis) | 5/5 | PASS | 8d1d3ff |
| engine 24 suite | 24/24 | PASS | 239fc9b |
| E1 full cycle | 11/11 | PASS | 239fc9b |
| E4 student loop | 7/7 | PASS | 239fc9b |
| p2 voice UI | 1/1 | PASS | 239fc9b |
| p3 role shell | 8/8 | PASS | 239fc9b |
| p7 teacher | 5/5 | PASS | 239fc9b |
| p8 parent | 5/5 | PASS | 239fc9b |
| p9 principal/admin | 5/5 | PASS | 239fc9b |
| p10 engines | 5/5 | PASS | p14-e2e |
| p11 engagement | 5/5 | PASS | p14-e2e |
| auth-sec | 5/5 | PASS | p14-e2e |
| db suite | 55/55 | PASS | p14-e2e |
| obs suite | 6/6 | PASS | p14-e2e |
| worker suite | 1/1 | PASS | p14-e2e |
| api suite | 8/8 | PASS | p14-e2e |
| COV-1 official gate (thresholds enforced, v8 provider) | lines 40.41%≥40% · functions 12.82%≥10% · statements 40.41%≥40% · branches 55.00%≥55% | PASS | e3fdeb1 |
| DEPL-2 container target (pinned multi-stage Dockerfile+runbook; LIVE deployment stays OPEN disclosed — no docker daemon/no external host, never claimed) | target delivered; live = OPEN | DISCLOSED | 2d692be |
| secret-diff (hits) | 0 | PASS | close |
| secret-tree (new real secrets) | 0 — 5 pre-existing test-fixture matches classified (docs/evidence/PHASE-14/secret-tree-classification.txt) | PASS | close |
| diff --check | clean | PASS | close |
| P14 E2E gate (5 tests, real built-artifact boot + /metrics + contracts + coverage evidence + governance) | 5/5 | PASS | close |
