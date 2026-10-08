-- Oracle test for 20261007100000_golf_rls_helpers_sql_language.sql and
-- 20261007101000_golf_holes_shots_policy_consolidation.sql.
--
-- Claim under test: replacing the plpgsql team helpers with SQL helpers and
-- collapsing 9 golf_holes + 11 golf_shots policies into one policy per command
-- did not change who can read or write which rows.
--
-- How it proves that, instead of asserting a hand-written expectation: it runs
-- the same persona x round x operation matrix twice inside one rolled-back
-- transaction. First against the migrated state, then again after swapping the
-- OLD helper bodies and the OLD policies (copied verbatim from production,
-- pg_policies and pg_get_functiondef on 2026-10-07) back in. The two result
-- sets must be identical, cell for cell. A handful of spot checks then pin the
-- matrix to the intended truth table so the oracle cannot pass vacuously.
--
-- Personas: player owner, head coach of the team, assistant coach of the team,
-- active teammate, same-org coach who is NOT on the team's staff, coach in
-- another org, admin, anon.
-- Rounds: a team round, a personal round (team_id null), and a round whose
-- team_id (Y) differs from the player's current team (X).
-- Operations per cell: select holes, select shots, update hole, update shot,
-- insert hole, insert shot, delete shot, delete hole. Every write is undone
-- with a savepoint-style exception, so cells do not influence each other.

BEGIN;
\ir _helpers.sql

SELECT plan(22);

