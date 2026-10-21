-- CoachHelm Slice 4: contract for migration
-- 20261020120000_golf_focus_area_prescription.sql. The eight prescription
-- columns exist and are nullable; under the `authenticated` role the guard
-- trigger lets a coach on the player's active team set the prescription
-- columns, refuses the player (whose own update policy covers every column of
-- their row) and an off-team coach, refuses everyone on `verdict`, and leaves
-- the player's ordinary updates (notes) working. The table owner (the
-- service-role path the cron takes) may write `verdict`.

BEGIN;
\ir _helpers.sql

SELECT plan(12);

DO $$
DECLARE
  v_coach_user     uuid := '00000000-0000-0000-0000-0000000004a1';
  v_coach_id       uuid := '00000000-0000-0000-0000-0000000004a2';
  v_offteam_user   uuid := '00000000-0000-0000-0000-0000000004a3';
  v_offteam_coach  uuid := '00000000-0000-0000-0000-0000000004a4';
  v_team_id        uuid := '00000000-0000-0000-0000-0000000004a5';
  v_offteam_id     uuid := '00000000-0000-0000-0000-0000000004a6';
  v_puser          uuid := '00000000-0000-0000-0000-0000000004a7';
  v_player         uuid := '00000000-0000-0000-0000-0000000004a9';
  v_focus_area     uuid := '00000000-0000-0000-0000-0000000004ab';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_coach_user,   'rx-coach@helm.test',    'authenticated'),
    (v_offteam_user, 'rx-offcoach@helm.test', 'authenticated'),
    (v_puser,        'rx-player@helm.test',   'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    (v_coach_user,   'rx-coach@helm.test',    'coach'),
    (v_offteam_user, 'rx-offcoach@helm.test', 'coach'),
    (v_puser,        'rx-player@helm.test',   'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id) VALUES
    (v_coach_id, v_coach_user),
    (v_offteam_coach, v_offteam_user)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id) VALUES (v_player, v_puser)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_teams (id, name, join_code) VALUES
    (v_team_id, 'pgtap-rx', 'RXTEAM'),
    (v_offteam_id, 'pgtap-rx-off', 'RXOFF1')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (v_team_id, v_coach_id, 'head_coach', true),
    (v_offteam_id, v_offteam_coach, 'head_coach', true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (v_team_id, v_player, 'active')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_player_focus_areas
    (id, player_id, team_id, coach_id, area_type, title, status) VALUES
    (v_focus_area, v_player, v_team_id, v_coach_id, 'skill', 'RX putting', 'active')
  ON CONFLICT DO NOTHING;
END $$;

-- 1. Schema.
SELECT is(
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'golf_player_focus_areas'
      AND column_name IN ('baseline_n', 'baseline_shrunk', 'criterion', 'horizon',
                          'check_after_rounds', 'assigned_by', 'verdict', 'drill_ids')
      AND is_nullable = 'YES'),
  8,
  'the eight prescription columns exist and are nullable'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgname = 'golf_focus_area_prescription_guard'
      AND tgrelid = 'public.golf_player_focus_areas'::regclass),
  'the prescription guard trigger exists'
);
SELECT throws_ok(
  $q$ UPDATE public.golf_player_focus_areas SET assigned_by = 'robot'
      WHERE id = '00000000-0000-0000-0000-0000000004ab' $q$,
  '23514', NULL,
  'assigned_by is limited to coach, engine, player'
);

-- 2. The player.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000004a7", "role": "authenticated"}';

SELECT lives_ok(
  $q$ UPDATE public.golf_player_focus_areas SET notes = 'player note'
      WHERE id = '00000000-0000-0000-0000-0000000004ab' $q$,
  'the player can still update an ordinary column of their own focus area'
);
SELECT throws_ok(
  $q$ UPDATE public.golf_player_focus_areas
      SET criterion = '{"direction":"higher","threshold":0.5,"unit":"pct"}'::jsonb
      WHERE id = '00000000-0000-0000-0000-0000000004ab' $q$,
  '42501', NULL,
  'the player cannot set their own criterion'
);
SELECT throws_ok(
  $q$ UPDATE public.golf_player_focus_areas
      SET verdict = '{"word":"worked"}'::jsonb
      WHERE id = '00000000-0000-0000-0000-0000000004ab' $q$,
  '42501', NULL,
  'the player cannot write their own verdict'
);

RESET role;
RESET request.jwt.claims;

-- 3. The off-team coach (RLS gives them no row, so the update is a no-op).
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000004a3", "role": "authenticated"}';

SELECT lives_ok(
  $q$ UPDATE public.golf_player_focus_areas SET baseline_n = 99
      WHERE id = '00000000-0000-0000-0000-0000000004ab' $q$,
  'an off-team coach update reaches no row'
);

RESET role;
RESET request.jwt.claims;

SELECT is(
  (SELECT baseline_n FROM public.golf_player_focus_areas
    WHERE id = '00000000-0000-0000-0000-0000000004ab'),
  NULL,
  'the off-team coach did not change baseline_n'
);

-- 4. The on-team coach.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000004a1", "role": "authenticated"}';

SELECT lives_ok(
  $q$ UPDATE public.golf_player_focus_areas
      SET baseline_n = 31, baseline_shrunk = 0.635, assigned_by = 'coach',
          check_after_rounds = 3,
          criterion = '{"direction":"higher","threshold":0.7,"unit":"pct"}'::jsonb,
          horizon = '{"attempts":40}'::jsonb
      WHERE id = '00000000-0000-0000-0000-0000000004ab' $q$,
  'the on-team coach can set the prescription fields'
);
SELECT throws_ok(
  $q$ UPDATE public.golf_player_focus_areas
      SET verdict = '{"word":"worked"}'::jsonb
      WHERE id = '00000000-0000-0000-0000-0000000004ab' $q$,
  '42501', NULL,
  'the on-team coach cannot write the verdict'
);

RESET role;
RESET request.jwt.claims;

-- 5. The owner (service-role path) writes the verdict.
SELECT lives_ok(
  $q$ UPDATE public.golf_player_focus_areas
      SET verdict = '{"word":"worked"}'::jsonb
      WHERE id = '00000000-0000-0000-0000-0000000004ab' $q$,
  'the engine (owner / service role) can write the verdict'
);
SELECT is(
  (SELECT verdict ->> 'word' FROM public.golf_player_focus_areas
    WHERE id = '00000000-0000-0000-0000-0000000004ab'),
  'worked',
  'the verdict was written'
);

SELECT * FROM finish();
ROLLBACK;
