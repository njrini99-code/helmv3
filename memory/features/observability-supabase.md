<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Feature: Supabase Database Observability

## Status

- active build, two phases so far, both HELD at the database layer (no
  migration in either phase has been applied to production — see
  `supabase/migrations/HELD.md`)
- platform infrastructure, not a product feature — this doc exists so a
  reader touching `helm_debug.*`, `src/lib/observability/supabase/**`, or
  `src/lib/admin/database/**` has one place to start; add a
  `memory/registry.yml` mapping the next time this area is touched (none
  exists yet — a real gap this doc is flagging, not silently filling)

## Current State

Zero-incremental-recurring-cost database/Postgres observability for Helm
Bridge, built from `docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md`.
Production facts this whole build is measured against live in
`docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md` — most
consequential: `max_connections` is 60, not the brief's original ~200
snapshot, and `service_role` statement timeout is 30s.

### Design shape, both phases

Every collector follows the same pattern: a read-only definer-rights RPC
returns absolute counters plus (where relevant) the previously stored row;
delta/threshold arithmetic happens in a PURE TypeScript function (no I/O,
fixture-tested); a write RPC persists the result. `helm_debug` is a schema
revoked from `public`/`anon`/`authenticated` and not PostgREST-exposed —
every access path, read or write, is a definer-rights function with EXECUTE
granted to `service_role` only and an ACL assertion (`do $$ ... raise
exception ...`) in the same migration file. No raw SQL query text, request
bodies, JWTs, or user/team/round UUIDs are ever persisted; query
identification is a small closed "safe query class" (a keyword plus at most
one identifier) computed inside SQL from a length-bounded prefix.

Vercel cron routes (`src/app/api/cron/**`), not `pg_cron` — production has
exactly one native `pg_cron` job today (an unrelated daily prune,
predating this build), so new collectors extend the established Vercel-cron
pattern instead. Every collector route degrades to a `200` no-op
(`isMigrationNotAppliedError`, matching codes `PGRST202`/`42883`/`42P01`/
`3F000`) while its migration is HELD, rather than failing the cron run.

Every Bridge reader (`src/lib/admin/database/*.ts`) returns the shared
`AdminFetchResult` envelope (`ok` / `unconfigured` / `error`) — a missing
migration reads `unconfigured`, never a fabricated green result.

### Phase 1 (merged before this doc; brief §5-9, §15-17, §24-25, §27, §33, §35A-C)

- Tables: `helm_debug.db_error_events`, `db_health_samples`,
  `db_stat_deltas`, `db_stat_prior_state`.
- Collectors: `db-health-sampler` (5 min), `db-stat-delta` (15 min),
  `db-observability-prune` (daily, `45 4 * * *`).
- Pure evaluators: `src/lib/observability/supabase/db-health-delta.ts`,
  `query-regression.ts`, `classify.ts`, `envelope.ts`, `integrity.ts`,
  `observe-result.ts`, `record-db-error.ts`.
- Bridge readers: `src/lib/admin/database/overview.ts` (Mission Control),
  `errors.ts` (grouped by fingerprint), `performance.ts` (Top-K deltas +
  regressions).
- Bridge page: `src/app/admin/database/page.tsx` — Mission Control,
  Database Errors, Query Performance sections.

### Phase 2 (this doc's authoring PR; brief §18-19, §23, §26, §28-29, §35D/F/G, §40-48, §44)

- Tables: `helm_debug.db_lock_incidents`, `db_table_samples`. No new table
  for pg_cron/pg_net health (a pure read facade over `cron.*`/`net.*`).
- Collectors: locks/blocking folded into the existing `db-health-sampler`
  run (one connection per run, per brief §27) rather than a new schedule;
  new hourly `db-table-health` (`7 * * * *`).
