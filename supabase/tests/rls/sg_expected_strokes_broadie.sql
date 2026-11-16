-- The PGA Tour expected-strokes curve is Broadie's published table (SC-03,
-- 20261115215000_golf_sg_tour_curve_broadie_table.sql): Interfaces 42(2),
-- Appendix B, Table B.1. The pins are the table's own rows (and the putting
-- values the curve has always used), each within 0.01; the TypeScript copy
-- (src/lib/golf/sg-tour-baseline.ts) is compared with the schema file by
-- src/lib/golf/__tests__/sg-tour-baseline.test.ts.
--
-- Then the telescoping check: with the shot-end rule of Q-89, a hole's shots
-- gain, together, exactly expected(first shot) - strokes, penalty strokes
-- counted. Four one-hole rounds, each ending its shots between the table's
-- rows so a broken row would show.

BEGIN;
\ir _helpers.sql

SELECT plan(36);

-- Pins: Table B.1 (yards), green in feet (the function takes yards) ------------

SELECT ok(abs(public.sg_expected_strokes('tee', 260, 1.0) - 3.45) <= 0.01, 'tee 260 yd 3.45');
SELECT ok(abs(public.sg_expected_strokes('tee', 280, 1.0) - 3.65) <= 0.01, 'tee 280 yd 3.65');
SELECT ok(abs(public.sg_expected_strokes('tee', 440, 1.0) - 4.08) <= 0.01, 'tee 440 yd 4.08');
SELECT ok(abs(public.sg_expected_strokes('tee', 460, 1.0) - 4.17) <= 0.01, 'tee 460 yd 4.17');
SELECT ok(abs(public.sg_expected_strokes('tee', 500, 1.0) - 4.41) <= 0.01, 'tee 500 yd 4.41');
SELECT ok(abs(public.sg_expected_strokes('fairway', 40, 1.0) - 2.60) <= 0.01, 'fairway 40 yd 2.60');
SELECT ok(abs(public.sg_expected_strokes('fairway', 60, 1.0) - 2.70) <= 0.01, 'fairway 60 yd 2.70');
SELECT ok(abs(public.sg_expected_strokes('fairway', 540, 1.0) - 4.66) <= 0.01, 'fairway 540 yd 4.66');
SELECT ok(abs(public.sg_expected_strokes('rough', 40, 1.0) - 2.78) <= 0.01, 'rough 40 yd 2.78');
SELECT ok(abs(public.sg_expected_strokes('rough', 60, 1.0) - 2.91) <= 0.01, 'rough 60 yd 2.91');
SELECT ok(abs(public.sg_expected_strokes('rough', 80, 1.0) - 2.96) <= 0.01, 'rough 80 yd 2.96');
SELECT ok(abs(public.sg_expected_strokes('sand', 40, 1.0) - 2.82) <= 0.01, 'sand 40 yd 2.82');
SELECT ok(abs(public.sg_expected_strokes('sand', 60, 1.0) - 3.15) <= 0.01, 'sand 60 yd 3.15');
SELECT ok(abs(public.sg_expected_strokes('sand', 80, 1.0) - 3.24) <= 0.01, 'sand 80 yd 3.24');
SELECT ok(abs(public.sg_expected_strokes('sand', 140, 1.0) - 3.22) <= 0.01, 'sand 140 yd 3.22');
SELECT ok(abs(public.sg_expected_strokes('sand', 160, 1.0) - 3.28) <= 0.01, 'sand 160 yd 3.28');
SELECT ok(abs(public.sg_expected_strokes('sand', 540, 1.0) - 5.68) <= 0.01, 'sand 540 yd 5.68');
SELECT ok(abs(public.sg_expected_strokes('green', 1, 1.0) - 1.04) <= 0.01, 'green 3 ft 1.04');
SELECT ok(abs(public.sg_expected_strokes('green', 30, 1.0) - 2.40) <= 0.01, 'green 90 ft 2.40');

-- Between rows, below the first row, and the derived 'other' curve -------------

