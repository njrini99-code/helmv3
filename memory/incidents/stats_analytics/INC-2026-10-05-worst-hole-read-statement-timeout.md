# INC-2026-10-05 — worst-hole read hits the statement timeout

- Feature: `stats_analytics`
- Surface: `stats_data.getWorstHoleAnalysis` (GET /golf/dashboard/stats)
- Fingerprint: `b99a5da6` (/admin/errors/b99a5da6); Sentry JAVASCRIPT-NEXTJS-Z0, JAVASCRIPT-NEXTJS-XP
- Status: fixed in PR (awaiting merge and deploy)
- First seen: 2026-09-18 (fingerprint); regressed 2026-10-01 after an auto-resolve
- Last seen: 2026-10-05T15:48Z; 24 occurrences in the 24h before 2026-10-05T15:50Z, 11 users (Sentry XP)

## Symptom

The stats dashboard's worst/best-holes section failed with Postgres 57014
"canceling statement due to statement timeout" (the `authenticated` role's 8 s
limit). The section rendered its failed state.

## Root cause (measured 2026-10-05, production, read-only EXPLAIN ANALYZE as a player)

The read embedded `golf_rounds!inner(...)` and filtered on it. PostgREST renders
the embed as a LATERAL subquery with its own LIMIT/OFFSET, which Postgres cannot
flatten, so the plan walked every golf_holes row on the platform in
(round_id, hole_number) order, ran the golf_holes RLS EXISTS per row (12,310
probes), and only then matched this player's rounds: 2,049 ms for 234 rows.
The same rows read through the player's round ids took 142 ms. The cost grows
with every hole any team records, and dashboard concurrency pushed it past 8 s.

## Fix

`getWorstHoleAnalysisImpl` reads the player's completed, non-test round ids
first, then `golf_holes` with `in('round_id', ...)` (chunked at 100), in the
same (round_id, hole_number, id) order. No schema or RLS change.

## Regression tests

- src/app/golf/actions/__tests__/stats-data.test.ts — "reads holes by the player's round ids, never through an embedded golf_rounds join"
- src/app/golf/actions/__tests__/stats-data-round-scope.test.ts — test rounds stay excluded on the new rounds read

## Related

Other `!inner` embeds that filter on the embedded table can have the same plan
shape (for example the golf_shots read seen at 1.4 s mean in pg_stat_statements
on 2026-10-05). Not fixed here; candidates for the next run.
