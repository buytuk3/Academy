# ADR-041 — PHASE-20: grammar-parsing engine (الإعراب) as a real deterministic rules engine (zero new dependencies — the roadmap-mandated own ADR)

- Date: 2026-09-20 · Phase: PHASE-20 (GRAMMAR-PARSING-ENGINE / الإعراب, governing doc v2.1 §3.7) · Status: ACCEPTED
- Base: BuyTuk Academy 1.22 @ `4cf8a2a` (PHASE-19 close; verified at phase open: sha256
  `ecc56522969e0a02bb1161b506d48e33ef4228d411a90bf6f1514227ff3dd235`, size 457,115,053 B,
  tar -tzf exit 0 / 5,524 entries, dirty=0, 67 commits)

## Context
The roadmap defines PHASE-20 as GRAMMAR-PARSING-ENGINE / الإعراب with **no structural
dependencies** and makes its **own ADR mandatory**. §3.7 for the platform means: real
Arabic grammatical analysis of student-facing text with recorded, queryable, tenant-scoped
results — feeding future exam/exercise flows (PHASE-21+) without fabricating any grammar.

## Decision
1. **A REAL deterministic rule-based i'rab engine in pure TypeScript** — `grammar/parser.ts`,
   no external NLP/ML dependency, no network, no package.json change (zero new
   dependencies; DEV-020):
   - normalization: tashkeel/tatweel/punctuation stripping (real morphological
     preprocessing);
   - bounded canonical lexicons: حروف الجر (~16), other particles (استفهام/نصب/جزم/نفي/
     توكيد/عطف), أسماء الإشارة والموصولة, الضمائر, common past-tense verbs + real
     past-tense suffix morphology (تُ/تَ/تِ/نا/وا/تم/تن);
   - dependency grammar: جار→مجرور tracking (the token after a jarr particle is اسم
     مجرور بالكسرة), فعل→فاعل tracking (مرفوع بالضمة); particles are مبني لا محل له;
   - **NO GUESSING**: any token the rules cannot classify is stamped `NEEDS_REVIEW`
     (surfaced in the row's `review_count`) — the engine never invents a grammatical
     position (the governing no-fake-data rule).
   - `engine_version` ("1.0.0-rules") is stamped on every stored row so later lexicon
     expansions are auditable per row.
2. Migration `0015_phase20_grammar_parsing_engine.sql` (additive-only): `grammar_parsings`
   — id, tenant (RLS 0007 fail-closed), student (loose text — survives deletions),
   input_text, tokens jsonb (the full per-word analysis), token_count, review_count,
   engine_version, operation_key UNIQUE(tenant, operation_key) — idempotency.
3. Canonical capability `grammar/capability.ts` (ALL SQL, withTenant everywhere):
   `parseAndRecord` (parse + record once; replays return the SAME row),
   `getGrammarParsing`, `listGrammarParsings` (student-scoped or tenant-wide staff).
4. Thin `/v1/grammar` adapter — NO SQL; zod-validated; Idempotency-Key required at the
   parse surface (operation key + event key both derive from it → replays collapse on
   BOTH the row and the §3.3 event); students parse for themselves (`/mine`), staff may
   target a student and read tenant rows; fire-and-forget ATTEMPT_SUBMIT-class events
   (0011 vocabulary reuse — no new event class).

## §3.7 semantics (fixed by this ADR, asserted by the gate)
- a REAL parse of "ذهبَ الطالبُ إلى المدرسةِ في الصباحِ" → 6 tokens, review_count=0:
  ذهب (فعل ماضٍ، مبني على الفتح) · الطالب (فاعل، مرفوع بالضمة) · إلى (حرف جر، مبني) ·
  المدرسة (اسم مجرور، بالكسرة) · في (حرف جر، مبني) · الصباح (اسم مجرور، بالكسرة);
- "وقف الطالبُ قُبيلَ الفصلِ" → قُبيل AND الفصل are both outside the bounded scope →
  BOTH stamped `NEEDS_REVIEW` (review_count=2) — flagged for the teacher, never fabricated;
- the same Idempotency-Key always returns the SAME parsing row (one row, one event).

## Alternatives rejected
- **External NLP libraries (Arabic analyzers/FARASA/Camel Tools) or an ML service**:
  new dependencies + a network service violate the zero-dep reuse-first contract and
  add unbounded nondeterminism to a student-facing surface — rejected (DEV-020). The
  `engine_version` + rules-table design makes a future engine swap auditable.
- **Guessing positions for out-of-lexicon tokens (statistical fallback)**: fabricated
  grammar is worse than flagged ignorance for a teaching product — rejected.
- **A scheduler to pre-parse library content**: no §3.7 requirement; parse-on-demand
  with recorded results — rejected.

## Consequences
- The gate `tests/core-32/p20-grammar-parsing-engine.e2e.test.ts` proves: the real parse
  (exact §3.7 semantics above), idempotent replay (same id, one row, one event),
  no-guessing semantics, RLS fail-closed (tenant-B 404 existence-hiding), role gates,
  on a real app + real PG + real Redis with no mocks.
