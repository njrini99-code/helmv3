-- Oracle test for 20261008120000_golf_holes_shots_select_via_rounds.sql.
--
-- Claim under test: replacing the per-row SELECT policies on golf_holes and
-- golf_shots with one policy each, round_id IN (SELECT gr.id FROM
-- golf_rounds gr), leaves every persona seeing exactly the same shots and
-- holes, except that an admin now also reads holes (admins already read every
-- round and every shot).
--
-- Method: collect the exact visible shot ids and hole ids per persona on the
-- migrated state, then swap the OLD production SELECT policies (verbatim from
-- pg_policies, 2026-10-08) back in inside the same rolled-back transaction,
-- collect again, and compare the two sets cell for cell. Spot checks pin the
-- result to the intended truth table so two equally broken states cannot pass.
--
-- Personas: round owner (player), head coach of team X, active teammate on X
-- (team player), head coach of team Y (same org), admin, a coach in another
-- org, a player with no team, anon.
-- Rounds: a team round (team X), a personal round (no team), and a round on
-- team Y that only the owner (and admin) may see. Two holes and two shots each.

BEGIN;
\ir _helpers.sql

SELECT plan(19);

-- ============================================================================
-- Seed (superuser, RLS bypassed)
-- ============================================================================
DO $$
DECLARE
  v_org_1   uuid := '00000000-0000-0000-0000-00000000e201';
  v_org_2   uuid := '00000000-0000-0000-0000-00000000e202';
  u_head    uuid := '00000000-0000-0000-0000-00000000e211';
  u_coach_z uuid := '00000000-0000-0000-0000-00000000e212';
  u_player  uuid := '00000000-0000-0000-0000-00000000e213';
  u_mate    uuid := '00000000-0000-0000-0000-00000000e214';
  u_admin   uuid := '00000000-0000-0000-0000-00000000e215';
  u_loner   uuid := '00000000-0000-0000-0000-00000000e216';
  u_coach_y uuid := '00000000-0000-0000-0000-00000000e217';
  c_head    uuid := '00000000-0000-0000-0000-00000000e221';
  c_coach_z uuid := '00000000-0000-0000-0000-00000000e222';
  c_coach_y uuid := '00000000-0000-0000-0000-00000000e223';
  p_player  uuid := '00000000-0000-0000-0000-00000000e231';
  p_mate    uuid := '00000000-0000-0000-0000-00000000e232';
  p_loner   uuid := '00000000-0000-0000-0000-00000000e233';
  t_x       uuid := '00000000-0000-0000-0000-00000000e241';
  t_y       uuid := '00000000-0000-0000-0000-00000000e242';
  t_z       uuid := '00000000-0000-0000-0000-00000000e243';
  r_ids     uuid[] := ARRAY['00000000-0000-0000-0000-00000000e251',
                            '00000000-0000-0000-0000-00000000e252',
                            '00000000-0000-0000-0000-00000000e253']::uuid[];
  r_teams   uuid[] := ARRAY['00000000-0000-0000-0000-00000000e241', NULL,
                            '00000000-0000-0000-0000-00000000e242']::uuid[];
  i int; h int;
  v_hole uuid;
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (u_head,    'pgtap-svr-head@helm.test',   'authenticated'),
    (u_coach_z, 'pgtap-svr-coachz@helm.test', 'authenticated'),
    (u_coach_y, 'pgtap-svr-coachy@helm.test', 'authenticated'),
    (u_player,  'pgtap-svr-player@helm.test', 'authenticated'),
    (u_mate,    'pgtap-svr-mate@helm.test',   'authenticated'),
    (u_admin,   'pgtap-svr-admin@helm.test',  'authenticated'),
    (u_loner,   'pgtap-svr-loner@helm.test',  'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    (u_head,    'pgtap-svr-head@helm.test',   'coach'),
    (u_coach_z, 'pgtap-svr-coachz@helm.test', 'coach'),
    (u_coach_y, 'pgtap-svr-coachy@helm.test', 'coach'),
    (u_player,  'pgtap-svr-player@helm.test', 'player'),
    (u_mate,    'pgtap-svr-mate@helm.test',   'player'),
    (u_admin,   'pgtap-svr-admin@helm.test',  'admin'),
    (u_loner,   'pgtap-svr-loner@helm.test',  'player')
  ON CONFLICT DO NOTHING;
  -- A trigger on auth.users may already have created these rows with a default
  -- role, so the admin role is set explicitly.
  UPDATE public.users SET role = 'admin' WHERE id = u_admin;

  INSERT INTO public.organizations (id, name, type) VALUES
    (v_org_1, 'pgtap-svr-org-1', 'college'),
    (v_org_2, 'pgtap-svr-org-2', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    (c_head,    u_head,    v_org_1),
    (c_coach_y, u_coach_y, v_org_1),
    (c_coach_z, u_coach_z, v_org_2)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id) VALUES
    (p_player, u_player),
    (p_mate,   u_mate),
    (p_loner,  u_loner)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id, gender) VALUES
    (t_x, 'pgtap-svr-team-X', 'PGSVX1', v_org_1, 'mens'),
    (t_y, 'pgtap-svr-team-Y', 'PGSVY1', v_org_1, 'womens'),
    (t_z, 'pgtap-svr-team-Z', 'PGSVZ1', v_org_2, 'mens')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (t_x, c_head,    'head_coach', true),
    (t_y, c_coach_y, 'head_coach', true),
    (t_z, c_coach_z, 'head_coach', true)
  ON CONFLICT DO NOTHING;

  -- Owner and teammate are active on X. Nobody is a member of Y.
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (t_x, p_player, 'active'),
    (t_x, p_mate,   'active')
  ON CONFLICT DO NOTHING;

  FOR i IN 1..3 LOOP
    INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, status)
    VALUES (r_ids[i], p_player, r_teams[i], CURRENT_DATE, 'in_progress')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- golf_holes fires a totals-recompute trigger that needs a real identity.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', u_player::text, 'role', 'authenticated')::text,
    true
  );
  FOR i IN 1..3 LOOP
    FOR h IN 1..2 LOOP
      v_hole := ('00000000-0000-0000-0000-00000000e4' || i || h)::uuid;
      INSERT INTO public.golf_holes (id, round_id, hole_number, par)
      VALUES (v_hole, r_ids[i], h, 4)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);

  FOR i IN 1..3 LOOP
    FOR h IN 1..2 LOOP
      INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type)
      VALUES (('00000000-0000-0000-0000-00000000e3' || i || h)::uuid, r_ids[i],
              ('00000000-0000-0000-0000-00000000e4' || i || h)::uuid, h, 1, 'putting')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- Collect the visible seeded hole and shot ids per persona. SECURITY INVOKER
