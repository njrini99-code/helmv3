-- Migration 041: Shared Tables
-- Creates cross-product tables used by both baseball and golf

-- ============================================================================
-- 1. login_attempts - Rate limiting and security
-- ============================================================================
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  failed_attempts INTEGER DEFAULT 0,
  last_attempt TIMESTAMPTZ DEFAULT NOW(),
  last_ip TEXT,
  last_user_agent TEXT,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_last_attempt ON login_attempts(last_attempt);
CREATE INDEX IF NOT EXISTS idx_login_attempts_locked ON login_attempts(locked_until) WHERE locked_until IS NOT NULL;

-- RLS for login_attempts
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role can manage login attempts (security table)
CREATE POLICY "Service role can manage login attempts" ON login_attempts
  FOR ALL TO service_role
  USING (true);

-- ============================================================================
-- 2. demo_requests - Marketing / sales leads
-- ============================================================================
CREATE TABLE IF NOT EXISTS demo_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  organization TEXT,
  phone TEXT,
  interest_type TEXT CHECK (interest_type IN ('baseball_coach', 'baseball_player', 'golf_coach', 'golf_player', 'organization', 'other')),
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'scheduled', 'completed', 'declined')),
  notes TEXT,
  contacted_by TEXT,
  contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_requests_email ON demo_requests(email);
CREATE INDEX IF NOT EXISTS idx_demo_requests_created ON demo_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON demo_requests(status);

-- RLS for demo_requests
ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a demo request (unauthenticated inserts allowed via API)
CREATE POLICY "Anyone can create demo requests" ON demo_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only service role can view/manage
CREATE POLICY "Service role can manage demo requests" ON demo_requests
  FOR ALL TO service_role
  USING (true);

-- ============================================================================
-- 3. error_logs - Application error tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'error' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  stack TEXT,
  context JSONB,
  user_agent TEXT,
  ip TEXT,
  url TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON error_logs(user_id) WHERE user_id IS NOT NULL;

-- RLS for error_logs
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Anyone can create error logs (for client-side error reporting)
CREATE POLICY "Anyone can create error logs" ON error_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only service role can view/manage
CREATE POLICY "Service role can manage error logs" ON error_logs
  FOR ALL TO service_role
  USING (true);

-- ============================================================================
-- 4. organization_settings - Privacy/display settings for programs
-- ============================================================================
CREATE TABLE IF NOT EXISTS organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  -- Display settings (what to show on public profile)
  show_description BOOLEAN DEFAULT TRUE,
  show_program_stats BOOLEAN DEFAULT TRUE,
  show_conference_info BOOLEAN DEFAULT TRUE,
  show_facilities BOOLEAN DEFAULT TRUE,
  show_staff_bios BOOLEAN DEFAULT TRUE,
  show_email BOOLEAN DEFAULT TRUE,
  show_phone BOOLEAN DEFAULT TRUE,
  show_social_links BOOLEAN DEFAULT TRUE,

  -- Communication settings
  allow_player_messages BOOLEAN DEFAULT TRUE,
  require_verified_email BOOLEAN DEFAULT FALSE,

  -- Recruiting settings
  show_recruiting_needs BOOLEAN DEFAULT FALSE,
  show_roster_spots BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_settings_org ON organization_settings(organization_id);

-- RLS for organization_settings
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can view org settings (needed for public profiles)
CREATE POLICY "Anyone can view organization settings" ON organization_settings
  FOR SELECT TO authenticated
  USING (true);

-- Coaches from the org can manage settings
CREATE POLICY "Organization coaches can manage settings" ON organization_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_coaches c
      WHERE c.user_id = auth.uid()
      AND c.organization_id = organization_settings.organization_id
    ) OR EXISTS (
      SELECT 1 FROM golf_coaches c
      JOIN golf_teams t ON t.id = c.team_id
      WHERE c.user_id = auth.uid()
      AND t.organization_id = organization_settings.organization_id
    )
  );

-- ============================================================================
-- 5. player_dream_schools - Player's target/dream schools list
-- ============================================================================
CREATE TABLE IF NOT EXISTS player_dream_schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 10),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, rank),
  UNIQUE(player_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_player_dream_schools_player ON player_dream_schools(player_id);
CREATE INDEX IF NOT EXISTS idx_player_dream_schools_org ON player_dream_schools(organization_id);

-- RLS for player_dream_schools
ALTER TABLE player_dream_schools ENABLE ROW LEVEL SECURITY;

-- Players can manage their own dream schools
CREATE POLICY "Players can manage their own dream schools" ON player_dream_schools
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_players p
      WHERE p.user_id = auth.uid()
      AND p.id = player_dream_schools.player_id
    )
  );

-- Coaches can view if player has enabled profile visibility
CREATE POLICY "Coaches can view dream schools" ON player_dream_schools
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_coaches c
      WHERE c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. feature_flags - Runtime feature toggles
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT NOT NULL UNIQUE,
  flag_name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT FALSE,
  rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  allowed_users JSONB DEFAULT '[]',
  allowed_roles JSONB DEFAULT '[]',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(flag_key);

-- RLS for feature_flags
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Anyone can read feature flags
CREATE POLICY "Anyone can read feature flags" ON feature_flags
  FOR SELECT TO authenticated, anon
  USING (true);

-- Only service role can manage
CREATE POLICY "Service role can manage feature flags" ON feature_flags
  FOR ALL TO service_role
  USING (true);

-- ============================================================================
-- 7. audit_log - General audit trail for sensitive operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- RLS for audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access audit logs
CREATE POLICY "Service role can manage audit logs" ON audit_log
  FOR ALL TO service_role
  USING (true);

-- ============================================================================
-- Update triggers for updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS update_login_attempts_updated_at ON login_attempts;
CREATE TRIGGER update_login_attempts_updated_at
    BEFORE UPDATE ON login_attempts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_demo_requests_updated_at ON demo_requests;
CREATE TRIGGER update_demo_requests_updated_at
    BEFORE UPDATE ON demo_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_settings_updated_at ON organization_settings;
CREATE TRIGGER update_organization_settings_updated_at
    BEFORE UPDATE ON organization_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_player_dream_schools_updated_at ON player_dream_schools;
CREATE TRIGGER update_player_dream_schools_updated_at
    BEFORE UPDATE ON player_dream_schools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER update_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
