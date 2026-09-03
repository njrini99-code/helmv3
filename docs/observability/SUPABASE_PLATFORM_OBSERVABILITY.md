<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Supabase platform observability — Phase 2 Track C

Metrics API, Advisors, on-demand log evidence, the alert policy, and the
`db-observability` repo-doctor keys — everything Phase 2 Track C added on
top of Phase 1's error store / health sampler / query-delta engine (see
`docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md`). Built against
`docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md`
§20, §22, §30-32, §49-55, §62.

No `SUPABASE_ACCESS_TOKEN` or `SUPABASE_SERVICE_ROLE_KEY` was available in
the worktree this was built in (`.env.local` is deliberately withheld from
worktrees — see `AGENTS.md`). Every credential-gated claim below is marked
**NOT VERIFIED** rather than assumed.

## 1. Metrics API

**Endpoint** (verified against
<https://supabase.com/docs/guides/telemetry/metrics.md>, fetched 2026-09-03):
`https://<project-ref>.supabase.co/customer/v1/privileged/metrics`.

**Auth** (same page): HTTP Basic, username `service_role`, password "a Secret
API key". This integration reuses the existing `SUPABASE_SERVICE_ROLE_KEY`
env var for that password rather than introducing a second secret — every
other server-only Supabase caller in this repo already holds it
(`src/lib/supabase/admin.ts`). If the owner later issues a dedicated
`sb_secret_...` key, that is a value change on the same env var.

**Cadence**: the docs say "scrape once per minute"; this integration caches
60s per brief §20 and is called from the existing 5-minute
`db-health-sampler` cron (no new schedule).

**Allow-list — DOCS-DERIVED, NOT LIVE-VERIFIED.** `scripts/db-observability-metrics-names.mjs`
is the read-only discovery script that fetches the live endpoint and prints
only metric names + label keys (never values, never the credential) — it
could not be run here (no credential). The allow-list in
`src/lib/observability/supabase/metrics-api.ts`
(`PLATFORM_METRIC_ALLOW_LIST`) is instead sourced from
<https://raw.githubusercontent.com/supabase/supabase-grafana/main/metrics.md>
(fetched 2026-09-03) — a community reference project the official Metrics
API docs page itself points to for "dashboard JSON and alert examples", not
Supabase's own primary documentation (which names categories, "~200 Postgres
performance and health series", without enumerating exact metric names).
Run the discovery script once a credential is available and correct the
allow-list against its real output.

**Model** (`PlatformHealthModel`): every field is independently
`number | null` (`dbUp` is `0 | 1 | null`, never `boolean` — a boolean would
collapse "the metric was absent" into `false`, manufacturing an outage out of
a blind read). Two fields are structurally always `null` in this phase and
say so in the type's own doc comments: `ioPressure` (no verified I/O-pressure
metric name) and `autovacuumOrBloatSignal` (not exposed by the metrics
scrape at all — the table-health hourly collector, brief §29, is the
intended source and is not part of this phase). `authPool` is also always a
null-filled reading — GoTrue exposes only a user-count metric in this
allow-list, not a pool gauge.

**CPU%** is delta-based, not a raw counter read (`computeCpuPct`,
`metrics-api.ts`) — `node_cpu_seconds_total` is cumulative, so a single
scrape cannot yield a percentage; the module keeps the previous scrape's
busy-seconds sum in a 60s-lifetime in-memory cache (reset on cold start,
which just means the first post-cold-start scrape returns `null` for
`cpuPct` until a second scrape lands) and computes a rate. Clamped to
`[0, 100]`.

## 2. Advisors

**Endpoint** (verified against
<https://supabase.com/docs/reference/api/v1-get-security-advisors>, fetched
2026-09-03 — a documented endpoint exists, so this does not fall back to the
splinter-SQL alternative the task brief allowed for):

```text
GET /v1/projects/{ref}/advisors/security
GET /v1/projects/{ref}/advisors/performance
```

