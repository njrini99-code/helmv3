-- =====================================================================================
-- Migration: iCal Feeds & Subscribable Calendars
-- Description: Add calendar subscription tokens and settings
-- =====================================================================================

-- Add calendar feed tokens to coaches table
ALTER TABLE golf_coaches
  ADD COLUMN IF NOT EXISTS calendar_feed_token UUID DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN IF NOT EXISTS calendar_feed_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS calendar_feed_public BOOLEAN DEFAULT false;

COMMENT ON COLUMN golf_coaches.calendar_feed_token IS 'Unique token for calendar feed subscription';
COMMENT ON COLUMN golf_coaches.calendar_feed_enabled IS 'Whether calendar feed is enabled';
COMMENT ON COLUMN golf_coaches.calendar_feed_public IS 'Whether calendar feed is publicly accessible';

-- Add calendar feed tokens to players table
ALTER TABLE golf_players
  ADD COLUMN IF NOT EXISTS calendar_feed_token UUID DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN IF NOT EXISTS calendar_feed_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS calendar_feed_public BOOLEAN DEFAULT false;

COMMENT ON COLUMN golf_players.calendar_feed_token IS 'Unique token for calendar feed subscription';
COMMENT ON COLUMN golf_players.calendar_feed_enabled IS 'Whether calendar feed is enabled';
COMMENT ON COLUMN golf_players.calendar_feed_public IS 'Whether calendar feed is publicly accessible';

-- Add calendar feed tokens to teams table
ALTER TABLE golf_teams
  ADD COLUMN IF NOT EXISTS calendar_feed_token UUID DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN IF NOT EXISTS calendar_feed_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS calendar_feed_public BOOLEAN DEFAULT false;

COMMENT ON COLUMN golf_teams.calendar_feed_token IS 'Unique token for team calendar feed subscription';
COMMENT ON COLUMN golf_teams.calendar_feed_enabled IS 'Whether team calendar feed is enabled';
COMMENT ON COLUMN golf_teams.calendar_feed_public IS 'Whether team calendar feed is publicly accessible';

-- Create indexes for feed token lookups
CREATE INDEX IF NOT EXISTS idx_golf_coaches_feed_token ON golf_coaches(calendar_feed_token);
CREATE INDEX IF NOT EXISTS idx_golf_players_feed_token ON golf_players(calendar_feed_token);
CREATE INDEX IF NOT EXISTS idx_golf_teams_feed_token ON golf_teams(calendar_feed_token);

-- Calendar Feed Access Log (optional - for analytics)
CREATE TABLE IF NOT EXISTS golf_calendar_feed_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_token UUID NOT NULL,
  feed_type TEXT NOT NULL CHECK (feed_type IN ('coach', 'player', 'team')),
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  ip_address INET
);

COMMENT ON TABLE golf_calendar_feed_access IS 'Tracks calendar feed access for analytics';

CREATE INDEX IF NOT EXISTS idx_golf_calendar_feed_access_token ON golf_calendar_feed_access(feed_token);
CREATE INDEX IF NOT EXISTS idx_golf_calendar_feed_access_date ON golf_calendar_feed_access(accessed_at);

-- No RLS needed for feed access log as it's internal tracking only
