-- submit_round_atomic is SECURITY DEFINER and is callable by players. These
-- are direct-RPC regressions, not action mocks: a stale browser payload must
-- never rewrite an already-started round's type, qualifier, or round number.

BEGIN;
\ir _helpers.sql

SELECT plan(18);

DO $$
DECLARE
  v_user_one uuid := '00000000-0000-0000-0000-00000000e101';
  v_player_one uuid := '00000000-0000-0000-0000-00000000e102';
  v_user_two uuid := '00000000-0000-0000-0000-00000000e103';
  v_player_two uuid := '00000000-0000-0000-0000-00000000e104';
  v_org uuid := '00000000-0000-0000-0000-00000000e105';
  v_team uuid := '00000000-0000-0000-0000-00000000e106';
  v_qualifier_one uuid := '00000000-0000-0000-0000-00000000e107';
  v_qualifier_two uuid := '00000000-0000-0000-0000-00000000e108';
  v_bound_round uuid := '00000000-0000-0000-0000-00000000e111';
  v_practice_round uuid := '00000000-0000-0000-0000-00000000e112';
  v_legacy_round uuid := '00000000-0000-0000-0000-00000000e113';
  v_other_round uuid := '00000000-0000-0000-0000-00000000e114';
  v_duplicate_legacy_round uuid := '00000000-0000-0000-0000-00000000e115';
  v_closed_legacy_round uuid := '00000000-0000-0000-0000-00000000e116';
  v_overflow_legacy_round uuid := '00000000-0000-0000-0000-00000000e117';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_user_one, 'pgtap-submit-identity-one@helm.test', 'authenticated'),
    (v_user_two, 'pgtap-submit-identity-two@helm.test', 'authenticated');

  INSERT INTO public.users (id, email, role) VALUES
    (v_user_one, 'pgtap-submit-identity-one@helm.test', 'player'),
    (v_user_two, 'pgtap-submit-identity-two@helm.test', 'player')
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role;

  INSERT INTO public.organizations (id, name, type)
  VALUES (v_org, 'pgtap-submit-identity-org', 'college');

  INSERT INTO public.golf_players (id, user_id) VALUES
    (v_player_one, v_user_one),
    (v_player_two, v_user_two);

  INSERT INTO public.golf_teams (id, name, join_code, organization_id, gender)
  VALUES (v_team, 'pgtap-submit-identity-team', 'PGID01', v_org, 'mens');

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (v_team, v_player_one, 'active'),
    (v_team, v_player_two, 'active');

  INSERT INTO public.golf_qualifiers (
    id, team_id, name, start_date, num_rounds, selection_state
  ) VALUES
    (v_qualifier_one, v_team, 'pgtap identity qualifier one', CURRENT_DATE, 2, 'open'),
    (v_qualifier_two, v_team, 'pgtap identity qualifier two', CURRENT_DATE, 2, 'open');

  UPDATE public.golf_qualifiers
  SET status = 'completed'
  WHERE id = v_qualifier_two;

  INSERT INTO public.golf_qualifier_entries (qualifier_id, player_id, status) VALUES
    (v_qualifier_one, v_player_one, 'entered'),
    (v_qualifier_two, v_player_one, 'entered');

  INSERT INTO public.golf_rounds (
    id, player_id, team_id, round_date, status, holes_played,
    round_type, qualifier_id, qualifier_round_number
  ) VALUES
    (v_bound_round, v_player_one, v_team, CURRENT_DATE, 'in_progress', 1,
      'qualifier', v_qualifier_one, 1),
    (v_practice_round, v_player_one, v_team, CURRENT_DATE, 'in_progress', 1,
      'practice', NULL, NULL),
    (v_legacy_round, v_player_one, v_team, CURRENT_DATE, 'in_progress', 1,
      'qualifier', v_qualifier_one, NULL),
    (v_other_round, v_player_two, v_team, CURRENT_DATE, 'in_progress', 1,
      'practice', NULL, NULL),
    (v_duplicate_legacy_round, v_player_one, v_team, CURRENT_DATE, 'in_progress', 1,
      'qualifier', v_qualifier_one, NULL),
    (v_closed_legacy_round, v_player_one, v_team, CURRENT_DATE, 'in_progress', 1,
      'qualifier', v_qualifier_two, NULL),
    (v_overflow_legacy_round, v_player_one, v_team, CURRENT_DATE, 'in_progress', 1,
      'qualifier', v_qualifier_one, NULL);
END $$;

-- Keep the payload deliberately minimal while exercising the real terminal
-- RPC. A single completed hole avoids unrelated scorecard setup concerns.
CREATE FUNCTION pg_temp.submit_identity_probe(p_round_id uuid, p_round_data jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT public.submit_round_atomic(
    p_round_id,
    p_round_data,
    '[{"hole_number": 1, "par": 4, "score": 4, "putts": 2}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );
$$;

SELECT isnt(
  has_function_privilege(
    'anon',
    'public.submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)',
    'EXECUTE'
  ),
  true,
  'anon cannot call terminal round submit'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)',
    'EXECUTE'
  ),
  'authenticated players can call terminal round submit'
);

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000e101", "role": "authenticated"}';

