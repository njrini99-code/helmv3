-- A team's strokes-gained baseline scale prices the off-green game only
-- (SC-04, 20261115220000_golf_sg_scale_off_green.sql). A holed 1-foot putt
-- gains 0.00 on the men's Tour baseline and on the women's estimate (scale
-- 1.083), the off-green curve still carries the scale, and a hole still
-- telescopes to scale x expected(first shot) - strokes.

BEGIN;
\ir _helpers.sql

SELECT plan(9);

-- The curve itself -------------------------------------------------------------

SELECT ok(public.sg_expected_strokes('green', 1, 1.083) = public.sg_expected_strokes('green', 1, 1.0), 'a putt reads the Tour putting curve whatever the scale (3 ft, 1.083)');
SELECT ok(abs(public.sg_expected_strokes('green', 1.0 / 3, 1.083) - 1.00) <= 0.001, 'a 1-foot putt is expected to take 1.00 strokes on the women''s estimate');
SELECT ok(abs(public.sg_expected_strokes('fairway', 100, 1.083) - 2.80 * 1.083) <= 0.0001, 'off the green the scale still applies (fairway 100 yd, 2.80 x 1.083)');

-- Two one-hole rounds: a men's team and a women's team ------------------------

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-5c40-000000000001', 'sg-offgreen-m@helm.test', 'authenticated'),
  ('00000000-0000-0000-5c40-000000000002', 'sg-offgreen-w@helm.test', 'authenticated')
ON CONFLICT DO NOTHING;
INSERT INTO public.users (id, email, role) VALUES
  ('00000000-0000-0000-5c40-000000000001', 'sg-offgreen-m@helm.test', 'player'),
  ('00000000-0000-0000-5c40-000000000002', 'sg-offgreen-w@helm.test', 'player')
ON CONFLICT DO NOTHING;
INSERT INTO public.golf_teams (id, name, join_code, gender) VALUES
  ('00000000-0000-0000-5c41-000000000001', 'SG off green, men',   'PGSGOGM1', 'mens'),
  ('00000000-0000-0000-5c41-000000000002', 'SG off green, women', 'PGSGOGW1', 'womens');
INSERT INTO public.golf_players (id, user_id, first_name) VALUES
  ('00000000-0000-0000-5c42-000000000001', '00000000-0000-0000-5c40-000000000001', 'SG Men'),
  ('00000000-0000-0000-5c42-000000000002', '00000000-0000-0000-5c40-000000000002', 'SG Women')
ON CONFLICT DO NOTHING;
INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
  ('00000000-0000-0000-5c41-000000000001', '00000000-0000-0000-5c42-000000000001', 'active'),
  ('00000000-0000-0000-5c41-000000000002', '00000000-0000-0000-5c42-000000000002', 'active');

SELECT is(public.sg_scale_for_player('00000000-0000-0000-5c42-000000000002'), 1.083::numeric, 'the women''s team reads the 1.083 scale');

INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type) VALUES
  ('00000000-0000-0000-5c43-000000000001', '00000000-0000-0000-5c42-000000000001', CURRENT_DATE, 'in_progress', 'practice'),
  ('00000000-0000-0000-5c43-000000000002', '00000000-0000-0000-5c42-000000000002', CURRENT_DATE, 'in_progress', 'practice');

SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-5c40-000000000001', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES
  ('00000000-0000-0000-5c44-000000000001', '00000000-0000-0000-5c43-000000000001', 1, 3);
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-5c40-000000000002', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES
  ('00000000-0000-0000-5c44-000000000002', '00000000-0000-0000-5c43-000000000002', 1, 3);
SELECT set_config('request.jwt.claims', '', true);

-- Par 3, 150 yd: the tee shot to 1 ft, the putt holed (2).
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, putt_made, is_penalty)
SELECT
  ('00000000-0000-0000-5c45-0000000000' || t.n || s.n)::uuid,
  ('00000000-0000-0000-5c43-00000000000' || t.n)::uuid,
  ('00000000-0000-0000-5c44-00000000000' || t.n)::uuid,
  1, s.shot_number, s.shot_type, s.lie_before, s.lie_after, s.d_before, s.u_before, s.d_after, s.u_after, s.result, s.putt_made, NULL
FROM (VALUES ('1'), ('2')) AS t (n)
CROSS JOIN (VALUES
  ('1', 1, 'tee',     'tee',   'green', 150::numeric, 'yards', 1::numeric, 'feet', 'green', NULL::boolean),
  ('2', 2, 'putting', 'green', 'green', 1::numeric,   'feet',  0::numeric, 'feet', 'hole',  TRUE)
) AS s (n, shot_number, shot_type, lie_before, lie_after, d_before, u_before, d_after, u_after, result, putt_made);

SELECT ok(abs((SELECT sg_putting FROM public.calculate_round_strokes_gained('00000000-0000-0000-5c43-000000000001'))) <= 0.001, 'men''s Tour baseline: the holed 1-foot putt gains 0.00');
SELECT ok(abs((SELECT sg_putting FROM public.calculate_round_strokes_gained('00000000-0000-0000-5c43-000000000002'))) <= 0.001, 'women''s estimate: the holed 1-foot putt gains 0.00 (was +0.083)');

-- The hole still telescopes: scale x expected(tee 150) - 2 strokes.
SELECT ok(abs((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-5c43-000000000001'))
              - (public.sg_expected_strokes('tee', 150, 1.0) - 2)) <= 0.001,
          'men''s hole gains expected(tee) - strokes');
SELECT ok(abs((SELECT sg_total FROM public.calculate_round_strokes_gained('00000000-0000-0000-5c43-000000000002'))
              - (public.sg_expected_strokes('tee', 150, 1.083) - 2)) <= 0.001,
          'women''s hole gains 1.083 x expected(tee) - strokes, so the round total does not move');
-- And the tee shot carries what putting no longer does: 1.083 x 2.98 - 1.00 - 1.
SELECT ok(abs((SELECT sg_total - sg_putting FROM public.calculate_round_strokes_gained('00000000-0000-0000-5c43-000000000002'))
              - (2.98 * 1.083 - 1.00 - 1)) <= 0.001,
          'women''s tee shot: 1.083 x 2.98 - 1.00 - 1, the putting curve unscaled at its end');

SELECT * FROM finish();
ROLLBACK;
