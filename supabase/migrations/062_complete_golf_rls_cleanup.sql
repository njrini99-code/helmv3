-- COMPLETE GOLF RLS CLEANUP
-- This script completely removes ALL RLS policies from golf tables
-- Run this in Supabase Dashboard SQL Editor before creating new policies

-- ============================================
-- STEP 1: Disable RLS on all golf tables
-- ============================================
ALTER TABLE IF EXISTS golf_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS golf_coaches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS golf_teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS golf_organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS golf_rounds DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS golf_shots DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS golf_courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS golf_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS golf_team_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS golf_event_participants DISABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Drop ALL policies on golf_players
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'golf_players'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON golf_players', r.policyname);
    END LOOP;
END $$;

-- ============================================
-- STEP 3: Drop ALL policies on golf_coaches
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'golf_coaches'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON golf_coaches', r.policyname);
    END LOOP;
END $$;

-- ============================================
-- STEP 4: Drop ALL policies on golf_teams
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'golf_teams'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON golf_teams', r.policyname);
    END LOOP;
END $$;

-- ============================================
-- STEP 5: Drop ALL policies on golf_organizations
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'golf_organizations'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON golf_organizations', r.policyname);
    END LOOP;
END $$;

-- ============================================
-- STEP 6: Drop ALL policies on golf_rounds
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'golf_rounds'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON golf_rounds', r.policyname);
    END LOOP;
END $$;

-- ============================================
-- STEP 7: Drop ALL policies on golf_shots
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'golf_shots'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON golf_shots', r.policyname);
    END LOOP;
END $$;

-- ============================================
-- STEP 8: Drop ALL policies on golf_courses
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'golf_courses'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON golf_courses', r.policyname);
    END LOOP;
END $$;

-- ============================================
-- STEP 9: Drop ALL policies on golf_events
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'golf_events'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON golf_events', r.policyname);
    END LOOP;
END $$;

-- ============================================
-- STEP 10: Drop ALL policies on golf_team_members
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'golf_team_members'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON golf_team_members', r.policyname);
    END LOOP;
END $$;

-- ============================================
-- STEP 11: Drop ALL policies on golf_event_participants
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'golf_event_participants'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON golf_event_participants', r.policyname);
    END LOOP;
END $$;

-- ============================================
-- STEP 12: Add comments noting RLS is disabled
-- ============================================
COMMENT ON TABLE golf_players IS 'RLS completely disabled - will be reconfigured';
COMMENT ON TABLE golf_coaches IS 'RLS completely disabled - will be reconfigured';
COMMENT ON TABLE golf_teams IS 'RLS completely disabled - will be reconfigured';
COMMENT ON TABLE golf_organizations IS 'RLS completely disabled - will be reconfigured';
COMMENT ON TABLE golf_rounds IS 'RLS completely disabled - will be reconfigured';
COMMENT ON TABLE golf_shots IS 'RLS completely disabled - will be reconfigured';
COMMENT ON TABLE golf_courses IS 'RLS completely disabled - will be reconfigured';
COMMENT ON TABLE golf_events IS 'RLS completely disabled - will be reconfigured';

-- ============================================
-- VERIFICATION: Check that no policies remain
-- ============================================
-- Run this query after executing the script to verify:
-- SELECT tablename, COUNT(*) as policy_count
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename LIKE 'golf_%'
-- GROUP BY tablename;
--
-- Should return 0 rows if successful
