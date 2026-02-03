-- ============================================================================
-- Migration: 20260125000000_fix_baseball_rls_comprehensive.sql
-- Purpose: Fix RLS policies for all baseball_* tables after table rename
-- CRITICAL: This migration fixes security vulnerabilities identified in audit
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get current user's coach ID (returns NULL if not a coach)
CREATE OR REPLACE FUNCTION get_my_coach_id()
RETURNS UUID AS $$
  SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Get current user's player ID (returns NULL if not a player)
CREATE OR REPLACE FUNCTION get_my_player_id()
RETURNS UUID AS $$
  SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Check if user is coach of a specific team
CREATE OR REPLACE FUNCTION is_baseball_team_coach(p_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_teams t
    WHERE t.id = p_team_id
    AND (
      t.head_coach_id = get_my_coach_id()
      OR EXISTS (
        SELECT 1 FROM baseball_team_coach_staff tcs
        WHERE tcs.team_id = t.id AND tcs.coach_id = get_my_coach_id()
      )
    )
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Check if user is member of a specific team (as player)
CREATE OR REPLACE FUNCTION is_baseball_team_member(p_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_members tm
    WHERE tm.team_id = p_team_id
    AND tm.player_id = get_my_player_id()
    AND tm.status = 'active'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================================
-- BASEBALL_COACHES
-- ============================================================================
ALTER TABLE baseball_coaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_coaches_select" ON baseball_coaches;
DROP POLICY IF EXISTS "baseball_coaches_insert" ON baseball_coaches;
DROP POLICY IF EXISTS "baseball_coaches_update" ON baseball_coaches;
DROP POLICY IF EXISTS "baseball_coaches_delete" ON baseball_coaches;
-- Drop legacy policies
DROP POLICY IF EXISTS "coaches_select_all" ON baseball_coaches;
DROP POLICY IF EXISTS "coaches_insert_own" ON baseball_coaches;
DROP POLICY IF EXISTS "coaches_update_own" ON baseball_coaches;
DROP POLICY IF EXISTS "coaches_delete_own" ON baseball_coaches;

-- Coaches are publicly readable (for messaging, profile viewing)
CREATE POLICY "baseball_coaches_select" ON baseball_coaches
FOR SELECT TO authenticated
USING (true);

-- Only the user can create their own coach profile
CREATE POLICY "baseball_coaches_insert" ON baseball_coaches
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Only the user can update their own coach profile
CREATE POLICY "baseball_coaches_update" ON baseball_coaches
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Only the user can delete their own coach profile
CREATE POLICY "baseball_coaches_delete" ON baseball_coaches
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- BASEBALL_PLAYERS
-- ============================================================================
ALTER TABLE baseball_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_players_select" ON baseball_players;
DROP POLICY IF EXISTS "baseball_players_insert" ON baseball_players;
DROP POLICY IF EXISTS "baseball_players_update" ON baseball_players;
DROP POLICY IF EXISTS "baseball_players_delete" ON baseball_players;
-- Drop legacy policies
DROP POLICY IF EXISTS "players_select_public_or_own" ON baseball_players;
DROP POLICY IF EXISTS "players_insert_own" ON baseball_players;
DROP POLICY IF EXISTS "players_update_own" ON baseball_players;
DROP POLICY IF EXISTS "players_delete_own" ON baseball_players;

-- Players visible if: own profile, recruiting activated, or on same team
CREATE POLICY "baseball_players_select" ON baseball_players
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()  -- Own profile
  OR recruiting_activated = true  -- Recruiting active (coaches can discover)
  OR id IN (  -- Same team as viewer
    SELECT tm.player_id FROM baseball_team_members tm
    WHERE tm.team_id IN (
      SELECT tm2.team_id FROM baseball_team_members tm2 WHERE tm2.player_id = get_my_player_id()
      UNION
      SELECT t.id FROM baseball_teams t WHERE t.head_coach_id = get_my_coach_id()
      UNION
      SELECT tcs.team_id FROM baseball_team_coach_staff tcs WHERE tcs.coach_id = get_my_coach_id()
    )
  )
);

-- Only the user can create their own player profile
CREATE POLICY "baseball_players_insert" ON baseball_players
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Only the user can update their own player profile
CREATE POLICY "baseball_players_update" ON baseball_players
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Only the user can delete their own player profile
CREATE POLICY "baseball_players_delete" ON baseball_players
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- BASEBALL_WATCHLISTS
-- ============================================================================
ALTER TABLE baseball_watchlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_watchlists_select" ON baseball_watchlists;
DROP POLICY IF EXISTS "baseball_watchlists_insert" ON baseball_watchlists;
DROP POLICY IF EXISTS "baseball_watchlists_update" ON baseball_watchlists;
DROP POLICY IF EXISTS "baseball_watchlists_delete" ON baseball_watchlists;
-- Drop legacy policies
DROP POLICY IF EXISTS "watchlists_all_coach" ON baseball_watchlists;

-- Coaches can only see their own watchlist
CREATE POLICY "baseball_watchlists_select" ON baseball_watchlists
FOR SELECT TO authenticated
USING (coach_id = get_my_coach_id());

-- Coaches can only add to their own watchlist
CREATE POLICY "baseball_watchlists_insert" ON baseball_watchlists
FOR INSERT TO authenticated
WITH CHECK (coach_id = get_my_coach_id());

-- Coaches can only update their own watchlist entries
CREATE POLICY "baseball_watchlists_update" ON baseball_watchlists
FOR UPDATE TO authenticated
USING (coach_id = get_my_coach_id())
WITH CHECK (coach_id = get_my_coach_id());

-- Coaches can only delete from their own watchlist
CREATE POLICY "baseball_watchlists_delete" ON baseball_watchlists
FOR DELETE TO authenticated
USING (coach_id = get_my_coach_id());

-- ============================================================================
-- BASEBALL_VIDEOS
-- ============================================================================
ALTER TABLE baseball_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_videos_select" ON baseball_videos;
DROP POLICY IF EXISTS "baseball_videos_insert" ON baseball_videos;
DROP POLICY IF EXISTS "baseball_videos_update" ON baseball_videos;
DROP POLICY IF EXISTS "baseball_videos_delete" ON baseball_videos;
-- Drop legacy policies
DROP POLICY IF EXISTS "videos_select_public" ON baseball_videos;
DROP POLICY IF EXISTS "videos_insert_own" ON baseball_videos;
DROP POLICY IF EXISTS "videos_update_own" ON baseball_videos;
DROP POLICY IF EXISTS "videos_delete_own" ON baseball_videos;

-- Videos visible if: own video, player has recruiting active, or same team
CREATE POLICY "baseball_videos_select" ON baseball_videos
FOR SELECT TO authenticated
USING (
  player_id = get_my_player_id()  -- Own videos
  OR player_id IN (SELECT id FROM baseball_players WHERE recruiting_activated = true)  -- Recruiting active
  OR player_id IN (  -- Same team
    SELECT tm.player_id FROM baseball_team_members tm
    WHERE is_baseball_team_coach(tm.team_id) OR is_baseball_team_member(tm.team_id)
  )
);

-- Only the player can upload their own videos
CREATE POLICY "baseball_videos_insert" ON baseball_videos
FOR INSERT TO authenticated
WITH CHECK (player_id = get_my_player_id());

-- Only the player can update their own videos
CREATE POLICY "baseball_videos_update" ON baseball_videos
FOR UPDATE TO authenticated
USING (player_id = get_my_player_id())
WITH CHECK (player_id = get_my_player_id());

-- Only the player can delete their own videos
CREATE POLICY "baseball_videos_delete" ON baseball_videos
FOR DELETE TO authenticated
USING (player_id = get_my_player_id());

-- ============================================================================
-- BASEBALL_TEAMS
-- ============================================================================
ALTER TABLE baseball_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_teams_select" ON baseball_teams;
DROP POLICY IF EXISTS "baseball_teams_insert" ON baseball_teams;
DROP POLICY IF EXISTS "baseball_teams_update" ON baseball_teams;
DROP POLICY IF EXISTS "baseball_teams_delete" ON baseball_teams;
-- Drop legacy policies
DROP POLICY IF EXISTS "teams_select_member_or_coach" ON baseball_teams;
DROP POLICY IF EXISTS "teams_insert_coach" ON baseball_teams;
DROP POLICY IF EXISTS "teams_update_coach" ON baseball_teams;
DROP POLICY IF EXISTS "teams_delete_coach" ON baseball_teams;

-- Teams visible to coaches of that team, players on team, and same org coaches
CREATE POLICY "baseball_teams_select" ON baseball_teams
FOR SELECT TO authenticated
USING (
  is_baseball_team_coach(id)
  OR is_baseball_team_member(id)
  OR organization_id IN (
    SELECT organization_id FROM baseball_coaches WHERE id = get_my_coach_id()
  )
);

-- Only organization coaches can create teams
CREATE POLICY "baseball_teams_insert" ON baseball_teams
FOR INSERT TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM baseball_coaches WHERE id = get_my_coach_id()
  )
);

