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
