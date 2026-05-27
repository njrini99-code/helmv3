-- ============================================================================
-- Migration: 059_golf_attachments_storage_policies.sql
-- Purpose: Add RLS policies for golf-attachments storage bucket
-- Note: The bucket must be created via Supabase Dashboard first!
-- ============================================================================

-- ============================================================================
-- STORAGE BUCKET POLICIES
-- ============================================================================
-- These policies control access to files in the golf-attachments bucket.
-- The bucket should be configured in Supabase Dashboard with:
-- - Name: golf-attachments
-- - Public: false (private)
-- - File size limit: 104857600 (100MB)
-- - Allowed MIME types: image/*, video/*, audio/*, application/pdf, etc.

-- Policy: Users can upload files to their conversation folders
CREATE POLICY "Users can upload attachments to their conversations"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'golf-attachments'
  AND (
    -- Path format: conversations/{conversation_id}/{message_id}/{filename}
    EXISTS (
      SELECT 1 FROM golf_conversation_participants cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversation_id::text = (string_to_array(name, '/'))[2]
    )
  )
);

-- Policy: Users can view files in conversations they participate in
CREATE POLICY "Users can view attachments in their conversations"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'golf-attachments'
  AND (
    EXISTS (
      SELECT 1 FROM golf_conversation_participants cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversation_id::text = (string_to_array(name, '/'))[2]
    )
  )
);

-- Policy: Users can delete their own attachments (via message ownership check)
CREATE POLICY "Users can delete their own attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'golf-attachments'
  AND (
    EXISTS (
      SELECT 1 FROM golf_message_attachments a
      JOIN golf_messages m ON m.id = a.message_id
      WHERE a.storage_path = name
        AND m.sender_id = auth.uid()
    )
  )
);

-- ============================================================================
-- HELPER FUNCTION: Check if user is participant in conversation
-- ============================================================================
CREATE OR REPLACE FUNCTION is_golf_conversation_participant(
  p_user_id UUID,
  p_conversation_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_conversation_participants
    WHERE user_id = p_user_id
      AND conversation_id = p_conversation_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- INSTRUCTIONS FOR BUCKET CREATION (Supabase Dashboard)
-- ============================================================================
/*
To create the storage bucket, go to Supabase Dashboard > Storage and create:

Bucket Name: golf-attachments
Public: OFF (private bucket)
File Size Limit: 104857600 (100MB)

Allowed MIME Types (add all):
- image/jpeg
- image/png
- image/gif
- image/webp
- image/heic
- image/heif
- video/mp4
- video/quicktime
- video/webm
- video/x-msvideo
- video/3gpp
- audio/mpeg
- audio/mp3
- audio/wav
- audio/x-wav
- audio/mp4
- audio/m4a
- audio/x-m4a
- audio/ogg
- audio/webm
- application/pdf
- application/msword
- application/vnd.openxmlformats-officedocument.wordprocessingml.document
- application/vnd.ms-excel
- application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
- application/vnd.ms-powerpoint
- application/vnd.openxmlformats-officedocument.presentationml.presentation
- text/plain
- text/csv

After creating the bucket, the RLS policies above will be applied.
*/
