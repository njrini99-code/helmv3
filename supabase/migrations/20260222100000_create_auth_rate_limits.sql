-- ============================================================================
-- Migration: 20260222100000_create_auth_rate_limits.sql
-- Purpose: DB-backed rate limiting for auth endpoints (replaces in-memory Map)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_key ON auth_rate_limits(key);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window_start ON auth_rate_limits(window_start);

-- Cleanup expired entries (run periodically via pg_cron or app-level)
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM auth_rate_limits
  WHERE window_start < NOW() - INTERVAL '2 hours'
  AND (blocked_until IS NULL OR blocked_until < NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE auth_rate_limits IS 'DB-backed rate limiting for auth endpoints. Horizontally scalable across serverless instances.';
COMMENT ON COLUMN auth_rate_limits.key IS 'Rate limit key (e.g., login:email:user@example.com, signup:ip:1.2.3.4)';
COMMENT ON COLUMN auth_rate_limits.count IS 'Number of attempts in current window';
COMMENT ON COLUMN auth_rate_limits.window_start IS 'Start of the current rate limit window';
COMMENT ON COLUMN auth_rate_limits.blocked_until IS 'If set, requests are blocked until this timestamp';
