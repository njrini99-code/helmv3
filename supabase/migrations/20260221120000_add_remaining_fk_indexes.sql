-- Add indexes for all remaining unindexed foreign keys
-- Generated: 2026-02-21
-- 45 FKs identified via information_schema query

-- Admin
CREATE INDEX IF NOT EXISTS idx_admin_events_resolved_by
  ON admin_events(resolved_by) WHERE resolved_by IS NOT NULL;

-- Baseball: users FKs
CREATE INDEX IF NOT EXISTS idx_baseball_academic_eligibility_updated_by
  ON baseball_academic_eligibility(updated_by) WHERE updated_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_conversations_created_by
  ON baseball_conversations(created_by) WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_document_versions_uploaded_by
  ON baseball_document_versions(uploaded_by) WHERE uploaded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_documents_uploaded_by
  ON baseball_documents(uploaded_by) WHERE uploaded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_travel_expenses_created_by
  ON baseball_travel_expenses(created_by) WHERE created_by IS NOT NULL;

-- Baseball: coach FKs
CREATE INDEX IF NOT EXISTS idx_baseball_events_created_by
  ON baseball_events(created_by) WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_player_stats_coach_id
  ON baseball_player_stats(coach_id) WHERE coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_task_templates_created_by_id
  ON baseball_task_templates(created_by_id) WHERE created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_team_invitations_created_by_coach_id
  ON baseball_team_invitations(created_by_coach_id) WHERE created_by_coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_team_lineups_created_by_coach_id
  ON baseball_team_lineups(created_by_coach_id) WHERE created_by_coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_team_members_approved_by
  ON baseball_team_members(approved_by) WHERE approved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_teams_created_by
  ON baseball_teams(created_by) WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_travel_itineraries_created_by
  ON baseball_travel_itineraries(created_by) WHERE created_by IS NOT NULL;

-- Baseball: self-referential
CREATE INDEX IF NOT EXISTS idx_baseball_videos_parent_video_id
  ON baseball_videos(parent_video_id) WHERE parent_video_id IS NOT NULL;

-- CRM
CREATE INDEX IF NOT EXISTS idx_crm_coaches_created_by
  ON crm_coaches(created_by) WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contact_log_created_by
  ON crm_contact_log(created_by) WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_events_created_by
  ON crm_events(created_by) WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_events_parent_event_id
  ON crm_events(parent_event_id) WHERE parent_event_id IS NOT NULL;

-- Golf: coach FKs
CREATE INDEX IF NOT EXISTS idx_golf_academic_exclusions_excluded_by
  ON golf_academic_exclusions(excluded_by) WHERE excluded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_availability_polls_created_by
  ON golf_availability_polls(created_by) WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_event_exclusions_excluded_by
  ON golf_event_exclusions(excluded_by) WHERE excluded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_event_status_log_changed_by
  ON golf_event_status_log(changed_by) WHERE changed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_insight_weights_coach_id
  ON golf_insight_weights(coach_id) WHERE coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_patterns_v2_validator_coach_id
  ON golf_patterns_v2(validator_coach_id) WHERE validator_coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_player_focus_areas_coach_id
  ON golf_player_focus_areas(coach_id) WHERE coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_team_join_requests_reviewed_by
  ON golf_team_join_requests(reviewed_by) WHERE reviewed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_team_members_approved_by
  ON golf_team_members(approved_by) WHERE approved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_teams_created_by
  ON golf_teams(created_by) WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_travel_itineraries_created_by
  ON golf_travel_itineraries(created_by) WHERE created_by IS NOT NULL;

-- Golf: team FKs
CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_team_id
  ON golf_calendar_feeds(team_id) WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_coachhelm_settings_team_id
  ON golf_coachhelm_settings(team_id) WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_player_classes_team_id
  ON golf_player_classes(team_id) WHERE team_id IS NOT NULL;

-- Golf: player FKs
CREATE INDEX IF NOT EXISTS idx_golf_calendar_feeds_player_id
  ON golf_calendar_feeds(player_id) WHERE player_id IS NOT NULL;

-- Golf: cross-entity FKs
CREATE INDEX IF NOT EXISTS idx_golf_insight_feedback_review_id
  ON golf_insight_feedback(review_id) WHERE review_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_player_focus_areas_from_insight_id
  ON golf_player_focus_areas(from_insight_id) WHERE from_insight_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_predictions_related_event_id
  ON golf_predictions(related_event_id) WHERE related_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_predictions_related_round_id
  ON golf_predictions(related_round_id) WHERE related_round_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_review_insights_created_focus_area_id
  ON golf_review_insights(created_focus_area_id) WHERE created_focus_area_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_validations_prediction_id
  ON golf_validations(prediction_id) WHERE prediction_id IS NOT NULL;

-- Golf: users FKs
CREATE INDEX IF NOT EXISTS idx_golf_review_events_actor_id
  ON golf_review_events(actor_id) WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_task_templates_created_by
  ON golf_task_templates(created_by) WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_team_coachhelm_settings_disabled_by
  ON golf_team_coachhelm_settings(disabled_by) WHERE disabled_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_travel_expenses_created_by
  ON golf_travel_expenses(created_by) WHERE created_by IS NOT NULL;

-- Golf: self-referential
CREATE INDEX IF NOT EXISTS idx_golf_events_parent_event_id
  ON golf_events(parent_event_id) WHERE parent_event_id IS NOT NULL;
