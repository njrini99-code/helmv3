# INC-2026-09-30: best-effort budget aborts looped through triage as REGRESSED

- Feature: `coachhelm_ai`
- Surface: `/admin/errors/8ff00f0e`, `/admin/errors/20ed2ddd` (Bridge triage queue)
- Status: FIXED in c706fc80e (#2106; branch commit 0e1abb150 before squash); live in production since ef6e017a2. Verified 2026-10-03: 8ff00f0e and 20ed2ddd have no rows in 24h, and the abort now logs at info (888744a0)
- Risk: R1. Logging tier only. No schema, RLS, grant or data change.
- Signal: `admin_events` warning rows `fetchShotDriversByCategory failed (continuing without shot drivers): AbortError: This operation was aborted` (8ff00f0e, 21 total, 7 in the 24h to 2026-09-30 15:47Z, reopened 3x) and `getTopInsightForPlayer.urgent failed (continuing without urgent pass): TimeoutError: The operation was aborted due to timeout` (20ed2ddd, 5 total, reopened 4x).

## What was wrong

Both are best-effort reads in `src/app/golf/actions/insight-delivery.ts`
guarded by their own abort budget (`BEST_EFFORT_QUERY_TIMEOUT_MS`); on a trip
the page renders without the enrichment, by design. The miss was logged with
`logServerError(..., 'warning')`, which puts it on the triage queue. Each has a
NOT A DEFECT analysis, so the nightly Close sweep resolved it and the next
abort reopened the fingerprint as REGRESSED — noise that looked like a
regression every day.

## Fix

`src/lib/coachhelm/best-effort-miss.ts`: `logBestEffortMiss` logs a budget
abort (AbortError / TimeoutError / "operation was aborted" / statement timeout)
at `info` with `durableCollapse` (the #2066 treatment for 57d84dd1). Any other
failure on those paths stays a `warning`. Both keep `skipSentry`.

Regression test: `src/lib/coachhelm/__tests__/best-effort-miss.test.ts`
(fails on 368f7bef8 with the module missing; passes with the fix). Replay:
`replay/manifests/best-effort-budget-abort-2026-09-30.yml`.

## Not fixed here

The aborts cluster (2026-09-30 00:19–00:30Z, six in 11 minutes; ~02:00Z on
09-28 and 09-29, beside the 02:00 roster-sweep cron), which suggests the
`golf_shots` walk competes for the database under load. The `info` rows keep
the count visible; a sustained rise is a performance item, not triage noise.
The Sentry auto-instrumentation copy of the same abort (rel:d9a718a4) is a
separate path and is not changed.
