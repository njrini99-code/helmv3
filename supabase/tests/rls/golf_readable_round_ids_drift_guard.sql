-- Drift guard for public.golf_readable_round_ids()
-- (20261007101000_golf_holes_shots_policy_consolidation.sql).
--
-- golf_holes and golf_shots SELECT read round_id IN (golf_readable_round_ids()),
-- a SECURITY DEFINER restatement of the golf_rounds SELECT predicate (own
-- player OR coached team OR active member of the team). If golf_rounds' SELECT
-- policies change and the function does not, holes and shots silently stop
-- matching their rounds. This file fails in two ways when that happens:
--   1. The golf_rounds SELECT policy text is pinned by md5 (production and
--      local both hash to bafbcd0fd91621b457cfe8a67ef4759b on 2026-10-08).
--   2. Per persona, the golf_rounds ids visible under RLS, minus rows only
--      admin_read_all grants, must equal golf_readable_round_ids().
-- The persona set includes an INACTIVE team member, who must see their own
-- round but not a teammate's.

BEGIN;
\ir _helpers.sql

SELECT plan(10);

-- ============================================================================
-- 1. Pin the golf_rounds SELECT policies
-- ============================================================================
SELECT is(
  (SELECT md5(string_agg(policyname || ':' || coalesce(qual, ''), '|' ORDER BY policyname))
   FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'golf_rounds' AND cmd IN ('SELECT', 'ALL')),
  'bafbcd0fd91621b457cfe8a67ef4759b',
  'golf_rounds SELECT policies changed: update golf_readable_round_ids to match, then re-pin this md5'
);

-- ============================================================================
-- Seed (superuser, RLS bypassed)
-- ============================================================================
DO $$
DECLARE
  v_org_1   uuid := '00000000-0000-0000-0000-00000000d101';
  v_org_2   uuid := '00000000-0000-0000-0000-00000000d102';
  u_head    uuid := '00000000-0000-0000-0000-00000000d111';
  u_coach_z uuid := '00000000-0000-0000-0000-00000000d112';
  u_player  uuid := '00000000-0000-0000-0000-00000000d113';
  u_mate    uuid := '00000000-0000-0000-0000-00000000d114';
  u_gone    uuid := '00000000-0000-0000-0000-00000000d115';
  u_admin   uuid := '00000000-0000-0000-0000-00000000d116';
  c_head    uuid := '00000000-0000-0000-0000-00000000d121';
  c_coach_z uuid := '00000000-0000-0000-0000-00000000d122';
  p_player  uuid := '00000000-0000-0000-0000-00000000d131';
  p_mate    uuid := '00000000-0000-0000-0000-00000000d132';
  p_gone    uuid := '00000000-0000-0000-0000-00000000d133';
  t_x       uuid := '00000000-0000-0000-0000-00000000d141';
  t_y       uuid := '00000000-0000-0000-0000-00000000d142';
  t_z       uuid := '00000000-0000-0000-0000-00000000d143';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (u_head,    'pgtap-rri-head@helm.test',   'authenticated'),
    (u_coach_z, 'pgtap-rri-coachz@helm.test', 'authenticated'),
    (u_player,  'pgtap-rri-player@helm.test', 'authenticated'),
    (u_mate,    'pgtap-rri-mate@helm.test',   'authenticated'),
    (u_gone,    'pgtap-rri-gone@helm.test',   'authenticated'),
    (u_admin,   'pgtap-rri-admin@helm.test',  'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    (u_head,    'pgtap-rri-head@helm.test',   'coach'),
    (u_coach_z, 'pgtap-rri-coachz@helm.test', 'coach'),
    (u_player,  'pgtap-rri-player@helm.test', 'player'),
    (u_mate,    'pgtap-rri-mate@helm.test',   'player'),
    (u_gone,    'pgtap-rri-gone@helm.test',   'player'),
    (u_admin,   'pgtap-rri-admin@helm.test',  'admin')
  ON CONFLICT DO NOTHING;
  -- A trigger on auth.users may already have created these rows with a default
  -- role, so the admin role is set explicitly.
  UPDATE public.users SET role = 'admin' WHERE id = u_admin;

  INSERT INTO public.organizations (id, name, type) VALUES
    (v_org_1, 'pgtap-rri-org-1', 'college'),
    (v_org_2, 'pgtap-rri-org-2', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    (c_head,    u_head,    v_org_1),
    (c_coach_z, u_coach_z, v_org_2)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id) VALUES
    (p_player, u_player),
    (p_mate,   u_mate),
    (p_gone,   u_gone)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id, gender) VALUES
    (t_x, 'pgtap-rri-team-X', 'PGRRX1', v_org_1, 'mens'),
    (t_y, 'pgtap-rri-team-Y', 'PGRRY1', v_org_1, 'womens'),
    (t_z, 'pgtap-rri-team-Z', 'PGRRZ1', v_org_2, 'mens')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (t_x, c_head,    'head_coach', true),
    (t_z, c_coach_z, 'head_coach', true)
  ON CONFLICT DO NOTHING;

  -- Player and mate are active on X; "gone" is an INACTIVE member of X.
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (t_x, p_player, 'active'),
    (t_x, p_mate,   'active'),
    (t_x, p_gone,   'inactive')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, status) VALUES
    ('00000000-0000-0000-0000-00000000d151', p_player, t_x,  CURRENT_DATE, 'in_progress'),
    ('00000000-0000-0000-0000-00000000d152', p_player, NULL, CURRENT_DATE, 'in_progress'),
    ('00000000-0000-0000-0000-00000000d153', p_player, t_y,  CURRENT_DATE, 'in_progress'),
    ('00000000-0000-0000-0000-00000000d154', p_gone,   t_x,  CURRENT_DATE, 'in_progress')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Per persona: golf_rounds ids visible under RLS vs golf_readable_round_ids().
