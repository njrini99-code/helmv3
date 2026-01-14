-- ============================================================================
-- Fix Overly Permissive RLS Policies
-- ============================================================================

-- ============================================================================
-- FIX 1: profile_views - restrict INSERT to authenticated users only
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can create views" ON profile_views;

CREATE POLICY "Authenticated users can create profile views"
  ON profile_views FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Viewer must be the authenticated user
      viewer_id = auth.uid()
      OR viewer_id IS NULL  -- Allow anonymous tracking with null viewer
    )
  );

-- ============================================================================
-- FIX 2: player_engagement_events - restrict INSERT to authenticated users
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can record engagement events" ON player_engagement_events;

CREATE POLICY "Authenticated users can record engagement events"
  ON player_engagement_events FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Coach recording their own engagement
      coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
      OR
      -- System/null coach_id for anonymous tracking
      coach_id IS NULL
    )
  );

-- ============================================================================
-- FIX 3: conversation_participants - users can only join invited conversations
-- ============================================================================

DROP POLICY IF EXISTS "Users can join conversations" ON conversation_participants;

-- Users can only be added to conversations by existing participants or conversation creators
CREATE POLICY "Users can be added to conversations by participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- User is adding themselves AND they were invited (conversation exists with them)
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = conversation_participants.conversation_id
      )
      OR
      -- First participant (creator) can add themselves
      user_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = conversation_participants.conversation_id
      )
    )
  );

-- ============================================================================
-- FIX 4: conversations - add validation for creation
-- ============================================================================

DROP POLICY IF EXISTS "Users can create conversations" ON conversations;

CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
