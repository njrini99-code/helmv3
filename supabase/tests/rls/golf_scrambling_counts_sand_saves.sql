-- Scrambling counts sand saves, and Sand saves stays its own stat
-- (20261116200000_golf_scrambling_counts_sand_saves.sql). A scramble chance is
-- a missed green or a greenside-bunker visit, one per hole; made is par or
-- better after a missed green, or a sand save at any score. Both cache writers
-- (update_round_stats_cache, refresh_player_stats_cache) and the backfill use
-- the one rule; holeScramble in src/lib/golf/stat-formulas.ts is its app twin.

BEGIN;
\ir _helpers.sql

SELECT plan(9);

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-5c70-000000000001', 'scramble-sand@helm.test', 'authenticated')
ON CONFLICT DO NOTHING;
INSERT INTO public.users (id, email, role) VALUES
  ('00000000-0000-0000-5c70-000000000001', 'scramble-sand@helm.test', 'player')
ON CONFLICT DO NOTHING;
INSERT INTO public.golf_players (id, user_id, first_name) VALUES
  ('00000000-0000-0000-5c71-000000000001', '00000000-0000-0000-5c70-000000000001', 'Scramble Sand')
ON CONFLICT DO NOTHING;
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type, holes_played) VALUES
  ('00000000-0000-0000-5c72-000000000001', '00000000-0000-0000-5c71-000000000001', CURRENT_DATE, 'in_progress', 'practice', 6);

-- GIR comes from score minus putts (no shots), so putts set each hole's green:
--   1 par 4, 4 with 1 putt: missed green, par            -> chance, made
--   2 par 5, 4 with 1 putt: GIR, sand save (bunkered in 2) -> chance, made (new)
--   3 par 4, 5 with 1 putt: missed green, bogey, sand save -> chance, made (new)
--   4 par 4, 6 with 2 putts: missed green, sand miss       -> chance, not made
--   5 par 3, 3 with 2 putts: GIR, no bunker                -> no chance
--   6 par 5, 6 with 3 putts: GIR, sand miss                -> chance, not made (new)
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-5c70-000000000001', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par, score, putts, sand_save) VALUES
  ('00000000-0000-0000-5c73-000000000001', '00000000-0000-0000-5c72-000000000001', 1, 4, 4, 1, NULL),
  ('00000000-0000-0000-5c73-000000000002', '00000000-0000-0000-5c72-000000000001', 2, 5, 4, 1, TRUE),
  ('00000000-0000-0000-5c73-000000000003', '00000000-0000-0000-5c72-000000000001', 3, 4, 5, 1, TRUE),
  ('00000000-0000-0000-5c73-000000000004', '00000000-0000-0000-5c72-000000000001', 4, 4, 6, 2, FALSE),
  ('00000000-0000-0000-5c73-000000000005', '00000000-0000-0000-5c72-000000000001', 5, 3, 3, 2, NULL),
  ('00000000-0000-0000-5c73-000000000006', '00000000-0000-0000-5c72-000000000001', 6, 5, 6, 3, FALSE);
SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT string_agg(coalesce(gir::text, 'null'), ',' ORDER BY hole_number) FROM public.golf_holes WHERE round_id = '00000000-0000-0000-5c72-000000000001'),
  'false,true,false,false,true,true',
  'the one GIR rule reads each hole as the fixture intends'
);

SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_rounds
SET status = 'completed', total_score = 28, score_to_par = 3
WHERE id = '00000000-0000-0000-5c72-000000000001';
SELECT set_config('helm.golf_lifecycle_write', '', true);

SELECT is(
  (SELECT scramble_attempts FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-5c72-000000000001'),
  5,
  'round cache: 5 scramble chances (3 missed greens, plus 2 bunker visits on GIR holes, each hole once)'
);
SELECT is(
  (SELECT scrambles_converted FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-5c72-000000000001'),
  3,
  'round cache: 3 scrambles (a par after a missed green, plus 2 sand saves at any score)'
);
SELECT is(
  (SELECT row(sand_saves, sand_attempts)::text FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-5c72-000000000001'),
  row(2, 4)::text,
  'Sand saves is unchanged and still its own stat: 2 of 4'
);

-- The player cache writer counts the same rule.
SELECT public.refresh_player_stats_cache('00000000-0000-0000-5c71-000000000001');
SELECT is(
  (SELECT row(scrambles_converted, scramble_attempts)::text FROM public.golf_player_stats_cache WHERE player_id = '00000000-0000-0000-5c71-000000000001'),
  row(3, 5)::text,
  'player cache: refresh_player_stats_cache counts 3 of 5, as the round cache does'
);

-- The backfill finds a cache written on the old rule (missed greens only) and
-- refreshes it, archiving the old counts first.
UPDATE public.golf_round_stats_cache
SET scrambles_converted = 1, scramble_attempts = 3
WHERE round_id = '00000000-0000-0000-5c72-000000000001';

SELECT ok(
  helm_private.golf_backfill_scrambling_sand_saves() >= 1,
  'the backfill refreshes at least the stale round'
);
SELECT is(
  (SELECT row(old_scrambles_converted, old_scramble_attempts, new_scrambles_converted, new_scramble_attempts)::text
   FROM helm_private.golf_round_cache_scrambling_fix_20261116 WHERE round_id = '00000000-0000-0000-5c72-000000000001'),
  row(1, 3, 3, 5)::text,
  'the archive keeps the old 1 of 3 and the new 3 of 5'
);
SELECT is(
  (SELECT row(scrambles_converted, scramble_attempts)::text FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-5c72-000000000001'),
  row(3, 5)::text,
  'after the backfill the round cache reads 3 of 5'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'helm_private.golf_round_cache_scrambling_fix_20261116', 'SELECT'),
  'the archive is not readable by signed-in users'
);

SELECT * FROM finish();
ROLLBACK;
