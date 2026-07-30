# GolfHelm Glossary

> Quick decoder ring for table names, enums, types, and terminology.
> Last updated: 2026-02-13

---

## How to Use This File

- **Need a table name?** → Search by feature area below
- **Need column details?** → Go to `memory/context/golfhelm-database.md`
- **Need enum values?** → Check the Enums section at bottom
- **Need TypeScript types?** → Check Type Locations at bottom
- **Need full feature behavior?** → Go to `memory/context/golfhelm-features.md`

---

## Table Name Rule

ALL golf tables use the `golf_` prefix. Never query without it.

| Wrong | Correct |
|-------|---------|
| `coaches` | `golf_coaches` |
| `players` | `golf_players` |
| `teams` | `golf_teams` |
| `rounds` | `golf_rounds` |
| `events` | `golf_events` |

---

## Tables by Role & Feature (75 total)

### COACH Tables (AI + Management)

| Table | Feature | Purpose |
|-------|---------|---------|
| `golf_coaches` | Core | Coach profiles (user_id, team_id, org_id, name, email, title) |
| `golf_coach_settings` | Settings | Per-coach preferences |
| `golf_coach_philosophy` | CoachHelm | Philosophy (5 priorities, thresholds, weights, 11 alert toggles) |
| `golf_coachhelm_settings` | CoachHelm | Per-coach CoachHelm enable/disable |
| `golf_coach_insights` | Alerts/Insights | Coach-facing AI insights + alerts (type, priority, status) |
| `golf_coach_blocked_time` | Calendar | Coach blocked time slots (with recurring) |
| `golf_player_focus_areas` | Development | Coach-created development targets for players |
| `golf_insight_feedback` | Insights | Coach feedback on AI insights |
| `golf_insight_weights` | Insights | Insight scoring weights |
| `golf_insight_generation_log` | Insights | AI generation run logs |
| `golf_insight_effectiveness` | Analytics | Insight effectiveness metrics (partially populated) |

### PLAYER Tables (Data + Personal)

| Table | Feature | Purpose |
|-------|---------|---------|
| `golf_players` | Core | Player profiles (user_id, team_id, name, year, handicap, status, gpa) |
| `golf_player_settings` | Settings | Per-player preferences |
| `golf_player_classes` | Academics | Class schedules (name, instructor, days, times, building, credits) |
| `golf_player_insight_preferences` | CoachHelm | Player notification/display prefs (table exists, no UI) |
| `golf_player_courses` | Rounds | Player ↔ course favorites/history |
| `golf_player_stats_cache` | Stats | Aggregated stats (50+ columns: scoring, SG, putting, etc.) |
| `golf_putting_tendencies` | Stats | Putting analysis cache |
| `golf_player_availability_blocks` | Calendar | Player blocked time slots |
| `golf_player_attendance_stats` | Calendar | Per-player attendance metrics |

### TEAM Tables (Shared Features)

| Table | Feature | Purpose |
|-------|---------|---------|
| `golf_teams` | Core | Teams (org_id, name, season, invite_code) |
| `golf_team_members` | Roster | Team membership junction (status: active/inactive/redshirt/medical/transfer) |
| `golf_team_settings` | Settings | Per-team config (scoring format, handicap system, timezone, SG benchmark) |
| `golf_team_coach_staff` | Roster | Additional coaching staff |
| `golf_team_join_requests` | Roster | Pending player join requests |
| `golf_team_coachhelm_settings` | CoachHelm | Per-team CoachHelm enable/disable |

### ROUND & SHOT Tables

| Table | Feature | Purpose |
|-------|---------|---------|
| `golf_rounds` | Round Tracking | Round records (player, course, scores, weather, status, qualifier_id) |
| `golf_holes` | Round Tracking | Per-hole data (par, yardage, score, putts, fairway, GIR) |
| `golf_shots` | Round Tracking | Shot-level (club, distance, lie, result, shot_type, miss direction) |
| `golf_round_stats_cache` | Stats | Per-round stat summaries |
| `golf_round_reviews` | Round Review | AI-generated reviews (summary, highlights, patterns, SG) |
| `golf_review_events` | Round Review | Review event tracking |
| `golf_review_insights` | Round Review | Insights extracted from reviews |

