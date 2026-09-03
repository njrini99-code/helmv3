<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Feature: Admin Platform

> Split 2026-09-02 into this shared shell plus three sub-capability docs —
> `memory/features/admin-incidents.md`, `memory/features/
> admin-reliability-collector.md`, `memory/features/admin-selfheal.md` — as
> part of the `admin_platform` registry granularity split
> (ADR-2026-09-03-control-plane-owner-decisions, memory/decisions/ — on the parallel Bridge control-plane session's branch, not yet on this branch, closing
> OWNER DECISION `ADMIN_PLATFORM_REGISTRY_GRANULARITY`). Read the sibling docs
> for the Incidents page, the reliability collector, and the self-healing
> loop's Diagnose/Repair/Close stages; this doc owns everything else in the
> Bridge — the dashboard shell, Golf Tracer, Flight Recorder/traces, health
> rollups, CRM, and cross-cutting platform infrastructure (error-path write
> scheduling, flood collapse, credential shape, feature aliasing) all three
> sub-capabilities build on.

## Status

- active

## Current State

Admin Platform is the internal operations and monitoring surface for
Helm/GolfHelm — the Bridge shell, the main admin dashboard, Golf Tracer, the
Flight Recorder (`/admin/traces`), platform health, BI-style reporting,
user/team activity, audit/security views, and a CRM/admin outreach subsystem.
Incidents, the reliability collector, and the self-healing loop are owned by
the three sibling docs above; this doc is the shell and everything they share.

This area is high criticality because it often uses broader access patterns, operational data, and admin/server-only helpers.

## Primary Entry Points

### Routes

- `src/app/admin/**` (Helm Bridge) — **except** `src/app/admin/errors/**`
  (`admin_incidents`), `src/app/admin/reliability/**`
  (`admin_reliability_collector`), and `src/app/admin/self-heal/**`
  (`admin_selfheal`); those three sub-capabilities' routes are documented in
  their own docs. Everything else — the dashboard, Golf Tracer, Flight
  Recorder/traces, health, deploys, auth, qualifiers, activity, users, teams,
  jobs, billing, utilization, work, ben-leah, baseball, lifting, thread — is
  this doc's.
- `src/app/golf/admin/**`, `src/app/golf/admin/crm/**`
- `src/app/admin/**` (Helm Bridge)
- `src/app/admin/self-heal/**` — the self-healing circuit board. Distinct from
  `/admin/jobs`, which answers "did the crons run"; this answers "is the loop
  alive, and has each stage ever actually produced its output".
