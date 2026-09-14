# P5.1 — Decisions

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

## P5.1D-01 — engines/reading-engine is the single canonical home (path per user: engines/reading-engine, NOT engines/reading)
## P5.1D-02 — Extraction is byte-preserving; only consumer config path strings change; zero rewrites; 11 stages frozen
## P5.1D-03 — No deletion without zero-consumer evidence — this phase deletes nothing; every shim/legacy retained with documented reason
## P5.1D-04 — app → engines → packages direction enforced (packages never import engines; engines never import apps)
## P5.1D-05 — Redis/PostgreSQL integration remains OPEN VALIDATION (SKIPPED≠PASS); nothing in this phase changes that
## P5.1D-06 — MOD-002 remains CLOSED until P8 per contract