### COURSE Tables

| Table | Feature | Purpose |
|-------|---------|---------|
| `golf_courses` | Courses | Course records (name, city, state, rating, slope) |
| `golf_course_holes` | Courses | Per-hole course data (par, yardage, handicap index) |

### EVENT & CALENDAR Tables (17)

| Table | Feature | Purpose |
|-------|---------|---------|
| `golf_events` | Calendar | Team events (practice, tournament, qualifier, meeting, travel) |
| `golf_event_attendance` | Calendar | Player RSVP + check-in records |
| `golf_event_exclusions` | Calendar | Player exclusions from events |
| `golf_event_status_log` | Calendar | Event status change history |
| `golf_availability_polls` | Calendar | Availability polling for events |
| `golf_poll_responses` | Calendar | Player responses to polls |
| `golf_academic_exclusions` | Calendar | Class-based scheduling conflicts |
| `golf_attendance_summary` | Calendar | Aggregated attendance stats |
| `golf_calendar_feeds` | Calendar | iCal feed subscriptions |
| `golf_calendar_notifications` | Calendar | Calendar notification preferences |
| `golf_calendar_sync_log` | Calendar | Sync operation history |
| `golf_calendar_sync_state` | Calendar | Current sync state per provider |
| `golf_external_calendars` | Calendar | External calendar connections |
| `golf_recurring_events` | Calendar | Recurring event definitions |

### COMMUNICATION Tables

| Table | Feature | Purpose |
|-------|---------|---------|
| `golf_announcements` | Announcements | Team announcements (urgency, acknowledgement) |
| `golf_announcement_acknowledgements` | Announcements | Player acknowledgement records |
| `golf_announcement_documents` | Announcements | Linked documents on announcements |
| `golf_announcement_recipients` | Announcements | Targeted announcement recipients |
| `golf_announcement_tasks` | Announcements | Tasks linked to announcements |
| `golf_conversations` | Messaging | Message threads |
| `golf_conversation_participants` | Messaging | Thread membership |
| `golf_messages` | Messaging | Individual messages |
| `golf_message_attachments` | Messaging | File attachments on messages |

### TASK Tables

| Table | Feature | Purpose |
|-------|---------|---------|
| `golf_tasks` | Tasks | Coach-assigned tasks (title, due_date, urgency) |
| `golf_task_assignments` | Tasks | Task ↔ player assignments (⚠️ completeTask writes here) |
| `golf_task_completions` | Tasks | Legacy completion records (⚠️ Player Hub reads here — dual-table bug) |
| `golf_task_templates` | Tasks | Reusable task templates |
| `golf_task_reminders` | Tasks | Scheduled reminders (NOT auto-triggered) |

### DOCUMENT Tables

| Table | Feature | Purpose |
|-------|---------|---------|
| `golf_documents` | Documents | Team document library |
| `golf_document_versions` | Documents | Document version history |

### TRAVEL Tables

| Table | Feature | Purpose |
|-------|---------|---------|
| `golf_travel_itineraries` | Travel | Trip itineraries (transport, hotel, flight, gear, room assignments) |
| `golf_travel_budgets` | Travel | Trip budgets (SCAFFOLDED — no CRUD) |
| `golf_travel_expenses` | Travel | Expense records (SCAFFOLDED — partial) |
| `golf_travel_expense_splits` | Travel | Per-player expense splits (SCAFFOLDED — no actions) |

### QUALIFIER Tables

| Table | Feature | Purpose |
|-------|---------|---------|
| `golf_qualifiers` | Qualifiers | Qualifier events (course, rounds, spots, status) |
| `golf_qualifier_entries` | Qualifiers | Player entries with scores and positions |

