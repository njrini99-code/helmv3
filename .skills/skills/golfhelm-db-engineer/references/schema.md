# Database Schema Quick Reference — GolfHelm

Compact reference of every golf table, its columns, and relationships.
Use this when you need to look up a column name or understand a join path.

**Tool Rule**: Use ONLY the `execute_sql` MCP tool for all queries. No other
tools, APIs, or HTTP requests. Only SELECT queries — never modify data.

## Core Tables

### users
`id` (UUID PK = auth.users.id), `email`, `role` (player|coach|admin), `notification_preferences` (JSONB), `last_seen`, `created_at`, `updated_at`

### golf_organizations
`id`, `name`, `division`, `conference`, `city`, `state`, `logo_url`, `created_at`, `updated_at`

### golf_teams
`id`, `organization_id` (FK→golf_organizations), `name`, `season`, `invite_code` (UNIQUE), `created_at`, `updated_at`

### golf_team_settings
`id`, `team_id` (FK→golf_teams, UNIQUE), `scoring_format`, `handicap_system`, `default_tees`, `timezone`

### golf_coaches
`id`, `user_id` (FK→users, UNIQUE), `team_id` (FK→golf_teams), `organization_id` (FK→golf_organizations), `full_name`, `email`, `phone`, `title`, `avatar_url`, `onboarding_completed`

### golf_players
`id`, `user_id` (FK→users, UNIQUE), `first_name`, `last_name`, `email`, `phone`, `avatar_url`, `graduation_year`, `hometown`, `state`, `handicap` (DECIMAL), `handicap_index`, `high_school_name`, `gpa`, `onboarding_completed`, `profile_complete`

### golf_team_members
`id`, `team_id` (FK→golf_teams), `player_id` (FK→golf_players), `status` (active|inactive|injured|alumni), `joined_at`, `left_at`. UNIQUE(team_id, player_id)

### golf_team_join_requests
`id`, `team_id`, `player_id`, `request_status` (pending|approved|rejected), `requested_at`, `responded_at`, `responded_by`, `response_notes`

## Round Data

### golf_rounds
`id`, `player_id` (FK→golf_players), `qualifier_id` (FK→golf_qualifiers), `course_id` (FK→golf_courses), `qualifier_round_number`, `course_name`, `course_city`, `course_state`, `course_rating`, `course_slope`, `tees_played`, `round_type` (tournament|qualifier|practice|casual), `status` (in_progress|paused|completed|abandoned), `round_date`, `total_score`, `score_to_par`, `front_nine`, `back_nine`, `total_putts`, `total_fairways_hit`, `total_fairways`, `total_gir`, `total_gir_possible`, `current_hole`, `holes_played`, `notes`, `weather_conditions`, `strokes_gained_total`, `strokes_gained_tee`, `strokes_gained_approach`, `strokes_gained_around_green`, `strokes_gained_putting`, `team_id`

### golf_holes
`id`, `round_id` (FK→golf_rounds), `hole_number` (1-18), `par` (3-5), `yardage`, `score` (≥1), `score_to_par` (GENERATED: score-par), `putts`, `fairway_hit`, `gir`, `up_and_down`, `sand_save`, `penalty_strokes`, `notes`. UNIQUE(round_id, hole_number)

### golf_shots
`id`, `hole_id` (FK→golf_holes), `shot_number`, `club` (ENUM: driver..putter), `club_type` (driver|non_driver|putter), `distance_yards`, `distance_to_hole_before`, `distance_to_hole_after`, `distance_unit_before`, `distance_unit_after`, `lie_before`, `lie_after`, `result` (ENUM), `shot_type` (tee|approach|around_green|putting|penalty), `miss_direction`, `putt_break`, `putt_distance_feet`, `notes`

## Courses

### golf_courses
`id`, `name`, `city`, `state`, `country`, `course_rating`, `slope_rating`, `default_tee_name`, `default_tee_color`, `total_yardage`, `total_par`, `created_by` (FK→auth.users), `is_public`. UNIQUE(name, city, state, created_by)

### golf_course_holes
`id`, `course_id`, `hole_number` (1-18), `par` (3-6), `yardage`, `handicap_index` (1-18). UNIQUE(course_id, hole_number)

