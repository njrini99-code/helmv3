-- ============================================================================
-- Migration: 058_golf_message_attachments.sql
-- Purpose: Add file and video attachment support for golf messaging
-- ============================================================================

-- ============================================================================
-- PART 1: GOLF MESSAGE ATTACHMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES golf_messages(id) ON DELETE CASCADE,

  -- File information
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'image', 'video', 'document', 'audio'
  mime_type TEXT NOT NULL, -- e.g., 'image/jpeg', 'video/mp4', 'application/pdf'
  file_size INTEGER NOT NULL, -- in bytes

  -- Storage
  storage_path TEXT NOT NULL, -- path in Supabase storage
  url TEXT, -- signed URL (cached, may expire)
  thumbnail_url TEXT, -- for images/videos, a smaller preview

  -- Metadata
  width INTEGER, -- for images/videos
  height INTEGER, -- for images/videos
  duration_seconds INTEGER, -- for videos/audio

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_golf_message_attachments_message
  ON golf_message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_golf_message_attachments_file_type
  ON golf_message_attachments(file_type);
CREATE INDEX IF NOT EXISTS idx_golf_message_attachments_created
  ON golf_message_attachments(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_golf_message_attachments_updated_at
  BEFORE UPDATE ON golf_message_attachments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- PART 2: RLS POLICIES FOR ATTACHMENTS
-- ============================================================================

ALTER TABLE golf_message_attachments ENABLE ROW LEVEL SECURITY;

-- Users can view attachments in messages they can see
CREATE POLICY "Users can view attachments in their conversations"
  ON golf_message_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_messages m
      JOIN golf_conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = golf_message_attachments.message_id
        AND cp.user_id = auth.uid()
    )
  );

-- Users can insert attachments for their own messages
CREATE POLICY "Users can add attachments to their own messages"
  ON golf_message_attachments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM golf_messages m
      WHERE m.id = golf_message_attachments.message_id
        AND m.sender_id = auth.uid()
    )
  );

-- Users can delete their own attachments
CREATE POLICY "Users can delete their own attachments"
  ON golf_message_attachments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_messages m
      WHERE m.id = golf_message_attachments.message_id
        AND m.sender_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 3: UPDATE GOLF_MESSAGES TO SUPPORT ATTACHMENTS
-- ============================================================================

-- Add has_attachments flag for quick filtering
ALTER TABLE golf_messages
  ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN DEFAULT FALSE;

-- Index for filtering messages with attachments
CREATE INDEX IF NOT EXISTS idx_golf_messages_has_attachments
  ON golf_messages(conversation_id, has_attachments)
  WHERE has_attachments = TRUE;

-- ============================================================================
-- PART 4: STORAGE BUCKET SETUP (Run in Supabase Dashboard)
-- Note: Bucket creation cannot be done via SQL migrations.
-- Execute this in the Supabase Dashboard Storage section:
--
-- Bucket name: golf-attachments
-- Public: false (private, requires signed URLs)
-- File size limit: 52428800 (50MB)
-- Allowed MIME types:
--   - image/jpeg, image/png, image/gif, image/webp
--   - video/mp4, video/quicktime, video/webm
--   - application/pdf
--   - application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document
--   - application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
-- ============================================================================

-- ============================================================================
-- PART 5: HELPFUL FUNCTION FOR GETTING ATTACHMENTS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_golf_message_attachments(p_message_id UUID)
RETURNS TABLE (
  id UUID,
  file_name TEXT,
  file_type TEXT,
  mime_type TEXT,
  file_size INTEGER,
  storage_path TEXT,
  thumbnail_url TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.file_name,
    a.file_type,
    a.mime_type,
    a.file_size,
    a.storage_path,
    a.thumbnail_url,
    a.width,
    a.height,
    a.duration_seconds,
    a.created_at
  FROM golf_message_attachments a
  WHERE a.message_id = p_message_id
  ORDER BY a.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 6: FUNCTION TO UPDATE MESSAGES has_attachments FLAG
-- ============================================================================

CREATE OR REPLACE FUNCTION update_message_has_attachments()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE golf_messages
    SET has_attachments = TRUE
    WHERE id = NEW.message_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Check if any attachments remain
    IF NOT EXISTS (
      SELECT 1 FROM golf_message_attachments
      WHERE message_id = OLD.message_id
    ) THEN
      UPDATE golf_messages
      SET has_attachments = FALSE
      WHERE id = OLD.message_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_message_has_attachments
  AFTER INSERT OR DELETE ON golf_message_attachments
  FOR EACH ROW EXECUTE FUNCTION update_message_has_attachments();

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON TABLE golf_message_attachments IS 'File and video attachments for golf messages';
COMMENT ON COLUMN golf_message_attachments.file_type IS 'Category: image, video, document, audio';
COMMENT ON COLUMN golf_message_attachments.mime_type IS 'MIME type like image/jpeg, video/mp4';
COMMENT ON COLUMN golf_message_attachments.storage_path IS 'Path in Supabase storage bucket';
COMMENT ON COLUMN golf_message_attachments.thumbnail_url IS 'Thumbnail preview URL for images/videos';
