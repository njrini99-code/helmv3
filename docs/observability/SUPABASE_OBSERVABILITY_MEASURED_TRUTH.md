<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Supabase observability — measured truth (Phase 1)

Re-measured against production 2026-09-02/03, read-only, via the Supabase
Management API (`POST /v1/projects/qmnssrrolpinvwjjnufo/database/query`,
`SUPABASE_ACCESS_TOKEN`). Every claim below carries the exact query that
produced it. This supersedes the snapshot in
`docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md`
§1 wherever the two disagree — the brief itself says that snapshot is "a
starting point, not eternal truth." Four numbers disagree; see §2.

No writes were made. No migration in this PR has been applied. See
`supabase/migrations/HELD.md` for the apply ledger.

## 1. Extensions, settings, schema state

```sql
select extname, extversion from pg_extension order by extname;
```

Installed: `citext 1.6`, `hypopg 1.4.1`, `index_advisor 0.2.0`,
`pg_cron 1.6.4`, `pg_graphql 1.5.11`, `pg_net 0.19.5`,
`pg_stat_statements 1.11`, `pg_trgm 1.6`, `pgcrypto 1.3`, `pgmq 1.5.1`,
`plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`.

`pgaudit` is **not installed** but **is available**
(`select count(*) from pg_available_extensions where name='pgaudit'` → `1`).
Matches brief §31: stays OFF by default.

```sql
select name, setting, unit from pg_settings
where name in ('max_connections','track_io_timing','compute_query_id',
  'shared_buffers','statement_timeout','idle_in_transaction_session_timeout',
  'wal_level') order by name;
```

| setting | value |
| --- | --- |
| `compute_query_id` | `auto` |
| `idle_in_transaction_session_timeout` | `0` (disabled, global default) |
| `max_connections` | **60** |
| `shared_buffers` | `32768` × 8kB = 256 MB |
| `statement_timeout` | `120000` ms (2m, global default) |
| `track_io_timing` | `off` |
| `wal_level` | `logical` |

PostgreSQL `17.6 on aarch64-unknown-linux-gnu` (`select version()`).

## 2. Corrections to the brief's 2026-09-03 snapshot

The brief's §1 stated `max_connections` ~200 and service_role timeouts
"statement 2m / lock 15s / idle-in-tx 8s". Measured today:

```sql
select rolname, rolconfig from pg_roles
where rolname in ('anon','authenticated','authenticator','service_role','postgres')
order by rolname;
```

| role | rolconfig (`ALTER ROLE ... SET`) |
| --- | --- |
| `anon` | `statement_timeout=8s` |
| `authenticated` | `statement_timeout=8s` |
| `authenticator` | `session_preload_libraries=safeupdate`, `statement_timeout=8s`, `lock_timeout=8s` |
| `postgres` | `search_path=…` only — no timeout override |
| `service_role` | **`statement_timeout=30s`** |

**`max_connections` is 60, not ~200.** Every saturation threshold in brief
§19 changes if adopted verbatim: a 70% sustained-warning line is 42
connections, not 140, and 90% critical is 54, not 180. The current snapshot
(§4 below) of 22 connections in use is already **37% of max**, not the ~11%
the brief's own baseline would imply. This is the single most consequential
correction in this document for threshold-setting in a later phase.

**`service_role` statement timeout is 30s, not 2m.** The collectors this PR
adds run as `service_role`. A `pg_stat_statements` scan plus a Top-K sort
must complete inside 30s or the collector's own query gets killed — the
collectors below are written to finish in low hundreds of milliseconds on a
909 MB database, but this is the hard ceiling to keep in mind if the catalog
grows.

**Methodology limit, stated plainly:** `pg_roles.rolconfig` reflects only
`ALTER ROLE ... SET` settings. Supabase's connection pooler (Supavisor) or
PostgREST may apply additional session-level GUCs at connect time that never
appear here. So `idle_in_transaction_session_timeout` and `lock_timeout` for
`anon`/`authenticated`/`service_role` beyond what's listed above are
**UNKNOWN**, not "absent" — the brief's "8s idle-in-tx" claim for those roles
could not be confirmed or refuted by this query and needs a session-level
probe (`SHOW idle_in_transaction_session_timeout` from a live pooled
connection) to resolve.

## 3. helm_debug is live — HELD.md and the prune-route header are stale

