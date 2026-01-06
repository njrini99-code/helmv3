-- =====================================================
-- Premium Calendar UI Schema Enhancements
-- =====================================================
-- Adds support for:
-- 1. RSVP responses tracking
-- 2. Calendar feed subscriptions
-- 3. Event status tracking
-- 4. RSVP lock times
-- =====================================================

-- 1. Add event status enum
DO $$ BEGIN
  CREATE TYPE golf_event_status AS ENUM ('draft', 'confirmed', 'cancelled', 'completed', 'pending');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add RSVP response enum
DO $$ BEGIN
  CREATE TYPE golf_rsvp_response AS ENUM ('confirmed', 'maybe', 'declined', 'pending');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Add calendar feed type enum
DO $$ BEGIN
  CREATE TYPE golf_calendar_feed_type AS ENUM ('team', 'personal', 'tournament', 'all_events');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Extend golf_events table with Premium UI fields
ALTER TABLE golf_events
  ADD COLUMN IF NOT EXISTS status golf_event_status DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS rsvp_lock_time timestamptz,
  ADD COLUMN IF NOT EXISTS rsvp_confirmed_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rsvp_maybe_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rsvp_declined_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rsvp_pending_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rsvp_total_count integer DEFAULT 0;

-- Add indexes for event status and RSVP queries
CREATE INDEX IF NOT EXISTS idx_golf_events_status ON golf_events(status);
CREATE INDEX IF NOT EXISTS idx_golf_events_rsvp_deadline ON golf_events(rsvp_deadline) WHERE requires_rsvp = true;
CREATE INDEX IF NOT EXISTS idx_golf_events_rsvp_lock_time ON golf_events(rsvp_lock_time) WHERE requires_rsvp = true;

-- 5. Create golf_event_rsvps table for tracking individual player responses
CREATE TABLE IF NOT EXISTS golf_event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES golf_events(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  response golf_rsvp_response NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure one RSVP per player per event
  UNIQUE(event_id, player_id)
);

-- Indexes for RSVP queries
CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_event ON golf_event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_player ON golf_event_rsvps(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_response ON golf_event_rsvps(response);

-- 6. Create golf_calendar_feeds table for subscription management
CREATE TABLE IF NOT EXISTS golf_calendar_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  feed_type golf_calendar_feed_type NOT NULL,
  feed_token text UNIQUE NOT NULL, -- Secure token for public feed access
  team_id uuid REFERENCES golf_teams(id) ON DELETE CASCADE,
  player_id uuid REFERENCES golf_players(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Constraints
  CHECK (
    (feed_type = 'team' AND team_id IS NOT NULL) OR
    (feed_type = 'personal' AND player_id IS NOT NULL) OR
    (feed_type IN ('tournament', 'all_events'))
  )
);

-- Indexes for calendar feed queries
CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_user ON golf_calendar_feeds(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_token ON golf_calendar_feeds(feed_token);
CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_team ON golf_calendar_feeds(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_player ON golf_calendar_feeds(player_id) WHERE player_id IS NOT NULL;

-- 7. Create function to update RSVP counts on golf_events
CREATE OR REPLACE FUNCTION update_event_rsvp_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE golf_events
  SET
    rsvp_confirmed_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = NEW.event_id AND response = 'confirmed'),
    rsvp_maybe_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = NEW.event_id AND response = 'maybe'),
    rsvp_declined_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = NEW.event_id AND response = 'declined'),
    rsvp_pending_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = NEW.event_id AND response = 'pending'),
    rsvp_total_count = (SELECT COUNT(*) FROM golf_event_rsvps WHERE event_id = NEW.event_id),
    updated_at = now()
  WHERE id = NEW.event_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically update RSVP counts
DROP TRIGGER IF EXISTS trigger_update_rsvp_counts ON golf_event_rsvps;
CREATE TRIGGER trigger_update_rsvp_counts
  AFTER INSERT OR UPDATE OR DELETE ON golf_event_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION update_event_rsvp_counts();

-- 8. Create function to generate secure feed tokens
CREATE OR REPLACE FUNCTION generate_feed_token()
RETURNS text AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set default feed token on insert if not provided
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
  FOR EACH ROW
  EXECUTE FUNCTION set_default_feed_token();

-- 9. RLS Policies for golf_event_rsvps
ALTER TABLE golf_event_rsvps ENABLE ROW LEVEL SECURITY;

-- Players can view their own RSVPs
CREATE POLICY "Players can view their own RSVPs"
  ON golf_event_rsvps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM golf_players
      WHERE golf_players.id = golf_event_rsvps.player_id
      AND golf_players.user_id = auth.uid()
    )
  );

-- Players can create/update their own RSVPs
CREATE POLICY "Players can manage their own RSVPs"
  ON golf_event_rsvps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM golf_players
      WHERE golf_players.id = golf_event_rsvps.player_id
      AND golf_players.user_id = auth.uid()
    )
  );

-- Coaches can view all RSVPs for their team events
CREATE POLICY "Coaches can view team event RSVPs"
  ON golf_event_rsvps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM golf_events e
      JOIN golf_coaches c ON c.team_id = e.team_id
      WHERE e.id = golf_event_rsvps.event_id
      AND c.user_id = auth.uid()
    )
  );

-- 10. RLS Policies for golf_calendar_feeds
ALTER TABLE golf_calendar_feeds ENABLE ROW LEVEL SECURITY;

-- Users can view their own feeds
CREATE POLICY "Users can view their own calendar feeds"
  ON golf_calendar_feeds FOR SELECT
  USING (user_id = auth.uid());

-- Users can create their own feeds
CREATE POLICY "Users can create their own calendar feeds"
  ON golf_calendar_feeds FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own feeds
CREATE POLICY "Users can update their own calendar feeds"
  ON golf_calendar_feeds FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own feeds
CREATE POLICY "Users can delete their own calendar feeds"
  ON golf_calendar_feeds FOR DELETE
  USING (user_id = auth.uid());

-- 11. Create updated_at trigger for new tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON golf_event_rsvps;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON golf_event_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON golf_calendar_feeds;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON golf_calendar_feeds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 12. Grant necessary permissions
GRANT ALL ON golf_event_rsvps TO authenticated;
GRANT ALL ON golf_calendar_feeds TO authenticated;

-- =====================================================
-- Migration Complete
-- =====================================================
-- This migration adds:
-- ✓ Event status tracking (draft, confirmed, cancelled, etc.)
-- ✓ RSVP response tracking per player
-- ✓ Automatic RSVP count updates
-- ✓ Calendar feed subscription management
-- ✓ Secure feed token generation
-- ✓ RLS policies for data security
-- =====================================================
