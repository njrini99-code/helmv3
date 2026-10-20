-- recompute_golf_round_totals: a hole with no putt count is "not recorded",
-- never a hole holed in zero putts (20261017110000).
--
-- The golf_holes trigger golf_holes_recompute_round_totals_fn runs the
-- function on every hole write. Before 20261017110000 it wrote 0 putts for a
-- round with no putt recorded, credited GIR on a hole with unknown putts from
-- its whole score, and counted every hole row in the GIR denominator.
--
-- This is a BEHAVIORAL test: it writes holes and reads the totals the trigger
-- left on golf_rounds.

BEGIN;
\ir _helpers.sql

SELECT plan(12);

DO $$
DECLARE
  v_userp   uuid := '00000000-0000-0000-0000-00000000f101';
  v_player  uuid := '00000000-0000-0000-0000-00000000f102';
  v_mixed   uuid := '00000000-0000-0000-0000-00000000f111';
  v_none    uuid := '00000000-0000-0000-0000-00000000f112';
  v_full    uuid := '00000000-0000-0000-0000-00000000f113';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_userp, 'roundtotals-player@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    (v_userp, 'roundtotals-player@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id) VALUES
    (v_player, v_userp)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_rounds (id, player_id, round_date, status) VALUES
    (v_mixed, v_player, CURRENT_DATE, 'in_progress'),
    (v_none,  v_player, CURRENT_DATE, 'in_progress'),
    (v_full,  v_player, CURRENT_DATE, 'in_progress')
  ON CONFLICT DO NOTHING;

  -- Claim the player's identity for the hole writes, so the fixture passes
  -- whichever recompute body is live (the HELD 20260708141000 one RAISEs
  -- 'Forbidden' without it).
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_userp::text, 'role', 'authenticated')::text,
    true
  );

  -- Mixed: one hole with putts (a GIR), one scored hole without putts (a 3 on
  -- a par 5, which the old body credited as a GIR), one hole not yet played.
  INSERT INTO public.golf_holes (round_id, hole_number, par, score, putts, fairway_hit) VALUES
    (v_mixed, 1, 4, 4, 2,    true),
    (v_mixed, 2, 5, 3, NULL, NULL),
    (v_mixed, 3, 4, NULL, NULL, NULL);

  -- No putt recorded anywhere.
  INSERT INTO public.golf_holes (round_id, hole_number, par, score, putts, fairway_hit) VALUES
    (v_none, 1, 4, 5, NULL, false),
    (v_none, 2, 3, NULL, NULL, NULL);

  -- Every hole fully recorded: the totals a submitted round gets. The par 3
  -- carries a fairway result on purpose: it must stay out of the fairway
  -- denominator (par >= 4 only).
  INSERT INTO public.golf_holes (round_id, hole_number, par, score, putts, fairway_hit) VALUES
    (v_full, 1, 4, 4, 2, true),
    (v_full, 2, 3, 3, 2, false),
    (v_full, 3, 5, 6, 3, false),
    (v_full, 4, 4, 3, 0, true);

  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- Mixed round --------------------------------------------------------------

SELECT is(
  (SELECT total_putts FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f111'),
  2,
  'total_putts sums only the putts recorded'
);
SELECT is(
  (SELECT total_gir FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f111'),
  1,
  'a scored hole without a putt count is never credited a GIR'
);
SELECT is(
  (SELECT total_gir_possible FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f111'),
  1,
  'the GIR denominator counts only scored holes with a putt count'
);
SELECT is(
  (SELECT total_fairways_hit FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f111'),
  1,
  'fairways hit unchanged'
);
SELECT is(
  (SELECT total_fairways FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f111'),
  1,
  'fairway denominator still counts only par-4/5 holes with a recorded result'
);

-- No putts recorded ----------------------------------------------------------

SELECT ok(
  (SELECT total_putts IS NULL FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f112'),
  'a round with no putt recorded has NULL putts, not 0'
);
SELECT is(
  (SELECT total_gir FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f112'),
  0,
  'no GIR credited without putts'
);
SELECT is(
  (SELECT total_gir_possible FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f112'),
  0,
  'no GIR denominator without putts'
);

-- Fully recorded round (what submit produces) --------------------------------

SELECT is(
  (SELECT ARRAY[total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways]
   FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f113'),
  ARRAY[7, 3, 4, 2, 3],
  'a fully recorded round totals as before (putts 7, GIR 3 of 4, fairways 2 of 3)'
);

-- A hole edit recomputes (a putt count arriving later) ------------------------

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000f101', 'role', 'authenticated')::text,
  true
);
UPDATE public.golf_holes SET putts = 1
WHERE round_id = '00000000-0000-0000-0000-00000000f112' AND hole_number = 1;
SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT ARRAY[total_putts, total_gir, total_gir_possible]
   FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f112'),
  ARRAY[1, 0, 1],
  'recording a putt later fills putts and the GIR denominator (5 on a par 4 in 1 putt: no GIR)'
);

-- Function shape kept --------------------------------------------------------

SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.recompute_golf_round_totals(uuid)'::regprocedure),
  'recompute_golf_round_totals stays SECURITY DEFINER'
);
SELECT is(
  (SELECT proconfig FROM pg_proc WHERE oid = 'public.recompute_golf_round_totals(uuid)'::regprocedure),
  ARRAY['search_path=public'],
  'recompute_golf_round_totals keeps search_path = public'
);

SELECT * FROM finish();
ROLLBACK;