### golf_course_tees
`id`, `course_id`, `tee_name`, `tee_color`, `course_rating`, `slope_rating`, `total_yardage`, `hole_yardages` (JSONB). UNIQUE(course_id, tee_name)

## Events & Calendar

### golf_events
`id`, `team_id`, `title`, `event_type` (practice|tournament|qualifier|meeting|travel|other), `start_time` (timestamptz), `end_time` (timestamptz), `all_day`, `location`, `description`, `cancellation_reason`, `cancelled_at`, `requires_rsvp`, `rsvp_deadline`, `max_attendees`, `status` (draft|confirmed|cancelled|completed|pending), `course_id` (FK→golf_courses), `parent_event_id` (FK→golf_events), `recurring`, `recurrence_rule`, `metadata` (JSONB), `created_by` (FK→golf_coaches), `created_at`, `updated_at`

### golf_event_attendance
`id`, `event_id`, `player_id`, `status` (attending|not_attending|maybe|pending|excused|unexcused), `absence_reason`, `responded_at`, `reminder_sent`. UNIQUE(event_id, player_id)

## Qualifiers

### golf_qualifiers
`id`, `team_id`, `name`, `description`, `course_name`, `location`, `course_id`, `num_rounds`, `holes_per_round`, `start_date`, `end_date`, `status` (upcoming|in_progress|completed), `show_live_leaderboard`, `spots_available`, `tournament_name`, `created_by`

### golf_qualifier_entries
`id`, `qualifier_id`, `player_id`, `position`, `is_tied`, `total_score`, `total_to_par`, `rounds_completed`, `status`. UNIQUE(qualifier_id, player_id)

## Communication

### golf_announcements
`id`, `team_id`, `title`, `body`, `urgency` (low|normal|high|urgent), `requires_acknowledgement`, `send_push`, `send_email`, `publish_at`, `published_at`, `created_by`

### golf_conversations
`id`, `team_id`, `title`, `is_group`, `created_by`

### golf_conversation_participants
`id`, `conversation_id`, `user_id`, `joined_at`, `last_read_at`. UNIQUE(conversation_id, user_id)

### golf_messages
`id`, `conversation_id`, `sender_id`, `content`, `is_read`, `created_at`

## Tasks & Documents

### golf_tasks
`id`, `team_id`, `title`, `description`, `assigned_to` (FK→golf_players, NULL=all), `due_date`, `urgency`, `requires_upload`, `created_by`

### golf_task_completions
`id`, `task_id`, `player_id`, `completed_at`, `upload_url`, `notes`. UNIQUE(task_id, player_id)

### golf_documents
`id`, `team_id`, `title`, `description`, `file_url`, `file_type`, `category`, `file_size`, `player_visible`, `uploaded_by`

## Travel & Academics

### golf_travel_itineraries
`id`, `team_id`, `event_id`, `event_name`, `destination`, `transportation_type` (bus|van|fly|carpool), `departure_date`, `return_date`, `departure_time`, `return_time`, `departure_location`, `flight_info`, `hotel_name`, `hotel_address`, `hotel_phone`, `hotel_confirmation`, `room_assignments`, `check_in_date`, `check_out_date`, `uniform_requirements`, `gear_list`, `notes`, `created_by`

### golf_player_classes
`id`, `player_id`, `course_code`, `course_name`, `instructor`, `location`, `day_of_week` (0-6), `start_time`, `end_time`, `semester`, `academic_year`

## Stats Caches

### golf_player_stats_cache
`id`, `player_id` (UNIQUE), scoring stats (scoring_average, scoring_average_vs_par, rounds_played, best_round, worst_round), par performance (par3/4/5_average), scoring distribution (eagles, birdies, pars, bogeys, double_bogeys, triple_plus), strokes gained (strokes_gained_total/tee/approach/around_green/putting, sg_total/tee/approach/around_green/putting_per_round), driving (driving_accuracy_percentage, fairways_hit, fairways_total, driving_distance_average), approach (gir_percentage, greens_hit, greens_total, approach_proximity_average), short game (scrambling_percentage, scramble_attempts, scrambles_converted, up_and_down_percentage, sand_save_percentage, sand_saves, sand_attempts), putting overall (putts_per_round, putts_per_gir, one_putt_percentage, three_putt_percentage, total_putts), putting by distance (putt_make_pct_0_3ft, 3_5ft, 5_10ft, 10_15ft, 15_20ft, 20_plus_ft), putting by break (putt_make_pct_left_to_right, right_to_left, straight), penalties (total_penalties, penalty_strokes_per_round), approach miss patterns (approach_miss_left/right/short/long_pct), metadata (last_round_date, rounds_in_calculation, engine_version, round_ids_included, is_stale, next_refresh_due, trend_direction, improvement_trend, last_5_average, last_10_average, rounds_this_season, season_start_date, calculation_period_start, calculation_period_end)

