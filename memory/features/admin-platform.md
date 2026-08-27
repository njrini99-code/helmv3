# Feature: Admin Platform

## Status

- active

## Current State

Admin Platform is the internal operations and monitoring surface for Helm/GolfHelm. It includes the main admin dashboard, data quality/tracer views, platform health, BI-style reporting, user/team activity, audit/security views, and a CRM/admin outreach subsystem.

This area is high criticality because it often uses broader access patterns, operational data, and admin/server-only helpers.

## Primary Entry Points

### Routes

- `src/app/admin/**` (Helm Bridge)
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
