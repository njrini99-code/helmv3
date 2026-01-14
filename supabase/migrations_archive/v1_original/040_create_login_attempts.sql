-- Create login_attempts table for account lockout tracking
-- Part of BATCH 5: AUTH & API SECURITY FIXES
-- Section 5: Rate Limiting Implementation

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

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);

-- Index for cleanup of old records
CREATE INDEX IF NOT EXISTS idx_login_attempts_last_attempt ON login_attempts(last_attempt);

-- Cleanup old records (older than 7 days with no lockout)
CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM login_attempts
  WHERE last_attempt < NOW() - INTERVAL '7 days'
  AND (locked_until IS NULL OR locked_until < NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE login_attempts IS 'Tracks failed login attempts for account lockout protection';
COMMENT ON COLUMN login_attempts.email IS 'Normalized email address (lowercase, trimmed)';
COMMENT ON COLUMN login_attempts.failed_attempts IS 'Number of consecutive failed attempts';
COMMENT ON COLUMN login_attempts.last_attempt IS 'Timestamp of most recent failed attempt';
COMMENT ON COLUMN login_attempts.last_ip IS 'IP address of last failed attempt (for security logging)';
COMMENT ON COLUMN login_attempts.last_user_agent IS 'User agent of last failed attempt (for security logging)';
COMMENT ON COLUMN login_attempts.locked_until IS 'Account locked until this timestamp (NULL if not locked)';

-- RLS Policies (only service role can access this table)
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- No user access - only server-side code with service role can read/write
CREATE POLICY "Service role only" ON login_attempts
  FOR ALL
  USING (false);