SELECT ok(abs(public.sg_expected_strokes('fairway', 65, 1.0) - 2.71) <= 0.001, 'between rows: fairway 65 yd is halfway from 2.70 to 2.72');
SELECT ok(abs(public.sg_expected_strokes('fairway', 10, 1.0) - 2.18) <= 0.001, 'SC-11: the 10-yard row is published (fairway 2.18)');
SELECT ok(abs(public.sg_expected_strokes('sand', 5, 1.0) - 2.43) <= 0.001, 'below the first row a lie holds it (sand 5 yd 2.43)');
SELECT ok(abs(public.sg_expected_strokes('tee', 80, 1.0) - 2.92) <= 0.001, 'the tee column starts at 100 yd (2.92) and holds below');
SELECT ok(public.sg_expected_strokes('other', 50, 1.0) = public.sg_expected_strokes('rough', 50, 1.0), '''other'' is the rough curve to 50 yd');
SELECT ok(abs(public.sg_expected_strokes('other', 200, 1.0) - (public.sg_expected_strokes('rough', 200, 1.0) + public.sg_expected_strokes('recovery', 200, 1.0)) / 2) <= 0.001, '''other'' is halfway between rough and recovery from 100 yd');

-- Telescoping ------------------------------------------------------------------

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-5b10-000000000001', 'sg-broadie@helm.test', 'authenticated')
ON CONFLICT DO NOTHING;
INSERT INTO public.users (id, email, role) VALUES
  ('00000000-0000-0000-5b10-000000000001', 'sg-broadie@helm.test', 'player')
ON CONFLICT DO NOTHING;
INSERT INTO public.golf_players (id, user_id, first_name) VALUES
  ('00000000-0000-0000-5b11-000000000001', '00000000-0000-0000-5b10-000000000001', 'SG Broadie')
ON CONFLICT DO NOTHING;

INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type) VALUES
  ('00000000-0000-0000-5b1d-00000000000a', '00000000-0000-0000-5b11-000000000001', CURRENT_DATE, 'in_progress', 'practice'),
  ('00000000-0000-0000-5b1d-00000000000b', '00000000-0000-0000-5b11-000000000001', CURRENT_DATE, 'in_progress', 'practice'),
  ('00000000-0000-0000-5b1d-00000000000c', '00000000-0000-0000-5b11-000000000001', CURRENT_DATE, 'in_progress', 'practice'),
  ('00000000-0000-0000-5b1d-00000000000d', '00000000-0000-0000-5b11-000000000001', CURRENT_DATE, 'in_progress', 'practice');

SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-5b10-000000000001', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES
  ('00000000-0000-0000-5b1e-00000000000a', '00000000-0000-0000-5b1d-00000000000a', 1, 4),
  ('00000000-0000-0000-5b1e-00000000000b', '00000000-0000-0000-5b1d-00000000000b', 1, 5),
  ('00000000-0000-0000-5b1e-00000000000c', '00000000-0000-0000-5b1d-00000000000c', 1, 4),
  ('00000000-0000-0000-5b1e-00000000000d', '00000000-0000-0000-5b1d-00000000000d', 1, 3);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty) VALUES
  -- A, par 4, 440 yd: fairway at 150, green at 25 ft, two putts (4)
  ('00000000-0000-0000-5b1f-0000000000a1', '00000000-0000-0000-5b1d-00000000000a', '00000000-0000-0000-5b1e-00000000000a', 1, 1, 'tee', 'tee', 'fairway', 440, 'yards', 150, 'yards', 'fairway', NULL, NULL),
  ('00000000-0000-0000-5b1f-0000000000a2', '00000000-0000-0000-5b1d-00000000000a', '00000000-0000-0000-5b1e-00000000000a', 1, 2, 'approach', 'fairway', 'green', 150, 'yards', 25, 'feet', 'green', NULL, NULL),
  ('00000000-0000-0000-5b1f-0000000000a3', '00000000-0000-0000-5b1d-00000000000a', '00000000-0000-0000-5b1e-00000000000a', 1, 3, 'putting', 'green', 'green', 25, 'feet', 3, 'feet', 'green', FALSE, NULL),
  ('00000000-0000-0000-5b1f-0000000000a4', '00000000-0000-0000-5b1d-00000000000a', '00000000-0000-0000-5b1e-00000000000a', 1, 4, 'putting', 'green', 'green', 3, 'feet', 0, 'feet', 'hole', TRUE, NULL),
  -- B, par 5, 530 yd: into the trees at 270, out to the rough at 95, into the bunker at 25, out to 8 ft, one putt (5)
  ('00000000-0000-0000-5b1f-0000000000b1', '00000000-0000-0000-5b1d-00000000000b', '00000000-0000-0000-5b1e-00000000000b', 1, 1, 'tee', 'tee', 'other', 530, 'yards', 270, 'yards', 'other', NULL, NULL),
  ('00000000-0000-0000-5b1f-0000000000b2', '00000000-0000-0000-5b1d-00000000000b', '00000000-0000-0000-5b1e-00000000000b', 1, 2, 'approach', 'other', 'rough', 270, 'yards', 95, 'yards', 'rough', NULL, NULL),
  ('00000000-0000-0000-5b1f-0000000000b3', '00000000-0000-0000-5b1d-00000000000b', '00000000-0000-0000-5b1e-00000000000b', 1, 3, 'approach', 'rough', 'sand', 95, 'yards', 25, 'yards', 'sand', NULL, NULL),
  ('00000000-0000-0000-5b1f-0000000000b4', '00000000-0000-0000-5b1d-00000000000b', '00000000-0000-0000-5b1e-00000000000b', 1, 4, 'around_green', 'sand', 'green', 25, 'yards', 8, 'feet', 'green', NULL, NULL),
  ('00000000-0000-0000-5b1f-0000000000b5', '00000000-0000-0000-5b1d-00000000000b', '00000000-0000-0000-5b1e-00000000000b', 1, 5, 'putting', 'green', 'green', 8, 'feet', 0, 'feet', 'hole', TRUE, NULL),
  -- C, par 4, 395 yd: tee shot in the water, the drop at 175 in the fairway, green at 40 ft, two putts (4 + 1 = 5)
  ('00000000-0000-0000-5b1f-0000000000c1', '00000000-0000-0000-5b1d-00000000000c', '00000000-0000-0000-5b1e-00000000000c', 1, 1, 'tee', 'tee', 'fairway', 395, 'yards', 175, 'yards', 'other', NULL, NULL),
  ('00000000-0000-0000-5b1f-0000000000c2', '00000000-0000-0000-5b1d-00000000000c', '00000000-0000-0000-5b1e-00000000000c', 1, 2, 'penalty', 'fairway', 'fairway', 175, 'yards', 175, 'yards', 'penalty', NULL, TRUE),
  ('00000000-0000-0000-5b1f-0000000000c3', '00000000-0000-0000-5b1d-00000000000c', '00000000-0000-0000-5b1e-00000000000c', 1, 3, 'approach', 'fairway', 'green', 175, 'yards', 40, 'feet', 'green', NULL, NULL),
  ('00000000-0000-0000-5b1f-0000000000c4', '00000000-0000-0000-5b1d-00000000000c', '00000000-0000-0000-5b1e-00000000000c', 1, 4, 'putting', 'green', 'green', 40, 'feet', 2, 'feet', 'green', FALSE, NULL),
  ('00000000-0000-0000-5b1f-0000000000c5', '00000000-0000-0000-5b1d-00000000000c', '00000000-0000-0000-5b1e-00000000000c', 1, 5, 'putting', 'green', 'green', 2, 'feet', 0, 'feet', 'hole', TRUE, NULL),
  -- D, par 3, 165 yd: rough at 12 yd, chip to 4 ft, one putt (3)
  ('00000000-0000-0000-5b1f-0000000000d1', '00000000-0000-0000-5b1d-00000000000d', '00000000-0000-0000-5b1e-00000000000d', 1, 1, 'tee', 'tee', 'rough', 165, 'yards', 12, 'yards', 'rough', NULL, NULL),
  ('00000000-0000-0000-5b1f-0000000000d2', '00000000-0000-0000-5b1d-00000000000d', '00000000-0000-0000-5b1e-00000000000d', 1, 2, 'around_green', 'rough', 'green', 12, 'yards', 4, 'feet', 'green', NULL, NULL),
  ('00000000-0000-0000-5b1f-0000000000d3', '00000000-0000-0000-5b1d-00000000000d', '00000000-0000-0000-5b1e-00000000000d', 1, 3, 'putting', 'green', 'green', 4, 'feet', 0, 'feet', 'hole', TRUE, NULL);