-- Only head coach can update team
CREATE POLICY "baseball_teams_update" ON baseball_teams
FOR UPDATE TO authenticated
USING (head_coach_id = get_my_coach_id())
WITH CHECK (head_coach_id = get_my_coach_id());

-- Only head coach can delete team
CREATE POLICY "baseball_teams_delete" ON baseball_teams
FOR DELETE TO authenticated
USING (head_coach_id = get_my_coach_id());

-- ============================================================================
-- BASEBALL_TEAM_MEMBERS
-- ============================================================================
ALTER TABLE baseball_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_team_members_select" ON baseball_team_members;
DROP POLICY IF EXISTS "baseball_team_members_insert" ON baseball_team_members;
DROP POLICY IF EXISTS "baseball_team_members_update" ON baseball_team_members;
DROP POLICY IF EXISTS "baseball_team_members_delete" ON baseball_team_members;
-- Drop legacy policies
DROP POLICY IF EXISTS "team_members_select_team" ON baseball_team_members;
DROP POLICY IF EXISTS "team_members_insert_coach" ON baseball_team_members;
DROP POLICY IF EXISTS "team_members_update_coach" ON baseball_team_members;
DROP POLICY IF EXISTS "team_members_delete_coach_or_self" ON baseball_team_members;

-- Visible to team coaches and team members
CREATE POLICY "baseball_team_members_select" ON baseball_team_members
FOR SELECT TO authenticated
USING (is_baseball_team_coach(team_id) OR is_baseball_team_member(team_id) OR player_id = get_my_player_id());

