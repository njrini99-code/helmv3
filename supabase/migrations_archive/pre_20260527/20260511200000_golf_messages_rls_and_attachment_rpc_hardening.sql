-- Hardening migration addressing two security findings from the
-- 52bda11b security scan:
--
--   3. golf_messages_update_v2 only checked conversation membership, letting
--      one participant edit another participant's message via direct PostgREST
--      calls (server action enforced sender_id, but RLS is the real boundary).
--
--   4. get_golf_message_attachments(p_message_id) is SECURITY DEFINER and
--      filtered only by message_id, bypassing the participant check in the
--      table's SELECT policy and leaking attachment metadata (filename, MIME,
--      size, storage path, thumbnail URL, dimensions, timestamps) for any
--      message id.

BEGIN;

-- Finding 3: require sender ownership on golf_messages UPDATE.
DROP POLICY IF EXISTS golf_messages_update_v2 ON public.golf_messages;
CREATE POLICY golf_messages_update_v2 ON public.golf_messages
  AS PERMISSIVE FOR UPDATE TO public
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- Finding 4: re-create the RPC with an explicit participant check, and
-- lock down EXECUTE to authenticated callers only.
CREATE OR REPLACE FUNCTION public.get_golf_message_attachments(p_message_id UUID)
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.golf_messages m
    JOIN public.golf_conversation_participants cp
      ON cp.conversation_id = m.conversation_id
    WHERE m.id = p_message_id
      AND cp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a participant in this conversation'
      USING ERRCODE = '42501';
  END IF;

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
  FROM public.golf_message_attachments a
  WHERE a.message_id = p_message_id
  ORDER BY a.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_golf_message_attachments(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_golf_message_attachments(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_golf_message_attachments(UUID) TO authenticated;

COMMIT;
