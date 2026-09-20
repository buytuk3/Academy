# PHASE-20 CLOSEOUT — GRAMMAR-PARSING-ENGINE / الإعراب (governing doc v2.1 §3.7) — 2026-09-20

- Base: BuyTuk Academy 1.22 @ `4cf8a2a` (PHASE-19 close; byte-verified at phase open: sha256
  `ecc56522969e0a02bb1161b506d48e33ef4228d411a90bf6f1514227ff3dd235`, size 457,115,053 B,
  tar -tzf exit 0 / 5,524 entries, dirty=0, 67 commits)
- Code commit: `71f5a59` · Close commit: recorded in the version chain below
- Preamble (binding): PHASE-13 (AI-RUNTIME-PROOF / DEP-001) remains OPEN — LAST after PHASE-26 (2026-09-19 ruling).

## What was built (additive-only; ADR-041 — the roadmap-mandated own ADR; ZERO new dependencies, DEV-020)
1. Migration `0015_phase20_grammar_parsing_engine.sql`: `grammar_parsings` (tokens jsonb,
   token_count, review_count, engine_version; UNIQUE(tenant, operation_key) idempotency).
   RLS enabled+forced (0007 mechanism, fail-closed).
2. The REAL deterministic rule-based i'rab engine (`grammar/parser.ts`, pure TS — no NLP
   dependency, no network): tashkeel/punctuation normalization; bounded canonical lexicons
   (huruf jarr, other particles, demonstratives, pronouns, past verbs + past-suffix
   morphology); jarr→majrur and fel→fael dependency tracking; **NO GUESSING** —
   unclassifiable tokens are stamped NEEDS_REVIEW (review_count), never fabricated.
   engine_version ("1.0.0-rules") stamped on every row for auditability.
3. Canonical capability `grammar/capability.ts` — ALL SQL inside withTenant;
   parseAndRecord (parse + record ONCE per operation key; replays return the SAME row),
   getGrammarParsing, listGrammarParsings.
4. Thin `/v1/grammar` adapter — NO SQL; zod-validated; Idempotency-Key required (the row
   key AND the §3.3 event key derive from it → replays collapse on both); students parse
   for themselves (/mine), staff may target a tenant student and read tenant rows;
   fire-and-forget ATTEMPT_SUBMIT-class events (0011 vocabulary reuse — no new class).

## Gates (all exit 0 — full register in /home/user/phase20_logs/exit_codes.txt)
MIG-1 (migrate+RLS+policy checks), P20 gate 4/4 PASS, REG-0 full matrix
(typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file ×14
incl. p15 6/6 + p16 + p17 + p18 + p19 + p20, auth-security, secret-diff 0,
secret-tree 0, diff-check clean).
