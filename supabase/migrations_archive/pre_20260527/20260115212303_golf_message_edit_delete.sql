-- ============================================================================
-- Migration: 049_golf_message_edit_delete.sql
-- Purpose: Add edit and delete support for golf messages
-- ============================================================================

-- Add edited_at and is_deleted columns to golf_messages
ALTER TABLE golf_messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Add index for filtering out deleted messages efficiently
CREATE INDEX IF NOT EXISTS idx_golf_messages_is_deleted ON golf_messages(is_deleted);

-- Update RLS policies to filter out deleted messages by default
-- Note: The existing select policy should handle this, we just need to ensure
-- users can update their own messages

-- Policy: Allow users to update their own messages (edit/delete)
DROP POLICY IF EXISTS "Users can update own messages" ON golf_messages;
CREATE POLICY "Users can update own messages"
  ON golf_messages FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- Documentation
COMMENT ON COLUMN golf_messages.edited_at IS 'Timestamp when message was last edited, NULL if never edited';
COMMENT ON COLUMN golf_messages.is_deleted IS 'Soft delete flag, TRUE if message was deleted by sender';
