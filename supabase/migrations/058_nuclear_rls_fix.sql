-- =====================================================
-- NUCLEAR FIX: Completely wipe and recreate RLS policies
-- Fixes error code 42P17 (duplicate_object)
-- =====================================================

-- STEP 1: Disable RLS temporarily
ALTER TABLE golf_player_classes DISABLE ROW LEVEL SECURITY;

-- STEP 2: Drop ALL existing policies (clean slate)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'golf_player_classes'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON golf_player_classes', r.policyname);
        RAISE NOTICE 'Dropped policy: %', r.policyname;
    END LOOP;
END $$;

-- STEP 3: Re-enable RLS
ALTER TABLE golf_player_classes ENABLE ROW LEVEL SECURITY;

-- STEP 4: Create clean, separate policies for each operation
CREATE POLICY "golf_player_classes_select"
ON golf_player_classes FOR SELECT
TO authenticated
USING (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_player_classes_insert"
ON golf_player_classes FOR INSERT
TO authenticated
WITH CHECK (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_player_classes_update"
ON golf_player_classes FOR UPDATE
TO authenticated
USING (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_player_classes_delete"
ON golf_player_classes FOR DELETE
TO authenticated
USING (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);

-- STEP 5: Verify policies were created
SELECT
  policyname,
  cmd,
  roles::text
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'golf_player_classes'
ORDER BY policyname;
