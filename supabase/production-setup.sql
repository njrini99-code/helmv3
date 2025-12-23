-- ============================================
-- HELM SPORTS LABS - PRODUCTION SETUP SQL
-- Run this entire script in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. FIX RLS - Auto-create user on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'player')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. VERIFY/FIX Coach-Organization Links
-- ============================================

-- Show all coaches and their org links
SELECT 
  c.id as coach_id,
  c.full_name,
  c.school_name,
  c.organization_id,
  o.id as org_id,
  o.name as org_name,
  CASE 
    WHEN c.organization_id IS NULL AND o.id IS NOT NULL THEN '❌ NEEDS LINK'
    WHEN c.organization_id IS NOT NULL THEN '✓ Linked'
    ELSE '⚠️ No org created'
  END as status
FROM coaches c
LEFT JOIN organizations o ON o.name = c.school_name;

-- Auto-fix: Link coaches to their organizations by matching school name
UPDATE coaches c
SET organization_id = o.id
FROM organizations o
WHERE o.name = c.school_name
  AND c.organization_id IS NULL;

-- ============================================
-- 3. VERIFY Golf Tables Exist
-- ============================================

-- Check for golf tables
SELECT table_name, 
  CASE 
    WHEN table_name IS NOT NULL THEN '✓ Exists'
    ELSE '❌ Missing'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('golf_coaches', 'golf_players', 'golf_teams', 'golf_rounds');

-- ============================================
-- 4. SEED DATA (Optional - for demo)
-- ============================================

-- Uncomment below if you need sample players for the Discover page

/*
INSERT INTO players (
  user_id, first_name, last_name, primary_position, secondary_position,
  grad_year, high_school_name, high_school_city, high_school_state,
  height_feet, height_inches, weight, bats, throws,
  gpa, sat_score, recruiting_activated
) VALUES 
  (gen_random_uuid(), 'Marcus', 'Johnson', 'SS', 'OF', 2026, 'Lincoln High', 'Dallas', 'TX', 5, 11, 175, 'R', 'R', 3.8, 1350, true),
  (gen_random_uuid(), 'Tyler', 'Williams', 'RHP', '1B', 2026, 'Westview Academy', 'Phoenix', 'AZ', 6, 3, 205, 'R', 'R', 3.5, 1280, true),
  (gen_random_uuid(), 'Derek', 'Thompson', 'C', null, 2027, 'Riverside Prep', 'San Diego', 'CA', 6, 0, 195, 'L', 'R', 3.9, 1420, true),
  (gen_random_uuid(), 'Jordan', 'Davis', 'OF', 'SS', 2026, 'Mountain View HS', 'Denver', 'CO', 5, 10, 170, 'R', 'R', 3.7, 1300, true),
  (gen_random_uuid(), 'Cameron', 'Martinez', 'LHP', null, 2025, 'Central Catholic', 'Miami', 'FL', 6, 2, 190, 'L', 'L', 3.4, 1250, true);
*/

-- ============================================
-- DONE! Check the results above for any issues
-- ============================================
