-- ============================================================================
-- CHECK ALL RLS POLICIES (not just INSERT) on golf_events
-- ============================================================================

-- 1) Show ALL policies (all command types)
SELECT
  polname AS policy_name,
  polcmd AS command_type,
  polpermissive AS is_permissive,
  polroles::regrole[] AS applies_to_roles,
  pg_get_expr(polqual, polrelid) AS using_clause,
  pg_get_expr(polwithcheck, polrelid) AS with_check_clause
FROM pg_policy
WHERE polrelid = 'public.golf_events'::regclass
ORDER BY polcmd, polname;

-- 2) Check for triggers that might block inserts
SELECT
  tgname AS trigger_name,
  tgtype,
  tgenabled AS enabled,
  pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger
WHERE tgrelid = 'public.golf_events'::regclass
  AND tgname NOT LIKE 'RI_%'  -- Exclude referential integrity triggers
ORDER BY tgname;

-- 3) Check table ownership
SELECT
  tablename,
  tableowner,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'golf_events';
