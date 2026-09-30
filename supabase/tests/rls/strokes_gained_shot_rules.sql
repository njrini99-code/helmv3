-- Q-89: strokes gained charges a penalty to the shot that earned it, ends a shot where the
-- next non-penalty shot starts, and stores NULL for is_test rounds (migration
-- 20260930150000_golf_sg_penalty_charged_to_earning_shot.sql). GENERATED from
-- src/lib/utils/__tests__/fixtures/sg-shot-rules.json, which the TypeScript engine
-- test (golf-stats-calculator-shots.sg-shot-rules.test.ts) asserts too, so the SQL
-- functions and the TS engine agree on the same shots.

BEGIN;
\ir _helpers.sql

SELECT plan(42);

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-c101-000000000000', 'sg-fixture-one@helm.test', 'authenticated'),
  ('00000000-0000-0000-c102-000000000000', 'sg-fixture-two@helm.test', 'authenticated')
ON CONFLICT DO NOTHING;
INSERT INTO public.users (id, email, role) VALUES
  ('00000000-0000-0000-c101-000000000000', 'sg-fixture-one@helm.test', 'player'),
  ('00000000-0000-0000-c102-000000000000', 'sg-fixture-two@helm.test', 'player')
ON CONFLICT DO NOTHING;
INSERT INTO public.golf_players (id, user_id, first_name) VALUES
  ('00000000-0000-0000-cc01-000000000000', '00000000-0000-0000-c101-000000000000', 'SG Fixture One'),
  ('00000000-0000-0000-cc02-000000000000', '00000000-0000-0000-c102-000000000000', 'SG Fixture Two')
ON CONFLICT DO NOTHING;

-- tee-penalty-logged-after-the-shot: Par 4: tee shot into the water, penalty row written AFTER it with the drop position (fairway, 175 yd). The penalty belongs to Off the tee.
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
VALUES ('00000000-0000-0000-aa01-000000000000', '00000000-0000-0000-cc01-000000000000', CURRENT_DATE, 'in_progress', 'practice');
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-c101-000000000000', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES ('00000000-0000-0000-bb01-000000000000', '00000000-0000-0000-aa01-000000000000', 1, 4);
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd01-000000000001', '00000000-0000-0000-aa01-000000000000', '00000000-0000-0000-bb01-000000000000', 1, 1, 'tee', 'tee', 'fairway', 420, 'yards', 175, 'yards', 'other', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd01-000000000002', '00000000-0000-0000-aa01-000000000000', '00000000-0000-0000-bb01-000000000000', 1, 2, 'penalty', 'fairway', 'fairway', 175, 'yards', 175, 'yards', 'penalty', NULL, TRUE);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd01-000000000003', '00000000-0000-0000-aa01-000000000000', '00000000-0000-0000-bb01-000000000000', 1, 3, 'approach', 'fairway', 'green', 175, 'yards', 25, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd01-000000000004', '00000000-0000-0000-aa01-000000000000', '00000000-0000-0000-bb01-000000000000', 1, 4, 'putting', 'green', 'green', 25, 'feet', 3, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd01-000000000005', '00000000-0000-0000-aa01-000000000000', '00000000-0000-0000-bb01-000000000000', 1, 5, 'putting', 'green', 'green', 3, 'feet', 0, 'feet', 'hole', TRUE, NULL);