- Pure evaluators, all in `src/lib/observability/supabase/`:
  - `locks.ts` — `evaluateLockSnapshot`, app-role vs service-role
    thresholds (8s posture vs the measured 30s service_role timeout),
    deadlocks fed from the health sampler's own delta signal.
  - `health-rules.ts` — `evaluateConnectionSaturation` (fraction scale,
    0.70/0.80-sustained/0.90) and `evaluateRollbackRate` (baseline from the
    older half of a >=24-sample window, regression needs both >2x baseline
    AND >5% absolute).
  - `table-health.ts` — `computeTableSampleDelta` /
    `evaluateTableHealth`; dead-tuple count is deliberately excluded from
    reset detection (autovacuum legitimately shrinks it).
  - `jobs-health.ts` — `evaluateCronJob` / `evaluatePgNetHealth`; no
    "critical app cron" tag exists (no registry backs one — see the
    module's own header).
  - `freshness.ts` — `classifySourceFreshness` (HEALTHY/DEGRADED/STALE/
    BLIND/UNKNOWN, 1.5x/3x) and `summarizeTelemetryHealth` (never GREEN
    with a required source blind or stale).
- Bridge readers: `src/lib/admin/database/locks.ts`, `tables.ts`,
  `jobs.ts`, `telemetry.ts` (composes the other four readers plus a sizes/
  self-monitoring RPC rather than re-querying).
- Bridge page additions: Locks & Transactions, Table Health, Jobs &
  Webhooks, Telemetry Health sections; Mission Control gained inline
  connection-saturation/rollback-rate chips (extends the existing section
  rather than adding a fifth).
- Retention: `public.helm_debug_prune_observability` (Phase 1) was
  `CREATE OR REPLACE`d with a byte-identical 4-argument signature — adding
  parameters would have created a second, ambiguous PostgREST overload
  against the existing zero-argument cron call — to also prune the two new
  tables on fixed internal 30-day windows. A new sizes/self-monitoring
  facade covers all six `helm_debug` observability tables.

### Phase 3 track D (brief §34, §40-43, §48, §53, §68)

Diagnostics and correlation — the layer that turns "what failed" into "what it
means and what changed". Full design:
`docs/observability/SUPABASE_DIAGNOSTICS.md`. **No migration**: every read goes
through an RPC that already exists, so this phase adds no table, no facade and
no `HELD.md` row.

- Pure evaluators, all in `src/lib/observability/supabase/`:
  - `schema-drift.ts` — maps a missing-object failure (42P01/42703/42883/
    3F000 and the PostgREST 20x schema-cache family) to a verdict, keeping
    THREE axes independent with three separate `unknown`s: does the TREE
    create it, does the LEDGER record it, do the TYPES mention it. The
    ledger is explicitly not authoritative about what is live, and every
    unreadable input is `unknown` rather than `absent`.
  - `authorization-diagnosis.ts` — EXPECTED_SECURITY_DENIAL vs
    UNEXPECTED_PRODUCT_FAILURE vs UNKNOWN, plus the §68 42501 runbook
    pruned by RPC/table surface. No default expectation: only the call site
    knows, so silence is UNKNOWN. The input type cannot carry a message,
    so a policy predicate has no path to the output.
  - `release-correlation.ts` — the causal ladder (unknown / no-signal /
    possible / likely / reproduced-cause) with every signal sorted into
    corroborating (release-side facts) / not-corroborating (restatements of
    the incident, emitted so a reader sees they were rejected) /
    exculpatory. Proximity alone tops out at `possible`;
    `reproduced-cause` needs experimental evidence. No numeric confidence.
  - `service-layers.ts` — observed layer vs likely origin layer, with
    ambiguity as an explicit answer (PGRST003, a bare 5xx) rather than a
    coin flip. A five-character SQLSTATE is a Postgres verdict wherever it
    surfaced.
  - `call-budgets.ts` — measure-before-enforce per-journey call budgets,
    `baseline_status: 'collecting' | 'ready'`, median baseline, no
    per-journey constant anywhere. NOT WIRED: `db_stat_deltas` has no
    journey dimension.
- Bridge readers: `src/lib/admin/database/incident-detail.ts` (composes one
  fingerprint's detail; every section carries its own
  ok/empty/unconfigured/blind state) and `drift-inputs.ts` (the I/O half
  behind `schema-drift.ts`; degrades to unreadable, never to empty).
- Bridge page addition: a single-fingerprint detail surface at
  `/admin/database?incident=<fingerprint>`, linked from each error-group
  row. The admin gate still runs before any data access.

## Tests

Unit-level TypeScript fixtures against every pure evaluator listed above
(`src/lib/observability/supabase/__tests__/*.test.ts`) and every reader
(`src/lib/admin/database/__tests__/*.test.ts`), 241 tests at last count in
this area — see `memory/ledgers/tests/observability_supabase.md` if a
ledger entry exists there, or add one alongside this doc's next update; no
pgTAP suite exists for these migrations (same as Phase 1's own migrations),
and no RLS test exists because there is no row-level policy — the schema
revocation plus definer-rights-only facade pattern is the enforced
boundary, verified at review time via the ACL tripwire `do $$` blocks in
each migration, not by pgTAP.

## Known gaps / not yet built

Per `docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md` §7 and
this Phase 2 track's own scope: Auth/Storage/Realtime/Edge Function
classification, W3C trace propagation certification, Supabase Metrics API
integration, Advisor integration, on-demand log evidence, Trace Explorer
extension and replay fixtures, alert policy/paging. None of these are
silently absent — each stays an explicit NOT VERIFIED / not-yet-built item
rather than an assumed "done."

Phase 3 track D adds its own, all recorded rather than assumed:

- `call-budgets.ts` has no collector. `helm_debug.db_stat_deltas` carries
  `queryid` / `safe_query_class` / `source_class` and no journey dimension,
  so nothing in this repo can attribute a DB call to a journey today.
- `drift-inputs.ts` reads `supabase/migrations/**` and
  `src/lib/types/database.ts` from disk. Those are repository files, not
  part of a traced serverless function bundle, so in a DEPLOYED Bridge both
  drift axes report `unknown`. An `outputFileTracingIncludes` change to
  `next.config.mjs` would fix it and was deliberately not made.
- The applied-migration-ledger read is credential-gated and NOT VERIFIED —
  `.env.local` is withheld from worktrees, so it has never been observed
  returning a non-null result. It fails open to `null`.
- No data-invariant registry is wired to a fingerprint, and the Sentry
  issue is not fetched on the detail surface. Both are declared
  `unconfigured` there rather than omitted or rendered as passing.
- `identity.httpStatus` on the detail surface is structurally null: the
  error store has no HTTP column. It renders "not captured".

<!-- merged: Track B section appended by the Phase 2 integrator -->
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
