<!-- markdownlint-disable MD003 MD007 MD012 MD013 MD022 MD028 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Feature: Admin Platform

## Status

- active

## Current State

Admin Platform is the internal operations and monitoring surface for Helm/GolfHelm. It includes the main admin dashboard, data quality/tracer views, platform health, BI-style reporting, user/team activity, audit/security views, and a CRM/admin outreach subsystem.

This area is high criticality because it often uses broader access patterns, operational data, and admin/server-only helpers.

## Primary Entry Points

### Routes

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
- `src/lib/supabase/admin*`
- `src/lib/cron/**`
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

## Business Rules

- One incident-grouping algorithm for `admin_events`, not two. As of
  2026-08-26, the Golf Tracer (`admin-tracer-data.ts`'s `buildTracerIncidents`)
  groups error rows by the same write-time `admin_events.fingerprint` column
  the Errors tab's triage queue groups by (`mergeTriage` in
  `src/lib/admin/data/triage.ts`; `fingerprint` is set once at insert by
  `buildIncidentSignature()` in `src/lib/admin/incident-grouping.ts`). A NULL
  fingerprint (rows written before that column existed) falls back to a
  synthetic `row:<id>` key — the pure helper is
  `tracerIncidentGroupKey` in `src/app/admin/golf/tracer/tracer-shared.ts`,
  and its fallback deliberately mirrors `mergeTriage`'s own
  `row.fingerprint ?? \`row:${row.id}\`` string-for-string. The Tracer's
  shot-tracking LENS (`isShotTrackingTracerEvent` — featureArea/action-prefix/
  route filtering) is a FILTER applied to the raw event list before this
  grouping runs, not a second grouping algorithm. Before this date the Tracer
  recomputed its own read-time key from normalized message + route + action +
  errorCode, which could disagree with the Errors tab's grouping for the same
  underlying rows.
- Admin access must remain explicit and server-side; service-role behavior must not leak into client bundles.
- Helm Bridge uses the authenticated GolfHelm session. Its shell must expose a
  usable sign-out control on both the desktop rail and the mobile More sheet;
  sign-out clears the active-team selection before revoking that session.
- Admin dashboards can read broad platform state, but mutations still need authorization and auditability.
- CRM automation/suppression behavior must respect opt-out and reply-stop logic.
- Operational charts should not be treated as source of truth if rollups are stale.
- Cron/admin endpoints must use configured secrets and auth checks.
- **Incident resolution has exactly one write path.** Every resolve — a single
  row, a whole fingerprint, or a bulk selection — goes through the user-scoped
  `resolve_admin_event` RPC and busts `BRIDGE_INCIDENT_CACHE_TAG`. The RPC
  gates on `is_super_admin()` reading `auth.uid()`, so it must be called with
  the user-scoped client; a service-role client makes `auth.uid()` NULL and the
  RPC Forbids. Service-role access is read-only on this path.
- **An in-app RCA analysis is not an incident.** `analyzeErrorFingerprint`
  stores its verdict as an `admin_events` row with `event_type='rca_analysis'`
  under the analyzed fingerprint, written BORN RESOLVED (`resolved: true`,
  `resolved_at`) like every other non-incident record this table holds —
  pinned by `src/app/admin/actions/__tests__/analyze-error.test.ts`. Every
  incident query must still exclude that event type, or an analysis is counted
  as an occurrence of the thing it analyzes (inflating occurrence counts and
  moving last-seen).
- **The reliability collector writes TWO `background_job_logs` rows per run, and
  they must stay distinct.** `recordJobRun('reliability-triage', …)` writes the
  standard cron-board row — every registered cron must call it, enforced by
  `src/app/api/cron/__tests__/cron-job-log-coverage.test.ts` — and the detailed
  correlated payload is written separately under `reliability-snapshot`. They
  cannot be one row: `recordJobRun`'s `extractOutcomeMetadata` deliberately keeps
  only TOP-LEVEL SCALARS, so `signals[]` and `sources[]` would be silently
  stripped and the tab would render every run as "recorded but unreadable". Only
  `reliability-triage` belongs in `CRON_REGISTRY`; the snapshot type is a payload
  store, not a scheduled job.