-- penalty-logged-before-the-tee-shot: Par 5: the penalty row is written BEFORE the shot it belongs to (shot 1), with the tee position. Origin is the next real shot: from the tee, so Off the tee.
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
VALUES ('00000000-0000-0000-aa02-000000000000', '00000000-0000-0000-cc01-000000000000', CURRENT_DATE, 'in_progress', 'practice');
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-c101-000000000000', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES ('00000000-0000-0000-bb02-000000000000', '00000000-0000-0000-aa02-000000000000', 1, 5);
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd02-000000000001', '00000000-0000-0000-aa02-000000000000', '00000000-0000-0000-bb02-000000000000', 1, 1, 'penalty', 'tee', 'tee', 500, 'yards', 500, 'yards', 'penalty', NULL, TRUE);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd02-000000000002', '00000000-0000-0000-aa02-000000000000', '00000000-0000-0000-bb02-000000000000', 1, 2, 'tee', 'tee', 'fairway', 500, 'yards', 260, 'yards', 'fairway', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd02-000000000003', '00000000-0000-0000-aa02-000000000000', '00000000-0000-0000-bb02-000000000000', 1, 3, 'approach', 'fairway', 'fairway', 260, 'yards', 90, 'yards', 'fairway', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd02-000000000004', '00000000-0000-0000-aa02-000000000000', '00000000-0000-0000-bb02-000000000000', 1, 4, 'approach', 'fairway', 'green', 90, 'yards', 12, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd02-000000000005', '00000000-0000-0000-aa02-000000000000', '00000000-0000-0000-bb02-000000000000', 1, 5, 'putting', 'green', 'green', 12, 'feet', 0, 'feet', 'hole', TRUE, NULL);

-- approach-penalty-from-200-out: Par 4: second shot from 190 yd into the water, drop at 100 yd. Charged to Approach (origin is 190 yd out).
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
VALUES ('00000000-0000-0000-aa03-000000000000', '00000000-0000-0000-cc01-000000000000', CURRENT_DATE, 'in_progress', 'practice');
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-c101-000000000000', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES ('00000000-0000-0000-bb03-000000000000', '00000000-0000-0000-aa03-000000000000', 1, 4);
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd03-000000000001', '00000000-0000-0000-aa03-000000000000', '00000000-0000-0000-bb03-000000000000', 1, 1, 'tee', 'tee', 'fairway', 400, 'yards', 190, 'yards', 'fairway', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd03-000000000002', '00000000-0000-0000-aa03-000000000000', '00000000-0000-0000-bb03-000000000000', 1, 2, 'approach', 'fairway', 'fairway', 190, 'yards', 100, 'yards', 'other', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd03-000000000003', '00000000-0000-0000-aa03-000000000000', '00000000-0000-0000-bb03-000000000000', 1, 3, 'penalty', 'fairway', 'fairway', 100, 'yards', 100, 'yards', 'penalty', NULL, TRUE);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd03-000000000004', '00000000-0000-0000-aa03-000000000000', '00000000-0000-0000-bb03-000000000000', 1, 4, 'approach', 'fairway', 'green', 100, 'yards', 10, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd03-000000000005', '00000000-0000-0000-aa03-000000000000', '00000000-0000-0000-bb03-000000000000', 1, 5, 'putting', 'green', 'green', 10, 'feet', 0, 'feet', 'hole', TRUE, NULL);

-- short-shot-penalty-drop-farther-out: Par 4: a 30 yd shot from the rough goes in the water and the drop is 60 yd out. The penalty is Around the green (origin 30 yd), not Approach (the drop row is 60 yd).
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
VALUES ('00000000-0000-0000-aa04-000000000000', '00000000-0000-0000-cc01-000000000000', CURRENT_DATE, 'in_progress', 'practice');
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-c101-000000000000', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES ('00000000-0000-0000-bb04-000000000000', '00000000-0000-0000-aa04-000000000000', 1, 4);
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd04-000000000001', '00000000-0000-0000-aa04-000000000000', '00000000-0000-0000-bb04-000000000000', 1, 1, 'tee', 'tee', 'fairway', 380, 'yards', 130, 'yards', 'fairway', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd04-000000000002', '00000000-0000-0000-aa04-000000000000', '00000000-0000-0000-bb04-000000000000', 1, 2, 'approach', 'fairway', 'rough', 130, 'yards', 30, 'yards', 'rough', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd04-000000000003', '00000000-0000-0000-aa04-000000000000', '00000000-0000-0000-bb04-000000000000', 1, 3, 'around_green', 'rough', 'rough', 30, 'yards', 60, 'yards', 'other', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd04-000000000004', '00000000-0000-0000-aa04-000000000000', '00000000-0000-0000-bb04-000000000000', 1, 4, 'penalty', 'rough', 'rough', 60, 'yards', 60, 'yards', 'penalty', NULL, TRUE);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd04-000000000005', '00000000-0000-0000-aa04-000000000000', '00000000-0000-0000-bb04-000000000000', 1, 5, 'approach', 'rough', 'green', 60, 'yards', 12, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd04-000000000006', '00000000-0000-0000-aa04-000000000000', '00000000-0000-0000-bb04-000000000000', 1, 6, 'putting', 'green', 'green', 12, 'feet', 0, 'feet', 'hole', TRUE, NULL);

