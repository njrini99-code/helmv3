-- Fix broken coach SELECT policies that reference non-existent columns (gc.team_id, gp.team_id)
-- These policies were created in 034_all_rls_policies.sql but use joins that don't work.
-- The correct approach uses is_golf_team_coach(team_uuid) which already exists and uses
-- the proper path: golf_team_coach_staff -> golf_coaches -> auth.uid()

-- ============================================================
-- 1. golf_rounds: coach can see rounds via round.team_id
-- ============================================================
DROP POLICY IF EXISTS "golf_rounds_select_team" ON golf_rounds;

CREATE POLICY "golf_rounds_select_team"
ON golf_rounds FOR SELECT TO authenticated
USING (
  team_id IS NOT NULL AND is_golf_team_coach(team_id)
);

-- ============================================================
-- 2. golf_holes: coach can see holes via round -> team_id
-- ============================================================
DROP POLICY IF EXISTS "golf_holes_select_team" ON golf_holes;

CREATE POLICY "golf_holes_select_team"
ON golf_holes FOR SELECT TO authenticated
USING (
  round_id IN (
    SELECT gr.id FROM golf_rounds gr
    WHERE gr.team_id IS NOT NULL
      AND is_golf_team_coach(gr.team_id)
  )
);

-- ============================================================
-- 3. golf_shots: coach can see shots via hole -> round -> team_id
-- ============================================================
DROP POLICY IF EXISTS "golf_shots_select_team" ON golf_shots;

CREATE POLICY "golf_shots_select_team"
ON golf_shots FOR SELECT TO authenticated
USING (
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    WHERE gr.team_id IS NOT NULL
      AND is_golf_team_coach(gr.team_id)
  )
);

-- ============================================================
-- 4. golf_player_classes: coach can see player classes via team membership
-- ============================================================
DROP POLICY IF EXISTS "golf_classes_select_coaches" ON golf_player_classes;

CREATE POLICY "golf_classes_select_coaches"
ON golf_player_classes FOR SELECT TO authenticated
USING (
  player_id IN (
    SELECT gtm.player_id FROM golf_team_members gtm
    WHERE gtm.status = 'active'
      AND is_golf_team_coach(gtm.team_id)
  )
);

-- ============================================================
-- 5. golf_round_reviews: coach can see reviews via team membership
-- ============================================================
DROP POLICY IF EXISTS "golf_reviews_select_coach" ON golf_round_reviews;

CREATE POLICY "golf_reviews_select_coach"
ON golf_round_reviews FOR SELECT TO authenticated
USING (
  player_id IN (
    SELECT gtm.player_id FROM golf_team_members gtm
    WHERE gtm.status = 'active'
      AND is_golf_team_coach(gtm.team_id)
  )
);

-- ============================================================
-- 6. golf_player_focus_areas: coach can see focus areas via team membership
-- ============================================================
DROP POLICY IF EXISTS "focus_areas_select_coach" ON golf_player_focus_areas;

CREATE POLICY "focus_areas_select_coach"
ON golf_player_focus_areas FOR SELECT TO authenticated
USING (
  player_id IN (
    SELECT gtm.player_id FROM golf_team_members gtm
    WHERE gtm.status = 'active'
      AND is_golf_team_coach(gtm.team_id)
  )
);

-- ============================================================
-- 7. golf_calendar_notifications: fix coach insert policy
-- ============================================================
DROP POLICY IF EXISTS "golf_calendar_notifications_insert_own" ON golf_calendar_notifications;

CREATE POLICY "golf_calendar_notifications_insert_own"
ON golf_calendar_notifications FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR user_id IN (
    SELECT gp.user_id FROM golf_players gp
    JOIN golf_team_members gtm ON gtm.player_id = gp.id
    WHERE gtm.status = 'active'
      AND is_golf_team_coach(gtm.team_id)
  )
);

-- ============================================================
-- 8. Fix DM privacy: restrict conversation SELECT to participants + team chat only
-- ============================================================
ALTER TABLE golf_conversations ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE;
ALTER TABLE golf_conversations ADD COLUMN IF NOT EXISTS is_team_chat BOOLEAN DEFAULT false;
ALTER TABLE golf_conversations ADD COLUMN IF NOT EXISTS is_team_channel BOOLEAN DEFAULT false;

DROP POLICY IF EXISTS "golf_conversations_select_accessible" ON golf_conversations;

CREATE POLICY "golf_conversations_select_accessible"
ON golf_conversations FOR SELECT TO authenticated
USING (
  -- User is a participant in this conversation
  id IN (
    SELECT conversation_id FROM golf_conversation_participants
    WHERE user_id = auth.uid()
  )
  -- OR it's a team chat/channel and user is on the team
  OR (is_team_chat = true AND (is_golf_team_coach(team_id) OR is_golf_team_player(team_id)))
  OR (is_team_channel = true AND (is_golf_team_coach(team_id) OR is_golf_team_player(team_id)))
);