- **The row status vocabulary is `completed` / `failed`.** Verified against
  production: all existing `background_job_logs` rows use those two words and
  nothing else. An earlier draft wrote `success`, which no other writer emits and
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
  `resolved` and never `awaiting-deploy`. A blind source's freshness is
  `unknown`, not `fresh`, even when the failed attempt was seconds ago. This
  is the same rule `src/lib/reliability/types.ts` states for one collector
  run, lifted to every Bridge surface.
- **No all-clear anywhere while a required source is blind.**
  `canClaimAllClear` in `src/lib/admin/incidents/sources.ts` is the single
  guard. "No incidents found" under an unreadable Sentry converts a broken
  read into a green screen, which is the most damaging empty state a
  monitoring surface can show. The incident queue, the proof-debt panel and
  the Truth Strip's incident cell all consult it; a new panel that renders an
  empty state must too.
- **Corroboration is an observation count, not a confidence score**, and
  evidence coverage is a checklist, not a percentage. Two systems seeing a
  fault is a mechanical fact about coverage and says nothing about
  likelihood. Rendering either as a percentage would imply a calibration this
  system does not have — which is also why the Reliability tab groups by
  source count in WORDS.
- **Repair state is joined from GitHub, never stored.** A repair PR names its
  incident through the two markers `docs/ai-system/selfheal/repair-contract.md`
  already mandates: the `/admin/errors/<fp>` body link (STEP 5) and the
  `fix/rca-<fp>` branch (STEP 4). Both are scanned, because the Bridge reads
  PRs through GitHub's SEARCH endpoint, which returns the body but not
  `head.ref`, while the list-pulls fallback returns the ref. A failed GitHub
  read makes repair state `unknown`, never `none` — reporting an unreachable
  API as an empty queue re-queues work that is already sitting in a branch.