### COACHHELM AI Tables (Engine + Patterns + Predictions)

> Note: `golf_coach_philosophy`, `golf_coach_insights`, `golf_coachhelm_settings`, and related tables are in the COACH section above — they are coach-owned but feed the CoachHelm engine.

| Table | Feature | Purpose |
|-------|---------|---------|
| `golf_patterns_v2` | Patterns | Detected patterns (type, confidence, lifecycle: detected→confirmed→addressed→resolved) |
| `golf_learned_behavior` | CoachHelm | Learned player behaviors |
| `golf_predictions` | CoachHelm | Performance predictions (score, SG, with confidence) |
| `golf_validations` | CoachHelm | Prediction accuracy validation |
| `golf_prediction_model_performance` | CoachHelm | Model performance tracking |

### SHARED Tables (not golf-prefixed)

| Table | Feature | Purpose |
|-------|---------|---------|
| `users` | Auth | Auth records (email, last_seen, role) |
| `organizations` | Core | Organization records |
| `notifications` | Platform | Cross-sport notifications |

---

## Enums (use these exact values)

| Enum | Values |
|------|--------|
| PlayerYear | `freshman`, `sophomore`, `junior`, `senior`, `graduate` |
| PlayerStatus | `active`, `inactive`, `redshirt`, `medical`, `transfer` |
| EventType | `practice`, `tournament`, `qualifier`, `meeting`, `travel`, `other` |
| RoundType | `practice`, `tournament`, `qualifier`, `competition` |
| RoundStatus | `in_progress`, `completed`, `cancelled`, `verified` |
| QualifierStatus | `upcoming`, `in_progress`, `completed`, `cancelled` |
| TaskStatus | `pending`, `in_progress`, `completed`, `overdue` |
| TaskUrgency | `low`, `normal`, `high`, `urgent` |
| AlertSensitivity | `aggressive`, `balanced`, `conservative` |
| ShotType | `tee`, `approach`, `around_green`, `putting`, `penalty` |
| LieBefore | `tee`, `fairway`, `rough`, `sand`, `green`, `other` |
| PuttBreak | `left_to_right`, `right_to_left`, `straight`, `multiple` |
| FocusAreaType | `driving`, `iron_play`, `short_game`, `putting`, `course_management`, `mental_game`, `fitness`, `other` |
| PatternLifecycle | `detected`, `confirmed`, `addressed`, `resolved`, `dismissed` |
| AlertLevel | `critical`, `warning`, `info`, `suggestion` |
| RSVPStatus | `pending`, `accepted`, `declined`, `tentative` |

---

## Acronyms & Terms

| Term | Meaning |
|------|---------|
| SG | Strokes Gained — core golf performance metric |
| GIR | Green in Regulation |
| FIR | Fairway in Regulation (fairway hit) |
| CoachHelm | AI intelligence layer for coaching insights |
| RLS | Row Level Security (Supabase/Postgres) |
| NLG | Natural Language Generation (CoachHelm review text) |

---

## TypeScript Type Locations

| Type | File |
|------|------|
| GolfCoach, GolfPlayer, GolfTeam, GolfRound, GolfHole, GolfShot | `src/lib/types/golf.ts` |
| GolfCourse, GolfCourseHole, GolfCourseTee | `src/lib/types/golf-course.ts` |
| CoachPhilosophy, AlertType | `src/lib/coachhelm/types.ts` |
| V2 Intelligence types | `src/lib/coachhelm/v2/types.ts` |
| CalendarEvent, CalendarFeed | `src/lib/types/calendar.ts` |
| All types re-exported from | `src/lib/types/index.ts` |


---

## Auto-generated inventory: tables

<!-- AUTOGEN:tables:start -->
<!-- DO NOT EDIT — regenerated by scripts/regen-docs.mjs -->

**266 tables**, 7 views, 153 functions (source: `src/lib/types/database.ts`).

<details><summary>Full alphabetical table list</summary>

