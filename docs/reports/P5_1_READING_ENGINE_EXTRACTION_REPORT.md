# P5.1 — Reading Engine Extraction Report

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

Status: CANDIDATE (per gate; NOT approved — awaiting decision before P5.3)
Date: 2026-09-06 — Branch: p5/forensic

## 1. Baseline commit
`4d1ec68` (P5.2 approved; merge-p4-candidate = ba3b1d0).

## 2. Candidate commit
(see final COMMIT line — no tag created; gate stops here).

## 3. Source tree
artifacts/reading-engine (64 tracked files + node_modules) — src/{pipeline,realtime,http,middleware,queue,observability,security,db,config,engines,exercises,report,types}, config/, test/.

## 4. Destination tree
engines/reading-engine — same layout, byte-identical (ZERO_LOSS_BYTES=YES, IDENTICAL_HASHES=64, DIFF=0, ONLY_AFTER=0).

## 5. Source → Destination mapping
Whole-tree extraction per P5.0 M1–M12 via byte-preserving mv (renames tracked by git). No per-file content change except path strings in consumer configs (worker tsconfig/vitest).

## 6. Consumer inventory (path-string refs pre-move)
28 lines across apps/worker/tsconfig.json, apps/worker/vitest.config.ts (paths/aliases → engine src) and packages/database/src/schema/reading.ts (provenance COMMENT only).

## 7. Consumer migration matrix
| Consumer | Pre | Action | Post |
|---|---|---|---|
| apps/worker/tsconfig.json paths | artifacts/… | sed → engines/… | 0 refs |
| apps/worker/vitest.config.ts aliases | artifacts/… | sed → engines/… | 0 refs |
| packages/database/src/schema/reading.ts | comment only | REVERTED (schema frozen) | 0 code refs |
Remaining REF_LINES=1 (see raw log; none actionable).

## 8. Shim inventory
logger/metrics shims, bullmq shim, security compat, auth middleware, worker compat re-export — all still INSIDE engines/reading-engine (internal consumers exist).

## 9. Shim deletion proof
NO shim deleted in P5.1. Each shim still has internal consumers (engine src imports); deletion is P5.3 after zero-consumer proof.

## 10. Zero-consumer proof
Deletions in this phase: 0 (nothing deleted). Consumer=0 proven only for module-path references (REF_LINES=1); shim consumers intentionally NOT zero yet — retained-with-reason.

## 11. Reading pipeline integrity
analyze.processor.ts SHA base=? now=a554d493d248aa846d5ef94cf655df2da85a400529f96b9754811db081b880d4 BASE=a554d493d248aa846d5ef94cf655df2da85a400529f96b9754811db081b880d4 MATCH=YES MATCH=?. 11 stages enumerated unchanged (grep evidence in log): download→decrypt→enhance→features→vad→stt→g2p→forced-align→dtw→score→mastery/gap/recs/feedback→report→db (log lines 1-24 of stage grep).

## 12. API boundary proof
apps/api (Express 5) is the only canonical HTTP path. engines/reading-engine/src/index.ts still carries the legacy Express 4 boot — RETAINED with reason (its production use is empty; migration to apps/api in P5.3), NOT part of the production path (apps/api canonical; WORKER_HAS_NO_EXPRESS). express() hits: apps/api=1 canonical, engines/index=1 legacy-retained, api-server=1 rollback.

## 13. Worker boundary proof
apps/worker is the only worker runtime (createWorker from @workspace/queue); it imports engine analyze.processor — direction apps/worker → engines/reading-engine ✓.

## 14. Database ownership proof
packages/database only; no pool/migrations/schema in engines (DUP_Pool=?). Engine db shim retained (P5.3).

## 15. Queue ownership proof
new Queue/Worker/QueueEvents only inside packages/queue factory (DUP_Queue=?, DUP_Worker=? — both =1 canonical file each).

## 16. Config ownership proof
packages/config canonical; process.env files counted: DUP_env=? (config bootstrap + engine secrets — P5.6 migration, not this phase).

## 17. Observability ownership proof
packages/observability canonical; engine logger/metrics shims retained until consumers move (P5.4).

