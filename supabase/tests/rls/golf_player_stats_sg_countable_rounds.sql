-- update_player_stats_strokes_gained(uuid) averages countable rounds only,
-- per 18 holes (migration 20260925120000). Mirrors
-- src/lib/golf/round-countable.ts: a 37-stroke "18-hole" round with SG +34.51
-- is ignored, and a 9-hole round's SG counts x2.

BEGIN;
\ir _helpers.sql

SELECT plan(6);

INSERT INTO public.golf_players (id, first_name)
VALUES ('00000000-0000-0000-0000-00000000bb01', 'Countable')
ON CONFLICT DO NOTHING;

-- r1: normal 18 holes (74). r2: 9 holes (38, front only). r3: broken
-- 37-stroke 18-hole round. All start in_progress, then complete through the
-- lifecycle guard the same way the SG recalculation contract test does.
INSERT INTO public.golf_rounds
  (id, player_id, round_date, status, round_type, holes_played, total_score, front_nine, back_nine, total_putts)
VALUES
  ('00000000-0000-0000-0000-00000000bb11', '00000000-0000-0000-0000-00000000bb01', CURRENT_DATE, 'in_progress', 'practice', 18, 74, 37, 37, 31),
  ('00000000-0000-0000-0000-00000000bb12', '00000000-0000-0000-0000-00000000bb01', CURRENT_DATE, 'in_progress', 'practice', 9, 38, 38, NULL, 16),
  ('00000000-0000-0000-0000-00000000bb13', '00000000-0000-0000-0000-00000000bb01', CURRENT_DATE, 'in_progress', 'practice', 18, 37, 19, 18, 18)
ON CONFLICT DO NOTHING;

SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_rounds
SET status = 'completed'
WHERE player_id = '00000000-0000-0000-0000-00000000bb01';
SELECT set_config('helm.golf_lifecycle_write', '', true);

INSERT INTO public.golf_round_stats_cache
  (round_id, player_id, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting)
VALUES
  ('00000000-0000-0000-0000-00000000bb11', '00000000-0000-0000-0000-00000000bb01', -2.0, 1.0, -1.0, 0.5, -2.5),
  ('00000000-0000-0000-0000-00000000bb12', '00000000-0000-0000-0000-00000000bb01', -1.0, -0.5, -0.25, 0.0, -0.25),
  ('00000000-0000-0000-0000-00000000bb13', '00000000-0000-0000-0000-00000000bb01', 34.51, 17.89, 1.0, 0.7, 14.92);

SELECT lives_ok(
  $$SELECT public.update_player_stats_strokes_gained('00000000-0000-0000-0000-00000000bb01')$$,
  'the stats cache SG refresh runs'
);

-- Countable: r1 (x1) and r2 (x2). tee = (1.0 + -1.0) / 2 = 0.
SELECT is(
  (SELECT sg_tee_per_round::numeric FROM public.golf_player_stats_cache WHERE player_id = '00000000-0000-0000-0000-00000000bb01'),
  0.000::numeric,
  'tee SG per round ignores the 37-stroke round and scales the 9-hole round'
);

SELECT is(
  (SELECT sg_total_per_round::numeric FROM public.golf_player_stats_cache WHERE player_id = '00000000-0000-0000-0000-00000000bb01'),
  -2.000::numeric,
  'total SG per round is the per-18 countable mean ((-2) + (-1 x 2)) / 2'
);

SELECT is(
  (SELECT sg_putting_per_round::numeric FROM public.golf_player_stats_cache WHERE player_id = '00000000-0000-0000-0000-00000000bb01'),
  -1.500::numeric,
  'putting SG per round is ((-2.5) + (-0.25 x 2)) / 2'
);

-- With only the broken round left, the stale average is cleared.
DELETE FROM public.golf_round_stats_cache
WHERE round_id IN ('00000000-0000-0000-0000-00000000bb11', '00000000-0000-0000-0000-00000000bb12');

SELECT lives_ok(
  $$SELECT public.update_player_stats_strokes_gained('00000000-0000-0000-0000-00000000bb01')$$,
  'the refresh runs with no countable round'
);

SELECT is(
  (SELECT sg_total_per_round FROM public.golf_player_stats_cache WHERE player_id = '00000000-0000-0000-0000-00000000bb01')::numeric,
  NULL::numeric,
  'no countable round clears the cached SG instead of keeping the broken average'
);

SELECT * FROM finish();
ROLLBACK;
