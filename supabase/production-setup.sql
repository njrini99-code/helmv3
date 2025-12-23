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
-- 2. PERFORMANCE INDEXES (Makes app faster!)
-- ============================================

-- Players discovery (Discover page speed)
CREATE INDEX IF NOT EXISTS idx_players_recruiting ON players(recruiting_activated) WHERE recruiting_activated = true;
CREATE INDEX IF NOT EXISTS idx_players_grad_year ON players(grad_year);
CREATE INDEX IF NOT EXISTS idx_players_state ON players(state);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(primary_position);
CREATE INDEX IF NOT EXISTS idx_players_search ON players USING gin(search_vector);

-- Watchlist/Pipeline queries
CREATE INDEX IF NOT EXISTS idx_watchlists_coach ON watchlists(coach_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_player ON watchlists(player_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_stage ON watchlists(coach_id, pipeline_stage);

-- Messages speed
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);

-- Coach lookups
CREATE INDEX IF NOT EXISTS idx_coaches_user ON coaches(user_id);
CREATE INDEX IF NOT EXISTS idx_coaches_org ON coaches(organization_id);

-- Golf indexes
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player ON golf_rounds(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_players_team ON golf_players(team_id);

-- ============================================
-- 3. VERIFY/FIX Coach-Organization Links
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
-- 4. SEED PLAYERS (For Discover page demo)
-- ============================================

-- Check if we have players
SELECT COUNT(*) as player_count FROM players WHERE recruiting_activated = true;

-- If empty, uncomment and run this:
/*
INSERT INTO players (
  id, player_type, first_name, last_name, primary_position, secondary_position,
  grad_year, high_school_name, city, state,
  height_feet, height_inches, weight_lbs, bats, throws,
  gpa, recruiting_activated, onboarding_completed
) VALUES 
  (gen_random_uuid(), 'high_school', 'Marcus', 'Johnson', 'SS', 'OF', 2026, 'Lincoln High', 'Dallas', 'TX', 5, 11, 175, 'R', 'R', 3.8, true, true),
  (gen_random_uuid(), 'high_school', 'Tyler', 'Williams', 'RHP', '1B', 2026, 'Westview Academy', 'Phoenix', 'AZ', 6, 3, 205, 'R', 'R', 3.5, true, true),
  (gen_random_uuid(), 'high_school', 'Derek', 'Thompson', 'C', NULL, 2027, 'Riverside Prep', 'San Diego', 'CA', 6, 0, 195, 'L', 'R', 3.9, true, true),
  (gen_random_uuid(), 'high_school', 'Jordan', 'Davis', 'OF', 'SS', 2026, 'Mountain View HS', 'Denver', 'CO', 5, 10, 170, 'R', 'R', 3.7, true, true),
  (gen_random_uuid(), 'high_school', 'Cameron', 'Martinez', 'LHP', NULL, 2025, 'Central Catholic', 'Miami', 'FL', 6, 2, 190, 'L', 'L', 3.4, true, true),
  (gen_random_uuid(), 'high_school', 'Austin', 'Brown', '2B', '3B', 2026, 'Oak Park HS', 'Chicago', 'IL', 5, 9, 165, 'R', 'R', 3.6, true, true),
  (gen_random_uuid(), 'high_school', 'Ryan', 'Garcia', '3B', 'SS', 2027, 'St. Augustine', 'Los Angeles', 'CA', 6, 1, 200, 'R', 'R', 3.7, true, true),
  (gen_random_uuid(), 'high_school', 'Jake', 'Wilson', 'OF', NULL, 2026, 'North Central', 'Atlanta', 'GA', 6, 0, 185, 'L', 'L', 3.5, true, true),
  (gen_random_uuid(), 'high_school', 'Brandon', 'Lee', 'RHP', 'OF', 2026, 'East Valley', 'Seattle', 'WA', 6, 4, 210, 'R', 'R', 3.3, true, true),
  (gen_random_uuid(), 'high_school', 'Ethan', 'Moore', '1B', 'OF', 2025, 'Westlake HS', 'Austin', 'TX', 6, 3, 215, 'L', 'L', 3.8, true, true);
*/

-- ============================================
-- 5. VERIFY GOLF TABLES EXIST
-- ============================================

SELECT table_name, 
  CASE 
    WHEN table_name IS NOT NULL THEN '✓ Exists'
    ELSE '❌ Missing'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('golf_coaches', 'golf_players', 'golf_teams', 'golf_rounds');

-- ============================================
-- DONE! Check the results above.
-- ============================================
