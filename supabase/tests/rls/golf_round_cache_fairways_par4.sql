-- A round's cached fairways count par 4 and 5 holes only (SC-12,
-- 20261115231000_golf_round_cache_fairways_par4.sql). When the round's
-- total_fairways_hit is NULL, update_round_stats_cache falls back to counting
-- the holes; a par 3 marked "fairway hit" must not lift the numerator over a
-- denominator that already counts par 4 and 5 only.

BEGIN;
\ir _helpers.sql

SELECT plan(3);

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-5c60-000000000001', 'cache-fwy@helm.test', 'authenticated')
ON CONFLICT DO NOTHING;
INSERT INTO public.users (id, email, role) VALUES
  ('00000000-0000-0000-5c60-000000000001', 'cache-fwy@helm.test', 'player')
ON CONFLICT DO NOTHING;
INSERT INTO public.golf_players (id, user_id, first_name) VALUES
  ('00000000-0000-0000-5c61-000000000001', '00000000-0000-0000-5c60-000000000001', 'Cache Fairways')
ON CONFLICT DO NOTHING;
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type, holes_played) VALUES
  ('00000000-0000-0000-5c62-000000000001', '00000000-0000-0000-5c61-000000000001', CURRENT_DATE, 'in_progress', 'practice', 3);

-- Hole 1 is a par 3 written with fairway_hit = true (a legacy writer did this);
-- holes 2 and 3 are par 4s, one fairway hit.
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-5c60-000000000001', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par, score, putts, fairway_hit) VALUES
  ('00000000-0000-0000-5c63-000000000001', '00000000-0000-0000-5c62-000000000001', 1, 3, 3, 2, TRUE),
  ('00000000-0000-0000-5c63-000000000002', '00000000-0000-0000-5c62-000000000001', 2, 4, 4, 2, TRUE),
  ('00000000-0000-0000-5c63-000000000003', '00000000-0000-0000-5c62-000000000001', 3, 4, 5, 2, FALSE);
SELECT set_config('request.jwt.claims', '', true);

-- Completed with no stored fairway totals, so the cache reads the holes.
SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_rounds
SET status = 'completed', total_score = 12, score_to_par = 1, total_fairways_hit = NULL, total_fairways = NULL
WHERE id = '00000000-0000-0000-5c62-000000000001';
SELECT set_config('helm.golf_lifecycle_write', '', true);

SELECT is(
  (SELECT row(total_fairways_hit, total_fairways)::text FROM public.golf_rounds WHERE id = '00000000-0000-0000-5c62-000000000001'),
  row(NULL::int, NULL::int)::text,
  'the round stores no fairway totals, so the cache falls back to the holes'
);
SELECT is(
  (SELECT fairways_hit FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-5c62-000000000001'),
  1,
  'SC-12: the par 3 marked hit is not counted: 1 fairway hit'
);
SELECT is(
  (SELECT fairways_total FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-5c62-000000000001'),
  2,
  'of 2 par-4 and par-5 fairways, never more hits than chances'
);

SELECT * FROM finish();
ROLLBACK;
