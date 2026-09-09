# The Database Tab (D5)

Bridge admin engineering area, `/admin/database` (`src/app/admin/database/page.tsx`),
`ADMIN_NAV` key `X`. This doc covers only the five sections and one strip D5
added; the sections that already existed (Mission Control, Database Errors,
Query Performance, Locks & Transactions, Table Health, Jobs & Webhooks,
Telemetry Health, Platform, Advisors, Alert policy) are documented in
`SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md` and `SUPABASE_PLATFORM_OBSERVABILITY.md`.

Every section below is server-only: the page reads through SECURITY DEFINER
facades via the service-role client (`src/lib/supabase/admin.ts`), never a
client-side Supabase call.

## What each section reads, and what feeds it

| Section | Reads | Fed by | Cadence |
|---|---|---|---|
| Changed since yesterday | `helm_debug.db_analysis_samples` (`latest` vs. window ~24h before it) | `db-table-health` cron | hourly |
| Slow statements | `helm_debug.db_statement_samples` | `db-stat-delta` cron | 15 min |
| Index suggestions | `helm_debug.db_analysis_samples`, category `index_suggestion` — **renders a `note` row only; suggestions are not computed** (see below) | `db-table-health` cron | hourly |
| Unused indexes | `helm_debug.db_analysis_samples`, category `unused_index` | `db-table-health` cron | hourly |
| Bloat | `helm_debug.db_analysis_samples`, category `bloat` | `db-table-health` cron | hourly |
| Coverage | `helm_debug.db_analysis_samples`, category `rls_coverage`, plus `scripts/db/rls-coverage.mjs` for the third finding | `db-table-health` cron (two of three findings) + manual/CI script run (third) | hourly + on demand |
| Drift | Mission Control's health-sample timestamp, plus a best-effort `supabase/migrations` directory count | `db-health-sampler` cron (timestamp only) | 5 min |

### Index suggestions are disabled — `index_advisor` runs `DEALLOCATE ALL`

`extensions.index_advisor(query text)` executes `DEALLOCATE ALL` (twice —
verified against production `pg_proc.prosrc`). `helm_debug_db_analysis_snapshot()`
is invoked **over PostgREST** as `service_role` by the `db-table-health` cron, so
that `DEALLOCATE ALL` lands on a PostgREST backend connection and wipes every
prepared statement PostgREST holds on it. PostgREST names its prepared statements
with an integer counter and keeps reusing them, so every subsequent request routed
onto that pooled connection failed with SQLSTATE 26000,
`prepared statement "N" does not exist`.

Measured 2026-09-09: migration `20260906120100` was applied to production at
12:47:44Z; the first 26000 error in the preceding 60 hours appeared at 13:07 — the
first `7 * * * *` run after the function existed. Every later burst starts at :07
past the hour. 303 `admin_events` rows / 646 `postgres_logs` rows in 72h, 9
distinct affected users, across `auth.verifyPlayerAccess`, the CoachHelm v3
generator fleet, messaging, player hub, stats, `savePartialRound`,
`/api/jobs/consume` and `/api/admin/log-event`.

`20260909230000_helm_debug_analysis_drop_index_advisor.sql` removes the call. The
`index_suggestion` category degrades to the single `note` row
`flattenAnalysisSnapshot` already handles for the "extension not installed" case,
so no TypeScript change was needed and the section still renders.

**Nothing PostgREST invokes may call `index_advisor`.** To restore suggestions,
compute them from a `pg_cron` job — a background-worker connection PostgREST does
not reuse — writing straight into `helm_debug.db_analysis_samples`, and have the
snapshot function only read them.

## Migrations (all HELD — see `supabase/migrations/HELD.md`)

- `20260906115900_helm_debug_stat_statements_snapshot_min_exec.sql` — adds
  `min_exec_ms` to the already-applied `helm_debug_stat_statements_snapshot`
  return shape (additive, same signature).
- `20260906120010_helm_debug_db_statement_samples.sql` — `db_statement_samples`,
  `db_statement_alert_state`, `record_db_statement_samples`,
  `helm_debug_read_statement_alert_state`, `helm_debug_read_db_statement_samples`.
- `20260906120100_helm_debug_db_analysis_samples.sql` — `db_analysis_samples`,
  `helm_debug_db_analysis_snapshot`, `record_db_analysis_sample`,
  `helm_debug_read_db_analysis_samples`.
- `20260906120200_helm_debug_observability_retention_v3.sql` — extends
  `helm_debug_prune_observability` (same 4-arg signature discipline v2
  established) to also prune `db_statement_samples`/`db_statement_alert_state`/
  `db_analysis_samples` at 30 days each.

