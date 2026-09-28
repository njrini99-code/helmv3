# INC-2026-09-28: the roster standing loader read golf_team_members once per player

- Feature: `coachhelm_ai`
- Surface: `GET /golf/dashboard/roster` (coach roster cards, via `loadPlayersStandingMap`)
- Status: fix in PR (agent/health-20260928-1247); awaiting merge and production deploy (production 6ee77e98 as of 2026-09-28 16:47Z)
- Risk: R1. Read path only. No schema, RLS, grant or data-shape change; cohort classification unchanged.
- Also covers: Sentry JAVASCRIPT-NEXTJS-R3 (`from(golf_team_members)` N+1 on `GET /golf/dashboard/stats/team`, 65 events, last 2026-09-28 20:50Z), which reaches the same `loadPlayersStandingMap`.
- Signal: Sentry N+1 Query JAVASCRIPT-NEXTJS-QK (performance issue, level info, 0 users), 164 events since 2026-09-02, last 2026-09-28 15:54Z on production release 6ee77e98. The trace shows five parallel ~700ms `golf_team_members` reads on one roster render. Not a Bridge (admin_events) fingerprint.

## What was wrong

`loadPlayersStandingMap` in `src/lib/coachhelm/v3/standing/loader.ts` batches
the `golf_player_standing` read, but then resolved every distinct player's
cohort with `loadPlayerCohort(id)` inside a `Promise.all`. Each call is its own
admin `golf_team_members` select: N reads for N players on the roster.

## Fix

- `loadPlayerCohorts(ids)` in
  `src/lib/coachhelm/v3/counterfactual/player-cohort-loader.ts`: one
  `.in('player_id', chunk)` read per 150 ids with the same `status='active'`
  filter, the same womens-if-any-active-membership rule, and the same men's
  fail-safe on error. Every requested id gets an entry.
- `loadPlayersStandingMap` uses it. `loadPlayerCohort` (single player,
  generators) is unchanged apart from sharing the classification helper.

## Proof

- `src/test/coachhelm/v3/standing-loader-roster-cohort-batch.test.ts` fails on
  origin/main 08e6e2e22 (`expected ... length of 1 but got 5`, `got 3`) and
  passes with the fix. The existing cohort-loader, standing gender, column
  fallback and progress-drivers tests pass unchanged.
- Replay: `replay/manifests/roster-cohort-batch-2026-09-28.yml`.

## Verify in production

After deploy: Sentry JAVASCRIPT-NEXTJS-QK stops receiving events.
