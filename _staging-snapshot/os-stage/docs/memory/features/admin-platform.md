# Feature: Admin Platform

```
feature_id: admin_platform
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: partial
```

## Purpose

The internal operations, monitoring, and outreach surface for Helm/GolfHelm:
the admin dashboard (Bridge), data-quality/tracer views, platform health, a
BI-style reporting layer, user/team activity, audit/security views, and a
CRM/admin-outreach subsystem for coach acquisition. High criticality because
it legitimately uses broad read access and admin/service-role helpers that
must never leak into a client bundle.

## User Contract

Internal staff/owner only — not coach- or player-facing. Surfaces must stay
dense, scannable, and operational: health, errors, data freshness, and
"needs attention" states visible without hunting, and never showing a green
status the underlying data doesn't support ("fake-green" was a real,
recently-fixed bug — see Incident History).

## Current Behavior

- Routes: `src/app/golf/admin/**` (main dashboard tabs — People, System, CRM,
  etc.) and `src/app/golf/admin/crm/**` (coach-outreach CRM).
- `admin_events` is the shared error/incident table behind the Bridge UI.
  Every native insert path (`src/lib/server-error-logger.ts`'s
  `writeAdminTables`, `src/app/api/log-error/route.ts`) inserts without
  setting `resolved` — the column's `DEFAULT false` always applies, so a
  fingerprint that fires again after auto-resolve reappears on its own via a
  fresh row.
