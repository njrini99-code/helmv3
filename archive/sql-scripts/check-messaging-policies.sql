-- Check all policies on messaging tables
SELECT
  tablename,
  policyname,
  cmd,
  with_check::text AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('conversations', 'conversation_participants', 'messages')
ORDER BY tablename, cmd, policyname;
