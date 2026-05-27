-- ============================================================================
-- Migration: 034_all_rls_policies.sql
-- Purpose: Single source of truth for ALL RLS policies
-- ============================================================================

-- ============================================================================
-- PART 1: ENABLE RLS ON ALL TABLES
-- ============================================================================

-- Core Baseball Tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_coach_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiting_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE developmental_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE camps ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_engagement_events ENABLE ROW LEVEL SECURITY;
-- Note: profile_views is tracked via player_engagement_events
ALTER TABLE player_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Baseball Advanced Tables
ALTER TABLE baseball_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_stat_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_player_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_coach_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_coach_philosophy ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_recruiting_philosophy ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_percentiles ENABLE ROW LEVEL SECURITY;

-- Golf Tables
ALTER TABLE golf_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_holes ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_course_holes ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_course_tees ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_event_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_qualifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_qualifier_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_announcement_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_travel_itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_player_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_calendar_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_calendar_syncs ENABLE ROW LEVEL SECURITY;

-- These tables don't exist in current schema, wrapped in exception handlers
DO $$ BEGIN ALTER TABLE golf_calendar_notifications ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE golf_recurring_patterns ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE golf_availability_locks ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE golf_availability_polls ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE golf_poll_responses ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;

ALTER TABLE golf_coach_philosophy ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_coach_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_round_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_coachhelm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_team_coachhelm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_coach_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_player_focus_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_patterns_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_global_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_causal_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_confidence_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_learned_behavior ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_insight_generation_log ENABLE ROW LEVEL SECURITY;

-- Optional tables (may not exist)
DO $$ BEGIN
  ALTER TABLE putt_details ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE golf_team_settings ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE golf_external_calendars ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE golf_calendar_sync_state ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- PART 2: USERS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;

CREATE POLICY "users_select_own"
ON users FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "users_insert_own"
ON users FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own"
ON users FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ============================================================================
-- PART 3: COACHES TABLE POLICIES (Baseball)
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can manage own profile" ON coaches;
DROP POLICY IF EXISTS "Anyone can view coaches" ON coaches;
DROP POLICY IF EXISTS "Users can read own coach profile" ON coaches;
DROP POLICY IF EXISTS "Users can insert own coach profile" ON coaches;
DROP POLICY IF EXISTS "Users can update own coach profile" ON coaches;
DROP POLICY IF EXISTS "coaches_select_own" ON coaches;
DROP POLICY IF EXISTS "coaches_select_for_recruiting" ON coaches;

CREATE POLICY "coaches_select_own"
ON coaches FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "coaches_select_for_recruiting"
ON coaches FOR SELECT TO authenticated
USING (
  -- Players can see coaches for recruiting
  auth.uid() IN (SELECT user_id FROM players WHERE recruiting_activated = true)
  OR
  -- Coaches can see other coaches
  auth.uid() IN (SELECT user_id FROM coaches)
);

CREATE POLICY "coaches_insert_own"
ON coaches FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "coaches_update_own"
ON coaches FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "coaches_delete_own"
ON coaches FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- PART 4: PLAYERS TABLE POLICIES (Baseball)
-- ============================================================================

DROP POLICY IF EXISTS "Players can manage own profile" ON players;
DROP POLICY IF EXISTS "Activated players are public" ON players;
DROP POLICY IF EXISTS "Users can read own player profile" ON players;
DROP POLICY IF EXISTS "Users can insert own player profile" ON players;
DROP POLICY IF EXISTS "Users can update own player profile" ON players;
DROP POLICY IF EXISTS "Coaches can view all players" ON players;
DROP POLICY IF EXISTS "Coaches can view recruiting players" ON players;

CREATE POLICY "players_select_own"
ON players FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "players_select_recruiting"
ON players FOR SELECT TO authenticated
USING (
  recruiting_activated = true
  AND auth.uid() IN (SELECT user_id FROM coaches)
);

CREATE POLICY "players_insert_own"
ON players FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "players_update_own"
ON players FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "players_delete_own"
ON players FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- PART 5: ORGANIZATIONS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Organizations are viewable by all authenticated users" ON organizations;
DROP POLICY IF EXISTS "Public can view organizations" ON organizations;
DROP POLICY IF EXISTS "organizations_select_authenticated" ON organizations;

CREATE POLICY "organizations_select_relevant"
ON organizations FOR SELECT TO authenticated
USING (
  id IN (
    -- Baseball organizations
    SELECT organization_id FROM coaches WHERE user_id = auth.uid()
    UNION
    SELECT t.organization_id FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    JOIN players p ON p.id = tm.player_id
    WHERE p.user_id = auth.uid()
    UNION
    -- Golf organizations
    SELECT organization_id FROM golf_coaches WHERE user_id = auth.uid()
    UNION
    SELECT gt.organization_id FROM golf_teams gt
    JOIN golf_players gp ON gp.team_id = gt.id
    WHERE gp.user_id = auth.uid()
  )
);

CREATE POLICY "organizations_insert_coaches"
ON organizations FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IN (SELECT id FROM users WHERE role = 'coach')
);

CREATE POLICY "organizations_update_own"
ON organizations FOR UPDATE TO authenticated
USING (
  id IN (SELECT organization_id FROM coaches WHERE user_id = auth.uid())
)
WITH CHECK (
  id IN (SELECT organization_id FROM coaches WHERE user_id = auth.uid())
);

-- ============================================================================
-- PART 6: TEAMS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Teams viewable by members" ON teams;

CREATE POLICY "teams_select_members"
ON teams FOR SELECT TO authenticated
USING (
  id IN (SELECT team_id FROM team_members tm JOIN players p ON p.id = tm.player_id WHERE p.user_id = auth.uid())
  OR
  id IN (SELECT team_id FROM team_coach_staff tcs JOIN coaches c ON c.id = tcs.coach_id WHERE c.user_id = auth.uid())
  OR
  organization_id IN (SELECT organization_id FROM coaches WHERE user_id = auth.uid())
);