-- ============================================================================
-- Seed (superuser, RLS bypassed)
-- ============================================================================
DO $$
DECLARE
  v_org_1   uuid := '00000000-0000-0000-0000-00000000f101';
  v_org_2   uuid := '00000000-0000-0000-0000-00000000f102';
  u_head    uuid := '00000000-0000-0000-0000-00000000f111';
  u_asst    uuid := '00000000-0000-0000-0000-00000000f112';
  u_coach_y uuid := '00000000-0000-0000-0000-00000000f113';
  u_coach_z uuid := '00000000-0000-0000-0000-00000000f114';
  u_player  uuid := '00000000-0000-0000-0000-00000000f115';
  u_mate    uuid := '00000000-0000-0000-0000-00000000f116';
  u_admin   uuid := '00000000-0000-0000-0000-00000000f117';
  c_head    uuid := '00000000-0000-0000-0000-00000000f121';
  c_asst    uuid := '00000000-0000-0000-0000-00000000f122';
  c_coach_y uuid := '00000000-0000-0000-0000-00000000f123';
  c_coach_z uuid := '00000000-0000-0000-0000-00000000f124';
  p_player  uuid := '00000000-0000-0000-0000-00000000f131';
  p_mate    uuid := '00000000-0000-0000-0000-00000000f132';
  t_x       uuid := '00000000-0000-0000-0000-00000000f141';
  t_y       uuid := '00000000-0000-0000-0000-00000000f142';
  t_z       uuid := '00000000-0000-0000-0000-00000000f143';
  r_team    uuid := '00000000-0000-0000-0000-00000000f151';
  r_pers    uuid := '00000000-0000-0000-0000-00000000f152';
  r_other   uuid := '00000000-0000-0000-0000-00000000f153';
  h_team    uuid := '00000000-0000-0000-0000-00000000f161';
  h_pers    uuid := '00000000-0000-0000-0000-00000000f162';
  h_other   uuid := '00000000-0000-0000-0000-00000000f163';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (u_head,    'pgtap-hsc-head@helm.test',    'authenticated'),
    (u_asst,    'pgtap-hsc-asst@helm.test',    'authenticated'),
    (u_coach_y, 'pgtap-hsc-coachy@helm.test',  'authenticated'),
    (u_coach_z, 'pgtap-hsc-coachz@helm.test',  'authenticated'),
    (u_player,  'pgtap-hsc-player@helm.test',  'authenticated'),
    (u_mate,    'pgtap-hsc-mate@helm.test',    'authenticated'),
    (u_admin,   'pgtap-hsc-admin@helm.test',   'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    (u_head,    'pgtap-hsc-head@helm.test',    'coach'),
    (u_asst,    'pgtap-hsc-asst@helm.test',    'coach'),
    (u_coach_y, 'pgtap-hsc-coachy@helm.test',  'coach'),
    (u_coach_z, 'pgtap-hsc-coachz@helm.test',  'coach'),
    (u_player,  'pgtap-hsc-player@helm.test',  'player'),
    (u_mate,    'pgtap-hsc-mate@helm.test',    'player'),
    (u_admin,   'pgtap-hsc-admin@helm.test',   'admin')
  ON CONFLICT DO NOTHING;

  -- A trigger on auth.users may already have created these rows with a default
  -- role, so the admin role is set explicitly.
  UPDATE public.users SET role = 'admin' WHERE id = u_admin;

  INSERT INTO public.organizations (id, name, type) VALUES
    (v_org_1, 'pgtap-hsc-org-1', 'college'),
    (v_org_2, 'pgtap-hsc-org-2', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    (c_head,    u_head,    v_org_1),
    (c_asst,    u_asst,    v_org_1),
    (c_coach_y, u_coach_y, v_org_1),
    (c_coach_z, u_coach_z, v_org_2)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id) VALUES
    (p_player, u_player),
    (p_mate,   u_mate)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id, gender) VALUES
    (t_x, 'pgtap-hsc-team-X', 'PGHSX1', v_org_1, 'mens'),
    (t_y, 'pgtap-hsc-team-Y', 'PGHSY1', v_org_1, 'womens'),
    (t_z, 'pgtap-hsc-team-Z', 'PGHSZ1', v_org_2, 'mens')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (t_x, c_head,    'head_coach',      true),
    (t_x, c_asst,    'assistant_coach', false),
    (t_y, c_coach_y, 'head_coach',      true),
    (t_z, c_coach_z, 'head_coach',      true)
  ON CONFLICT DO NOTHING;

  -- Player and teammate are active on team X. Nobody is on Y.
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (t_x, p_player, 'active'),
    (t_x, p_mate,   'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, status) VALUES
    (r_team,  p_player, t_x,  CURRENT_DATE, 'in_progress'),
    (r_pers,  p_player, NULL, CURRENT_DATE, 'in_progress'),
    (r_other, p_player, t_y,  CURRENT_DATE, 'in_progress')
  ON CONFLICT DO NOTHING;

  -- golf_holes fires a totals-recompute trigger that needs a real identity.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', u_player::text, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.golf_holes (id, round_id, hole_number, par) VALUES
    (h_team,  r_team,  1, 4),
    (h_pers,  r_pers,  1, 4),
    (h_other, r_other, 1, 4)
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type) VALUES
    ('00000000-0000-0000-0000-00000000f171', r_team,  h_team,  1, 1, 'putting'),
    ('00000000-0000-0000-0000-00000000f172', r_pers,  h_pers,  1, 1, 'putting'),
    ('00000000-0000-0000-0000-00000000f173', r_other, h_other, 1, 1, 'putting')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- The matrix runner. SECURITY INVOKER on purpose: every operation must run
