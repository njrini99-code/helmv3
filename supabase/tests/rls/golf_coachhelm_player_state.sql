-- CoachHelm Slice 3: golf_coachhelm_player_state is the per-player
-- checkpoint counter (20261020122000_golf_coachhelm_player_state.sql). The
-- nightly cron writes through service_role; the player, a coach of the
-- player's active team and super admins may read; nobody else reads, and no
-- authenticated user writes.

BEGIN;
\ir _helpers.sql

SELECT plan(7);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_coachhelm_player_state'::regclass),
  'RLS is enabled on golf_coachhelm_player_state'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_coachhelm_player_state') = 1,
  'exactly one policy on golf_coachhelm_player_state'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_coachhelm_player_state'
      AND policyname = 'golf_coachhelm_player_state_select'
      AND cmd = 'SELECT'
      AND qual LIKE '%is_golf_team_coach%'
      AND qual LIKE '%is_super_admin%'
      AND qual LIKE '%auth.uid()%'
  ),
  'the one policy is a SELECT for the player, the player''s coaches and super admins'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_coachhelm_player_state', 'SELECT'),
  'anon cannot SELECT'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.golf_coachhelm_player_state', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.golf_coachhelm_player_state', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.golf_coachhelm_player_state', 'DELETE'),
  'authenticated cannot INSERT, UPDATE or DELETE'
);

SELECT ok(
  has_table_privilege('service_role', 'public.golf_coachhelm_player_state', 'INSERT')
  AND has_table_privilege('service_role', 'public.golf_coachhelm_player_state', 'UPDATE'),
  'service_role can INSERT and UPDATE (the nightly cron)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_player_state'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%jsonb_typeof(attempts_since)%'
  ),
  'attempts_since must be a JSON object'
);

SELECT * FROM finish();
ROLLBACK;