```sql
select schema_name from information_schema.schemata where schema_name = 'helm_debug';
select table_schema, table_name, table_type from information_schema.tables
where table_schema='helm_debug' order by table_name;
select proname, prosecdef, provolatile from pg_proc where proname = 'helm_debug_prune';
select has_function_privilege('anon','public.helm_debug_prune(integer)','EXECUTE') as anon_exec,
       has_function_privilege('authenticated','public.helm_debug_prune(integer)','EXECUTE') as auth_exec,
       has_function_privilege('service_role','public.helm_debug_prune(integer)','EXECUTE') as svc_exec;
select (select count(*) from helm_debug.trace_runs) as runs,
       (select count(*) from helm_debug.trace_steps) as steps,
       (select min(started_at) from helm_debug.trace_runs) as oldest,
       (select max(started_at) from helm_debug.trace_runs) as newest;
select pg_size_pretty(pg_total_relation_size('helm_debug.trace_runs')) as runs_size,
       pg_size_pretty(pg_total_relation_size('helm_debug.trace_steps')) as steps_size;
```

- `helm_debug` schema **exists in production**, with `trace_runs` and
  `trace_steps` — the two tables from `20260825200811_helm_flight_recorder.sql`.
- `public.helm_debug_prune(integer)` exists, `SECURITY DEFINER`, `VOLATILE`,
  `EXECUTE` granted to `service_role` only (`anon`/`authenticated`: false) —
  matches `20260826010000_helm_debug_retention.sql` exactly.
- 1,386 `trace_runs` / 3,156 `trace_steps` rows, spanning 2026-08-27 through
  2026-09-03 (~1 week). Combined size ~3.8 MB (`1688 kB` + `2104 kB`).
- The `helm-debug-prune` Vercel cron
  (`src/app/api/cron/helm-debug-prune/route.ts`, `vercel.json` schedule
  `30 4 * * *`) has **3 completed runs** in `background_job_logs` over the
  last 3 days (`job_type='helm-debug-prune', status='completed', count=3`) —
  it is not hitting the "migration not applied" degrade branch; it is
  actually pruning.

**Both `supabase/migrations/HELD.md` and this cron route's own header
comment describe `20260825200811`/`20260826010000` as not-yet-applied to
production.** That was true when written and is not true now — production
evidence says both are live and have been for about a week. This PR does not
edit `HELD.md` (shared surface, not owned by this track) but the owner should
correct those two rows; leaving them stale means a future reader trusts a
"not applied" claim that is actively wrong, which is exactly the failure
mode `.claude/rules/shipping.md` §1 warns about.

