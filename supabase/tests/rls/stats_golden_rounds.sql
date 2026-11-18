-- GENERATED from src/clubhouse/__tests__/stats-golden.fixtures.ts (goldenPgTapSql). Do not edit by hand:
-- HELM_WRITE_GOLDEN_SQL=1 npm run test:file -- src/clubhouse/__tests__/stats-golden.test.ts
--
-- Golden round G1 (stats and charts audit 2026-11-15, section 3) through the SQL paths: the golf_holes GIR trigger,
-- recompute_golf_round_totals (golf_rounds totals) and update_round_stats_cache (golf_round_stats_cache). The TypeScript
-- paths assert the same numbers in stats-golden.test.ts. Holes carry sand_save on the Tour definition (out of a greenside
-- bunker in two strokes or fewer, whatever the score), the value the app writes after SC-02.

BEGIN;
\ir _helpers.sql

SELECT plan(22);

INSERT INTO auth.users (id, email, role) VALUES ('00000000-0000-0000-9010-000000000001', 'golden-player@helm.test', 'authenticated') ON CONFLICT DO NOTHING;
INSERT INTO public.users (id, email, role) VALUES ('00000000-0000-0000-9010-000000000001', 'golden-player@helm.test', 'player') ON CONFLICT DO NOTHING;
INSERT INTO public.golf_players (id, user_id, first_name) VALUES ('00000000-0000-0000-9011-000000000001', '00000000-0000-0000-9010-000000000001', 'Golden Player') ON CONFLICT DO NOTHING;
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type, holes_played, course_name)
VALUES ('00000000-0000-0000-901d-000000000001', '00000000-0000-0000-9011-000000000001', '2026-10-01', 'in_progress', 'tournament', 18, 'Golden Course');