Bearer `SUPABASE_ACCESS_TOKEN` (OAuth scope `database:read`). Response shape
`{ lints: [...] }`; each lint carries `name`/`title`, `level`, `metadata`
(`schema`/`name`/`entity`/`type` — object identifiers, never row data). That
docs page marks the endpoint **"deprecated and experimental, subject to
future changes"** — recorded here, not smoothed over.

**Normalization**: `{ advisorType, name, level, object, featureMapping,
firstSeen, status: 'open' }`, deduped within a run by
`(advisorType, name, object)`. `featureMapping` is **always `null` in this
phase** — see `src/lib/observability/supabase/advisors.ts`'s header for why
(the registry's `code.db` field holds migration-file globs, not table names;
`yaml` is a devDependency only, so importing it into a Bridge server module
risks a production runtime failure this phase chose not to take).

**No persistence table this phase.** Findings are re-fetched and
re-normalized on every call, behind a 10-minute in-memory cache. A later
phase can add `helm_debug.db_advisor_findings` if historical trend matters;
brief §78's phase list does not name it for Phase 2.

## 3. On-demand log evidence

Brief §32: **no continuous ingestion, ever.** Gated by
`HELM_SUPABASE_LOG_EVIDENCE_ENABLED` (default unset/false ->
`UNKNOWN_MANUAL` before any network call). When enabled: one bounded query
per invocation against `GET /v1/projects/{ref}/analytics/endpoints/logs`
(verified against
<https://supabase.com/docs/reference/api/v1-get-project-logs>, fetched
2026-09-03 — `sql`/`iso_timestamp_start`/`iso_timestamp_end` params, Bearer
`SUPABASE_ACCESS_TOKEN`, documented 24h max window, documented `402` status).
This integration never asks for more than **±5 minutes** around a center
timestamp (10 minutes total), well inside that ceiling.

**`402` is a hard stop**, surfaced as `"OWNER ACTION REQUIRED — COST"` —
never retried, never silently swallowed.

