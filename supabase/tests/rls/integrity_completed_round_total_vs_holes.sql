-- run_integrity_checks: completed_round_total_vs_holes (20261115210000,
-- launch readiness DATA-05, QUEUE row lr-data-05).
--
-- BEHAVIORAL: plants five rounds and reads what the nightly integrity check
-- reports. Only a completed round whose hole rows number holes_played and are
-- all scored, and whose stored total is not their sum, is flagged; that is the
-- rule recompute_golf_round_totals (20261114090100) keeps, so a round the
-- trigger leaves alone (in progress, a missing hole row, an unscored hole) is
-- never flagged. The count is read against the database's own baseline, so
-- seed data that already trips the check does not break the test.
--
-- The wrong total is written the way the check exists to catch: on the round
-- alone, with no hole write after it, so the golf_holes trigger never runs.
--
-- Plan: 1 present + 3 flagged + 1 cleared + 3 function shape = 8. Before
-- 20261115210000 the presence check fails and the three that read the check's
-- entry fail with it.

BEGIN;
\ir _helpers.sql

SELECT plan(8);

CREATE TEMP TABLE integrity_total_baseline ON COMMIT DROP AS
SELECT COALESCE(
  (SELECT (c->>'count')::int
     FROM jsonb_array_elements(public.run_integrity_checks()) c
    WHERE c->>'check' = 'completed_round_total_vs_holes'),
  0
) AS n;

DO $$
DECLARE
  v_user     uuid := '00000000-0000-0000-da05-000000000001';
  v_player   uuid := '00000000-0000-0000-da05-000000000002';
  v_ok       uuid := '00000000-0000-0000-da05-000000000011';
  v_bad      uuid := '00000000-0000-0000-da05-000000000012';
  v_unscored uuid := '00000000-0000-0000-da05-000000000013';
  v_short    uuid := '00000000-0000-0000-da05-000000000014';
  v_live     uuid := '00000000-0000-0000-da05-000000000015';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_user, 'integrity-total-player@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    (v_user, 'integrity-total-player@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id) VALUES (v_player, v_user)
  ON CONFLICT DO NOTHING;

  -- created_at a day ahead keeps the planted round among the check's 5 newest.
  INSERT INTO public.golf_rounds (id, player_id, round_date, status, holes_played, total_score, created_at) VALUES
    (v_ok,       v_player, CURRENT_DATE, 'in_progress', 3, NULL, now() + interval '1 day'),
    (v_bad,      v_player, CURRENT_DATE, 'in_progress', 3, NULL, now() + interval '1 day'),
    (v_unscored, v_player, CURRENT_DATE, 'in_progress', 3, NULL, now() + interval '1 day'),
    (v_short,    v_player, CURRENT_DATE, 'in_progress', 4, NULL, now() + interval '1 day'),
    (v_live,     v_player, CURRENT_DATE, 'in_progress', 3, 20,   now() + interval '1 day')
  ON CONFLICT DO NOTHING;

  -- The player's identity for the hole writes, as the totals-follow-holes suite does.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );

  -- Scores 5, 3, 6 = 14 wherever all three holes are scored.
  INSERT INTO public.golf_holes (round_id, hole_number, par, score, putts) VALUES
    (v_ok, 1, 4, 5, 2), (v_ok, 2, 3, 3, 2), (v_ok, 3, 5, 6, 2),
    (v_bad, 1, 4, 5, 2), (v_bad, 2, 3, 3, 2), (v_bad, 3, 5, 6, 2),
    (v_unscored, 1, 4, 5, 2), (v_unscored, 2, 3, NULL, NULL), (v_unscored, 3, 5, 6, 2),
    (v_short, 1, 4, 5, 2), (v_short, 2, 3, 3, 2), (v_short, 3, 5, 6, 2),
    (v_live, 1, 4, 5, 2), (v_live, 2, 3, 3, 2), (v_live, 3, 5, 6, 2);

  -- Complete four the way submit does (status and totals together, under
  -- 'atomic'), with no hole write after. v_bad stores 15 for holes that sum to
  -- 14: one stroke off, as the 15 rounds 20261114090100 backfilled were.
  PERFORM set_config('helm.golf_lifecycle_write', 'atomic', true);
  UPDATE public.golf_rounds SET status = 'completed', total_score = 14, score_to_par = 2 WHERE id = v_ok;
  UPDATE public.golf_rounds SET status = 'completed', total_score = 15, score_to_par = 3 WHERE id = v_bad;
  UPDATE public.golf_rounds SET status = 'completed', total_score = 50, score_to_par = 50 WHERE id = v_unscored;
  UPDATE public.golf_rounds SET status = 'completed', total_score = 99, score_to_par = 99 WHERE id = v_short;
  PERFORM set_config('helm.golf_lifecycle_write', '', true);
END $$;

CREATE TEMP TABLE integrity_total_planted ON COMMIT DROP AS
SELECT c AS entry
  FROM jsonb_array_elements(public.run_integrity_checks()) c
 WHERE c->>'check' = 'completed_round_total_vs_holes';

SELECT is(
  (SELECT count(*)::int FROM integrity_total_planted),
  1,
  'run_integrity_checks reports completed_round_total_vs_holes once'
);

-- Of the five planted rounds only v_bad counts: v_ok agrees with its holes,
-- v_unscored and v_short are rounds the trigger leaves alone, v_live is not completed.
SELECT is(
  (SELECT (entry->>'count')::int FROM integrity_total_planted),
  (SELECT n + 1 FROM integrity_total_baseline),
  'a completed round whose total is one off its scored holes is counted, and no other planted round is'
);
SELECT ok(
  (SELECT entry->'sample' ? '00000000-0000-0000-da05-000000000012' FROM integrity_total_planted),
  'the sample names the mismatched round'
);
SELECT is(
  (SELECT entry->>'status' FROM integrity_total_planted),
  'fail',
  'the check fails while a mismatch exists'
);

-- The round's total put back to its holes' sum clears it.
SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_rounds SET total_score = 14, score_to_par = 2
WHERE id = '00000000-0000-0000-da05-000000000012';
SELECT set_config('helm.golf_lifecycle_write', '', true);

SELECT is(
  (SELECT (c->>'count')::int
     FROM jsonb_array_elements(public.run_integrity_checks()) c
    WHERE c->>'check' = 'completed_round_total_vs_holes'),
  (SELECT n FROM integrity_total_baseline),
  'once the total equals the holes'' sum the round is no longer counted'
);

-- Function shape kept --------------------------------------------------------
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.run_integrity_checks()'::regprocedure),
  'run_integrity_checks stays SECURITY DEFINER'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.run_integrity_checks()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.run_integrity_checks()', 'EXECUTE'),
  'neither anonymous nor signed-in users can run the integrity checks'
);
SELECT ok(
  has_function_privilege('service_role', 'public.run_integrity_checks()', 'EXECUTE'),
  'the cron''s service role can run them'
);

SELECT * FROM finish();
ROLLBACK;
