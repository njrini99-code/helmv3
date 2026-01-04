-- Disable RLS and remove all policies for golf tables
-- This allows full access for development/testing

-- Disable RLS on all golf tables
ALTER TABLE golf_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_coaches DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_rounds DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_shots DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_events DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies for golf_players
DROP POLICY IF EXISTS "Users can view own player profile" ON golf_players;
DROP POLICY IF EXISTS "Users can update own player profile" ON golf_players;
DROP POLICY IF EXISTS "Users can insert own player profile" ON golf_players;
DROP POLICY IF EXISTS "Coaches can view players" ON golf_players;
DROP POLICY IF EXISTS "Coaches can view their team players" ON golf_players;
DROP POLICY IF EXISTS "Players can view own profile" ON golf_players;
DROP POLICY IF EXISTS "Players can update own profile" ON golf_players;
DROP POLICY IF EXISTS "Public can view active players" ON golf_players;

-- Drop all existing policies for golf_coaches
DROP POLICY IF EXISTS "Users can view own coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can update own coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can insert own coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Coaches can view own profile" ON golf_coaches;
DROP POLICY IF EXISTS "Coaches can update own profile" ON golf_coaches;
DROP POLICY IF EXISTS "Public can view coaches" ON golf_coaches;

-- Drop all existing policies for golf_teams
DROP POLICY IF EXISTS "Coaches can view own team" ON golf_teams;
DROP POLICY IF EXISTS "Coaches can update own team" ON golf_teams;
DROP POLICY IF EXISTS "Players can view own team" ON golf_teams;
DROP POLICY IF EXISTS "Public can view teams" ON golf_teams;
DROP POLICY IF EXISTS "Team members can view team" ON golf_teams;

-- Drop all existing policies for golf_organizations
DROP POLICY IF EXISTS "Public can view organizations" ON golf_organizations;
DROP POLICY IF EXISTS "Organizations are viewable by everyone" ON golf_organizations;

-- Drop all existing policies for golf_rounds
DROP POLICY IF EXISTS "Players can view own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can insert own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can update own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Coaches can view team rounds" ON golf_rounds;

-- Drop all existing policies for golf_shots
DROP POLICY IF EXISTS "Players can view own shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can insert own shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can update own shots" ON golf_shots;
DROP POLICY IF EXISTS "Coaches can view team shots" ON golf_shots;

-- Drop all existing policies for golf_courses
DROP POLICY IF EXISTS "Public can view courses" ON golf_courses;
DROP POLICY IF EXISTS "Coaches can insert courses" ON golf_courses;
DROP POLICY IF EXISTS "Coaches can update courses" ON golf_courses;

-- Drop all existing policies for golf_events
DROP POLICY IF EXISTS "Players can view own team events" ON golf_events;
DROP POLICY IF EXISTS "Coaches can view own team events" ON golf_events;
DROP POLICY IF EXISTS "Coaches can manage own team events" ON golf_events;
DROP POLICY IF EXISTS "Team members can view events" ON golf_events;

COMMENT ON TABLE golf_players IS 'RLS disabled for development - re-enable in production';
COMMENT ON TABLE golf_coaches IS 'RLS disabled for development - re-enable in production';
COMMENT ON TABLE golf_teams IS 'RLS disabled for development - re-enable in production';
