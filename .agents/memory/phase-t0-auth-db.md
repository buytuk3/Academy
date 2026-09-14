---
name: Phase T-0 Auth & DB
description: What was built in Phase T-0 — DB schema, auth routes, and key pitfalls to avoid repeating
---

## What was built

**DB Schema** (`lib/db/src/schema/`):
- 13 tables: tenants, users, schools, classes, students, reading_sessions, evidence_items, gaps, remediation_plans, remediation_activities, impact_measurements, audit_logs, refresh_tokens
- All use `text` PKs with `crypto.randomUUID()` default (not serial)
- All tables have `tenant_id` FK for multi-tenant isolation
- Pushed via `pnpm --filter @workspace/db run push` (drizzle-kit push)

**Auth** (`artifacts/api-server/src/`):
- `lib/auth.ts` — hashPassword/verifyPassword (bcrypt), signAccessToken/verifyAccessToken (JWT), generateRefreshToken/hashRefreshToken
- `middleware/authenticate.ts` — Bearer JWT middleware; attaches `req.user: TokenPayload`
- `routes/auth.ts` — register, login, refresh (with rotation), logout, /me
- JWT_SECRET = SESSION_SECRET env var (already set as Replit Secret)
- Access token: 15 min | Refresh token: 30 days, stored as SHA-256 hash

## Critical pitfalls

**Zod version mixing (will break silently):**
- `drizzle-zod@0.8.x` uses zod v4 API internally (via `zod@3.25+/v4/` subpath)
- If you call `drizzleZodSchema.extend({ field: z.string() })` where `z` is from main `"zod"` entry → runtime crash: "expected a Zod schema"
- **Rule:** Never mix drizzle-zod schemas with pure zod v3 schemas in `.extend()` / `.pick()` / `.omit()`
- **Fix:** Define auth validation schemas from scratch using `z.object({...})` only — don't derive from `insertUserSchema`

**`zod/v4` import in esbuild:**
- esbuild (in api-server) cannot resolve `"zod/v4"` subpath
- All schema files in lib/db use `import { z } from "zod"` (not `"zod/v4"`)
- If you need zod v4 APIs (like `z.email()`), they are NOT available via `"zod"` main entry in v3.x
- **Fix:** Use `z.string().email()` not `z.email()` for email validation in api-server

**DATABASE_URL:**
- Runtime-managed by Replit — never appears in `viewEnvVars()`
- Available automatically in workflow environment — no manual setup needed
- `checkDatabase()` confirms it's reachable

**Why:**
All of the above were hit during Phase T-0 and cost multiple build cycles. Documenting here prevents repeat.

**How to apply:**
Read this before: adding new Drizzle schema files, adding new API routes that use zod validation, or touching auth middleware.
