-- Enums
CREATE TYPE user_role AS ENUM ('player', 'coach', 'admin');
CREATE TYPE coach_type AS ENUM ('college', 'high_school', 'juco', 'showcase');
CREATE TYPE player_type AS ENUM ('high_school', 'showcase', 'juco', 'college');
CREATE TYPE pipeline_stage AS ENUM ('watchlist', 'priority', 'offer_extended', 'committed');

-- Colleges
CREATE TABLE colleges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  division TEXT,
  conference TEXT,
  city TEXT,
  state TEXT,
  logo_url TEXT,
  website TEXT,
  baseball_url TEXT,
  head_coach TEXT,
  assistant_coaches TEXT[],
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- High Schools
CREATE TABLE high_schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'player',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Coaches
CREATE TABLE coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  coach_type coach_type NOT NULL,
  full_name TEXT,
  email_contact TEXT,
  phone TEXT,
  avatar_url TEXT,
  coach_title TEXT,
  college_id UUID REFERENCES colleges(id),
  school_name TEXT,
  school_city TEXT,
  school_state TEXT,
  program_division TEXT,
  about TEXT,
  primary_color TEXT DEFAULT '#16A34A',
  recruiting_class_needs TEXT[],
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  player_type player_type NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  city TEXT,
  state TEXT,
  primary_position TEXT,
  secondary_position TEXT,
  grad_year INTEGER,
  bats TEXT,
  throws TEXT,
  height_feet INTEGER,
  height_inches INTEGER,
  weight_lbs INTEGER,
  high_school_name TEXT,
  high_school_id UUID REFERENCES high_schools(id),
  club_team TEXT,
  pitch_velo DECIMAL(4,1),
  exit_velo DECIMAL(4,1),
  sixty_time DECIMAL(4,2),
  pop_time DECIMAL(4,2),
  gpa DECIMAL(3,2),
  sat_score INTEGER,
  act_score INTEGER,
  instagram TEXT,
  twitter TEXT,
  about_me TEXT,
  has_video BOOLEAN DEFAULT FALSE,
  recruiting_activated BOOLEAN DEFAULT FALSE,
  committed_to UUID REFERENCES colleges(id),
  commitment_date DATE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  profile_completion_percent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Watchlists
CREATE TABLE watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  pipeline_stage pipeline_stage DEFAULT 'watchlist',
  notes TEXT,
  priority INTEGER DEFAULT 0,
  tags TEXT[],
  added_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coach_id, player_id)
);

-- Videos
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_type TEXT,
  url TEXT,
  thumbnail_url TEXT,
  duration INTEGER,
  view_count INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profile Views
CREATE TABLE profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES users(id),
  viewer_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video Views
CREATE TABLE video_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_players_grad_year ON players(grad_year);
CREATE INDEX idx_players_position ON players(primary_position);
CREATE INDEX idx_players_state ON players(state);
CREATE INDEX idx_players_recruiting ON players(recruiting_activated) WHERE recruiting_activated = true;
CREATE INDEX idx_watchlists_coach ON watchlists(coach_id);
CREATE INDEX idx_watchlists_player ON watchlists(player_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, read);
CREATE INDEX idx_profile_views_player ON profile_views(player_id, created_at DESC);

-- Full text search on players
ALTER TABLE players ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(first_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(last_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(high_school_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(city, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(state, '')), 'C')
  ) STORED;
CREATE INDEX idx_players_search ON players USING gin(search_vector);

-- RLS Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_views ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own data" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Coaches policies
CREATE POLICY "Coaches can manage own profile" ON coaches FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view coaches" ON coaches FOR SELECT USING (true);

-- Players policies
CREATE POLICY "Players can manage own profile" ON players FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Activated players are public" ON players FOR SELECT USING (recruiting_activated = true OR auth.uid() = user_id);

-- Watchlists policies
CREATE POLICY "Coaches manage own watchlist" ON watchlists FOR ALL USING (
  coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
);

-- Videos policies
CREATE POLICY "Players manage own videos" ON videos FOR ALL USING (
  player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
);
CREATE POLICY "Videos are public" ON videos FOR SELECT USING (true);

-- Conversations policies
CREATE POLICY "Users see own conversations" ON conversations FOR SELECT USING (
  id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create conversations" ON conversations FOR INSERT WITH CHECK (true);

CREATE POLICY "Users see own participations" ON conversation_participants FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can join conversations" ON conversation_participants FOR INSERT WITH CHECK (user_id = auth.uid());

-- Messages policies
CREATE POLICY "Users see messages in their conversations" ON messages FOR SELECT USING (
  conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid())
);
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid())
);

-- Notifications policies
CREATE POLICY "Users see own notifications" ON notifications FOR ALL USING (user_id = auth.uid());

-- Profile views policies
CREATE POLICY "Anyone can create views" ON profile_views FOR INSERT WITH CHECK (true);
CREATE POLICY "Players see own views" ON profile_views FOR SELECT USING (
  player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
);

-- Functions
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_coaches_updated_at BEFORE UPDATE ON coaches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_watchlists_updated_at BEFORE UPDATE ON watchlists FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to update player profile completion
CREATE OR REPLACE FUNCTION calculate_profile_completion(p players)
RETURNS INTEGER AS $$
DECLARE
  total INTEGER := 0;
  filled INTEGER := 0;
BEGIN
  total := 15;
  IF p.first_name IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.last_name IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.primary_position IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.grad_year IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.height_feet IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.weight_lbs IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.high_school_name IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.city IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.state IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.gpa IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.bats IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.throws IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.about_me IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.pitch_velo IS NOT NULL OR p.exit_velo IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.has_video THEN filled := filled + 1; END IF;
  RETURN (filled * 100 / total);
END;
$$ LANGUAGE plpgsql;
