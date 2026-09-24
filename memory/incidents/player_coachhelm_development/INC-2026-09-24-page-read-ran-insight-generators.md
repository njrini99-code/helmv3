# INC-2026-09-24 — the player CoachHelm page ran all 20 insight generators on every view

- Feature: `player_coachhelm_development`
- Also affects: `coachhelm_ai`
- Surface: `player_coachhelm_dashboard`
- Status: REPAIRED IN PR (agent/coachhelm-read-no-generators) — awaiting deploy and a quiet proof window
- Risk: R1 — performance/availability; no schema, RLS, auth or billing change
- First seen: 2026-09-24T00:50Z; last seen 2026-09-24T01:41Z
- Bridge fingerprints (one root cause): `57d84dd1` (166 stale-writer CAS backoffs),
  `80142968`, `ac69c80b`, `50b1304c`, `4263ab45`, `2187b037` (statement timeouts),
  `582b401f` (`cookies()` after the response closed), the `analyzePlayer.tier1Generator`
  family (`d113a765`, `c10df63a`, `12c91578`, `a50b47a0`, …) and ~50 downstream siblings
  across Intelligence, login and `/api/health`. About 630 Bridge rows in 38 minutes.

## Symptom

Between 00:50 and 01:28 UTC Postgres went from ~1k to ~27k transactions per
five minutes and active connections from 0 to 17. Reads across the app hit the
8s `statement_timeout`: CoachHelm, the Intelligence hub, player hub, login
(`AuthRetryableFetchError`) and the `/api/health` readiness probe (503).

Sentry attributes every event in the window to `HeadlessChrome` in `iad1`:
two automated sessions (one player account, one coach account, both
founder-owned) reloading `/golf/dashboard/coachhelm` and
`/golf/dashboard/intelligence`. No customer traffic was involved, but two
sessions were enough, which is the defect.

## Root cause

`getPlayerCoachHelmDashboardImpl` (`src/app/golf/actions/insights.ts`) calls
`coachHelmIntelligence.analyzePlayer` on every page load. It already passed
`persistPatterns: false` so the read would not upsert `golf_patterns_v2`
(the 40P01 deadlock fix), but `analyzePlayer` also runs 20 Tier-1 generators
in parallel (`src/lib/coachhelm/v2/orchestrator.ts`), each reading raw
`golf_shots` / cache rows and upserting `golf_coach_insights`, followed by
composite synthesis, which writes too. One page view meant 20+ parallel heavy
reads plus writes. Concurrent renders for the same player raced the same
insights (the CAS backoffs) and the shot reads (~0.5–1.7s each under per-row
RLS) stacked until the pool saturated. Renders that ran past the client's
patience finished after the response closed, which is where `582b401f`
(`cookies()` in the `after` phase) comes from.

That breaks the invariant the read-only test already states, "a page READ must
not WRITE". The flag only covered the smaller of the two writes.

## Repair

- New `AnalysisOptions.runInsightGenerators` (default `true`). When `false`,
  `analyzePlayer` runs no Tier-1 generators and skips composite synthesis.
- The player dashboard read passes `runInsightGenerators: false`. Its insights
  still render: the round-submit trigger, the 30-minute safety-net cron and
  the nightly roster sweep write them, and `loadEvidenceBackedInsights` reads
  them.
- Every writer (post-round trigger, crons, `analyzePlayer` / `generateTeamInsights`
  / alerts actions) omits the option and is unchanged.

Regression test:
`src/app/golf/actions/__tests__/player-coachhelm-dashboard-readonly.test.ts`
(red on `origin/main`, green with the fix).

## Not fixed here (owner decision, R3)

The shot reads are slower than they need to be: `golf_shots_select` evaluates an
`EXISTS` over `golf_rounds` with `is_golf_team_coach()` per returned row
(EXPLAIN as the coach account: 3,051 rows, 668ms, 33k buffer hits in the
per-row subplan), and there is no `(round_id, shot_type)` index, so a putting
read BitmapAnds against the 22k-entry `shot_type` index once per round. Both
are RLS/migration changes and need the owner's review.