-- Only team coaches can add members
CREATE POLICY "baseball_team_members_insert" ON baseball_team_members
FOR INSERT TO authenticated
WITH CHECK (is_baseball_team_coach(team_id));

-- Only team coaches can update members
CREATE POLICY "baseball_team_members_update" ON baseball_team_members
FOR UPDATE TO authenticated
USING (is_baseball_team_coach(team_id))
WITH CHECK (is_baseball_team_coach(team_id));

-- Team coaches can remove members, players can remove themselves
CREATE POLICY "baseball_team_members_delete" ON baseball_team_members
FOR DELETE TO authenticated
USING (is_baseball_team_coach(team_id) OR player_id = get_my_player_id());

-- ============================================================================
-- BASEBALL_TEAM_COACH_STAFF
-- ============================================================================
ALTER TABLE baseball_team_coach_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_team_coach_staff_select" ON baseball_team_coach_staff;
DROP POLICY IF EXISTS "baseball_team_coach_staff_insert" ON baseball_team_coach_staff;
DROP POLICY IF EXISTS "baseball_team_coach_staff_update" ON baseball_team_coach_staff;
DROP POLICY IF EXISTS "baseball_team_coach_staff_delete" ON baseball_team_coach_staff;

-- Visible to team coaches
CREATE POLICY "baseball_team_coach_staff_select" ON baseball_team_coach_staff
FOR SELECT TO authenticated
USING (is_baseball_team_coach(team_id) OR coach_id = get_my_coach_id());

-- Only head coach can add staff
CREATE POLICY "baseball_team_coach_staff_insert" ON baseball_team_coach_staff
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM baseball_teams WHERE id = team_id AND head_coach_id = get_my_coach_id())
);

-- Only head coach can update staff
CREATE POLICY "baseball_team_coach_staff_update" ON baseball_team_coach_staff
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM baseball_teams WHERE id = team_id AND head_coach_id = get_my_coach_id()));

-- Only head coach can remove staff
CREATE POLICY "baseball_team_coach_staff_delete" ON baseball_team_coach_staff
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM baseball_teams WHERE id = team_id AND head_coach_id = get_my_coach_id()));

