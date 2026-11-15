-- recompute_golf_round_totals: a completed round's total_score and
-- score_to_par follow its holes (20261114090100, audit F-0003).
--
-- BEHAVIORAL: writes holes and reads what the golf_holes trigger left on
-- golf_rounds. Only a completed round whose hole rows number holes_played and
-- are all scored is rewritten; an in-progress round, a completed round missing
-- a hole row or a score, and the middle of a submit's hole rewrite keep what is
-- stored. A completed round's holes change only under the lifecycle guard's
-- 'atomic' mark (as submit_round_atomic sets it); without it the guard still
-- refuses.
--
-- Plan: 1 guard + 2 edit + 1 cache + 1 in-progress + 1 short + 1 unscored
-- + 2 submit + 1 archive grant + 3 function shape = 13. Before 20261114090100
-- the two edit checks fail and the archive check stops the run (local stack,
-- 2026-11-14: 13/13 with the file, 2 failures and a stop without it).

BEGIN;
\ir _helpers.sql

SELECT plan(13);

DO $$
DECLARE
  v_user    uuid := '00000000-0000-0000-0000-00000000f201';
  v_player  uuid := '00000000-0000-0000-0000-00000000f202';
  v_done    uuid := '00000000-0000-0000-0000-00000000f211';
  v_live    uuid := '00000000-0000-0000-0000-00000000f212';
  v_short   uuid := '00000000-0000-0000-0000-00000000f213';
  v_unscored uuid := '00000000-0000-0000-0000-00000000f214';
  v_submit  uuid := '00000000-0000-0000-0000-00000000f215';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_user, 'totalsfollow-player@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    (v_user, 'totalsfollow-player@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id) VALUES (v_player, v_user)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_rounds (id, player_id, round_date, status, holes_played, total_score) VALUES
    (v_done,     v_player, CURRENT_DATE, 'in_progress', 3, NULL),
    (v_live,     v_player, CURRENT_DATE, 'in_progress', 3, NULL),
    (v_short,    v_player, CURRENT_DATE, 'in_progress', 4, NULL),
    (v_unscored, v_player, CURRENT_DATE, 'in_progress', 3, NULL),
    (v_submit,   v_player, CURRENT_DATE, 'in_progress', 3, NULL)
  ON CONFLICT DO NOTHING;

  -- The player's identity for the hole writes, as the null-putts suite does.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );

  -- In-progress holes (an auto-save). Pars 4, 3, 5 = 12.
  INSERT INTO public.golf_holes (round_id, hole_number, par, score, putts) VALUES
    (v_done, 1, 4, 5, 2), (v_done, 2, 3, 3, 2), (v_done, 3, 5, 6, 2),
    (v_live, 1, 4, 5, 2), (v_live, 2, 3, 3, 2), (v_live, 3, 5, 6, 2),
    (v_short, 1, 4, 5, 2), (v_short, 2, 3, 3, 2), (v_short, 3, 5, 6, 2),
    (v_unscored, 1, 4, 5, 2), (v_unscored, 2, 3, NULL, NULL), (v_unscored, 3, 5, 6, 2),
    (v_submit, 1, 4, 4, 2), (v_submit, 2, 3, 4, 2), (v_submit, 3, 5, 4, 2);

  -- Complete four of them the way submit does (status first, under 'atomic').
  -- v_done stores the right total (14, +2); v_short and v_unscored store
  -- totals the holes cannot produce, so a rewrite would show.
  PERFORM set_config('helm.golf_lifecycle_write', 'atomic', true);
  UPDATE public.golf_rounds SET status = 'completed', total_score = 14, score_to_par = 2
  WHERE id = v_done;
  UPDATE public.golf_rounds SET status = 'completed', total_score = 99, score_to_par = 99
  WHERE id = v_short;
  UPDATE public.golf_rounds SET status = 'completed', total_score = 50, score_to_par = 50
  WHERE id = v_unscored;
  PERFORM set_config('helm.golf_lifecycle_write', '', true);
END $$;

