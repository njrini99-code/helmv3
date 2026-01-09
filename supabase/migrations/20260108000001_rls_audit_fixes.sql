-- ============================================================================
-- RLS AUDIT FIXES
-- Migration: 20260108000001_rls_audit_fixes.sql
-- Date: 2026-01-08
-- Purpose: Fix critical RLS issues identified in security audit
-- ============================================================================

-- ============================================================================
-- PART 1: RE-ENABLE RLS ON conversation_participants
-- ============================================================================
-- Migration 078 disabled RLS on this table which exposes all participant data
-- We need proper policies that don't cause infinite recursion

-- Enable RLS
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies first (clean slate)
DO $$
DECLARE
  policy_rec RECORD;
BEGIN
  FOR policy_rec IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversation_participants'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON conversation_participants', policy_rec.policyname);
  END LOOP;
END $$;

-- Create simple, non-recursive policies
-- Policy: Users can SELECT their own participation records
CREATE POLICY "conversation_participants_select_own"
ON conversation_participants FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Users can INSERT themselves as participants (used by the function)
-- Note: The SECURITY DEFINER function handles most inserts
CREATE POLICY "conversation_participants_insert_own"
ON conversation_participants FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Policy: Users can UPDATE their own records (e.g., last_read_at)
CREATE POLICY "conversation_participants_update_own"
ON conversation_participants FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy: Users can DELETE their own participation (leave conversation)
CREATE POLICY "conversation_participants_delete_own"
ON conversation_participants FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- PART 2: HARDEN create_conversation_with_participants FUNCTION
-- ============================================================================
-- The existing function lacks validation that participant_user_ids exist
-- and doesn't enforce tenant isolation

