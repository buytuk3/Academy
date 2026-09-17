# CURRENT INTEGRATED ARCHITECTURE — BuyTuk Academy 1.12 (post PHASE-8)

Single integrated architecture of the WHOLE project (Zero → 1.12). One layer, one truth — no per-phase forks.
Boundaries are binding: ARCHITECTURE_CONTRACT (Modular Monolith, thin adapters, Single Source of Truth) + ADR-029 (Express 5 canonical gateway) + ACR-E5-001 (zero-build thin-client UI).

```
Frontend/UI  (apps/api/src/public — vanilla JS/CSS SPA, ACR-E5-001, served by the API process)
   │  login: student (tenant+identity) & staff (email) · portal nav per JWT role
   │  Student: dashboard/lesson/activity/attempt loop · Teacher: dashboard + REAL review-queue + student reports
   │  Parent: children + child progress report · Principal/Admin: staff dashboard · placeholders → roadmap phases
   ▼
API / Gateway  (apps/api — Express 5, ADR-029)
   │  /healthz (root) · /api/* (legacy documented surface, openapi.yaml) · /v1/* (canonical, v1.yaml 25 paths)
   │  routers: auth · library · activity · students · oversight · teacher · lessons · parents(PHASE-8)
   ▼
Auth / RBAC / Tenant Authorization  (apps/api/src/middleware/auth.ts + @workspace/decisions)
   │  JWT access+refresh · roles: admin|principal|teacher|student|parent · authorize(...roles)
   │  Teacher Gate: DECISION_ROLES + assertActorCanDecide (V-3 loop resume) · rate limiter on /auth
   ▼
Domain / Learning Loop  (@workspace/intelligence + @workspace/db capabilities)
   │  learner model · timeline · patterns · learning-path proposals · teacher review queue
   │  intervention proposals → Teacher Decision → delivery → reassessment → outcome → adapt
   │  Evidence is canonical (never copied); diagnoses/proposals/reassessments/outcomes = loop state
   ▼
Database / RLS  (packages/database — drizzle, PostgreSQL)
   │  18 schema files · migrations 0000..0008 (0007: RLS+FORCE on 33 tenant tables;
   │  0008: parent_student_links) · withTenant (tx-local GUC app.tenant_id, fail-closed)
   │  gates: assertStudentDetailAccess (staff scopes) · assertParentStudentAccess (link gate, PHASE-8)
   │  audit_logs on detail access · tenant isolation: cross-tenant reads as 404 (no leak)
   ▼
Queue / Redis / Worker  (packages/queue BullMQ + apps/worker)
   │  jobs: reading analysis pipeline · events: ReadingAnalyzed, MasteryUpdated
   │  processors write canonical Evidence + mastery_records (the ONLY mastery writer)
   ▼
Engines / AI / Inference  (engines/reading-engine)
   pipeline stages 1..11 · gRPC inference-client (inference.proto: 6 RPCs, deadline+tenant metadata ACR-E6-001)
   storage: S3-presign fail-closed w/ local fallback · observability: pino + prom-client + redaction/correlation
   GPU/CUDA runtime proof → PHASE-12 (ADR-030 deferral)
```

Phase → layer additions: PHASE-1 build fix · PHASE-2 RLS/tenancy (0007) · PHASE-3 portal shell · PHASE-4 gateway alignment (ADR-029, openapi completion) · PHASE-5 shared infra + inference contracts (ADR-030) · PHASE-6 student loop E2E + DEV-013 closure · PHASE-7 teacher capabilities (review/report/remediation) · PHASE-8 parent visibility (0008 + parents surface, ADR-031).

Test inventory (62 files): tests/core-17..33 (34 files: 3,1,1,1,1,1,1,3,1,2,5,1,1,1,1,7,1) + engines/reading-engine 7 + apps/api 2 + apps/worker 1.
