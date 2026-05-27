-- ============================================================================
-- Migration: 033_all_indexes.sql
-- Purpose: All performance indexes consolidated
-- ============================================================================

-- ============================================================================
-- CORE BASEBALL INDEXES
-- ============================================================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Players
CREATE INDEX IF NOT EXISTS idx_players_grad_year ON players(grad_year);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(primary_position);
CREATE INDEX IF NOT EXISTS idx_players_state ON players(state);
CREATE INDEX IF NOT EXISTS idx_players_recruiting ON players(recruiting_activated) WHERE recruiting_activated = true;
CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id);
CREATE INDEX IF NOT EXISTS idx_players_organization ON players(high_school_org_id);
CREATE INDEX IF NOT EXISTS idx_players_committed_org ON players(committed_to_org_id);
CREATE INDEX IF NOT EXISTS idx_players_subscription ON players(subscription_tier, subscription_status);

-- Full text search on players
CREATE INDEX IF NOT EXISTS idx_players_search ON players USING gin(search_vector);

-- Coaches
CREATE INDEX IF NOT EXISTS idx_coaches_user_id ON coaches(user_id);
CREATE INDEX IF NOT EXISTS idx_coaches_organization ON coaches(organization_id);
CREATE INDEX IF NOT EXISTS idx_coaches_subscription ON coaches(subscription_tier, subscription_status);

-- Organizations
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_organizations_state ON organizations(location_state);
CREATE INDEX IF NOT EXISTS idx_organizations_division ON organizations(division) WHERE division IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_name_trgm ON organizations USING gin(name gin_trgm_ops);

-- Teams
CREATE INDEX IF NOT EXISTS idx_teams_organization ON teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_teams_type ON teams(team_type);
-- Note: invite_code column may be added later for team join functionality

-- Team Members
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_player ON team_members(player_id);

-- Team Staff
CREATE INDEX IF NOT EXISTS idx_team_staff_team ON team_coach_staff(team_id);
CREATE INDEX IF NOT EXISTS idx_team_staff_coach ON team_coach_staff(coach_id);

-- Team Invitations
CREATE INDEX IF NOT EXISTS idx_team_invitations_team ON team_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_code ON team_invitations(invite_code);
CREATE INDEX IF NOT EXISTS idx_team_invitations_active ON team_invitations(is_active, expires_at);

