-- A stale or malformed client snapshot must never be acknowledged after it
-- drops shot groups whose hole numbers are absent from the supplied holes.
--
-- Before the guard added by the companion migration, both atomic round RPCs
-- used CONTINUE when a shot group could not find an inserted hole. That made
-- an invalid snapshot look successful while replacing durable shots with none;
-- submit_round_atomic could additionally mark the round completed. These are
-- real RPC calls as an authenticated player, not source-text assertions.

BEGIN;
\ir _helpers.sql

SELECT plan(8);

DO $$
DECLARE
  v_user_id uuid := '00000000-0000-0000-0000-00000000a901';
  v_player_id uuid := '00000000-0000-0000-0000-00000000a902';
BEGIN
  INSERT INTO auth.users (id, email, role)
  VALUES (v_user_id, 'snapshot-integrity-player@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_user_id, 'snapshot-integrity-player@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name)
  VALUES (v_player_id, v_user_id, 'Snapshot')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
  VALUES
    ('00000000-0000-0000-0000-00000000a903', v_player_id, CURRENT_DATE, 'in_progress', 'practice'),
    ('00000000-0000-0000-0000-00000000a904', v_player_id, CURRENT_DATE, 'in_progress', 'practice')
  ON CONFLICT DO NOTHING;
END $$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000a901", "role": "authenticated"}';

SELECT is(
  public.save_partial_round_atomic(
    '00000000-0000-0000-0000-00000000a903',
    '{"course_name":"Snapshot Integrity","holes_played":1,"current_hole":1}'::jsonb,
    '[{"hole_number":1,"par":4,"score":4,"putts":2}]'::jsonb,
    '[{"hole_number":1,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":400,"distance_unit_before":"yards","result":"fairway"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    NULL
  )->>'success',
  'true',
  'fixture partial save persists one matching hole and shot'
);

SELECT is(
  public.save_partial_round_atomic(
    '00000000-0000-0000-0000-00000000a903',
    '{"course_name":"Snapshot Integrity","holes_played":1,"current_hole":1}'::jsonb,
    '[{"hole_number":1,"par":4,"score":4,"putts":2}]'::jsonb,
    '[{"hole_number":2,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":400,"distance_unit_before":"yards","result":"fairway"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    NULL
  )->>'success',
  'false',
  'partial save rejects a shot group without a matching supplied hole'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_shots
   WHERE round_id = '00000000-0000-0000-0000-00000000a903'),
  1,
  'rejected partial save preserves the already durable shot'
);

SELECT is(
  public.save_partial_round_atomic(
    '00000000-0000-0000-0000-00000000a904',
    '{"course_name":"Snapshot Integrity","holes_played":1,"current_hole":1}'::jsonb,
    '[{"hole_number":1,"par":4,"score":4,"putts":2}]'::jsonb,
    '[{"hole_number":1,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":400,"distance_unit_before":"yards","result":"fairway"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    NULL
  )->>'success',
  'true',
  'fixture save persists progress before submit validation'
);

SELECT is(
  public.submit_round_atomic(
    '00000000-0000-0000-0000-00000000a904',
    '{"course_name":"Snapshot Integrity","holes_played":1,"total_score":4,"total_putts":2}'::jsonb,
    '[{"hole_number":1,"par":4,"score":4,"putts":2}]'::jsonb,
    '[{"hole_number":2,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":400,"distance_unit_before":"yards","result":"fairway"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )->>'success',
  'false',
  'submit rejects a shot group without a matching supplied hole'
);

SELECT is(
  (SELECT status::text FROM public.golf_rounds
   WHERE id = '00000000-0000-0000-0000-00000000a904'),
  'in_progress',
  'rejected submit leaves the round resumable'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_shots
   WHERE round_id = '00000000-0000-0000-0000-00000000a904'),
  1,
  'rejected submit preserves the already durable shot'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_holes
   WHERE round_id = '00000000-0000-0000-0000-00000000a904'),
  1,
  'rejected submit preserves the already durable hole'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