-- par-3-tee-penalty: Par 3: the first shot (recorded as an approach from the tee) goes in the water. A par-3 tee penalty is Approach, never Off the tee.
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
VALUES ('00000000-0000-0000-aa05-000000000000', '00000000-0000-0000-cc01-000000000000', CURRENT_DATE, 'in_progress', 'practice');
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-c101-000000000000', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES ('00000000-0000-0000-bb05-000000000000', '00000000-0000-0000-aa05-000000000000', 1, 3);
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd05-000000000001', '00000000-0000-0000-aa05-000000000000', '00000000-0000-0000-bb05-000000000000', 1, 1, 'approach', 'tee', 'tee', 180, 'yards', 180, 'yards', 'other', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd05-000000000002', '00000000-0000-0000-aa05-000000000000', '00000000-0000-0000-bb05-000000000000', 1, 2, 'penalty', 'tee', 'tee', 180, 'yards', 180, 'yards', 'penalty', NULL, TRUE);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd05-000000000003', '00000000-0000-0000-aa05-000000000000', '00000000-0000-0000-bb05-000000000000', 1, 3, 'approach', 'tee', 'green', 180, 'yards', 25, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd05-000000000004', '00000000-0000-0000-aa05-000000000000', '00000000-0000-0000-bb05-000000000000', 1, 4, 'putting', 'green', 'green', 25, 'feet', 3, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd05-000000000005', '00000000-0000-0000-aa05-000000000000', '00000000-0000-0000-bb05-000000000000', 1, 5, 'putting', 'green', 'green', 3, 'feet', 0, 'feet', 'hole', TRUE, NULL);

-- out-of-bounds-re-tee: Par 4: OB off the tee, penalty row written after it from the tee, then a second tee shot. The penalty is Off the tee (origin is the previous real shot).
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
VALUES ('00000000-0000-0000-aa06-000000000000', '00000000-0000-0000-cc01-000000000000', CURRENT_DATE, 'in_progress', 'practice');
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-c101-000000000000', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES ('00000000-0000-0000-bb06-000000000000', '00000000-0000-0000-aa06-000000000000', 1, 4);
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd06-000000000001', '00000000-0000-0000-aa06-000000000000', '00000000-0000-0000-bb06-000000000000', 1, 1, 'tee', 'tee', 'tee', 400, 'yards', 400, 'yards', 'other', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd06-000000000002', '00000000-0000-0000-aa06-000000000000', '00000000-0000-0000-bb06-000000000000', 1, 2, 'penalty', 'tee', 'tee', 400, 'yards', 400, 'yards', 'penalty', NULL, TRUE);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd06-000000000003', '00000000-0000-0000-aa06-000000000000', '00000000-0000-0000-bb06-000000000000', 1, 3, 'tee', 'tee', 'fairway', 400, 'yards', 150, 'yards', 'fairway', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd06-000000000004', '00000000-0000-0000-aa06-000000000000', '00000000-0000-0000-bb06-000000000000', 1, 4, 'approach', 'fairway', 'green', 150, 'yards', 20, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd06-000000000005', '00000000-0000-0000-aa06-000000000000', '00000000-0000-0000-bb06-000000000000', 1, 5, 'putting', 'green', 'green', 20, 'feet', 2, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd06-000000000006', '00000000-0000-0000-aa06-000000000000', '00000000-0000-0000-bb06-000000000000', 1, 6, 'putting', 'green', 'green', 2, 'feet', 0, 'feet', 'hole', TRUE, NULL);

