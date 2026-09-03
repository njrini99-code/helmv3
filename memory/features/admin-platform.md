<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
<!-- markdownlint-disable MD003 MD007 MD012 MD013 MD022 MD028 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
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
    naming") of the owner's Bridge Premium Observability brief
    (`docs/ai-system/briefs/BRIDGE_PREMIUM_OBSERVABILITY_BRIEF_2026-09-03.md`,
    landed on `main` via #1783 the same day — see the "Phase 0 truth models"
    section below), §6/§7/§8/§9/§36/§45:
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
- `src/app/admin/engineering/**` — Engineering OS hub (Bridge Premium Phase
  5, 2026-09-03): Decision Inbox (Engineering-OS-scoped — see the Phase 5
  section below for why this is deliberately NOT the general operator
  Decision Inbox), Agent Flight Recorder, Charter & verifier visibility,
  blast radius + causal confidence, repair quality. Five independently
  `PanelBoundary`-wrapped sections, each backed by its own module under
  `src/lib/admin/engineering/`.
- `src/app/admin/work-log/**` — the change-to-proof Work Log (Bridge
  Premium Phase 5). Distinct from `src/app/admin/work/**` (the existing
  PR-narrative timeline, `github-pr-timeline.ts`'s own render): this adds
  the release-shipped-in and post-deploy-proof join over the SAME entries.
    `release-compare.ts` (baseline-vs-current post-deploy comparison).
  - `genome.ts` and `release-watch.ts`, added 2026-09-03 as Phase 1
    ("Incidents + release tracking") of the same brief, §45 — the adapters
    that wire the six Phase 0 modules above to a live `UnifiedIncident`
    board and to `release-ledger.ts`'s existing deploy history. See the
    "Phase 1 wiring" section below for what each honestly can and cannot
    answer today.
- `src/app/golf/admin/**`
- `src/app/golf/admin/crm/**`
- `src/app/api/cron/reliability-triage/**` — the 3-hourly collector behind the
  `/admin/reliability` tab. Its core is `src/lib/reliability/**`.
- `src/app/admin/database/**` — the zero-cost Supabase/Postgres observability
  view (Phase 1, 2026-09-03). Distinct from `/admin/reliability`, which
  correlates APPLICATION-level Sentry/Supabase/Vercel signals every 3 hours;
  this tab is the DATABASE's own state — connections, deduped Supabase/
  PostgREST failures grouped by fingerprint, `pg_stat_statements`
  delta/regression detection — read from `helm_debug` every 5-15 minutes via
  `src/lib/admin/database/{overview,errors,performance}.ts`. Its data source
  (`src/lib/observability/supabase/**`, four new `helm_debug` tables) is
  **HELD, not applied to production** — see `supabase/migrations/HELD.md` —
  so every fetcher currently renders "not shipped yet"
  (`status: 'unconfigured'`), not a false failure state.
- `src/app/api/cron/db-health-sampler/**`, `db-stat-delta/**`,
  `db-observability-prune/**` — the three Vercel-cron collectors behind
  `/admin/database` (5m / 15m / daily). Degrade cleanly on the HELD-migration
  "not found" error shape, same pattern as `helm-debug-prune/route.ts`.
- `src/app/api/cron/selfheal-triage/**` — the self-healing loop's Diagnose
  stage, moved here from an Anthropic-hosted cloud routine (2026-09-02). Its
  collection/apply core is `src/lib/admin/triage-collect.ts` /
  `triage-apply.ts` (shared with the `npm run triage` CLI,
  `scripts/run-triage.ts`, which is now a thin wrapper over both) and its
  analyzer core is `src/lib/admin/rca-run.ts` (shared with the super-admin
  `analyzeErrorFingerprint` server action). See
  `docs/ai-system/selfheal/README.md`.
- `src/app/admin/lenses/{golf,baseball,lifting,teams,users,users/[id]}` and
  `src/lib/admin/lenses/**` — Bridge Premium Phase 4 (app/customer lenses,
  2026-09-03). See the "Phase 4 lenses" section below.
- `src/app/admin/releases/**` — the feature-flag/kill-switch governance
  board (added 2026-09-03, Phase F.4.2). Reads
  `src/lib/admin/data/feature-flags.ts`, which reads the typed constant
  `src/lib/flags/registry.generated.ts` (compiled from `config/feature-
  flags.yml` by `npm run flags:generate`). No business logic of its own.
  Full governance contract — schema, the NEVER-GATE list, the `npm run
  flags:check` CI gate, how to add/expire a flag — lives in
  `docs/ai-system/FEATURE_FLAGS.md`, not duplicated here.

### Components

- `src/app/admin/_components/**` (Helm Bridge shell and controls)
- `src/components/admin/premium/**` — Bridge Premium's shared visual
  vocabulary (added 2026-09-03, brief Phase 1 §4/§13/§36): `PosturePill`,
  `EvidenceSourceChips`/`SourceConfidenceRing`, `ReleaseRelationshipLabel`,
  `ConfidenceMeter`, `EpisodeTimelineStrip`, `UnknownValue`/`UnknownInline`,
  and `EvidenceInspector` (the shared Fairway `Sheet`, typed against a narrow
  `EvidenceInspectorData` rather than a raw `UnifiedIncident` so a later
  phase can open it for a release/feature/journey/trace too). Every later
  Bridge Premium phase should import these rather than re-implementing.
- `src/app/golf/admin/crm/components/**`
- `src/components/admin/lenses/**` — Phase 4 lens dominant visuals
  (`JourneyFlow`, `UserJourneyRibbon`, `TeamEkgRow`, `AdoptionMapPanel`,
  `ActivityThreadsPanel`). Local/minimal — see the "Phase 4 lenses" section
  below for why.

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
- `src/lib/observability/supabase/**` — the zero-cost Supabase observability
  layer (Phase 1): `envelope.ts` (canonical error shape, code-first
  fingerprint), `classify.ts` (SQLSTATE/PostgREST classifier), `observe-
  result.ts` (`observeSupabaseResult()` — the call a server call site adds
  around a `{data,error}` result), `record-db-error.ts` (fail-open
  out-of-band durable writer), `integrity.ts` (the HTTP-200-with-error
  primitive), `db-health-delta.ts` / `query-regression.ts` (pure delta and
  regression-detection arithmetic the two health/stat collectors call). See
  `docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md`.
- `src/lib/admin/database/**` — the `/admin/database` read models.
- `src/lib/admin/**` — the remainder not carved into a sub-capability above
  (deploy-freshness, integration-health, sentry-api, vercel-api,
  feature-registry, error-trend, severity, credential-shape, and the rest).
  Overlaps by design with the sub-capabilities' narrower globs on their own
  carved files — see the registry comment on this glob.
- `scripts/janitor/**` — the Phase K.4.5 (Engineering OS Intelligence) Janitor
  entropy-report generator. Read-only: it never modifies source files, only
  writes `JANITOR_REPORT.md` (written under the generated-docs directory, gitignored) and
  `janitor-findings.json` (same directory, gitignored). Scans the entropy classes
  (duplicate helpers, dead flags, stale docs, orphan routes, deprecated
  APIs, stale TODOs, oversized modules, unused tests, mock inflation,
  duplicate telemetry, missing feature mappings, abandoned experiments)
  using only signals this repo already produces — `.duplicate-exports-baseline.json`,
  `.doc-path-baseline.json`, `scripts/find-orphan-mounts.mjs`,
  `memory/registry.yml` (via `scripts/knowledge/lib/registry.mjs`),
  `git ls-files`/`git grep`/`git log` — never a filesystem walk. Every
  classifier returns one of three verdicts, `FINDINGS` /
  `ZERO_FINDINGS_VERIFIED` / `NO_SIGNAL` (`scripts/janitor/lib/verdicts.mjs`);
  `NO_SIGNAL` means the substrate a class needs does not exist yet (no
  feature-flag module, no committed Knip report) and is never conflated with
  a genuine zero-findings pass. Findings are written in
  `config/control-plane-gaps.json`'s `id`/`owner`/`opened`/`scope`/`reason`/
  `closes_when` field shape but to a SEPARATE file — never into that file
  itself, which records human-approved "won't fix" decisions
  ("Adding one is a decision, not a repair" — its own `$comment`). `npm run
  janitor` regenerates both output files; a weekly CircleCI job
  (`.circleci/config.yml`'s `janitor` job) runs it as an advisory artifact.
  `npm run test:janitor` (`node --test scripts/janitor/__tests__/*.test.mjs`)
  covers every classifier against real disposable git-repo fixtures.

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
  every status-based filter would have missed.
- **As of 2026-09-02, `recordJobRun` also drives a Sentry Cron Monitor
  check-in — a SEPARATE signal from `background_job_logs`/the Jobs board,
  not a replacement for it.** `startCronCheckIn`/`finishCronCheckIn`
  (`src/lib/observability/cron-monitors.ts`) wrap all 3 exit paths (success,
  a resolved >=400 Response, a thrown error), keyed by a monitor slug
  resolved from `CRON_REGISTRY` (`api-cron-<dashed-path>`, or
  `job-<jobType>` for anything unregistered). This is Sentry's OWN Cron
  Monitors feature (an external "did this heartbeat arrive on schedule"
  alert), independent of the Jobs board's own overdue/failed
  classification (`classifyCronStatus`) — the two can disagree (Sentry
  alerts on a missed check-in before the Jobs board's own 1.5x-cadence
  threshold would mark a row overdue), and that is intentional redundancy,
  not a bug to reconcile. `automaticVercelMonitors` in
  `src/lib/sentry-build-options.mjs` is deliberately `false` so this
  manual, per-job check-in stays the SINGLE Cron Monitor mechanism — the
  installed SDK's own build-time source shows the auto option would
  build-time-inject a second, independent monitor per Vercel cron path,
  duplicating this. Fail-open throughout: a Sentry outage never blocks or
  fails a cron. Full job table, monitor slug conventions, and the
  `automaticVercelMonitors:false` decision record live in
  `docs/observability/SENTRY_CRON_MONITORS.md`. The Inngest durable-function
  path (`withBridgeLogging`, `src/lib/inngest/functions.ts`) and the
  launchd Repair script (`scripts/run-selfheal-repair.mjs` via
  `scripts/lib/sentry-cron-checkin.mjs`, which cannot import TS/`@/`-aliased
  modules) get the same check-in treatment through their own call sites,
  not through `recordJobRun`.
- **Only a TOTALLY blind reliability run returns 503; a partially blind one
  returns 200.** `recordJobRun` does more than write a job row on a >=400 — it
  also calls `logServerEvent(..., 'error')`, which writes an `admin_events` row.
  Failing the run whenever ANY arm was blind therefore produced eight error rows
  a day, indefinitely, into `/admin/errors`, the incident feed and the nav error
  badge. A degraded run is already reported honestly twice — the snapshot row
  carries `status='failed'` and the tab renders a danger band naming each blind
  source — so a red Jobs board is not worth polluting the triage queue for.
  These behaviours are coupled with the self-feed filter: a failed run's
  `admin_events` row is titled `Cron failed: reliability-triage`, which is
  exactly what `collectSupabase` excludes. Do not change one without the other.
- **Evidence references carry their source; they are never paired by index.**
  A `CorrelatedSignal`'s `sources[]` and its evidence list dedupe on different
  keys, so their indices do not correspond — one source contributing two refs
  shifts every later index and misattributes the rest. Evidence is
  `Array<{source, ref}>` for that reason, and `evidenceTarget` needs the source
  to decide whether a ref is a Sentry permalink, a Bridge drill-through, or
  opaque text.
- **Error resolution belongs to the FINGERPRINT, not the row.**
  `public.admin_error_resolutions` (applied 2026-08-27) records what fixed a
  fault: PR, merge SHA, who decided (`auto` cron vs `manual` operator), and
  whether it has regressed. `admin_events.resolved` stays per-row and is not a
  substitute — with it alone, a fixed fault's next occurrence is a new
  unresolved row, indistinguishable from a regression.
- **An archived fault must come back if it recurs.** "Never show it again" is
  correct only until the fault returns after its fix shipped; that is a
  REGRESSION and the most valuable signal this system produces. Nothing is
  deleted and archiving is a read-time join, so dropping the table makes every
  incident reappear — the correct failure direction for a feature whose job is
  hiding things. `reopened_count` survives a re-resolve, so "fixed three times
  already" cannot be laundered.
- **A regression whose analysis already says NOT A DEFECT is expected
  recurrence, not a regression.** `deriveLifecycle` rule 1
  (`src/lib/admin/incidents/lifecycle.ts`) checks `analysis?.category ===
  'not-a-defect'` before returning `'regressed'` — the analysis already
  explained why this fingerprint fires (e.g. an access denial that is
  SUPPOSED to keep happening), so its recurrence is not new information and
  must not re-alarm an operator with the single loudest signal this system
  produces. Lands in the dedicated `'expected-recurrence'` lifecycle state
  (`INCIDENT_LIFECYCLE_STATES`) instead — distinct from the pre-existing
  `'not-a-defect'` state, which is the classifier's verdict (`!actionable`)
  and never had a resolution to regress from in the first place; keeping
  them separate lets a lens count "this specifically recurred after being
  fixed" apart from "this was never a defect". Neutral tone, not danger; not
  in `NEEDS_ATTENTION_STATES` (so the REGRESSION-specific alarm is gone);
  treated as `offLoop('done', …)` by `selfheal-flow.ts`, same as
  `not-a-defect`; excluded from the `actionable` lens and the Truth Strip's
  `actionable` count, same as `not-a-defect`. The `regressions` lens
  (`incident.lifecycle.state === 'regressed'`) needed no change — the state
  itself no longer produces `'regressed'` for these, so the exclusion is
  automatic — and a new `expected-recurrence` lens counts them apart.
  **It IS still in `attention.ts`'s `UNRESOLVED_STATES`**, deliberately unlike
  `not-a-defect` — an LLM-authored "NOT A DEFECT" `suggestedFix` string must
  never be able to silence a CRITICAL, still-unresolved fault outright; only
  the specific "this is a regression" alarm it was wrong about is what goes
  quiet. Rule 2 (critical) still fires for one, same as any other open state.
- **Auto-resolution requires a production DEPLOY after the last occurrence, not
  merely silence.** A nightly cron is silent 23 hours a day and a seasonal
  feature for months. When the deploy timestamp is unreadable, nothing is
  auto-resolved and the plan states why. The cron's inference never overwrites
  an operator's `manual` resolution.
- **`shipStatus` has three outcomes, not two.** `unknown` exists because Vercel
  can be unreachable; rendering that as `pending` tells an operator their fix
  has not shipped when the truth is that we could not find out.
- **A discarded rejection reason is an invisible outage.** `Promise.allSettled`
  callers must capture WHY a task rejected, not just count it — the reason is
  the only thing that answers "what is wrong". See
  INC-2026-08-27: a counter-only handler let a cron fail for two days while
  `background_job_logs` recorded 72 consecutive `completed` runs. Reasons
  written into a cron response must be SCALARS: `recordJobRun`'s
  `extractOutcomeMetadata` keeps only top-level scalars and silently drops
  arrays.
- **A source that could not be read is never reported as zero problems.** The
  reliability collector's arms each return `{status, reason, signals}`, and the
  run's status is the WORST arm — so a run whose Sentry token is missing writes
  `status='failed'` and the Bridge renders a danger band, not a green tick. An
  arm that returned `[]` on failure would be indistinguishable from a healthy
  arm finding nothing, which inverts the meaning of the entire tab. This is the
  OS contract's "never error→[]" rule; `worstStatus` is the single function
  enforcing it and it is covered red/green.
- **The reliability collector must never read its own emissions.** It is a cron
  that reads the table crons write failures to, so without exclusions one failed
  run becomes a signal, becomes a triage item, becomes another error row — a
  loop that manufactures work from its own failure. `collectSupabase` filters
  out `event_type='rca_analysis'` AND any row naming `reliability-triage`. This
  is the same shape as the `rca_analysis` bug above, which is why the fix is the
  same fix; do not remove either filter.
- **Cross-source correlation drops severity from the key, and must.**
  `buildIncidentSignature` folds severity INTO its key
  (`severity::errorCode::route::messagePrefix`), which is right for its original
  callers — they group rows arriving from one source through one writer. It is
  wrong across sources: Sentry rates as `error` plenty of conditions this app
  logs to `admin_events` as `warning`, so the severity-bearing key splits one
  root cause into two entries and the "confirmed by N sources" badge never
  fires. `correlationSignature` in `src/lib/reliability/normalize.ts` therefore
  calls the same function with a FIXED severity and lets `pickWorseSeverity`
  carry severity across the fold instead.
  Be precise about what this shares with the other views, because the looser
  claim rots: the reliability tab reuses the **normalisation** — and therefore
  the notion of what counts as the same failure — but its signature value is
  **not** equal to the row's stored `admin_events.fingerprint`, which was
  computed with that row's real severity. Within the Supabase arm, rows are
  still pre-grouped on the stored fingerprint before correlation runs.
- **One incident model, derived at read time, never stored.**
  `src/lib/admin/incidents/` folds the app fingerprint bucket, the Sentry
  issue, the reliability `CorrelatedSignal` and the `rca_analysis` row into a
  single `UnifiedIncident`. It is a READ MODEL: there is no `admin_incidents`
  table and no persisted `lifecycleState`, because lifecycle and proof are
  functions of evidence that changes underneath them (a PR merges, production
  rolls forward, a fault recurs) and a stored string would outrank live
  evidence. The layering is `existing readers -> correlate -> lifecycle+proof
  -> UnifiedIncident[]`; every derivation is a pure function unit-tested with
  no I/O. If persistence is ever added, persist durable EVENTS, never the
  derived state.
- **An incident's id is the key that was already stored under it.** In
  priority order: an `admin_events` fingerprint, then `rel:<signature>`, then
  `sentry:<issueId>`. That order is not cosmetic — `rca_analysis` rows,
  `/admin/errors/<id>` links and repair PR bodies all address exactly these
  strings, so a synthetic key would break every artefact the self-healing loop
  has already written. `fetchIncidentById` also matches on any fingerprint an
  incident folded, so links written before correlation still resolve.
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
evidence that already exists — no new tables, no new migration. Source:
`docs/ai-system/briefs/BRIDGE_PREMIUM_OBSERVABILITY_BRIEF_2026-09-03.md`
(landed on `main` via #1783, 2026-09-03), §6/§7/§8/§9/§36/§45 (Phase 0,
"Truth and naming"). (This section previously said the brief lived only in
a docs-only worktree and had not been committed to `main` — true for a few
hours on 2026-09-03, no longer true once #1783 merged; corrected the same
day by the Phase 1 entry below, which is what actually wired these six
modules into a screen.)

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

## Phase 5 Engineering OS (Bridge Premium Observability, 2026-09-03)

Six new modules under `src/lib/admin/agent-runs/` and
`src/lib/admin/engineering/`, plus the two routes documented above. Source:
the owner's Bridge Premium Observability brief §29-40/§45 (Phase 5) and
`memory/decisions/ADR-2026-09-03-control-plane-owner-decisions.md`'s
`AGENT_FLIGHT_RECORDER_STORAGE` row.

- **Agent Flight Recorder** (`src/lib/admin/agent-runs/`) — one HELD
  migration (`supabase/migrations/20260903150000_helm_debug_agent_runs.sql`,
  registered in `HELD.md`, awaiting `db-migration-reviewer` review and
  owner apply) adds `helm_debug.agent_runs` — one table, not the golf
  round Flight Recorder's run+steps pair, because an agent run has no
  fixed enumerable step schema — plus three service-role-only facades on
  the golf Flight Recorder's exact pattern. `record.ts` is a fail-open
  server-only writer (sanitizes/truncates before write, never throws);
  `fetch.ts` reports the migration's current absence as `unconfigured`,
  matching the established convention for a not-yet-applied `helm_debug_*`
  RPC (`src/lib/admin/data/player-detail.ts`'s flight-trace section,
  `traces/page.tsx`'s `loadTraces()`).
- **Decision Inbox — Engineering OS scoped**
  (`src/lib/admin/engineering/{held-migrations,decision-inbox}.ts`).
  Deliberately NOT a second general Decision Inbox — the control-plane
  implementation plan (§J.4.5) is explicit that the real one is
  `src/lib/admin/incidents/attention.ts`'s `selectAttention`, rendered on
  the Bridge home page's `AttentionQueue`. This module's sources are
  disjoint by construction (HELD migration rows parsed from `HELD.md`,
  Janitor findings from the Janitor's machine-readable findings file under
  `docs/generated` — absent in a fresh checkout; it is generated on
  demand by `npm run janitor`, never committed)
  — neither is `UnifiedIncident` or `SelfHealStageDetail`, the data
  `selectAttention` already derives from. Field names mirror `AttentionRow`'s (`key`,
  `reason`, `state`, `headline`, `why`, `ageMs`, `href`, `tone`) so a human
  merging this into `attention.ts` later (new `AttentionReason` variants
  per §J.4.5) can do so mechanically instead of redesigning the shape.
- **Charter & verifier visibility** (`src/lib/admin/engineering/charter.ts`)
  — three independent reads: mutation gate config
  (`config/mutation-gate.json` — the report itself,
  `reports/mutation/mutation.json`, only exists on the weekly
  `stryker-coachhelm` CircleCI container, never in a checkout), resolved
  contracts per feature (`docs/generated/contracts/*.json`, committed —
  three exist as of this entry: `admin_platform`, `coachhelm_ai`,
  `golf_round_lifecycle`), and Janitor's ranked findings (its
  machine-readable findings file under `docs/generated`, NOT committed —
  regenerate with `npm run janitor`). One missing artifact never blanks
  the other two.
- **Blast radius + causal confidence**
  (`src/lib/admin/engineering/blast-radius.ts`). `computeBlastRadius` is a
  bounded 1-2 hop breadth-first walk over the Helm World Model graph
  (`docs/generated/WORLD_MODEL.json`, produced by `scripts/knowledge/
  world-model.mjs`) — a lightweight CONSUMER of that already-materialized
  graph, not a reimplementation of the World Model generator's own
  `--impact` engine (registry parsing, critical-feature scoring, journey
  attribution stay exactly where they live). Both landed on `main` via
  PR #1785 (2026-09-03) — `fetchBlastRadius` still reports `unconfigured`
  if the file is ever absent/unreadable, and is served in production via a
  dedicated `outputFileTracingIncludes` entry in `next.config.mjs` (Next's
  build-time file tracer cannot see a dynamic `readFile` path on its own —
  see the PR #1790 review fixes note below) plus a module-level parse cache
  keyed by the file's `mtimeMs`, so a `force-dynamic` page polled by
  `AutoRefresh` does not re-parse a multi-MB graph on every request.
  `formatCausalConfidenceLadder` is pure formatting only, over
  `release-context.ts`'s existing `classifyReleaseRelationship` verdict
  (Phase 0, above) — deliberately no second causal-confidence engine. The
  `/admin/engineering` page does not call it yet (no live incident is
  selected on that page to run it against) — it renders once wired to a
  real per-incident view (Phase 1).
- **Work Log proof + repair quality**
  (`src/lib/admin/engineering/work-log.ts`). `buildWorkLogProof` composes
  `fetchWorkLog()` (GitHub PRs) and `fetchReleaseLedger()` (Vercel deploys
  + error deltas) — both pre-existing, no new network calls — by time-
  bucketing each merged PR against the earliest known deploy at or after
  its merge time (`shippedInRelease`; `notYetDeployed: true` when merged
  after every known deploy). Two scope limits worth restating for anyone
  extending this: "which gates proved it" is the PR's own self-reported
  `repairVerdict` (confirmed/corrected/not-reviewed) plus the CURRENT gate
  posture from the Charter panel, never live per-PR CI check-run data (a
  new network call this deliverable was not authorized to add); "did the
  fix stay fixed" (`buildRepairQuality`'s `stayedFixed`) is the RELEASE-
  level verdict tone the release ledger already computes
  (`ReleaseCardData.verdict`), not per-fingerprint episode tracking (a
  Phase 1 concept — `episodes.ts` above — this file has no access path
  to without a second incident-fetching pipeline).

### PR #1790 review fixes (2026-09-03)

Three runtime defects found in review, after main (including PR #1785's
World Model) was merged into the branch:

1. `fetch.ts`'s `isUnappliedMigrationError` recognized only `42883`/`42P01`
   or a "does not exist" message — but while the migration is HELD,
   PostgREST answers the unknown RPC with `PGRST202` ("Could not find the
   function … in the schema cache"), a shape that classifier never
   matched. Every `AutoRefresh` poll on `/admin/engineering` therefore
   returned `failed(...)` and rendered a red `role="alert"` panel instead
   of the not-yet-live `PanelNoData` state. Fixed to match
   `src/app/api/cron/helm-debug-prune/route.ts`'s
   `isMigrationNotAppliedError` exactly (same four codes: `PGRST202`,
   `42883`, `42P01`, `3F000`; same message fallbacks).
2. `blast-radius.ts`, `charter.ts` and `decision-inbox.ts` all
   `readFile(join(process.cwd(), 'docs/...'))` at request time, but
   `.vercelignore` excluded all of `docs/` from the Vercel upload and
   `next.config.mjs` carried no `outputFileTracingIncludes` — so even once
   the underlying artifacts existed, a production build's file tracer
   would never have carried them into the serverless function bundle
   (being uploaded and being traced into the bundle are two separate
   gates; this repo was missing the second one for a dynamic `readFile`
   call, which the tracer's static import-graph analysis cannot see).
   Fixed: `.vercelignore` carves out `docs/generated/WORLD_MODEL.json`,
   `docs/generated/contracts/` and the Janitor's machine-readable findings
   file (also under `docs/generated`, not committed by design)
   from the `docs/` exclusion; `next.config.mjs` adds a matching
   `outputFileTracingIncludes` entry for `/admin/engineering` covering
   those three plus `supabase/migrations/HELD.md` and
   `config/mutation-gate.json`. `blast-radius.ts` additionally gained a
   module-level parse cache for `WORLD_MODEL.json`, keyed by the file's
   `mtimeMs`, so a `force-dynamic` page polled every 60s does not
   re-`JSON.parse` a multi-MB graph on every request.
3. `record.ts`'s `buildAgentRunPayload` spread `sanitizeMetadata(input.
   metadata)` LAST, so a caller-supplied metadata key sharing a structured
   column's name (e.g. `{ metadata: { confidence: 1 } }`) silently
   overwrote the clamped/capped value — defeating the 0.95 confidence cap
   and every other clamp in one move. `sanitizeMetadata` was also
   top-level-only: a nested object or array passed through completely
   unbounded, since neither `helm_private.agent_run_safe_payload`'s
   strip-list (also top-level-only) nor `clampString`'s per-string cap
   reaches inside a nested structure. Fixed: metadata now spreads FIRST
   (structured fields win); sanitization is recursive with four
   independent bounds threaded through every nesting level (max depth 4,
   max 40 keys per object level, the existing 600-char per-string cap, and
   a shared 32,000-byte total-size budget across the whole subtree); the
   RPC call is raced against a 1500ms timeout
   (`RECORD_AGENT_RUN_TIMEOUT_MS`, matching `helm-flight-recorder.ts`'s
   `PERSIST_START_TIMEOUT_MS` pattern) so a hung write can no longer block
   the self-heal loop that calls this mid-run — on timeout the underlying
   promise keeps running in the background (no true JS cancellation) and
   `onFailure` is told instead of the caller hanging.

Non-blocking items also addressed: two "SECURITY DEFINER" prose mentions in
the migration reworded to "security-definer" (the semgrep trap is on the
literal two-word uppercase SQL-keyword phrase in a comment, not the SQL
statement itself); stale "does not exist on `main`"/"PR #1785 …  open"
copy updated now that #1785 merged; the illustrative causal-confidence
example (a fabricated release SHA and confidence number, `8e4c5b7d`/86%,
rendered unconditionally on a production surface) removed from
`/admin/engineering` in favor of a plain-text explanation with no invented
numbers, since this page has no live incident selected to run the
formatter against yet; `AgentRunRecord.finishedAt` is now actually sent in
the RPC payload (the migration's own `helm_debug_record_agent_run` still
computes the DB column's `finished_at` from the status transition itself,
by design — a caller cannot claim an arbitrary finish time — but the
caller-supplied value at least reaches the row's `metadata` blob now
instead of being silently dropped by `buildAgentRunPayload`).
## Phase 1 wiring — incident cards, Incident Genome, Release Watch, Evidence Inspector (2026-09-03)

The six Phase 0 modules above were pure and unwired until this entry. Two
new adapter modules under `src/lib/admin/incidents/` connect them to a live
board, and `/admin/errors` + `/admin/errors/[fingerprint]` render the
result. Brief §14/§9/§12/§13/§45 (Phase 1).

- **`genome.ts`** — `buildIncidentEvidenceCoverage` (maps `UnifiedIncident.
  sources`'s three sources — `sentry`/`supabase`/`vercel` — onto three of
  `coverage.ts`'s six cells, plus a GitHub reading inferred from a real
  `IncidentRepair`; `flight-recorder` and `jobs` always read `unknown` —
  no per-incident signal exists for either anywhere in this codebase),
  `buildIncidentEpisodes` (adapts `episodes.ts` to the only two occurrence
  timestamps and one current resolution `UnifiedIncident` actually carries
  — can reconstruct at most ONE regression boundary, and flags
  `timelineIncomplete` whenever `resolution.reopenedCount` says the fault
  has come back more times than that; never fabricates additional episode
  boundaries), and `buildBoardAliasGroups`/`buildIncidentGenome` (runs
  `aliases.ts`'s second pass over a board using only `id`/`errorCode`/
  `featureId`/`actionName`/`firstSeen` — no trace ids or normalized frames
  exist on `UnifiedIncident` yet, so in practice only the classifier's
  `highest` tier — same RPC+code+feature — or `medium` tier can ever fire;
  a standalone incident renders as an honest size-one group, not hidden).
- **`release-watch.ts`** — wires `release-context.ts`'s
  `classifyReleaseRelationship`/`classifyReleaseWatch` and
  `release-compare.ts`'s `buildReleaseComparison` onto
  `release-ledger.ts`'s ALREADY-EXISTING deploy history
  (`fetchReleaseLedger`), rather than re-deriving deploy data — a second
  Vercel/deploy reader would be the second authority `types.ts`'s own
  header warns against. `classifyIncidentReleaseRelationship` (pure,
  tested) uses only `firstSeen` vs. deploy time and the incident's own
  lifecycle-derived occurrence trend — EVERY `ReleaseRelationshipEvidence`
  corroboration field (feature-delta, code-in-trace-changed, cohort
  signals, replay reproduction) is passed `null`, never guessed. Corrected
  2026-09-03 (PR #1789 second review): this used to say the feature's
  `topFeatureDeltas` worsening delta was "the one real corroborating
  signal this codebase has" and was wired as `featureChangedInRelease`.
  That was circular — a new incident's own first occurrences are what move
  its own feature's delta positive, so it was proximity measuring itself,
  not independent evidence — and has been removed; see `release-watch.ts`'s
  `classifyIncidentReleaseRelationship` header for the full account. A
  proximity-only incident now correctly resolves to `'no-causal-signal'`.
  `fetchCurrentReleaseWatch` (I/O, untested per the `fetchDeployFreshness`
  convention) always passes `dbSourceBlind: true` into
  `buildReleaseComparison` — journey success rate, DB p95 and invariant
  breaches have no read model in this repo yet (release-compare.ts's own
  header: "later Phase D work"), so those three render as unknown, never a
  fabricated zero.
- **UI**: `UnifiedIncidentCard` gained three optional props
  (`presentation`, `genome`, `releaseRelationship`) — additive, so a caller
  that does not pass them renders exactly as before. The row title now
  prefers the Phase 0 human title over `incident.description`, a
  muted-mono technical signature line renders beneath it, a release
  relationship label renders whenever a Release Watch was computed
  (`undefined` = omitted entirely, `null` = computed-but-unanswerable,
  rendered hatched — the two are visually and semantically distinct), and
  an episode timeline strip renders only when an incident has actually
  regressed (`episodes.length > 1`). `/admin/errors/page.tsx` computes
  `board.presentations` (already existed, previously unconsumed),
  `buildBoardAliasGroups`/`buildIncidentGenome` per rendered row, and
  `fetchCurrentReleaseWatch` once per page load, and renders a new
  `ReleaseWatchPanel` (Runtime Identity Triplet, new/regressed fingerprint
  counts, baseline comparison) above the queue.
  `/admin/errors/[fingerprint]/page.tsx` renders the Phase 0 title as an
  `<h2>` (the page's `<h1>` stays the raw fingerprint — the stable
  identifier every RCA row and repair artefact actually keys on) plus a
  new `IncidentGenomePanel` (occurrence timeline, root-cause alias group
  with each member's merge tier and reason, attached evidence-source
  chips) between the lifecycle explanation and the evidence wall.
- **Shared vocabulary**: `src/components/admin/premium/**` — see the
  "Components" section above for the full list. `EvidenceInspector` IS
  wired: `UnifiedIncidentQueue.tsx` owns one shared instance (matching
  `FeatureDrawer.tsx`'s established pattern rather than mounting one per
  row), and `UnifiedIncidentCard.tsx` builds its `EvidenceInspectorData`
  and opens it via an `onInspect` callback (an "Inspect" button in the
  card's footer). Corrected 2026-09-03 (PR #1789 review) — this entry
  previously said the opposite, stale from before that wiring landed.
## Phase 4 lenses (Bridge Premium Observability, 2026-09-03)

Seven new pure read models under `src/lib/admin/lenses/`, five small
Fairway-token components under `src/components/admin/lenses/`, and six pages
under `src/app/admin/lenses/**`, all registered in `ADMIN_NAV` under
Platform. Source: the owner's Bridge Premium Observability brief §20-27
(App and customer lenses) — `docs/ai-system/briefs/
BRIDGE_PREMIUM_OBSERVABILITY_BRIEF_2026-09-03.md`, which DOES resolve in
this checkout (on `main`), unlike the Phase 0 brief referenced above.

**Reuse over rebuild** — before writing anything new, this phase's read
models were checked against what already ships: `/admin/teams` already has a
30-day Team EKG (`src/lib/admin/data/pulse-grid.ts` + the `EkgSparkline`
component); `/admin/utilization` already has a feature × time adoption grid
(`feature-adoption.ts` + `AdoptionHeatGrid`); `/admin/thread/[entity]/[id]`
already renders a full per-user/per-team event timeline
(`entity-thread.ts`). None of these were duplicated — `teams-ekg.ts` and
`adoption-map.ts` WRAP the existing functions and add only the columns the
brief names that the existing surfaces don't carry (release impact,
unresolved-incident count, team/role grouping); `activity-threads.ts` links
out to the existing thread page rather than re-deriving its timeline.
`/admin/lenses/{golf,baseball,lifting,teams,users}` are net-new ROUTES
(the brief's §20-27 language, "Journey River" / "Program Execution Flow" /
"EKG Grid" / "Journey Ribbon", describes single-dominant-visual pages that
did not exist as such) that sit ALONGSIDE `/admin/{golf,baseball,lifting,
teams,users}` — the older pages were not edited or retired. That overlap is
disclosed, not resolved, here: whether to retire/merge the pairs is an
owner call outside this phase's scope.

**The central constraint every module here is built around**: `admin_events`
cannot produce a usage funnel. `withAdminObserved`
(`src/lib/admin/observed-action.ts`) only ever writes on a thrown error or a
soft-failure envelope — there is no success-side event for most actions.
The only genuine positive-signal writers are `logLogin` / `logSignup` /
`logRoundSubmitted` / `logAIGeneration` in `src/lib/admin-logger.ts`,
confirmed wired at real call sites. Every "attempts/completions" number in
this phase therefore comes from a DURABLE domain table
(`golf_rounds.status`, `helm_lifting_sessions.status`,
`baseball_players.onboarding_completed`, `helm_lifting_program_assignments.
status`, etc.) or is left `null` — never inferred by counting admin_events
rows, which would silently invert the signal (more failures reading as more
usage). Every numeric field across all seven modules is `number | null`;
`null` means unreadable, distinct from a real zero, per `team-grade.ts`'s
`TeamGrade` precedent.

- **`golf-journey.ts`** — the Golf Journey River (Login → Dashboard → Start
  round → Autosave → Resume → Submit → Stats → Coach visibility), mapped
  onto `memory/journeys/golden-paths.yml`'s golf journeys
  (`player_login_hub`, `player_start_round`, `player_resume_round`,
  `player_submit_round`, `coach_view_player_stats`,
  `coach_view_coachhelm_insight`) and their `feature_id`s' registry feature
  keys. Autosave/Resume have no dedicated golden-paths stage — approximated
  from `golf_rounds.updated_at > created_at`, disclosed via
  `SignalConfidence: 'durable_unproven'`.
- **`baseball-journey.ts`** — brief-derived (roster/onboarding, practice
  planning, player development, stats/import, communications); every stage
  carries `confidence: 'brief_derived'` because no golden-paths.yml citation
  exists for baseball yet, and this module does NOT edit that file to
  invent one (its own header forbids it). Feature-key clustering is a
  judgment call over `baseball_core`'s 49 `observability.feature_keys`.
- **`lifting-flow.ts`** — Program assigned → Session opened → Readiness →
  Sets logged → Completed → Progress updated. The one lens with a fully
  durable funnel end to end (`helm_lifting_program_assignments` →
  `helm_lifting_sessions` → `helm_lifting_set_results`/`helm_lifting_maxes`/
  `helm_lifting_prs`), cross-sport by design.
- **`teams-ekg.ts`** — wraps `fetchPulseGrid()` + `fetchReleaseLedger()`;
  adds `releaseImpact` (error/critical events for the team since the live
  release) and `unresolvedIncidents` per team, both bulk-queried (one query
  across all teams, never per-team).
- **`user-ribbon.ts`** — wraps `fetchUserDetail()`. PII-FREE return type by
  contract: no email, no name, only the caller-supplied subject id (already
  opaque) — a caller wanting to display identity does so from its own
  directory call at the page level, never by reading it out of the ribbon.
- **`adoption-map.ts`** — wraps `fetchFeatureAdoption()` (team via its
  existing `teamId`/`teamLabel` per user) + `fetchUsersTab()` (role, capped
  at 500 users ordered by last-seen — a user outside that cap shows
  `unknown` role, disclosed via `roleCoverageNote`, not silently wrong).
- **`activity-threads.ts`** — semantic per-TEAM sentences built entirely
  from `teams-ekg.ts`'s already-fetched 30-day buckets (zero new
  admin_events queries). Deliberately NOT a per-round narrative like the
  brief's own example ("3 autosaves · 1 retry · final submit successful") —
  that would require inventing counts admin_events cannot prove (no
  indexed per-round join exists; `roundId` lives in an unindexed jsonb
  column). Each thread links to the existing `/admin/thread/team/<id>`.

Pages: `/admin/lenses/{golf,baseball,lifting}` render `JourneyFlow` as the
one dominant visual plus incidents/team-impact/recent-changes support
panels. `/admin/lenses/teams` renders the Team EKG list (`TeamEkgRow`,
wrapping the shipped `EkgSparkline`) plus `ActivityThreadsPanel` and
`AdoptionMapPanel`. `/admin/lenses/users` is a table-first directory
(reusing `fetchUsersTab`) drilling into `/admin/lenses/users/[id]`'s
`UserJourneyRibbon`. All six call `requireSuperAdmin()` first, per the gate
contract `src/app/admin/__tests__/admin-gate-coverage.test.ts` enforces.

Phase 1's shared premium primitives (`src/components/admin/premium/*` —
posture pill, evidence chips, confidence meter) had not landed on
`origin/agent/bridge-premium-p1` at the time this phase shipped (the branch
did not exist on `origin` yet) — `src/components/admin/lenses/*` builds its
own minimal confidence/status indicators inline, each file's header noting
it as a candidate for replacement once that branch lands.
## Phase 3 triage tabs (Bridge Premium Observability, 2026-09-03)

Eight new pure/server read models under `src/lib/admin/triage/` feeding the
six existing core triage tabs — no new tables, no new migration, per the
owner brief's Phase 3 scope (`docs/ai-system/briefs/
BRIDGE_PREMIUM_OBSERVABILITY_BRIEF_2026-09-03.md`, §15-19, §28, §45). This
doc is the one `memory/registry.yml` maps the whole surface to — no separate
`admin-reliability-collector`/`admin-selfheal` feature doc exists in this
repo (checked directly before writing this entry); the Phase 3 dispatch
named those filenames but they were never created, matching the "no
separate observability/reliability key exists" note already on this file's
Phase 0 entry above.

- **`self-heal-circuit.ts`** (`/admin/self-heal`) — pure merge of the
  existing `SelfHealBoard` (runtime + capability) with `selfheal-flow.ts`'s
  per-stage throughput (waiting/stalled/oldest-wait), plus a
  newly-surfaced repair-quality link. `data/selfheal.ts` gained one
  additive field, `SelfHealBoard.repairLink: RepairPrLink | null` (the
  newest PR naming an incident), computed from the work-log read that file
  already performs. `budget` is reported as an explicit `{ tracked: false
  }` on every stage — no per-stage budget concept exists anywhere in this
  codebase's self-heal code (checked directly), and this codebase does not
  fabricate a number nobody computed.
- **`job-waterfall.ts`** (`/admin/jobs`) — projects the existing
  `CronBoardRow[]` board onto one shared timeline (real start offset + real
  duration per run), rather than `RecentRunsStrip`'s sparse per-job tick
  row. No new I/O.
- **`heartbeat-matrix.ts`** (`/admin/health`) — the SAME `CronBoardRow[]`
  board, projected differently: each job bucketed into its own cadence
  windows (completed/failed/running/missed/unknown per window), answering
  "is the rhythm intact" rather than "what happened, run by run". A window
  still in progress with no run yet reads `unknown`, never a fabricated
  `missed`.
- **`invariant-lattice.ts`** (`/admin/health`) — checked both brief-named
  sources directly: `scripts/check-schema-invariants.sh` and
  `npm run test:business` are CI-only and persist NO outcome anywhere this
  codebase can read (no table, no `docs/generated` file, no `admin_events`
  row) — their lattice rows are honestly `unknown` on every single request,
  not a placeholder waiting to be wired. The two sources with a real
  outcome: `qualifier-invariants.ts`'s `evaluateQualifierInvariants` (the
  established "read model over already-fetched rows" idiom, already wired
  into `/admin/qualifiers`) and the nightly `admin_events` integrity rows
  (`source='integrity'`, via `jobs.ts`'s exported `parseIntegrityRows`). A
  failing integrity row is always `severity: 'critical'` — a silent
  data-integrity violation outranks an ordinary warning.
- **`feature-constellation.ts`** (`/admin/reliability`) — nodes from the
  existing `fetchFeatureHealth()`, sized by occurrence volume among each
  feature's own `topSignatures` (the closest real number to "traffic" that
  `FeatureHealth`'s OUTPUT type exposes — the classifier's internal
  `FeatureHealthInputs.events24h` is not returned to callers). Edges:
  checked for a `WORLD_MODEL.json` file under `docs/generated` (absent on this branch) and
  `memory/registry.yml` (present, but its `integrations` list names
  EXTERNAL systems only — `github_actions`, `codex` — never
  feature-to-feature edges) before falling back to a real, mechanically
  derived signal: two features sharing a `primaryTable`/`heartbeatTable` in
  `FEATURE_REGISTRY` (`src/lib/admin/feature-registry.ts`, the actual
  runtime registry `feature-health.ts` classifies against — distinct from
  `memory/registry.yml`). Rendered as a grid, never a force-directed graph
  (brief §44).
- **`evidence-braid.ts`** (`/admin/reliability`) — the six
  `EVIDENCE_COVERAGE_SOURCES` from Phase 0's `coverage.ts` (built and
  tested in Phase 0, imported by nothing until this entry), bucketed over
  time for a selected feature's incidents. Sentry/Supabase/Vercel read off
  `UnifiedIncident.sources`; GitHub off `UnifiedIncident.repair`;
  Flight Recorder off a new conservative trace-to-incident correlator
  (below); Jobs always reads `unknown` — no incident-to-background-job
  linkage exists anywhere in this codebase.
- **`trace-incident-link.ts`** (`/admin/traces` + `/admin/reliability`) —
  links a `FlightTraceRun` to the `UnifiedIncident` it belongs to ONLY when
  an incident's `IncidentSourceEvidence.ref` literally equals the trace's
  `round_id` — never from a workflow-name or time-window guess (the brief
  explicitly forbids that class of merge for incident correlation, §8).
  Most traces will honestly show no link until sources reliably carry
  round refs. `/admin/traces` itself needed no waterfall rebuild —
  `trace-tree.ts`'s containment tree already carries real per-step timings;
  this module only adds the missing incident-title hookup.
- **`release-runway.ts`** (`/admin/deploys`) — wires `release-ledger.ts`'s
  ordered release cards to Phase 0's `release-context.ts`
  (`RuntimeIdentityTriplet`, the seven-state `classifyReleaseWatch`) —
  fully built and tested in Phase 0, imported by nothing until this entry.
  The DB migration head is only ever `'known'` for the LIVE release (no
  per-release history exists — a past release never gets today's head
  backdated onto it). Rollback is never recommended:
  `classifyReleaseWatch` requires `rollbackRecommended` as an EXTERNAL
  input the caller decides, no evidence source in this codebase scores
  that decision, and this module always passes `false` — a regression
  reaches `'regression-detected'` and stops there.

Shared primitives from `agent/bridge-premium-p1`
(`src/components/admin/premium/*`) landed mid-Phase-3 and were merged in;
`ReleaseRunwayStrip.tsx` was refactored to use `ReleaseWatchPosturePill`
instead of a local tone table. The other five triage components
(`SelfHealCircuitSummary`, `JobExecutionWaterfall`, `FeatureConstellationGrid`,
`EvidenceBraidTimeline`, `HeartbeatMatrixGrid`, `InvariantLatticeGrid`)
remain local under `src/components/admin/triage/` — none of `premium/`'s
seven primitives (posture pill aside) match a timeline/waterfall/matrix
layout shape, so nothing else there was a duplicate to replace.

## Phase 6 polish (Bridge Premium Observability, 2026-09-03)

Motion/reduced-motion, keyboard reachability, mobile, loading/error states,
performance and a11y audit of what was actually on `main` at task start —
Phase 0 truth models, Phase 3 triage tabs, Phase 4 lenses, the shared
`src/components/admin/premium/*` primitives, and the admin shell
(`src/app/admin/_components/**`). Phase 1 (`/admin/errors` redesign), 2
(Command Deck) and 5 (Engineering OS) were not on `main` yet and were not
touched; the guard test added here applies to them by convention once they
land, per the task brief's own instruction not to edit their files.

Findings, in order of what the audit actually turned up rather than what it
assumed it would:

- **"Unknown never renders as zero" — verified clean, no fix needed.** Every
  `?? 0` / `|| 0` in `src/lib/admin/{incidents,triage,lenses}/**` was read in
  context: all are either a genuine histogram/aggregation default (e.g.
  `adoption-map.ts`'s `Map.get() ?? 0` while building a count table) or
  explicitly guarded by a separate `known`/`unmeasured`/`unreadable` flag one
  line away (`self-heal-circuit.ts`'s stage rows, `truth-strip.ts`'s
  `coverage.anyBlind` branch). Every `catch` block in these three trees
  (`incidents/fetch.ts`, `incidents/release-context.ts`,
  `triage/trace-incident-link.ts`) returns `null`/`'unknown'`, never a
  fabricated zero or empty collection indistinguishable from "checked, found
  none". No SVG-wrapping-a-focusable-link pattern exists anywhere in
  `triage/**` or `lenses/**` (the one real `<svg role="img">`,
  `premium/EvidenceSourceChips.tsx`'s `SourceConfidenceRing`, wraps no
  interactive children — a correct, decorative-informational use).
- **Motion — 4 real gaps, fixed.** Two unguarded infinite Tailwind loops
  (`activity/page.tsx`'s filter skeleton, `TracerRoundDiagnostic.tsx`'s
  spinner) and two unguarded transform-transitions (`TracerIncidentRow.tsx`,
  `TracerPlayerList.tsx` chevrons) now match the `motion-safe:`/
  `motion-reduce:transition-none` convention already used everywhere else in
  admin. Added `src/app/admin/__tests__/admin-motion-guard-coverage.test.ts`
  — scans `src/app/admin/**` + `src/components/admin/**` for an unguarded
  `animate-*`/transform-`transition-*` utility; complements (does not
  duplicate) the pre-existing
  `scripts/__tests__/motion-reduced-motion-coverage.test.mjs`, which only
  sees framer-motion usage and admin uses none for its own chrome/visuals.
- **Keyboard reachability — 1 real bug, fixed.** AdminShell's global keydown
  handler intercepted both `'r'` and `'R'` for "refresh now" before ever
  consulting `hrefForShortcut`, which made Reliability's `'R'` `ADMIN_NAV`
  shortcut permanently unreachable — every other letter shortcut is
  deliberately the Shift+letter (uppercase `e.key`) form specifically so it
  can't collide with a plain reserved key, and refresh broke that invariant.
  Now reserves only the exact key it needs
  (`RESERVED_LOCAL_SHORTCUTS`, `admin-nav.ts`), with a regression test
  asserting no `ADMIN_NAV` key can fall into that reserved set again.
- **Keyboard "announced" — 1 real gap, fixed.** `NavItem.shortcut` (Bridge's
  only producer) was a visible-only badge with no `aria-keyshortcuts`
  companion. `FairwaySidebar.tsx`'s nav `Link` now carries
  `aria-keyshortcuts` (digit verbatim, letter as `Shift+<letter>` — the real
  gesture AdminShell listens for), and the now-redundant visible badge is
  `aria-hidden` so it stops polluting the link's accessible name on an
  expanded (non-`aria-label`'d) row. `NavItem.shortcut` has exactly one
  producer repo-wide (`AdminShell.tsx` — checked directly), so this is
  effectively admin-scoped despite living in shared Fairway shell code.
- **Mobile, loading/error states — verified clean, no fix needed.** No fixed-
  width `grid-cols-N` (N≥6) or `flex-nowrap` layout without an
  `overflow-x-auto` container anywhere in the six triage pages or the five
  lens pages; the wide-table + `hidden md:block` / phone-alternative pattern
  documented in `jobs/page.tsx` and `deploys/page.tsx` already covers every
  case that needs it. Every one of the eleven pages in scope wraps its real
  content in `PanelBoundary` (a Suspense skeleton + a scoped amber
  error-with-retry card, never the whole console going blank), on top of the
  root `/admin/loading.tsx` + `/admin/error.tsx` fallback for anything above
  panel level.
  **Narrow-viewport (375px) render tests:** the brief's own escape clause
  applies to the eleven triage/lens `page.tsx` files themselves — each is an
  `async` server component doing its own `createClient()` + query, not
  renderable through RTL without reimplementing its data layer as a mock, so
  no new per-page 375px test was added. The chrome those pages mount inside
  already carries dedicated narrow-viewport regression coverage that admin
  inherits for free: `FairwayBottomNav.test.tsx` pins the 320/390px
  fallback-to-center-on-overflow and `min-w-0` floor fixes (#899/#905) for
  the exact bottom nav `AdminShell` renders via `BRIDGE_BOTTOM_NAV_HREFS`,
  and `AppShell.compact-viewport.test.tsx` pins the icon-rail/scroll-
  affordance behavior at 768-1023px width and 390px-tall mobile-landscape
  that `AdminShell` also inherits unmodified. No admin-specific layout
  diverges from that shared chrome, so no separate 375px suite was
  duplicated on top of it.
- **Performance — verified clean, no fix needed.** Every Phase 3/4 read-model
  fetcher (`fetchReleaseRunway`, `fetchSelfHealCircuit`, the five lens
  fetchers, `fetchTeamsEkgLens`) is called at most once per page render (the
  two `fetchTeamsEkgLens` call sites pass different sort args from different
  pages, not a duplicate call); the base primitives they read
  (`cachedIncidentBoard` etc.) are already wrapped in React `cache()` at the
  source layer, which is the correct place for the dedup rather than
  re-wrapping every derived read model. `fetchSelfHealCircuit` itself is
  unused — `self-heal/page.tsx` calls `buildSelfHealCircuit` directly and
  composes its own inputs — noted, not changed (a dead-export cleanup is a
  different program than Phase 6 polish). No admin read model re-parses a
  `docs/generated/**` artifact per request the way Phase 5's
  `WORLD_MODEL.json` mtime cache does; nothing analogous exists on `main`
  today.
  **Performance budget for triage/lens read models, stated so a future
  change can be checked against it rather than re-derived:** (1) a read
  model returns only the compact typed shape its panel renders — never a
  raw provider payload (Sentry event bodies, Vercel deployment JSON, cron
  run logs) forwarded to the client wholesale; (2) each read-model function
  is called at most once per server render of the page that uses it, with
  request-scoped dedup living at the shared primitive layer
  (`cachedIncidentBoard` and peers) via React `cache()`, not re-implemented
  per fetcher; (3) any list backed by a table with unbounded growth is
  either paginated or explicitly capped with the cap surfaced to the user
  (`adoption-map.ts`'s 500-user cap + `roleCoverageNote`), never silently
  truncated; (4) no per-request re-parse of a large generated artifact —
  this repo's only instance of that pattern, Phase 5's `WORLD_MODEL.json`
  mtime cache, has no analogue on `main` today because no admin read model
  reads a `docs/generated/**` file at request time.
- **Accessibility — colour contrast verified clean; automated axe coverage
  BLOCKED, documented rather than worked around.** No `text-accent-500`
  usage anywhere in `src/app/admin` or `src/components/admin` (the token
  that fails AA at 2.67:1). `@axe-core/playwright` exists in this repo and is
  already used by `e2e/accessibility.spec.ts`, but that suite explicitly
  scopes to unauthenticated public routes only ("Add per-route variants once
  you have a seeded test account flow") — checked directly, no such flow
  exists for the `SUPER_ADMIN_USER_IDS`-gated admin console (unlike golf/
  baseball's ordinary team-scoped demo accounts, there is no Playwright
  storageState fixture or `*-auth.setup.ts` for a super-admin identity).
  Standing one up is real auth infrastructure, not a route-table addition,
  so it is reported here rather than built.
- **Visual regression — BLOCKED for the same reason, documented rather than
  worked around.** `e2e/sentry-snapshots.spec.ts` /
  `e2e/sentry-snapshots-baseball.spec.ts` handle auth per caller (golf via
  `hasGolfPlayerAuth`, baseball via `storageState` +
  `playwright/baseball-auth.setup.ts`), and the shared capture helpers
  (`e2e/fixtures/sentry-snapshot-helpers.ts`) are auth-agnostic — so the
  mechanism could in principle cover admin routes, but only once a
  super-admin auth fixture exists. No new screenshot system was built.

## Known Risk Areas

- Admin actions are more likely to use broad permissions; review for service-role and RLS bypass carefully.
- CRM email/reply/suppression logic can have compliance impact.
- Rollup dashboards can appear live while backed by stale data.
- Observability code must avoid PII and secret leakage.
- **The Supabase observability tables (`helm_debug.db_error_events`,
  `db_health_samples`, `db_stat_deltas`, `db_stat_prior_state`) are HELD, not
  applied to production**, as of 2026-09-03 — see `supabase/migrations/
  HELD.md`. `/admin/database` and its three cron collectors are shipped
  code with no live data source yet; they render `status: 'unconfigured'`
  until an owner applies the migrations. Do not read a green/empty
  `/admin/database` page as proof the database is healthy — it may only
  mean the collector has never run.
- **`helm_debug` is not reachable by direct table grant, even for
  `service_role`.** Every read and write goes through a `SECURITY DEFINER`
  facade (`record_db_error_event`, `helm_debug_read_db_health_history`,
  etc.) — confirmed against production 2026-09-03 that `service_role` lacks
  `USAGE` on the schema. A future change that tries `.from('db_error_events')`
  directly from an admin client will fail; add a new RPC facade instead.
- **An incident detail page costs a whole board.** `fetchIncidentById`
  (`src/lib/admin/incidents/fetch.ts`) builds the full 168h board — a Sentry
  pull, a paginated `admin_events` sweep, the GitHub work log and per-PR check
  runs — to answer for ONE incident, on top of the page's own
  `fetchFingerprintDetail` and `fetchResolutionArchive`. The wide window is
  deliberate (a detail page is reached from bookmarks, RCA rows and PR bodies,
  so a 72h board would 404 half of them), and correctness beat cost while the
  read model was being established. Twenty incidents opened in a row is twenty
  boards. If that starts to bite, the fix is a narrowed by-id query, not a
  shorter window.

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
- `src/lib/observability/supabase/__tests__/*.test.ts` — the SQLSTATE
  classifier's context-sensitive codes (42501/23505/23503 expected vs
  unexpected), fingerprint determinism (same code+feature+rpc, different
  message text -> same fingerprint), the privacy sentinel (a JWT/email/UUID
  passed into safeDetails never survives into the persisted envelope), and
  the two-signal reset detection both delta engines share.
- `src/lib/admin/database/__tests__/*.test.ts` — the three `/admin/database`
  read models degrade to `status:'unconfigured'` (not `'error'`) on the
  HELD-migration "not found" shape.
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
- `src/lib/admin/agent-runs/__tests__/{record,fetch}.test.ts` — the writer
  is fail-open under both an RPC rejection and an RPC error result; the
  reader distinguishes `unconfigured` (HELD migration not applied) from a
  real `error`, and never reports zero runs as if the source were blind.
- `src/lib/admin/engineering/__tests__/held-migrations.test.ts` — includes
  a regression guard that parses the REAL `supabase/migrations/HELD.md`
  and asserts every returned row's status actually starts with HOLD.
- `src/lib/admin/engineering/__tests__/decision-inbox.test.ts` — sources
  stay disjoint (every item is `held-migration` or `janitor-finding`,
  never anything incident-shaped), and a missing artifact reports
  `unconfigured` rather than a fabricated empty inbox.
- `src/lib/admin/engineering/__tests__/blast-radius.test.ts` — depth
  capping, weak-edge flagging (evidence all `import_graph`), never
  returning an unrelated pair, and the causal-confidence ladder formatter.
- `src/lib/admin/engineering/__tests__/work-log.test.ts` — the release
  time-bucketing (earliest deploy at/after merge), `notYetDeployed` vs.
  a genuinely unknown match, and repair-quality per-source isolation (the
  release ledger failing still returns the PR rows).
- `src/app/admin/engineering/__tests__/page.test.tsx`,
  `src/app/admin/work-log/__tests__/{page,WorkLogProofCard}.test.tsx` —
  page-shell render tests (every section heading, no nested `<main>`) plus
  a fully data-driven suite for `WorkLogProofCard`.
- `src/lib/admin/lenses/__tests__/*.test.ts` (Phase 4) — one file per lens
  read model, each proving unknown-vs-zero, a blind source disclosed in
  `degradedNote` (never silently absorbed), and an empty-team/empty-platform
  case rendering honest zeros rather than fabricated data.
- `src/components/admin/lenses/*.test.tsx` (Phase 4) — render tests for each
  lens's dominant visual: a `null` metric renders "Unavailable" (never a
  fabricated 0), a real 0 renders distinctly from that, and
  `UserJourneyRibbon.test.tsx` specifically asserts no `@`-containing string
  (email) ever appears in the rendered output.
- `src/test/lib/admin/nav-covers-every-route.test.ts`,
  `src/app/admin/_components/__tests__/admin-nav.test.ts` — every Phase 4
  route is reachable from `ADMIN_NAV` (or an explicit `DETAIL_LEAVES` entry
  for `/admin/lenses/users/[id]`), with a unique keyboard shortcut.
- Typecheck/build for admin UI changes.
- Targeted smoke/browser checks for admin dashboards when changing route-level code.

## Related Docs

- `docs/ADMIN_DASHBOARD_UPGRADE_PLAN.md`
- `docs/BI_DASHBOARD_ARCHITECTURE.md`
- `docs/OBSERVABILITY.md`
- `docs/SECURITY_AUDIT.md`
- `docs/ai-system/briefs/BRIDGE_PREMIUM_OBSERVABILITY_BRIEF_2026-09-03.md` —
  the Bridge Premium Observability brief the "Phase 0 truth models" and
  "Phase 5 Engineering OS" sections above implement. Verified resolvable in
  this checkout 2026-09-03 — the "Phase 0" section's claim above that it
  "does not resolve in this checkout yet" is now stale; corrected here
  rather than edited in place, per `.claude/rules/shipping.md` §1 (leave
  the original reasoning legible, don't silently rewrite history).
- `docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §J.4.5 —
  the "do not build a second Decision Inbox" finding the Phase 5 section's
  Decision Inbox module is scoped against.
- `memory/decisions/ADR-2026-09-03-control-plane-owner-decisions.md` —
  `AGENT_FLIGHT_RECORDER_STORAGE`, the owner decision the Phase 5 section's
  migration implements.
- `docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md` — Phase 1's
  re-measured production baseline for the Supabase/Postgres observability
  program (the master brief itself lands separately, on the sibling
  control-plane branch).
- `memory/features/admin-incidents.md`
- `memory/features/admin-reliability-collector.md`
- `memory/features/admin-selfheal.md`
- The Bridge Premium Observability brief the "Phase 0 truth models" section
  above implements — see that section for its worktree location as of
  2026-09-03; not linked here as a repo path because it does not resolve in
  this checkout yet (`docs:path-drift` would flag it).