-- Each hole: the shots gain expected(tee) - strokes, read from the curve itself.
SELECT ok(
  abs((SELECT sg_total FROM public.calculate_round_strokes_gained(r.id))
      - (public.sg_expected_strokes('tee', s.first_yards, 1.0) - s.strokes)) <= 0.001,
  'telescopes: hole ' || r.label || ' gains expected(tee) - strokes'
)
FROM (VALUES
  ('00000000-0000-0000-5b1d-00000000000a'::uuid, 'A'),
  ('00000000-0000-0000-5b1d-00000000000b'::uuid, 'B'),
  ('00000000-0000-0000-5b1d-00000000000c'::uuid, 'C'),
  ('00000000-0000-0000-5b1d-00000000000d'::uuid, 'D')
) AS r (id, label)
CROSS JOIN LATERAL (
  SELECT
    (SELECT gs.distance_to_hole_before FROM public.golf_shots AS gs
     WHERE gs.round_id = r.id ORDER BY gs.shot_number LIMIT 1) AS first_yards,
    (SELECT count(*) FROM public.golf_shots AS gs WHERE gs.round_id = r.id) AS strokes
) AS s
ORDER BY r.label;

-- The same totals as numbers, from Table B.1 by hand.
SELECT ok(abs((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-5b1d-00000000000a')) - 0.08) <= 0.001, 'A: 4.08 - 4 = +0.08');
SELECT ok(abs((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-5b1d-00000000000b')) - (-0.405)) <= 0.001, 'B: 4.595 - 5 = -0.405');
SELECT ok(abs((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-5b1d-00000000000c')) - (-1.0175)) <= 0.001, 'C: 3.9825 - 5 = -1.0175, the penalty stroke counted');
SELECT ok(abs((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-5b1d-00000000000d')) - 0.005) <= 0.001, 'D: 3.005 - 3 = +0.005');

-- And the split on hole A: off the tee 4.08 - 2.945 - 1, approach 2.945 - 1.925 - 1, putting 1.925 - 2.
SELECT ok(abs((SELECT sg_tee FROM public.calculate_round_strokes_gained('00000000-0000-0000-5b1d-00000000000a')) - 0.135) <= 0.001, 'A: off the tee +0.135');
SELECT ok(abs((SELECT sg_approach FROM public.calculate_round_strokes_gained('00000000-0000-0000-5b1d-00000000000a')) - 0.02) <= 0.001, 'A: approach +0.02');
SELECT ok(abs((SELECT sg_putting FROM public.calculate_round_strokes_gained('00000000-0000-0000-5b1d-00000000000a')) - (-0.075)) <= 0.001, 'A: putting -0.075');

SELECT * FROM finish();
ROLLBACK;
