-- ============================================================================
-- Migration 068: Add notification_preferences column to users table
-- Purpose: Allow users to customize their notification preferences
-- Reference: src/lib/notifications/email.ts - getUserNotificationPreferences()
-- ============================================================================

-- ============================================================================
-- 1. Add notification_preferences JSONB column to users table
-- ============================================================================

-- Add the notification_preferences column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "email_messages": true,
  "email_pipeline_updates": true,
  "email_event_reminders": true,
  "email_profile_views": false,
  "email_announcements": true,
  "push_enabled": true,
  "push_messages": true,
  "push_events": true,
  "digest_frequency": "daily"
}'::jsonb;

COMMENT ON COLUMN users.notification_preferences IS 'User notification preferences for email and push notifications';

-- ============================================================================
-- 2. Create index for efficient querying of notification preferences
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_notification_prefs_email_messages
ON users ((notification_preferences->>'email_messages'))
WHERE notification_preferences->>'email_messages' = 'true';

-- ============================================================================
-- 3. Update existing users to have default preferences if NULL
-- ============================================================================

UPDATE users
SET notification_preferences = '{
  "email_messages": true,
  "email_pipeline_updates": true,
  "email_event_reminders": true,
  "email_profile_views": false,
  "email_announcements": true,
  "push_enabled": true,
  "push_messages": true,
  "push_events": true,
  "digest_frequency": "daily"
}'::jsonb
WHERE notification_preferences IS NULL;

-- ============================================================================
-- 4. Add validation trigger for notification_preferences
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure notification_preferences is always a valid JSONB object
  IF NEW.notification_preferences IS NOT NULL THEN
    -- Validate required keys exist with defaults
    NEW.notification_preferences = jsonb_build_object(
      'email_messages', COALESCE((NEW.notification_preferences->>'email_messages')::boolean, true),
      'email_pipeline_updates', COALESCE((NEW.notification_preferences->>'email_pipeline_updates')::boolean, true),
      'email_event_reminders', COALESCE((NEW.notification_preferences->>'email_event_reminders')::boolean, true),
      'email_profile_views', COALESCE((NEW.notification_preferences->>'email_profile_views')::boolean, false),
      'email_announcements', COALESCE((NEW.notification_preferences->>'email_announcements')::boolean, true),
      'push_enabled', COALESCE((NEW.notification_preferences->>'push_enabled')::boolean, true),
      'push_messages', COALESCE((NEW.notification_preferences->>'push_messages')::boolean, true),
      'push_events', COALESCE((NEW.notification_preferences->>'push_events')::boolean, true),
      'digest_frequency', COALESCE(NEW.notification_preferences->>'digest_frequency', 'daily')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_notification_preferences_trigger ON users;
CREATE TRIGGER validate_notification_preferences_trigger
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION validate_notification_preferences();

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON FUNCTION validate_notification_preferences() IS 'Validates and normalizes notification_preferences JSONB column on users table';