-- ============================================================================
-- BASEBALL_MESSAGES
-- ============================================================================
ALTER TABLE baseball_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_messages_select" ON baseball_messages;
DROP POLICY IF EXISTS "baseball_messages_insert" ON baseball_messages;
-- Drop legacy if exists
DROP POLICY IF EXISTS "Users can view their baseball messages" ON baseball_messages;
DROP POLICY IF EXISTS "Users can send baseball messages" ON baseball_messages;

-- Only conversation participants can see messages
CREATE POLICY "baseball_messages_select" ON baseball_messages
FOR SELECT TO authenticated
USING (
  conversation_id IN (
    SELECT conversation_id FROM baseball_conversation_participants
    WHERE user_id = auth.uid()
  )
);

-- Only conversation participants can send messages
CREATE POLICY "baseball_messages_insert" ON baseball_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND conversation_id IN (
    SELECT conversation_id FROM baseball_conversation_participants
    WHERE user_id = auth.uid()
  )
);

-- Messages cannot be updated or deleted (immutable)

-- ============================================================================
-- BASEBALL_CONVERSATIONS
-- ============================================================================
ALTER TABLE baseball_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_conversations_select" ON baseball_conversations;
DROP POLICY IF EXISTS "baseball_conversations_insert" ON baseball_conversations;
DROP POLICY IF EXISTS "baseball_conversations_update" ON baseball_conversations;
-- Drop legacy if exists
DROP POLICY IF EXISTS "Users can view their baseball conversations" ON baseball_conversations;
DROP POLICY IF EXISTS "Users can create baseball conversations" ON baseball_conversations;

-- Only participants can see conversations
CREATE POLICY "baseball_conversations_select" ON baseball_conversations
FOR SELECT TO authenticated
USING (
  id IN (
    SELECT conversation_id FROM baseball_conversation_participants
    WHERE user_id = auth.uid()
  )
);

-- Any authenticated user can start a conversation
CREATE POLICY "baseball_conversations_insert" ON baseball_conversations
FOR INSERT TO authenticated
WITH CHECK (true);

-- Only participants can update (e.g., mark as read)
CREATE POLICY "baseball_conversations_update" ON baseball_conversations
FOR UPDATE TO authenticated
USING (
  id IN (
    SELECT conversation_id FROM baseball_conversation_participants
    WHERE user_id = auth.uid()
  )
);

-- ============================================================================
-- BASEBALL_CONVERSATION_PARTICIPANTS
-- ============================================================================
ALTER TABLE baseball_conversation_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_conversation_participants_select" ON baseball_conversation_participants;
DROP POLICY IF EXISTS "baseball_conversation_participants_insert" ON baseball_conversation_participants;
DROP POLICY IF EXISTS "baseball_conversation_participants_update" ON baseball_conversation_participants;
-- Drop legacy if exists
DROP POLICY IF EXISTS "Users can view baseball conversation participants" ON baseball_conversation_participants;

-- Only participants can see who's in a conversation
CREATE POLICY "baseball_conversation_participants_select" ON baseball_conversation_participants
FOR SELECT TO authenticated
USING (
  conversation_id IN (
    SELECT conversation_id FROM baseball_conversation_participants cp
    WHERE cp.user_id = auth.uid()
  )
);

-- Can add participants to conversations you're part of or add yourself
CREATE POLICY "baseball_conversation_participants_insert" ON baseball_conversation_participants
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR conversation_id IN (
    SELECT conversation_id FROM baseball_conversation_participants
    WHERE user_id = auth.uid()
  )
);

-- Participants can update their own record (read status, etc.)
CREATE POLICY "baseball_conversation_participants_update" ON baseball_conversation_participants
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- BASEBALL_EVENTS
-- ============================================================================
ALTER TABLE baseball_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_events_select" ON baseball_events;
DROP POLICY IF EXISTS "baseball_events_insert" ON baseball_events;
DROP POLICY IF EXISTS "baseball_events_update" ON baseball_events;
DROP POLICY IF EXISTS "baseball_events_delete" ON baseball_events;
-- Drop legacy policies
DROP POLICY IF EXISTS "events_select_team" ON baseball_events;
DROP POLICY IF EXISTS "events_insert_coach" ON baseball_events;
DROP POLICY IF EXISTS "events_update_creator" ON baseball_events;
DROP POLICY IF EXISTS "events_delete_creator" ON baseball_events;