-- on purpose: each read runs with the persona's identity and role.
-- ============================================================================
CREATE FUNCTION pg_temp.visible_sets() RETURNS TABLE (persona text, kind text, ids text)
LANGUAGE plpgsql AS $$
DECLARE
  p_names text[] := ARRAY['player','head','teammate','admin','coach_z','coach_y','loner','anon'];
  p_uids  text[] := ARRAY[
    '00000000-0000-0000-0000-00000000e213','00000000-0000-0000-0000-00000000e211',
    '00000000-0000-0000-0000-00000000e214','00000000-0000-0000-0000-00000000e215',
    '00000000-0000-0000-0000-00000000e212','00000000-0000-0000-0000-00000000e217',
    '00000000-0000-0000-0000-00000000e216', NULL];
  v_out jsonb := '[]'::jsonb;
  v_holes text;
  v_shots text;
  i int;
BEGIN
  FOR i IN 1..array_length(p_names, 1) LOOP
    PERFORM set_config('request.jwt.claims',
      CASE WHEN p_uids[i] IS NULL THEN ''
           ELSE json_build_object('sub', p_uids[i], 'role', 'authenticated')::text END,
      true);
    EXECUTE format('SET LOCAL ROLE %I', CASE WHEN p_uids[i] IS NULL THEN 'anon' ELSE 'authenticated' END);

    BEGIN
      SELECT coalesce(string_agg(id::text, ',' ORDER BY id), '') INTO v_holes
      FROM public.golf_holes WHERE id::text LIKE '00000000-0000-0000-0000-00000000e4__';
    EXCEPTION WHEN OTHERS THEN v_holes := 'err=' || SQLSTATE;
    END;
    BEGIN
      SELECT coalesce(string_agg(id::text, ',' ORDER BY id), '') INTO v_shots
      FROM public.golf_shots WHERE id::text LIKE '00000000-0000-0000-0000-00000000e3__';
    EXCEPTION WHEN OTHERS THEN v_shots := 'err=' || SQLSTATE;
    END;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    v_out := v_out || jsonb_build_array(
      jsonb_build_array(p_names[i], 'holes', v_holes),
      jsonb_build_array(p_names[i], 'shots', v_shots));
  END LOOP;

  RETURN QUERY SELECT e->>0, e->>1, e->>2 FROM jsonb_array_elements(v_out) e;
