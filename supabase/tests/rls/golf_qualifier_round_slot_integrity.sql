BEGIN;

SELECT plan(4);

SELECT ok(
  to_regclass('public.golf_rounds_qualifier_player_round_number_uq') IS NOT NULL,
  'each non-abandoned qualifier round has a durable unique slot index'
);

SELECT ok(
  COALESCE((
    SELECT indexdef LIKE '%(qualifier_id, player_id, qualifier_round_number)%'
       AND indexdef LIKE '%status IS DISTINCT FROM ''abandoned''%'
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'golf_rounds'
      AND indexname = 'golf_rounds_qualifier_player_round_number_uq'
  ), false),
  'the unique slot index protects one active or completed slot per player, qualifier, and round number'
);

-- The protected RPC is the final database boundary: an old client may submit
-- directly after a coach closes a qualifier, so the action-layer error must be
-- repeated here. A closed qualifier is a coach decision, never a date gate.
DO $$
DECLARE
  v_user_id uuid := '00000000-0000-0000-0000-00000000a931';
  v_player_id uuid := '00000000-0000-0000-0000-00000000a932';
  v_team_id uuid := '00000000-0000-0000-0000-00000000a933';
  v_qualifier_id uuid := '00000000-0000-0000-0000-00000000a934';
  v_round_id uuid := '00000000-0000-0000-0000-00000000a935';
BEGIN
  INSERT INTO auth.users (id, email, role)
  VALUES (v_user_id, 'closed-qualifier-player@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_user_id, 'closed-qualifier-player@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name)
  VALUES (v_player_id, v_user_id, 'Closed')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code)
  VALUES (v_team_id, 'Closed Qualifier Test', 'CLOSEDQ')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_qualifiers (id, team_id, name, start_date, status, num_rounds)
  VALUES (v_qualifier_id, v_team_id, 'Closed Qualifier', CURRENT_DATE, 'completed', 1)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_rounds (
    id, player_id, team_id, qualifier_id, qualifier_round_number,
    round_date, status, round_type
  ) VALUES (
    v_round_id, v_player_id, v_team_id, v_qualifier_id, 1,
    CURRENT_DATE, 'in_progress', 'qualifier'
  ) ON CONFLICT DO NOTHING;
END $$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000a931", "role": "authenticated"}';

SELECT is(
  public.submit_round_atomic(
    '00000000-0000-0000-0000-00000000a935',
    '{"holes_played":1,"total_score":4,"total_putts":2,"qualifier_id":"00000000-0000-0000-0000-00000000a934","qualifier_round_number":1}'::jsonb,
    '[{"hole_number":1,"par":4,"score":4,"putts":2}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )->>'success',
  'false',
  'submit_round_atomic refuses a round after its coach has closed the qualifier'
);

RESET role;
RESET request.jwt.claims;

SELECT is(
  (SELECT status::text FROM public.golf_rounds
   WHERE id = '00000000-0000-0000-0000-00000000a935'),
  'in_progress',
  'a closed-qualifier refusal leaves the player round recoverable'
);

SELECT * FROM finish();

ROLLBACK;
