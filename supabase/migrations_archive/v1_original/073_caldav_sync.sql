-- ============================================================================
-- Two-Way CalDAV Sync Implementation
-- Enables bidirectional sync with external calendars (Google, Apple, Outlook)
-- ============================================================================

-- External Calendar Connections
CREATE TABLE IF NOT EXISTS golf_external_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_type TEXT NOT NULL CHECK (calendar_type IN ('google', 'apple', 'outlook', 'caldav')),
  calendar_name TEXT NOT NULL,
  calendar_url TEXT, -- CalDAV URL for custom servers

  -- OAuth tokens (encrypted in practice)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- CalDAV specific
  principal_url TEXT,
  calendar_home_set TEXT,
  ctag TEXT, -- Calendar collection tag for change detection

  -- Sync settings
  sync_enabled BOOLEAN DEFAULT true,
  sync_direction TEXT DEFAULT 'bidirectional' CHECK (sync_direction IN ('import_only', 'export_only', 'bidirectional')),
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  sync_interval_minutes INTEGER DEFAULT 15,

  -- Filters
  sync_event_types TEXT[], -- Which event types to sync (practice, match, etc.)
  sync_team_ids UUID[], -- Which teams to sync

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, calendar_type, calendar_url)
);

-- Sync State Tracking
CREATE TABLE IF NOT EXISTS golf_calendar_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_calendar_id UUID NOT NULL REFERENCES golf_external_calendars(id) ON DELETE CASCADE,
  golf_event_id UUID REFERENCES golf_events(id) ON DELETE CASCADE,
  external_event_id TEXT NOT NULL, -- UID from external calendar
  external_event_url TEXT, -- URL for CalDAV updates
  external_etag TEXT, -- For conflict detection

  -- Sync metadata
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  last_modified_source TEXT CHECK (last_modified_source IN ('golf', 'external')),
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'conflict', 'error')),
  conflict_data JSONB, -- Store conflicting versions for resolution
  error_message TEXT,

  -- Change tracking
  golf_event_hash TEXT, -- Hash of event data for change detection
  external_event_hash TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(external_calendar_id, external_event_id)
);

-- Sync Log for debugging
CREATE TABLE IF NOT EXISTS golf_calendar_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_calendar_id UUID NOT NULL REFERENCES golf_external_calendars(id) ON DELETE CASCADE,
  sync_started_at TIMESTAMPTZ DEFAULT NOW(),
  sync_completed_at TIMESTAMPTZ,
  sync_status TEXT CHECK (sync_status IN ('in_progress', 'success', 'failed', 'partial')),

  -- Sync statistics
  events_imported INTEGER DEFAULT 0,
  events_exported INTEGER DEFAULT 0,
  events_updated INTEGER DEFAULT 0,
  events_deleted INTEGER DEFAULT 0,
  conflicts_detected INTEGER DEFAULT 0,
  errors_encountered INTEGER DEFAULT 0,

  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conflict Resolution Rules
CREATE TABLE IF NOT EXISTS golf_sync_conflict_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Default conflict resolution strategy
  default_strategy TEXT DEFAULT 'prompt' CHECK (default_strategy IN ('golf_wins', 'external_wins', 'newest_wins', 'prompt')),

  -- Field-specific overrides
  title_strategy TEXT,
  time_strategy TEXT,
  location_strategy TEXT,
  description_strategy TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_external_calendars_user
  ON golf_external_calendars(user_id) WHERE sync_enabled = true;

CREATE INDEX IF NOT EXISTS idx_sync_state_golf_event
  ON golf_calendar_sync_state(golf_event_id);

CREATE INDEX IF NOT EXISTS idx_sync_state_external_event
  ON golf_calendar_sync_state(external_calendar_id, external_event_id);

CREATE INDEX IF NOT EXISTS idx_sync_state_status
  ON golf_calendar_sync_state(sync_status) WHERE sync_status != 'synced';

