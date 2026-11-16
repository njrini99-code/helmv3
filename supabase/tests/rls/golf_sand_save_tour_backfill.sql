-- Sand saves on the PGA Tour's definition (SC-02,
-- 20261115200000_golf_sand_save_tour_definition.sql): out of a greenside
-- bunker and holed in two strokes or fewer, whatever the score.
--
-- One completed round, written the way the app wrote it BEFORE SC-02 (the old
-- par-or-better rule), then the backfill:
--   hole 1  par 4: water off the tee, bunker shot and one putt for a bogey.
--           Stored false (old rule); the Tour rule says a save.
--   hole 2  par 3: bunker shot and one putt for a par. Stored true, stays.
--   hole 3  par 3: three strokes from the bunker. Stored false, stays.
--   hole 4  par 4: scorecard only (no shots), stored true. Never read.
--   hole 5  par 4: shots stop on the green (never holed). Stored NULL, never
--           read, though its bunker shot alone would look like a save.

BEGIN;
\ir _helpers.sql

SELECT plan(16);

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-5a10-000000000001', 'sand-tour@helm.test', 'authenticated')
ON CONFLICT DO NOTHING;
INSERT INTO public.users (id, email, role) VALUES
  ('00000000-0000-0000-5a10-000000000001', 'sand-tour@helm.test', 'player')
ON CONFLICT DO NOTHING;
INSERT INTO public.golf_players (id, user_id, first_name) VALUES
  ('00000000-0000-0000-5a11-000000000001', '00000000-0000-0000-5a10-000000000001', 'Sand Tour')
ON CONFLICT DO NOTHING;
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type, holes_played)
VALUES ('00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a11-000000000001', '2026-10-01', 'in_progress', 'tournament', 5);

SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-5a10-000000000001', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par, score, putts, fairway_hit, sand_save, penalty_strokes) VALUES
  ('00000000-0000-0000-5a1e-000000000001', '00000000-0000-0000-5a1d-000000000001', 1, 4, 5, 1, FALSE, FALSE, 1),
  ('00000000-0000-0000-5a1e-000000000002', '00000000-0000-0000-5a1d-000000000001', 2, 3, 3, 1, NULL,  TRUE,  0),
  ('00000000-0000-0000-5a1e-000000000003', '00000000-0000-0000-5a1d-000000000001', 3, 3, 4, 2, NULL,  FALSE, 0),
  ('00000000-0000-0000-5a1e-000000000004', '00000000-0000-0000-5a1d-000000000001', 4, 4, 4, 1, FALSE, TRUE,  0),
  ('00000000-0000-0000-5a1e-000000000005', '00000000-0000-0000-5a1d-000000000001', 5, 4, 4, 1, FALSE, NULL,  0);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, distance_to_hole_before, distance_unit_before, result, distance_to_hole_after, distance_unit_after, is_penalty, penalty_type) VALUES
  -- hole 1: tee into the water, the drop, approach into the bunker, out to 5 ft, one putt (5, bogey)
  ('00000000-0000-0000-5a1f-000000000101', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000001', 1, 1, 'tee', 'tee', 430, 'yards', 'other', 210, 'yards', FALSE, NULL),
  ('00000000-0000-0000-5a1f-000000000102', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000001', 1, 2, 'penalty', 'other', 210, 'yards', 'penalty', 210, 'yards', TRUE, 'water'),
  ('00000000-0000-0000-5a1f-000000000103', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000001', 1, 3, 'approach', 'rough', 210, 'yards', 'sand', 15, 'yards', FALSE, NULL),
  ('00000000-0000-0000-5a1f-000000000104', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000001', 1, 4, 'around_green', 'sand', 15, 'yards', 'green', 5, 'feet', FALSE, NULL),
  ('00000000-0000-0000-5a1f-000000000105', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000001', 1, 5, 'putting', 'green', 5, 'feet', 'hole', 0, 'feet', FALSE, NULL),
  -- hole 2: tee into the bunker, out to 6 ft, one putt (3, par)
  ('00000000-0000-0000-5a1f-000000000201', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000002', 2, 1, 'tee', 'tee', 170, 'yards', 'sand', 15, 'yards', FALSE, NULL),
  ('00000000-0000-0000-5a1f-000000000202', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000002', 2, 2, 'around_green', 'sand', 15, 'yards', 'green', 6, 'feet', FALSE, NULL),
  ('00000000-0000-0000-5a1f-000000000203', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000002', 2, 3, 'putting', 'green', 6, 'feet', 'hole', 0, 'feet', FALSE, NULL),
  -- hole 3: tee into the bunker, out to 30 ft, two putts (4)
  ('00000000-0000-0000-5a1f-000000000301', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000003', 3, 1, 'tee', 'tee', 190, 'yards', 'sand', 20, 'yards', FALSE, NULL),
  ('00000000-0000-0000-5a1f-000000000302', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000003', 3, 2, 'around_green', 'sand', 20, 'yards', 'green', 30, 'feet', FALSE, NULL),
  ('00000000-0000-0000-5a1f-000000000303', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000003', 3, 3, 'putting', 'green', 30, 'feet', 'green', 3, 'feet', FALSE, NULL),
  ('00000000-0000-0000-5a1f-000000000304', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000003', 3, 4, 'putting', 'green', 3, 'feet', 'hole', 0, 'feet', FALSE, NULL),
  -- hole 5: tee, approach into the bunker, out onto the green, and nothing after (never holed)
  ('00000000-0000-0000-5a1f-000000000501', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000005', 5, 1, 'tee', 'tee', 400, 'yards', 'fairway', 150, 'yards', FALSE, NULL),
  ('00000000-0000-0000-5a1f-000000000502', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000005', 5, 2, 'approach', 'fairway', 150, 'yards', 'sand', 10, 'yards', FALSE, NULL),
  ('00000000-0000-0000-5a1f-000000000503', '00000000-0000-0000-5a1d-000000000001', '00000000-0000-0000-5a1e-000000000005', 5, 3, 'around_green', 'sand', 10, 'yards', 'green', 8, 'feet', FALSE, NULL);

SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_rounds SET status = 'completed', total_score = 20, score_to_par = 2
WHERE id = '00000000-0000-0000-5a1d-000000000001';
SELECT set_config('helm.golf_lifecycle_write', '', true);

-- The rule on each hole's shots ------------------------------------------------

SELECT is(helm_private.golf_hole_sand_save_tour('00000000-0000-0000-5a1e-000000000001'), TRUE, 'bogey out of the bunker in two after a penalty: a save');
SELECT is(helm_private.golf_hole_sand_save_tour('00000000-0000-0000-5a1e-000000000002'), TRUE, 'par out of the bunker in two: a save');
SELECT is(helm_private.golf_hole_sand_save_tour('00000000-0000-0000-5a1e-000000000003'), FALSE, 'three strokes from the bunker: an attempt, no save');
SELECT is(helm_private.golf_hole_sand_save_tour('00000000-0000-0000-5a1e-000000000004'), NULL::boolean, 'no shots: no attempt read from them');

-- Before the backfill: the cache counts the old flags ------------------------

SELECT is((SELECT sand_saves FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-5a1d-000000000001'), 2, 'before: 2 saves (holes 2 and 4)');
SELECT is((SELECT sand_attempts FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-5a1d-000000000001'), 4, 'before: of 4 attempts');

-- The backfill ------------------------------------------------------------------

SELECT is(helm_private.golf_backfill_sand_save_tour(), 1, 'the backfill changes one hole');
SELECT is((SELECT sand_save FROM public.golf_holes WHERE id = '00000000-0000-0000-5a1e-000000000001'), TRUE, 'hole 1 is now a save');
SELECT is((SELECT sand_save FROM public.golf_holes WHERE id = '00000000-0000-0000-5a1e-000000000002'), TRUE, 'hole 2 unchanged');
SELECT is((SELECT sand_save FROM public.golf_holes WHERE id = '00000000-0000-0000-5a1e-000000000003'), FALSE, 'hole 3 unchanged');
SELECT is((SELECT sand_save FROM public.golf_holes WHERE id = '00000000-0000-0000-5a1e-000000000004'), TRUE, 'scorecard-only hole keeps its stored value');
SELECT is((SELECT sand_save FROM public.golf_holes WHERE id = '00000000-0000-0000-5a1e-000000000005'), NULL::boolean, 'a hole whose shots stop short is never read');
SELECT is((SELECT sand_saves FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-5a1d-000000000001'), 3, 'after: the cache counts 3 saves');
SELECT is((SELECT sand_attempts FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-5a1d-000000000001'), 4, 'after: of 4 attempts');
SELECT is(
  (SELECT old_sand_save::text || '>' || new_sand_save::text FROM helm_private.golf_holes_sand_save_fix_20261115 WHERE hole_id = '00000000-0000-0000-5a1e-000000000001'),
  'false>true',
  'the archive holds the old and new value'
);
SELECT is(helm_private.golf_backfill_sand_save_tour(), 0, 'a second run changes nothing');

SELECT * FROM finish();
ROLLBACK;
