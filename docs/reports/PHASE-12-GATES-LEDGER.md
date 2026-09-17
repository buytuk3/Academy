# PHASE-12 Gates Ledger — (gate → measured → verdict → commit)

Method discipline: every value below is produced by a real command executed in the PHASE-12 session (raw logs in `/home/user/phase12_logs/`); unmeasured gates are OPEN, never PASS.

| Gate | Measured | Verdict | Commit |
|---|---|---|---|
| OBS-1 /metrics endpoint | — | OPEN | — |
| OBS-2 security events surfaced | — | OPEN | — |
| PERF-1 asset budget (≤ 102,400 B) | — | OPEN | — |
| PERF-2 cold boot ≤ 5,000 ms | — | OPEN | — |
| PERF-3 latency p95 healthz ≤ 50 ms / static ≤ 100 ms | — | OPEN | — |
| DEPL-1 deployable artifact | — | OPEN | — |
| DEPL-2 live external deployment | not runnable in sandbox | OPEN (disclosed) | — |
| COV-1 coverage provider | provider not installed | OPEN (deferred with reason) | — |
| REG-0 zero regressions | — | OPEN | — |