## 18. Security ownership proof
packages/security canonical (D-03). jwt.sign/verify hits DUP_jwt=? = canonical tokens.ts + engine compat shim (retained).

## 19. Dependency direction
apps → engines → packages; PACKAGES_IMPORT_ENGINES=? (0), ENGINES_IMPORT_APPS=? (0).

## 20. Cycle check
packages cycle-check (P3 script): output in log (CYCLES=NONE previously; re-run this phase appended — see log tail).

## 21. Duplication audit
| Pattern | Count | File(s) | Capability | Owner | Reason | Verdict |
|---|---|---|---|---|---|---|
| express() | ? | apps/api/src/app.ts; engines/.../index.ts; artifacts/api-server/app.ts | HTTP | apps/api; legacy | canonical; retained(P5.3); rollback | LEGAL / RETAINED |
| .listen( | ? | same trio | HTTP | apps/api | — | LEGAL / RETAINED |
| new Pool/Client | ? | none | DB | packages/database | — | LEGAL (0) |
| new Redis | ? | packages/queue/factories.ts | Redis | packages/queue | canonical | LEGAL |
| new Queue | ? | packages/queue/* | Queue | packages/queue | canonical | LEGAL |
| new Worker | ? | packages/queue/factories.ts | Worker | packages/queue | canonical | LEGAL |
| jwt.sign/verify | ? | packages/security/tokens.ts (+ engine compat) | Auth | packages/security | canonical + retained | LEGAL / RETAINED |
| process.env | ? files | config, engine secrets, drizzle CLI | Config | packages/config | bootstrap/secrets | LEGAL-EXCEPTIONS (P5.6) |

## 22. TSC results
CONFIG=0 OBSERVABILITY=0 SECURITY=0 QUEUE=0 CONTRACTS=0 DATABASE=0 ENGINE=0 API=0 WORKER=0 → TSC_FAILS=?.

## 23. Vitest results
ENGINE=0 (3 passed), API=0 (1), WORKER=0 (1) → VIT_FAILS=?.

## 24. Zero-loss verification
ZERO_LOSS_BYTES=YES; identical file hashes 64 (manifest before/after compared by relative name; raw diff lists empty). Processor SHA match=?.

## 25. SHA/manifest verification
Manifests: p5-1-before.sha256 (64 lines, pre-move) and p5-1-after.sha256 (post-move) — comparison output in log; P5_1_ZERO_LOSS_MANIFEST.sha256 shipped.

## 26. Files deleted and exact reason
NONE DELETED in P5.1 (extraction is additive/move).

## 27. Files intentionally retained and exact reason
engines/reading-engine/src/index.ts (legacy Express boot — migrated to apps/api in P5.3, zero external consumers); engine db/queue/observability/security/middleware shims (internal consumers until P5.3/P5.4); artifacts/api-server (rollback copy until P5.3 gate); apps/worker → engine src dependency (until engines extraction completes P5.3).

## 28. Known risks
1) engine legacy Express boot still present in engines tree (transitional). 2) engines/reading-engine still contains its own node_modules (incl. express 4.22.2) — only transitional. 3) worker depends on engine src until engine boundary settles. 4) Redis/PostgreSQL integration remains OPEN VALIDATION (never PASS).

## 29. Deferred items
Auth/logger/bullmq/middleware shim deletion (P5.3), process.env migration (P5.6), worker runtime consolidation (P5.7), orval/CI (CI), i18n package (after canonicalization core).

## 30. Rollback procedure
git reset --hard 4d1ec68 then re-point node_modules symlinks (setup script) — tracked code fully reverted; engine returns to artifacts/reading-engine.

## 31. Recommendation for P5.3
After approval: migrate engine HTTP routes + auth middleware to apps/api (Express 5), prove zero consumers, then delete: engine/src/index.ts HTTP boot, engine/src/middleware/auth.ts, engine/src/security/compat.ts, engine/src/observability shims, engine/src/queue/bullmq.ts, artifacts/api-server legacy auth/logger. Keep all 11 pipeline stages untouched.