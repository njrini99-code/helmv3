-- ============================================================================
-- VERIFY: Event exists and check policies
-- ============================================================================

-- 1) Check if the event we created exists
SELECT
  id,
  title,
  event_type,
  start_date,
  team_id,
  created_at
FROM golf_events
WHERE id = 'cae76f44-403a-454e-93cf-89a10daf3e6b'
ORDER BY created_at DESC;

-- 2) Show ALL events (to see if any exist)
SELECT
  id,
  title,
  event_type,
  start_date,
  team_id,
  created_at
FROM golf_events
ORDER BY created_at DESC
LIMIT 10;

-- 3) Verify both INSERT and SELECT policies exist
SELECT
  polname AS policy_name,
  polcmd AS command,
  pg_get_expr(polqual, polrelid) AS using_clause,
  pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.golf_events'::regclass
  AND polcmd IN ('INSERT', 'SELECT')
ORDER BY polcmd, polname;

-- 4) Check if RLS is still enabled
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'golf_events';
