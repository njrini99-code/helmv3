-- Migration: Add notification preferences to users table
-- Purpose: Enable users to control their email and push notification settings

-- Add notification_preferences column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "email_messages": true,
  "email_pipeline_updates": true,
  "email_event_reminders": true,
  "email_profile_views": false,
  "email_announcements": true,
  "push_messages": false,
  "push_events": false
}'::jsonb;

-- Add index for efficient querying of notification preferences
CREATE INDEX IF NOT EXISTS idx_users_notification_prefs ON users USING gin(notification_preferences);

-- Add comment for documentation
COMMENT ON COLUMN users.notification_preferences IS 'User notification preferences for email and push notifications. Fields: email_messages, email_pipeline_updates, email_event_reminders, email_profile_views, email_announcements, push_messages, push_events';
