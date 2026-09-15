# CHANGE / DEVIATION RECORD — BuyTuk Academy

## Purpose
This register records any known deviation from the document baseline, any gap discovered during evidence-based inspection, and any approved direction that goes beyond the document baseline.

| Record ID | Type | Source requirement / reason | Current evidence | Impact | Disposition | Target stage |
|---|---|---|---|---|---|---|
| DEV-001 | DEVIATION | Document expects Next.js 14 frontend portals | No verified Next.js presence found in current repo inspection; current visible UI evidence is thin/static client paths under `apps/api/src/public/*` and API surfaces | Architecture mismatch vs. baseline | Open, documented | PHASE-3 |
| DEV-002 | DEVIATION | Document expects NestJS 10 API gateway | Current backend evidence is Express in `apps/api/src/app.ts` and `apps/api/src/index.ts`; no verified NestJS presence in this turn | Architecture mismatch vs. baseline | Open, documented | PHASE-4 |
| DEV-003 | GAP | Document requires DB-level Row Level Security | RLS policy evidence appeared in docs references, but implementation proof was not verified in migrations/runtime files in this turn | Tenant-isolation risk | Open, blocker-class security gap | PHASE-2 |
| DEV-004 | GAP | Root repo build should be provable | `pnpm run build` currently fails with `TS6307` rooted in `packages/database/tsconfig.json` dependency graph | Build / release blocker | Open, blocker | PHASE-1 |
| DEV-005 | GAP | Wallet / points / badges / store baseline requirement | No verified runtime module proved in current repo inspection | Student journey incomplete | Open | PHASE-11 |
| DEV-006 | GAP | Messages / notes / notifications baseline requirement | No full verified runtime module proved in this turn | Communication layer incomplete | Open | PHASE-11 |
| DEV-007 | GAP | Attendance baseline requirement | No verified attendance runtime implementation proved in this turn | Teacher / parent / oversight incomplete | Open | PHASE-11 |
| DEV-008 | GAP | Parent portal baseline requirement | No verified parent portal runtime proof in this turn | Multi-role completeness incomplete | Open | PHASE-8 |
| DEV-009 | GAP | Principal / admin portal baseline requirement | Oversight/admin API evidence exists, but portal proof remains partial | Operational completeness incomplete | Open | PHASE-9 |
| DEV-010 | GAP | Quality gate requires broad coverage and test matrix | Only targeted tests were verified in this turn; 85%+ coverage and full matrix not proven | Release confidence incomplete | Open | PHASE-12 |
| DEV-011 | ENHANCEMENT | Better educational analytics beyond baseline | Advanced mastery visualization and actionable recommendations may exceed minimum document scope if added later | Product improvement | Allowed only with classification D and traceability | PHASE-13+ |
| DEV-012 | PROCESS | Push/tag evidence not available in this turn | Local git evidence verified; release tag for `BuyTuk.V0.1.3` and remote push success were not verified in this turn | Version formalization pending | Open | Future release gate |