CREATE INDEX IF NOT EXISTS idx_sync_log_calendar
  ON golf_calendar_sync_log(external_calendar_id, sync_started_at DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to check if an event needs syncing
CREATE OR REPLACE FUNCTION needs_sync(
  p_golf_event_id UUID,
  p_external_calendar_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_sync_state RECORD;
  v_current_hash TEXT;
BEGIN
  -- Calculate current event hash
  SELECT md5(
    COALESCE(title, '') ||
    COALESCE(start_date::TEXT, '') ||
    COALESCE(start_time::TEXT, '') ||
    COALESCE(end_time::TEXT, '') ||
    COALESCE(location, '') ||
    COALESCE(description, '')
  ) INTO v_current_hash
  FROM golf_events
  WHERE id = p_golf_event_id;

  -- Get sync state
  SELECT * INTO v_sync_state
  FROM golf_calendar_sync_state
  WHERE golf_event_id = p_golf_event_id
  AND external_calendar_id = p_external_calendar_id;

  -- Needs sync if:
  -- 1. No sync state exists
  -- 2. Hash has changed
  -- 3. Sync status is not 'synced'
  RETURN (
    v_sync_state IS NULL OR
    v_sync_state.golf_event_hash != v_current_hash OR
    v_sync_state.sync_status != 'synced'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark events for sync after changes
CREATE OR REPLACE FUNCTION mark_event_for_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- Update sync state to pending for all connected external calendars
  UPDATE golf_calendar_sync_state
  SET
    sync_status = 'pending',
    last_modified_source = 'golf',
    updated_at = NOW()
  WHERE golf_event_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get events needing sync
CREATE OR REPLACE FUNCTION get_events_needing_sync(
  p_external_calendar_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  event_id UUID,
  event_title TEXT,
  sync_status TEXT,
  last_modified_source TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    COALESCE(ss.sync_status, 'pending'::TEXT),
    ss.last_modified_source
  FROM golf_events e
  LEFT JOIN golf_calendar_sync_state ss
    ON e.id = ss.golf_event_id
    AND ss.external_calendar_id = p_external_calendar_id
  WHERE
    e.team_id IN (
      SELECT unnest(sync_team_ids)
      FROM golf_external_calendars
      WHERE id = p_external_calendar_id
    )
    AND (
      ss.id IS NULL OR
      ss.sync_status != 'synced' OR
      needs_sync(e.id, p_external_calendar_id)
    )
  ORDER BY e.updated_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to resolve conflicts automatically
CREATE OR REPLACE FUNCTION auto_resolve_conflict(
  p_sync_state_id UUID,
  p_strategy TEXT DEFAULT 'newest_wins'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_sync_state RECORD;
  v_golf_event RECORD;
  v_external_data JSONB;
BEGIN
  -- Get sync state and conflict data
  SELECT * INTO v_sync_state
  FROM golf_calendar_sync_state
  WHERE id = p_sync_state_id;

  IF v_sync_state.sync_status != 'conflict' THEN
    RETURN false;
  END IF;

  -- Get golf event
  SELECT * INTO v_golf_event
  FROM golf_events
  WHERE id = v_sync_state.golf_event_id;

  v_external_data := v_sync_state.conflict_data->'external';

  -- Apply resolution strategy
  CASE p_strategy
    WHEN 'golf_wins' THEN
      -- Mark as synced, external will be overwritten
      UPDATE golf_calendar_sync_state
      SET sync_status = 'pending', last_modified_source = 'golf'
      WHERE id = p_sync_state_id;

    WHEN 'external_wins' THEN
      -- Update golf event with external data
      UPDATE golf_events
      SET
        title = v_external_data->>'title',
        start_date = (v_external_data->>'start_date')::DATE,
        start_time = (v_external_data->>'start_time')::TIME,
        end_time = (v_external_data->>'end_time')::TIME,
        location = v_external_data->>'location',
        description = v_external_data->>'description',
        updated_at = NOW()
      WHERE id = v_sync_state.golf_event_id;

      UPDATE golf_calendar_sync_state
      SET sync_status = 'synced', last_modified_source = 'external'
      WHERE id = p_sync_state_id;

    WHEN 'newest_wins' THEN
      -- Compare timestamps
      IF v_golf_event.updated_at > (v_external_data->>'updated_at')::TIMESTAMPTZ THEN
        -- Golf is newer
        UPDATE golf_calendar_sync_state
        SET sync_status = 'pending', last_modified_source = 'golf'
        WHERE id = p_sync_state_id;
      ELSE
        -- External is newer
        UPDATE golf_events
        SET
          title = v_external_data->>'title',
          start_date = (v_external_data->>'start_date')::DATE,
          updated_at = NOW()
        WHERE id = v_sync_state.golf_event_id;

        UPDATE golf_calendar_sync_state
        SET sync_status = 'synced', last_modified_source = 'external'
        WHERE id = p_sync_state_id;
      END IF;
  END CASE;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-mark events for sync when modified
CREATE TRIGGER golf_events_sync_trigger
  AFTER UPDATE ON golf_events
  FOR EACH ROW
  WHEN (
    OLD.title IS DISTINCT FROM NEW.title OR
    OLD.start_date IS DISTINCT FROM NEW.start_date OR
    OLD.start_time IS DISTINCT FROM NEW.start_time OR
    OLD.end_time IS DISTINCT FROM NEW.end_time OR
    OLD.location IS DISTINCT FROM NEW.location OR
    OLD.description IS DISTINCT FROM NEW.description
  )
  EXECUTE FUNCTION mark_event_for_sync();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE golf_external_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_calendar_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_calendar_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_sync_conflict_rules ENABLE ROW LEVEL SECURITY;

-- External Calendars Policies
CREATE POLICY "Users can view their external calendars"
  ON golf_external_calendars FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their external calendars"
  ON golf_external_calendars FOR ALL
  USING (user_id = auth.uid());

-- Sync State Policies
CREATE POLICY "Users can view their sync state"
  ON golf_calendar_sync_state FOR SELECT
  USING (
    external_calendar_id IN (
      SELECT id FROM golf_external_calendars WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage sync state"
  ON golf_calendar_sync_state FOR ALL
  USING (
    external_calendar_id IN (
      SELECT id FROM golf_external_calendars WHERE user_id = auth.uid()
    )
  );

-- Sync Log Policies
CREATE POLICY "Users can view their sync logs"
  ON golf_calendar_sync_log FOR SELECT
  USING (
    external_calendar_id IN (
      SELECT id FROM golf_external_calendars WHERE user_id = auth.uid()
    )
  );

-- Conflict Rules Policies
CREATE POLICY "Users can manage their conflict rules"
  ON golf_sync_conflict_rules FOR ALL
  USING (user_id = auth.uid());

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for sync status overview
CREATE OR REPLACE VIEW golf_sync_status_overview AS
SELECT
  ec.id AS calendar_id,
  ec.user_id,
  ec.calendar_name,
  ec.calendar_type,
  ec.sync_enabled,
  ec.last_sync_at,
  ec.last_sync_status,
  COUNT(DISTINCT ss.id) AS total_synced_events,
  COUNT(DISTINCT CASE WHEN ss.sync_status = 'conflict' THEN ss.id END) AS conflicts,
  COUNT(DISTINCT CASE WHEN ss.sync_status = 'error' THEN ss.id END) AS errors,
  COUNT(DISTINCT CASE WHEN ss.sync_status = 'pending' THEN ss.id END) AS pending
FROM golf_external_calendars ec
LEFT JOIN golf_calendar_sync_state ss ON ec.id = ss.external_calendar_id
GROUP BY ec.id;

COMMENT ON VIEW golf_sync_status_overview IS
'Overview of sync status for each external calendar connection';
