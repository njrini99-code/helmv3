-- ============================================================================
-- FIX: Remove infinite recursion in conversation_participants policy
-- ============================================================================
-- The previous policy was checking conversation_participants to determine
-- access to conversation_participants, causing infinite recursion.
--
-- New approach: Users can view participants in conversations they're part of
-- by checking the conversations table directly.
-- ============================================================================

-- Drop the recursive policy
DROP POLICY IF EXISTS "Users can view participations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can view own participation" ON conversation_participants;

-- Create helper function to check if user is in conversation (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.user_is_in_conversation(conv_id uuid, user_id_to_check uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conv_id AND user_id = user_id_to_check
  );
END;
$$;

-- Now create non-recursive policy using the helper function
CREATE POLICY "Users can view participants in their conversations"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (
    public.user_is_in_conversation(conversation_id, auth.uid())
  );

COMMENT ON POLICY "Users can view participants in their conversations" ON conversation_participants IS
  'Users can see all participants in conversations they are part of (using security definer function to avoid recursion)';