CREATE POLICY "teams_insert_coaches"
ON teams FOR INSERT TO authenticated
WITH CHECK (
  organization_id IN (SELECT organization_id FROM coaches WHERE user_id = auth.uid())
);

CREATE POLICY "teams_update_coaches"
ON teams FOR UPDATE TO authenticated
USING (
  organization_id IN (SELECT organization_id FROM coaches WHERE user_id = auth.uid())
);

-- ============================================================================
-- PART 7: TEAM MEMBERS POLICIES
-- ============================================================================

CREATE POLICY "team_members_select_team"
ON team_members FOR SELECT TO authenticated
USING (
  team_id IN (
    SELECT tm2.team_id FROM team_members tm2
    JOIN players p ON p.id = tm2.player_id
    WHERE p.user_id = auth.uid()
    UNION
    SELECT tcs.team_id FROM team_coach_staff tcs
    JOIN coaches c ON c.id = tcs.coach_id
    WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "team_members_insert_coaches"
ON team_members FOR INSERT TO authenticated
WITH CHECK (
  team_id IN (
    SELECT tcs.team_id FROM team_coach_staff tcs
    JOIN coaches c ON c.id = tcs.coach_id
    WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "team_members_delete_coaches"
ON team_members FOR DELETE TO authenticated
USING (
  team_id IN (
    SELECT tcs.team_id FROM team_coach_staff tcs
    JOIN coaches c ON c.id = tcs.coach_id
    WHERE c.user_id = auth.uid()
  )
);

-- ============================================================================
-- PART 8: TEAM INVITATIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Active invitations viewable by code" ON team_invitations;
DROP POLICY IF EXISTS "team_invitations_select_by_code_authenticated" ON team_invitations;

CREATE POLICY "team_invitations_select_active"
ON team_invitations FOR SELECT TO authenticated
USING (
  is_active = true AND expires_at > NOW()
);

CREATE POLICY "team_invitations_insert_coaches"
ON team_invitations FOR INSERT TO authenticated
WITH CHECK (
  team_id IN (
    SELECT tcs.team_id FROM team_coach_staff tcs
    JOIN coaches c ON c.id = tcs.coach_id
    WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "team_invitations_update_coaches"
ON team_invitations FOR UPDATE TO authenticated
USING (
  team_id IN (
    SELECT tcs.team_id FROM team_coach_staff tcs
    JOIN coaches c ON c.id = tcs.coach_id
    WHERE c.user_id = auth.uid()
  )
);

-- ============================================================================
-- PART 9: WATCHLISTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Coaches manage own watchlist" ON watchlists;

CREATE POLICY "watchlists_all_coach"
ON watchlists FOR ALL TO authenticated
USING (
  coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
)
WITH CHECK (
  coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
);

-- ============================================================================
-- PART 10: VIDEOS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Players manage own videos" ON videos;
DROP POLICY IF EXISTS "Videos are public" ON videos;

CREATE POLICY "videos_all_player"
ON videos FOR ALL TO authenticated
USING (
  player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
)
WITH CHECK (
  player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
);

CREATE POLICY "videos_select_public"
ON videos FOR SELECT TO authenticated
USING (true);

-- ============================================================================
-- PART 11: MESSAGING POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users see own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users see own participations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can join conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users see messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can send messages" ON messages;

CREATE POLICY "conversations_select_participant"
ON conversations FOR SELECT TO authenticated
USING (
  id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid())
);

CREATE POLICY "conversations_insert_authenticated"
ON conversations FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "conversation_participants_select_own"
ON conversation_participants FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "conversation_participants_insert_own"
ON conversation_participants FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "messages_select_participant"
ON messages FOR SELECT TO authenticated
USING (
  conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid())
);

CREATE POLICY "messages_insert_sender"
ON messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid())
);

-- ============================================================================
-- PART 12: NOTIFICATIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users see own notifications" ON notifications;

CREATE POLICY "notifications_all_own"
ON notifications FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 13: PLAYER FEATURES POLICIES
-- ============================================================================

CREATE POLICY "player_settings_all_own"
ON player_settings FOR ALL TO authenticated
USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()))
WITH CHECK (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

CREATE POLICY "player_metrics_all_own"
ON player_metrics FOR ALL TO authenticated
USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()))
WITH CHECK (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

CREATE POLICY "player_achievements_all_own"
ON player_achievements FOR ALL TO authenticated
USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()))
WITH CHECK (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

CREATE POLICY "recruiting_interests_all_own"
ON recruiting_interests FOR ALL TO authenticated
USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()))
WITH CHECK (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 14: DEVELOPMENTAL PLANS POLICIES
-- ============================================================================

CREATE POLICY "dev_plans_select_coach"
ON developmental_plans FOR SELECT TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "dev_plans_select_player"
ON developmental_plans FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

CREATE POLICY "dev_plans_insert_coach"
ON developmental_plans FOR INSERT TO authenticated
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "dev_plans_update_coach"
ON developmental_plans FOR UPDATE TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "dev_plans_delete_coach"
ON developmental_plans FOR DELETE TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 15: COACH FEATURES POLICIES
-- ============================================================================

CREATE POLICY "coach_notes_all_own"
ON coach_notes FOR ALL TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "coach_events_all_own"
ON coach_calendar_events FOR ALL TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 16: EVENTS & CAMPS POLICIES
-- ============================================================================

CREATE POLICY "events_select_team"
ON events FOR SELECT TO authenticated
USING (
  team_id IN (SELECT team_id FROM team_members tm JOIN players p ON p.id = tm.player_id WHERE p.user_id = auth.uid())
  OR team_id IN (SELECT team_id FROM team_coach_staff tcs JOIN coaches c ON c.id = tcs.coach_id WHERE c.user_id = auth.uid())
  OR is_public = true
);

CREATE POLICY "events_insert_coach"
ON events FOR INSERT TO authenticated
WITH CHECK (
  created_by IN (SELECT id FROM coaches WHERE user_id = auth.uid())
);

CREATE POLICY "events_update_coach"
ON events FOR UPDATE TO authenticated
USING (created_by IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
WITH CHECK (created_by IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "camps_select_public"
ON camps FOR SELECT TO authenticated
USING (status IN ('published', 'open', 'limited') OR coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "camps_insert_coach"
ON camps FOR INSERT TO authenticated
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "camps_update_coach"
ON camps FOR UPDATE TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "camp_registrations_select_coach"
ON camp_registrations FOR SELECT TO authenticated
USING (camp_id IN (SELECT id FROM camps WHERE coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())));

CREATE POLICY "camp_registrations_select_player"
ON camp_registrations FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

CREATE POLICY "camp_registrations_insert_player"
ON camp_registrations FOR INSERT TO authenticated
WITH CHECK (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 17: ANALYTICS POLICIES
-- ============================================================================

CREATE POLICY "engagement_select_player"
ON player_engagement_events FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

CREATE POLICY "engagement_insert_coach"
ON player_engagement_events FOR INSERT TO authenticated
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

-- Note: profile_views was consolidated into player_engagement_events with engagement_type = 'profile_view'

-- ============================================================================
-- PART 18: COMPARISONS POLICIES
-- ============================================================================

CREATE POLICY "comparisons_all_coach"
ON player_comparisons FOR ALL TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 19: LINEUPS POLICIES
-- ============================================================================

CREATE POLICY "lineups_select_team"
ON team_lineups FOR SELECT TO authenticated
USING (
  team_id IN (SELECT team_id FROM team_members tm JOIN players p ON p.id = tm.player_id WHERE p.user_id = auth.uid())
  OR team_id IN (SELECT team_id FROM team_coach_staff tcs JOIN coaches c ON c.id = tcs.coach_id WHERE c.user_id = auth.uid())
);

CREATE POLICY "lineups_insert_coach"
ON team_lineups FOR INSERT TO authenticated
WITH CHECK (
  team_id IN (SELECT team_id FROM team_coach_staff tcs JOIN coaches c ON c.id = tcs.coach_id WHERE c.user_id = auth.uid())
);

CREATE POLICY "lineups_update_coach"
ON team_lineups FOR UPDATE TO authenticated
USING (team_id IN (SELECT team_id FROM team_coach_staff tcs JOIN coaches c ON c.id = tcs.coach_id WHERE c.user_id = auth.uid()))
WITH CHECK (team_id IN (SELECT team_id FROM team_coach_staff tcs JOIN coaches c ON c.id = tcs.coach_id WHERE c.user_id = auth.uid()));

-- ============================================================================
-- PART 20: LOGIN SECURITY POLICIES
-- ============================================================================

-- Login attempts should only be accessible server-side
CREATE POLICY "login_attempts_service_only"
ON login_attempts FOR ALL TO authenticated
USING (false);

-- ============================================================================
-- PART 21: GOLF ORGANIZATIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_organizations_select_own" ON golf_organizations;
DROP POLICY IF EXISTS "golf_organizations_insert_coaches" ON golf_organizations;
DROP POLICY IF EXISTS "golf_organizations_update_own" ON golf_organizations;
DROP POLICY IF EXISTS "golf_organizations_delete_own" ON golf_organizations;

CREATE POLICY "golf_organizations_select_team"
ON golf_organizations FOR SELECT TO authenticated
USING (
  id IN (
    SELECT organization_id FROM golf_coaches WHERE user_id = auth.uid()
    UNION
    SELECT gt.organization_id FROM golf_teams gt
    JOIN golf_players gp ON gp.team_id = gt.id
    WHERE gp.user_id = auth.uid()
  )
);

CREATE POLICY "golf_organizations_insert_coaches"
ON golf_organizations FOR INSERT TO authenticated
WITH CHECK (auth.uid() IN (SELECT id FROM users WHERE role = 'coach'));

CREATE POLICY "golf_organizations_update_own"
ON golf_organizations FOR UPDATE TO authenticated
USING (id IN (SELECT organization_id FROM golf_coaches WHERE user_id = auth.uid()))
WITH CHECK (id IN (SELECT organization_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_organizations_delete_own"
ON golf_organizations FOR DELETE TO authenticated
USING (id IN (SELECT organization_id FROM golf_coaches WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 22: GOLF TEAMS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_teams_select_own" ON golf_teams;
DROP POLICY IF EXISTS "golf_teams_insert_coaches" ON golf_teams;
DROP POLICY IF EXISTS "golf_teams_update_own" ON golf_teams;
DROP POLICY IF EXISTS "golf_teams_delete_own" ON golf_teams;

CREATE POLICY "golf_teams_select_members"
ON golf_teams FOR SELECT TO authenticated
USING (
  id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
    UNION
    SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_teams_insert_coaches"
ON golf_teams FOR INSERT TO authenticated
WITH CHECK (auth.uid() IN (SELECT id FROM users WHERE role = 'coach'));

CREATE POLICY "golf_teams_update_coaches"
ON golf_teams FOR UPDATE TO authenticated
USING (id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()))
WITH CHECK (id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_teams_delete_coaches"
ON golf_teams FOR DELETE TO authenticated
USING (id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 23: GOLF COACHES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can read own golf coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can insert own golf coach profile" ON golf_coaches;
DROP POLICY IF EXISTS "Users can update own golf coach profile" ON golf_coaches;

CREATE POLICY "golf_coaches_select_own"
ON golf_coaches FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "golf_coaches_select_team"
ON golf_coaches FOR SELECT TO authenticated
USING (
  team_id IN (SELECT team_id FROM golf_players WHERE user_id = auth.uid())
);

CREATE POLICY "golf_coaches_insert_own"
ON golf_coaches FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "golf_coaches_update_own"
ON golf_coaches FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 24: GOLF PLAYERS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can read own golf player profile" ON golf_players;
DROP POLICY IF EXISTS "Users can insert own golf player profile" ON golf_players;
DROP POLICY IF EXISTS "Users can update own golf player profile" ON golf_players;

CREATE POLICY "golf_players_select_own"
ON golf_players FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "golf_players_select_team"
ON golf_players FOR SELECT TO authenticated
USING (
  team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
);

CREATE POLICY "golf_players_insert_own"
ON golf_players FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "golf_players_update_own"
ON golf_players FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 25: GOLF ROUNDS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_rounds_select_own" ON golf_rounds;
DROP POLICY IF EXISTS "golf_rounds_select_team" ON golf_rounds;
DROP POLICY IF EXISTS "golf_rounds_insert_own" ON golf_rounds;
DROP POLICY IF EXISTS "golf_rounds_update_own" ON golf_rounds;
DROP POLICY IF EXISTS "golf_rounds_delete_own" ON golf_rounds;
DROP POLICY IF EXISTS "Players can read their own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Coaches can read their team rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can insert their own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can update their own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can delete their own rounds" ON golf_rounds;

CREATE POLICY "golf_rounds_select_own"
ON golf_rounds FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_rounds_select_team"
ON golf_rounds FOR SELECT TO authenticated
USING (
  player_id IN (
    SELECT gp.id FROM golf_players gp
    JOIN golf_coaches gc ON gc.team_id = gp.team_id
    WHERE gc.user_id = auth.uid()
  )
);

CREATE POLICY "golf_rounds_insert_own"
ON golf_rounds FOR INSERT TO authenticated
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_rounds_update_own"
ON golf_rounds FOR UPDATE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()))
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_rounds_delete_own"
ON golf_rounds FOR DELETE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 26: GOLF HOLES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_holes_select_own" ON golf_holes;
DROP POLICY IF EXISTS "golf_holes_select_team" ON golf_holes;
DROP POLICY IF EXISTS "golf_holes_insert_own" ON golf_holes;
DROP POLICY IF EXISTS "golf_holes_update_own" ON golf_holes;
DROP POLICY IF EXISTS "golf_holes_delete_own" ON golf_holes;

CREATE POLICY "golf_holes_select_own"
ON golf_holes FOR SELECT TO authenticated
USING (
  round_id IN (
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

CREATE POLICY "golf_holes_select_team"
ON golf_holes FOR SELECT TO authenticated
USING (
  round_id IN (
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_players gp ON gp.id = gr.player_id
    JOIN golf_coaches gc ON gc.team_id = gp.team_id
    WHERE gc.user_id = auth.uid()
  )
);

CREATE POLICY "golf_holes_insert_own"
ON golf_holes FOR INSERT TO authenticated
WITH CHECK (
  round_id IN (
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

CREATE POLICY "golf_holes_update_own"
ON golf_holes FOR UPDATE TO authenticated
USING (
  round_id IN (
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
)
WITH CHECK (
  round_id IN (
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

CREATE POLICY "golf_holes_delete_own"
ON golf_holes FOR DELETE TO authenticated
USING (
  round_id IN (
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

-- ============================================================================
-- PART 27: GOLF SHOTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_shots_select_own" ON golf_shots;
DROP POLICY IF EXISTS "golf_shots_select_team" ON golf_shots;
DROP POLICY IF EXISTS "golf_shots_insert_own" ON golf_shots;
DROP POLICY IF EXISTS "golf_shots_update_own" ON golf_shots;
DROP POLICY IF EXISTS "golf_shots_delete_own" ON golf_shots;
DROP POLICY IF EXISTS "Players can read their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Coaches can read their team shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can insert their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can update their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can delete their own shots" ON golf_shots;

-- golf_shots uses hole_id -> golf_holes -> round_id -> golf_rounds
CREATE POLICY "golf_shots_select_own"
ON golf_shots FOR SELECT TO authenticated
USING (
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

CREATE POLICY "golf_shots_select_team"
ON golf_shots FOR SELECT TO authenticated
USING (
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    JOIN golf_coaches gc ON gc.team_id = gp.team_id
    WHERE gc.user_id = auth.uid()
  )
);

CREATE POLICY "golf_shots_insert_own"
ON golf_shots FOR INSERT TO authenticated
WITH CHECK (
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

CREATE POLICY "golf_shots_update_own"
ON golf_shots FOR UPDATE TO authenticated
USING (
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
)
WITH CHECK (
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

CREATE POLICY "golf_shots_delete_own"
ON golf_shots FOR DELETE TO authenticated
USING (
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

-- ============================================================================
-- PART 28: GOLF COURSES POLICIES
-- golf_courses uses created_by (user_id) and is_public, not team_id
-- ============================================================================

CREATE POLICY "golf_courses_select"
ON golf_courses FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR is_public = true
);

CREATE POLICY "golf_courses_insert"
ON golf_courses FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "golf_courses_update_own"
ON golf_courses FOR UPDATE TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY "golf_course_holes_select"
ON golf_course_holes FOR SELECT TO authenticated
USING (
  course_id IN (
    SELECT id FROM golf_courses WHERE created_by = auth.uid() OR is_public = true
  )
);

CREATE POLICY "golf_course_holes_insert"
ON golf_course_holes FOR INSERT TO authenticated
WITH CHECK (
  course_id IN (SELECT id FROM golf_courses WHERE created_by = auth.uid())
);

CREATE POLICY "golf_course_tees_select"
ON golf_course_tees FOR SELECT TO authenticated
USING (
  course_id IN (
    SELECT id FROM golf_courses WHERE created_by = auth.uid() OR is_public = true
  )
);

CREATE POLICY "golf_course_tees_insert"
ON golf_course_tees FOR INSERT TO authenticated
WITH CHECK (
  course_id IN (SELECT id FROM golf_courses WHERE created_by = auth.uid())
);

-- ============================================================================
-- PART 29: GOLF EVENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can manage their events" ON golf_events;
DROP POLICY IF EXISTS "Team members can view their events" ON golf_events;

CREATE POLICY "golf_events_select_team"
ON golf_events FOR SELECT TO authenticated
USING (
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
    UNION
    SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_events_insert_coaches"
ON golf_events FOR INSERT TO authenticated
WITH CHECK (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_events_update_coaches"
ON golf_events FOR UPDATE TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()))
WITH CHECK (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_events_delete_coaches"
ON golf_events FOR DELETE TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

-- Golf Event Attendance
CREATE POLICY "golf_attendance_select_team"
ON golf_event_attendance FOR SELECT TO authenticated
USING (
  event_id IN (
    SELECT id FROM golf_events WHERE team_id IN (
      SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
      UNION SELECT team_id FROM golf_players WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "golf_attendance_insert_coaches"
ON golf_event_attendance FOR INSERT TO authenticated
WITH CHECK (
  event_id IN (
    SELECT id FROM golf_events WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  )
);

-- Golf Event RSVPs
CREATE POLICY "golf_rsvps_select_team"
ON golf_event_rsvps FOR SELECT TO authenticated
USING (
  event_id IN (
    SELECT id FROM golf_events WHERE team_id IN (
      SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
      UNION SELECT team_id FROM golf_players WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "golf_rsvps_insert_own"
ON golf_event_rsvps FOR INSERT TO authenticated
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_rsvps_update_own"
ON golf_event_rsvps FOR UPDATE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()))
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 30: GOLF QUALIFIERS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_qualifiers_select_team" ON golf_qualifiers;
DROP POLICY IF EXISTS "golf_qualifiers_insert_coaches" ON golf_qualifiers;
DROP POLICY IF EXISTS "golf_qualifiers_update_coaches" ON golf_qualifiers;
DROP POLICY IF EXISTS "golf_qualifiers_delete_coaches" ON golf_qualifiers;
DROP POLICY IF EXISTS "golf_qualifier_entries_select_team" ON golf_qualifier_entries;
DROP POLICY IF EXISTS "golf_qualifier_entries_insert_coaches" ON golf_qualifier_entries;

CREATE POLICY "golf_qualifiers_select_team"
ON golf_qualifiers FOR SELECT TO authenticated
USING (
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
    UNION SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_qualifiers_insert_coaches"
ON golf_qualifiers FOR INSERT TO authenticated
WITH CHECK (
  team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  AND created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
);

CREATE POLICY "golf_qualifiers_update_coaches"
ON golf_qualifiers FOR UPDATE TO authenticated
USING (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()))
WITH CHECK (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_qualifiers_delete_coaches"
ON golf_qualifiers FOR DELETE TO authenticated
USING (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_qualifier_entries_select_team"
ON golf_qualifier_entries FOR SELECT TO authenticated
USING (
  qualifier_id IN (
    SELECT id FROM golf_qualifiers WHERE team_id IN (
      SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
      UNION SELECT team_id FROM golf_players WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "golf_qualifier_entries_insert_coaches"
ON golf_qualifier_entries FOR INSERT TO authenticated
WITH CHECK (
  qualifier_id IN (
    SELECT id FROM golf_qualifiers WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  )
);

-- ============================================================================
-- PART 31: GOLF COMMUNICATION POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_announcements_select_team" ON golf_announcements;
DROP POLICY IF EXISTS "golf_announcements_insert_coaches" ON golf_announcements;
DROP POLICY IF EXISTS "golf_announcements_update_coaches" ON golf_announcements;
DROP POLICY IF EXISTS "golf_announcements_delete_coaches" ON golf_announcements;
DROP POLICY IF EXISTS "golf_announcement_acknowledgements_select_own" ON golf_announcement_acknowledgements;
DROP POLICY IF EXISTS "golf_announcement_acknowledgements_insert_own" ON golf_announcement_acknowledgements;

CREATE POLICY "golf_announcements_select_team"
ON golf_announcements FOR SELECT TO authenticated
USING (
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
    UNION SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_announcements_insert_coaches"
ON golf_announcements FOR INSERT TO authenticated
WITH CHECK (
  team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  AND created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
);

CREATE POLICY "golf_announcements_update_coaches"
ON golf_announcements FOR UPDATE TO authenticated
USING (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()))
WITH CHECK (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_announcements_delete_coaches"
ON golf_announcements FOR DELETE TO authenticated
USING (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_acks_select_own"
ON golf_announcement_acknowledgements FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_acks_insert_own"
ON golf_announcement_acknowledgements FOR INSERT TO authenticated
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- Golf Conversations
CREATE POLICY "golf_conversations_select_team"
ON golf_conversations FOR SELECT TO authenticated
USING (
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
    UNION SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_conversations_insert_team"
ON golf_conversations FOR INSERT TO authenticated
WITH CHECK (
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
    UNION SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_participants_select_own"
ON golf_conversation_participants FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "golf_participants_insert_own"
ON golf_conversation_participants FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "golf_messages_select_participant"
ON golf_messages FOR SELECT TO authenticated
USING (
  conversation_id IN (SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid())
);

CREATE POLICY "golf_messages_insert_sender"
ON golf_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND conversation_id IN (SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid())
);

-- ============================================================================
-- PART 32: GOLF TASKS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_tasks_select_team" ON golf_tasks;
DROP POLICY IF EXISTS "golf_tasks_insert_coaches" ON golf_tasks;
DROP POLICY IF EXISTS "golf_tasks_update_coaches" ON golf_tasks;
DROP POLICY IF EXISTS "golf_tasks_delete_coaches" ON golf_tasks;
DROP POLICY IF EXISTS "golf_task_completions_select_own" ON golf_task_completions;
DROP POLICY IF EXISTS "golf_task_completions_select_coaches" ON golf_task_completions;
DROP POLICY IF EXISTS "golf_task_completions_insert_own" ON golf_task_completions;

CREATE POLICY "golf_tasks_select_team"
ON golf_tasks FOR SELECT TO authenticated
USING (
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
    UNION SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_tasks_insert_coaches"
ON golf_tasks FOR INSERT TO authenticated
WITH CHECK (
  team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  AND created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
);

CREATE POLICY "golf_tasks_update_coaches"
ON golf_tasks FOR UPDATE TO authenticated
USING (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()))
WITH CHECK (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_tasks_delete_coaches"
ON golf_tasks FOR DELETE TO authenticated
USING (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_task_completions_select_own"
ON golf_task_completions FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_task_completions_select_coaches"
ON golf_task_completions FOR SELECT TO authenticated
USING (
  task_id IN (
    SELECT id FROM golf_tasks WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  )
);

CREATE POLICY "golf_task_completions_insert_own"
ON golf_task_completions FOR INSERT TO authenticated
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 33: GOLF DOCUMENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_documents_select_coaches" ON golf_documents;
DROP POLICY IF EXISTS "golf_documents_select_players" ON golf_documents;
DROP POLICY IF EXISTS "golf_documents_insert_coaches" ON golf_documents;
DROP POLICY IF EXISTS "golf_documents_update_coaches" ON golf_documents;
DROP POLICY IF EXISTS "golf_documents_delete_coaches" ON golf_documents;

CREATE POLICY "golf_documents_select_coaches"
ON golf_documents FOR SELECT TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_documents_select_players"
ON golf_documents FOR SELECT TO authenticated
USING (
  team_id IN (SELECT team_id FROM golf_players WHERE user_id = auth.uid())
  AND player_visible = true
);

CREATE POLICY "golf_documents_insert_coaches"
ON golf_documents FOR INSERT TO authenticated
WITH CHECK (
  team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  AND uploaded_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
);

CREATE POLICY "golf_documents_update_coaches"
ON golf_documents FOR UPDATE TO authenticated
USING (uploaded_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()))
WITH CHECK (uploaded_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_documents_delete_coaches"
ON golf_documents FOR DELETE TO authenticated
USING (uploaded_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 34: GOLF TRAVEL POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_travel_itineraries_select_team" ON golf_travel_itineraries;
DROP POLICY IF EXISTS "golf_travel_itineraries_insert_coaches" ON golf_travel_itineraries;
DROP POLICY IF EXISTS "golf_travel_itineraries_update_coaches" ON golf_travel_itineraries;
DROP POLICY IF EXISTS "golf_travel_itineraries_delete_coaches" ON golf_travel_itineraries;

CREATE POLICY "golf_travel_select_team"
ON golf_travel_itineraries FOR SELECT TO authenticated
USING (
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
    UNION SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_travel_insert_coaches"
ON golf_travel_itineraries FOR INSERT TO authenticated
WITH CHECK (
  team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  AND created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
);

CREATE POLICY "golf_travel_update_coaches"
ON golf_travel_itineraries FOR UPDATE TO authenticated
USING (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()))
WITH CHECK (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_travel_delete_coaches"
ON golf_travel_itineraries FOR DELETE TO authenticated
USING (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 35: GOLF ACADEMICS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_player_classes_select_own" ON golf_player_classes;
DROP POLICY IF EXISTS "golf_player_classes_select_coaches" ON golf_player_classes;
DROP POLICY IF EXISTS "golf_player_classes_insert_own" ON golf_player_classes;
DROP POLICY IF EXISTS "golf_player_classes_update_own" ON golf_player_classes;
DROP POLICY IF EXISTS "golf_player_classes_delete_own" ON golf_player_classes;

CREATE POLICY "golf_classes_select_own"
ON golf_player_classes FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_classes_select_coaches"
ON golf_player_classes FOR SELECT TO authenticated
USING (
  player_id IN (
    SELECT gp.id FROM golf_players gp
    JOIN golf_coaches gc ON gc.team_id = gp.team_id
    WHERE gc.user_id = auth.uid()
  )
);

CREATE POLICY "golf_classes_insert_own"
ON golf_player_classes FOR INSERT TO authenticated
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_classes_update_own"
ON golf_player_classes FOR UPDATE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()))
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_classes_delete_own"
ON golf_player_classes FOR DELETE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 36: GOLF CALENDAR POLICIES
-- ============================================================================

CREATE POLICY "golf_feeds_select_own"
ON golf_calendar_feeds FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "golf_feeds_insert_own"
ON golf_calendar_feeds FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "golf_feeds_update_own"
ON golf_calendar_feeds FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "golf_feeds_delete_own"
ON golf_calendar_feeds FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "golf_syncs_select_own"
ON golf_calendar_syncs FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_syncs_insert_own"
ON golf_calendar_syncs FOR INSERT TO authenticated
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- ============================================================================
-- NOTE: The following tables don't exist in current schema, wrapped in exception handlers
-- Tables: golf_calendar_notifications, golf_recurring_patterns, golf_availability_locks,
--         golf_availability_polls, golf_poll_responses
-- ============================================================================

-- golf_calendar_notifications policies (table may not exist)
DO $$ BEGIN
  DROP POLICY IF EXISTS "golf_notifications_insert" ON golf_calendar_notifications;
  DROP POLICY IF EXISTS "golf_notifications_insert_system_only" ON golf_calendar_notifications;

  CREATE POLICY "golf_calendar_notifications_select_own"
  ON golf_calendar_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

  CREATE POLICY "golf_calendar_notifications_insert_own"
  ON golf_calendar_notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (
      SELECT gp.user_id FROM golf_players gp
      JOIN golf_coaches gc ON gc.team_id = gp.team_id
      WHERE gc.user_id = auth.uid()
    )
  );

  CREATE POLICY "golf_calendar_notifications_update_own"
  ON golf_calendar_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- golf_recurring_patterns policies (table may not exist)
DO $$ BEGIN
  CREATE POLICY "golf_recurring_select_team"
  ON golf_recurring_patterns FOR SELECT TO authenticated
  USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

  CREATE POLICY "golf_recurring_insert_coaches"
  ON golf_recurring_patterns FOR INSERT TO authenticated
  WITH CHECK (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

  CREATE POLICY "golf_recurring_update_coaches"
  ON golf_recurring_patterns FOR UPDATE TO authenticated
  USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- golf_availability_locks policies (table may not exist)
DO $$ BEGIN
  CREATE POLICY "golf_locks_select_team"
  ON golf_availability_locks FOR SELECT TO authenticated
  USING (
    event_id IN (
      SELECT id FROM golf_events WHERE team_id IN (
        SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
        UNION SELECT team_id FROM golf_players WHERE user_id = auth.uid()
      )
    )
  );

  CREATE POLICY "golf_locks_insert_coaches"
  ON golf_availability_locks FOR INSERT TO authenticated
  WITH CHECK (
    event_id IN (
      SELECT id FROM golf_events WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
    )
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- golf_availability_polls policies (table may not exist)
DO $$ BEGIN
  CREATE POLICY "golf_polls_select_team"
  ON golf_availability_polls FOR SELECT TO authenticated
  USING (
    event_id IN (
      SELECT id FROM golf_events WHERE team_id IN (
        SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
        UNION SELECT team_id FROM golf_players WHERE user_id = auth.uid()
      )
    )
  );

  CREATE POLICY "golf_polls_insert_coaches"
  ON golf_availability_polls FOR INSERT TO authenticated
  WITH CHECK (
    event_id IN (
      SELECT id FROM golf_events WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
    )
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- golf_poll_responses policies (table may not exist)
DO $$ BEGIN
  CREATE POLICY "golf_poll_responses_select_team"
  ON golf_poll_responses FOR SELECT TO authenticated
  USING (
    poll_id IN (
      SELECT id FROM golf_availability_polls WHERE event_id IN (
        SELECT id FROM golf_events WHERE team_id IN (
          SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
          UNION SELECT team_id FROM golf_players WHERE user_id = auth.uid()
        )
      )
    )
  );

  CREATE POLICY "golf_poll_responses_insert_own"
  ON golf_poll_responses FOR INSERT TO authenticated
  WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

  CREATE POLICY "golf_poll_responses_update_own"
  ON golf_poll_responses FOR UPDATE TO authenticated
  USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- PART 37: GOLF COACHHELM POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "golf_coach_notes_select_own_coach" ON golf_coach_notes;
DROP POLICY IF EXISTS "golf_coach_notes_select_shared_player" ON golf_coach_notes;
DROP POLICY IF EXISTS "golf_coach_notes_insert_coaches" ON golf_coach_notes;
DROP POLICY IF EXISTS "golf_coach_notes_update_coaches" ON golf_coach_notes;
DROP POLICY IF EXISTS "golf_coach_notes_delete_coaches" ON golf_coach_notes;

CREATE POLICY "golf_philosophy_select_own"
ON golf_coach_philosophy FOR SELECT TO authenticated
USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_philosophy_insert_own"
ON golf_coach_philosophy FOR INSERT TO authenticated
WITH CHECK (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_philosophy_update_own"
ON golf_coach_philosophy FOR UPDATE TO authenticated
USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_coach_notes_select_coach"
ON golf_coach_notes FOR SELECT TO authenticated
USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_coach_notes_select_player_shared"
ON golf_coach_notes FOR SELECT TO authenticated
USING (
  player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  AND shared_with_player = true
);

CREATE POLICY "golf_coach_notes_insert_coach"
ON golf_coach_notes FOR INSERT TO authenticated
WITH CHECK (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_coach_notes_update_coach"
ON golf_coach_notes FOR UPDATE TO authenticated
USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "golf_coach_notes_delete_coach"
ON golf_coach_notes FOR DELETE TO authenticated
USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

-- golf_round_reviews policies
CREATE POLICY "golf_reviews_select_player"
ON golf_round_reviews FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_reviews_select_coach"
ON golf_round_reviews FOR SELECT TO authenticated
USING (
  player_id IN (
    SELECT gp.id FROM golf_players gp
    JOIN golf_coaches gc ON gc.team_id = gp.team_id
    WHERE gc.user_id = auth.uid()
  )
);

CREATE POLICY "golf_reviews_insert"
ON golf_round_reviews FOR INSERT TO authenticated
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_reviews_update_own"
ON golf_round_reviews FOR UPDATE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- golf_coachhelm_settings policies
CREATE POLICY "coachhelm_settings_select_own"
ON golf_coachhelm_settings FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "coachhelm_settings_insert_own"
ON golf_coachhelm_settings FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "coachhelm_settings_update_own"
ON golf_coachhelm_settings FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- golf_team_coachhelm_settings policies
CREATE POLICY "team_coachhelm_settings_select_team"
ON golf_team_coachhelm_settings FOR SELECT TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "team_coachhelm_settings_insert_coaches"
ON golf_team_coachhelm_settings FOR INSERT TO authenticated
WITH CHECK (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "team_coachhelm_settings_update_coaches"
ON golf_team_coachhelm_settings FOR UPDATE TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

-- golf_coach_insights policies
CREATE POLICY "coach_insights_select_coach"
ON golf_coach_insights FOR SELECT TO authenticated
USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "coach_insights_insert_coach"
ON golf_coach_insights FOR INSERT TO authenticated
WITH CHECK (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "coach_insights_update_coach"
ON golf_coach_insights FOR UPDATE TO authenticated
USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

-- golf_player_focus_areas policies
CREATE POLICY "focus_areas_select_player"
ON golf_player_focus_areas FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "focus_areas_select_coach"
ON golf_player_focus_areas FOR SELECT TO authenticated
USING (
  player_id IN (
    SELECT gp.id FROM golf_players gp
    JOIN golf_coaches gc ON gc.team_id = gp.team_id
    WHERE gc.user_id = auth.uid()
  )
);

CREATE POLICY "focus_areas_insert_coach"
ON golf_player_focus_areas FOR INSERT TO authenticated
WITH CHECK (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "focus_areas_update_coach"
ON golf_player_focus_areas FOR UPDATE TO authenticated
USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

-- CoachHelm V2 AI Tables (team-scoped access for coaches)

-- golf_patterns_v2 policies
CREATE POLICY "patterns_v2_select_coach"
ON golf_patterns_v2 FOR SELECT TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "patterns_v2_insert_coach"
ON golf_patterns_v2 FOR INSERT TO authenticated
WITH CHECK (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

-- golf_global_patterns policies
CREATE POLICY "global_patterns_select_coach"
ON golf_global_patterns FOR SELECT TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "global_patterns_insert_coach"
ON golf_global_patterns FOR INSERT TO authenticated
WITH CHECK (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

-- golf_causal_relationships policies
CREATE POLICY "causal_select_coach"
ON golf_causal_relationships FOR SELECT TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "causal_insert_coach"
ON golf_causal_relationships FOR INSERT TO authenticated
WITH CHECK (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

-- golf_predictions policies
CREATE POLICY "predictions_select_coach"
ON golf_predictions FOR SELECT TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "predictions_insert_coach"
ON golf_predictions FOR INSERT TO authenticated
WITH CHECK (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "predictions_update_coach"
ON golf_predictions FOR UPDATE TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

-- golf_validations policies
CREATE POLICY "validations_select_coach"
ON golf_validations FOR SELECT TO authenticated
USING (
  prediction_id IN (
    SELECT id FROM golf_predictions WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  )
);

CREATE POLICY "validations_insert_coach"
ON golf_validations FOR INSERT TO authenticated
WITH CHECK (
  prediction_id IN (
    SELECT id FROM golf_predictions WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  )
);

-- golf_confidence_calibration policies
CREATE POLICY "calibration_select_coach"
ON golf_confidence_calibration FOR SELECT TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "calibration_insert_coach"
ON golf_confidence_calibration FOR INSERT TO authenticated
WITH CHECK (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "calibration_update_coach"
ON golf_confidence_calibration FOR UPDATE TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

-- golf_learned_behavior policies
CREATE POLICY "learned_behavior_select_coach"
ON golf_learned_behavior FOR SELECT TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "learned_behavior_insert_coach"
ON golf_learned_behavior FOR INSERT TO authenticated
WITH CHECK (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "learned_behavior_update_coach"
ON golf_learned_behavior FOR UPDATE TO authenticated
USING (team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()));

-- golf_insight_generation_log policies
CREATE POLICY "insight_log_select_coach"
ON golf_insight_generation_log FOR SELECT TO authenticated
USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

CREATE POLICY "insight_log_insert_coach"
ON golf_insight_generation_log FOR INSERT TO authenticated
WITH CHECK (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 38: BASEBALL ADVANCED TABLE POLICIES
-- ============================================================================

CREATE POLICY "baseball_stats_select_team"
ON baseball_player_stats FOR SELECT TO authenticated
USING (
  team_id IN (
    SELECT team_id FROM team_members tm JOIN players p ON p.id = tm.player_id WHERE p.user_id = auth.uid()
    UNION
    SELECT team_id FROM team_coach_staff tcs JOIN coaches c ON c.id = tcs.coach_id WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "baseball_stats_insert_coach"
ON baseball_player_stats FOR INSERT TO authenticated
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "baseball_stats_update_coach"
ON baseball_player_stats FOR UPDATE TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "baseball_uploads_select_coach"
ON baseball_stat_uploads FOR SELECT TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "baseball_uploads_insert_coach"
ON baseball_stat_uploads FOR INSERT TO authenticated
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "baseball_aggregates_select_player"
ON baseball_player_aggregates FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

CREATE POLICY "baseball_aggregates_select_coach"
ON baseball_player_aggregates FOR SELECT TO authenticated
USING (
  team_id IN (
    SELECT team_id FROM team_coach_staff tcs JOIN coaches c ON c.id = tcs.coach_id WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "baseball_insights_select_coach"
ON baseball_coach_insights FOR SELECT TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "baseball_insights_update_coach"
ON baseball_coach_insights FOR UPDATE TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "baseball_philosophy_all_coach"
ON baseball_coach_philosophy FOR ALL TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "recruiting_philosophy_all_coach"
ON coach_recruiting_philosophy FOR ALL TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

CREATE POLICY "player_percentiles_select_coach"
ON player_percentiles FOR SELECT TO authenticated
USING (
  auth.uid() IN (SELECT user_id FROM coaches)
);

CREATE POLICY "player_percentiles_select_own"
ON player_percentiles FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

-- ============================================================================
-- Documentation
-- ============================================================================
COMMENT ON TABLE users IS 'Users - RLS: own data only';
COMMENT ON TABLE coaches IS 'Coaches - RLS: own data + recruiting visibility';
COMMENT ON TABLE players IS 'Players - RLS: own data + recruiting visibility for activated';
COMMENT ON TABLE golf_rounds IS 'Golf rounds - RLS: own + team for coaches';
COMMENT ON TABLE golf_shots IS 'Golf shots - RLS: via round ownership';
COMMENT ON TABLE golf_coach_notes IS 'Coach notes - PRIVATE unless shared_with_player';