-- SECURITY INVOKER on purpose: both reads run with the persona's identity.
-- ============================================================================
CREATE FUNCTION pg_temp.round_sets() RETURNS TABLE (persona text, visible text, readable text)
LANGUAGE plpgsql AS $$
DECLARE
  p_names text[] := ARRAY['player','head','mate','gone','coach_z','admin'];
  p_uids  text[] := ARRAY[
    '00000000-0000-0000-0000-00000000d113','00000000-0000-0000-0000-00000000d111',
    '00000000-0000-0000-0000-00000000d114','00000000-0000-0000-0000-00000000d115',
    '00000000-0000-0000-0000-00000000d112','00000000-0000-0000-0000-00000000d116'];
  v_out jsonb := '[]'::jsonb;
  v_vis text;
  v_read text;
  i int;
BEGIN
  FOR i IN 1..array_length(p_names, 1) LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', p_uids[i], 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    SELECT coalesce(string_agg(id::text, ',' ORDER BY id), '') INTO v_vis
    FROM public.golf_rounds WHERE id::text LIKE '00000000-0000-0000-0000-00000000d15_';
    SELECT coalesce(string_agg(r::text, ',' ORDER BY r), '') INTO v_read
    FROM public.golf_readable_round_ids() r WHERE r::text LIKE '00000000-0000-0000-0000-00000000d15_';

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    v_out := v_out || jsonb_build_array(jsonb_build_array(p_names[i], v_vis, v_read));
  END LOOP;
  RETURN QUERY SELECT e->>0, e->>1, e->>2 FROM jsonb_array_elements(v_out) e;
END $$;

-- Admin sees every round through admin_read_all alone; record that, then take
-- the admin-only rows out of the comparison by neutralising that one policy
-- inside this rolled-back transaction.
CREATE TEMP TABLE with_admin AS SELECT * FROM pg_temp.round_sets();

SELECT is(
  (SELECT visible FROM with_admin WHERE persona = 'admin'),
  '00000000-0000-0000-0000-00000000d151,00000000-0000-0000-0000-00000000d152,'
  '00000000-0000-0000-0000-00000000d153,00000000-0000-0000-0000-00000000d154',
  'admin sees every seeded round through admin_read_all (the rows subtracted below)');

ALTER POLICY admin_read_all ON public.golf_rounds USING (false);

CREATE TEMP TABLE sets AS SELECT * FROM pg_temp.round_sets();

-- ============================================================================
-- 2. Visible minus admin-only == golf_readable_round_ids(), per persona
-- ============================================================================
SELECT is_empty(
  $$SELECT persona, visible, readable FROM sets WHERE visible IS DISTINCT FROM readable$$,
  'golf_rounds RLS (minus admin-only rows) and golf_readable_round_ids() agree for every persona: if not, update golf_readable_round_ids');

-- Spot checks so two equally wrong answers cannot pass.
SELECT is((SELECT readable FROM sets WHERE persona = 'player'),
  '00000000-0000-0000-0000-00000000d151,00000000-0000-0000-0000-00000000d152,'
  '00000000-0000-0000-0000-00000000d153,00000000-0000-0000-0000-00000000d154',
  'owner reads their three rounds plus the team-X round of an inactive teammate (owner is active on X)');
SELECT is((SELECT readable FROM sets WHERE persona = 'head'),
  '00000000-0000-0000-0000-00000000d151,00000000-0000-0000-0000-00000000d154',
  'team X coach reads both team-X rounds, not the personal or team-Y round');
SELECT is((SELECT readable FROM sets WHERE persona = 'mate'),
  '00000000-0000-0000-0000-00000000d151,00000000-0000-0000-0000-00000000d154',
  'active member of X reads the team-X rounds');
SELECT is((SELECT readable FROM sets WHERE persona = 'gone'),
  '00000000-0000-0000-0000-00000000d154',
  'inactive member of X reads only their own round, not a teammate''s');
SELECT is((SELECT visible FROM sets WHERE persona = 'gone'),
  '00000000-0000-0000-0000-00000000d154',
  'golf_rounds RLS agrees: an inactive member sees only their own round');
SELECT is((SELECT readable FROM sets WHERE persona = 'coach_z'), '',
  'a coach in another org reads no round');
SELECT is((SELECT readable FROM sets WHERE persona = 'admin'), '',
  'admin has no non-admin path to any seeded round');

SELECT * FROM finish();
ROLLBACK;