-- Events visible to team coaches and team members
CREATE POLICY "baseball_events_select" ON baseball_events
FOR SELECT TO authenticated
USING (
  team_id IS NULL  -- Organization-wide events
  OR is_baseball_team_coach(team_id)
  OR is_baseball_team_member(team_id)
);

-- Only team coaches can create events
CREATE POLICY "baseball_events_insert" ON baseball_events
FOR INSERT TO authenticated
WITH CHECK (
  created_by = get_my_coach_id()
  AND (team_id IS NULL OR is_baseball_team_coach(team_id))
);

-- Only event creator can update
CREATE POLICY "baseball_events_update" ON baseball_events
FOR UPDATE TO authenticated
USING (created_by = get_my_coach_id())
WITH CHECK (created_by = get_my_coach_id());

-- Only event creator can delete
CREATE POLICY "baseball_events_delete" ON baseball_events
FOR DELETE TO authenticated
USING (created_by = get_my_coach_id());

-- ============================================================================
-- BASEBALL_CAMPS
-- ============================================================================
ALTER TABLE baseball_camps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_camps_select" ON baseball_camps;
DROP POLICY IF EXISTS "baseball_camps_insert" ON baseball_camps;
DROP POLICY IF EXISTS "baseball_camps_update" ON baseball_camps;
DROP POLICY IF EXISTS "baseball_camps_delete" ON baseball_camps;
-- Drop legacy policies
DROP POLICY IF EXISTS "camps_select_all" ON baseball_camps;
DROP POLICY IF EXISTS "camps_insert_coach" ON baseball_camps;
DROP POLICY IF EXISTS "camps_update_creator" ON baseball_camps;
DROP POLICY IF EXISTS "camps_delete_creator" ON baseball_camps;

-- Camps are publicly visible (for player discovery)
CREATE POLICY "baseball_camps_select" ON baseball_camps
FOR SELECT TO authenticated
USING (true);

-- Only coaches can create camps
CREATE POLICY "baseball_camps_insert" ON baseball_camps
FOR INSERT TO authenticated
WITH CHECK (coach_id = get_my_coach_id());

-- Only camp creator can update
CREATE POLICY "baseball_camps_update" ON baseball_camps
FOR UPDATE TO authenticated
USING (coach_id = get_my_coach_id())
WITH CHECK (coach_id = get_my_coach_id());

-- Only camp creator can delete
CREATE POLICY "baseball_camps_delete" ON baseball_camps
FOR DELETE TO authenticated
USING (coach_id = get_my_coach_id());

-- ============================================================================
-- BASEBALL_CAMP_REGISTRATIONS
-- ============================================================================
ALTER TABLE baseball_camp_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_camp_registrations_select" ON baseball_camp_registrations;
DROP POLICY IF EXISTS "baseball_camp_registrations_insert" ON baseball_camp_registrations;
DROP POLICY IF EXISTS "baseball_camp_registrations_update" ON baseball_camp_registrations;
DROP POLICY IF EXISTS "baseball_camp_registrations_delete" ON baseball_camp_registrations;
-- Drop legacy policies
DROP POLICY IF EXISTS "camp_registrations_select_relevant" ON baseball_camp_registrations;
DROP POLICY IF EXISTS "camp_registrations_insert_player" ON baseball_camp_registrations;

-- Camp owner can see all registrations, players can see their own
CREATE POLICY "baseball_camp_registrations_select" ON baseball_camp_registrations
FOR SELECT TO authenticated
USING (
  player_id = get_my_player_id()
  OR camp_id IN (SELECT id FROM baseball_camps WHERE coach_id = get_my_coach_id())
);

-- Players can register themselves
CREATE POLICY "baseball_camp_registrations_insert" ON baseball_camp_registrations
FOR INSERT TO authenticated
WITH CHECK (player_id = get_my_player_id());

-- Camp owner can update registrations (status changes)
CREATE POLICY "baseball_camp_registrations_update" ON baseball_camp_registrations
FOR UPDATE TO authenticated
USING (
  camp_id IN (SELECT id FROM baseball_camps WHERE coach_id = get_my_coach_id())
);

-- Players can cancel their own registration
CREATE POLICY "baseball_camp_registrations_delete" ON baseball_camp_registrations
FOR DELETE TO authenticated
USING (player_id = get_my_player_id());

