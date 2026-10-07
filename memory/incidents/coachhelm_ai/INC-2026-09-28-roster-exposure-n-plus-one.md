# INC-2026-09-28: the roster insight sweep wrote the exposure ledger once per player

- Feature: `coachhelm_ai`
- Surface: `GET /golf/dashboard/stats/team` and every caller of `getTopInsightsForPlayers` (roster cards)
- Status: fix in PR (agent/health-20260928-1247, with the roster cohort fix); awaiting merge and production deploy (production 6ee77e98 as of 2026-09-28 21:48Z)
- Risk: R1. Write batching only: same rows, same surface, same per-player rank_position. No schema, RLS, grant or data-shape change.
- Signal: Sentry N+1 Query JAVASCRIPT-NEXTJS-R2 (performance issue, level info, 0 users), 63 events since 2026-09-02, last 2026-09-28 20:31Z on production release 6ee77e98. Offending span: `from(golf_insight_exposure)`. Not a Bridge (admin_events) fingerprint. Related: f34bc102 (`recordInsightExposure insert failed: fetch failed`), whose bursts this N-way fan-out feeds.

## What was wrong

`getTopInsightsForPlayersImpl` in `src/app/golf/actions/insight-delivery.ts`
batches the `golf_coach_insights` read, then called
`recordExposureForReturned(sliced, 'roster_card')` inside its per-player loop.
Each call is a fire-and-forget `recordInsightExposure`, which does its own
`golf_insight_exposure` dedup read and insert: N reads and N inserts for N
players.

## Fix

Rows are built per player with `buildExposureRows` (so `rank_position` stays
per-player) and written in ONE `recordInsightExposure` call per sweep.

## Proof

- `src/app/golf/actions/__tests__/insight-delivery-roster-exposure-batch.test.ts`
  fails on c5d8fc789 (`expected vi.fn() to be called 1 times, but got 3 times`)
  and passes with the fix.
- Replay: `replay/manifests/roster-exposure-batch-2026-09-28.yml`.

## Verify in production

After deploy: Sentry JAVASCRIPT-NEXTJS-R2 stops receiving events.
