-- =====================================================
-- FIX GOLF CALENDAR SCHEMA
-- Add missing enum value and column for class sync
-- =====================================================

-- STEP 1: Add 'class' to golf_event_type enum
ALTER TYPE golf_event_type ADD VALUE IF NOT EXISTS 'class';

-- STEP 2: Add class_id column to golf_events table
ALTER TABLE golf_events
ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES golf_player_classes(id) ON DELETE CASCADE;

-- STEP 3: Add index for better performance
CREATE INDEX IF NOT EXISTS idx_golf_events_class_id ON golf_events(class_id);

-- STEP 4: Fix RLS policies for personal events
DROP POLICY IF EXISTS "Players can create personal events" ON golf_events;

CREATE POLICY "Players can create personal events"
ON golf_events FOR INSERT
WITH CHECK (
  team_id IS NOT NULL  -- Classes sync as TEAM events, not personal
  AND
  team_id IN (
    SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
);

-- STEP 5: Fix SELECT policy to see team events
DROP POLICY IF EXISTS "Team members can view their events" ON golf_events;

CREATE POLICY "Team members can view their events"
ON golf_events FOR SELECT
USING (
  -- Personal events (no team required)
  team_id IS NULL
  OR
  -- Team events (must be on the team as player)
  team_id IN (
    SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
  OR
  -- Team events (must be on the team as coach)
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
  )
);

-- Verification
SELECT
  'golf_event_type enum' as check_item,
  CASE
    WHEN 'class'::text = ANY(enum_range(NULL::golf_event_type)::text[])
    THEN '✅ class value exists'
    ELSE '❌ class value missing'
  END as status;

SELECT
  'golf_events.class_id column' as check_item,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'golf_events'
      AND column_name = 'class_id'
    )
    THEN '✅ class_id column exists'
    ELSE '❌ class_id column missing'
  END as status;
