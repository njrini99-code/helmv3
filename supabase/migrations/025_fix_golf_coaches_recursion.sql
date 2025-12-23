-- Fix infinite recursion in golf_coaches RLS policies
-- The issue: "View team coaches" policy queries golf_coaches from within itself

-- Drop the problematic policy
DROP POLICY IF EXISTS "View team coaches" ON golf_coaches;
DROP POLICY IF EXISTS "Coach manages own profile" ON golf_coaches;

-- Create simpler, non-recursive policies

-- Coach can manage their own profile (no recursion)
CREATE POLICY "Coach manages own profile"
  ON golf_coaches FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- All authenticated users can view coaches (simpler, no recursion)
-- This allows team members to see their coaches without circular queries
CREATE POLICY "Authenticated users can view coaches"
  ON golf_coaches FOR SELECT
  TO authenticated
  USING (true);

-- Note: More restrictive policies can be added later if needed,
-- but they must avoid self-referential queries to prevent infinite recursion
