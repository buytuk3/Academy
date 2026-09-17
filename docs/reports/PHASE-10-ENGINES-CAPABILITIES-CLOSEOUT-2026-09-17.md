# PHASE-10 Closeout — ENGINES-ASSESSMENT-DICTATION-DIAGNOSIS-CONTENT-LESSON — 2026-09-17

Status: **CLOSED / PASS** · Base (verified 1.13 reference): `6590522` · Version adopted: **BuyTuk Academy 1.14** (ADR-028: assigned at CLOSE + ARCHIVE)

## Scope executed (reuse-first — zero migrations, zero new endpoints, zero new libraries)
- **Per-engine functional gates** through the CANONICAL attempts flow (`/v1/attempts` → `engine-adapters.ts` CORE-25/26B, unmodified): NUMERACY (wrong answer → accuracy 0), DICTATION (perfect transcription of a REAL PASSAGE row → accuracy 1), ASSESSMENT (2-item rubric all-correct → rubricScore 1) — each asserted on the REAL canonical evidence row (`sourceEngine=…`) after `EVIDENCE_RECORDED`.
- **Content/Lesson/teacher shell**: passages/lessons/exercises/voice-qa panels became REAL thin clients over the existing canonical library surfaces; analytics reuses `/v1/oversight/aggregates`; ratings stays an explicit placeholder re-targeted PHASE-11 (no canonical table — ADR-033 §3).
- **ADR-033** documents the decision (adapter reuse without new surfaces; ratings deferral; alternatives rejected).
- **P7-5 evolution**: the PHASE-7 roadmap-alignment assertion moved passages from placeholder to REAL data (approved-roadmap evolution, same pattern as P3-3 in PHASE-8).

## Gate evidence (raw exit codes: /home/user/phase10_logs/exit_codes.txt)
| Gate | Result | Exit |
|---|---|---|
| typecheck (root, incl. tests) | clean | 0 |
| build (composite) | clean | 0 |
| Library suites | db 55/55, obs 6/6, worker 1/1, api 8/8, engine 24/24 | all 0 |
| **P10 E2E (new gate)** — real browser + real API + real PG/Redis | **5/5 PASS** | 0 |
| core-32 official files, per-file run (p1 5, p2 1, p3 8, p7 5, p8 5, p9 5, p10 5, auth-sec 5) | **39/39 PASS** | 8×0 |
| Regression E1 (core-28) | 11/11 | 0 |
| Regression E4 (core-31) | 7/7 | 0 |
| Secret scan (diff + tree) | 0 hits | 0 / 0 |
| diff-check | clean | 0 |

**Known pre-existing flake (NOT a PHASE-10 break — cross-proven):** `p1` P1-5 hits the real auth rate-limit (429) when the whole core-32 folder runs as ONE batch without the matrix test-scoped `AUTH_RATE_LIMIT_MAX=1000` (p2..p10 set it in-file per DEV-013; p1 relies on the matrix condition). It reproduces identically on clean `01d3ce6` (proven in the PHASE-9 session) and passes 5/5 under the official matrix condition. A batched run also caught the stale P7-5 assertion BEFORE its evolution — both resolved above.

## Delivery (D-3/D-12)
`buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-10-2026-09-17.tar.gz` — single file via the external host (gofile.io): sha256 + exact byte size + `tar -tzf` exit 0 documented in `MANIFEST-PHASE10-COMPLETE-REFERENCE.md` BEFORE the link is sent; server-reported size+MD5 and a FULL browser round-trip re-download verified to match. Payload: `repo/` @ close commit (full .git history, tag `BuyTuk.V0.1.3` untouched) + `_history/` (2,760 entries) carried from the verified 1.13 reference.
