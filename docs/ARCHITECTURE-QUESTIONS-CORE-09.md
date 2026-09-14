# CORE-09 - Architecture Questions and Open Items

## ARCHITECTURE QUESTION 1 - Cross-school (cross-tenant) student continuity
A student moving to ANOTHER school within the platform may live under a
DIFFERENT tenant. CORE-09 enforces tenant isolation hard: a learner model is
built ONLY for a (tenantId, studentId) pair, and evidence of another tenant is
never readable. Preserving ONE longitudinal identity across tenants requires a
Tenant-Ownership decision (identity transfer, record federation, or a parent
student-identity node) that is intentionally NOT decided or implemented here.
Decision owner: BuyTuk Academy product / architecture team.

## OPEN ITEMS (environment)
- Migration 007 applied on real PostgreSQL: OPEN (no live DB available).
- Learner model projection against real PostgreSQL: OPEN (the Evidence Reader
  is exercised through unit-level injection only).
- Real Redis / real outbox processing: OPEN.
- Concurrency of parallel teacher decisions on the same proposal: OPEN.
- Prometheus / metrics wiring of CORE-06 counters: OPEN.

## CLOSED BY DESIGN
- No learner table and no migration: the model is fully derivable from
  canonical Evidence (SLR projection stays the timeline; Learner Model is the
  dimensional interpretation layer on top of the same evidence).
- No overall score: the model is multidimensional by type and by test.
- No AI decision maker: AI interpretations are surfaced, never converted.
- No new engines: the capability lives in the Core Platform package.
