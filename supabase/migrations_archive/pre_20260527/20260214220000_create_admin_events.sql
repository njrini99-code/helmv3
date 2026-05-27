-- ============================================================================
-- Migration: 20260214220000_create_admin_events.sql
-- Purpose: Admin events table for real-time event streaming and error tracking
-- ============================================================================

-- Create enum for event severity if it doesn't exist
DO $$ BEGIN
  CREATE TYPE admin_event_severity AS ENUM ('info', 'warning', 'error', 'critical');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- ADMIN EVENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event classification
  event_type TEXT NOT NULL, -- 'error', 'signup', 'round_submitted', 'ai_generation', 'login', 'feature_use', etc.
  severity admin_event_severity NOT NULL DEFAULT 'info',
  
  -- Event details
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- User context
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT,
  
  -- Error context
  url TEXT,
  stack_trace TEXT,
  browser_info JSONB,
  
  -- Resolution tracking
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Fast lookups by event type
CREATE INDEX idx_admin_events_type ON admin_events(event_type);

-- Fast lookups by severity (for filtering critical/error events)
CREATE INDEX idx_admin_events_severity ON admin_events(severity);

-- Time-based queries (most recent first, common dashboard pattern)
CREATE INDEX idx_admin_events_created ON admin_events(created_at DESC);

-- User-specific event lookup
CREATE INDEX idx_admin_events_user ON admin_events(user_id) WHERE user_id IS NOT NULL;

-- Unresolved filter (for alert dashboards)
CREATE INDEX idx_admin_events_unresolved ON admin_events(resolved, severity, created_at DESC) 
  WHERE NOT resolved;

-- Composite index for common dashboard queries (type + severity + time)
CREATE INDEX idx_admin_events_dashboard ON admin_events(event_type, severity, created_at DESC);

-- ============================================================================
-- ENABLE SUPABASE REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE admin_events;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE admin_events ENABLE ROW LEVEL SECURITY;

-- Admins can read all admin events
CREATE POLICY "Admins can read admin_events"
  ON admin_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Service role can insert (for server-side logging)
CREATE POLICY "Service role can insert admin_events"
  ON admin_events FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can do everything (for management)
CREATE POLICY "Service role can manage admin_events"
  ON admin_events FOR ALL
  TO service_role
  USING (true);

-- Admins can update (to mark resolved)
CREATE POLICY "Admins can update admin_events"
  ON admin_events FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Log an admin event (callable from server actions)
CREATE OR REPLACE FUNCTION log_admin_event(
  p_event_type TEXT,
  p_title TEXT,
  p_severity admin_event_severity DEFAULT 'info',
  p_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_user_id UUID DEFAULT NULL,
  p_user_email TEXT DEFAULT NULL,
  p_url TEXT DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_browser_info JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO admin_events (
    event_type,
    severity,
    title,
    message,
    metadata,
    user_id,
    user_email,
    url,
    stack_trace,
    browser_info
  ) VALUES (
    p_event_type,
    p_severity,
    p_title,
    p_message,
    p_metadata,
    p_user_id,
    p_user_email,
    p_url,
    p_stack_trace,
    p_browser_info
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION log_admin_event(TEXT, TEXT, admin_event_severity, TEXT, JSONB, UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- Get admin event summary (for dashboard cards)
CREATE OR REPLACE FUNCTION get_admin_event_summary(p_days_back INTEGER DEFAULT 7)
RETURNS TABLE (
  total_events BIGINT,
  error_count BIGINT,
  critical_count BIGINT,
  unresolved_count BIGINT,
  events_by_type JSONB,
  events_by_severity JSONB,
  events_by_day JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH 
    date_range AS (
      SELECT NOW() - (p_days_back || ' days')::INTERVAL AS start_date
    ),
    events_in_range AS (
      SELECT * FROM admin_events 
      WHERE created_at >= (SELECT start_date FROM date_range)
    ),
    by_type AS (
      SELECT jsonb_object_agg(event_type, cnt) AS data
      FROM (
        SELECT event_type, COUNT(*)::INTEGER AS cnt
        FROM events_in_range
        GROUP BY event_type
      ) t
    ),
    by_severity AS (
      SELECT jsonb_object_agg(severity::TEXT, cnt) AS data
      FROM (
        SELECT severity, COUNT(*)::INTEGER AS cnt
        FROM events_in_range
        GROUP BY severity
      ) s
    ),
    by_day AS (
      SELECT jsonb_agg(jsonb_build_object('date', day, 'count', cnt) ORDER BY day) AS data
      FROM (
        SELECT DATE(created_at) AS day, COUNT(*)::INTEGER AS cnt
        FROM events_in_range
        GROUP BY DATE(created_at)
      ) d
    )
  SELECT
    (SELECT COUNT(*) FROM events_in_range)::BIGINT,
    (SELECT COUNT(*) FROM events_in_range WHERE severity = 'error')::BIGINT,
    (SELECT COUNT(*) FROM events_in_range WHERE severity = 'critical')::BIGINT,
    (SELECT COUNT(*) FROM events_in_range WHERE NOT resolved)::BIGINT,
    COALESCE((SELECT data FROM by_type), '{}'::JSONB),
    COALESCE((SELECT data FROM by_severity), '{}'::JSONB),
    COALESCE((SELECT data FROM by_day), '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_admin_event_summary(INTEGER) TO authenticated;

-- Mark event as resolved
CREATE OR REPLACE FUNCTION resolve_admin_event(
  p_event_id UUID,
  p_resolved_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE admin_events
  SET 
    resolved = TRUE,
    resolved_at = NOW(),
    resolved_by = COALESCE(p_resolved_by, auth.uid())
  WHERE id = p_event_id
    AND NOT resolved;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION resolve_admin_event(UUID, UUID) TO authenticated;

-- Bulk resolve events by type
CREATE OR REPLACE FUNCTION resolve_admin_events_by_type(
  p_event_type TEXT,
  p_resolved_by UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE admin_events
    SET 
      resolved = TRUE,
      resolved_at = NOW(),
      resolved_by = COALESCE(p_resolved_by, auth.uid())
    WHERE event_type = p_event_type
      AND NOT resolved
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION resolve_admin_events_by_type(TEXT, UUID) TO authenticated;

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE admin_events IS 'Real-time event stream for admin dashboard - errors, signups, AI generations, etc.';
COMMENT ON COLUMN admin_events.event_type IS 'Event category: error, signup, round_submitted, ai_generation, login, feature_use, etc.';
COMMENT ON COLUMN admin_events.severity IS 'Event severity level for filtering and alerting';
COMMENT ON COLUMN admin_events.title IS 'Short, human-readable event title';
COMMENT ON COLUMN admin_events.message IS 'Detailed event description';
COMMENT ON COLUMN admin_events.metadata IS 'Additional structured data about the event';
COMMENT ON COLUMN admin_events.browser_info IS 'Client browser/device info for debugging';
COMMENT ON COLUMN admin_events.resolved IS 'Whether this event has been acknowledged/resolved by an admin';