- `admin_allowlist`
- `admin_analytics_events`
- `admin_api_perf_log`
- `admin_client_errors`
- `admin_events`
- `api_call_logs`
- `approach_miss_details`
- `audit_log`
- `auth_metrics_hourly`
- `auth_rate_limits`
- `background_job_logs`
- `baseball_academic_eligibility`
- `baseball_actions`
- `baseball_ai_audit`
- `baseball_announcement_acknowledgements`
- `baseball_announcement_recipients`
- `baseball_announcements`
- `baseball_baserunning_events`
- `baseball_batted_ball_events`
- `baseball_box_score_batting`
- `baseball_box_score_pitching`
- `baseball_box_score_uploads`
- `baseball_camp_registrations`
- `baseball_camps`
- `baseball_catching_events`
- `baseball_class_conflicts`
- `baseball_coach_insights`
- `baseball_coach_notes`
- `baseball_coach_philosophy`
- `baseball_coach_player_notes`
- `baseball_coach_recruiting_philosophy`
- `baseball_coaches`
- `baseball_conversation_participants`
- `baseball_conversations`
- `baseball_decision_log`
- `baseball_demo_sessions`
- `baseball_developmental_plans`
- `baseball_document_versions`
- `baseball_documents`
- `baseball_event_acknowledgements`
- `baseball_event_attendance`
- `baseball_events`
- `baseball_exercises`
- `baseball_fielding_events`
- `baseball_games`
- `baseball_import_runs`
- `baseball_import_sources`
- `baseball_integration_configs`
- `baseball_lineup_positions`
- `baseball_meeting_items`
- `baseball_messages`
- `baseball_notifications`
- `baseball_pitch_events`
- `baseball_plate_appearances`
- `baseball_player_aggregates`
- `baseball_player_classes`
- `baseball_player_comparisons`
- `baseball_player_daily_contracts`
- `baseball_player_development_metrics`
- `baseball_player_engagement_events`
- `baseball_player_external_ids`
- `baseball_player_passport_settings`
- `baseball_player_passport_share_tokens`
- `baseball_player_percentiles`
- `baseball_player_season_stats`
- `baseball_player_settings`
- `baseball_player_stats`
- `baseball_player_timeline_events`
- `baseball_players`
- `baseball_postgame_review_items`
- `baseball_postgame_reviews`
- `baseball_practice_attendance`
- `baseball_practice_block_objectives`
- `baseball_practice_blocks`
- `baseball_practice_effectiveness_reviews`
- `baseball_practice_lineup_slots`
- `baseball_practice_scrimmages`
- `baseball_practices`
- `baseball_program_settings`
- `baseball_recruiting_interests`
- `baseball_seasons`
- `baseball_settings_audit_log`
- `baseball_signals`
- `baseball_staff_audit_events`
- `baseball_staff_invitations`
- `baseball_stat_sources`
- `baseball_stat_uploads`
- `baseball_stat_visual_views`
- `baseball_swing_events`
- `baseball_task_assignments`
- `baseball_task_templates`
- `baseball_tasks`
- `baseball_team_coach_staff`
- `baseball_team_invitations`
- `baseball_team_lineups`
- `baseball_team_members`
- `baseball_teams`
- `baseball_timeline_event_acks`
- `baseball_travel_expenses`
- `baseball_travel_itineraries`
- `baseball_video_events`
- `baseball_videos`
- `baseball_watchlists`
- `baseball_workload_events`
- `billing_customers`
- `billing_invoices`
- `crm_automations`
- `crm_coaches`
- `crm_contact_log`
- `crm_email_suppressions`
- `crm_email_templates`
- `crm_email_templates_backup_20260720`
- `crm_events`
- `crm_google_calendar_tokens`
- `crm_notes`
- `crm_replies`
- `crm_segments`
- `crm_sequence_enrollments`
- `crm_sequence_steps`
- `crm_sequences`
- `crm_stage_transitions`
- `crm_tasks`
- `crm_unmatched_inbound`
- `demo_requests`
- `device_tokens`
- `email_clicks`
- `email_events`
- `emails`
- `error_logs`
- `error_rate_hourly`
- `golf_academic_exclusions`
- `golf_announcement_acknowledgements`
- `golf_announcement_documents`
- `golf_announcement_recipients`
- `golf_announcement_tasks`
- `golf_announcements`
- `golf_attendance_summary`
- `golf_calendar_feeds`
- `golf_calendar_notifications`
- `golf_causal_relationships`
- `golf_coach_behavior_log`
- `golf_coach_blocked_time`
- `golf_coach_insights`
- `golf_coach_philosophy`
- `golf_coach_player_intent`
- `golf_coaches`
- `golf_coachhelm_action_runs`
- `golf_coachhelm_chat_conversations`
- `golf_coachhelm_chat_messages`
- `golf_coachhelm_coach_weights`
- `golf_coachhelm_llm_budget`
- `golf_coachhelm_llm_calls`
- `golf_coachhelm_settings`
- `golf_confidence_calibration`
- `golf_conversation_participants`
- `golf_conversations`
- `golf_course_edit_history`
- `golf_course_holes`
- `golf_course_tee_edit_history`
- `golf_course_tee_holes`
- `golf_course_tees`
- `golf_courses`
- `golf_demo_sessions`
- `golf_document_versions`
- `golf_documents`
- `golf_drills`
- `golf_event_attendance`
- `golf_event_documents`
- `golf_events`
- `golf_global_patterns`
- `golf_goal_suggestions`
- `golf_goals`
- `golf_holes`
- `golf_ingest_connections`
- `golf_ingest_sync_log`
- `golf_insight_action`
- `golf_insight_drill_attachments`
- `golf_insight_effectiveness`
- `golf_insight_exposure`
- `golf_insight_generation_log`
- `golf_insight_outcome`
- `golf_insight_outcome_attribution`
- `golf_insight_player_feedback`
- `golf_learned_behavior`
- `golf_message_attachments`
- `golf_messages`
- `golf_metrics`
- `golf_patterns_v2`
- `golf_pga_standards`
- `golf_platform_metrics_daily`
- `golf_player_classes`
- `golf_player_courses`
- `golf_player_focus_areas`
- `golf_player_genome`
- `golf_player_notification_state`
- `golf_player_standing`
- `golf_player_stats_cache`
- `golf_players`
- `golf_practice_sessions`
- `golf_prediction_model_performance`
- `golf_prediction_validations`
- `golf_predictions`
- `golf_qualifier_entries`
- `golf_qualifier_round_courses`
- `golf_qualifier_selections`
- `golf_qualifiers`
- `golf_recruit_documents`
- `golf_recruits`
- `golf_review_events`
- `golf_round_reviews`
- `golf_round_stats_cache`
- `golf_rounds`
- `golf_shots`
- `golf_task_assignments`
- `golf_task_reminders`
- `golf_task_templates`
- `golf_tasks`
- `golf_team_coach_staff`
- `golf_team_coachhelm_settings`
- `golf_team_join_requests`
- `golf_team_members`
- `golf_team_saved_courses`
- `golf_team_settings`
- `golf_teams`
- `golf_travel_budgets`
- `golf_travel_expenses`
- `golf_travel_itineraries`
- `helm_lifting_athletes`
- `helm_lifting_availability_statuses`
- `helm_lifting_bodyweight_entries`
- `helm_lifting_coach_assignments`
- `helm_lifting_coach_invites`
- `helm_lifting_coaches`
- `helm_lifting_days`
- `helm_lifting_exercise_substitutions`
- `helm_lifting_exercises`
- `helm_lifting_group_audit`
- `helm_lifting_group_members`
- `helm_lifting_groups`
- `helm_lifting_import_rows`
- `helm_lifting_import_runs`
- `helm_lifting_maxes`
- `helm_lifting_nutrition_plan_assignments`
- `helm_lifting_nutrition_plans`
- `helm_lifting_org_viewers`
- `helm_lifting_prescriptions`
- `helm_lifting_program_assignments`
- `helm_lifting_programs`
- `helm_lifting_prs`
- `helm_lifting_readiness_checkins`
- `helm_lifting_sections`
- `helm_lifting_session_exercises`
- `helm_lifting_sessions`
- `helm_lifting_set_results`
- `helm_lifting_soreness_check_requests`
- `helm_lifting_soreness_check_schedules`
- `helm_lifting_soreness_maps`
- `helm_lifting_weeks`
- `helm_lifting_weight_checkin_requests`
- `helm_lifting_weight_checkin_schedules`
- `login_attempts`
- `notifications`
- `organizations`
- `push_subscriptions`
- `putt_details`
- `users`

