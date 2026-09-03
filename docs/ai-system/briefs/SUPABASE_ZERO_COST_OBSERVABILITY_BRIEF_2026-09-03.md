<!-- markdownlint-disable MD013 MD022 MD032 MD040 -->
# HELM — Zero-cost maximum Supabase observability & error tracking (master brief)

Owner-authored master design + implementation brief, researched 2026-09-03, transcribed
verbatim in substance from the owner's message so a parallel session can execute it.
Companion: `docs/ai-system/HANDOFF_BRIDGE_CONTROL_PLANE_2026-09-03.md` (ownership split,
credentials, sequencing). Hard budget constraint: **$0 incremental recurring observability
cost. NO LOG DRAINS.**

## 0. Mission

Build the strongest practical zero-incremental-cost database and Supabase
observability/error-tracking system by extending the systems Helm already has. The target
is not "more logs". The target: when any important Helm workflow fails, silently loses
data, slows down, deadlocks, times out, loses authorization, loses a Realtime
subscription, fails an Auth/Storage/Edge operation, or becomes blind to its own
telemetry, Helm Bridge tells us WHAT failed, WHERE, WHICH database/service code explains
it, WHICH release was running, WHICH trace/journey it belonged to, whether durable state
actually committed, whether the problem is isolated or systemic, and what evidence to
inspect next.

Do this WITHOUT: Supabase Log Drains, Datadog, Better Stack, Axiom, paid Grafana, paid log
ingestion, duplicating Supabase logs into Postgres, storing raw request bodies, storing
raw SQL parameter values, storing JWTs/cookies/secrets, adding another incident system
beside Helm Bridge, adding another trace system beside Flight Recorder/Sentry. Use the
infrastructure already paid for and the free/native signals from Postgres, Supabase,
Sentry, GitHub, Vercel and Helm.

## 1. Current measured truth — re-measure before implementation

Measured against production 2026-09-03 (a starting point, not eternal truth):

- PostgreSQL 17.x; `pg_stat_statements`, `pg_cron`, `pg_net`, Vault installed; `pgaudit`
  NOT enabled; `track_io_timing` OFF; `compute_query_id = auto`. Do not enable an
  extension just because this brief mentions it.
- Role timeouts: anon/authenticated/authenticator statement 8s / lock 8s /
  idle-in-tx 8s; service_role statement 2m / lock 15s / idle-in-tx 8s; postgres 10m /
  idle-in-tx 1m. Context for timeout alerts; do not silently change them.
- DB ~1.6 GB, `max_connections` 200, ~22 connections at the instant, no lock waits. A
  snapshot, not a baseline; learn baselines from history.
- `pg_stat_statements`: Realtime/logical replication was a very large share of cumulative
  execution work; `pg_net` worker activity high; `save_partial_round_atomic` had hundreds
  of calls with max near the 8s authenticated boundary; `submit_round_atomic` materially
  faster. Counters are CUMULATIVE since reset — never treat totals as a rate; build
  delta-based sampling.
- Do NOT rebuild: centralized Sentry setup, release/environment tagging, browser/server
  tracing, Supabase client tracing, W3C trace propagation, Helm Flight Recorder,
  `helm_debug.trace_runs/trace_steps`, HELM_TRACE Postgres checkpoints, Bridge /
  UnifiedIncident, server error logger / Bridge event pathway, Supabase error audit
  scripts, DB drift / types drift / migration ledger checks, triage tooling,
  feature/incident memory. Extend the modern supabase-js + Sentry architecture; no old
  community integration, no parallel client wrapper.

## 2. Critical finding: DB success checkpoints exist, rollback evidence is different

