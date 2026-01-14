-- ============================================================================
-- Migration: 030_golf_calendar.sql
-- Purpose: Golf calendar features - RSVPs, feeds, sync
-- Consolidated from: 063a_premium_calendar_ui_schema.sql, 039_golf_calendar_class_sync.sql
-- ============================================================================

-- Additional ENUMs for calendar features
DO $$ BEGIN
  CREATE TYPE golf_event_status AS ENUM ('draft', 'confirmed', 'cancelled', 'completed', 'pending');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE golf_rsvp_response AS ENUM ('confirmed', 'maybe', 'declined', 'pending');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE golf_calendar_feed_type AS ENUM ('team', 'personal', 'tournament', 'all_events');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Extend golf_events with Premium UI fields
ALTER TABLE golf_events
  ADD COLUMN IF NOT EXISTS status golf_event_status DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS requires_rsvp BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rsvp_lock_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rsvp_confirmed_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rsvp_maybe_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rsvp_declined_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rsvp_pending_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rsvp_total_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_golf_events_status ON golf_events(status);
CREATE INDEX IF NOT EXISTS idx_golf_events_rsvp_deadline ON golf_events(rsvp_deadline) WHERE requires_rsvp = true;

-- Golf Event RSVPs
CREATE TABLE IF NOT EXISTS golf_event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES golf_events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  response golf_rsvp_response NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_event ON golf_event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_player ON golf_event_rsvps(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_response ON golf_event_rsvps(response);

-- Golf Calendar Feeds
CREATE TABLE IF NOT EXISTS golf_calendar_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  feed_type golf_calendar_feed_type NOT NULL,
  feed_token TEXT UNIQUE NOT NULL,
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (feed_type = 'team' AND team_id IS NOT NULL) OR
    (feed_type = 'personal' AND player_id IS NOT NULL) OR
    (feed_type IN ('tournament', 'all_events'))
  )
);

CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_user ON golf_calendar_feeds(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_token ON golf_calendar_feeds(feed_token);
CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_team ON golf_calendar_feeds(team_id) WHERE team_id IS NOT NULL;

-- Calendar Sync History
CREATE TABLE IF NOT EXISTS golf_calendar_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  provider golf_sync_provider NOT NULL,
  provider_calendar_id TEXT,
  sync_status golf_sync_status DEFAULT 'pending',
  last_sync_at TIMESTAMPTZ,
  sync_errors JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_syncs_player ON golf_calendar_syncs(player_id);

-- Function to update RSVP counts
CREATE OR REPLACE FUNCTION update_event_rsvp_counts()
RETURNS TRIGGER AS $$
DECLARE
  target_event_id UUID;
BEGIN
  target_event_id := COALESCE(NEW.event_id, OLD.event_id);

  UPDATE golf_events
  SET
    rsvp_confirmed_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = target_event_id AND response = 'confirmed'),
    rsvp_maybe_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = target_event_id AND response = 'maybe'),
    rsvp_declined_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = target_event_id AND response = 'declined'),
    rsvp_pending_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = target_event_id AND response = 'pending'),
    rsvp_total_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = target_event_id),
    updated_at = NOW()
  WHERE id = target_event_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_rsvp_counts ON golf_event_rsvps;
CREATE TRIGGER trigger_update_rsvp_counts
  AFTER INSERT OR UPDATE OR DELETE ON golf_event_rsvps
  FOR EACH ROW EXECUTE FUNCTION update_event_rsvp_counts();

-- Function to generate secure feed tokens
CREATE OR REPLACE FUNCTION generate_feed_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-generate feed token
CREATE OR REPLACE FUNCTION set_default_feed_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.feed_token IS NULL THEN
    NEW.feed_token = generate_feed_token();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_set_feed_token ON golf_calendar_feeds;
CREATE TRIGGER trigger_set_feed_token
  BEFORE INSERT ON golf_calendar_feeds
  FOR EACH ROW EXECUTE FUNCTION set_default_feed_token();

-- Triggers for updated_at
CREATE TRIGGER update_golf_event_rsvps_updated_at
  BEFORE UPDATE ON golf_event_rsvps
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_calendar_feeds_updated_at
  BEFORE UPDATE ON golf_calendar_feeds
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_calendar_syncs_updated_at
  BEFORE UPDATE ON golf_calendar_syncs
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Documentation
COMMENT ON TABLE golf_event_rsvps IS 'RSVP responses for golf events';
COMMENT ON TABLE golf_calendar_feeds IS 'Calendar feed subscriptions for external sync';
COMMENT ON TABLE golf_calendar_syncs IS 'Sync history with external calendar providers';