-- A stale retry attempts to change every identity field on a bound qualifier.
SELECT is(
  (pg_temp.submit_identity_probe(
    '00000000-0000-0000-0000-00000000e111',
    jsonb_build_object(
      'holes_played', 1,
      'total_score', 4,
      'total_putts', 2,
      'round_type', 'practice',
      'qualifier_id', '00000000-0000-0000-0000-00000000e108',
      'qualifier_round_number', 2
    )
  )->>'success')::boolean,
  true,
  'qualifier round can complete despite stale identity fields'
);

SELECT is(
  (SELECT round_type FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000e111'),
  'qualifier',
  'a stale retry cannot change a qualifier round to practice'
);

SELECT is(
  (SELECT qualifier_id FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000e111'),
  '00000000-0000-0000-0000-00000000e107'::uuid,
  'a stale retry cannot retarget the persisted qualifier'
);

SELECT is(
  (SELECT qualifier_round_number FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000e111'),
  1,
  'a stale retry cannot rewrite the persisted qualifier round number'
);

-- A practice round must not become a qualifier merely because its client
-- payload contains a stale qualifier selection.
SELECT is(
  (pg_temp.submit_identity_probe(
    '00000000-0000-0000-0000-00000000e112',
    jsonb_build_object(
      'holes_played', 1,
      'total_score', 4,
      'total_putts', 2,
      'round_type', 'qualifier',
      'qualifier_id', '00000000-0000-0000-0000-00000000e108',
      'qualifier_round_number', 1
    )
  )->>'success')::boolean,
  true,
  'practice round can complete despite a stale qualifier payload'
);

SELECT is(
  (SELECT round_type FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000e112'),
  'practice',
  'a stale retry cannot change a practice round to qualifier'
);

SELECT is(
  (SELECT qualifier_id FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000e112'),
  NULL::uuid,
  'a stale retry cannot attach a qualifier to a practice round'
);

SELECT is(
  (SELECT qualifier_round_number FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000e112'),
  NULL::int,
  'a stale retry cannot attach a qualifier round number to a practice round'
);

-- Legacy started rows may have the correct qualifier link but no number. The
-- only permitted fill path validates the current player entry and configured
-- qualifier round count; it never accepts a different qualifier ID.
SELECT is(
  (pg_temp.submit_identity_probe(
    '00000000-0000-0000-0000-00000000e113',
    jsonb_build_object(
      'holes_played', 1,
      'total_score', 4,
      'total_putts', 2,
      'round_type', 'practice',
      'qualifier_id', '00000000-0000-0000-0000-00000000e107',
      'qualifier_round_number', 2
    )
  )->>'success')::boolean,
  true,
  'legacy qualifier row can complete with its validated missing round number'
);

SELECT is(
  (SELECT round_type FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000e113'),
  'qualifier',
  'legacy qualifier row keeps qualifier type'
);

SELECT is(
  (SELECT qualifier_id FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000e113'),
  '00000000-0000-0000-0000-00000000e107'::uuid,
  'legacy qualifier row keeps its persisted qualifier link'
);

SELECT is(
  (SELECT qualifier_round_number FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000e113'),
  2,
  'legacy qualifier row fills only its validated missing round number'
);

-- The legacy compatibility branch must not create a second result for a
-- qualifier round number already used by the same entrant.
SELECT is(
  (pg_temp.submit_identity_probe(
    '00000000-0000-0000-0000-00000000e115',
    jsonb_build_object(
      'holes_played', 1,
      'total_score', 4,
      'total_putts', 2,
      'qualifier_id', '00000000-0000-0000-0000-00000000e107',
      'qualifier_round_number', 1
    )
  )->>'success')::boolean,
  false,
  'legacy qualifier row cannot duplicate an existing qualifier round number'
);

-- A manually closed qualifier rejects a direct terminal RPC too.
SELECT is(
  (pg_temp.submit_identity_probe(
    '00000000-0000-0000-0000-00000000e116',
    jsonb_build_object(
      'holes_played', 1,
      'total_score', 4,
      'total_putts', 2,
      'qualifier_id', '00000000-0000-0000-0000-00000000e108',
      'qualifier_round_number', 1
    )
  )->>'success')::boolean,
  false,
  'manually closed qualifier rejects direct terminal submission'
);

-- Untrusted oversized values return a controlled failure; they must never
-- reach a bare ::INT cast and abort the full submission transaction.
SELECT is(
  (pg_temp.submit_identity_probe(
    '00000000-0000-0000-0000-00000000e117',
    jsonb_build_object(
      'holes_played', 1,
      'total_score', 4,
      'total_putts', 2,
      'qualifier_id', '00000000-0000-0000-0000-00000000e107',
      'qualifier_round_number', '999999999999999999999999999999'
    )
  )->>'success')::boolean,
  false,
  'oversized qualifier round number returns a controlled direct-RPC failure'
);

-- This signed-in player cannot use the SECURITY DEFINER RPC to submit a
-- different player's remaining in-progress round.

SELECT is(
  (pg_temp.submit_identity_probe(
    '00000000-0000-0000-0000-00000000e114',
    jsonb_build_object('holes_played', 1, 'total_score', 4, 'total_putts', 2)
  )->>'success')::boolean,
  false,
  'a player cannot submit an in-progress round they do not own'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