Helm's Postgres Flight Recorder emits structured checkpoints (`DB RPC -> enter ->
update_round -> replace_snapshot -> insert_holes -> insert_shots -> commit`) carrying the
Helm trace id, persisted to `helm_debug.trace_steps` (migration 20260902160000, applied
2026-09-03). A transaction that throws rolls back its own writes, including any
failure-row insert. RAISE LOG survives but must NOT be solved with a log drain.

Design answer for application-called RPC/database failures: (1) the DB raises the real
error; (2) the client returns it; (3) Helm captures it in Sentry with the active trace;
(4) Helm's server error path performs a SEPARATE, fail-open, service-role-only
observability write AFTER the failed request returned; (5) that second transaction writes
a compact sanitized `db_error_event` linked to the same Helm trace/release/feature;
(6) Bridge correlates Sentry issue + DB error event + Flight Recorder trace into ONE
UnifiedIncident. Do not pretend this captures a crash that never reaches the app;
health/cron/log evidence covers that.

## 3. Target architecture

User action -> Next/Helm app (Sentry business trace with release, environment,
feature/action, replay/profile) -> Supabase client (W3C trace context) -> Supabase gateway
(Auth, PostgREST, Storage, Realtime, Edge) -> Postgres (`pg_stat_activity`, `pg_locks`,
`pg_stat_database`, `pg_stat_statements`, `pg_stat_user_tables`, WAL/checkpointer/io where
supported, `cron.job_run_details`, HELM_TRACE checkpoints) -> small private Helm rollups
(`db_error_events`, `db_health_samples`, `db_statement_samples`, lock incidents,
invariant results, telemetry freshness) -> Helm Bridge (UnifiedIncident, Database Mission
Control, DB Errors, Query Performance, Locks/Transactions, Jobs/pg_net,
Integrity/Invariants, Telemetry Health, Sentry/Flight Recorder links) -> owner / Claude
RCA. Sentry = application/error/trace evidence. Supabase/Postgres = database/service
truth. Flight Recorder = deterministic workflow evidence. Bridge = correlation and
decision. No system impersonates another.

## 4. Zero-cost constraints (hard)

Forbidden by default: Supabase Log Drain; continuous Management API log scraping; copying
API/Postgres/Auth/Storage/Realtime logs into a Helm table; 100% raw query-body capture;
raw PostgREST URL query strings in telemetry; raw SQL text in long-retention tables;
global PGAudit; per-query observability INSERTs for ordinary SELECTs; automatic
`pg_stat_statements_reset()`; a second paid APM. Allowed: existing Sentry; native
Postgres stats; native Supabase Metrics API; small bounded internal aggregate tables;
small error-event tables; pg_cron collectors; existing pg_net; existing Flight Recorder
and Bridge tables; existing Vercel routes; on-demand manual Supabase log investigation;
optional Grafana Cloud FREE tier only at $0 and only if the owner wants it. Bridge is the
primary UI.

## 5. Canonical Supabase error envelope

ONE normalized server-side type/helper for Supabase failures (no per-sport schemas).
Conceptual shape: `occurredAt`, `source: 'supabase'`, `service` (postgrest | postgres |
auth | storage | realtime | edge_function | pg_cron | pg_net), `environment`,
`releaseSha`, `runtime` (browser | node | edge | postgres), `sport`, `feature`, `action`,
`journey`, `operation` (select | insert | update | delete | upsert | rpc | auth | upload |
download | subscribe | invoke | job), `relation`, `rpc`, `functionName`, `bucketClass`,
`code`, `sqlstate`, `postgrestCode`, `authCode`, `storageCode`, `httpStatus`,
`retryability` (yes | no | conditional | unknown), `expectedness` (expected |
routine_recovery | unexpected | unknown), `severity` (info | warning | error | critical),
`fingerprint`, `normalizedMessage`, `safeDetails`, `safeHint`, `sentryTraceId`,
`sentrySpanId`, `helmTraceId`, `durationMs`, `attempt`, `terminal`. Fit into current Helm
conventions; do not duplicate Bridge types.

## 6. Privacy / cardinality contract

Never persist by default: JWT, refresh/access token, Authorization header, cookies,
service role key, API key, password, OAuth code, magic-link code, raw prompt/response,
raw request body, arbitrary Supabase filter values, user-identifying Storage object
paths, full URL query strings, player/coach names, emails, message contents, recruiting
notes, medical/readiness content. UUIDs need discipline: a trace may reference one
deliberately selected internal entity id to diagnose one workflow, but user/team/round
UUIDs are never metric dimensions. Safe dimensions: `feature=round_tracking
operation=rpc rpc=save_partial_round_atomic code=42501 result=permission_denied
runtime=node`. Synthetic sentinel tests must prove secrets and PII are removed.

## 7. App-observed PostgREST / PostgreSQL failure capture

Audit every meaningful Supabase call path (`{ data, error }`, `if (error)`, `.catch(`,
`PostgrestError`, `supabase.from(`, `supabase.rpc(`). Classify each: EXPECTED CONTROL FLOW,
ROUTINE RECOVERY, ACTIONABLE WARNING, ACTIONABLE ERROR, CRITICAL ERROR. Do not send every
permission denial, duplicate key, wrong password or missing row to Sentry as a
high-priority issue. For actionable server-side DB failures: existing server error
pipeline + Sentry, then a best-effort OUT-OF-BAND write with the admin client after the
original request ended (`recordDbErrorOutOfBand`): separate request/transaction,
service-role-only facade, short timeout, no retry storm, recording failure swallowed,
business error returned exactly as before; never blocks a user action for seconds.

## 8. Private database error event store

Extend `helm_debug` (unless authority names another private schema). Logical table
`helm_debug.db_error_events`: id, created_at, source, service, environment, release_sha,
runtime, sport, feature, action, journey, operation, relation_name, rpc_name,
function_name, error_code, sqlstate, http_status, severity, expectedness, retryability,
terminal, fingerprint, normalized_message, safe_details, safe_hint, helm_trace_id,
sentry_trace_id, occurrence_count, first_seen_at, last_seen_at, safe_metadata jsonb. No
raw payloads. Dedupe: per-occurrence rows only for low-volume critical events; otherwise
fingerprint/time-bucket upserts with count + first/last seen. Hybrid: P0/P1 data-integrity
or security failures individual + incident link; repetitive network/provider/permission
families aggregated over small buckets. Fingerprint deterministic and explainable, e.g.
`supabase|postgrest|round_tracking|rpc|save_partial_round_atomic|42501`; never solely on
the message.

## 9. SQLSTATE / PostgREST classification

Codes are primary semantics; message matching is fallback. Centralized table/function.
Always investigate in normal product paths: `08*` connection failures; `PGRST000/001/002/
003` (DB connection, internal connection, schema-cache, pool wait timeout); `53*`
insufficient resources, `53400`; `40P01` deadlock; `40001` serialization failure after
retry budget; `57014` statement canceled/timeout; `42P01` table missing; `42703` column
missing; `42883` function missing; `42P17` infinite recursion; `XX*` internal; `F0*`
config; `42501` when the product path should be authorized. Context-sensitive: `23505`,
`23503`, `23514`, `22*`, `P0001`, `42501` for an unauthorized caller. A `23505` from an
idempotent create can be normal; inside a supposedly unique durable round creation it may
be a race. Release/schema drift detector: `42P01/42703/42883/PGRST20x` correlate
immediately with the Vercel release SHA, migration ledger, production migration head,
generated DB types and recent migration PRs.

## 10. Auth observability

Stable Supabase Auth error codes, not text. Capture operation, code, HTTP status, runtime,
feature/action, retryability, terminal outcome, latency. Expected/low: invalid
credentials, expired one-time code, disabled optional provider the UI handles.
Actionable: 429 spikes, Auth 5xx, bad OAuth callback/state from app code, refresh/session
failures spiking after a release, users appearing logged out because a transient Auth
outage was misclassified as sign-out, DB-trigger failure causing Auth 500. Track rates,
not identities. Bridge: Auth success rate, 429 rate, 5xx rate, session refresh failures,
codes by family. No email/password/auth payloads.

## 11. Storage observability

Normalize modern Storage codes: NoSuchBucket, NoSuchKey, InvalidJWT, InternalError,
DatabaseTimeout, DatabaseError, AccessDenied, ResourceLocked, EntityTooLarge,
ResourceAlreadyExists. Classification depends on action (absent avatar 404 expected;
required team document missing warning/error; DatabaseTimeout infrastructure incident;
AccessDenied on the user's own path likely RLS/auth defect; ResourceAlreadyExists on
idempotent upsert routine). Never store a full private object key unless necessary; use
`bucket=golf-media object_class=player_avatar operation=upload`.

## 12. Realtime observability

`.subscribe()` is not proof. Instrument the channel status callback: SUBSCRIBED,
CHANNEL_ERROR, CLOSED, TIMED_OUT. Capture channel logical name, feature, subscription
type, connect latency, reconnect count, terminal state, last successful message
timestamp where meaningful; no unique user/channel ids as dimensions. Distinguish
connection failure (TIMED_OUT/CHANNEL_ERROR/CLOSED) from silent delivery failure
(SUBSCRIBED but an expected product signal never arrives); the product outcome/invariant
layer detects the second. Bridge shows "Realtime transport degraded" vs "connected but
product propagation failed".

## 13. Supabase Edge Function observability

Inventory every Edge Function. Use the CURRENT official Sentry Deno integration. Capture
function name, release/version, outcome, HTTP status, latency, Supabase trace context,
Sentry trace, dependency spans, sanitized exception. CORS must permit the trace headers
the current Supabase/Sentry tracing needs. No secrets or raw bodies. Child spans for
critical downstream services.

## 14. W3C trace propagation certification

Verify end to end: Supabase tracing runtime imported, tracePropagation enabled, Sentry
`propagateTraceparent`, browser `tracePropagationTargets` includes Helm's Supabase host,
Edge Function CORS includes trace headers. Prove with a controlled preview request that the
Sentry trace id equals the trace_id on the corresponding Supabase request/log evidence
(one-time manual log inspection or the connected agent tooling; no continuous ingestion).

## 15. Database Health Sampler

pg_cron every 5 minutes into `helm_debug.db_health_samples`, one compact row: sampled_at,
stats_reset_at, connections total/active/idle-in-tx/waiting-lock/pct-max, longest
active/idle-in-tx/lock-wait ms, xact commit/rollback deltas, deadlocks/conflicts deltas,
tuples returned/fetched/inserted/updated/deleted deltas, temp files/bytes deltas, blocks
read/hit deltas + cache hit ratio, wal_bytes delta and checkpoint evidence where
available, db_size_bytes, collector_version, collector_status. Capability detection for
version/permission-dependent views; a missing optional metric never breaks the collector.
Retention 30 days at 5 minutes (~8,640 rows/month).

## 16. Query performance: pg_stat_statements DELTA engine

Cumulative counters, so `total_exec_time > X` is WRONG. Sample every 15 minutes, store
prior counter state per queryid, compute deltas; never reset automatically; detect resets
via `pg_stat_statements_info.stats_reset` and rebaseline. `helm_debug.db_statement_samples`
stores Top-K (25–50) deltas: sampled_at, stats_reset_at, queryid, safe_query_class,
safe_operation_name, source_class, feature, calls_delta, total_exec_ms_delta,
mean_exec_ms_window, max_exec_ms_observed, rows_delta, wal_bytes_delta, shared block
hit/read deltas, temp block deltas. No raw query text as the historical key; a separate
safe catalog `queryid -> safe name / source class / feature / owner`
(save_partial_round_atomic, submit_round_atomic, realtime_logical_replication,
pg_net_worker, helm_bridge_read, coachhelm_context_read, unknown_app_query). Bridge
separates HELM PRODUCT WORKLOAD / SUPABASE INTERNAL-REALTIME / PG_NET-JOB /
OBSERVABILITY / UNKNOWN.

## 17. Query-regression detection

Healthy baselines per stable query/RPC after sufficient samples (calls, mean, max, DB time
per window, rows/call, temp usage, block reads). No true p95/p99 from pg_stat_statements
(aggregate min/max/mean/stddev only); p95/p99 comes from Sentry spans at the request
layer. Regressions: mean 3x baseline; max reaching app timeout; same calls but 5x DB
time; rows/call explodes after release; new queryid enters top DB-time list; same journey
now 4x DB calls. Correlate with release SHA and feature.

## 18. Locks / blocking / transactions

Bounded current-state query over `pg_stat_activity`, `pg_locks`, `pg_blocking_pids`. Store
a durable incident row only on threshold crossing. App roles (8s posture): active >5s
warning, >=8s critical; lock wait >2s warning, approaching 8s critical; idle-in-tx >5s
warning, near 8s critical. Service role: longer thresholds. Any true 40P01 in a product
workflow is actionable; persist feature/action, query classes, wait duration,
trace/release; never full sensitive query text.

## 19. Connection saturation

Postgres stats + Supabase Metrics API for live pool/service signals. Start: 70% sustained
warning, 80% sustained 10–15m high warning/incident, 90% critical; tune by pool type.
Track separately where available: Postgres connections, PostgREST pool, Auth pool,
Supavisor queue, Storage DB pressure, Realtime DB pressure.

## 20. Supabase Metrics API — free live resource telemetry

Server-only Bridge data source: fetch the Prometheus-compatible endpoint with a server
secret, cache ~60 s, parse an allow-listed metric set, return a small typed health model;
never expose the credential to the browser. Discover current metric names from the live
endpoint/official dashboard, not blog posts. Cards: DB up, CPU, resident memory,
connections/max, pool saturation, WAL/replication, IO pressure, DB size,
autovacuum/bloat, PostgREST pool, Auth pool, Realtime pressure. Long history from the
internal rollups.

## 21. Optional free Grafana — secondary only

Only at $0 and only if the owner wants it. Bridge remains the control plane; use the
official Supabase Grafana project as expert reference, not a dependency.

## 22. CPU / memory / up alerts

Starting points: DB-up down -> CRITICAL; CPU >90% ~2m sustained -> critical candidate;
resident memory >90% ~5m -> critical candidate. No paging on one-sample spikes. Bridge
always shows freshness; stale = UNKNOWN, not healthy.

## 23. Rollback rate

`rollback_rate = xact_rollback_delta / (commit + rollback)` from `pg_stat_database` deltas;
no blind static threshold; use baseline, release comparison, feature error evidence,
query/RPC failures.

## 24. Data integrity: errors with HTTP 200 (mandatory)

Zero-row UPDATE assumed success; round completed without children; submitted round with
missing downstream stats; qualifier aggregate disagreeing with source rounds; stale
CoachHelm snapshot; calendar write the intended member cannot read; full-snapshot save
shrinking durable history. Extend the existing invariant registry with outcome contracts
per critical workflow (round submit: RPC returns durable id -> round submitted -> holes
durable -> shots durable -> stats eventually refreshed). A violated critical invariant is a
DATA_INTEGRITY UnifiedIncident even at HTTP 200 and zero Sentry errors.

## 25. Postgres Flight Recorder integration

Do not replace HELM_TRACE; extend for critical workflows only; gated, safe metadata,
fail-open, parent/child preserved, Sentry/Helm correlation preserved. Keep the
rollback-safe RAISE LOG as manual deep evidence; the out-of-band app-observed event is the
durable Bridge evidence.

## 26. pg_cron health

Use `cron.job` / `cron.job_run_details`: collector failed, never ran, abnormal duration,
repeated failure, critical app cron failed/never ran. A collector that stops producing
samples yields TELEMETRY_DEFECT / UNKNOWN, never green. Bounded, fast jobs.

## 27. Suggested collector schedule

`*/5 collect_db_health + evaluate_db_health_rules`, `*/15 collect_statement_deltas +
evaluate_statement_regressions`, hourly `evaluate_table_health`, daily
`prune_observability` (15 3 * * *). Prefer one well-structured collector over five
concurrent jobs; low concurrency; instrument collector duration and failure state.

## 28. pg_net / Database Webhook health

Inventory every pg_net/webhook use; for critical delivery know intent, observed response,
retry existence, loss tolerance. pg_net response tables are troubleshooting evidence, not
a durable event store; critical webhooks use a durable outbox owned by the feature.
Bridge surfaces request failures, response errors, backlog anomaly, critical outcome
failures.

## 29. Table health / vacuum / bloat / scans

Hourly or less for important tables: live/dead tuples, last autovacuum/analyze, seq vs
index scans, insert/update/delete deltas, size, index size. Warnings, not pages: dead
tuples rising, no autovacuum on high-write tables, seq-scan explosion after release,
index use collapse, one table driving most writes.

## 30. Advisor integration

Security/Performance Advisors after DDL/migrations, in release verification, on a cheap
daily/weekly audit, on demand during RCA; normalize actionable findings into Bridge with
advisor type, object, severity, feature mapping, first seen, status, related
migration/PR; no duplicate incidents per run.

## 31. PGAudit: OFF by default

Do not globally enable READ/WRITE/FUNCTION/DDL. Propose only for a specific
security/compliance question, narrowly scoped, never with parameter logging.

## 32. On-demand Supabase log evidence — no continuous ingestion

Optional operator/agent action "Fetch Supabase Evidence" from a UnifiedIncident, disabled
unless the plan guarantees no unacceptable charge: one service, ±2–5 minute window,
filtered by trace id/path/error family, sanitized immediately, short timeline summary
persisted, raw bulk discarded. Never an hourly scan. If unavailable or billable: "SUPABASE
LOG EVIDENCE: UNKNOWN / MANUAL".

## 33. Sentry + Supabase deduplication

One root cause appearing as Sentry exception + Bridge server error + DB error event +
Flight Recorder failure + resource anomaly is evidence, not five incidents. Family
fingerprint inputs: source class, service, feature, action/operation, relation or RPC,
stable code, normalized mechanism, release when useful.

## 34. Database incident detail — desired UX

Incident title; primary class (e.g. DATABASE_AUTHORIZATION); feature; service; RPC;
SQLSTATE; HTTP; first/last seen; occurrences; release SHA; Sentry issue/trace/replay;
Helm flight trace; database workflow stages with the failing one; query health vs
baseline; database health at the time; locks; data invariant pass/fail/unknown; recent
change (PR/migration/release); evidence confidence; repair PR/CI/verification.

## 35. Bridge database views

A. Database Mission Control (DB status, metric freshness, connections, active queries,
lock waits, rollbacks, DB error rate, critical SQLSTATE families, CPU, memory, DB size,
collector health, Realtime pressure, current release). B. Database Errors grouped by
fingerprint. C. Query Performance (top DB time, top calls, top max, new query ids,
regressions, product vs internal workload). D. Locks & Transactions. E. Integrity.
F. Jobs / Webhooks. G. Telemetry Health (last samples, Sentry/Flight
Recorder/Metrics API/logs availability, collector failures, blind sources). No Grafana
clone.

## 36–39. Error-rate metrics, retries, timeouts, data-loss monitoring

Low-cardinality counters (`db.operation.attempt/success/failure`, `db.rpc.failure`,
`auth.failure`, `storage.failure`, `realtime.channel_failure`, `edge_function.failure`)
with feature/action/operation/safe name/code family/terminal/retryability; no per-user
series; reuse Sentry Application Metrics (the `helm.*` catalogue) rather than a second
pipeline. Track attempt failure / retry / final success separately from terminal failure.
Never assume client timeout == no commit: TRANSPORT_TIMEOUT, DURABLE_FAILURE,
DURABLE_SUCCESS_AFTER_TIMEOUT, UNKNOWN_COMMIT with read-back verification. For the
highest-risk persistence paths record safe before/after COUNTS (expected vs durable
holes/shots); a full-snapshot replacement that reduces durable children gets special
scrutiny, without false alarms for legitimate edits.

## 40–48. Schema/types, RLS diagnostics, freshness, self-monitoring, retention, release correlation, causality, service layers

Integrate db drift / migration ledger / type drift / RLS tests / error audit status into
DB Mission Control and auto-attach to missing-object incidents. 42501: classify expected
security denial vs unexpected product failure by feature/action semantics; never log
policy predicates with user values. Freshness states HEALTHY / DEGRADED / STALE / BLIND /
UNKNOWN per source; the global view may not say GREEN if a required source is blind.
Self-monitoring: collector runtime, DB calls, rows written, table sizes, Flight Recorder
write failures, instrumentation failures, reader failures; tag the observability workload
so `pg_stat_statements` separates it. Retention: error events 30d aggregated, health 30d @
5m, statements 14d @ 15m Top-K, locks 30d, invariants 30–90d, trace tables per current
policy; daily prune; track sizes. No raw query text retention (queryid + safe label +
counters). Release correlation on every durable error/health regression (app errors from
the release identity; scheduled samples from the deployment ledger). Causal confidence
from timing, feature match, RPC/table match, trace executing changed code, SQLSTATE
mechanism fit, canary/control, historical similarity, replay, provider outage: POSSIBLE /
LIKELY / REPRODUCED CAUSE. Separate service layers Gateway/API, Auth, PostgREST, Postgres,
Storage, Realtime, Edge.

## 49–55. Alert policy, suppression, baselines, query budgets, retry storms, coverage audit, Realtime cost

P0: DB unavailable, pool exhaustion, critical journey data-loss invariant, cross-tenant/RLS
defect, systematic round persistence failure, schema mismatch, mass Auth 5xx. P1:
sustained critical RPC timeout rate, user-affecting deadlock, Realtime critical delivery
collapse, repeated Storage DatabaseTimeout, missed user-visible cron, sustained resource
saturation. P2: performance regression without failure, elevated retries, bloat/vacuum,
call amplification, noncritical webhook failures. TELEMETRY DEFECT: sampler stopped,
Metrics API unreadable, Sentry blind, Flight Recorder absent for a required workflow. No
paging on expected invalid passwords or one routine 409. Group downstream evidence under
one infrastructure incident without hiding user impact. Baselines report
`baseline_status = collecting` until meaningful. Per-journey DB call budgets measured
before enforced; detect N+1 amplification after releases. Detect retry amplification
(PGRST003 x10 client retries, Realtime reconnect loops, getUser storms, unbounded pg_net
retries, ignored autosave circuit breaker); Bridge shows attempts per terminal outcome.
Coverage audit of `if (error) return`, `.catch(() => {})`, `void supabase...`,
`Promise.allSettled`, `maybeSingle()`, `single()`, `throwOnError()` — classify expected
silence / warning metric / Bridge event / Sentry issue / out-of-band DB event. Workload
budget panel: product vs Realtime/logical replication vs pg_net vs observability vs
maintenance; compare before/after any new publication.

## 56–61. Trace Explorer, replay fixtures, certification, chaos, security, no generic ingest

Extend the existing Trace Explorer with layers CLIENT / SERVER ACTION / SUPABASE-POSTGREST
/ POSTGRES RPC / POSTGRES SUBSTEPS / VERIFICATION / ASYNC DOWNSTREAM; per step status,
duration or checkpoint time, requiredness, function, safe table, SQLSTATE, Sentry link,
release; when rollback removed the trace rows show "POSTGRES FAILURE DETAIL: NOT DURABLY
CAPTURED — application-observed SQLSTATE: …, raw Postgres log: manual". Replay fixtures
for 42501, 23505 race, 40P01, 57014, round_missing race, stale optimistic lock, schema
mismatch, zero-row update, on local Docker / isolated DB; never destructive production
tests. Certify (preview/local): 42501, 42883, 57014, expected 23505, handled and unhandled
server DB errors, failed RPC with rollback, Realtime CHANNEL_ERROR/TIMED_OUT, expected
Storage missing object, Auth invalid credential, Auth synthetic actionable failure,
collector failure, telemetry source unreadable, invariant violation in an isolated
fixture — proving Sentry, Bridge and `db_error_event` behaviour, no duplicate incidents,
durable evidence despite rollback, privacy, and that the business action is never broken.
Fault-inject the observability system (revoked collector access, missing table, Sentry
unavailable, Metrics API unavailable, recorder timeout, collector throw, reader throw):
product continues, observability marks itself degraded/unknown. Security: all storage
private (no anon, no authenticated-player access, service-role/admin facade only), Bridge
routes admin-authorized, least privilege, fixed search_path, pgTAP-verified. Do NOT create
a generic browser error-ingest endpoint unless the coverage audit proves an important
client-only gap; then auth, schema validation, allow-list, rate limit, dedupe, size limit.

## 62–70. Modules, migrations, tests, commands, doctor, state model, runbooks, explainer, source mapping

Conceptual modules (adapt to authority): `src/lib/observability/supabase-error-
classifier.ts`, `supabase-error-envelope.ts`, `record-db-error.ts`, `db-health-types.ts`,
`src/lib/admin/data/database-health.ts`, `database-errors.ts`, `database-performance.ts`;
tables `helm_debug.db_error_events`, `db_health_samples`, `db_statement_samples`,
`db_statement_catalog`, `db_lock_incidents`, `observability_state` — after inspecting the
current `helm_debug` schema and reusing existing objects. Migrations follow current DB
authority and R3 rules: design, test locally, prove rollback, fingerprint, HELD; never
silently apply to production. TDD with discriminating tests for the classifier (42501
expected vs unexpected, 23505 expected vs race, PGRST003, 57014, 40P01, Auth 429, Auth
invalid credentials, Storage DatabaseTimeout, Realtime TIMED_OUT), the out-of-band recorder
(sanitizes, persists after rollback, fails open, dedupes, never stores tokens), collectors
(deltas, reset detection, no negative counters, missing optional view degrades, prune,
freshness), Bridge (blind -> UNKNOWN, multi-source -> one incident, release/trace
correlation, source classes), RLS (anon/user cannot read or write; admin path works).
Verification commands: discover from package.json (`audit:supabase-errors`,
`db:drift:check`, `db:ledger-drift`, `db:types:check`, `flight-recorder:audit`,
`diagnostics:health`, `trace:db`, `triage`, `control-plane:verify`, `test:rls`,
`typecheck`, `lint`, `preflight` — verify each exists). Extend `repo:doctor` /
control-plane checks: DB_ERROR_STORE_PRESENT/PRIVATE, DB_HEALTH_SAMPLER_PRESENT/FRESH,
DB_STATEMENT_SAMPLER_PRESENT/FRESH, PG_STAT_STATEMENTS_AVAILABLE, PG_CRON_AVAILABLE,
METRICS_API_CONFIGURED_OR_INTENTIONALLY_DISABLED, SENTRY_SUPABASE_TRACING_PRESENT,
TRACEPARENT_CERTIFIED, FLIGHT_RECORDER_DB_LAYER_PRESENT, OBSERVABILITY_RETENTION_PRESENT,
OBSERVABILITY_FAIL_OPEN_TEST_PRESENT, DB_ERROR_CLASSIFIER_PRESENT,
INVARIANT_REGISTRY_PRESENT (missing optional credential = NOT_CONFIGURED). Bridge DB state
GREEN / AMBER / RED / UNKNOWN / DEGRADED with blind sources capping confidence. Runbooks
for 42501 (expected? RPC/table? SECURITY INVOKER/DEFINER? search_path? schema USAGE?
EXECUTE? RLS policy? recent release/migration? reproduce as role) and 57014 (role timeout?
trend? lock vs execution? blockers? delta regression? release changed shape? retry caused
duplicate/unknown commit?) — never "fix" by raising statement timeout. Query explainer on
demand only, non-destructive, bounded. Map incident -> feature -> RPC/table -> repo
definition -> recent commits/PRs -> tests.

## 71–77. Sentry as the exception front door, three trace ids, layered performance, absence, incident memory, repair quality, no-money operating model

Sentry receives `supabase.service/operation/rpc/relation/code`, `postgres.sqlstate`,
`helm.feature/action/trace_id`, release — never raw SQL, filters, bodies, JWTs; group
Postgres error families. Keep Sentry trace id, W3C trace id and Helm trace id distinct with
explicit correlation fields. Use Sentry spans for request p95 and pg_stat_statements for DB
shape so Bridge can say "request p95 regressed AND DB regressed" vs "request slow, DB
stable". Absence detection (samples stopped, zero submit attempts in season, subscriptions
zero, cron absent, DB spans vanish after release) with active-user context. Record
resolved DB incidents in memory (mechanism, code, feature, RPC/relation, root cause, fix PR,
migration, replay/regression test, invariant). Repair completeness: root cause proven,
regression test, RLS unchanged or deliberate, performance not degraded, invariant
restored, no telemetry hidden, neighbours healthy, post-deploy signal healthy. Normal
operation needs only Postgres stats, small pg_cron jobs, small private tables, existing
Sentry/Bridge/Flight Recorder, on-demand tooling; any step that might create recurring
cost STOPS with "OWNER ACTION REQUIRED — COST".

## 78. Phases

A current truth (authority docs, client factories, Sentry setup, Bridge incident model,
helm_debug, Flight Recorder, migrations, DB health tooling, read-only production
re-measure, coverage matrix) → B error normalization (classifier, sanitizer, Sentry
tags/context, tests, handled-error audit) → C durable out-of-band DB failures (store,
recorder, dedupe, fail-open, rollback certification, RLS tests) → D DB health rollups →
E pg_stat_statements deltas → F locks/jobs/Realtime/Auth/Storage → G Metrics API →
H data integrity → I Sentry/trace certification → J failure injection / acceptance.

## 79. Coverage matrix before editing

Rows: PostgREST select failure, PostgREST mutation failure, RPC SQLSTATE failure, RPC
rollback, RPC timeout, RPC unknown commit, RLS expected denial, RLS unexpected denial,
Auth API error, Auth client error, Storage error, Realtime connection error, Realtime
silent propagation, Edge Function exception, pg_cron failure, pg_cron missed run, pg_net
failure, lock wait, deadlock, connection saturation, CPU/memory saturation, query
performance regression, schema drift, DB type drift, data integrity violation, Sentry
trace missing, DB collector missing. Columns: Sentry, Bridge, DB error event, Flight
Recorder, SQLSTATE/code, release, trace correlation, metric, invariant, alert, replay,
live verified, blind spot.

## 80–86. Acceptance, final Bridge experience, anti-patterns, PR/report, definition of maxed out, research basis, start instruction

Acceptance checklist (each VERIFIED or explicitly NOT VERIFIED / BLOCKED / OWNER ACTION
REQUIRED): app/database errors (PostgREST code, SQLSTATE, Auth code, Storage code, Realtime
state, Edge exception, expected vs actionable, retry vs terminal); rollback (true SQLSTATE
propagates, Sentry sees it, Bridge sees it, separate DB error event persists, no product
dependency on the write); DB health (5m samples, reset-aware deltas, connections, active,
idle-in-tx, lock waits, commits/rollbacks, deadlocks, temp, size, freshness); query
performance (delta sampling, no auto reset, Top-K bounded, safe catalog, workload split,
release regression detection); platform (Metrics API health, DB-up, CPU, memory, pools,
Realtime pressure, stale = UNKNOWN); jobs (pg_cron failure, missed run, collector
self-health, pg_net); integrity (outcome contracts, violations become incidents, HTTP 200
cannot hide corruption); correlation (Sentry trace, propagated trace, Helm trace, release,
feature/action, DB object, incident); privacy (no JWT/cookies/service key/password/raw
body/arbitrary filters, Replay masked, sentinel absent); cost (no drain, no continuous log
ingestion, no new vendor, bounded rows/day measured, table sizes measured, collector cost
measured). Anti-patterns: log drains; global PGAudit; storing all logs in Postgres; polling
the Logs API; auto `pg_stat_statements_reset()`; cumulative counters as rates; raw query
params; user/team/round ids as metric dimensions; alerting on every 4xx; every 42501 or
23505 as a bug; client timeout as rollback proof; HTTP 200 as durable-state proof; no
telemetry as no errors; telemetry failures breaking product; a second incident DB; a second
Flight Recorder; a Grafana clone; persisting full plans for every request; a public
arbitrary ingest endpoint. PR title `feat(observability): add zero-cost Supabase database
error control plane`; report sections 1–22 (before-state, matrix, architecture, schema,
rows/day and storage, collector runtime, taxonomy, Sentry changes, W3C proof, Flight
Recorder integration, Bridge views, DB health signals, query-performance signals,
Auth/Storage/Realtime/Edge coverage, cron/pg_net coverage, invariants, fault-injection
evidence, privacy proof, cost proof, features not enabled, owner approvals needed,
rollback) ending with VERIFIED / NOT VERIFIED / OWNER ACTION REQUIRED / BLOCKED /
INCREMENTAL RECURRING OBSERVABILITY COST $0 (never claim $0 if any charge is created).
"Maxed out" = every meaningful failure has a code with context; every critical operation
an outcome tied to a release; every critical DB workflow traceable; every app-visible
rollback leaves durable out-of-band evidence; every silent data failure an invariant;
every important query a baseline; every source a freshness; every blind source UNKNOWN;
repetitive signals dedupe; every observability write fail-open; no secret needed for
routine diagnosis; no paid drain. Research basis: Supabase Metrics API, official Supabase
Grafana pack, pg_stat_statements, Supabase Cron, PostgREST/Auth/Storage error codes,
Realtime channel states, supabase-js W3C propagation, Sentry Supabase instrumentation,
Sentry Deno for Edge Functions, PGAudit's selective model, Helm's helm_debug Flight
Recorder, Sentry/Bridge pipeline, drift/type/migration/RLS controls — verify CURRENT
installed versions and CURRENT docs before using any API or metric name.

Start with read-only discovery. Do not begin by writing migrations. First produce: (1) the
current Supabase observability inventory, (2) the current error coverage matrix, (3) the
current `helm_debug` schema inventory, (4) the current Sentry/Supabase trace
configuration, (5) the current Bridge incident ingestion paths, (6) the current database
health and pg_stat baseline (read-only production), (7) proposed exact changes with a
duplicate-system check. Then implement in phase order under Helm's worktree, migration,
TDD, verification and owner-approval rules. Stop only for production migration
application, production security/RLS changes, irreversible production mutation, new
recurring paid services, or a secret only the owner can supply.
