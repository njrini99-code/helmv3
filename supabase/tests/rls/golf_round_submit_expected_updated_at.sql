-- submit_round_atomic optimistic lock (swap audit C-6), added by
-- 20261001000000_submit_round_expected_updated_at.sql. The terminal submit
-- reads `p_round_data->>'expected_updated_at'` and returns
-- {success:false, error:'conflict'} when the round row is NEWER than the
-- caller's token, before any round, hole, or shot is rewritten. A missing or
-- empty key skips the check, so app builds that do not send it yet behave
-- exactly as before. These are real RPC calls as an authenticated player.
--
-- Every statement runs in one transaction, so NOW() is constant: tokens are
-- derived from the row's actual updated_at rather than from the clock.

BEGIN;
\ir _helpers.sql

SELECT plan(18);

DO $$
DECLARE
  v_user_one uuid := '00000000-0000-0000-0000-00000000c601';
  v_player_one uuid := '00000000-0000-0000-0000-00000000c602';
  v_user_two uuid := '00000000-0000-0000-0000-00000000c603';
  v_player_two uuid := '00000000-0000-0000-0000-00000000c604';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_user_one, 'pgtap-submit-lock-one@helm.test', 'authenticated'),
    (v_user_two, 'pgtap-submit-lock-two@helm.test', 'authenticated');

  INSERT INTO public.users (id, email, role) VALUES
    (v_user_one, 'pgtap-submit-lock-one@helm.test', 'player'),
    (v_user_two, 'pgtap-submit-lock-two@helm.test', 'player')
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role;

  INSERT INTO public.golf_players (id, user_id, first_name) VALUES
    (v_player_one, v_user_one, 'LockOne'),
    (v_player_two, v_user_two, 'LockTwo');

  INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
  VALUES
    -- stale token: must conflict and leave the durable graph untouched
    ('00000000-0000-0000-0000-00000000c611', v_player_one, CURRENT_DATE, 'in_progress', 'practice'),
    -- token equal to the row's updated_at: must succeed
    ('00000000-0000-0000-0000-00000000c612', v_player_one, CURRENT_DATE, 'in_progress', 'practice'),
    -- token newer than the row: must succeed
    ('00000000-0000-0000-0000-00000000c613', v_player_one, CURRENT_DATE, 'in_progress', 'practice'),
    -- no key at all (current app builds): must succeed as before
    ('00000000-0000-0000-0000-00000000c614', v_player_one, CURRENT_DATE, 'in_progress', 'practice'),
    -- empty-string key: treated as absent
    ('00000000-0000-0000-0000-00000000c615', v_player_one, CURRENT_DATE, 'in_progress', 'practice'),
    -- owned by player two: player one can never submit it
    ('00000000-0000-0000-0000-00000000c616', v_player_two, CURRENT_DATE, 'in_progress', 'practice');
END $$;