-- ============================================================================
-- BASEBALL_DEVELOPMENTAL_PLANS
-- ============================================================================
ALTER TABLE baseball_developmental_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_developmental_plans_select" ON baseball_developmental_plans;
DROP POLICY IF EXISTS "baseball_developmental_plans_insert" ON baseball_developmental_plans;
DROP POLICY IF EXISTS "baseball_developmental_plans_update" ON baseball_developmental_plans;
DROP POLICY IF EXISTS "baseball_developmental_plans_delete" ON baseball_developmental_plans;
-- Drop legacy policies
DROP POLICY IF EXISTS "developmental_plans_select_relevant" ON baseball_developmental_plans;
DROP POLICY IF EXISTS "developmental_plans_insert_coach" ON baseball_developmental_plans;
DROP POLICY IF EXISTS "developmental_plans_update_coach" ON baseball_developmental_plans;
DROP POLICY IF EXISTS "developmental_plans_delete_coach" ON baseball_developmental_plans;

-- Coaches can see plans they created, players can see plans assigned to them
CREATE POLICY "baseball_developmental_plans_select" ON baseball_developmental_plans
FOR SELECT TO authenticated
USING (
  coach_id = get_my_coach_id()
  OR player_id = get_my_player_id()
);

-- Only coaches can create plans
CREATE POLICY "baseball_developmental_plans_insert" ON baseball_developmental_plans
FOR INSERT TO authenticated
WITH CHECK (coach_id = get_my_coach_id());

-- Only plan creator can update
CREATE POLICY "baseball_developmental_plans_update" ON baseball_developmental_plans
FOR UPDATE TO authenticated
USING (coach_id = get_my_coach_id())
WITH CHECK (coach_id = get_my_coach_id());

-- Only plan creator can delete
CREATE POLICY "baseball_developmental_plans_delete" ON baseball_developmental_plans
FOR DELETE TO authenticated
USING (coach_id = get_my_coach_id());

-- ============================================================================
-- BASEBALL_PLAYER_ENGAGEMENT_EVENTS
-- ============================================================================
ALTER TABLE baseball_player_engagement_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_player_engagement_events_select" ON baseball_player_engagement_events;
DROP POLICY IF EXISTS "baseball_player_engagement_events_insert" ON baseball_player_engagement_events;
-- Drop legacy policies
DROP POLICY IF EXISTS "engagement_select_relevant" ON baseball_player_engagement_events;
DROP POLICY IF EXISTS "engagement_insert_coach" ON baseball_player_engagement_events;

-- Players can see their own engagement, Coaches can see engagement they created
CREATE POLICY "baseball_player_engagement_events_select" ON baseball_player_engagement_events
FOR SELECT TO authenticated
USING (
  player_id = get_my_player_id()
  OR coach_id = get_my_coach_id()
);

-- Coaches can create engagement events for players with recruiting activated
CREATE POLICY "baseball_player_engagement_events_insert" ON baseball_player_engagement_events
FOR INSERT TO authenticated
WITH CHECK (
  coach_id = get_my_coach_id()
  AND player_id IN (SELECT id FROM baseball_players WHERE recruiting_activated = true)
);

-- Engagement events are immutable (no UPDATE or DELETE)

-- ============================================================================
-- BASEBALL_RECRUITING_INTERESTS
-- ============================================================================
ALTER TABLE baseball_recruiting_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_recruiting_interests_select" ON baseball_recruiting_interests;
DROP POLICY IF EXISTS "baseball_recruiting_interests_insert" ON baseball_recruiting_interests;
DROP POLICY IF EXISTS "baseball_recruiting_interests_update" ON baseball_recruiting_interests;
DROP POLICY IF EXISTS "baseball_recruiting_interests_delete" ON baseball_recruiting_interests;
-- Drop legacy policies
DROP POLICY IF EXISTS "recruiting_interests_select_relevant" ON baseball_recruiting_interests;
DROP POLICY IF EXISTS "recruiting_interests_insert_player" ON baseball_recruiting_interests;

-- Players can see interest in them, coaches can see interest from players in their org
CREATE POLICY "baseball_recruiting_interests_select" ON baseball_recruiting_interests
FOR SELECT TO authenticated
USING (
  player_id = get_my_player_id()
  OR organization_id IN (SELECT organization_id FROM baseball_coaches WHERE id = get_my_coach_id())
);