### golf_round_stats_cache
`id`, `round_id` (UNIQUE), `player_id`, basic scoring (total_score, score_to_par, front_nine, back_nine), strokes gained per round, driving/GIR/putting/scrambling for this round, scoring distribution, penalties, `detailed_stats` (JSONB)

### golf_putting_tendencies
`id`, `player_id` (UNIQUE), overall make%, by break type (L→R, R→L, straight), miss tendencies (left/right/short/long%), distance stats, pressure putting (inside 5ft), metadata

## CoachHelm AI

### golf_coach_philosophy
`id`, `coach_id` (UNIQUE), priority rankings (1-5 for ball_striking, short_game, putting, course_mgmt, mental), alert_sensitivity, thresholds (decline, pressure_gap, bubble_zone), comparison weights (historical, recent_form, tournament, qualifying, subjective = 100), alert toggles (10 booleans), display preferences

### golf_coach_notes
`id`, `coach_id`, `player_id`, `title`, `content`, `meeting_date`, `meeting_type`, `shared_with_player`, `tags[]`

### golf_coach_insights
`id`, `coach_id`, `player_id`, `team_id`, `insight_type`, `title`, `content`, `priority`, `status`, `dismissed`, `dismissed_at`, `acknowledged_at`, `action_taken`, `action_type`, `action_date`, `source_type`, `source_id`, `outcome_status`, `outcome_metric_name`, `outcome_metric_before`, `outcome_metric_after`, `outcome_measured_at`, `outcome_notes`, `resolved_at`, `metadata` (JSONB)

### golf_player_focus_areas
`id`, `player_id`, `team_id`, `coach_id`, `title`, `description`, `area_type`, `status`, `priority`, `target_metric`, `target_value`, `current_value`, `from_insight_id` (FK→golf_coach_insights), `from_review_id` (FK→golf_round_reviews), `review_context`, `notes`, `progress_notes` (JSONB), `started_at`, `completed_at`

### golf_round_reviews
`id`, `round_id` (UNIQUE), `player_id`, performance data (score, avg before/after, qualifying position), analysis (goal_impacts, highlights, areas_to_review as JSONB), stats comparisons, patterns detected/recurring, summary text, coaching interaction fields

### AI Pattern Tables
`golf_patterns_v2`, `golf_global_patterns`, `golf_causal_relationships`, `golf_predictions`, `golf_validations`, `golf_confidence_calibration`, `golf_learned_behavior`, `golf_insight_generation_log`

## Calendar Sync

### golf_calendar_feeds
`id`, `user_id`, `name`, `feed_type` (team|personal|tournament|all_events), `feed_token` (UNIQUE), `team_id`, `player_id`, `is_active`, `last_synced_at`

### golf_calendar_syncs
`id`, `player_id`, `provider` (google|apple|outlook|caldav), `provider_calendar_id`, `sync_status`, `last_sync_at`, `sync_errors` (JSONB)

## Shared

### notifications
`id`, `user_id`, `type`, `title`, `body`, `action_url`, `metadata` (JSONB), `read`

*Note: `notification_preferences` is a JSONB column on the `users` table, not a separate table.*

## Key Foreign Key Chains

```
Coach path:  auth.uid → users → golf_coaches → golf_organizations → golf_teams → team data
Player path: auth.uid → users → golf_players → golf_team_members → golf_teams → team data
Round chain: golf_rounds → golf_holes → golf_shots
Qualifier:   golf_qualifiers → golf_qualifier_entries → golf_rounds (via qualifier_id)
Messages:    golf_conversations → golf_conversation_participants + golf_messages
```
