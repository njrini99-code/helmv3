-- ============================================================================
-- Nuclear Option: Drop ALL Policies on conversation_participants
-- ============================================================================
--
-- Get all policy names and drop them one by one
--
-- ============================================================================

-- List all policies first (for debugging)
DO $$
DECLARE
  policy_rec RECORD;
BEGIN
  RAISE NOTICE 'Policies found on conversation_participants:';
  FOR policy_rec IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversation_participants'
    ORDER BY policyname
  LOOP
    RAISE NOTICE '  - %', policy_rec.policyname;
  END LOOP;
END $$;

-- Drop each policy explicitly
DO $$
DECLARE
  policy_rec RECORD;
  drop_statement TEXT;
BEGIN
  FOR policy_rec IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversation_participants'
  LOOP
    drop_statement := format('DROP POLICY IF EXISTS %I ON conversation_participants', policy_rec.policyname);
    RAISE NOTICE 'Executing: %', drop_statement;
    EXECUTE drop_statement;
  END LOOP;
END $$;

-- Disable RLS
ALTER TABLE conversation_participants DISABLE ROW LEVEL SECURITY;

-- Final verification
DO $$
DECLARE
  policy_count INTEGER;
  rls_enabled BOOLEAN;
BEGIN
  -- Check policy count
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'conversation_participants';

  -- Check RLS status
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class
  WHERE relname = 'conversation_participants'
    AND relnamespace = 'public'::regnamespace;

  IF policy_count > 0 THEN
    RAISE WARNING 'FAILED: conversation_participants still has % policies', policy_count;
  ELSE
    RAISE NOTICE 'SUCCESS: conversation_participants has 0 policies';
  END IF;

  IF rls_enabled THEN
    RAISE WARNING 'FAILED: RLS is still ENABLED on conversation_participants';
  ELSE
    RAISE NOTICE 'SUCCESS: RLS is DISABLED on conversation_participants';
  END IF;
END $$;