-- with the persona's identity so the policies under test apply.
-- ============================================================================
CREATE FUNCTION pg_temp.try_op(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    -- Undo any write so cells stay independent.
    RAISE EXCEPTION 'undo' USING ERRCODE = 'P0099';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN
      RETURN 'rows=' || n;
    WHEN OTHERS THEN
      RETURN 'err=' || SQLSTATE;
  END;
END $$;

CREATE FUNCTION pg_temp.run_matrix() RETURNS TABLE (persona text, rnd text, op text, res text)
LANGUAGE plpgsql AS $$
DECLARE
  p_names text[] := ARRAY['player','head','assistant','teammate','coach_y','coach_z','admin','anon'];
  p_uids  text[] := ARRAY[
    '00000000-0000-0000-0000-00000000f115','00000000-0000-0000-0000-00000000f111',
    '00000000-0000-0000-0000-00000000f112','00000000-0000-0000-0000-00000000f116',
    '00000000-0000-0000-0000-00000000f113','00000000-0000-0000-0000-00000000f114',
    '00000000-0000-0000-0000-00000000f117', NULL];
  r_names text[] := ARRAY['team','personal','other_team'];
  r_ids   text[] := ARRAY['00000000-0000-0000-0000-00000000f151',
                          '00000000-0000-0000-0000-00000000f152',
                          '00000000-0000-0000-0000-00000000f153'];
  h_ids   text[] := ARRAY['00000000-0000-0000-0000-00000000f161',
                          '00000000-0000-0000-0000-00000000f162',
                          '00000000-0000-0000-0000-00000000f163'];
  i int; j int;
  v_role text;
  v_claims text;
  v_out jsonb := '[]'::jsonb;
  v_ops text[];
  v_op_names text[] := ARRAY['sel_holes','sel_shots','upd_hole','upd_shot','ins_hole','ins_shot','del_shot','del_hole'];
  k int;
  v_res text;
BEGIN
  FOR i IN 1..array_length(p_names, 1) LOOP
    v_role := CASE WHEN p_uids[i] IS NULL THEN 'anon' ELSE 'authenticated' END;
    v_claims := CASE WHEN p_uids[i] IS NULL THEN ''
                     ELSE json_build_object('sub', p_uids[i], 'role', 'authenticated')::text END;
    PERFORM set_config('request.jwt.claims', v_claims, true);
    EXECUTE format('SET LOCAL ROLE %I', v_role);

    FOR j IN 1..array_length(r_names, 1) LOOP
      v_ops := ARRAY[
        format('SELECT 1 FROM public.golf_holes WHERE round_id = %L', r_ids[j]),
        format('SELECT 1 FROM public.golf_shots WHERE round_id = %L', r_ids[j]),
        format('UPDATE public.golf_holes SET par = par WHERE round_id = %L', r_ids[j]),
        format('UPDATE public.golf_shots SET shot_type = shot_type WHERE round_id = %L', r_ids[j]),
        format('INSERT INTO public.golf_holes (round_id, hole_number, par) VALUES (%L, 2, 4)', r_ids[j]),
        format('INSERT INTO public.golf_shots (round_id, hole_id, hole_number, shot_number, shot_type) VALUES (%L, %L, 1, 9, ''putting'')', r_ids[j], h_ids[j]),
        format('DELETE FROM public.golf_shots WHERE round_id = %L', r_ids[j]),
        format('DELETE FROM public.golf_holes WHERE round_id = %L', r_ids[j])
      ];
      FOR k IN 1..array_length(v_ops, 1) LOOP
        v_res := pg_temp.try_op(v_ops[k]);
        v_out := v_out || jsonb_build_array(jsonb_build_array(p_names[i], r_names[j], v_op_names[k], v_res));
      END LOOP;
    END LOOP;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
  END LOOP;

  RETURN QUERY
    SELECT e->>0, e->>1, e->>2, e->>3 FROM jsonb_array_elements(v_out) e;
END $$;

-- ============================================================================
-- Catalog assertions on the MIGRATED state
-- ============================================================================
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_holes'),
  4,
  'golf_holes has exactly four policies after consolidation'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_shots'),
  5,
  'golf_shots has four consolidated policies plus admin_read_all'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('golf_holes', 'golf_shots')
     AND 'public' = ANY (roles)),
  0,
  'no policy on golf_holes or golf_shots is granted to PUBLIC any more'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'golf_shots' AND policyname = 'admin_read_all'),
  'golf_shots keeps admin_read_all'
);

SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('is_golf_team_coach', 'is_golf_team_head_coach', 'is_golf_team_player',
                       'is_team_coach', 'is_team_player')
     AND l.lanname = 'sql' AND p.prosecdef AND p.provolatile = 's'
     AND p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']),
  5,
  'all five helpers are STABLE SECURITY DEFINER SQL functions with a pinned search_path'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.golf_readable_round_ids()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.golf_readable_round_ids()', 'EXECUTE'),
  'golf_readable_round_ids is callable by authenticated and not by anon'
);

-- ============================================================================
-- Run the matrix on the migrated state
-- ============================================================================
CREATE TEMP TABLE m_new AS SELECT * FROM pg_temp.run_matrix();

SELECT is(
  (SELECT count(*)::int FROM m_new),
  8 * 3 * 8,
  'matrix covers 8 personas x 3 rounds x 8 operations'
);

-- Spot checks pin the matrix to the intended truth table, so an oracle that
-- compared two equally-broken states could not pass.
SELECT is(
  (SELECT res FROM m_new WHERE persona = 'player' AND rnd = 'team' AND op = 'sel_holes'),
  'rows=1', 'player reads own team-round hole');