- `src/lib/admin/auto-resolve.ts` (552 lines) runs four independent
  resolution rules, all scored off one snapshot read of currently-unresolved
  rows so nothing is resolved twice: **Rule A** (release-aware — newest READY
  deploy ≥24h old and the fingerprint produced nothing since) — skipped
  entirely for fingerprints carrying `provider_*_credit_exhausted` /
  `_invalid_credential` / `_missing_credential` / `_plan_gated_model` codes,
  since silence there does not mean fixed; **Rule B** (quiet fallback — 14
  days silent, runs even when Vercel is unconfigured); **Rule C** (legacy
  rows with no fingerprint, same 14-day window); **Rule D** (classifier-driven
  — `classifyIncident()` already labels a row `actionable: false` from its
  content alone, and the UI already hides those rows, so Rule D resolves them
  at read time instead of waiting on staleness). Rule D landed today
  (`fbd74c13c`, PR #1550) — it did not exist before this week.
- CRM: `crm_coaches` pipeline, `crm_sequences`/`crm_sequence_steps`,
  `crm_events`, `crm_email_events`/`crm_email_templates`,
  `crm_contact_log`/`crm_replies`, `crm_google_calendar_tokens`, all real
  tables (verified against `src/lib/types/database.ts`).
- Several admin-dashboard accuracy fixes landed today (all on `HEAD`'s
  ancestry): the People tab no longer counts baseball users or demo teams as
  real golf coaches/players (`d7d512ba5`); the System tab stops showing a
  fake-green status when the underlying signal is bad (`ab2b529dc`); stale
  abandoned rounds stopped surfacing as "in progress" across every admin
  surface (`4336062bf`); "Needs Your Eyes" surfaces news instead of
  archaeology (`61444ee1c`); a further batch of small accuracy debts from a
  Bridge audit (`169533d99`, #1579).

## Invariants

- `admin_events.resolved` defaults `false` at every insert path and is never
  set explicitly on insert — this is what makes recurrence self-healing
  without extra code.
- Auto-resolve's bulk `UPDATE` per rule is bounded by `created_at < cutoff`
  (the same cutoff used to compute staleness), so a fresh row inserted
  between the snapshot read and the update can never be swept up and
  silently marked resolved.
- Admin mutations still require authorization and auditability even though
  reads are broad; service-role behavior stays server-only.
- CRM automation/suppression must respect opt-out and reply-stop logic.
- Cron/admin endpoints authenticate via configured secrets, guarded by
  `src/test/lib/cron/auth.test.ts` / `src/test/api/cron/shared-auth.test.ts`.

## Primary Journeys

1. Staff opens `/golf/admin` → reviews People/System/CRM/health tabs →
   drills into "needs attention" items.
2. Incident triage: `admin_events` rows filtered `.eq('resolved', false)` by
   `fetchIncidentFeed`/`queryAppErrorEvents` → staff acts, or auto-resolve
   clears stale/non-actionable rows nightly.
3. CRM outreach: `crm_coaches` → `crm_sequences`/`crm_events` → automated
   send with suppression/reply-stop checks (`crm-automations.ts`,
   `crm-replies.ts`, `crm-gmail-send.ts`).

## Architecture/Data Flow

```txt
Error/event occurs
  -> logServerError / writeAdminTables / POST /api/log-error
  -> INSERT admin_events (resolved defaults false)
  -> classifyIncident() labels actionable true/false
  -> Bridge UI reads unresolved rows

Nightly auto-resolve
  -> snapshot unresolved rows once
  -> Rule A (release+24h quiet) | Rule B (14d quiet) | Rule C (legacy, no fingerprint)
     | Rule D (classifier says non-actionable)
  -> bounded bulk UPDATE resolved=true per rule
```

## Permissions/Tenancy

Admin routes and actions are staff/owner-gated, not coach/player-scoped.
Action files: `src/app/golf/actions/admin-{data,people-data,system-data,
tracer-data,bi-data}.ts`, `admin/**` (`demo-teams.ts`, `rollup-a/b/c.ts`),
`crm-*.ts` (17 files), `resend-activity.ts`. Server-only helpers live under
`src/lib/supabase/admin*` and `src/lib/admin/**`.

## Dependencies

supabase, datadog, sentry, resend (CRM email), crm (self).

## Failure Modes

- Rollup/BI dashboards can look live while backed by stale data — the
  System-tab fake-green bug (`ab2b529dc`) was exactly this class of failure,
  fixed today.
- `admin-data.ts` (159 KB) and `admin-tracer-data.ts` (70 KB) are large,
  heavily-churned single files (both touched again today at 12:55) with no
  per-export test coverage beyond the cron/auth guards — high blast radius
  for any future edit.
- Auto-resolve mistakes could hide real errors; Rule D was scoped narrowly
  (content-based classification only, never silence/age) specifically to
  avoid that — see the OS doctrine "self-healing must not hide errors."

## Observability Contract

`admin_events` is the observability substrate for the rest of the platform.
`src/lib/admin/{auto-resolve,incident-classification,deploy-marker,
observe-action-result,provider-fault}.ts` implement classification,
resolution, and deploy-awareness. Any golf server action wrapped in
`withAdminObserved` feeds this table.

## Test Contract

- `src/test/lib/cron/auth.test.ts`, `src/test/api/cron/shared-auth.test.ts`
- `src/lib/admin/__tests__/{auto-resolve,observe-action-result,
  incident-resolver,deploy-marker}.test.ts`
- Typecheck/build for admin UI changes; targeted browser checks for route-level
  changes.

## Known Debt/Unknowns

- `admin-data.ts` and `admin-tracer-data.ts`'s individual exports were not
  re-verified line-by-line this pass — correctness rests on today's commit
  messages, not an independent re-read of every tab.
- Tonight's fix queue also named F17 ("audit-log rows set resolved at write
  or routed to an activity log") — not independently confirmed shipped in
  this pass; treat as open until re-checked against `src/lib/admin/`.
- `src/lib/admin/feature-registry.ts` is a separate *runtime* observability
  registry (health tiers, heartbeats, action manifests) from
  `memory/registry.yml`. The compact OS contract
  (`memory/system/golfhelm-engineering-os.md`, installed the same day as
  this doc's `last_verified_sha`) confirms the two registries already
  disagree on file/action ownership for 4 shared-spelling ids — none of
  which is `admin_platform` itself, but `admin_platform`'s own entry has not
  been cross-checked (the `knowledge:registry-check` script does not exist
  yet).
- The prior generation of this doc deliberately listed no explicit table
  names in Core Data; this revision adds `admin_events`, `audit_log`, and the
  `crm_*` tables as verified-real but does not attempt a full enumeration —
  use `src/lib/types/database.ts` as the generated source for anything not
  named here.

## Incident History

This week (`memory/` has no `incidents/admin_platform/` directory yet — this
section is backfilled from `git log` and tonight's `/tmp/claude/night/
ledger.md` triage, not from a durable incident file):

- Auto-resolve Rule D shipped (`fbd74c13c`, PR #1550) — closes the "F16"
  fix-queue item: non-actionable telemetry no longer piles up unresolved.
- `admin_events` backlog cleanup (w-bridge-3, tonight): 3,661 → 369
  unresolved rows resolved with evidence; root cause was structural
  (auto-resolve's pre-Rule-D quiet-window heuristics could never fire for
  continuous telemetry).
- Same-day admin-dashboard accuracy fixes: `#1579`, `#1578` ("System tab
  stops showing fake-green status"), `#1575` (People tab miscounted baseball
  users/demo teams as real), `#1559` (stale abandoned rounds), `#1585`
  ("Needs Your Eyes surfaces news, not archaeology").

## ADR Links

None yet.

## Verification Evidence

- Read in full: `src/lib/admin/auto-resolve.ts` (Rules A–D + operator-gated
  exclusion doc comment).
- Confirmed via `git log`: `fbd74c13c`, `169533d99`, `ab2b529dc`, `d7d512ba5`,
  `4336062bf`, `61444ee1c` all present on `HEAD`'s ancestry.
- Confirmed table existence in `src/lib/types/database.ts` (pattern
  `^\s+<table>: \{`): `admin_events` (1), `audit_log` (1); confirmed `crm_*`
  tables via foreign-key/table-name grep (`crm_coaches`, `crm_contact_log`,
  `crm_email_events`, `crm_email_templates`, `crm_events`,
  `crm_google_calendar_tokens`, `crm_notes`, `crm_replies`,
  `crm_sequence_enrollments`, `crm_sequence_steps`, `crm_sequences`).
- Confirmed file existence (`/bin/ls`): all six `admin-*.ts` action files,
  `admin/` subdirectory (`demo-teams.ts`, `rollup-a.ts`, `rollup-b.ts`,
  `rollup-c.ts`, `rollup-c.shared.ts`), 17 `crm-*.ts` files,
  `src/app/golf/admin/`, `src/app/golf/admin/crm/`.
- Confirmed test files listed above exist on disk.
- Did not execute the test suite or re-read every export of `admin-data.ts`/
  `admin-tracer-data.ts` — relied on commit messages and code comments for
  those files' current correctness.