-- The lifecycle guard still refuses an unmarked hole edit on a completed round.
SELECT throws_ok(
  $$UPDATE public.golf_holes SET score = 4
    WHERE round_id = '00000000-0000-0000-0000-00000000f211' AND hole_number = 1$$,
  '55000',
  NULL,
  'an unmarked hole edit on a completed round is still refused'
);

-- A marked hole edit after completion: 5 -> 4 on hole 1.
SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_holes SET score = 4
WHERE round_id = '00000000-0000-0000-0000-00000000f211' AND hole_number = 1;
UPDATE public.golf_holes SET score = 4
WHERE round_id = '00000000-0000-0000-0000-00000000f213' AND hole_number = 1;
UPDATE public.golf_holes SET score = 4
WHERE round_id = '00000000-0000-0000-0000-00000000f214' AND hole_number = 1;
SELECT set_config('helm.golf_lifecycle_write', '', true);

SELECT is(
  (SELECT total_score FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f211'),
  13,
  'a hole edit after completion rewrites total_score to the holes'' sum'
);
SELECT is(
  (SELECT score_to_par FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f211'),
  1,
  'and score_to_par to the sum minus the holes'' par'
);
SELECT is(
  (SELECT count(*)::int FROM public.golf_round_stats_cache c
     JOIN public.golf_rounds r ON r.id = c.round_id
    WHERE r.id = '00000000-0000-0000-0000-00000000f211'
      AND c.total_score IS DISTINCT FROM r.total_score),
  0,
  'the stats cache row (where one is kept) follows the new total'
);

-- In-progress: an auto-save changes nothing here.
UPDATE public.golf_holes SET score = 7
WHERE round_id = '00000000-0000-0000-0000-00000000f212' AND hole_number = 3;
SELECT ok(
  (SELECT total_score IS NULL FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f212'),
  'an in-progress round''s total is left to the save'
);

SELECT is(
  (SELECT total_score FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f213'),
  99,
  'a completed round with fewer hole rows than holes_played keeps its stored total'
);
SELECT is(
  (SELECT total_score FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f214'),
  50,
  'a completed round with an unscored hole keeps its stored total'
);

-- Submit: status first, then the holes are deleted and re-inserted one by one
-- (submit_round_atomic's order). New scores 3, 4, 4 = 11 (par 12: -1).
SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_rounds SET status = 'completed', total_score = 11, score_to_par = -1
WHERE id = '00000000-0000-0000-0000-00000000f215';
DELETE FROM public.golf_holes WHERE round_id = '00000000-0000-0000-0000-00000000f215';
INSERT INTO public.golf_holes (round_id, hole_number, par, score, putts) VALUES
  ('00000000-0000-0000-0000-00000000f215', 1, 4, 3, 1);
INSERT INTO public.golf_holes (round_id, hole_number, par, score, putts) VALUES
  ('00000000-0000-0000-0000-00000000f215', 2, 3, 4, 2);
SELECT is(
  (SELECT total_score FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000f215'),
  11,
  'mid-rewrite (2 of 3 holes back) the submitted total is not touched'
);
INSERT INTO public.golf_holes (round_id, hole_number, par, score, putts) VALUES
  ('00000000-0000-0000-0000-00000000f215', 3, 5, 4, 2);
SELECT set_config('helm.golf_lifecycle_write', '', true);
SELECT results_eq(
  $$SELECT total_score, score_to_par FROM public.golf_rounds
    WHERE id = '00000000-0000-0000-0000-00000000f215'$$,
  $$VALUES (11, -1)$$,
  'after the last hole the totals equal what submit checked'
);

-- The backfill archive is private.
SELECT ok(
  NOT has_table_privilege('authenticated', 'helm_private.golf_rounds_total_score_fix_20261114', 'SELECT')
  AND NOT has_table_privilege('anon', 'helm_private.golf_rounds_total_score_fix_20261114', 'SELECT'),
  'the backfill archive is not readable by signed-in or anonymous users'
);

-- Function shape kept --------------------------------------------------------
SELECT ok(
  (SELECT prosrc LIKE '%totals follow holes (20261114090100)%'
     FROM pg_proc WHERE oid = 'public.recompute_golf_round_totals(uuid)'::regprocedure),
  'recompute_golf_round_totals carries the totals patch'
);
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