END $$;

-- ============================================================================
-- Catalog assertions on the migrated state
-- ============================================================================
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'golf_holes' AND cmd = 'SELECT'),
  1, 'golf_holes has exactly one SELECT policy');

SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'golf_shots' AND cmd = 'SELECT'),
  1, 'golf_shots has exactly one SELECT policy (admin_read_all dropped)');

SELECT ok(
  (SELECT bool_and(roles = '{authenticated}'
                   AND qual LIKE '%round_id IN ( SELECT gr.id%FROM golf_rounds gr))'
                   AND qual NOT LIKE '%golf_holes.%' AND qual NOT LIKE '%golf_shots.%')
   FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('golf_holes', 'golf_shots') AND cmd = 'SELECT'),
  'both SELECT policies are the uncorrelated round_id IN (golf_rounds) set test, for authenticated');

-- ============================================================================
-- Visible sets on the migrated state
-- ============================================================================
CREATE TEMP TABLE v_new AS SELECT * FROM pg_temp.visible_sets();

SELECT is((SELECT count(*)::int FROM v_new), 16, 'collected 8 personas x 2 tables');

SELECT is((SELECT ids FROM v_new WHERE persona = 'player' AND kind = 'shots'),
  '00000000-0000-0000-0000-00000000e311,00000000-0000-0000-0000-00000000e312,'
  '00000000-0000-0000-0000-00000000e321,00000000-0000-0000-0000-00000000e322,'
  '00000000-0000-0000-0000-00000000e331,00000000-0000-0000-0000-00000000e332',
  'round owner sees the shots of all three of their rounds');
SELECT is((SELECT ids FROM v_new WHERE persona = 'player' AND kind = 'holes'),
  '00000000-0000-0000-0000-00000000e411,00000000-0000-0000-0000-00000000e412,'
  '00000000-0000-0000-0000-00000000e421,00000000-0000-0000-0000-00000000e422,'
  '00000000-0000-0000-0000-00000000e431,00000000-0000-0000-0000-00000000e432',
  'round owner sees the holes of all three of their rounds');
SELECT is((SELECT ids FROM v_new WHERE persona = 'head' AND kind = 'shots'),
  '00000000-0000-0000-0000-00000000e311,00000000-0000-0000-0000-00000000e312',
  'team coach sees only the team round''s shots');
SELECT is((SELECT ids FROM v_new WHERE persona = 'head' AND kind = 'holes'),
  '00000000-0000-0000-0000-00000000e411,00000000-0000-0000-0000-00000000e412',
  'team coach sees only the team round''s holes');
SELECT is((SELECT ids FROM v_new WHERE persona = 'teammate' AND kind = 'shots'),
  '00000000-0000-0000-0000-00000000e311,00000000-0000-0000-0000-00000000e312',
  'team player sees only the team round''s shots');
