<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Feature: Supabase Service Observability (Auth / Storage / Realtime / Edge Functions)

## Status

- active (platform infrastructure, not a product feature — same reasoning
  as `memory/features/observability-sentry.md`: this module IS an
  observability layer, so it has no `admin_events.feature` key of its own).
  Routed through `admin_platform` in `memory/registry.yml` (the
  `src/lib/observability/supabase/**` glob is owned there, more specific
  than the sibling `src/lib/observability/**` glob that routes to
  `observability-sentry.md`) — this doc is listed in `admin_platform`'s
  `flows:` as a narrower current-state doc for that one subtree, not a
  replacement for `admin-platform.md`.

## Current State

Phase 2 Track B of the zero-cost Supabase observability program. Extends
Phase 1's PostgREST/Postgres error envelope + classifier + out-of-band
recorder (`envelope.ts`/`classify.ts`/`observe-result.ts`/`record-db-error.ts`
— documented in `memory/features/admin-platform.md` and
`docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md`) with four
service-specific classifier/observer pairs and a pure retry-outcome model.
**Full design writeup, fetched-docs source ledger with dates/URLs, exact
expected-vs-actionable decisions per code, and the complete wired/not-wired
list: `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md`.** This file is
the short pointer; that doc is the reference.

### The four service classifiers (all in `src/lib/observability/supabase/`)

- `classify-auth.ts` / `observe-auth.ts` — Auth (`AuthApiError.code` →
  status → message). Not wired into any production Auth call site yet.
- `classify-storage.ts` / `observe-storage.ts` — Storage (`StorageApiError.code`).
  `AccessDenied` deliberately defaults EXPECTED (inverted from
  `classify.ts`'s `42501` convention — Storage buckets are single-owner
  paths where cross-tenant denial is routine). Wired into 6 sites across 4
  server actions (golf/baseball document delete + recruit-document
  upload-rollback/delete).
- `realtime.ts` — client-safe (no `server-only` anywhere in its import
  graph), wraps `channel.subscribe()`. `CLOSED` deliberately NOT treated as
  a failure (ambiguous: fires on both a forced close and an ordinary
  unmount). Wired into all 11 target hooks/components.
- `classify-edge.ts` / `observe-edge.ts` (app side) +
  `supabase/functions/_shared/observability.ts` (Deno side, fail-open
  Sentry Deno wrapper). Wired into the one `functions.invoke(` call site
  (`push.ts`) and all three Edge Functions. Not deployed — owner action.

### Retry / timeout / commit-outcome model

`commit-outcome.ts` — pure, no I/O. `classifyCommitOutcome` answers "did
this actually commit" without ever guessing when the client only saw a
timeout. `summarizeAttempts` produces retry-storm detection. Not wired
anywhere (the intended call sites — `golf.ts`'s `save_partial_round_atomic`/
`submit_round_atomic` — are owned by another session this phase).

### Metrics introduced

`helm.storage.failure`, `helm.realtime.channel_failure`,
`helm.edge_function.failure` — three additive constant+function pairs in
`metrics.ts`, alongside the reused `recordAuth`/`recordDbFailure`.

## Known limitations (see the full doc for detail)

- Auth: zero wired production call sites.
- Storage: one client-side gap (`upload-course-image.ts` — a server-only
  observer cannot be imported into a `'use client'` module) plus five
  out-of-scope files.
- Realtime silent-propagation detection (`createRealtimeActivityMonitor`)
  is exposed but unused — no product invariant exists yet to hang it on.
- Edge Functions are instrumented but not deployed.
- `recordAuth`'s `attempt`≈`failure` counts (reused as-is, called only from
  a failure path) cannot derive an Auth success rate.

## Consumers

- `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md` — the full design
  doc this file points to.
- `memory/features/admin-platform.md` — the broader Bridge/admin
  current-state doc; its `src/lib/observability/supabase/**` section links
  here rather than duplicating this content.
- `memory/ledgers/changes/observability_supabase.md` — the change ledger
  for this track, one entry per deliverable (B1–B6) with commit SHAs.
- `scripts/supabase-error-audit.mjs` — the report-only coverage audit (B6)
  that measures how much of this file's own wiring claims are actually
  true against the live tree.