</details>

<details><summary>Views (7)</summary>

- `baseball_coaches_public`
- `baseball_team_coach_staff_public`
- `baseball_teams_public_profile`
- `crm_coach_engagement`
- `crm_email_events`
- `organizations_public_profile`
- `v_crm_coaches_by_school`

</details>

<details><summary>Database functions (153)</summary>

- `__admin_rollup_b_gate()`
- `baseball_accept_staff_invite()`
- `baseball_announcement_has_recipients()`
- `baseball_announcement_is_recipient()`
- `baseball_can_invite_staff()`
- `baseball_is_announcement_coach()`
- `baseball_register_for_camp()`
- `baseball_replace_lineup_positions()`
- `baseball_staff_has_note_capability()`
- `calculate_round_strokes_gained()`
- `can_insert_baseball_team_member()`
- `can_manage_baseball_lift_group()`
- `can_notify_baseball_user()`
- `coach_id_for_team()`
- `current_coach_id()`
- `current_player_id()`
- `find_baseball_player_by_email_for_roster()`
- `get_active_sessions()`
- `get_admin_analytics_rollup()`
- `get_admin_baseball_rollup()`
- `get_admin_coachhelm_rollup()`
- `get_admin_dashboard_rollup()`
- `get_admin_errors_rollup()`
- `get_admin_event_summary()`
- `get_admin_feature_adoption_rollup()`
- `get_admin_platform_stat_averages()`
- `get_admin_rounds_rollup()`
- `get_admin_teams_scoring_rollup()`
- `get_admin_users_rollup()`
- `get_api_performance_summary()`
- `get_audit_log_recent()`
- `get_baseball_conversations_with_details()`
- `get_baseball_public_player_stats()`
- `get_baseball_team_join_context()`
- `get_coach_effectiveness_metrics()`
- `get_coach_today_schedule()`
- `get_crm_click_destinations()`
- `get_crm_coach_email_events()`
- `get_crm_coach_stage_history()`
- `get_crm_email_stats()`
- `get_crm_email_stats_detailed()`
- `get_crm_events_in_range()`
- `get_crm_funnel()`
- `get_crm_stage_ages()`
- `get_crm_template_performance()`
- `get_crm_time_to_open()`
- `get_crm_weekly_kpis()`
- `get_current_golf_player_id()`
- `get_current_player_team_ids()`
- `get_db_telemetry()`
- `get_enhanced_system_health()`
- `get_error_summary()`
- `get_feature_health()`
- `get_golf_conversations_with_details()`
- `get_golf_message_attachments()`
- `get_my_baseball_conversation_ids()`
- `get_my_baseball_player_id()`
- `get_my_coach_id()`
- `get_my_player_id()`
- `get_onboarding_funnel_analysis()`
- `get_pending_task_reminders()`
- `get_platform_health_stats()`
- `get_player_hub_announcements()`
- `get_player_hub_events()`
- `get_player_stats_summary()`
- `get_qualifier_leaderboard()`
- `get_resend_activity_stats()`
- `get_resend_domain_breakdown()`
- `get_shot_data_quality()`
- `get_team_health_dashboard()`
- `get_user_engagement_summary()`
- `get_user_golf_organization_id()`
- `get_user_golf_team_ids()`
- `get_user_last_active()`
- `get_users_with_auth()`
- `golf_normalize_name()`
- `has_any_baseball_team_membership()`
- `has_baseball_staff_capability()`
- `heartbeat()`
- `helm_lifting_accept_invite()`
- `helm_lifting_assign_team()`
- `helm_lifting_can_edit_org()`
- `helm_lifting_can_view_org()`
- `helm_lifting_coach_for_org()`
- `helm_lifting_is_head_coach_viewer()`
- `helm_lifting_is_my_athlete()`
- `helm_lifting_mark_athlete_onboarded()`
- `helm_lifting_sync_org_athletes()`
- `hypopg_reset()`
- `ingest_external_round_atomic()`
- `is_admin()`
- `is_baseball_player_recruiting_discoverable()`
- `is_baseball_primary_coach()`
- `is_baseball_team_coach()`
- `is_baseball_team_coach_v2()`
- `is_baseball_team_member()`
- `is_baseball_team_member_v2()`
- `is_baseball_team_player()`
- `is_baseball_team_staff()`
- `is_golf_coach()`
- `is_golf_team_coach()`
- `is_golf_team_head_coach()`
- `is_golf_team_player()`
- `is_golf_team_primary_coach()`
- `is_in_team()`
- `is_super_admin()`
- `is_team_coach()`
- `is_team_player()`
- `is_user_on_team()`
- `mark_golf_messages_read()`
- `mark_player_stats_stale()`
- `mark_task_reminder_sent()`
- `prune_stale_player_standing()`
- `recalculate_baseball_season_stats()`
- `recalculate_round_strokes_gained()`
- `recalculate_team_baseball_season_stats()`
- `recompute_golf_round_totals()`
- `recompute_team_sg()`
- `refresh_crm_coach_engagement()`
- `refresh_player_standing()`
- `refresh_player_standing_round_metrics()`
- `refresh_player_standing_shot_metrics()`
- `refresh_player_stats_cache()`
- `release_baseball_team_invitation_redemption()`
- `resolve_admin_event()`
- `resolve_baseball_team_by_join_code()`
- `resolve_baseball_team_invitation_by_code()`
- `revoke_user_sessions()`
- `run_integrity_checks()`
- `save_baseball_full_box_score()`
- `save_partial_round_atomic()`
- `select_stalest_teams()`
- `sg_baseline_scale()`
- `sg_estimate_from_holes()`
- `sg_normalize_lie()`
- `sg_scale_for_player()`
- `show_limit()`
- `show_trgm()`
- `submit_round_atomic()`
- `try_redeem_baseball_team_invitation()`
- `unresolve_admin_event()`
- `update_player_distance_proximity()`
- `update_player_putt_make_pct()`
- `update_player_stats_strokes_gained()`
- `update_qualifier_leaderboard()`
- `update_user_last_seen()`
- `user_conversation_ids()`
- `user_has_pending_join_request_to_coach_team()`
- `user_is_coach_of_golf_player()`
- `user_is_golf_team_member()`
- `user_is_teammate_of_golf_player()`
- `verify_coach_owns_player()`
- `verify_coach_owns_team()`

</details>

<!-- AUTOGEN:tables:end -->


---

## Auto-generated inventory: enums

<!-- AUTOGEN:enums:start -->
<!-- DO NOT EDIT — regenerated by scripts/regen-docs.mjs -->

**6 enums** (source: `src/lib/types/database.ts`).

| Enum | Values |
|------|--------|
| `admin_event_severity` | `info`, `warning`, `error`, `critical` |
| `baseball_player_type` | `college`, `juco`, `high_school`, `showcase` |
| `contact_type` | `email`, `call`, `demo`, `meeting`, `note` |
| `organization_type` | `college`, `juco`, `high_school`, `showcase` |
| `reminder_type` | `in_app`, `email`, `push`, `all` |
| `user_role` | `coach`, `player`, `admin` |

<!-- AUTOGEN:enums:end -->