-- The player's identity for the hole writes, as the app's save runs them.
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-9010-000000000001', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par, yardage, score, putts, fairway_hit, sand_save, penalty_strokes) VALUES
  ('00000000-0000-0000-901e-000000000001', '00000000-0000-0000-901d-000000000001', 1, 4, 400, 4, 2, TRUE, NULL, 0),
  ('00000000-0000-0000-901e-000000000002', '00000000-0000-0000-901d-000000000001', 2, 4, 420, 5, 3, TRUE, NULL, 0),
  ('00000000-0000-0000-901e-000000000003', '00000000-0000-0000-901d-000000000001', 3, 3, 170, 3, 1, NULL, TRUE, 0),
  ('00000000-0000-0000-901e-000000000004', '00000000-0000-0000-901d-000000000001', 4, 5, 520, 4, 1, TRUE, NULL, 0),
  ('00000000-0000-0000-901e-000000000005', '00000000-0000-0000-901d-000000000001', 5, 4, 380, 3, 0, FALSE, NULL, 0),
  ('00000000-0000-0000-901e-000000000006', '00000000-0000-0000-901d-000000000001', 6, 4, 440, 6, 2, FALSE, NULL, 1),
  ('00000000-0000-0000-901e-000000000007', '00000000-0000-0000-901d-000000000001', 7, 3, 190, 4, 2, NULL, FALSE, 0),
  ('00000000-0000-0000-901e-000000000008', '00000000-0000-0000-901d-000000000001', 8, 4, 410, 4, 2, FALSE, NULL, 0),
  ('00000000-0000-0000-901e-000000000009', '00000000-0000-0000-901d-000000000001', 9, 5, 540, 5, 1, TRUE, TRUE, 0),
  ('00000000-0000-0000-901e-000000000010', '00000000-0000-0000-901d-000000000001', 10, 4, 430, 5, 1, FALSE, TRUE, 1),
  ('00000000-0000-0000-901e-000000000011', '00000000-0000-0000-901d-000000000001', 11, 3, 160, 3, 2, NULL, NULL, 0),
  ('00000000-0000-0000-901e-000000000012', '00000000-0000-0000-901d-000000000001', 12, 4, 390, 4, 1, FALSE, NULL, 0),
  ('00000000-0000-0000-901e-000000000013', '00000000-0000-0000-901d-000000000001', 13, 5, 530, 5, 2, TRUE, NULL, 0),
  ('00000000-0000-0000-901e-000000000014', '00000000-0000-0000-901d-000000000001', 14, 4, 400, 4, 2, TRUE, NULL, 0),
  ('00000000-0000-0000-901e-000000000015', '00000000-0000-0000-901d-000000000001', 15, 4, 450, 5, 2, FALSE, NULL, 0),
  ('00000000-0000-0000-901e-000000000016', '00000000-0000-0000-901d-000000000001', 16, 3, 180, 3, 2, NULL, NULL, 0),
  ('00000000-0000-0000-901e-000000000017', '00000000-0000-0000-901d-000000000001', 17, 4, 410, 4, 2, TRUE, NULL, 0),
  ('00000000-0000-0000-901e-000000000018', '00000000-0000-0000-901d-000000000001', 18, 5, 560, 6, 3, TRUE, NULL, 0);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, club_type, lie_before, distance_to_hole_before, distance_unit_before, result, distance_to_hole_after, distance_unit_after, shot_distance, is_penalty, penalty_type, putt_made) VALUES
  ('00000000-0000-0000-901f-000000000101', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000001', 1, 1, 'tee', 'driver', 'tee', 400, 'yards', 'fairway', 140, 'yards', 260, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000102', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000001', 1, 2, 'approach', 'non_driver', 'fairway', 140, 'yards', 'green', 25, 'feet', 132, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000103', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000001', 1, 3, 'putting', 'putter', 'green', 25, 'feet', 'green', 3, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000000104', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000001', 1, 4, 'putting', 'putter', 'green', 3, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000000201', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000002', 2, 1, 'tee', 'driver', 'tee', 420, 'yards', 'fairway', 160, 'yards', 260, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000202', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000002', 2, 2, 'approach', 'non_driver', 'fairway', 160, 'yards', 'green', 40, 'feet', 147, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000203', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000002', 2, 3, 'putting', 'putter', 'green', 40, 'feet', 'green', 6, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000000204', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000002', 2, 4, 'putting', 'putter', 'green', 6, 'feet', 'green', 2, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000000205', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000002', 2, 5, 'putting', 'putter', 'green', 2, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000000301', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000003', 3, 1, 'tee', 'non_driver', 'tee', 170, 'yards', 'sand', 15, 'yards', 155, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000302', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000003', 3, 2, 'around_green', 'non_driver', 'sand', 15, 'yards', 'green', 6, 'feet', 13, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000303', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000003', 3, 3, 'putting', 'putter', 'green', 6, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000000401', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000004', 4, 1, 'tee', 'driver', 'tee', 520, 'yards', 'fairway', 250, 'yards', 270, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000402', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000004', 4, 2, 'approach', 'non_driver', 'fairway', 250, 'yards', 'fairway', 60, 'yards', 190, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000403', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000004', 4, 3, 'approach', 'non_driver', 'fairway', 60, 'yards', 'green', 8, 'feet', 57, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000404', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000004', 4, 4, 'putting', 'putter', 'green', 8, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000000501', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000005', 5, 1, 'tee', 'driver', 'tee', 380, 'yards', 'rough', 130, 'yards', 250, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000502', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000005', 5, 2, 'approach', 'non_driver', 'rough', 130, 'yards', 'rough', 20, 'yards', 110, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000503', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000005', 5, 3, 'around_green', 'non_driver', 'rough', 20, 'yards', 'hole', 0, 'feet', 20, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000601', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000006', 6, 1, 'tee', 'driver', 'tee', 440, 'yards', 'other', 200, 'yards', 240, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000602', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000006', 6, 2, 'penalty', 'non_driver', 'other', 200, 'yards', 'penalty', 200, 'yards', 0, TRUE, 'water', NULL),
  ('00000000-0000-0000-901f-000000000603', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000006', 6, 3, 'approach', 'non_driver', 'rough', 200, 'yards', 'rough', 30, 'yards', 170, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000604', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000006', 6, 4, 'around_green', 'non_driver', 'rough', 30, 'yards', 'green', 12, 'feet', 26, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000605', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000006', 6, 5, 'putting', 'putter', 'green', 12, 'feet', 'green', 2, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000000606', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000006', 6, 6, 'putting', 'putter', 'green', 2, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000000701', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000007', 7, 1, 'tee', 'non_driver', 'tee', 190, 'yards', 'sand', 20, 'yards', 170, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000702', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000007', 7, 2, 'around_green', 'non_driver', 'sand', 20, 'yards', 'green', 30, 'feet', 10, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000703', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000007', 7, 3, 'putting', 'putter', 'green', 30, 'feet', 'green', 3, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000000704', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000007', 7, 4, 'putting', 'putter', 'green', 3, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000000801', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000008', 8, 1, 'tee', 'driver', 'tee', 410, 'yards', 'rough', 150, 'yards', 260, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000802', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000008', 8, 2, 'approach', 'non_driver', 'rough', 150, 'yards', 'green', 30, 'feet', 140, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000803', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000008', 8, 3, 'putting', 'putter', 'green', 30, 'feet', 'green', 2, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000000804', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000008', 8, 4, 'putting', 'putter', 'green', 2, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000000901', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000009', 9, 1, 'tee', 'driver', 'tee', 540, 'yards', 'fairway', 270, 'yards', 270, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000902', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000009', 9, 2, 'approach', 'non_driver', 'fairway', 270, 'yards', 'fairway', 100, 'yards', 170, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000903', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000009', 9, 3, 'approach', 'non_driver', 'fairway', 100, 'yards', 'sand', 10, 'yards', 90, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000904', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000009', 9, 4, 'around_green', 'non_driver', 'sand', 10, 'yards', 'green', 4, 'feet', 9, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000000905', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000009', 9, 5, 'putting', 'putter', 'green', 4, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000001001', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000010', 10, 1, 'tee', 'driver', 'tee', 430, 'yards', 'other', 210, 'yards', 220, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001002', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000010', 10, 2, 'penalty', 'non_driver', 'other', 210, 'yards', 'penalty', 210, 'yards', 0, TRUE, 'water', NULL),
  ('00000000-0000-0000-901f-000000001003', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000010', 10, 3, 'approach', 'non_driver', 'rough', 210, 'yards', 'sand', 15, 'yards', 195, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001004', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000010', 10, 4, 'around_green', 'non_driver', 'sand', 15, 'yards', 'green', 5, 'feet', 13, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001005', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000010', 10, 5, 'putting', 'putter', 'green', 5, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000001101', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000011', 11, 1, 'tee', 'non_driver', 'tee', 160, 'yards', 'green', 20, 'feet', 153, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001102', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000011', 11, 2, 'putting', 'putter', 'green', 20, 'feet', 'green', 2, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000001103', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000011', 11, 3, 'putting', 'putter', 'green', 2, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000001201', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000012', 12, 1, 'tee', 'driver', 'tee', 390, 'yards', 'rough', 140, 'yards', 250, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001202', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000012', 12, 2, 'approach', 'non_driver', 'rough', 140, 'yards', 'rough', 15, 'yards', 125, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001203', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000012', 12, 3, 'around_green', 'non_driver', 'rough', 15, 'yards', 'green', 3, 'feet', 14, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001204', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000012', 12, 4, 'putting', 'putter', 'green', 3, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000001301', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000013', 13, 1, 'tee', 'driver', 'tee', 530, 'yards', 'fairway', 260, 'yards', 270, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001302', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000013', 13, 2, 'approach', 'non_driver', 'fairway', 260, 'yards', 'fairway', 90, 'yards', 170, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001303', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000013', 13, 3, 'approach', 'non_driver', 'fairway', 90, 'yards', 'green', 15, 'feet', 85, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001304', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000013', 13, 4, 'putting', 'putter', 'green', 15, 'feet', 'green', 2, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000001305', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000013', 13, 5, 'putting', 'putter', 'green', 2, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000001401', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000014', 14, 1, 'tee', 'driver', 'tee', 400, 'yards', 'fairway', 130, 'yards', 270, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001402', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000014', 14, 2, 'approach', 'non_driver', 'fairway', 130, 'yards', 'green', 18, 'feet', 124, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001403', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000014', 14, 3, 'putting', 'putter', 'green', 18, 'feet', 'green', 2, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000001404', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000014', 14, 4, 'putting', 'putter', 'green', 2, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000001501', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000015', 15, 1, 'tee', 'driver', 'tee', 450, 'yards', 'rough', 170, 'yards', 280, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001502', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000015', 15, 2, 'approach', 'non_driver', 'rough', 170, 'yards', 'rough', 25, 'yards', 145, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001503', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000015', 15, 3, 'around_green', 'non_driver', 'rough', 25, 'yards', 'green', 8, 'feet', 22, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001504', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000015', 15, 4, 'putting', 'putter', 'green', 8, 'feet', 'green', 1, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000001505', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000015', 15, 5, 'putting', 'putter', 'green', 1, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000001601', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000016', 16, 1, 'tee', 'non_driver', 'tee', 180, 'yards', 'green', 35, 'feet', 168, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001602', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000016', 16, 2, 'putting', 'putter', 'green', 35, 'feet', 'green', 3, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000001603', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000016', 16, 3, 'putting', 'putter', 'green', 3, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000001701', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000017', 17, 1, 'tee', 'driver', 'tee', 410, 'yards', 'fairway', 145, 'yards', 265, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001702', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000017', 17, 2, 'approach', 'non_driver', 'fairway', 145, 'yards', 'green', 22, 'feet', 138, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001703', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000017', 17, 3, 'putting', 'putter', 'green', 22, 'feet', 'green', 2, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000001704', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000017', 17, 4, 'putting', 'putter', 'green', 2, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE),
  ('00000000-0000-0000-901f-000000001801', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000018', 18, 1, 'tee', 'driver', 'tee', 560, 'yards', 'fairway', 280, 'yards', 280, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001802', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000018', 18, 2, 'approach', 'non_driver', 'fairway', 280, 'yards', 'fairway', 110, 'yards', 170, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001803', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000018', 18, 3, 'approach', 'non_driver', 'fairway', 110, 'yards', 'green', 45, 'feet', 95, FALSE, NULL, NULL),
  ('00000000-0000-0000-901f-000000001804', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000018', 18, 4, 'putting', 'putter', 'green', 45, 'feet', 'green', 8, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000001805', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000018', 18, 5, 'putting', 'putter', 'green', 8, 'feet', 'green', 2, 'feet', 0, FALSE, NULL, FALSE),
  ('00000000-0000-0000-901f-000000001806', '00000000-0000-0000-901d-000000000001', '00000000-0000-0000-901e-000000000018', 18, 6, 'putting', 'putter', 'green', 2, 'feet', 'hole', 0, 'feet', 0, FALSE, NULL, TRUE);

-- Complete the round under the lifecycle mark, with the totals round-submit writes from the holes.
SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_rounds SET status = 'completed', total_score = 77, score_to_par = 5, front_nine = 38, back_nine = 39 WHERE id = '00000000-0000-0000-901d-000000000001';
SELECT set_config('helm.golf_lifecycle_write', '', true);

SELECT is((SELECT count(*)::int FROM public.golf_holes WHERE round_id = '00000000-0000-0000-901d-000000000001' AND gir), 10, 'G1: the hole trigger marks 10 greens in regulation');
SELECT is((SELECT total_score FROM public.golf_rounds WHERE id = '00000000-0000-0000-901d-000000000001'), 77, 'G1 round: total 77');
SELECT is((SELECT total_putts FROM public.golf_rounds WHERE id = '00000000-0000-0000-901d-000000000001'), 31, 'G1 round: 31 putts');
SELECT is((SELECT total_gir FROM public.golf_rounds WHERE id = '00000000-0000-0000-901d-000000000001'), 10, 'G1 round: 10 greens');
SELECT is((SELECT total_gir_possible FROM public.golf_rounds WHERE id = '00000000-0000-0000-901d-000000000001'), 18, 'G1 round: of 18');
SELECT is((SELECT total_fairways_hit FROM public.golf_rounds WHERE id = '00000000-0000-0000-901d-000000000001'), 8, 'G1 round: 8 fairways');
SELECT is((SELECT total_fairways FROM public.golf_rounds WHERE id = '00000000-0000-0000-901d-000000000001'), 14, 'G1 round: of 14');
SELECT is((SELECT total_score FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 77, 'G1 cache: total 77');
SELECT is((SELECT front_nine FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 38, 'G1 cache: front nine 38');
SELECT is((SELECT back_nine FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 39, 'G1 cache: back nine 39');
SELECT is((SELECT greens_hit FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 10, 'G1 cache: 10 greens');
SELECT is((SELECT greens_total FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 18, 'G1 cache: of 18');
SELECT is((SELECT fairways_hit FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 8, 'G1 cache: 8 fairways');
SELECT is((SELECT fairways_total FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 14, 'G1 cache: of 14');
SELECT is((SELECT total_putts FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 31, 'G1 cache: 31 putts');
SELECT is((SELECT one_putts FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 5, 'G1 cache: 5 one-putts');
SELECT is((SELECT three_putts FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 2, 'G1 cache: 2 three-putts');
SELECT is((SELECT scrambles_converted FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 5, 'G1 cache: 5 scrambles (the hole 5 chip-in and the hole 10 sand save count)');
SELECT is((SELECT scramble_attempts FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 8, 'G1 cache: of 8');
SELECT is((SELECT sand_saves FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 3, 'G1 cache: 3 sand saves on the Tour definition');
SELECT is((SELECT sand_attempts FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 4, 'G1 cache: of 4');
SELECT is((SELECT penalty_strokes FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-901d-000000000001'), 2, 'G1 cache: 2 penalty strokes');

SELECT * FROM finish();
ROLLBACK;