- `src/lib/admin/incidents/**` — the unified incident read model. `types.ts` is
  the contract; `correlate.ts`, `lifecycle.ts`, `proof.ts`, `sources.ts`,
  `lens.ts` and `truth-strip.ts` are pure; `fetch.ts` is the only module in it
  that performs I/O.
  - Six additional pure read models, added 2026-09-03 as Phase 0 ("Truth and
    naming") of the owner's Bridge Premium Observability brief (not yet a
    resolvable path in this checkout — see the "Phase 0 truth models"
    section below for its location as of this entry), §6/§7/§8/§9/§36/§45:
    `present.ts` (the deterministic human-title
    resolver — `IncidentPresentation`, wired additively as
    `IncidentBoard.presentations` in `fetch.ts`), `aliases.ts` (root-cause
    dedupe ABOVE `correlate.ts`'s own join — see that file's entry below),
    `episodes.ts` (regression episodes), `coverage.ts` (six-source
    evidence coverage, wider than `sources.ts`'s four), `release-context.ts`
    (Runtime Identity Triplet + release relationship + Release Watch), and
    `release-compare.ts` (baseline-vs-current post-deploy comparison). None
    of the six are wired into any UI yet — Phase 0 is read models only, per
    the brief's own implementation order (§45).
- `src/app/golf/admin/**`
- `src/app/golf/admin/crm/**`
- `src/app/api/cron/reliability-triage/**` — the 3-hourly collector behind the
  `/admin/reliability` tab. Its core is `src/lib/reliability/**`.
- `src/app/api/cron/selfheal-triage/**` — the self-healing loop's Diagnose
  stage, moved here from an Anthropic-hosted cloud routine (2026-09-02). Its
  collection/apply core is `src/lib/admin/triage-collect.ts` /
  `triage-apply.ts` (shared with the `npm run triage` CLI,
  `scripts/run-triage.ts`, which is now a thin wrapper over both) and its
  analyzer core is `src/lib/admin/rca-run.ts` (shared with the super-admin
  `analyzeErrorFingerprint` server action). See
  `docs/ai-system/selfheal/README.md`.

### Components

- `src/app/admin/_components/**` (Helm Bridge shell and controls)
- `src/app/golf/admin/crm/components/**`

The legacy `/golf/admin` dashboard shell — `src/app/golf/admin/components/**`
(89 files: OverviewTab/SystemTab/TracerTab/PeopleTab/GrowthTab and their
children) plus its route `page.tsx` — was deleted 2026-08-26. It had been
unreachable since `next.config.mjs` 308-redirected the exact `/golf/admin`
path to `/admin` (Helm Bridge), but still shipped in the bundle and held live
Supabase Realtime subscriptions via `AdminRealtimeProvider`. `layout.tsx`,
`loading.tsx`, `error.tsx`, and `_motion-provider.tsx` directly under
`src/app/golf/admin/` were KEPT — Next.js App Router makes them the ancestor
route boundary (auth gate, Suspense fallback, error boundary, `LazyMotion`
provider) for the still-live `crm/` and `demo-sessions/` sub-apps; deleting
them would have broken those routes, not the dead one.

### Actions And Services

- `src/app/golf/actions/admin-data.ts`
- `src/app/golf/actions/admin-people-data.ts`
- `src/app/golf/actions/admin-system-data.ts`
- `src/app/golf/actions/admin-tracer-data.ts`
- `src/app/golf/actions/admin-bi-data.ts`
- `src/app/golf/actions/admin/**`
- `src/app/golf/actions/crm-*.ts`
- `src/app/golf/actions/resend-activity.ts`
- `src/app/admin/actions/view-as.ts`, `golf-tracer.ts`, `billing.ts`,
  `sessions.ts` — general admin actions; `analyze-error.ts`/`resolve-error.ts`/
  `sentry-resolve.ts` moved to `admin_incidents` and `triage.ts` moved to
  `admin_selfheal` in the same change that mapped `src/app/admin/actions/**`
  (previously unmapped to any feature — a closed system gap).
- `src/lib/supabase/admin*`
- `src/lib/cron/**`
- `src/lib/admin/**` — the remainder not carved into a sub-capability above
  (deploy-freshness, integration-health, sentry-api, vercel-api,
  feature-registry, error-trend, severity, credential-shape, and the rest).
  Overlaps by design with the sub-capabilities' narrower globs on their own
  carved files — see the registry comment on this glob.

## Core Data

- Platform user, organization, membership, team, coach, player, round, event, insight, and audit data.
- CRM tables for coaches, events, sequences, suppressions, email tracking, replies, and timeline activity.
- Health/audit data from application logs, auth, error tracking, and operational tables.
- `background_job_logs` — the shared cron heartbeat table every registered
  cron writes to (`completed` / `failed` vocabulary, verified against
  production; no other status word is emitted).

## Business Rules

- Admin access must remain explicit and server-side; service-role behavior must not leak into client bundles.
- Helm Bridge uses the authenticated GolfHelm session. Its shell must expose a
  usable sign-out control on both the desktop rail and the mobile More sheet;
  sign-out clears the active-team selection before revoking that session.
- Admin dashboards can read broad platform state, but mutations still need authorization and auditability.
- CRM automation/suppression behavior must respect opt-out and reply-stop logic.
- Operational charts should not be treated as source of truth if rollups are stale.
- Cron/admin endpoints must use configured secrets and auth checks.
- **The row status vocabulary is `completed` / `failed`.** Verified against
  production: all existing `background_job_logs` rows use those two words and
  nothing else. An earlier draft wrote `success`, which no other writer emits and
  every status-based filter would have missed. Both `admin_reliability_collector`
  and `admin_selfheal` write to this shared table under this vocabulary.
- **`unknown` is a state, and nothing may collapse it into a healthy value.**
  A CI check read that failed is `unknown`, never `pending` — pending reads as
  orderly progress. An unreadable deploy leaves an incident `merged`, never
  `resolved` and never `awaiting-deploy`. This principle is stated once here
  and applied throughout the Bridge — by `admin_reliability_collector` for a
  collector run's freshness and by `admin_incidents` for every derived state.
- **The Flight Recorder's two axes are never summed.** Instrumentation coverage
  (how much of the declared pipeline has call sites wired to the recorder) and
  outcome (whether the work succeeded) are independent. Measured 2026-09-01, 46
  of 50 production traces miss declared-required steps while 40 of those
  succeeded — a short trace is not a failed one, and a combined "46 problems"
  figure would be false. `trace-fleet.ts` counts them separately;
  `stepCoverage` returns null rather than inventing a denominator. This is
  `/admin/traces`, a DIFFERENT Flight Recorder from the self-healing loop's
  Diagnose/Repair pipeline in `admin_selfheal`.
- **The capture-quality panel's 'user' field excludes rows that could never
  have carried a user.** `analyzeCaptureQuality` (`src/lib/admin/data/
  capture-quality.ts`) measures how completely `admin_events` rows were
  instrumented — but a `source: 'cron'` row (`job-log.ts`'s `Cron failed:
  <jobType>`, including the reliability collector's own) or `source:
  'system'` row (`deploy-marker.ts`) is a machine invocation with no session
  to resolve a user from, not an under-instrumented call site. Counting them
  against the 'user' field's denominator understated capture quality for a
  gap no call site could ever close. They stay in `rows` and every OTHER
  field's denominator (error-code/stack/route/feature/action) — a cron
  failure legitimately carries all five — and stay eligible to rank as a
  weakest emitter on those five, just never penalised for the one field they
  were never eligible to carry. `SELF_REFERENTIAL_SOURCES` is the single set;
  `rca_analysis` rows need no matching check because they are already outside
  `queryAppErrorEvents`'s `event_type='error'` filter.
- **"Steps observed" has exactly one definition, and only one place fixes it
  up.** The fleet-list RPC (`helm_debug_list_traces`) and the per-trace tree
  (`trace-tree.ts`'s `buildTraceTree`) each carry their own count over the
  same underlying fact — the list's is a DB-stored counter, the tree's is
  computed live over the steps array it was actually handed — and the two can
  disagree for a trace finalized before the 2026-09-01
  `helm_debug_finalize_trace` migration, or one still mid-flight.
  `TraceTree.observedStepCount` is the one named, tested definition
  (`observed.length`, before synthesised missing nodes); `bridgeGetFlightTrace`
  reconciles a trace's `observed_step_count` against it via
  `reconcileObservedStepCount` the moment that trace is OPENED. This fixes the
  number for whichever trace is open, not for the other rows still sitting in
  the fleet list — that needs a `helm_debug_list_traces` migration change and
  stays a known, documented gap.
- **An observed step can be undeclared, and that is not the same as missing.**
  `TraceStepNode.isUndeclared` marks a step that WAS recorded but whose key
  isn't in the workflow's own declared-step set (`golf-round-flight-workflow.ts`)
  — the shape every postgres-layer checkpoint child the trace-checkpoints
  migration writes will have, since e.g. `golf.round.submit` declares only its
  top-level RPC key, never the in-transaction children already observed under
  it. `isMissing` stays the opposite condition (declared, never observed);
  neither ever overlaps the other on the same node. A step recording only
  `finished_at` (a single-moment checkpoint, not a measured span) is
  `isPointInTime` and renders "point-in-time" rather than reading identically
  to a step with no data at all. `errorCode` falls back to
  `metadata.sqlstate`/`metadata.failure_code` when the `error_code` column is
  empty, matching what `helm_private.trace_exception_checkpoint` actually
  writes.
- **`buildTraceTree` never silently drops a node, cycles included.**
  `parent_step_key` is free text written by three separate producers (server,
  collector, RPC), so a genuine mutual cycle is possible; every member of one
  used to be attached as some OTHER member's child and none of them ever
  reached `roots`, so the whole cycle vanished from the rendered tree with no
  error. `observedStepCount` (above) was already immune, since it counts the
  raw observed array rather than the walked tree — this closes the same gap
  for the tree itself, via a rescue sweep that promotes any still-unvisited
  node to an additional root after the normal walk. No cycle has been
  observed in a real trace; this is defensive, matching the module's own
  stated design principle.
- **A downgraded trace's badge only ever appears once you open it.**
  `helm_debug_finalize_trace` (since the applied
  `20260901140000_trace_cannot_claim_success_while_blind.sql`) writes
  `status_downgraded_from`/`status_downgraded_reason` into a run's `metadata`
  when it silently downgrades a caller-claimed `success`. `helm_debug_get_trace`
  returns that metadata in full; `helm_debug_list_traces` explicitly SELECTs a
  fixed column list that omits it. So the warning `InlineNotice` in
  `TracesClient.tsx` can only ever render on the opened trace's detail panel —
  never as a fleet-list row badge — without a list-RPC migration change.
- **`npm run flight-recorder:audit`** (`scripts/flight-recorder-audit.mjs` +
  `scripts/lib/flight-recorder-audit-lib.mjs`) is the read-only, post-deploy
  check that the two in-flight timing/checkpoint branches actually wrote real
  data: runs/steps/distinct-step-keys/steps-with-identity/zero-step-runs/
  downgraded-runs over the last 24h. It calls the same two `helm_debug_*` RPCs
  the app uses — `helm_debug` sits outside PostgREST's exposed schema list, so
  an ordinary Supabase table client cannot reach `trace_runs`/`trace_steps`
  under any key, service-role included. `helm_debug_list_traces` hard-caps at
  200 rows server-side with no offset/cursor; the script logs (never silently
  drops) the case where that cap may have truncated the true 24h population.
- **Error text is redacted before it is stored**, not only before it reaches
  Sentry, and `stack` / `message` / `title` count as error text — not just
  `url` and `context`. URL query strings and fragments can carry magic-link
  tokens, OTPs and OAuth codes; a stack embeds them mid-string
  (`new Error(url)`), and a Postgres message echoes offending values.
  `redactFreeTextForStorage` in `src/lib/observability/redact-pii.ts` is the
  single implementation, called by BOTH write paths (the client ingest route
  and the server logger). Keep it that way: both write the same two columns,
  both are read back by the RCA action (`admin_selfheal`) and forwarded to a
  third-party model, and a second copy is one that eventually stops matching —
  silently, on the half nobody is looking at.
- **A Bridge write on an error path is SCHEDULED, never detached.** Every
  capture class used to `void logServerException(...)` and throw. On Vercel a
  promise nobody awaited and nobody registered with the platform is dropped
  the moment the response is sent — Sentry's own capture landed (its SDK
  flushes through the platform), the Bridge row did not: 6 process-level
  rejections in Sentry on 2026-09-01, 0 `admin_events` rows for `process.*`
  in 60 days. `scheduleBridgeWrite` (`src/lib/admin/schedule-bridge-write.ts`)
  is the single mechanism: Next 16's `after()` inside a request scope (zero
  latency on the error path, Vercel keeps the function alive), and an AWAITED
  write under a bounded timeout wherever `after()` throws (unit tests, module
  init, inside `unstable_cache`, a prerender). The fallback is the awaited
  path on purpose — a dropped write is the failure being removed, and it is
  ALSO handed to the Vercel request context's `waitUntil` when one exists
  (start-up on Vercel has a request context but no request scope). It captures
  the correlation scope (`bindRequestContext`) because `after()` callbacks run
  outside the request's AsyncLocalStorage and would otherwise lose
  `requestId`. Wired into `observed-action.ts`, `observe-action-result.ts`
  (which now returns a promise), `job-log.ts`, `integration-health.ts`
  (`reportIntegrationFault` is async and its callers `await` it — a `void`ed
  bounded await is still a promise nobody holds) and
  `src/lib/inngest/credentials.ts`; `instrumentation.ts`'s `register()`
  AWAITS the start-up credential report, after starting the process-handler
  import so a slow Bridge cannot delay the catch-all. The process-level handlers
  (`register-process-error-handlers.ts`) have no request scope, so they import
  the logger statically, hand the write to the Vercel request context's
  `waitUntil` when one exists (`vercel-wait-until.ts` — `@sentry/core`'s own
  helper is Edge-only) and await it under `BRIDGE_PROCESS_WRITE_TIMEOUT_MS`.
- **Flood collapse has a DURABLE half.** `emit-throttle.ts` is per process;
  on serverless a 60s auto-refresh lands on a fresh lambda most of the time,
  so "one row per window" became one row per refresh — 99 identical
  `provider_vercel_unavailable` rows in 2h05m on 2026-09-01, 83% of all
  unresolved error rows in seven days, every `collapsed_count` NULL, and
  `admin_dashboard` RED because `get_feature_health` counts rows. The logger
  now runs `absorbIntoRecentEvent` (`src/lib/admin/durable-collapse.ts`)
  before inserting any `provider_*` fault: an UNRESOLVED row with the same
  fingerprint inside 15 minutes gets its `metadata.metadata.collapsed_count`
  bumped (plus `last_seen_at`) instead of a new row. The bump is a
  compare-and-swap — the UPDATE is guarded on the counter exactly as it was
  read (`metadata->metadata->>collapsed_count`, or its absence), re-read and
  retried once on a miss — because the new count is computed in JS and two
  lambdas that both read N would otherwise both write N+1. Fails OPEN — an
  unreadable lookup, a failed update, or a second guard miss (`lost_race`)
  inserts as before. Opt in for other codes with
  `durableCollapse: true`, out with `false`. Severity is never changed by it.
  The Vercel insights reader additionally negative-caches its own failure for
  5 minutes per process so a dead endpoint is not re-probed on every refresh.
- **In production a MISSING Inngest credential is a fault, not a config
  state.** `integration-health.ts`'s "never report unconfigured" is right for
  an optional Bridge reader and wrong for Inngest, on which round analysis,
  reminders and the reliability automation depend. `src/lib/inngest/
  credentials.ts` classifies both keys by SHAPE (`signkey-<env>-<hex>`; an
  opaque event key of >= 20 chars — an 11-character placeholder is
  `malformed`, not configured) and, when `VERCEL_ENV === 'production'`, writes
  `provider_inngest_missing_credential` on feature `integrations` from three
  triggers: process start (`instrumentation.ts`), every `isInngestConfigured()`
  that answers false (the round-submit routing branch and the Jobs board), and
  every SIGNED inbound request to `/api/inngest` when the signing key is
  unusable (the SDK answers 500 there, so the route's 401 mismatch diagnosis
  never fires). Throttled per process, collapsed across processes, one
  incident — and the throttle window is a promise to write, not a record of
  one: a write that does not land (rejected, timed out on the awaited path,
  or failed inside the `after()` task) gives the window and its drained count
  back via `releaseEmit`, so a frozen start-up cannot silence the next
  trigger for 60s. With one fingerprint the med tier lands on AMBER — the honest
  reading of one known fault; RED needs two consecutive 24h windows. The
  registry entry still carries NO heartbeat, deliberately: silence between a
  Monday cron and a round submit is normal, and `scripts/inngest-health-check.mjs`
  is the active proof. Setting the variables in Vercel Production and
  redeploying is an OWNER action.
- **Feature attribution aliases `feature` too, not only `featureArea`.**
  `resolveFeatureKey` used to return an explicit `feature` untouched, so
  `feature: 'coachhelm_chat'` landed unregistered while the same string as
  `featureArea` would have been aliased. Both go through
  `FEATURE_AREA_ALIASES` now, and the table carries every key measured with
  rows in 30d, each mapped to the registry entry whose action manifest owns
  the emitting file: `calendar → calendar_events`, `insights → coachhelm_ai_engine`,
  `coachhelm_chat → coachhelm_ai_engine`, `coachhelm_effectiveness →
  coachhelm_analytics`, `teams → join_team_flow`, `rounds → round_tracking`.
  Deliberately NOT aliased: `crm` (owner directive — CRM is never tagged onto
  the Bridge) and `lifting-onboarding` (Helm Lifting Lab has no registry entry
  at all; the Baseball Lift Onboarding `FeatureKey` maps a different file,
  `src/app/baseball/actions/lift-onboarding.ts`, not the Lift Lab one). Every
  alias must resolve to a registered key and never shadow one —
  `src/lib/admin/__tests__/feature-aliases.test.ts`.
- **Credential values are validated by SHAPE, in one module.** Every one of
  the eight Bridge values in the local `.env.local` was exactly 11 characters,
  which cleared the old `length >= 10` floor in both
  `scripts/check-helm-bridge-env.mjs` (printed PASS) and the runtime readers'
  identical `usableSecret()` (treated Sentry as configured, so every local
  read failed soft and silently). `src/lib/admin/credential-shape.mjs` is the
  single implementation — `.mjs` so the plain-node script and the TS readers
  (`sentry-api.ts`, `vercel-api.ts`, `inngest/credentials.ts`) import the same
  code — and it never returns or prints a value it was not given. Shape is not
  validity: a rotated key still passes; the runtime diagnosis and the health
  probe are what detect that.
- **Message-shaped traces get a real Sentry title and the Bridge's own
  fingerprint.** `logServerError`/`logServerEvent` at error/critical hand
  Sentry a synthetic Error; its message was the constant "Server trace error"
  (six issues in one week, one title). It is now `ServerTrace:
  <errorCode>: <redacted summary>`, and the Sentry fingerprint is pinned to
  `['helm-server-trace', <admin_events.fingerprint>]` (tag
  `bridge_fingerprint`) so one Bridge incident is one Sentry issue and a
  varying title cannot fragment grouping. An explicit `context.fingerprint`
  still wins. Consequence: existing server-trace Sentry issues regroup once.

## UI Contract

- Admin surfaces should be dense, scannable, and operational rather than marketing-style.
- Health, errors, data freshness, and needs-attention states should be visible without hunting.
- A count that could not be read is rendered as UNREADABLE, never as zero and
  never as nothing — the Health badge follows this rule, the same as the
  Incidents badge documented in `admin_incidents`.
- The Overview answers "is anything on fire" above the fold: banner, briefing,
  severity mix, then the triage queue. Posture KPIs live in a disclosure below
  it, not above it. Each KPI carries its own source note — the provenance is
  per-tile, not a separate panel.
- Feature health renders through one component wherever it appears (Overview
  rollup, Health grid, per-app pages). Status thresholds, two-window hysteresis,
  and knownGaps annotations belong to the data layer, never to a view.
- CRM screens need clear pipeline, task, suppression, reply, sequence, and timeline states.
- Loading/error states should avoid blank admin pages; operational users need partial data when available.
- The desktop rail and mobile More sheet expose the same sign-out outcome, with
  an in-place pending state and a visible retryable error if session revocation
  fails.

## Phase 0 truth models (Bridge Premium Observability, 2026-09-03)

Six new pure modules under `src/lib/admin/incidents/`, all read models over
evidence that already exists — no new tables, no new migration. Source: the
owner's Bridge Premium Observability brief, §6/§7/§8/§9/§36/§45 (Phase 0,
"Truth and naming"). As of this entry the brief lives only in the docs-only
worktree it was written into — `sentry-max-controlplane`, under its own
`ai-system` briefs directory, filename starting `BRIDGE_PREMIUM_OBSERVABILITY_
BRIEF` and dated 2026-09-03 — not yet committed to this checkout or `main`.
Deliberately not written above as one contiguous path: it does not resolve
in this checkout yet and `docs:path-drift` treats any `docs/...`-shaped
token in a navigation doc as a claim that the file exists. Locate it fresh
(`find` under that worktree, or ask whoever committed it) rather than
trusting this description once it may have moved. None of the six modules
below render on any screen yet; Phase 1+ of that brief is where the visual
work lands.

- **`present.ts`** — `resolveIncidentPresentation`, the deterministic
  human-title resolver (brief §7). Tier order: known error code (scored by
  how much of code+action+feature it pins down, so the SAME code — e.g.
  `42501` — resolves to different titles for CoachHelm's recap-persist step
  vs round-tracking autosave) -> known operation/action -> known feature ->
  normalized message fingerprint -> generic category from `IncidentClass`.
  38 real mappings, grounded in `memory/incidents/**` and code read directly
  (not invented) — see the file header for the full evidence list. Wired
  ADDITIVELY as `IncidentBoard.presentations: Record<string,
  IncidentPresentation>` in `fetch.ts`, keyed on the board rather than added
  to `UnifiedIncident` itself, because every `incidents/__tests__/*.test.ts`
  file hand-builds full `UnifiedIncident` literals and a new required field
  there is a mechanical diff across all of them.
- **`aliases.ts`** — root-cause dedupe ABOVE `correlate.ts`, not a
  replacement for it. `correlate.ts` already performs the brief's highest
  merge tier at the raw-evidence grain (one exact
  `errorCode::route::messagePrefix` signature — why `UnifiedIncident.
  appFingerprints`/`.sentryIssueIds`/`.reliabilitySignatures` are already
  arrays). `aliases.ts` is the pass above that: given already-built
  incident-shaped facts whose raw signatures genuinely differ, decide via
  `classifyMergeConfidence` (highest: shared trace id / Flight Recorder run
  / canonical fingerprint / RPC+code+feature; medium: ALL SIX of
  feature+operation+frames+code+release+tight-window; explicit never-merge
  on message/time/source/user alone) and group via union-find
  (`groupIntoRootIncidents`) into a root incident with per-alias provenance.
- **`episodes.ts`** — `deriveEpisodes` (brief §8, last paragraph). An
  episode is opened by a REGRESSION, never pre-emptively by a resolution —
  a fix that has simply never recurred stays one episode, resolved, not
  two. When two resolutions land between the same pair of occurrences, the
  LATER one is credited as the fix a following regression actually defied.
- **`coverage.ts`** — six-source evidence coverage (brief §36: Sentry /
  Supabase / Flight Recorder / Vercel / GitHub / Jobs), wider than
  `sources.ts`'s four (`app`/`sentry`/`supabase`/`vercel`, which answers a
  board-level question). Reuses `SourceHealth` from `types.ts` rather than a
  second vocabulary; a source missing a reading is an explicit `unknown`
  cell, never a dropped row or a healthy zero.
- **`release-context.ts`** — the Runtime Identity Triplet (app SHA / DB
  migration head / AI config identity — the last derived deterministically
  from `MODEL_FOR_TASK`, `src/lib/coachhelm/v3/llm/types.ts`, the only
  versioned CoachHelm config that exists), `classifyReleaseRelationship`
  (the six release relationships, brief §9 — proximity alone is explicitly
  `NO CAUSAL SIGNAL`, never `NEW AFTER RELEASE`, and confidence for `NEW
  AFTER RELEASE` is capped below 1 regardless of how many signals
  corroborate it), and `classifyReleaseWatch` (the seven Release Watch
  states; `PROVEN HEALTHY` additionally requires full source coverage — a
  blind source past the healthy window is `UNKNOWN`, never healthy on
  silence). The DB migration head has no file-based source of truth in this
  repo — `fetchProductionMigrationHead` is a separate, deliberately
  UNTESTED fail-open reader (Management API `database/query`, same split as
  `deploy-freshness.ts`'s `fetchDeployFreshness`/`classifyDeployFreshness`).
- **`release-compare.ts`** — baseline-vs-current post-deploy comparison
  (brief §9/§28): root incidents, affected users, journey success, DB p95,
  invariant breaches, new SQLSTATEs, each with a delta and
  improved/worsened/unchanged/unknown state. DB-derived metrics (p95,
  invariant breaches, new SQLSTATEs) are forced `unknown` TOGETHER whenever
  either side's DB source was blind, even if a caller passed a raw `0` for
  one — a zero read from a blind source is not a zero. `deriveRootIncidentFacts`
  is the one adapter provided, using the identical "actionable, not
  resolved, not not-a-defect" definition `truth-strip.ts`'s Incidents cell
  already uses. Journey success, DB p95 and invariant breaches have no read
  model yet in this repo (later Phase D work) and are accepted as
  caller-supplied facts rather than fabricated ahead of the data existing.

## Known Risk Areas

- Admin actions are more likely to use broad permissions; review for service-role and RLS bypass carefully.
- CRM email/reply/suppression logic can have compliance impact.
- Rollup dashboards can appear live while backed by stale data.
- Observability code must avoid PII and secret leakage.

## Tests To Prefer

- `src/test/lib/cron/auth.test.ts`
- `src/test/api/cron/shared-auth.test.ts`
- `src/lib/admin/__tests__/schedule-bridge-write.test.ts`,
  `src/lib/admin/__tests__/observed-action-scheduling.test.ts`,
  `src/test/lib/admin/integration-health-scheduling.test.ts`,
  `src/lib/observability/__tests__/register-process-error-handlers.test.ts`
  — error-path writes are scheduled or awaited, never dropped.
- `src/lib/admin/__tests__/durable-collapse.test.ts` and the durable-collapse
  block of `src/lib/__tests__/server-error-logger-bridge.test.ts` — provider
  faults bump the open row across processes; unreadable lookups fail open.
- `src/lib/inngest/__tests__/credentials.test.ts`,
  `src/lib/inngest/__tests__/is-inngest-configured.test.ts`,
  `src/test/api/inngest-signature-diagnosis.test.ts` — a missing/malformed
  Inngest credential is a production fault named as MISSING, never as a
  mismatch, and never off production.
- `src/lib/admin/__tests__/feature-aliases.test.ts` — every alias resolves to
  a registered key; `crm` and `lifting-onboarding` deliberately do not.
- `src/lib/admin/__tests__/credential-shape.test.ts`,
  `src/test/scripts/check-helm-bridge-env.test.ts` — shape validators and the
  script run for real against eight 11-character placeholders.
- `src/app/admin/golf/tracer/__tests__/tracer-shared.test.ts` — the Tracer's
  pure grouping/rendering helpers, including `tracerIncidentGroupKey`.
- `src/lib/admin/incidents/__tests__/present.test.ts` — every human-title
  mapping, tier specificity, the generic fallback across every
  `IncidentClass`, and a safety suite proving no title/technical-signature
  field can ever echo a UUID, an email or the raw message.
- `src/lib/admin/incidents/__tests__/fetch-presentation.test.ts` — the
  board's `presentations` map agrees with a direct `resolveIncidentPresentation`
  call, incident for incident.
- `src/lib/admin/incidents/__tests__/aliases.test.ts` — every merge-confidence
  tier, the never-merge rules (including a pile-up of every forbidden signal
  at once), and grouping (direct match, transitive match via two different
  shared dimensions, never-merge fixtures staying ungrouped).
- `src/lib/admin/incidents/__tests__/episodes.test.ts` — continuing episodes,
  the brief's own regression-after-fix worked example, a three-episode
  fix/regress/fix/regress chain, and unknown-deploy-time/unknown-SHA
  regressions staying honestly unattributed.
- `src/lib/admin/incidents/__tests__/coverage.test.ts` — every health->mark
  mapping and the always-six-cells invariant.
- `src/lib/admin/incidents/__tests__/release-context.test.ts` — every
  release-relationship branch (including the proximity-is-not-causation
  case) and every Release Watch transition, including bad-news-outranks-
  elapsed-time and the blind-source-blocks-PROVEN-HEALTHY case.
- `src/lib/admin/incidents/__tests__/release-compare.test.ts` — DB-blindness
  forcing DB-derived metrics unknown TOGETHER, including the "a blind source
  with a raw 0 does not render as a real zero" case.
- Typecheck/build for admin UI changes.
- Targeted smoke/browser checks for admin dashboards when changing route-level code.

## Related Docs

- `docs/ADMIN_DASHBOARD_UPGRADE_PLAN.md`
- `docs/BI_DASHBOARD_ARCHITECTURE.md`
- `docs/OBSERVABILITY.md`
- `docs/SECURITY_AUDIT.md`
- `memory/features/admin-incidents.md`
- `memory/features/admin-reliability-collector.md`
- `memory/features/admin-selfheal.md`
- The Bridge Premium Observability brief the "Phase 0 truth models" section
  above implements — see that section for its worktree location as of
  2026-09-03; not linked here as a repo path because it does not resolve in
  this checkout yet (`docs:path-drift` would flag it).