-- Players can express interest in schools
CREATE POLICY "baseball_recruiting_interests_insert" ON baseball_recruiting_interests
FOR INSERT TO authenticated
WITH CHECK (player_id = get_my_player_id());

-- Players can update their own interest
CREATE POLICY "baseball_recruiting_interests_update" ON baseball_recruiting_interests
FOR UPDATE TO authenticated
USING (player_id = get_my_player_id())
WITH CHECK (player_id = get_my_player_id());

-- Players can remove their interest
CREATE POLICY "baseball_recruiting_interests_delete" ON baseball_recruiting_interests
FOR DELETE TO authenticated
USING (player_id = get_my_player_id());

-- ============================================================================
-- BASEBALL_COACH_NOTES
-- ============================================================================
ALTER TABLE baseball_coach_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_coach_notes_select" ON baseball_coach_notes;
DROP POLICY IF EXISTS "baseball_coach_notes_insert" ON baseball_coach_notes;
DROP POLICY IF EXISTS "baseball_coach_notes_update" ON baseball_coach_notes;
DROP POLICY IF EXISTS "baseball_coach_notes_delete" ON baseball_coach_notes;

-- Coach can only see their own notes
CREATE POLICY "baseball_coach_notes_select" ON baseball_coach_notes
FOR SELECT TO authenticated
USING (coach_id = get_my_coach_id());

CREATE POLICY "baseball_coach_notes_insert" ON baseball_coach_notes
FOR INSERT TO authenticated
WITH CHECK (coach_id = get_my_coach_id());

CREATE POLICY "baseball_coach_notes_update" ON baseball_coach_notes
FOR UPDATE TO authenticated
USING (coach_id = get_my_coach_id())
WITH CHECK (coach_id = get_my_coach_id());

CREATE POLICY "baseball_coach_notes_delete" ON baseball_coach_notes
FOR DELETE TO authenticated
USING (coach_id = get_my_coach_id());

-- ============================================================================
-- BASEBALL_COACH_CALENDAR_EVENTS
-- ============================================================================
ALTER TABLE baseball_coach_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_coach_calendar_events_all" ON baseball_coach_calendar_events;

-- Coach can only manage their own calendar events
CREATE POLICY "baseball_coach_calendar_events_all" ON baseball_coach_calendar_events
FOR ALL TO authenticated
USING (coach_id = get_my_coach_id())
WITH CHECK (coach_id = get_my_coach_id());

-- ============================================================================
-- BASEBALL_TEAM_INVITATIONS
-- ============================================================================
ALTER TABLE baseball_team_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_team_invitations_select" ON baseball_team_invitations;
DROP POLICY IF EXISTS "baseball_team_invitations_insert" ON baseball_team_invitations;
DROP POLICY IF EXISTS "baseball_team_invitations_update" ON baseball_team_invitations;
DROP POLICY IF EXISTS "baseball_team_invitations_delete" ON baseball_team_invitations;

-- Team coaches can see their team's invitations
CREATE POLICY "baseball_team_invitations_select" ON baseball_team_invitations
FOR SELECT TO authenticated
USING (is_baseball_team_coach(team_id));

-- Only team coaches can create invitations
CREATE POLICY "baseball_team_invitations_insert" ON baseball_team_invitations
FOR INSERT TO authenticated
WITH CHECK (is_baseball_team_coach(team_id));

-- Only team coaches can update invitations
CREATE POLICY "baseball_team_invitations_update" ON baseball_team_invitations
FOR UPDATE TO authenticated
USING (is_baseball_team_coach(team_id));

-- Only team coaches can delete invitations
CREATE POLICY "baseball_team_invitations_delete" ON baseball_team_invitations
FOR DELETE TO authenticated
USING (is_baseball_team_coach(team_id));

-- ============================================================================
-- BASEBALL_PLAYER_SETTINGS
-- ============================================================================
ALTER TABLE baseball_player_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_player_settings_all" ON baseball_player_settings;

-- Players can only manage their own settings
CREATE POLICY "baseball_player_settings_all" ON baseball_player_settings
FOR ALL TO authenticated
USING (player_id = get_my_player_id())
WITH CHECK (player_id = get_my_player_id());

-- ============================================================================
-- VERIFICATION COMMENT
-- ============================================================================
-- Run this after migration to verify:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename LIKE 'baseball_%' ORDER BY tablename, cmd;
--
-- Expected: Each table should have appropriate policies
-- ============================================================================
