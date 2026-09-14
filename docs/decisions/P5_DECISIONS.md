# P5 — Decisions (P5D)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

Version 0.4 — date 2026-09-06 — base merge-p4-candidate ba3b1d0 — branch p5/forensic

## P5D-01 — apps/api is the ONLY canonical HTTP path, on Express 5
Installed + actually-loaded = 5.2.1 (real directory install; @types/express@5.0.6). Engine/legacy Express 4 exists only
as artifact until P5.1 extraction — never part of the production path.

## P5D-02 — Engine Express 4 HTTP boot is removed ONLY inside P5.1 extraction (deletion gate)
Consumers inventory -> canonical replacement proven -> tests green -> zero consumers -> audit -> SHA -> delete. Nothing deleted in P5.2.

## P5D-03 — CI install rule
apps/api installs express@5.2.1 + @types/express@5.0.6 as REAL packages (lockfile). Never symlink express from the engine tree.
CI asserts require('express/package.json').version === '5.2.1' inside apps/api and the resolved path contains no 'artifacts'.

## P5D-04 — i18n sequencing (user priority)
packages/i18n (platform capability: language/locale/region/RTL/fallback/pluralization/date-number/lazy resources; locales
ar,en,fr,it + regional variants; interfaceLocale != learningLanguage) starts only after Express 5 + engine extraction +
auth/queue/config canonicalization settle. No AI translation engine; no DB schema change without freeze policy.

## P5D-05 — Type-only adaptation of middleware to @types/express@5 (recorded; runtime untouched)
requestContext (@workspace/observability), httpLogger (@workspace/observability) and express-rate-limit ship middleware
typings written against @types/express@4; under @types/express@5 their overloads reject app.use(). Fix = type-only casts
(`as any`, erased at compile) in apps/api/src/app.ts ONLY, each with an inline comment. Runtime behavior identical; engine
source untouched; app.ts SHA before/after recorded in the report. If a future version ships Express-5-native types, the
casts are removed without behavior change.