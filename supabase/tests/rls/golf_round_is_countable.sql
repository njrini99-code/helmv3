-- pgTAP contract for 20260924120000_golf_countable_round_stats_cache.sql
-- (W13 / OD-01): golf_round_is_countable must agree with isCountableRound in
-- src/lib/golf/round-countable.ts. The cases mirror round-countable.test.ts.
-- The cache functions must call it.

BEGIN;
\ir _helpers.sql

SELECT plan(20);

SELECT ok(public.golf_round_is_countable('completed', 18, 74, 37, 37, 32, -1.2), 'a normal 18-hole round counts');
SELECT ok(NOT public.golf_round_is_countable('completed', 18, 37, 19, 18, 18, 34.51), 'the Sep 17 37-stroke round does not count');
SELECT ok(NOT public.golf_round_is_countable('completed', 18, 37, 19, 18, 18, NULL), 'the Sep 17 shape fails on the stroke floor alone');
SELECT ok(NOT public.golf_round_is_countable('in_progress', 18, 74, 37, 37, 32, NULL), 'a round that is not completed does not count');
SELECT ok(NOT public.golf_round_is_countable('completed', 12, 50, 25, 25, 20, NULL), 'an unsupported length does not count');
SELECT ok(NOT public.golf_round_is_countable('completed', 18, 74, NULL, NULL, NULL, NULL), 'a hole-less round does not count');
SELECT ok(NOT public.golf_round_is_countable('completed', 18, 74, 37, NULL, 32, NULL), 'an 18-hole round with one nine does not count');
SELECT ok(public.golf_round_is_countable('completed', 9, 38, 38, NULL, 16, NULL), 'a full 9-hole round counts');
SELECT ok(public.golf_round_is_countable('completed', NULL, 74, 37, 37, 32, NULL), 'holes_played NULL defaults to 18');
SELECT ok(NOT public.golf_round_is_countable('completed', 9, 24, 24, NULL, 9, NULL), 'the 9-hole stroke floor is 25');
SELECT ok(NOT public.golf_round_is_countable('completed', 18, 53, 26, 27, 36, NULL), 'putts-aware floor: 53 strokes with 36 putts');
SELECT ok(public.golf_round_is_countable('completed', 18, 54, 27, 27, 36, NULL), 'putts-aware floor: 54 strokes with 36 putts');
SELECT ok(NOT public.golf_round_is_countable('completed', 18, 70, 35, 35, 32, 15.5), 'SG above +15 does not count');
SELECT ok(public.golf_round_is_countable('completed', 18, 70, 35, 35, 32, 15), 'SG of exactly +15 counts');
SELECT ok(public.golf_round_is_countable('completed', 18, 88, 49, 39, 34, -18.77), 'a real 88 with SG -18.77 counts (one-sided ceiling)');
SELECT ok(public.golf_round_is_countable('completed', 18, 74, 37, 37, 32, 'NaN'::numeric), 'a NaN SG is ignored like a non-finite SG in TS');
SELECT is(public.golf_round_canonical_total(75, 38, 38), 76, 'canonical total prefers the hole-summed nines');
SELECT is(public.golf_round_canonical_total(38, 38, NULL), 38, 'canonical total falls back to total_score');

SELECT ok(
  (SELECT prosrc LIKE '%golf_round_is_countable%' FROM pg_proc WHERE oid = 'public.update_player_stats_complete()'::regprocedure),
  'update_player_stats_complete applies the countable rule'
);
SELECT ok(
  (SELECT prosrc LIKE '%golf_round_is_countable%' FROM pg_proc WHERE oid = 'public.refresh_player_standing_round_metrics(uuid[])'::regprocedure),
  'refresh_player_standing_round_metrics applies the countable rule'
);

SELECT * FROM finish();
ROLLBACK;
