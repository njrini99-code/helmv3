-- ============================================================================
-- Migration: 20260205100000_add_user_presence.sql
-- Purpose: Add last_seen tracking for online presence indicators
-- ============================================================================

-- Add last_seen column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- Create an index for efficient presence queries
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen) WHERE last_seen IS NOT NULL;

-- Function to update user's last_seen timestamp
CREATE OR REPLACE FUNCTION update_user_presence(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE users SET last_seen = NOW() WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION update_user_presence(UUID) TO authenticated;

-- RPC function that can be called from the client
CREATE OR REPLACE FUNCTION heartbeat()
RETURNS VOID AS $$
BEGIN
  UPDATE users SET last_seen = NOW() WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION heartbeat() TO authenticated;