SELECT is(
  (SELECT res FROM m_new WHERE persona = 'head' AND rnd = 'team' AND op = 'del_hole'),
  'rows=1', 'head coach can delete a team-round hole');
SELECT is(
  (SELECT res FROM m_new WHERE persona = 'assistant' AND rnd = 'team' AND op = 'del_hole'),
  'rows=0', 'assistant coach cannot delete a team-round hole');
SELECT is(
  (SELECT res FROM m_new WHERE persona = 'assistant' AND rnd = 'team' AND op = 'upd_hole'),
  'rows=1', 'assistant coach can update a team-round hole');
SELECT is(
  (SELECT res FROM m_new WHERE persona = 'teammate' AND rnd = 'team' AND op = 'sel_shots'),
  'rows=1', 'active teammate can read shots of a team round');
SELECT is(
  (SELECT res FROM m_new WHERE persona = 'teammate' AND rnd = 'team' AND op = 'upd_shot'),
  'rows=0', 'active teammate cannot update shots');
SELECT is(
  (SELECT res FROM m_new WHERE persona = 'coach_y' AND rnd = 'team' AND op = 'sel_holes'),
  'rows=0', 'same-org coach who is not on the staff cannot read holes');
SELECT is(
  (SELECT res FROM m_new WHERE persona = 'coach_z' AND rnd = 'team' AND op = 'sel_shots'),
  'rows=0', 'coach in another org cannot read shots');
SELECT is(
  (SELECT res FROM m_new WHERE persona = 'admin' AND rnd = 'team' AND op = 'sel_shots'),
  'rows=1', 'admin reads shots through admin_read_all');
SELECT is(
  (SELECT res FROM m_new WHERE persona = 'admin' AND rnd = 'team' AND op = 'sel_holes'),
  'rows=0', 'admin has no read access to holes');
SELECT is(
  (SELECT res FROM m_new WHERE persona = 'head' AND rnd = 'personal' AND op = 'sel_holes'),
  'rows=0', 'a coach cannot read a personal round with no team');
SELECT isnt(
  (SELECT res FROM m_new WHERE persona = 'anon' AND rnd = 'team' AND op = 'sel_holes'),
  'rows=1', 'anon never sees a hole');

-- ============================================================================
-- Swap the OLD helpers and policies back in (production text, 2026-10-07)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_golf_team_coach(team_uuid uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $f$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
    AND gc.user_id = auth.uid()
  );
END;
$f$;

CREATE OR REPLACE FUNCTION public.is_golf_team_head_coach(team_uuid uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $f$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
      AND gc.user_id = auth.uid()
      AND gtcs.role = 'head_coach'
  );
END;
$f$;

CREATE OR REPLACE FUNCTION public.is_golf_team_player(team_uuid uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $f$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_team_members gtm
    JOIN golf_players gp ON gp.id = gtm.player_id
    WHERE gtm.team_id = team_uuid
    AND gp.user_id = auth.uid()
    AND gtm.status = 'active'
  );
END;
$f$;

DROP POLICY golf_holes_select ON public.golf_holes;
DROP POLICY golf_holes_insert ON public.golf_holes;
DROP POLICY golf_holes_update ON public.golf_holes;
DROP POLICY golf_holes_delete ON public.golf_holes;
DROP POLICY golf_shots_select ON public.golf_shots;
DROP POLICY golf_shots_insert ON public.golf_shots;
DROP POLICY golf_shots_update ON public.golf_shots;
DROP POLICY golf_shots_delete ON public.golf_shots;

-- golf_holes (9)
CREATE POLICY golf_holes_delete ON public.golf_holes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM golf_rounds gr JOIN golf_players gp ON gp.id = gr.player_id
                 WHERE gr.id = golf_holes.round_id AND gp.user_id = (SELECT auth.uid())));
CREATE POLICY golf_holes_delete_coach ON public.golf_holes FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM golf_rounds gr
                 WHERE gr.id = golf_holes.round_id AND gr.team_id IS NOT NULL AND is_golf_team_head_coach(gr.team_id)));
CREATE POLICY golf_holes_insert ON public.golf_holes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM golf_rounds gr JOIN golf_players gp ON gp.id = gr.player_id
                      WHERE gr.id = golf_holes.round_id AND gp.user_id = (SELECT auth.uid())));