SELECT is((SELECT ids FROM v_new WHERE persona = 'admin' AND kind = 'shots'),
  (SELECT ids FROM v_new WHERE persona = 'player' AND kind = 'shots'),
  'admin sees every seeded shot');
SELECT is((SELECT ids FROM v_new WHERE persona = 'admin' AND kind = 'holes'),
  (SELECT ids FROM v_new WHERE persona = 'player' AND kind = 'holes'),
  'admin now sees every seeded hole (the one intended change)');
SELECT is((SELECT ids FROM v_new WHERE persona = 'coach_y' AND kind = 'shots'),
  '00000000-0000-0000-0000-00000000e331,00000000-0000-0000-0000-00000000e332',
  'coach of team Y sees only the team-Y round''s shots, not team X''s');
SELECT is(
  (SELECT string_agg(ids, '|' ORDER BY persona, kind) FROM v_new
   WHERE persona IN ('coach_z', 'loner')),
  '|||',
  'a coach in another org and a teamless player see no hole or shot');
SELECT ok(
  (SELECT bool_and(ids NOT LIKE '%0000%') FROM v_new WHERE persona = 'anon'),
  'anon sees no hole or shot (denied or empty)');

-- ============================================================================
-- Swap the OLD SELECT policies back in (production text, pg_policies 2026-10-08)
-- ============================================================================
DROP POLICY golf_holes_select ON public.golf_holes;
DROP POLICY golf_shots_select ON public.golf_shots;

CREATE POLICY golf_holes_select ON public.golf_holes FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_rounds gr
  WHERE ((gr.id = golf_holes.round_id) AND ((EXISTS ( SELECT 1
           FROM golf_players
          WHERE ((golf_players.id = gr.player_id) AND (golf_players.user_id = ( SELECT auth.uid() AS uid))))) OR ((gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)) OR ((gr.team_id IS NOT NULL) AND is_golf_team_player(gr.team_id)))))));
CREATE POLICY golf_holes_select_team ON public.golf_holes FOR SELECT TO authenticated
  USING ((round_id IN ( SELECT gr.id
   FROM golf_rounds gr
  WHERE ((gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)))));
CREATE POLICY golf_shots_select ON public.golf_shots FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM golf_rounds gr
  WHERE ((gr.id = golf_shots.round_id) AND ((EXISTS ( SELECT 1
           FROM golf_players
          WHERE ((golf_players.id = gr.player_id) AND (golf_players.user_id = ( SELECT auth.uid() AS uid))))) OR ((gr.team_id IS NOT NULL) AND is_golf_team_coach(gr.team_id)) OR ((gr.team_id IS NOT NULL) AND is_golf_team_player(gr.team_id)))))));
CREATE POLICY admin_read_all ON public.golf_shots FOR SELECT TO authenticated
  USING (is_admin());

CREATE TEMP TABLE v_old AS SELECT * FROM pg_temp.visible_sets();

SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('golf_holes', 'golf_shots') AND cmd = 'SELECT'),
  4, 'oracle sanity: the four old SELECT policies are back in place');

SELECT is((SELECT ids FROM v_old WHERE persona = 'admin' AND kind = 'holes'), '',
  'oracle sanity: under the old policies admin read no hole');

SELECT is((SELECT ids FROM v_old WHERE persona = 'head' AND kind = 'shots'),
  (SELECT ids FROM v_new WHERE persona = 'head' AND kind = 'shots'),
  'oracle sanity: old and new agree on a non-empty coach set');

SELECT is_empty(
  $$SELECT * FROM v_new WHERE NOT (persona = 'admin' AND kind = 'holes')
    EXCEPT SELECT * FROM v_old$$,
  'nobody sees a hole or shot after the migration that the old policies hid (admin holes excepted)');

SELECT is_empty(
  $$SELECT * FROM v_old WHERE NOT (persona = 'admin' AND kind = 'holes')
    EXCEPT SELECT * FROM v_new$$,
  'nobody loses a hole or shot the old policies showed (admin holes excepted)');

SELECT * FROM finish();
ROLLBACK;
