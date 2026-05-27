-- Fix baseball_coaches SELECT policy — too permissive (USING (true) allows any authenticated user
-- to enumerate all coach profiles including names, schools, and contact info).
--
-- Replacement policy: any authenticated user who is themselves a baseball coach can read
-- other coach records. This supports the Discover feature (college coaches viewing HS program
-- pages) while preventing non-coach authenticated users (players, admins, etc.) from
-- enumerating coach PII.
--
-- Uses get_my_coach_id() (SECURITY DEFINER) to avoid infinite RLS recursion when
-- checking whether the caller is a coach.

DROP POLICY IF EXISTS "baseball_coaches_select" ON baseball_coaches;

CREATE POLICY "baseball_coaches_select" ON baseball_coaches
  FOR SELECT TO authenticated
  USING (
    -- Own record is always readable
    auth.uid() = user_id
    OR
    -- Any authenticated baseball coach can read other coach profiles.
    -- get_my_coach_id() is SECURITY DEFINER so it bypasses RLS and avoids recursion.
    get_my_coach_id() IS NOT NULL
  );