Apply in filename order — `120200`'s body references `120000`'s and
`120100`'s tables by name.

## Retention

30 days for `db_statement_samples`, `db_statement_alert_state` and
`db_analysis_samples`, via the existing daily `db-observability-prune` cron
once the three migrations above are applied. Until then nothing accumulates
because nothing writes (fail-open, see below).

## Fail-open behaviour

Both extended crons (`db-stat-delta`, `db-table-health`) keep their
PRE-EXISTING write (to `db_stat_deltas` / `db_table_samples`) fully
independent of the new capture added by this PR:

- `db-stat-delta` computes the top-25-by-total/top-25-by-mean ranking from
  the SAME `pg_stat_statements` snapshot it already fetches (no second
  read), then tries `record_db_statement_samples`. If that RPC is HELD
  (`isMigrationNotAppliedError`) or fails for any other reason, the route
  still returns 200 with `statementSamples.skipped` set — the pre-existing
  `rowsWritten`/`regressionCount` fields are unaffected.
- `db-table-health` tries `helm_debug_db_analysis_snapshot` +
  `record_db_analysis_sample` the same way, reporting `analysis.skipped`
  on any failure without touching the pre-existing `rowsWritten`.
- Every Bridge read facade (`fetchSlowStatements`, `fetchDatabaseAnalysis`)
  returns `unconfigured` (not `error`) when the RPC does not exist yet, and
  every panel renders `PanelNoData` naming this file's migration list —
  never a fabricated zero or an all-clear.

## Sentry paging (task 5)

`db-stat-delta` pages Sentry (`level: 'warning'`, fingerprint
`db:slow:<queryid>`) for any statement in either top-25 ranking whose mean
exceeds 500ms (`SLOW_STATEMENT_MEAN_THRESHOLD_MS`,
`src/lib/observability/supabase/statement-ranking.ts`), gated to once per
UTC day per queryid via `helm_debug.db_statement_alert_state`
(`selectStatementsToPage`, pure and unit-tested against fixtures). The
message body is the query's `safe_query_class`, never raw SQL text.

## Coverage script (task 3)

`npm run db:rls-coverage` (`scripts/db/rls-coverage.mjs`) is a read-only
census of three findings: RLS-enabled tables with zero policies, public
SECURITY DEFINER functions still `EXECUTE`-able by `anon`/`authenticated`,
and policies whose table is never mentioned in any `supabase/tests/rls/*.sql`
file. The pure matching/comparison logic lives in
`src/lib/observability/supabase/rls-coverage.ts` (fixture-tested,
`__tests__/rls-coverage.test.ts`) so it can be exercised without a live
database; the `.mjs` wrapper connects the same way
`scripts/db/check-supabase-drift.mjs` does (`DATABASE_URL`, or
`SUPABASE_PROJECT_ID`+`SUPABASE_DB_PASSWORD`) and exits 2 when it cannot
connect. Only the first two findings are also computed in-database
(`helm_debug_db_analysis_snapshot`'s `rls_coverage` object) and trended on
the Bridge — the third needs repo file access a SECURITY DEFINER SQL
function does not have, so the Coverage section links out to this script
for the full three-finding picture rather than fabricating a trend for it.

## Known gaps, stated plainly

- **Drift** could not reach either of the brief's preferred sources (a
  persisted drift-check verdict in `helm_debug`, or the last `db-drift`
  GitHub Actions run) from this Bridge deployment — no such table exists
  yet and no GitHub API credential is wired into this page. It falls back
  to the migration ledger's file count (itself best-effort: Vercel's file
  tracer does not guarantee `supabase/migrations` ships in the serverless
  bundle, so this reads `unavailable in this environment` rather than a
  false `0` when the directory cannot be read) plus the health sampler's
  last-sample time.
- **Slow statements' "top by mean"** is a re-sort of the SAME
  Top-K-by-total snapshot `db-stat-delta` already fetches, not a second,
  independent Top-K-by-mean query. A statement with a very high mean but
  low total volume (so it never enters the Top-K-by-total window) will not
  appear in "top by mean" here. Documented, not silent — see
  `statement-ranking.ts`'s header comment.
- **Coverage's third finding** (untested policies) is script-only, not
  live-trended on the Bridge page, for the file-access reason above.
- **`db-migration-reviewer` review has not been requested** for any of the
  four migrations in this PR, consistent with every prior `helm_debug`
  phase's own HELD.md row.