- **Diagnose is a Vercel cron, not a cloud routine, as of 2026-09-02.**
  `SELFHEAL_STAGES.triage.runner` is `'vercel-cron'`
  (`src/lib/admin/selfheal-registry.ts`), cadence 6 hours, heartbeat
  `job_type = 'selfheal-triage'` written by
  `src/app/api/cron/selfheal-triage/route.ts` directly (not through
  `recordJobRun`, which keeps only top-level scalars and would silently drop
  `sourceHealth`/`queue`) — a SEPARATE, unregistered `recordJobRun` call
  wraps the handler purely for crash-safety, mirroring `log-retention`'s
  two-job-type split for the same reason. The route reuses
  `triage-collect.ts`/`triage-apply.ts` (the same modules `npm run triage`
  wraps) and `rca-run.ts` (the same analyzer `analyzeErrorFingerprint` calls,
  factored out from behind that action's `requireSuperAdmin()` gate). It
  auto-resolves only what `triage-contract.md` STEP 4 allows, and — because a
  Vercel function has no git checkout — never resolves a SHA-bearing
  "ALREADY FIXED" claim itself; that case is left analysed-but-open for
  `auto-resolve.ts`'s nightly Rule A or a human/`npm run triage` run. A
  fingerprint carrying a provider-fault (an Inngest/AI-account credential
  fault, say) is never auto-resolved even when a model mis-categorises it,
  because the guard re-classifies the member's own message text
  (`classifyProviderFault`) in addition to reading a stored `errorCode` —
  three of the four production "Inngest signature" fingerprints carry no
  persisted `errorCode` at all, so the stored-code check alone would miss
  them.
- **Runtime health and capability proof are separate facts for every
  self-healing stage.** A stage can heartbeat healthily for a week while never
  once producing its output; on 2026-08-28 Repair's heartbeats were green and
  it had never completed a PR-opening run. `selfheal-capability.ts` derives
  capability from mechanical evidence (signals collected, analyses written,
  repair PRs opened, auto-resolutions recorded) and a `null` count means the
  read failed, so capability is `unknown` — never `unproven`. A loop whose
  runtime is `ok` and whose capability is `unproven` must never render as
  healthy.
- **A heartbeat's free text is not necessarily an error, and a heartbeat row is
  not necessarily a stage run.** `background_job_logs.error_message` is the only
  free-text column a stage has, so a run that SUCCEEDS and wants to explain
  itself writes there; `data/selfheal.ts` and `data/jobs.ts` therefore split it
  into `lastError` (only when the run classified `failed` or `degraded`) and
  `lastNote`. The table is also open — a human at a psql prompt produces
  `status = 'completed'` exactly like a stage does — so
  `selfheal-provenance.ts` classifies each run as `autonomous`,
  `operator-assisted` or `instrument-probe` from the strings the runs recorded,
  and carries the basis with the verdict. An unrecognised shape degrades to
  `autonomous` with a null basis and renders NO chip: the classifier detects a
  run that ANNOUNCED human involvement and cannot detect one that stayed quiet.
- **Late is not overdue.** `classifyCronStatus` only calls a stage overdue at
  `cadenceMinutes * 1.5`, measured from `started_at`. `SelfHealStageDetail`
  carries `overdueAt` so the view stops re-deriving that multiplier, and
  `deriveSchedulePosition` draws the window the classifier actually measures —
  a stage past its expected time but short of the threshold reads "late by 4h,
  not yet overdue" rather than as a bare past timestamp under "Next expected".
- **The Flight Recorder's two axes are never summed.** Instrumentation coverage
  (how much of the declared pipeline has call sites wired to the recorder) and
  outcome (whether the work succeeded) are independent. Measured 2026-09-01, 46
  of 50 production traces miss declared-required steps while 40 of those
  succeeded — a short trace is not a failed one, and a combined "46 problems"
  figure would be false. `trace-fleet.ts` counts them separately;
  `stepCoverage` returns null rather than inventing a denominator.
- **A Sentry rate limit gets one honoured retry before it counts as blind.**
  `fetchSentryIssues` (`src/lib/admin/sentry-api.ts`) waits out the 429's
  `Retry-After` (capped at 30s; a sane default when the header is absent)
  and retries exactly once. If the retry also fails, the envelope is marked
  `degraded: true` rather than a bare error. The Reliability tab's
  `SourceStatus` (`src/lib/reliability/types.ts`) carries this through as its
  own `'degraded'` value — ranked worse than `partial` but better than
  `blind` in `worstStatus`, since a rate limit "usually clears on its own"
  (the same wording `integration-health.ts`'s `KIND_COPY` already used for
  this fault kind) — with reason `'rate limited'`. Scoped to the Reliability
  tab only: the Incidents tab's separate `SourceHealth` union
  (`src/lib/admin/incidents/types.ts`) has no `degraded` member and a
  degraded reliability arm folds into its existing `'blind'` there, which is
  the conservative direction and consistent with "no all-clear while a
  required source is blind".
- **A canceled preview deployment is not a build problem.** `collectVercel`
  rates a `CANCELED` Vercel deployment `info` unless its `target` is
  `production`, where a canceled deploy means the intended release never
  shipped and stays `warning`. A superseded or manually-canceled preview
  build is routine noise, not a reliability signal.
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
- **Reliability is a lens, not a second queue.** `/admin/reliability` keeps
  source health, the blind-source notice, the severity mix, run history and
  the raw snapshot — removing those was never the goal. What it must not do
  is sort by severity (the Incidents tab's axis) or dead-end its rows: every
  signal title links to `/admin/errors/rel:<signature>`, which is the same
  string the nightly triage stores its analysis under.
- **Error text is redacted before it is stored**, not only before it reaches
  Sentry, and `stack` / `message` / `title` count as error text — not just
  `url` and `context`. URL query strings and fragments can carry magic-link
  tokens, OTPs and OAuth codes; a stack embeds them mid-string
  (`new Error(url)`), and a Postgres message echoes offending values.
  `redactFreeTextForStorage` in `src/lib/observability/redact-pii.ts` is the
  single implementation, called by BOTH write paths (the client ingest route
  and the server logger). Keep it that way: both write the same two columns,
  both are read back by the RCA action and forwarded to a third-party model,
  and a second copy is one that eventually stops matching — silently, on the
  half nobody is looking at.
- **A SHA match may only ever prove a fix shipped — never disprove it.**
  `deriveServesFix` (`src/lib/admin/incidents/deploy-proof.ts`) answers "does
  production serve this fix" as `true` / `false` / `null`. Production almost
  never sits on the fix commit, because any later deploy moves it past, so
  equality is evidence of shipping and inequality is evidence of nothing. The
  merge timestamp is the general test: a deploy cut after the merge carries the
  merge. An implementation that returned `false` on SHA mismatch reported every
  fix older than one deploy as permanently unshipped, and made the timestamp
  branch unreachable whenever both SHAs were known. `deployAt === null` (Vercel
  unreadable) is `null`, never `false` — the same three-outcome rule
  `shipStatus` follows.
- **One attention list on the Overview, and the platform checks are in it.**
  `selectAttention` ranks incidents, dead self-heal stages, `fetchBriefing`'s
  platform checks and the standing blind-source caveat on ONE scale. The
  Overview briefly carried two panels both titled "Needs your eyes" — one for
  the briefing, one for incidents and the loop — which left the operator
  ranking two lists against each other by eye. A second attention list is no
  more defensible than a second incident list. A briefing check that could not
  RUN withdraws the all-clear and is stated on the list, because a check that
  failed to execute is not a check that passed.
- **Every filter control on the incident queue must narrow the canonical
  queue.** Lens (lifecycle/attention) and `?kind=` (incident class) are
  orthogonal facets over the SAME list, both applied in
  `src/lib/admin/incidents/lens.ts`. `?kind=` was once parsed, rendered as
  chips and linked from the suppressed notice while nothing downstream
  consulted it — the canonical queue is built from `IncidentFeedFilters`, which
  has no `kind` field — so every one of those controls was inert and the
  notice's "N held back" described a list the operator was no longer looking
  at. A control that does nothing is worse than a missing one: it teaches the
  operator the queue is curated when it is not. Counts shown beside a filter
  are measured over the list that filter actually narrows.
- **A QA fixture round is labelled, visibly, and excluded only from the
  actionable COUNT — never hidden.** `supabase/migrations/
  20260901120000_integrity_completed_round_zero_scored_holes.sql` names four
  `golf_rounds` ids as seeded fixtures (owner decision 2026-09-02: KEPT, not
  removed) — `src/lib/admin/qa-fixture-rounds.ts` carries a literal copy of
  that exact array (nothing at runtime can read a `.sql` file), and
  `qa-fixture-rounds.test.ts` reads the migration itself and asserts the two
  match, so they cannot drift silently. `mergeTriage` (`triage.ts`) matches
  each app-origin bucket's rows against it via `extractRoundId(row.metadata)`
  — `metadata.roundId` is a top-level key, same shape as `route`/`action`,
  written by `normalizeContext` from `ObservedActionContext.roundId` — and
  when ANY row in the bucket names a fixture round, sets `TriageItem.
  isFixture: true`. **`actionable` is deliberately LEFT UNTOUCHED** —
  whatever `classifyIncident` decided from the text stands. An earlier
  version of this forced `actionable: false` at the source, which silently
  dropped the row out of `matchesKind`'s default view (`kind === undefined ->
  incident.actionable`) — the row vanished into "N held back" and the FIXTURE
  badge that exists to explain it became undiscoverable. The two asks —
  "label it in the feed" and "exclude it from the actionable count" — are
  answered separately: the row renders, badged, in the default feed; the
  EXCLUSION happens explicitly at every count site instead, keyed on
  `isFixture`: `lens.ts`'s `actionable` lens, `truth-strip.ts`'s `actionable`
  cell, `errors/page.tsx`'s `shownActionable`, and `incident-feed.ts`'s
  `summarizeIncidentFeed`/`actionableGroups` (the last one because
  `overview.ts` and `errors/page.tsx` both render that exact field and must
  agree). `correlate.ts` carries `isFixture` through onto `UnifiedIncident`
  (`bucket.appItems.some(i => i.isFixture)`); `UnifiedIncidentCard` renders a
  neutral-tone FIXTURE chip, second priority right after the lifecycle chip
  (a fact about the DATA outranks everything derived from it, including
  outranking the blind-source chip under the 5-chip cap) — not a `StateChip`
  on lifecycle itself, because the lifecycle machinery still describes this
  incident honestly; the fixture flag is an orthogonal fact layered on top,
  not a reclassification. Sentry-origin items are always `isFixture: false`
  — a Sentry issue carries no round-id metadata to match against.
- The overnight digest (`/api/cron/admin-digest` → `build-digest.ts`) NAMES
  only actionable, non-degradation incident groups — the Errors tab's default
  view — and COUNTS the rest as "Not listed: N handled degradations · N quiet
  (client connectivity, expected access)". Before 2026-09-02 every group was
  listed, so the email led with three "Client error: Load failed" rows above
  "0 critical".
- `classifyIncident` rule 3c: a CLIENT-sourced transport-layer TypeError
  (`isTransientNetworkErrorMessage` — "Load failed", "Failed to fetch", …)
  is `integration` / not actionable, the same verdict rule 4 gives the generic
  "network error" wording. Server-side "fetch failed" (undici, a Vercel
  function) is not matched and stays actionable. The phrase list is shared
  with `error-logging` and the message-send retry so the three cannot drift.

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
- **The incident badge has THREE states.** `fetchBridgeErrorBadge` returns
  `null` — never 0 — when the feed read fails (it used to `catch { return 0 }`,
  converting the throw `bridge-honest-failure.test.ts` pins into the
  reassuring zero that throw exists to prevent, and `unstable_cache` held it
  for 60s). `AdminShell` renders `null` as no numeric badge PLUS a distinct
  "Incidents unreadable" chip in the top bar at every breakpoint. Same rule
  layout.tsx already applied to the Health badge.
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
- **An un-scoped Sentry issue still gets an ADVISORY feature tag, not `null`.**
  `mergeTriage` (`src/lib/admin/data/triage.ts`) only ever had a per-BATCH
  feature (`sentryTagHint`, set only when the caller actually scoped the fetch
  by a Sentry tag) — every other Sentry issue landed `feature: null` and the
  feature lens on `/admin/errors` grouped them all as "unknown". It now falls
  back, per issue, to `resolveFeatureId(issue.culprit)` — the same advisory
  route/feature map `src/lib/reliability/normalize.ts` exports for the
  Reliability tab's own correlation pass (moved there from `collect.ts` so
  both callers share one pure implementation; `collectSentry` in
  `sources.ts` already passes `issue.culprit` as `route` into this same
  function). The batch-level hint still wins when present — it is honest,
  Sentry-tag-scoped attribution; the per-issue fallback is a GUESS from a
  route string, which is why it only fires in the hint's absence. `culprit` is
  the only per-issue location `SentryIssue` carries — there is no
  transaction/url field on it. Not every value `resolveFeatureId` returns is a
  `FEATURE_REGISTRY` key (see its own doc comment for which three of six
  aren't); an unregistered tag still renders, unlinked, in
  `UnifiedIncidentCard` — strictly better than the "unknown" bucket this
  fixes issues out of.
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
- **The self-healing loop has THREE axes, and throughput is the one a
  heartbeat cannot show.** Runtime (`selfheal-registry.ts`: is each stage on
  schedule) and capability (`selfheal-capability.ts`: has it ever produced its
  output) were both green on a loop that skipped the same incident every
  night. `src/lib/admin/selfheal-flow.ts` (2026-09-01) places every incident
  on the board at the stage whose turn it is, from the lifecycle `lifecycle.ts`
  already derived, and calls it STALLED once that stage has had
  `STALL_CYCLES` (2) of its own registry cadence to act and has not. Three
  rules: a failed read (`repair.status === 'unknown'`, an unreadable deploy, a
  blind source) places the incident at `unknown` and can never stall a stage;
  the threshold is the stage's cadence from `SELFHEAL_STAGES`, never a literal;
  an active stage (`repairing`) is never stalled. Close's wait starts when
  silence became proof — deploy time plus `PRODUCTION_PROOF_WINDOW_MS` — not
  at the deploy. The model reaches four surfaces from one function: the
  `stalled` lens on the Errors tab (judged against `computedAt`, never
  `Date.now()`), the `stage-stalled` attention reason (ranked after
  `repair-ci-failed`, before `repairable-untouched`, because "Repair had its
  chances" is the stronger fact about the same incident), the Truth Strip's
  self-heal cell (a stall escalates `ok`/`warning` to `N STALLED`; it never
  softens `danger`/`unknown`), and the per-stage backlog strip on the Overview
  and the Self-heal page. Counts only on the Overview: a stalled incident
  already earns its attention row, and a third list is the split this read
  model exists to remove.
- **The Repair stage's launchd config is tracked in the repo, not only on the
  owner's Mac.** `config/launchd/com.helm.bridge-rca-repair.plist` is the
  source of truth for `~/Library/LaunchAgents/com.helm.bridge-rca-repair.plist`;
  `npm run selfheal:repair:install` installs/reloads it and
  `npm run selfheal:repair:doctor` checks it end to end — installed and
  byte-identical to the repo copy, loaded (`launchctl print`), the env file's
  variable names present, the `claude` binary and prompt file resolve, the
  `-p` argument does not start with `-` or `$(`, and the newest production
  `selfheal-repair` heartbeat is fresh (<26h) and not a runner failure. This
  closes the 2026-09-02 fire that failed in 0.6s: the plist passed SKILL.md's
  raw YAML-frontmatter text as `claude -p`'s argument and the CLI parsed the
  leading `---` as an unknown option, exiting before writing anything. The
  outer runner (`scripts/run-selfheal-repair.mjs`) now pipes the child's
  stdout/stderr (forwarding every byte to its own stdout/stderr in real time,
  so the plist's `>> log 2>&1` still sees the same output) and, on a
  runner-level failure, redacts and truncates (`redactSecrets`/`truncateTail`
  in `scripts/lib/selfheal-repair-runner.mjs`) the child's last ~4KB into the
  fallback heartbeat's `metadata.child_output_tail`, so a future failure like
  this one explains itself on `/admin/selfheal` instead of reading only
  "child exited 1". A static vitest
  (`src/test/scripts/selfheal-repair-launchd.test.ts`) parses every plist
  under `config/launchd/**` and fails if the `-p` argument trap, a missing
  `--strict-mcp-config`, or a wrong `--mcp-config` target ever regresses.
  `redactSecrets`'s per-pattern replacement is keyed on an explicit
  `keyGroup` flag stored on each `SECRET_PATTERNS` entry, not inferred from
  whether the replace callback's second argument is truthy — a zero-capture
  pattern's second callback argument is `String.replace`'s numeric match
  OFFSET, not a capture group, and treating it as one produced a mangled
  `"<offset>=[REDACTED]"` for any secret not located at index 0 of the
  matched text.
- **Lens counts are measured over the faceted list.** `countLensesForKind`
  counts through the same `matchesKind` predicate `applyIncidentFacets`
  narrows with, so the number beside a lens equals what clicking it shows
  while `?kind=` is active. `board.lensCounts` stays the board-level fact.
  Separately, the `awaiting-proof` lens no longer admits an incident whose
  ONLY proof gap is `source-blind`: a failed read is not a fix awaiting proof.
- **The legacy `TriageQueue` takes `canClaimAllClear` too.** Defaults to true
  for existing call sites; the Overview passes the Sentry pull's status,
  because that feed's only external witness is Sentry and an empty queue
  under a failed or unconfigured pull is a partial count.
- **The Errors tab has one "compared to what".** `fetchErrorsTab` counts
  error-or-worse rows written in the current window and the equal window
  before it (sport filter applies, the others do not, so the pair stays
  comparable); `describeWindowDelta` refuses a percentage against a zero prior
  window and reports an unreadable count as `unknown`, never a flat 0%. When
  Sentry's hourly series is unavailable, `sumHourlyBuckets` folds the app's
  own per-fingerprint 24h histograms into one series against the exact clock
  they were built on (`appHourlyComputedAt`) and the chart says "app events
  only" — one witness, labelled as one, rather than a blank chart over data
  the Bridge already held.

## UI Contract

- Admin surfaces should be dense, scannable, and operational rather than marketing-style.
- Health, errors, data freshness, and needs-attention states should be visible without hunting.
- A count that could not be read is rendered as UNREADABLE, never as zero and
  never as nothing. The incident badge's `null` state is a visible chip
  ("Incidents unreadable", `role="status"`) in the shell's top bar, shown at
  every breakpoint because on the phone the bottom-nav badge is the only other
  signal.
- The Overview answers "is anything on fire" above the fold: banner, briefing,
  severity mix, then the triage queue. Posture KPIs live in a disclosure below
  it, not above it. Each KPI carries its own source note — the provenance is
  per-tile, not a separate panel.
- The Incidents page (`/admin/errors`) is organised as five questions, top to
  bottom, each under a heading that says which one it answers: what needs
  attention (the canonical queue), is it getting worse (window-over-window,
  hourly, by source and by feature), is the Bridge seeing everything (source
  reconciliation, wiring, traceability), what Sentry still holds open, and what
  was fixed. Filters are grouped and labelled in words with an explicit "All"
  per group (`ErrorsFilterBar`), collapsed until one is active; the legend
  (`HowToReadIncidents`) is a closed `<details>` under the header. Every
  incident row carries a feature TAG in registry words ("untagged" said out
  loud, an unregistered key rendered as itself, dashed), the lifecycle
  headline sentence, and a Details disclosure with only what the row does not
  already say: first/last seen, the error code with a plain-language hint
  (`error-code-hint.ts`, null for codes it does not know), the kind and its
  reason, every source with its health, the analysis, the repair, and the
  ordered checks behind the lifecycle state.
- An error's detail page shows what was actually captured — Postgres error code
  and hint, request id, runtime, handled/unhandled, source file, and the flight
  trace link when one exists — each copyable on its own. A field with no value
  renders an em-dash; nothing is invented to fill the grid.
- Feature health renders through one component wherever it appears (Overview
  rollup, Health grid, per-app pages). Status thresholds, two-window hysteresis,
  and knownGaps annotations belong to the data layer, never to a view.
- The Reliability tab states source health BEFORE signals. A blind source
  renders as danger rather than the neutral tone "not configured" gets
  elsewhere in the Bridge: opting out of Inngest is a config choice, whereas an
  unreadable source falsifies the tab's whole claim. Its empty state is split in
  two — "all sources read, nothing found" is an all-clear, "sources blind,
  nothing found" is explicitly not one — and a never-run collector reads as a
  wiring problem, not as health.
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

## Known Risk Areas

- Admin actions are more likely to use broad permissions; review for service-role and RLS bypass carefully.
- CRM email/reply/suppression logic can have compliance impact.
- Rollup dashboards can appear live while backed by stale data.
- Observability code must avoid PII and secret leakage.
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
- `src/test/lib/admin/bridge-honest-failure.test.ts` — the Bridge never fails
  toward reassurance (feed throw, badge `null`).
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
- `src/lib/reliability/__tests__/normalize.test.ts` — source-degradation
  semantics and cross-source correlation.
- `src/lib/reliability/__tests__/sources.test.ts` — the self-feeding-read
  guard, asserted at the query level where it actually lives.
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
- The Bridge Premium Observability brief the "Phase 0 truth models" section
  above implements — see that section for its worktree location as of
  2026-09-03; not linked here as a repo path because it does not resolve in
  this checkout yet (`docs:path-drift` would flag it).
