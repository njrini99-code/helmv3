-- Baseball notifications table
-- Stores in-app notifications for baseball users (messages, events, recruiting activity, etc.)
-- Note: Uses baseball_ prefix consistent with all other baseball tables in this schema.

CREATE TABLE IF NOT EXISTS baseball_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE baseball_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "baseball_notifications_select" ON baseball_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "baseball_notifications_insert" ON baseball_notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "baseball_notifications_update" ON baseball_notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_baseball_notifications_user_unread
  ON baseball_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