-- lie-break-between-shots: Par 4, no penalty: the tee shot records "rough, 150 yd" as its end but the next shot records it was played from "fairway, 155 yd". A shot ends where the next shot starts.
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
VALUES ('00000000-0000-0000-aa07-000000000000', '00000000-0000-0000-cc01-000000000000', CURRENT_DATE, 'in_progress', 'practice');
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-c101-000000000000', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES ('00000000-0000-0000-bb07-000000000000', '00000000-0000-0000-aa07-000000000000', 1, 4);
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd07-000000000001', '00000000-0000-0000-aa07-000000000000', '00000000-0000-0000-bb07-000000000000', 1, 1, 'tee', 'tee', 'rough', 400, 'yards', 150, 'yards', 'rough', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd07-000000000002', '00000000-0000-0000-aa07-000000000000', '00000000-0000-0000-bb07-000000000000', 1, 2, 'approach', 'fairway', 'green', 155, 'yards', 15, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-dd07-000000000003', '00000000-0000-0000-aa07-000000000000', '00000000-0000-0000-bb07-000000000000', 1, 3, 'putting', 'green', 'green', 15, 'feet', 0, 'feet', 'hole', TRUE, NULL);

-- player 2: a normal round and an is_test round with identical shots
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
VALUES ('00000000-0000-0000-ee02-000000000000', '00000000-0000-0000-cc02-000000000000', CURRENT_DATE, 'in_progress', 'practice');
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-c102-000000000000', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES ('00000000-0000-0000-ef02-000000000000', '00000000-0000-0000-ee02-000000000000', 1, 4);
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-d901-000000000001', '00000000-0000-0000-ee02-000000000000', '00000000-0000-0000-ef02-000000000000', 1, 1, 'tee', 'tee', 'fairway', 420, 'yards', 175, 'yards', 'other', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-d901-000000000002', '00000000-0000-0000-ee02-000000000000', '00000000-0000-0000-ef02-000000000000', 1, 2, 'penalty', 'fairway', 'fairway', 175, 'yards', 175, 'yards', 'penalty', NULL, TRUE);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-d901-000000000003', '00000000-0000-0000-ee02-000000000000', '00000000-0000-0000-ef02-000000000000', 1, 3, 'approach', 'fairway', 'green', 175, 'yards', 25, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-d901-000000000004', '00000000-0000-0000-ee02-000000000000', '00000000-0000-0000-ef02-000000000000', 1, 4, 'putting', 'green', 'green', 25, 'feet', 3, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-d901-000000000005', '00000000-0000-0000-ee02-000000000000', '00000000-0000-0000-ef02-000000000000', 1, 5, 'putting', 'green', 'green', 3, 'feet', 0, 'feet', 'hole', TRUE, NULL);
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type, is_test)
VALUES ('00000000-0000-0000-ee01-000000000000', '00000000-0000-0000-cc02-000000000000', CURRENT_DATE, 'in_progress', 'practice', TRUE);
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-c102-000000000000', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES ('00000000-0000-0000-ef01-000000000000', '00000000-0000-0000-ee01-000000000000', 1, 4);
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-d902-000000000001', '00000000-0000-0000-ee01-000000000000', '00000000-0000-0000-ef01-000000000000', 1, 1, 'tee', 'tee', 'fairway', 420, 'yards', 175, 'yards', 'other', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-d902-000000000002', '00000000-0000-0000-ee01-000000000000', '00000000-0000-0000-ef01-000000000000', 1, 2, 'penalty', 'fairway', 'fairway', 175, 'yards', 175, 'yards', 'penalty', NULL, TRUE);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-d902-000000000003', '00000000-0000-0000-ee01-000000000000', '00000000-0000-0000-ef01-000000000000', 1, 3, 'approach', 'fairway', 'green', 175, 'yards', 25, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-d902-000000000004', '00000000-0000-0000-ee01-000000000000', '00000000-0000-0000-ef01-000000000000', 1, 4, 'putting', 'green', 'green', 25, 'feet', 3, 'feet', 'green', NULL, NULL);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES ('00000000-0000-0000-d902-000000000005', '00000000-0000-0000-ee01-000000000000', '00000000-0000-0000-ef01-000000000000', 1, 5, 'putting', 'green', 'green', 3, 'feet', 0, 'feet', 'hole', TRUE, NULL);