CREATE POLICY golf_holes_insert_coach ON public.golf_holes FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM golf_rounds gr
                      WHERE gr.id = golf_holes.round_id AND gr.team_id IS NOT NULL AND is_golf_team_coach(gr.team_id)));
CREATE POLICY golf_holes_select ON public.golf_holes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM golf_rounds gr
                 WHERE gr.id = golf_holes.round_id
                   AND ((EXISTS (SELECT 1 FROM golf_players
                                 WHERE golf_players.id = gr.player_id AND golf_players.user_id = (SELECT auth.uid())))
                        OR (gr.team_id IS NOT NULL AND is_golf_team_coach(gr.team_id))
                        OR (gr.team_id IS NOT NULL AND is_golf_team_player(gr.team_id)))));
CREATE POLICY golf_holes_select_team ON public.golf_holes FOR SELECT TO authenticated
  USING (round_id IN (SELECT gr.id FROM golf_rounds gr
                      WHERE gr.team_id IS NOT NULL AND is_golf_team_coach(gr.team_id)));
CREATE POLICY golf_holes_update ON public.golf_holes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM golf_rounds gr JOIN golf_players gp ON gp.id = gr.player_id
                 WHERE gr.id = golf_holes.round_id AND gp.user_id = (SELECT auth.uid())));
CREATE POLICY golf_holes_update_coach ON public.golf_holes FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM golf_rounds gr
                 WHERE gr.id = golf_holes.round_id AND gr.team_id IS NOT NULL AND is_golf_team_coach(gr.team_id)));
CREATE POLICY golf_holes_update_team ON public.golf_holes FOR UPDATE TO authenticated
  USING (round_id IN (SELECT gr.id FROM golf_rounds gr
                      JOIN golf_team_members gtm ON gtm.player_id = gr.player_id
                      JOIN golf_teams gt ON gt.id = gtm.team_id
                      JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
                      WHERE gc.user_id = (SELECT auth.uid()) AND gtm.status = 'active'::team_member_status))
  WITH CHECK (round_id IN (SELECT gr.id FROM golf_rounds gr
                           JOIN golf_team_members gtm ON gtm.player_id = gr.player_id
                           JOIN golf_teams gt ON gt.id = gtm.team_id
                           JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
                           WHERE gc.user_id = (SELECT auth.uid()) AND gtm.status = 'active'::team_member_status));

-- golf_shots (11, admin_read_all was never touched)
CREATE POLICY golf_shots_delete ON public.golf_shots FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM golf_rounds gr JOIN golf_players gp ON gp.id = gr.player_id
                 WHERE gr.id = golf_shots.round_id AND gp.user_id = (SELECT auth.uid())));
CREATE POLICY golf_shots_delete_coach ON public.golf_shots FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM golf_rounds gr
                 WHERE gr.id = golf_shots.round_id AND gr.team_id IS NOT NULL AND is_golf_team_head_coach(gr.team_id)));
CREATE POLICY golf_shots_delete_own ON public.golf_shots FOR DELETE TO authenticated
  USING ((hole_id IN (SELECT gh.id FROM golf_holes gh
                      JOIN golf_rounds gr ON gr.id = gh.round_id
                      JOIN golf_players gp ON gp.id = gr.player_id
                      WHERE gp.user_id = (SELECT auth.uid())))
         OR (round_id IN (SELECT gr.id FROM golf_rounds gr
                          JOIN golf_players gp ON gp.id = gr.player_id
                          WHERE gp.user_id = (SELECT auth.uid()))));
CREATE POLICY golf_shots_insert ON public.golf_shots FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM golf_rounds gr JOIN golf_players gp ON gp.id = gr.player_id
                      WHERE gr.id = golf_shots.round_id AND gp.user_id = (SELECT auth.uid())));
CREATE POLICY golf_shots_insert_coach ON public.golf_shots FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM golf_rounds gr
                      WHERE gr.id = golf_shots.round_id AND gr.team_id IS NOT NULL AND is_golf_team_coach(gr.team_id)));
