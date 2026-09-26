# INC-2026-09-26: the safety-net cron read golf_rounds once per parked player

- Feature: `coachhelm_ai`
- Surface: `GET /api/cron/coachhelm-safety-net`
- Status: FIXED in 6ef000d89 on branch agent/health-20260926-1847; not merged yet
- Risk: R1. Read path only. No schema, RLS, grant or data-shape change; coverage and wake rules unchanged.
- Signal: Sentry N+1 Query JAVASCRIPT-NEXTJS-107 (performance issue, 0 users), 26 events since 2026-09-24. Not a Bridge (admin_events) fingerprint.

## What was wrong

`reconcileParkedRounds` (`src/app/api/cron/coachhelm-safety-net/route.ts`)
asked, for each parked player, for that player's newest analyzed round with
its own `golf_rounds` query. On 2026-09-26 production held 20 legacy-parked
rounds (`engine_no_recent_rounds` x15, `engine_membership_missing` x5) across
13 players. None has a newer analyzed round, so they stay parked and every
30-minute tick repeated the same 13 reads.

## Fix

- `prefetchNewestAnalyzed` reads the newest analyzed round for every player
  the tick can examine (at most `RECONCILE_PLAYER_LIMIT`) in one query,
  ordered newest first, capped at 1000 rows.
- A player the read cannot vouch for (absent from a capped read), or every
  player when the read errors, takes the old per-player read, which keeps its
  fail-closed `logWakeReadFailure` handling.
- Not changed: the per-player reads in `meetsRoundFloor` and
  `hasActiveMembership` (other tables, fewer players). Follow-up if Sentry
  flags them.

## Proof

- `src/test/api/cron/coachhelm-safety-net-reconcile.test.ts`, describe
  "coverage read is batched": the read-count test fails on origin/main
  8abeccd2a (`expected 9 to be 5`) and passes with the fix; the coverage and
  truncation-fallback tests pass on both and guard the behaviour.
- Replay: `replay/manifests/safety-net-coverage-prefetch-2026-09-26.yml`.

## Verify in production

After deploy: Sentry JAVASCRIPT-NEXTJS-107 stops receiving events, and the
safety-net heartbeat stays `success: true`.