-- Watchlists
CREATE INDEX IF NOT EXISTS idx_watchlists_coach ON watchlists(coach_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_player ON watchlists(player_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_stage ON watchlists(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_watchlists_priority ON watchlists(coach_id, priority DESC);

-- Videos
CREATE INDEX IF NOT EXISTS idx_videos_player ON videos(player_id);
CREATE INDEX IF NOT EXISTS idx_videos_is_clip ON videos(is_clip) WHERE is_clip = true;
CREATE INDEX IF NOT EXISTS idx_videos_parent ON videos(parent_video_id) WHERE parent_video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_videos_type ON videos(video_type);

-- Messaging
CREATE INDEX IF NOT EXISTS idx_conversations_sport ON conversations(sport);
CREATE INDEX IF NOT EXISTS idx_conversations_team ON conversations(team_id) WHERE team_id IS NOT NULL;
-- Note: conversations uses team_id + sport to distinguish golf vs baseball team conversations
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at DESC);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Player Features
CREATE INDEX IF NOT EXISTS idx_player_settings_player ON player_settings(player_id);
CREATE INDEX IF NOT EXISTS idx_player_metrics_player ON player_metrics(player_id);
CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON player_achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_recruiting_interests_player ON recruiting_interests(player_id);

-- Developmental Plans
CREATE INDEX IF NOT EXISTS idx_dev_plans_coach ON developmental_plans(coach_id);
CREATE INDEX IF NOT EXISTS idx_dev_plans_player ON developmental_plans(player_id);
CREATE INDEX IF NOT EXISTS idx_dev_plans_team ON developmental_plans(team_id);
CREATE INDEX IF NOT EXISTS idx_dev_plans_status ON developmental_plans(status);
CREATE INDEX IF NOT EXISTS idx_dev_plans_player_status ON developmental_plans(player_id, status);
CREATE INDEX IF NOT EXISTS idx_dev_plans_dates ON developmental_plans(start_date, end_date) WHERE start_date IS NOT NULL;

-- Coach Features (note: more detailed indexes in 013_coach_features.sql)
CREATE INDEX IF NOT EXISTS idx_coach_notes_coach ON coach_notes(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_notes_player ON coach_notes(player_id);
CREATE INDEX IF NOT EXISTS idx_coach_events_coach ON coach_calendar_events(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_events_start ON coach_calendar_events(start_time);

-- Events & Camps
CREATE INDEX IF NOT EXISTS idx_events_org ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_team ON events(team_id);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_team_start ON events(team_id, start_time) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_public ON events(start_time) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by) WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_camps_coach ON camps(coach_id);
CREATE INDEX IF NOT EXISTS idx_camps_org ON camps(organization_id);
CREATE INDEX IF NOT EXISTS idx_camps_date ON camps(start_date);
CREATE INDEX IF NOT EXISTS idx_camps_status ON camps(status);
CREATE INDEX IF NOT EXISTS idx_camps_published ON camps(start_date) WHERE status IN ('published', 'open', 'limited');
CREATE INDEX IF NOT EXISTS idx_camps_state ON camps(location_state) WHERE location_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_camp_reg_camp ON camp_registrations(camp_id);
CREATE INDEX IF NOT EXISTS idx_camp_reg_player ON camp_registrations(player_id);
CREATE INDEX IF NOT EXISTS idx_camp_reg_status ON camp_registrations(status);
CREATE INDEX IF NOT EXISTS idx_camp_reg_camp_status ON camp_registrations(camp_id, status);
CREATE INDEX IF NOT EXISTS idx_camp_reg_player_status ON camp_registrations(player_id, status);

-- Analytics
CREATE INDEX IF NOT EXISTS idx_engagement_player ON player_engagement_events(player_id);
CREATE INDEX IF NOT EXISTS idx_engagement_coach ON player_engagement_events(coach_id) WHERE coach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_engagement_date ON player_engagement_events(engagement_date);
CREATE INDEX IF NOT EXISTS idx_engagement_type ON player_engagement_events(engagement_type);
CREATE INDEX IF NOT EXISTS idx_engagement_player_date ON player_engagement_events(player_id, engagement_date DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_player_type ON player_engagement_events(player_id, engagement_type);
CREATE INDEX IF NOT EXISTS idx_engagement_coach_type ON player_engagement_events(coach_id, engagement_type) WHERE coach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_engagement_video ON player_engagement_events(video_id) WHERE video_id IS NOT NULL;
-- Note: profile_views is tracked via player_engagement_events.engagement_type = 'profile_view'

-- Comparisons
CREATE INDEX IF NOT EXISTS idx_comparisons_coach ON player_comparisons(coach_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_created_at ON player_comparisons(created_at DESC);

-- Lineups (note: team_lineups has team_id and coach_id, not event_id)
CREATE INDEX IF NOT EXISTS idx_lineups_team ON team_lineups(team_id);
CREATE INDEX IF NOT EXISTS idx_lineups_coach ON team_lineups(coach_id);
CREATE INDEX IF NOT EXISTS idx_lineup_positions_lineup ON lineup_positions(lineup_id);

-- Login Security
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_last_attempt ON login_attempts(last_attempt);

-- ============================================================================
-- BASEBALL ADVANCED INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_baseball_stats_player_type ON baseball_player_stats(player_id, stat_type);
CREATE INDEX IF NOT EXISTS idx_baseball_stats_team_date ON baseball_player_stats(team_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_baseball_stats_batch ON baseball_player_stats(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_baseball_stats_coach ON baseball_player_stats(coach_id);

CREATE INDEX IF NOT EXISTS idx_baseball_uploads_team ON baseball_stat_uploads(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_uploads_status ON baseball_stat_uploads(status);

CREATE INDEX IF NOT EXISTS idx_baseball_aggregates_team ON baseball_player_aggregates(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_aggregates_trend ON baseball_player_aggregates(recent_trend);

CREATE INDEX IF NOT EXISTS idx_baseball_insights_coach_status ON baseball_coach_insights(coach_id, status);
CREATE INDEX IF NOT EXISTS idx_baseball_insights_player ON baseball_coach_insights(player_id);
CREATE INDEX IF NOT EXISTS idx_baseball_insights_team ON baseball_coach_insights(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_insights_priority ON baseball_coach_insights(priority);

CREATE INDEX IF NOT EXISTS idx_coach_philosophy_coach_id ON coach_recruiting_philosophy(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_philosophy_active ON coach_recruiting_philosophy(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_player_percentiles_player_id ON player_percentiles(player_id);
CREATE INDEX IF NOT EXISTS idx_player_percentiles_grad_year ON player_percentiles(grad_year);
CREATE INDEX IF NOT EXISTS idx_player_percentiles_stale ON player_percentiles(is_stale) WHERE is_stale = TRUE;

-- ============================================================================
-- GOLF CORE INDEXES
-- ============================================================================

-- Golf Organizations (has: name, division, conference, city, state, logo_url)
CREATE INDEX IF NOT EXISTS idx_golf_organizations_state ON golf_organizations(state);
CREATE INDEX IF NOT EXISTS idx_golf_organizations_division ON golf_organizations(division) WHERE division IS NOT NULL;

-- Golf Teams
CREATE INDEX IF NOT EXISTS idx_golf_teams_organization ON golf_teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_golf_teams_invite_code ON golf_teams(invite_code);

-- Golf Coaches
CREATE INDEX IF NOT EXISTS idx_golf_coaches_user ON golf_coaches(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_coaches_team ON golf_coaches(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_coaches_organization_id ON golf_coaches(organization_id);

-- Golf Players
CREATE INDEX IF NOT EXISTS idx_golf_players_user ON golf_players(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_players_team ON golf_players(team_id);

-- ============================================================================
-- GOLF ROUNDS & SHOTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_golf_rounds_player ON golf_rounds(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_created ON golf_rounds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_status_date ON golf_rounds(round_status, round_date DESC);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_status_date ON golf_rounds(player_id, round_status, round_date DESC);

CREATE INDEX IF NOT EXISTS idx_golf_holes_round ON golf_holes(round_id);
CREATE INDEX IF NOT EXISTS idx_golf_holes_round_number ON golf_holes(round_id, hole_number);

-- golf_shots has hole_id (FK to golf_holes), not round_id
CREATE INDEX IF NOT EXISTS idx_golf_shots_hole ON golf_shots(hole_id);
CREATE INDEX IF NOT EXISTS idx_golf_shots_ordering ON golf_shots(hole_id, shot_number);
-- Note: putt_details table doesn't exist in current schema

-- ============================================================================
-- GOLF COURSES INDEXES
-- ============================================================================

-- golf_courses has created_by (user), not team_id
CREATE INDEX IF NOT EXISTS idx_golf_courses_created_by ON golf_courses(created_by);
CREATE INDEX IF NOT EXISTS idx_golf_courses_name ON golf_courses(name);
CREATE INDEX IF NOT EXISTS idx_golf_courses_public ON golf_courses(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_golf_course_holes_course ON golf_course_holes(course_id);
CREATE INDEX IF NOT EXISTS idx_golf_course_tees_course ON golf_course_tees(course_id);

-- ============================================================================
-- GOLF EVENTS INDEXES
-- ============================================================================

-- golf_events has: team_id, start_date, end_date, start_time, end_time, event_type, is_mandatory, is_cancelled
CREATE INDEX IF NOT EXISTS idx_golf_events_team ON golf_events(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_events_date ON golf_events(start_date);
CREATE INDEX IF NOT EXISTS idx_golf_events_team_date ON golf_events(team_id, start_date);
CREATE INDEX IF NOT EXISTS idx_golf_events_type ON golf_events(event_type);
CREATE INDEX IF NOT EXISTS idx_golf_events_created_by ON golf_events(created_by);

CREATE INDEX IF NOT EXISTS idx_golf_attendance_event ON golf_event_attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_attendance_player ON golf_event_attendance(player_id);

CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_event ON golf_event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_player ON golf_event_rsvps(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_event_rsvps_response ON golf_event_rsvps(response);

-- ============================================================================
-- GOLF QUALIFIERS INDEXES
-- ============================================================================

-- Already defined in 024_golf_qualifiers.sql: idx_golf_qualifiers_team, idx_golf_qualifiers_status, idx_golf_qualifiers_date
-- Already defined: idx_golf_entries_qualifier, idx_golf_entries_player
CREATE INDEX IF NOT EXISTS idx_golf_qualifiers_team ON golf_qualifiers(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_qualifiers_date ON golf_qualifiers(start_date);
CREATE INDEX IF NOT EXISTS idx_golf_qualifiers_status ON golf_qualifiers(status);
CREATE INDEX IF NOT EXISTS idx_golf_qualifier_entries_qualifier ON golf_qualifier_entries(qualifier_id);
CREATE INDEX IF NOT EXISTS idx_golf_qualifier_entries_player ON golf_qualifier_entries(player_id);

-- ============================================================================
-- GOLF COMMUNICATION INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_golf_announcements_team ON golf_announcements(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_announcements_published ON golf_announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_golf_announcements_urgency ON golf_announcements(urgency);
CREATE INDEX IF NOT EXISTS idx_golf_announcements_team_created ON golf_announcements(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_golf_acknowledgements_announcement ON golf_announcement_acknowledgements(announcement_id);
CREATE INDEX IF NOT EXISTS idx_golf_acknowledgements_player ON golf_announcement_acknowledgements(player_id);

CREATE INDEX IF NOT EXISTS idx_golf_conversations_team ON golf_conversations(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_participants_conversation ON golf_conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_golf_participants_user ON golf_conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_messages_conversation ON golf_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_golf_messages_sender ON golf_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_golf_messages_created ON golf_messages(created_at DESC);

-- ============================================================================
-- GOLF TASKS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_golf_tasks_team ON golf_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_tasks_due ON golf_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_golf_tasks_assigned ON golf_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_golf_tasks_urgency ON golf_tasks(urgency);

CREATE INDEX IF NOT EXISTS idx_golf_completions_task ON golf_task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_golf_completions_player ON golf_task_completions(player_id);

-- ============================================================================
-- GOLF DOCUMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_golf_documents_team ON golf_documents(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_documents_category ON golf_documents(category);
CREATE INDEX IF NOT EXISTS idx_golf_documents_uploaded_by ON golf_documents(uploaded_by);

-- ============================================================================
-- GOLF TRAVEL INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_golf_travel_team ON golf_travel_itineraries(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_travel_event ON golf_travel_itineraries(event_id);
CREATE INDEX IF NOT EXISTS idx_golf_travel_departure ON golf_travel_itineraries(departure_date);

-- ============================================================================
-- GOLF ACADEMICS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_golf_classes_player ON golf_player_classes(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_classes_day ON golf_player_classes(day_of_week);

-- ============================================================================
-- GOLF CALENDAR INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_user ON golf_calendar_feeds(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_token ON golf_calendar_feeds(feed_token);
CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_team ON golf_calendar_feeds(team_id) WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_syncs_player ON golf_calendar_syncs(player_id);

-- Note: These tables don't exist in current schema:
-- golf_calendar_notifications, golf_recurring_patterns, golf_availability_locks,
-- golf_availability_polls, golf_poll_responses

-- Note: External calendar sync tables don't exist in current schema
-- golf_external_calendars, golf_calendar_sync_state, golf_sync_logs

-- ============================================================================
-- GOLF COACHHELM INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_golf_coach_philosophy_coach ON golf_coach_philosophy(coach_id);

CREATE INDEX IF NOT EXISTS idx_golf_coach_notes_coach ON golf_coach_notes(coach_id);
CREATE INDEX IF NOT EXISTS idx_golf_coach_notes_player ON golf_coach_notes(player_id);
-- Note: golf_coach_notes doesn't have team_id column

CREATE INDEX IF NOT EXISTS idx_golf_player_insights_player ON golf_player_insights(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_player_insights_coach ON golf_player_insights(coach_id);

-- Note: golf_round_reviews table doesn't exist in current schema

-- ============================================================================
-- Documentation
-- ============================================================================
COMMENT ON INDEX idx_players_search IS 'Full-text search on player names, school, location';
COMMENT ON INDEX idx_golf_rounds_player_status_date IS 'Optimized for round history queries';
COMMENT ON INDEX idx_golf_shots_ordering IS 'Optimized for shot sequence retrieval';
