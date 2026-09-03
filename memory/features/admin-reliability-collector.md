<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Feature: Admin Reliability Collector

> Carved out of `memory/features/admin-platform.md` 2026-09-02 as part of the
> `admin_platform` registry granularity split (ADR-2026-09-03-control-plane-
> owner-decisions, memory/decisions/ — on the parallel Bridge control-plane
> session's branch, not yet on this branch — closing OWNER DECISION
> `ADMIN_PLATFORM_REGISTRY_GRANULARITY`). `admin_platform` remains the shared
> Bridge shell; this doc owns the three-hourly Collect stage of the
> self-healing loop and the `/admin/reliability` tab. See also
> `memory/features/admin-incidents.md` (the incidents read model folds this
> feature's correlated signals in as evidence) and `memory/features/
> admin-selfheal.md` (the Diagnose stage this feature's snapshots feed).

## Status

- active

## Current State

Admin Reliability Collector is the Collect stage of the self-healing loop: a
Vercel cron, three-hourly, that runs three fault-isolated collector arms
(Sentry, Supabase, Vercel) concurrently, correlates their output into
`CorrelatedSignal`s, and writes one detailed snapshot plus one standard
cron-board row per run. `/admin/reliability` renders source health, the
blind-source notice, the severity mix, run history and the raw snapshot.

Since 2026-09-03 (Bridge Control Plane Phase D.4.3) the same run also
executes a FOURTH, independently fault-isolated arm — the executable
invariant runner (`src/lib/reliability/invariants/run-checks.ts`) — via a
SEPARATE `Promise.allSettled` run concurrently alongside the 3-source array,
not folded into it (`ReliabilitySource`/`sourceNames` stays a closed
3-element union). Its result lands on the new, OPTIONAL
`ReliabilityRun.invariants` field — absent on any row written before this
shipped, and deliberately not a `version` bump, since `parseRun`
(`src/lib/admin/data/reliability.ts`) only requires `version === 1`. See
`memory/features/admin-slo.md` for the invariants themselves and the
downstream read (`/admin/health`'s Invariant Lattice, `/admin/slo`'s error
budget — a NEW derived view over `error-budget.ts`, likewise owned by
`admin_slo`, not this feature).

## Primary Entry Points

### Routes

- `src/app/admin/reliability/**`

### API

- `src/app/api/cron/reliability-triage/**` — the 3-hourly collector, scheduled
  `0 */3 * * *` in `vercel.json`. Scoped to this one cron rather than
  `src/app/api/cron/**` on purpose: the coachhelm-* crons in that directory
  belong to `coachhelm_ai`, and a blanket glob would silently hand their
  ownership here.

### Services

- `src/lib/reliability/**` — `collect.ts` (`runReliabilityCollection()`),
  `sources.ts` (`collectSentry`, `collectSupabase`, `collectVercel`),
  `normalize.ts` (`correlateSignals`, `correlationSignature`), `resolution.ts`,
  `types.ts`.
- `src/lib/admin/release-intel/**` (2026-09-03, control-plane plan §4 F
  remainder) — `risk-score.ts` (pure change-risk tier + itemized reasons),
  `rollback.ts` (pure KEEP/WATCH/PAUSE_ROLLOUT/ROLLBACK_RECOMMENDED/UNKNOWN
  verdict over `reliability-snapshot` window summaries), `read-model.ts`
  (server-only: `fetchRollbackRecommendation()` for the live release via
  Supabase + `fetchReleaseLedger()`; `fetchPendingReleaseRisk()` for queued
  release-queue items via defensive reads of `memory/registry.yml` and
  `docs/generated/WORLD_MODEL.json` — degrades to `unconfigured` if either
  file is unreadable at runtime, never crashes). `scripts/release-intel/**`
  — `score-change.ts` (`npm run risk:score`), `evaluate-rollback.ts` (`npm
  run release:rollback-check`), both read-only and non-executing (never
  calls a deploy/rollback API). Renders on `/admin/deploys` as a new
  "Release intelligence" panel
  (`src/app/admin/deploys/_components/ReleaseIntelPanel.tsx`).
  `types.ts`, `error-budget.ts` (`computeErrorBudgets()` — a pure rolling-window
  read over this feature's own `reliability-snapshot` history, consumed by
  `admin_slo`), `invariants/**` (the Phase D.4.3 fourth arm: `run-checks.ts`,
  `round-graph-invariants.ts`, `round-graph-data.ts`).

## Core Data

- `background_job_logs` — one `reliability-snapshot` row (the detailed
  correlated payload) and one `reliability-triage` row (the standard
  cron-board row) per run.

## Business Rules

- **The reliability collector writes TWO `background_job_logs` rows per run,
  and they must stay distinct.** `recordJobRun('reliability-triage', …)`
  writes the standard cron-board row — every registered cron must call it,
  enforced by `src/app/api/cron/__tests__/cron-job-log-coverage.test.ts` — and
  the detailed correlated payload is written separately under
  `reliability-snapshot`. They cannot be one row: `recordJobRun`'s
  `extractOutcomeMetadata` deliberately keeps only TOP-LEVEL SCALARS, so
  `signals[]` and `sources[]` would be silently stripped and the tab would
  render every run as "recorded but unreadable". Only `reliability-triage`
  belongs in `CRON_REGISTRY`; the snapshot type is a payload store, not a
  scheduled job. (`background_job_logs`'s status vocabulary is `completed` /
  `failed`, platform-wide — see `memory/features/admin-platform.md`.)
- **Only a TOTALLY blind reliability run returns 503; a partially blind one
  returns 200.** `recordJobRun` does more than write a job row on a >=400 — it
  also calls `logServerEvent(..., 'error')`, which writes an `admin_events`
  row. Failing the run whenever ANY arm was blind therefore produced eight
  error rows a day, indefinitely, into `/admin/errors`, the incident feed and
  the nav error badge. A degraded run is already reported honestly twice —
  the snapshot row carries `status='failed'` and the tab renders a danger
  band naming each blind source — so a red Jobs board is not worth polluting
  the triage queue for. These behaviours are coupled with the self-feed
  filter below: a failed run's `admin_events` row is titled `Cron failed:
  reliability-triage`, which is exactly what `collectSupabase` excludes. Do
  not change one without the other.
- **Evidence references carry their source; they are never paired by index.**
  A `CorrelatedSignal`'s `sources[]` and its evidence list dedupe on different
  keys, so their indices do not correspond — one source contributing two refs
  shifts every later index and misattributes the rest. Evidence is
  `Array<{source, ref}>` for that reason, and `evidenceTarget` (consumed by
  `admin_incidents`'s `UnifiedIncidentCard`) needs the source to decide
  whether a ref is a Sentry permalink, a Bridge drill-through, or opaque text.
- **A discarded rejection reason is an invisible outage.** `Promise.allSettled`
  callers must capture WHY a task rejected, not just count it — the reason is
  the only thing that answers "what is wrong". See
  INC-2026-08-27: a counter-only handler let a cron fail for two days while
  `background_job_logs` recorded 72 consecutive `completed` runs. Reasons
  written into a cron response must be SCALARS: `recordJobRun`'s
  `extractOutcomeMetadata` keeps only top-level scalars and silently drops
  arrays.
- **A source that could not be read is never reported as zero problems.** The
  reliability collector's arms each return `{status, reason, signals}`, and
  the run's status is the WORST arm — so a run whose Sentry token is missing
  writes `status='failed'` and the Bridge renders a danger band, not a green
  tick. An arm that returned `[]` on failure would be indistinguishable from
  a healthy arm finding nothing, which inverts the meaning of the entire tab.
  This is the OS contract's "never error→[]" rule; `worstStatus` is the single
  function enforcing it and it is covered red/green.
- **The reliability collector must never read its own emissions.** It is a
  cron that reads the table crons write failures to, so without exclusions
  one failed run becomes a signal, becomes a triage item, becomes another
  error row — a loop that manufactures work from its own failure.
  `collectSupabase` filters out `event_type='rca_analysis'` AND any row
  naming `reliability-triage`.
- **Cross-source correlation drops severity from the key, and must.**
  `buildIncidentSignature` (owned by `admin_incidents`) folds severity INTO
  its key (`severity::errorCode::route::messagePrefix`), which is right for
  its original callers — they group rows arriving from one source through one
  writer. It is wrong across sources: Sentry rates as `error` plenty of
  conditions this app logs to `admin_events` as `warning`, so the
  severity-bearing key splits one root cause into two entries and the
  "confirmed by N sources" badge never fires. `correlationSignature` in
  `src/lib/reliability/normalize.ts` therefore calls the same function with a
  FIXED severity and lets `pickWorseSeverity` carry severity across the fold
  instead. Be precise about what this shares with `admin_incidents`'s view,
  because the looser claim rots: the reliability tab reuses the
  **normalisation** — and therefore the notion of what counts as the same
  failure — but its signature value is **not** equal to the row's stored
  `admin_events.fingerprint`, which was computed with that row's real
  severity. Within the Supabase arm, rows are still pre-grouped on the stored
  fingerprint before correlation runs.
- **`unknown` is a state, and nothing may collapse it into a healthy value.**
  A blind source's freshness is `unknown`, not `fresh`, even when the failed
  attempt was seconds ago. `src/lib/reliability/types.ts` states this for one
  collector run; `admin_incidents` lifts the same rule to every Bridge
  surface.
- **Corroboration is an observation count, not a confidence score**, and
  evidence coverage is a checklist, not a percentage. Two systems seeing a
  fault is a mechanical fact about coverage and says nothing about
  likelihood. Rendering either as a percentage would imply a calibration this
  system does not have — which is also why the Reliability tab groups by
  source count in WORDS.
- **A Sentry rate limit gets one honoured retry before it counts as blind.**
  `fetchSentryIssues` (`src/lib/admin/sentry-api.ts`, general admin_platform
  service) waits out the 429's `Retry-After` (capped at 30s; a sane default
  when the header is absent) and retries exactly once. If the retry also
  fails, the envelope is marked `degraded: true` rather than a bare error.
  The Reliability tab's `SourceStatus` (`src/lib/reliability/types.ts`)
  carries this through as its own `'degraded'` value — ranked worse than
  `partial` but better than `blind` in `worstStatus`, since a rate limit
  "usually clears on its own" — with reason `'rate limited'`. Scoped to the
  Reliability tab only: `admin_incidents`'s separate `SourceHealth` union
  (`src/lib/admin/incidents/types.ts`) has no `degraded` member and a
  degraded reliability arm folds into its existing `'blind'` there, which is
  the conservative direction and consistent with "no all-clear while a
  required source is blind".
- **A canceled preview deployment is not a build problem.** `collectVercel`
  rates a `CANCELED` Vercel deployment `info` unless its `target` is
  `production`, where a canceled deploy means the intended release never
  shipped and stays `warning`. A superseded or manually-canceled preview
  build is routine noise, not a reliability signal.
- **Reliability is a lens, not a second queue.** `/admin/reliability` keeps
  source health, the blind-source notice, the severity mix, run history and
  the raw snapshot — removing those was never the goal. What it must not do
  is sort by severity (the Incidents tab's axis) or dead-end its rows: every
  signal title links to `/admin/errors/rel:<signature>`, which is the same
  string the nightly triage stores its analysis under.

## UI Contract

- The Reliability tab states source health BEFORE signals. A blind source
  renders as danger rather than the neutral tone "not configured" gets
  elsewhere in the Bridge: opting out of Inngest is a config choice, whereas
  an unreadable source falsifies the tab's whole claim. Its empty state is
  split in two — "all sources read, nothing found" is an all-clear, "sources
  blind, nothing found" is explicitly not one — and a never-run collector
  reads as a wiring problem, not as health.

## Tests To Prefer

- `src/lib/reliability/__tests__/normalize.test.ts` — source-degradation
  semantics and cross-source correlation.
- `src/lib/reliability/__tests__/sources.test.ts` — the self-feeding-read
  guard, asserted at the query level where it actually lives.
- `src/lib/reliability/__tests__/error-budget.test.ts` — the honesty contract
  (unreadable/blind windows never read `'ok'`, floor accounting).
- `src/lib/reliability/invariants/__tests__/*.test.ts` — the round-graph
  checks' pure logic, the timeout/error-degrades-to-unknown runner contract,
  and a read-only-by-construction source check.
- `src/app/admin/reliability/__tests__/reliability-view.test.ts`
- `src/lib/admin/release-intel/__tests__/risk-score.test.ts`,
  `src/lib/admin/release-intel/__tests__/rollback.test.ts`.
- Typecheck/build for admin UI changes.

## Related Docs

- `docs/OBSERVABILITY.md`
- `memory/features/admin-platform.md` — the shared shell this entry was
  carved from.
- `memory/features/admin-incidents.md` — folds this feature's correlated
  signals in as evidence.
- `memory/features/admin-selfheal.md` — the Diagnose stage this feature's
  snapshots feed.