-- Drop existing function overloads
DROP FUNCTION IF EXISTS public.create_conversation_with_participants(uuid[]);
DROP FUNCTION IF EXISTS public.create_conversation_with_participants(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.create_conversation_with_participants(uuid[], text);

-- Create hardened version with proper validation
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
  current_user_id uuid;
  valid_participant_count integer;
BEGIN
  -- Get the current authenticated user
  current_user_id := auth.uid();

  -- Validate caller is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create conversations';
  END IF;

  -- Validate that at least one participant is provided
  IF participant_user_ids IS NULL OR array_length(participant_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one participant must be provided';
  END IF;

  -- Validate all participant_user_ids exist in the users table
  SELECT COUNT(*) INTO valid_participant_count
  FROM users
  WHERE id = ANY(participant_user_ids);

  IF valid_participant_count != array_length(participant_user_ids, 1) THEN
    RAISE EXCEPTION 'One or more participant IDs do not exist';
  END IF;

  -- Create the conversation with creator tracking
  INSERT INTO conversations (created_at, updated_at, creator_id)
  VALUES (NOW(), NOW(), current_user_id)
  RETURNING id INTO new_conversation_id;

  -- Add the creator as a participant
  INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
  VALUES (new_conversation_id, current_user_id, NOW());

  -- Add all other participants
  FOREACH participant_id IN ARRAY participant_user_ids
  LOOP
    -- Skip if it's the creator (already added)
    IF participant_id != current_user_id THEN
      INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
      VALUES (new_conversation_id, participant_id, NOW())
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN new_conversation_id;
END;
$$;

COMMENT ON FUNCTION public.create_conversation_with_participants(uuid[]) IS
  'Creates a conversation with validated participants. Requires authentication.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_conversation_with_participants(uuid[]) TO authenticated;

-- ============================================================================
-- PART 3: CREATE putt_details TABLE WITH RLS
-- ============================================================================
-- This table is accessed by /api/golf/putts route but doesn't exist in migrations

-- Create the putt_details table
CREATE TABLE IF NOT EXISTS putt_details (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shot_id uuid NOT NULL REFERENCES golf_shots(id) ON DELETE CASCADE,
  miss_tags text[] DEFAULT '{}',
  break_direction text CHECK (break_direction IN ('left_to_right', 'right_to_left', 'straight')),
  estimated_break_inches integer CHECK (estimated_break_inches >= 0 AND estimated_break_inches <= 36),
  distance_feet numeric CHECK (distance_feet >= 0 AND distance_feet <= 100),
  made boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  CONSTRAINT putt_details_shot_id_unique UNIQUE (shot_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_putt_details_shot_id ON putt_details(shot_id);

-- Enable RLS
ALTER TABLE putt_details ENABLE ROW LEVEL SECURITY;

-- Create helper function to check if user owns a shot via round -> player
CREATE OR REPLACE FUNCTION public.user_owns_shot(shot_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM golf_shots gs
    JOIN golf_rounds gr ON gs.round_id = gr.id
    JOIN golf_players gp ON gr.player_id = gp.id
    WHERE gs.id = shot_uuid
      AND gp.user_id = auth.uid()
  );
$$;

-- Policy: Players can view their own putt details
DROP POLICY IF EXISTS "putt_details_select_own" ON putt_details;
CREATE POLICY "putt_details_select_own"
ON putt_details FOR SELECT
TO authenticated
USING (public.user_owns_shot(shot_id));

-- Policy: Players can insert their own putt details
DROP POLICY IF EXISTS "putt_details_insert_own" ON putt_details;
CREATE POLICY "putt_details_insert_own"
ON putt_details FOR INSERT
TO authenticated
WITH CHECK (public.user_owns_shot(shot_id));

-- Policy: Players can update their own putt details
DROP POLICY IF EXISTS "putt_details_update_own" ON putt_details;
CREATE POLICY "putt_details_update_own"
ON putt_details FOR UPDATE
TO authenticated
USING (public.user_owns_shot(shot_id))
WITH CHECK (public.user_owns_shot(shot_id));

-- Policy: Players can delete their own putt details
DROP POLICY IF EXISTS "putt_details_delete_own" ON putt_details;
CREATE POLICY "putt_details_delete_own"
ON putt_details FOR DELETE
TO authenticated
USING (public.user_owns_shot(shot_id));

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON putt_details TO authenticated;

-- ============================================================================
-- PART 4: ADD RECOMMENDED DATABASE INDEXES
-- ============================================================================
-- These indexes improve query performance for common access patterns

-- conversation_participants indexes (if not exist)
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id
ON conversation_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id
ON conversation_participants(conversation_id);

-- messages indexes for faster conversation queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
ON messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id
ON messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_messages_sent_at
ON messages(sent_at DESC);

-- golf_rounds indexes for player queries
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_id
ON golf_rounds(player_id);

CREATE INDEX IF NOT EXISTS idx_golf_rounds_created_at
ON golf_rounds(created_at DESC);

-- golf_shots indexes for round queries
CREATE INDEX IF NOT EXISTS idx_golf_shots_round_id
ON golf_shots(round_id);

CREATE INDEX IF NOT EXISTS idx_golf_shots_hole_number
ON golf_shots(hole_number);

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  rls_enabled_cp boolean;
  rls_enabled_pd boolean;
  policy_count_cp integer;
  policy_count_pd integer;
BEGIN
  -- Check conversation_participants RLS
  SELECT relrowsecurity INTO rls_enabled_cp
  FROM pg_class
  WHERE relname = 'conversation_participants'
    AND relnamespace = 'public'::regnamespace;

  SELECT COUNT(*) INTO policy_count_cp
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'conversation_participants';

  -- Check putt_details RLS
  SELECT relrowsecurity INTO rls_enabled_pd
  FROM pg_class
  WHERE relname = 'putt_details'
    AND relnamespace = 'public'::regnamespace;

  SELECT COUNT(*) INTO policy_count_pd
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'putt_details';

  -- Report results
  RAISE NOTICE '=== RLS AUDIT FIX VERIFICATION ===';
  RAISE NOTICE 'conversation_participants: RLS=%, Policies=%', rls_enabled_cp, policy_count_cp;
  RAISE NOTICE 'putt_details: RLS=%, Policies=%', rls_enabled_pd, policy_count_pd;

  IF NOT rls_enabled_cp THEN
    RAISE WARNING 'FAILED: conversation_participants RLS not enabled';
  END IF;

  IF policy_count_cp < 4 THEN
    RAISE WARNING 'FAILED: conversation_participants has fewer than 4 policies';
  END IF;

  IF NOT rls_enabled_pd THEN
    RAISE WARNING 'FAILED: putt_details RLS not enabled';
  END IF;

  IF policy_count_pd < 4 THEN
    RAISE WARNING 'FAILED: putt_details has fewer than 4 policies';
  END IF;

  RAISE NOTICE '=== VERIFICATION COMPLETE ===';
END $$;
