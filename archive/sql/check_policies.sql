SELECT policyname, cmd, pg_get_expr(qual, polrelid) AS using_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'conversation_participants'
ORDER BY policyname;
