# ADR-043 — PHASE-22: video-lesson content registry over the existing content chain (own ADR per the roadmap ruling; zero new dependencies; storage = loose pointer)

- Date: 2026-09-20 · Phase: PHASE-22 (VIDEO-LESSON-CONTENT, governing doc v2.1 §3.8) · Status: ACCEPTED
- Base: BuyTuk Academy 1.24 @ `28f98a5` (PHASE-21 close; verified at phase open: sha256
  `418fc2c04e3a7d01fb5e3cf9a4dadc7be6604bd8408b0ec9bd15ec69566b3191`, size 457,327,608 B,
  tar -tzf exit 0 / 5,669 entries, dirty=0, 73 commits)

## Context
The roadmap defines PHASE-22 as VIDEO-LESSON-CONTENT with **no structural dependencies**
and makes its **own ADR mandatory**. §3.8 for the platform means: teachers/principals
register and publish video lessons; students stream ONLY published lessons; everything
tenant-scoped and audited. The management channel directives apply to delivery, not to
the product's own storage — but the no-fake-data rule governs what we register.

## Decision
1. **Ride the EXISTING content registry**: a video lesson is anchored (loose reference
   `lesson_content_id`) to a `content_definitions` row created via the proven
   createContentDefinition/publishContent recipe — the video inherits the tenant scoping,
   audit and library semantics that already exist. NO new content vocabulary is invented.
2. **storage_key is a LOOSE pointer** — the exact convention of PHASE-11's voice flow
   (`attempts.audio_key` text). The video BYTES live in the deployment's object store
   (PHASE-12/DEPL-2 infrastructure: S3-compatible per the infrastructure layer). This
   phase delivers the REGISTRY + publish lifecycle + RLS-scoped reads; a presigned-upload
   byte-transport endpoint is deployment hardening, explicitly documented as a deferred
   concern (below), never faked inside the capability.
3. Migration `0017_phase22_video_lesson_content.sql` (additive-only): `video_lessons` —
   title/storage_key/duration_sec/status CHECK (PROCESSING/READY/BLOCKED); publish
   metadata (published_at/by + publish_operation_key for replay convergence);
   UNIQUE(tenant, operation_key) idempotency; RLS enabled+forced (0007 mechanism,
   fail-closed).
4. **THE atomic publish** (P15-4-proven pattern): a SINGLE conditional UPDATE
   (PROCESSING → READY) with the publish operation key persisted INSIDE the same
   statement — parallel publishes converge via the CAS; replays converge via the
   persisted key (both observe the winner, no second write).
5. Canonical capability `video/capability.ts` (ALL SQL, withTenant everywhere) + thin
   `/v1/video-lessons` adapter (NO SQL; zod-validated; Idempotency-Key required at BOTH
   surfaces — row keys AND §3.3 event keys derive from them; students read ONLY READY
   rows — existence-hiding 404; staff read any status + tenant list; fire-and-forget
   ATTEMPT_SUBMIT-class events, 0011 vocabulary reuse — no new event class).

## §3.8 semantics (fixed by this ADR, asserted by the gate)
- staff register (PROCESSING) → publish (READY, one CAS winner) → student reads READY;
- an unpublished (PROCESSING) lesson is INVISIBLE to students (404 — existence-hiding);
- replay of register/publish with the SAME key → the SAME id / changed=false (one row,
  one event per unique key).

## Alternatives rejected
- **External video pipeline (transcoding/HLS service, Mux/Cloudinary)**: a new external
  dependency + network service for a phase whose roadmap role is the content registry —
  rejected (DEV-022); the storage_key pointer keeps the door open without coupling.
- **Storing video bytes in PostgreSQL (bytea)**: violates every storage convention in
  the repo (audio_key precedent) and the infrastructure layer doc (S3) — rejected.
- **New content-kind vocabulary entry (kind=VIDEO) with new CHECK migration**: touching
  the proven content DDL contract for a registry that already carries the lesson anchor
  adds risk with zero behavioral gain — rejected (loose reference instead).

## Deferred (documented, not hidden)
- Presigned-upload byte transport + real playback URLs: a DEPLOYMENT concern (DEPL-2
  hardening / PHASE-26 CI-CD territory). The registry, lifecycle, and access semantics
  delivered here are complete and testable without it; the storage_key stays opaque.

## Consequences
- The gate `tests/core-32/p22-video-lesson-content.e2e.test.ts` proves on a real app +
  real PG + real Redis (no mocks): register → idempotent replay (same id), atomic
  publish (CAS; replay converged), student visibility gating (404 on PROCESSING),
  RLS fail-closed (tenant-B zero rows), role gates, and exactly-one §3.3 event per
  unique key.
