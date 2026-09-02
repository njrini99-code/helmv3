# INC-2026-08-26 — error_rate_hourly read as data, written by nothing

- Feature: `admin_platform`
- Status: repaired — verified against production read-only; not yet
  deployed (this repo's production is an on-demand promote, not a merge-time
  effect — see `memory/ledgers/deployments.md`)
- Risk: R1 — narrow repair confined to one action file's data source; no
  auth, RLS, or migration change
- First seen: 2026-08-25 (Helm Bridge follow-up audit item, "Task C")
- Repair SHA: recorded in the follow-up ledger commit on `feat/bridge-todo`

## What was wrong

`getSystemTabData()` (`src/app/golf/actions/admin-system-data.ts`) queried
`public.error_rate_hourly` for the System tab's hourly error-trend series.
That table has a full schema, RLS policies, and a service-role write grant
(`supabase/migrations/20260527000000_prod_public_baseline.sql`), which reads
as a real, live rollup. Nothing writes to it: no INSERT anywhere in app code,
no populating function, no trigger, no `pg_cron` job in any migration or in
`cron.job`, and none of the project's four Edge Functions touch it. A query
against a table nothing writes always returns zero rows, and the read path
mapped that to `totalErrors: 0, criticalErrors: 0, userFacingErrors: 0,
affectedUsers: 0` for every hour — indistinguishable from "measured, and
genuinely quiet."

## Verification (read-only, against production project `qmnssrrolpinvwjjnufo`)

- `select count(*) from public.error_rate_hourly` → **0 rows**, `max(hour)`
  → **NULL**.
- `cron.job` has no row naming `error_rate_hourly` or `error_rate`.
- `pg_proc` has no function whose name contains `error_rate`.
- `pg_trigger` on `public.error_rate_hourly` → **no rows** (the table has no
  triggers at all, custom or FK).
- The four active Edge Functions (`create-admin-user`, `send-apns-push`,
  `personalize-email`, `verify-emails`) have nothing to do with error rollups.
- By contrast, `public.admin_events` — the table `deriveErrorTrend` now reads
  — held 96,426 rows (93,829 `event_type = 'error'`) at verification time,
  confirming it as the table app code actually writes.
- `getSystemTabData` / `SystemTabData` had **zero consumers** anywhere in the
  repo at the time of this fix (confirmed by repo-wide grep) — the old
  `golf/admin` System tab that likely called it is being removed by a
  concurrent Helm Bridge migration effort, and nothing under `src/app/admin`
  has been wired to it yet. The read was already dead code with respect to
  rendering, on top of being permanently empty.

## Repair

`error_rate_hourly` is no longer queried. The hourly error trend is now
derived in-process from `admin_events` (event rows the app already writes on
every classified error), scoped by `event_type = 'error'` and the same
trailing-7-day window the rest of the System tab uses, then bucketed into one
entry per hour by a new pure helper, `deriveErrorTrend`. A quiet hour still
reports `totalErrors: 0` — but now that zero is a real query result over a
real table, not a permanent artifact of an unwritten one.

`userFacingErrors` — a field the old `error_rate_hourly` row shape carried —
was dropped rather than derived. Nothing in this codebase classifies an
`admin_events` row as user-facing vs. not, and 91% of `event_type = 'error'`
rows in production carry `source: null` (verified 2026-08-26), so any
user-facing/not split over that data would be an invented rule, not a
recovered one. Deriving the other three fields (`totalErrors`,
`criticalErrors` off `severity = 'critical'`, `affectedUsers` off distinct
`user_id`) is a genuine equivalent — those are established, existing
`admin_events` columns already used the same way elsewhere in the codebase
(e.g. `severity` in `src/lib/admin/incident-classification.ts`); inventing a
"user-facing" rule to fill the fourth field would have repeated the exact
mistake — a number that looks measured but isn't — that this fix removes.

`affectedUsers` is kept but documented as partial, not full: it counts
distinct non-null `user_id` values per hour, and ~54% of `event_type =
'error'` rows in the trailing 7-day window carry a null `user_id` (verified
2026-08-26) — mostly server-side/unauthenticated failures the row can't
attribute to a signed-in user. Unlike `userFacingErrors` (91% null `source`,
no honest derivation at all), 46% of rows here ARE attributable, so the field
is real and worth keeping — it just isn't a full count, and the doc comment
on both the interface field and `deriveErrorTrend` says so.

**Correction from an advisor review pass, applied before this landed:** the
first version of this fix ordered the bounded `admin_events` query
`created_at ASCENDING`, which — had a future spike ever pushed the 7-day
window past `ERROR_TREND_ROW_CAP` (20,000) — would have made `LIMIT` keep the
OLDEST rows and silently truncate the newest hours to a fabricated
`totalErrors: 0`, reproducing this exact incident's shape (a zero that looks
measured but isn't) at the most-watched end of the series, during the spike
that made someone open the dashboard. Fixed to `ascending: false` before any
row-cap risk existed in a shipped state, plus a new `errorTrendTruncated`
boolean on `SystemTabData` that flags when the cap actually fires, and a test
pinning both the ordering and the flag.

## Verification of the repair

- `src/app/golf/actions/__tests__/admin-system-data.test.ts` (new, 5 tests):
  `error_rate_hourly` is never queried and `admin_events` is queried with
  `event_type = 'error'` ordered `created_at DESCENDING`; rows bucket
  correctly into `totalErrors`/`criticalErrors`/`affectedUsers` with no
  `userFacingErrors` key present; an `admin_events` query error degrades
  `errorTrend` to `[]` without throwing and without affecting sibling data;
  the trend covers one entry per hour across the ~7-day window, including
  zero-event hours, with `errorTrendTruncated: false`; a row count at the cap
  sets `errorTrendTruncated: true` and logs it.
- `./node_modules/.bin/vitest run --project unit
  src/app/golf/actions/__tests__/admin-system-data.test.ts` — 5 passed.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — no errors attributable
  to this change (pre-existing, unrelated errors in `golf.ts` and one
  concurrently-edited test file are untouched by this fix).
- `./node_modules/.bin/eslint src/app/golf/actions/admin-system-data.ts
  src/app/golf/actions/__tests__/admin-system-data.test.ts` — clean.

## Scope note

`src/app/api/admin/debug-rollup/route.ts` was in scope to check but is
unaffected: it exercises `fetchAdminRollupA/B/C` and `getAdminDashboardData`
only, and never imports `admin-system-data.ts` or references
`error_rate_hourly`. Left untouched.

`auth_metrics_hourly` — queried a few lines below the fixed read, in the same
file — is **also** empty in production (verified: 0 rows, same query pass)
and has the same absent-writer shape. It is out of this incident's scope
(Task C named `error_rate_hourly` specifically) and was not touched; flagging
it here so it is not mistaken for checked.
