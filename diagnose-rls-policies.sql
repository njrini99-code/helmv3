-- ============================================================================
-- RLS POLICY DIAGNOSTIC FOR golf_events
-- Run this in Supabase Dashboard SQL Editor
-- ============================================================================

-- 1) Show ALL RLS policies on golf_events
-- This shows USING and WITH CHECK expressions
SELECT
  polname AS policy_name,
  polcmd AS for_command,
  pg_get_expr(polqual, polrelid) AS using_expression,
  pg_get_expr(polwithcheck, polrelid) AS with_check_expression
FROM pg_policy
WHERE polrelid = 'public.golf_events'::regclass
ORDER BY polcmd, polname;

-- 2) Verify the user's auth and profile records
SELECT
  u.id AS user_id,
  u.email,
  u.role,
  gc.id AS golf_coach_id,
  gc.team_id AS coach_team_id,
  gp.id AS golf_player_id,
  gp.team_id AS player_team_id,
  gp.first_name || ' ' || gp.last_name AS player_name
FROM auth.users u
LEFT JOIN public.golf_coaches gc ON gc.user_id = u.id
LEFT JOIN public.golf_players gp ON gp.user_id = u.id
WHERE u.email = 'rinin376@gmail.com';

-- 3) Check if RLS is enabled
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'golf_events';

-- 4) Sample golf_teams (for reference)
SELECT id, name
FROM public.golf_teams
LIMIT 5;