**Isolation is real, not just documented:**
`has_schema_privilege('service_role','helm_debug','USAGE')` → **false**. Even
`service_role` cannot `SELECT` from `helm_debug.trace_runs` directly — every
access path is mediated by a `SECURITY DEFINER` function (confirmed:
`helm_debug_prune`'s `proconfig` pins `search_path=pg_catalog, helm_debug`,
so it resolves the schema regardless of the caller's own grants). The new
tables this PR proposes follow the identical pattern.

Only one `pg_cron` job exists in production:

```sql
select jobid, schedule, command, active from cron.job order by jobid;
```

→ one row, `10 4 * * *`, pruning `admin_events`/`admin_analytics_events`
directly in SQL. **pg_cron is installed but essentially idle** — this is
the evidence for routing the new collectors through Vercel cron (the
established pattern for `helm-debug-prune`) rather than adding pg_cron jobs.

## 4. Current DB health snapshot (a point, not a baseline)

```sql
select datname, numbackends, xact_commit, xact_rollback, blks_read, blks_hit,
  tup_returned, tup_fetched, deadlocks, temp_files, temp_bytes, stats_reset
from pg_stat_database where datname = current_database();
select state, count(*) from pg_stat_activity group by state order by 2 desc;
select count(*) as lock_waits from pg_locks where not granted;
select pg_size_pretty(pg_database_size(current_database())) as size,
  pg_database_size(current_database()) as bytes;
```

- DB size: **909 MB** (`953068691` bytes).
- Connections: 13 idle + 8 with `state IS NULL` (background/replication
  workers) + 1 active = **22 of 60 max (37%)**.
- Lock waits right now: **0**.
- `pg_stat_database.stats_reset` is **NULL** — never explicitly reset since
  this counter set began accumulating. `xact_commit` = 96,510,594,
  `xact_rollback` = 25,823,895 (cumulative, unknown start). Naive rollback
  rate over that whole unknown window ≈ 21.1%; per brief §23 this is **not**
  a threshold-worthy number without a baseline — it is the reason a
  delta-based sampler is required, not a finding on its own.
- `deadlocks` = 8 (cumulative, unknown window). `temp_files` = 546,833,
  `temp_bytes` ≈ 2.76 TB (cumulative, unknown window — the same caveat
  applies).

These are cumulative Postgres-lifetime counters, consistent with the brief's
own warning (§1, §16): "never treat totals as a rate." They exist here only
to establish what the very first `db_health_samples` row will diff against.

## 5. pg_stat_statements — top cumulative consumers

```sql
select stats_reset from pg_stat_statements_info;
select queryid, calls, total_exec_time, mean_exec_time, rows, query
from pg_stat_statements order by total_exec_time desc limit 15;
```

`stats_reset` = **2026-02-03 22:57:27 UTC** — roughly 7 months of
accumulation, confirming the brief's warning that a raw
`total_exec_time > X` read is meaningless without delta sampling.

Top rows by cumulative `total_exec_time`, classified by query shape (no raw
query text is persisted anywhere in this PR — this table is quoted here only
to justify the design, not stored):

| rank | calls | total ms | mean ms | shape |
| --- | --- | --- | --- | --- |
| 1 | 9,923,889 | 56,423,523 | 5.69 | Realtime WAL-decoding (`wal->>` extraction) |
| 2 | 3,413,559 | 31,826,871 | 9.32 | Realtime WAL-decoding, same family |
| 3 | 28,668 | 18,448,455 | **643.52** | PostgREST product query on `golf_shots` |
| 4 | 853,561 | 14,396,329 | 16.87 | Realtime WAL-decoding, same family |
| 5 | 51,674 | 6,449,976 | 124.82 | PostgREST RPC call |
| 9 | 2,746,902 | 4,825,354 | 1.76 | PostgREST `public.users` id scan |
| 15 | 24,683,099 | 2,435,013 | 0.10 | Realtime publication introspection (`pg_publication`) |

Realtime/logical-replication and its own catalog introspection dominate
cumulative execution time and call volume, exactly as brief §1 asserted —
now with figures instead of a qualitative claim. One PostgREST product query
(`golf_shots`, rank 3) stands out at a 643ms mean over 28,668 calls
(18.4M ms total) — a real candidate for the query-regression baseline once
the delta sampler has enough windows, not a finding to act on from one
cumulative row. This is the direct evidence for brief §16's workload split
(HELM PRODUCT WORKLOAD / SUPABASE INTERNAL-REALTIME / PG_NET-JOB /
OBSERVABILITY / UNKNOWN) — sections 1 and 15 above are exactly the two
classes seen concretely.

## 6. Collector cost — self-measurement

`max_connections` = 60, 22 already in use (§4). Each of this PR's two new
Vercel-cron collectors (`db-health-sampler` every 5 minutes,
`db-stat-delta` every 15 minutes) opens one short-lived `service_role`
connection, runs one bounded read query, writes one row, and closes. Neither
holds a connection open. At the 5-minute cadence that is at most one
transient extra connection at a time — under 2% of the 60-connection budget
even in the worst case of overlap with a slow existing job. Both collectors'
own runtime and row counts are recorded in `background_job_logs` (the
existing `recordJobRun` path), so this is self-verifying going forward
rather than a one-time claim.

## 7. What this phase does and does not cover

Implements brief §5–9, §15–17, §24, §25, §27, §33, §35: the canonical
Supabase error envelope, the SQLSTATE/PostgREST classifier, the out-of-band
`db_error_events` store, the health sampler, the `pg_stat_statements` delta
engine and regression detector, HTTP-200-with-error-payload integrity
handling, Flight Recorder read integration, the suggested collector
schedule, Sentry+Supabase fingerprint dedup, and the Bridge database views.

Explicitly **NOT** built in this phase (later phases per brief §78):
Auth/Storage/Realtime/Edge Function classification (§10–13), W3C trace
propagation certification (§14), locks/blocking incident table (§18),
connection-saturation alerting (§19), Supabase Metrics API integration
(§20–22), Advisor integration (§30), on-demand log evidence (§32),
error-rate/retry/timeout metric families beyond `helm.db.failure` (§36–39),
Trace Explorer extension and replay fixtures (§56–61), alert policy/paging
(§49–55). These stay NOT VERIFIED in this PR's acceptance section, not
silently absent.

## 8. Incremental recurring cost

**$0.** No log drain, no new vendor, no paid Sentry feature. New Vercel cron
schedules use the existing Pro-tier cron capability this project already
exercises at `*/30 * * * *` (`coachhelm-safety-net`,
`ingest-gmail-replies`) and `0 */3 * * *` (`reliability-triage`) — adding
`*/5` and `*/15` schedules does not cross a plan-tier boundary the project
hasn't already crossed. Function invocation count increases modestly (two
more scheduled routes); no new compute product, no new storage product,
bounded row growth in `helm_debug` (retention functions included in the
HELD migrations).
