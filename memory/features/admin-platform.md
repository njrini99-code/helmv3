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
- `src/app/golf/admin/**`
- `src/app/golf/admin/crm/**`
- `src/app/api/cron/reliability-triage/**` — the 3-hourly collector behind the
  `/admin/reliability` tab. Its core is `src/lib/reliability/**`.

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
  under the analyzed fingerprint. Every incident query must exclude that event
  type, or an analysis is counted as an occurrence of the thing it analyzes
  (inflating occurrence counts and moving last-seen).
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

## UI Contract

- Admin surfaces should be dense, scannable, and operational rather than marketing-style.
- Health, errors, data freshness, and needs-attention states should be visible without hunting.
- The Overview answers "is anything on fire" above the fold: banner, briefing,
  severity mix, then the triage queue. Posture KPIs live in a disclosure below
  it, not above it. Each KPI carries its own source note — the provenance is
  per-tile, not a separate panel.
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
- `src/lib/reliability/__tests__/normalize.test.ts` — source-degradation
  semantics and cross-source correlation.
- `src/lib/reliability/__tests__/sources.test.ts` — the self-feeding-read
  guard, asserted at the query level where it actually lives.
- `src/app/admin/golf/tracer/__tests__/tracer-shared.test.ts` — the Tracer's
  pure grouping/rendering helpers, including `tracerIncidentGroupKey`.
- Typecheck/build for admin UI changes.
- Targeted smoke/browser checks for admin dashboards when changing route-level code.

## Related Docs

- `docs/ADMIN_DASHBOARD_UPGRADE_PLAN.md`
- `docs/BI_DASHBOARD_ARCHITECTURE.md`
- `docs/OBSERVABILITY.md`
- `docs/SECURITY_AUDIT.md`
