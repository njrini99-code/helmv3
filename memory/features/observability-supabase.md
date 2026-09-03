<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Feature: Supabase Database Observability

## Status

- active (platform infrastructure, not a product feature — same reasoning
  `memory/features/observability-sentry.md` states for the Sentry-side
  layer: this module IS the observability layer for Postgres/Supabase, so
  it carries no `admin_events.feature` keys of its own)

## Current State

Zero-incremental-cost database and Supabase observability, built in two
phases on branch history that predates this doc — see
`memory/ledgers/changes/observability_supabase.md` for the commit-level
record and `docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md`
for the full design brief this implements against.

### Phase 1 (already shipped on this branch before this doc existed)

Canonical Supabase error envelope + SQLSTATE/PostgREST classifier
(`src/lib/observability/supabase/{envelope,classify}.ts`), the out-of-band
fail-open error recorder (`record-db-error.ts`), the 5-minute database
health sampler and 15-minute `pg_stat_statements` delta engine
(`db-health-delta.ts`, `query-regression.ts`, the `db-health-sampler`/
`db-stat-delta` Vercel crons), HTTP-200-with-error-payload integrity
checking (`integrity.ts`), and the first three Bridge database views
(Mission Control, Database Errors, Query Performance —
`src/app/admin/database/page.tsx`). Four HELD migrations
(`20260903180000`-`20260903180300`) hold the `helm_debug` tables and
definer-rights facades this reads from. See
`docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md` for the
production re-measurement this phase was built against and §7 of that doc
for its own explicit not-built list.

### Phase 2 Track C (this doc's primary subject)

Added on top of Phase 1, at $0 incremental recurring cost — full detail in
`docs/observability/SUPABASE_PLATFORM_OBSERVABILITY.md`:

- **Metrics API** (`metrics-api.ts` + `src/lib/admin/database/platform.ts`):
  server-only fetch of the Prometheus-compatible platform endpoint, 60s
  cache, delta-based CPU%, every field independently nullable. Allow-list
  is docs-derived, not live-verified (no credential available when built) —
  `scripts/db-observability-metrics-names.mjs` corrects it once one is.
- **Advisors** (`advisors.ts` + `src/lib/admin/database/advisors.ts`):
  Security/Performance Advisor findings via the documented Management API
  endpoint, 10-minute cache, deduped by (advisorType, name, object). No
  persistence table this phase; `featureMapping` always `null` (documented
  why in the module).
- **On-demand log evidence** (`log-evidence.ts` +
  `src/app/admin/database/{log-evidence-actions.ts,LogEvidenceForm.tsx}`):
  disabled by default (`HELM_SUPABASE_LOG_EVIDENCE_ENABLED`), one bounded
  ±5-minute query per invocation when enabled, every line sanitized, raw
  payload discarded, `402` treated as a hard cost stop. Never scheduled.
- **Platform CPU/memory/up rules** (`platform-rules.ts`, pure): db-down
  immediate CRITICAL, CPU/memory sustained->high over >= 2 consecutive
  samples, staleness (> 15m) reported as UNKNOWN rather than healthy.
- **Alert policy** (`alert-policy.ts`, pure, + `src/lib/admin/database/alerts.ts`):
  21 declarative rules (7 P0 / 6 P1 / 5 P2 / 4 TELEMETRY_DEFECT). 10 of 21
  are derivable from the composed overview/errors/performance/platform
  readers today; the other 11 report `unknown` — no Bridge-level data
  source exists yet for Auth/Storage/Realtime/webhook/RLS/integrity/
  Sentry/Flight-Recorder classification (later-phase work). Also:
  `detectRetryStorm` (four named storm shapes) and `classifyWorkload`/
  `computeWorkloadBudget` (reusing Phase 1's EXACT `source_class`
  vocabulary — `helm_product`/`supabase_realtime`/`pg_net_job`/
  `pg_cron_job`/`observability`/`unknown` — never a second vocabulary).
- **`db_platform_samples`** (HELD migration `20260903190400`): one row per
  `db-health-sampler` tick (extended, not a new cron), fail-open. Retention
  is a NAMED, undocumented-until-now gap — not wired into the shared
  `helm_debug_prune_observability` migration, surfaced as a `WARN` in
  `repo:doctor`.
- **`db-observability` repo-doctor module**
  (`scripts/repo-doctor/checks/db-observability.mjs`, 14 keys): static
  presence checks plus three live-only checks
  (`PG_STAT_STATEMENTS_AVAILABLE`, `PG_CRON_AVAILABLE`, `PGAUDIT_OFF`) that
  report `Status.LOCAL_ONLY` — never `UNKNOWN` — without
  `SUPABASE_ACCESS_TOKEN`, so a missing optional owner credential never
  flips `repo:doctor`'s exit code for every other contributor.
- **W3C trace-propagation certification**
  (`scripts/db-observability-trace-cert.mjs`): 5 static checks, PASS 5/5 as
  of 2026-09-03. The live proof (a real Sentry trace id matched to a real
  Supabase log line) is a separate, manual, on-demand procedure documented
  in `docs/observability/SUPABASE_TRACE_PROPAGATION.md` and currently
  **NOT VERIFIED**.
- **Incident-model adapter**
  (`src/lib/admin/incidents/db-observability-source.ts`): reshapes
  `fetchDatabaseMissionControl()`'s reading into the `SourceReading` shape
  `src/lib/admin/incidents/sources.ts` consumes. `'database'` was added to
  `IncidentSourceName` (`types.ts`) — **NOT wired into `fetchIncidentBoard`
  (`fetch.ts`) yet**, which is a cross-track file this program deliberately
  did not touch. Until that wiring lands, any incident board built from a
  fixed `readings` array reports `'database'` as `health: 'unknown'` by
  `buildSourceFreshness`'s own fallback, which means `canClaimAllClear` can
  no longer return `true` — a documented, intentional consequence, not a
  regression nobody noticed.

### Explicitly NOT built (Track C's own scope, stated plainly)

- Grafana (brief §21) — owner-optional, nothing built.
- PGAudit remains OFF by default; no code path enables it.
- Auth/Storage/Realtime/Edge Function failure classification (brief §10-13)
  — still Phase 1's own "later phase" note.
- Advisor findings persistence, `elevated_retries`'s underlying
  `attempt`-tracked event store (it currently approximates from
  `db_error_events`' whole-lookback-window occurrence counts — a stated,
  coarser-than-intended caveat).

## Known traps for future edits

- The Metrics API allow-list can silently drift further from reality if the
  discovery script is never run — every consumer of `PlatformHealthModel`
  must keep treating each field as possibly `null`, always.
- Do not add a new `IncidentSourceName` without checking every place that
  builds a fixed `readings`/`sourceHealth` array — see this doc's own
  "database" entry above for what happens when one is added without full
  wiring.
- `classifyWorkload`'s six-value union IS the `source_class` CHECK
  constraint in `20260903180200_helm_debug_db_stat_deltas.sql`. If that
  constraint's allowed values ever change, this file's union must change
  with it in the same PR — a second, drifted vocabulary is exactly what
  the brief instructed this phase to avoid.
