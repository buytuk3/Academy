# PHASE-20 CHARTER — GRAMMAR-PARSING-ENGINE / الإعراب (governing doc v2.1, §3.7)

- Date: 2026-09-20 · Base: BuyTuk Academy 1.22 @ `4cf8a2a` (byte-verified this phase: sha256 `ecc56522…d235`, 457,115,053 B, tar -tzf exit 0 / 5,524 entries, dirty=0, 67 commits)
- Constraints honored: additive-only migration (0015, ADR-041 — the roadmap-mandated own
  ADR); RLS enabled+forced fail-closed (0007 mechanism); idempotency by
  (tenant, operation_key) with recorded engine_version; fire-and-forget §3.3 logging;
  thin SQL-free adapters; the REAL deterministic rules engine (pure TS — ZERO new
  dependencies, DEV-020); NO fabricated grammar (NEEDS_REVIEW for unclassifiable tokens).

## Gates (fixed in advance — OPEN gates never PASS)
| Gate | Definition of PASS |
|---|---|
| MIG-1 | migration 0015 applies (idempotent re-run safe); RLS enabled+forced on `grammar_parsings`; `grammar_parsings_op_uniq` UNIQUE present |
| P20-1 | §3.7 REAL parse: "ذهبَ الطالبُ إلى المدرسةِ في الصباحِ" → 6 tokens, review_count=0, exact i'rab (فعل ماضٍ مبني / فاعل مرفوع / حرف جر / مجور بالكسرة ×2); replay with the SAME Idempotency-Key returns the SAME id (one row, existed=true) |
| P20-2 | no-fake-data: "وقف الطالبُ قُبيلَ الفصلِ" → قُبيل + الفصل = NEEDS_REVIEW (review_count=2); staff may parse for a student of their tenant |
| P20-3 | RLS fail-closed: tenant-B reads zero tenant-A rows (existence-hiding 404); role gates (student /mine works; staff surfaces 403 for students) |
| P20-4 | §3.3 fire-and-forget: ONE ATTEMPT_SUBMIT event per unique submit on the interaction stream (replays collapse) |
| REG-0 | typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file (incl. p15+p16+p17+p18+p19+p20), secret scans 0+0, diff-check clean — all exit 0 |
| CLOSURE | STAGE_STATUS/CDR/PROJECT_VERSION/MASTER_ROADMAP updated + independent closeout report + single-file archive uploaded in-conversation (sha256/size/tar -tzf proof) + uploaded to the OWNER'S gofile account via the saved token (endpoint /contents/uploadfile) with server-side md5/size echo match |
