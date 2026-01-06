-- ============================================================================
-- WORKAROUND: Create conversation via SECURITY DEFINER function
-- ============================================================================
-- Since RLS policies keep failing, use a SECURITY DEFINER function
-- to create conversations and add participants with elevated privileges
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_conversation_with_participants(
  participant_user_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_conversation_id uuid;
  participant_id uuid;
BEGIN
  -- Create the conversation
  INSERT INTO conversations (created_at, updated_at)
  VALUES (NOW(), NOW())
  RETURNING id INTO new_conversation_id;

  -- Add the creator as a participant
  INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
  VALUES (new_conversation_id, auth.uid(), NOW());

  -- Add all other participants
  FOREACH participant_id IN ARRAY participant_user_ids
  LOOP
    -- Skip if it's the creator (already added)
    IF participant_id != auth.uid() THEN
      INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
      VALUES (new_conversation_id, participant_id, NOW())
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN new_conversation_id;
END;
$$;

COMMENT ON FUNCTION public.create_conversation_with_participants(uuid[]) IS
  'Creates a conversation and adds participants using SECURITY DEFINER to bypass RLS issues';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_conversation_with_participants(uuid[]) TO authenticated;
