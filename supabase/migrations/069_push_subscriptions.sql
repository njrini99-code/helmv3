-- Migration: 069_push_subscriptions
-- Description: Create push_subscriptions table for Web Push notifications
-- This table stores browser push notification subscriptions for users

-- Create the push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- The push subscription endpoint URL (unique per browser/device)
    endpoint TEXT NOT NULL,
    -- Expiration time of the subscription (optional, set by browser)
    expiration_time TIMESTAMPTZ,
    -- Keys required for encryption (p256dh and auth)
    keys JSONB NOT NULL,
    -- User agent for debugging/analytics
    user_agent TEXT,
    -- Device/browser identification
    device_name TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Last successful push sent to this subscription
    last_push_at TIMESTAMPTZ,
    -- Count of failed push attempts (for cleanup)
    failed_count INTEGER NOT NULL DEFAULT 0,

    -- Each endpoint should be unique (one subscription per browser per user)
    UNIQUE(endpoint)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
    ON push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
    ON push_subscriptions(endpoint);

-- Index for finding stale/failed subscriptions for cleanup
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_failed
    ON push_subscriptions(failed_count)
    WHERE failed_count > 0;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER push_subscriptions_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_push_subscriptions_updated_at();

-- RLS Policies
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions
CREATE POLICY "Users can view own push subscriptions" ON push_subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create their own subscriptions
CREATE POLICY "Users can create own push subscriptions" ON push_subscriptions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscriptions
CREATE POLICY "Users can update own push subscriptions" ON push_subscriptions
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete own push subscriptions" ON push_subscriptions
    FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can do everything (for server-side push sending)
CREATE POLICY "Service role full access on push_subscriptions" ON push_subscriptions
    FOR ALL
    USING (auth.role() = 'service_role');

-- Add comments for documentation
COMMENT ON TABLE push_subscriptions IS 'Stores Web Push notification subscriptions for users';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'The push service endpoint URL unique to each browser/device';
COMMENT ON COLUMN push_subscriptions.expiration_time IS 'When the subscription expires (if set by browser)';
COMMENT ON COLUMN push_subscriptions.keys IS 'JSON object containing p256dh and auth keys for encryption';
COMMENT ON COLUMN push_subscriptions.user_agent IS 'Browser user agent string for debugging';
COMMENT ON COLUMN push_subscriptions.device_name IS 'Friendly name for the device (e.g., "Chrome on MacBook")';
COMMENT ON COLUMN push_subscriptions.last_push_at IS 'Timestamp of last successful push to this subscription';
COMMENT ON COLUMN push_subscriptions.failed_count IS 'Number of consecutive failed push attempts';
