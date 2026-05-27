-- ============================================================================
-- Migration: 019_login_security.sql
-- Purpose: Login attempts tracking for account lockout
-- Consolidated from: 040_create_login_attempts.sql
-- ============================================================================

-- Login Attempts
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ip TEXT,
  last_user_agent TEXT,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_last_attempt ON login_attempts(last_attempt);

-- Cleanup old records function
CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM login_attempts
  WHERE last_attempt < NOW() - INTERVAL '7 days'
  AND (locked_until IS NULL OR locked_until < NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Documentation
COMMENT ON TABLE login_attempts IS 'Tracks failed login attempts for account lockout protection';
COMMENT ON COLUMN login_attempts.email IS 'Normalized email address (lowercase, trimmed)';
COMMENT ON COLUMN login_attempts.failed_attempts IS 'Number of consecutive failed attempts';
COMMENT ON COLUMN login_attempts.last_attempt IS 'Timestamp of most recent failed attempt';
COMMENT ON COLUMN login_attempts.last_ip IS 'IP address of last failed attempt (for security logging)';
COMMENT ON COLUMN login_attempts.last_user_agent IS 'User agent of last failed attempt (for security logging)';
COMMENT ON COLUMN login_attempts.locked_until IS 'Account locked until this timestamp (NULL if not locked)';