-- complete the rounds under the lifecycle marker (shots are immutable once completed)
SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_rounds SET status = 'completed' WHERE id IN ('00000000-0000-0000-aa01-000000000000', '00000000-0000-0000-aa02-000000000000', '00000000-0000-0000-aa03-000000000000', '00000000-0000-0000-aa04-000000000000', '00000000-0000-0000-aa05-000000000000', '00000000-0000-0000-aa06-000000000000', '00000000-0000-0000-aa07-000000000000', '00000000-0000-0000-ee02-000000000000', '00000000-0000-0000-ee01-000000000000');
SELECT set_config('helm.golf_lifecycle_write', '', true);

-- the pure function gives the shared numbers for every fixture hole
SELECT is((SELECT sg_tee FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa01-000000000000')), -0.974::numeric, 'tee-penalty-logged-after-the-shot: Off the tee');
SELECT is((SELECT sg_approach FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa01-000000000000')), 0.134::numeric, 'tee-penalty-logged-after-the-shot: Approach');
SELECT is((SELECT sg_around_green FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa01-000000000000')), 0::numeric, 'tee-penalty-logged-after-the-shot: Around the green');
SELECT is((SELECT sg_putting FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa01-000000000000')), -0.075::numeric, 'tee-penalty-logged-after-the-shot: Putting');
SELECT is((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa01-000000000000')), -0.915::numeric, 'tee-penalty-logged-after-the-shot: Total');
SELECT is((SELECT sg_tee FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa02-000000000000')), -1.099::numeric, 'penalty-logged-before-the-tee-shot: Off the tee');
SELECT is((SELECT sg_approach FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa02-000000000000')), -0.118::numeric, 'penalty-logged-before-the-tee-shot: Approach');
SELECT is((SELECT sg_around_green FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa02-000000000000')), 0::numeric, 'penalty-logged-before-the-tee-shot: Around the green');
SELECT is((SELECT sg_putting FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa02-000000000000')), 0.678::numeric, 'penalty-logged-before-the-tee-shot: Putting');
SELECT is((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa02-000000000000')), -0.539::numeric, 'penalty-logged-before-the-tee-shot: Total');
SELECT is((SELECT sg_tee FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa03-000000000000')), -0.145::numeric, 'approach-penalty-from-200-out: Off the tee');
SELECT is((SELECT sg_approach FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa03-000000000000')), -1.475::numeric, 'approach-penalty-from-200-out: Approach');
SELECT is((SELECT sg_around_green FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa03-000000000000')), 0::numeric, 'approach-penalty-from-200-out: Around the green');
SELECT is((SELECT sg_putting FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa03-000000000000')), 0.61::numeric, 'approach-penalty-from-200-out: Putting');
SELECT is((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa03-000000000000')), -1.01::numeric, 'approach-penalty-from-200-out: Total');
SELECT is((SELECT sg_tee FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa04-000000000000')), 0.052::numeric, 'short-shot-penalty-drop-farther-out: Off the tee');
SELECT is((SELECT sg_approach FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa04-000000000000')), -0.634::numeric, 'short-shot-penalty-drop-farther-out: Approach');
SELECT is((SELECT sg_around_green FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa04-000000000000')), -2.161::numeric, 'short-shot-penalty-drop-farther-out: Around the green');
SELECT is((SELECT sg_putting FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa04-000000000000')), 0.678::numeric, 'short-shot-penalty-drop-farther-out: Putting');
SELECT is((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa04-000000000000')), -2.065::numeric, 'short-shot-penalty-drop-farther-out: Total');
SELECT is((SELECT sg_tee FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa05-000000000000')), 0::numeric, 'par-3-tee-penalty: Off the tee');
SELECT is((SELECT sg_approach FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa05-000000000000')), -1.873::numeric, 'par-3-tee-penalty: Approach');
SELECT is((SELECT sg_around_green FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa05-000000000000')), 0::numeric, 'par-3-tee-penalty: Around the green');
SELECT is((SELECT sg_putting FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa05-000000000000')), -0.075::numeric, 'par-3-tee-penalty: Putting');
SELECT is((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa05-000000000000')), -1.948::numeric, 'par-3-tee-penalty: Total');
SELECT is((SELECT sg_tee FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa06-000000000000')), -1.963::numeric, 'out-of-bounds-re-tee: Off the tee');
SELECT is((SELECT sg_approach FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa06-000000000000')), 0.082::numeric, 'out-of-bounds-re-tee: Approach');
SELECT is((SELECT sg_around_green FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa06-000000000000')), 0::numeric, 'out-of-bounds-re-tee: Around the green');
SELECT is((SELECT sg_putting FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa06-000000000000')), -0.13::numeric, 'out-of-bounds-re-tee: Putting');
SELECT is((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa06-000000000000')), -2.011::numeric, 'out-of-bounds-re-tee: Total');
SELECT is((SELECT sg_tee FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa07-000000000000')), 0.016::numeric, 'lie-break-between-shots: Off the tee');
SELECT is((SELECT sg_approach FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa07-000000000000')), 0.194::numeric, 'lie-break-between-shots: Approach');
SELECT is((SELECT sg_around_green FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa07-000000000000')), 0::numeric, 'lie-break-between-shots: Around the green');
SELECT is((SELECT sg_putting FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa07-000000000000')), 0.78::numeric, 'lie-break-between-shots: Putting');
SELECT is((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-aa07-000000000000')), 0.99::numeric, 'lie-break-between-shots: Total');

-- recalculate_round_strokes_gained persists the same numbers (golf_rounds columns keep 2 decimals)
SELECT public.recalculate_round_strokes_gained('00000000-0000-0000-aa01-000000000000');
SELECT ok(abs((SELECT strokes_gained_tee FROM public.golf_rounds WHERE id = '00000000-0000-0000-aa01-000000000000') - (-0.974)) < 0.006, 'recalculate stores Off the tee for the tee-penalty hole');
SELECT ok(abs((SELECT strokes_gained_approach FROM public.golf_rounds WHERE id = '00000000-0000-0000-aa01-000000000000') - (0.134)) < 0.006, 'recalculate stores Approach for the tee-penalty hole');
SELECT ok(abs((SELECT strokes_gained_total FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-aa01-000000000000') - (-0.915)) < 0.006, 'recalculate writes the per-round cache row');

-- an is_test round carries no strokes gained: NULL in golf_rounds and in the per-round cache
SELECT public.recalculate_round_strokes_gained('00000000-0000-0000-ee02-000000000000');
SELECT public.recalculate_round_strokes_gained('00000000-0000-0000-ee01-000000000000');
SELECT is((SELECT strokes_gained_total FROM public.golf_rounds WHERE id = '00000000-0000-0000-ee01-000000000000'), NULL::numeric, 'an is_test round stores NULL strokes gained');
SELECT is((SELECT count(*) FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-ee01-000000000000' AND strokes_gained_total IS NOT NULL), 0::bigint, 'an is_test round has no SG in the per-round cache');
SELECT ok((SELECT strokes_gained_total FROM public.golf_rounds WHERE id = '00000000-0000-0000-ee02-000000000000') IS NOT NULL, 'the same shots on a normal round do get strokes gained');

-- idempotent: a second recalculation of the test round leaves it NULL and raises nothing
SELECT lives_ok($$SELECT public.recalculate_round_strokes_gained('00000000-0000-0000-ee01-000000000000')$$, 'recalculating an is_test round twice is safe');

SELECT * FROM finish();
ROLLBACK;