**Source-table mapping is best-effort, not live-verified**: the Logs guide
names `auth_logs`/`edge_logs`/`function_edge_logs`/`function_logs`/
`postgres_logs`/`realtime_logs`/`storage_logs`; there is no dedicated
`postgrest_logs` source, so `postgrest` maps to `edge_logs` (matching
`docs/observability/SENTRY_SUPABASE_TRACING.md`'s "API Gateway logs
(PostgREST, Auth, Storage, Realtime)" grouping). `pg_cron`/`pg_net` map to
`postgres_logs` — both run inside Postgres, with no separate source.
`resolveLogSource` (`log-evidence.ts`) is exported and unit-tested
specifically so this mapping is cheap to correct once someone runs a real
query against a live project.

**Every line is sanitized** via `sanitizeSupabaseFreeText` (the exact
redaction `db_error_events` uses) before it leaves the module; the raw API
response is discarded once the bounded (`<= 40` line) timeline is built.

**UI**: "Fetch Supabase evidence" form on `/admin/database` — service
select, trace id, minutes — behind `requireSuperAdmin()`
(`src/app/admin/database/{log-evidence-actions.ts,LogEvidenceForm.tsx}`).

## 4. Alert policy

`src/lib/observability/supabase/alert-policy.ts` (pure) declares 21 rules —
7 P0, 6 P1, 5 P2, 4 TELEMETRY_DEFECT — verbatim from brief §49:

| Severity | Rules |
| --- | --- |
| P0 | db_unavailable, pool_exhaustion, critical_journey_data_loss, cross_tenant_rls_defect, systematic_round_persistence_failure, schema_mismatch, mass_auth_5xx |
| P1 | sustained_critical_rpc_timeout_rate, user_affecting_deadlock, realtime_critical_delivery_collapse, repeated_storage_database_timeout, missed_user_visible_cron, sustained_resource_saturation |
| P2 | performance_regression_no_failure, elevated_retries, bloat_vacuum, call_amplification, noncritical_webhook_failures |
| TELEMETRY_DEFECT | sampler_stopped, metrics_api_unreadable, sentry_blind, flight_recorder_absent |

`evaluateAlertPolicy` always returns one row per rule — a rule with no
supplied signal reads `unknown`, never `clear`. `src/lib/admin/database/alerts.ts`
composes the overview/errors/performance/platform readers (exactly the four
Track C was scoped to) into signals; its own header is the authoritative
per-rule data-source map. As of this phase, **10 of 21 rules are derivable**
from those four readers; the other 11 have no Bridge-level data source yet
(Auth/Storage/Realtime/webhook/RLS/integrity/Sentry/Flight-Recorder
classification are later-phase work per
`docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md` §7) and report
`unknown` by construction — never a fabricated `clear`.

`classifyWorkload`/`computeWorkloadBudget` reuse Phase 1's EXACT
`source_class` vocabulary from `20260903180200_helm_debug_db_stat_deltas.sql`
(`helm_product`, `supabase_realtime`, `pg_net_job`, `pg_cron_job`,
`observability`, `unknown`) — not the brief's looser prose gloss
("product / realtime_logical_replication / pg_net / observability /
maintenance / unknown"), per this track's own instruction to avoid a second
vocabulary.

`detectRetryStorm` implements the brief's four named shapes
(`postgrest_client_retry` x10, `realtime_reconnect_loop` x5,
`auth_getuser_storm` x20, `pg_net_unbounded_retry` x10) as a pure function
over `{ fingerprint, mechanism, attempt, occurrenceCount, timeBucket }` rows.
`alerts.ts`'s `elevated_retries` signal feeds it from PGRST003 error groups,
with a documented caveat: Phase 1's `errors.ts` sums `occurrenceCount`
across the WHOLE lookback window per fingerprint, not one hour bucket, so
this is coarser than `detectRetryStorm`'s own per-bucket design intends.

## 5. PGAudit stance

Unchanged from brief §31 and the Phase 1 measured-truth snapshot: **OFF by
default, never globally enabled.** `PGAUDIT_OFF` (the doctor key, §6 below)
is a live-only check: `select extname from pg_extension where extname =
'pgaudit'` — PASS if absent; if present, `select setting from pg_settings
where name = 'pgaudit.log'` — PASS if `'none'` (installed but inactive),
FAIL if anything else (**"ON is a finding"**, verbatim from the brief).
Without a credential this reports `LOCAL_ONLY`, never a stale "off" claim
carried forward from the 2026-09-03 measured-truth snapshot.

## 6. Doctor keys (`scripts/repo-doctor/checks/db-observability.mjs`)

| Key | Kind | Missing-credential state |
| --- | --- | --- |
| DB_ERROR_STORE_PRESENT | static | n/a |
| DB_HEALTH_SAMPLER_PRESENT | static | n/a |
| DB_STATEMENT_SAMPLER_PRESENT | static | n/a |
| PG_STAT_STATEMENTS_AVAILABLE | live | `LOCAL_ONLY` |
| PG_CRON_AVAILABLE | live | `LOCAL_ONLY` |
| METRICS_API_CONFIGURED_OR_INTENTIONALLY_DISABLED | static | PASS (intentional disable is the passing state) |
| SENTRY_SUPABASE_TRACING_PRESENT | static | n/a |
| TRACEPARENT_CERTIFIED | static (spawns the cert script) | n/a |
| FLIGHT_RECORDER_DB_LAYER_PRESENT | static | n/a |
| OBSERVABILITY_RETENTION_PRESENT | static | n/a |
| OBSERVABILITY_FAIL_OPEN_TEST_PRESENT | static | n/a |
| DB_ERROR_CLASSIFIER_PRESENT | static | n/a |
| INVARIANT_REGISTRY_PRESENT | static | n/a |
| PGAUDIT_OFF | live | `LOCAL_ONLY` |

**Why `LOCAL_ONLY`, not `UNKNOWN`, for a missing optional credential**:
`scripts/repo-doctor/result.mjs`'s `summarize()` exits 1 on any
FAIL/DRIFT/STALE and exits **3** on `UNKNOWN` with no hard failure. Every
contributor and every CI run lacks `SUPABASE_ACCESS_TOKEN` by default — if a
missing OPTIONAL credential mapped to `UNKNOWN`, `npm run repo:doctor` would
exit 3 for everyone, forever, which is a worse regression than the thing
this module checks for. `LOCAL_ONLY` (defined in `result.mjs`, previously
unused anywhere in the codebase — this module is its first consumer) is
informational and affects no exit code. `UNKNOWN` is reserved for "a live
read was attempted and failed" — a real, distinct signal from "never
attempted, no credential".

`db-platform-samples-retention-gap` is a thirteenth, separately-named
`WARN`-level check (not one of the 14 keys the brief listed) surfacing the
gap in §8 below — a documented, deliberate omission, not a silent one.

## 7. Grafana — NOT ENABLED

Per brief §21: optional, owner-decision only, and **nothing was built**.
Bridge remains the control plane. If the owner later wants a free-tier
Grafana Cloud dashboard against this project's Metrics API endpoint, the
official Supabase Grafana project (referenced in §1 above for its metric
name documentation) is the expert reference — this repo adds no dependency
on it and no code path assumes it exists.

## 8. Known, named gaps (not silent omissions)

- **`db_platform_samples` has no retention/prune function wired.** Folding it
  into `helm_debug_prune_observability`
  (`20260903180300_helm_debug_observability_retention.sql`) would edit a
  migration another track already shipped; this migration
  (`20260903190400_helm_debug_db_platform_samples.sql`) is purely additive
  on purpose. At the 5-minute cadence this grows ~8,640 rows/month, the same
  order as `db_health_samples`, which the existing retention budget already
  accounts for in aggregate. Surfaced as a `WARN` in `repo:doctor` (§6).
- **`'database'` was added to `IncidentSourceName`** (`src/lib/admin/incidents/types.ts`)
  but is **not wired into `fetchIncidentBoard`** (`src/lib/admin/incidents/fetch.ts`,
  the Bridge track's file). Consequence: `canClaimAllClear` can no longer
  return `true` for any board built from a fixed readings array, because the
  new source has no reading supplied there and reports `unknown` by
  `buildSourceFreshness`'s own fallback. `src/lib/admin/incidents/db-observability-source.ts`'s
  header gives the exact one-line fix for whoever picks up that wiring.
- **11 of 21 alert-policy rules are `unknown` by construction** — no
  Bridge-level data source exists for Auth/Storage/Realtime/webhook/RLS/
  integrity/Sentry/Flight-Recorder classification yet (§4 above).
- **Advisor `featureMapping` is always `null`** — see §2.
- **`ioPressure` and `autovacuumOrBloatSignal` are always `null`** — see §1.

## 9. Cost statement

Every item in this document is **$0 or explicitly OWNER ACTION REQUIRED —
COST**:

- Metrics API: read-only GET, existing plan tier, no new product.
- Advisors: read-only GET, existing plan tier, no new product.
- Log evidence: disabled by default; when enabled, a bounded on-demand query
  against the existing Logs product, well inside the documented free query
  allowance (1,000 GB query included per the rolling-out Logs metering — see
  `docs/observability/SENTRY_SUPABASE_TRACING.md` §7); a `402` response is
  treated as a hard stop, not absorbed.
- `db_platform_samples`: reuses the existing 5-minute `db-health-sampler`
  Vercel cron invocation — no new schedule, no new compute product.
- Grafana: not built.
- Nothing here enables a log drain, a paid Sentry feature, or a second APM.

**INCREMENTAL RECURRING OBSERVABILITY COST: $0**, contingent on the owner
never enabling `HELM_SUPABASE_LOG_EVIDENCE_ENABLED` in a way that crosses the
Logs query allowance, and never turning on the optional Grafana integration
this document explicitly did not build.