CREATE POLICY golf_shots_insert_own ON public.golf_shots FOR INSERT TO authenticated
  WITH CHECK ((hole_id IN (SELECT gh.id FROM golf_holes gh
                           JOIN golf_rounds gr ON gr.id = gh.round_id
                           JOIN golf_players gp ON gp.id = gr.player_id
                           WHERE gp.user_id = (SELECT auth.uid())))
              OR (round_id IN (SELECT gr.id FROM golf_rounds gr
                               JOIN golf_players gp ON gp.id = gr.player_id
                               WHERE gp.user_id = (SELECT auth.uid()))));
CREATE POLICY golf_shots_select ON public.golf_shots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM golf_rounds gr
                 WHERE gr.id = golf_shots.round_id
                   AND ((EXISTS (SELECT 1 FROM golf_players
                                 WHERE golf_players.id = gr.player_id AND golf_players.user_id = (SELECT auth.uid())))
                        OR (gr.team_id IS NOT NULL AND is_golf_team_coach(gr.team_id))
                        OR (gr.team_id IS NOT NULL AND is_golf_team_player(gr.team_id)))));
CREATE POLICY golf_shots_update ON public.golf_shots FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM golf_rounds gr JOIN golf_players gp ON gp.id = gr.player_id
                 WHERE gr.id = golf_shots.round_id AND gp.user_id = (SELECT auth.uid())));
CREATE POLICY golf_shots_update_coach ON public.golf_shots FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM golf_rounds gr
                 WHERE gr.id = golf_shots.round_id AND gr.team_id IS NOT NULL AND is_golf_team_coach(gr.team_id)));
CREATE POLICY golf_shots_update_own ON public.golf_shots FOR UPDATE TO authenticated
  USING ((hole_id IN (SELECT gh.id FROM golf_holes gh
                      JOIN golf_rounds gr ON gr.id = gh.round_id
                      JOIN golf_players gp ON gp.id = gr.player_id
                      WHERE gp.user_id = (SELECT auth.uid())))
         OR (round_id IN (SELECT gr.id FROM golf_rounds gr
                          JOIN golf_players gp ON gp.id = gr.player_id
                          WHERE gp.user_id = (SELECT auth.uid()))))
  WITH CHECK ((hole_id IN (SELECT gh.id FROM golf_holes gh
                           JOIN golf_rounds gr ON gr.id = gh.round_id
                           JOIN golf_players gp ON gp.id = gr.player_id
                           WHERE gp.user_id = (SELECT auth.uid())))
              OR (round_id IN (SELECT gr.id FROM golf_rounds gr
                               JOIN golf_players gp ON gp.id = gr.player_id
                               WHERE gp.user_id = (SELECT auth.uid()))));
CREATE POLICY golf_shots_update_team ON public.golf_shots FOR UPDATE TO authenticated
  USING (hole_id IN (SELECT gh.id FROM golf_holes gh
                     JOIN golf_rounds gr ON gr.id = gh.round_id
                     JOIN golf_team_members gtm ON gtm.player_id = gr.player_id
                     JOIN golf_teams gt ON gt.id = gtm.team_id
                     JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
                     WHERE gc.user_id = (SELECT auth.uid()) AND gtm.status = 'active'::team_member_status))
  WITH CHECK (hole_id IN (SELECT gh.id FROM golf_holes gh
                          JOIN golf_rounds gr ON gr.id = gh.round_id
                          JOIN golf_team_members gtm ON gtm.player_id = gr.player_id
                          JOIN golf_teams gt ON gt.id = gtm.team_id
                          JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
                          WHERE gc.user_id = (SELECT auth.uid()) AND gtm.status = 'active'::team_member_status));

-- ============================================================================
-- Run the same matrix against the OLD state and compare, cell for cell
-- ============================================================================
CREATE TEMP TABLE m_old AS SELECT * FROM pg_temp.run_matrix();

SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_holes'),
  9,
  'oracle sanity: the old golf_holes policy set (9) is back in place'
);

SELECT is_empty(
  $$SELECT * FROM m_new EXCEPT SELECT * FROM m_old$$,
  'no cell is allowed after the migration that the old policies denied'
);

SELECT is_empty(
  $$SELECT * FROM m_old EXCEPT SELECT * FROM m_new$$,
  'no cell is denied after the migration that the old policies allowed'
);

SELECT * FROM finish();
ROLLBACK;
