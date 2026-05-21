-- ============================================================================
-- Migration 044: Fix Messaging RLS Policies
-- ============================================================================
-- Issues Fixed:
-- 1. golf_participants_insert_own prevented adding other users to conversations
-- 2. Missing UPDATE policies for last_read_at and read columns
-- 3. Same issues existed for baseball messaging tables
-- ============================================================================

-- ============================================================================
-- PART 1: FIX GOLF CONVERSATION PARTICIPANTS RLS
-- ============================================================================

-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "golf_participants_insert_own" ON golf_conversation_participants;

-- New policy: Allow inserting participants if:
-- 1. User is adding themselves, OR
-- 2. User created the conversation (they can add others)
CREATE POLICY "golf_participants_insert_by_creator"
ON golf_conversation_participants FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()::uuid
  OR EXISTS (
    SELECT 1 FROM golf_conversations
    WHERE id = conversation_id
    AND created_by = auth.uid()::uuid
  )
);

-- Add UPDATE policy for participants (for last_read_at)
DROP POLICY IF EXISTS "golf_participants_update_own" ON golf_conversation_participants;
CREATE POLICY "golf_participants_update_own"
ON golf_conversation_participants FOR UPDATE TO authenticated
USING (user_id = auth.uid()::uuid)
WITH CHECK (user_id = auth.uid()::uuid);

-- Fix SELECT policy to see all participants in conversations user is part of
DROP POLICY IF EXISTS "golf_participants_select_own" ON golf_conversation_participants;
CREATE POLICY "golf_participants_select_in_conversation"
ON golf_conversation_participants FOR SELECT TO authenticated
USING (
  conversation_id IN (
    SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid()::uuid
  )
);

-- ============================================================================
-- PART 2: FIX GOLF MESSAGES RLS
-- ============================================================================

-- Add UPDATE policy for messages (for read status)
DROP POLICY IF EXISTS "golf_messages_update_read" ON golf_messages;
CREATE POLICY "golf_messages_update_read"
ON golf_messages FOR UPDATE TO authenticated
USING (
  -- User must be a participant in the conversation
  conversation_id IN (SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid()::uuid)
)
WITH CHECK (
  -- User must be a participant in the conversation
  conversation_id IN (SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid()::uuid)
);

-- ============================================================================
-- PART 3: FIX BASEBALL CONVERSATION PARTICIPANTS RLS
-- ============================================================================

-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "baseball_participants_insert_own" ON baseball_conversation_participants;

-- New policy: Allow inserting participants if:
-- 1. User is adding themselves, OR
-- 2. User created the conversation (they can add others)
CREATE POLICY "baseball_participants_insert_by_creator"
ON baseball_conversation_participants FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()::uuid
  OR EXISTS (
    SELECT 1 FROM baseball_conversations
    WHERE id = conversation_id
    AND created_by = auth.uid()::uuid
  )
);

-- Add UPDATE policy for participants (for last_read_at)
DROP POLICY IF EXISTS "baseball_participants_update_own" ON baseball_conversation_participants;
CREATE POLICY "baseball_participants_update_own"
ON baseball_conversation_participants FOR UPDATE TO authenticated
USING (user_id = auth.uid()::uuid)
WITH CHECK (user_id = auth.uid()::uuid);

-- Fix SELECT policy to see all participants in conversations user is part of
DROP POLICY IF EXISTS "baseball_participants_select_own" ON baseball_conversation_participants;
CREATE POLICY "baseball_participants_select_in_conversation"
ON baseball_conversation_participants FOR SELECT TO authenticated
USING (
  conversation_id IN (
    SELECT conversation_id FROM baseball_conversation_participants WHERE user_id = auth.uid()::uuid
  )
);

-- ============================================================================
-- PART 4: FIX BASEBALL MESSAGES RLS
-- ============================================================================

-- Add UPDATE policy for messages (for read status)
DROP POLICY IF EXISTS "baseball_messages_update_read" ON baseball_messages;
CREATE POLICY "baseball_messages_update_read"
ON baseball_messages FOR UPDATE TO authenticated
USING (
  -- User must be a participant in the conversation
  conversation_id IN (SELECT conversation_id FROM baseball_conversation_participants WHERE user_id = auth.uid()::uuid)
)
WITH CHECK (
  -- User must be a participant in the conversation
  conversation_id IN (SELECT conversation_id FROM baseball_conversation_participants WHERE user_id = auth.uid()::uuid)
);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON POLICY "golf_participants_insert_by_creator" ON golf_conversation_participants IS
  'Allow users to add themselves or add others if they created the conversation';
COMMENT ON POLICY "golf_participants_update_own" ON golf_conversation_participants IS
  'Allow users to update their own participant record (last_read_at)';
COMMENT ON POLICY "golf_participants_select_in_conversation" ON golf_conversation_participants IS
  'Allow users to see all participants in conversations they are part of';
COMMENT ON POLICY "golf_messages_update_read" ON golf_messages IS
  'Allow participants to update read status on messages in their conversations';
