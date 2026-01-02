-- ============================================================================
-- FIX: Allow authenticated users to SELECT golf_events
-- ============================================================================

-- Drop any existing SELECT policies
DROP POLICY IF EXISTS "Users can view events for their team" ON golf_events;
DROP POLICY IF EXISTS "Coaches can view events" ON golf_events;
DROP POLICY IF EXISTS "Allow event viewing" ON golf_events;
DROP POLICY IF EXISTS "Enable select for authenticated users" ON golf_events;

-- Create permissive SELECT policy
-- This allows authenticated users to see all events (or filter as needed)
CREATE POLICY "Enable select for authenticated users"
ON golf_events
FOR SELECT
TO authenticated
USING (true);

-- Verify both INSERT and SELECT policies exist
SELECT
  polname AS policy_name,
  polcmd AS command,
  pg_get_expr(polqual, polrelid) AS using_clause,
  pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.golf_events'::regclass
  AND polcmd IN ('INSERT', 'SELECT')
ORDER BY polcmd, polname;