-- Minimal valid one-hole terminal payload (holes_played = 1, hole 1 only,
-- totals match the hole) with no shots. p_round_data carries the token.
CREATE FUNCTION pg_temp.submit_lock_probe(p_round_id uuid, p_round_data jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT public.submit_round_atomic(
    p_round_id,
    jsonb_build_object('holes_played', 1, 'total_score', 4, 'total_putts', 2)
      || p_round_data,
    '[{"hole_number": 1, "par": 4, "score": 4, "putts": 2}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );
$$;

SELECT ok(
  (SELECT position('expected_updated_at' IN p.prosrc) > 0
   FROM pg_proc p
   WHERE p.oid = 'public.submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)'::regprocedure),
  'submit_round_atomic reads expected_updated_at (migration applied)'
);

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000c601", "role": "authenticated"}';

-- Seed durable progress on the stale-token round: hole 1 scored 5 with one
-- shot. A stale submit below tries to replace it with a score of 4 and no
-- shots; if the lock failed, both changes would be visible.
SELECT is(
  public.save_partial_round_atomic(
    '00000000-0000-0000-0000-00000000c611',
    '{"course_name":"Submit Lock","holes_played":1,"current_hole":1}'::jsonb,
    '[{"hole_number":1,"par":4,"score":5,"putts":2}]'::jsonb,
    '[{"hole_number":1,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":400,"distance_unit_before":"yards","result":"fairway"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    NULL
  )->>'success',
  'true',
  'fixture partial save persists hole 1 (score 5) and one shot'
);

-- (a) Stale token: one second older than the row's updated_at.
SELECT is(
  pg_temp.submit_lock_probe(
    '00000000-0000-0000-0000-00000000c611',
    jsonb_build_object(
      'expected_updated_at',
      (SELECT updated_at - interval '1 second'
       FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000c611')
    )
  ),
  '{"success": false, "error": "conflict"}'::jsonb,
  'submit with a stale expected_updated_at returns exactly {success:false, error:conflict}'
);

SELECT is(
  (SELECT status::text FROM public.golf_rounds
   WHERE id = '00000000-0000-0000-0000-00000000c611'),
  'in_progress',
  'conflicted submit leaves the round in_progress'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_holes
   WHERE round_id = '00000000-0000-0000-0000-00000000c611'),
  1,
  'conflicted submit keeps the durable hole row'
);

SELECT is(
  (SELECT score FROM public.golf_holes
   WHERE round_id = '00000000-0000-0000-0000-00000000c611' AND hole_number = 1),
  5,
  'conflicted submit does not overwrite the durable hole score'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_shots
   WHERE round_id = '00000000-0000-0000-0000-00000000c611'),
  1,
  'conflicted submit keeps the durable shot'
);

-- (b) Token equal to the row's updated_at: the lock is `>`, never equality.
SELECT is(
  pg_temp.submit_lock_probe(
    '00000000-0000-0000-0000-00000000c612',
    jsonb_build_object(
      'expected_updated_at',
      (SELECT updated_at FROM public.golf_rounds
       WHERE id = '00000000-0000-0000-0000-00000000c612')
    )
  )->>'success',
  'true',
  'submit with the current expected_updated_at succeeds'
);

SELECT is(
  (SELECT status::text FROM public.golf_rounds
   WHERE id = '00000000-0000-0000-0000-00000000c612'),
  'completed',
  'submit with the current token completes the round'
);

SELECT is(
  (SELECT score FROM public.golf_holes
   WHERE round_id = '00000000-0000-0000-0000-00000000c612' AND hole_number = 1),
  4,
  'submit with the current token writes the submitted hole'
);

-- Token newer than the row (client clock ahead) is not a conflict either.
SELECT is(
  pg_temp.submit_lock_probe(
    '00000000-0000-0000-0000-00000000c613',
    jsonb_build_object(
      'expected_updated_at',
      (SELECT updated_at + interval '1 minute'
       FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000c613')
    )
  )->>'success',
  'true',
  'submit with a token newer than the row succeeds'
);

-- (c) No key: current app builds do not send it; behavior is unchanged.
SELECT is(
  pg_temp.submit_lock_probe('00000000-0000-0000-0000-00000000c614', '{}'::jsonb)->>'success',
  'true',
  'submit without expected_updated_at succeeds (backward compatible)'
);

SELECT is(
  (SELECT status::text FROM public.golf_rounds
   WHERE id = '00000000-0000-0000-0000-00000000c614'),
  'completed',
  'submit without expected_updated_at completes the round'
);

SELECT is(
  pg_temp.submit_lock_probe(
    '00000000-0000-0000-0000-00000000c615',
    '{"expected_updated_at": ""}'::jsonb
  )->>'success',
  'true',
  'an empty expected_updated_at is treated as absent'
);

-- A completed round cannot be resubmitted, token or not.
SELECT is(
  pg_temp.submit_lock_probe(
    '00000000-0000-0000-0000-00000000c612',
    jsonb_build_object(
      'expected_updated_at',
      (SELECT updated_at FROM public.golf_rounds
       WHERE id = '00000000-0000-0000-0000-00000000c612')
    )
  )->>'error',
  'Round not found, already completed, or no permission.',
  'a completed round cannot be resubmitted with a current token'
);

-- (d) Player one cannot submit player two's round. The ownership guard runs
-- before the lock, so a stale token gets the not-found error (not conflict,
-- which would confirm the round exists), and a missing token fails too.
SELECT is(
  pg_temp.submit_lock_probe(
    '00000000-0000-0000-0000-00000000c616',
    '{"expected_updated_at": "2000-01-01T00:00:00Z"}'::jsonb
  )->>'error',
  'Round not found, already completed, or no permission.',
  'another player''s round with a stale token returns not-found, not conflict'
);

SELECT is(
  pg_temp.submit_lock_probe('00000000-0000-0000-0000-00000000c616', '{}'::jsonb)->>'success',
  'false',
  'a player cannot submit another player''s round without a token'
);

RESET role;
RESET request.jwt.claims;

SELECT is(
  (SELECT status::text FROM public.golf_rounds
   WHERE id = '00000000-0000-0000-0000-00000000c616'),
  'in_progress',
  'the other player''s round stays in_progress'
);

SELECT * FROM finish();
ROLLBACK;
