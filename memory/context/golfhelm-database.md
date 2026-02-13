# GolfHelm Database Schema — Complete Reference

> Source: Production database (Helm-Production, project qmnssrrolpinvwjjnufo)
> Last verified: 2026-02-13
> Total golf tables: 74
>
> For table purposes and relationships, see `memory/glossary.md`
> For TypeScript types, see `src/lib/types/golf.ts` and `src/lib/types/golf-course.ts`

---

# Golf Database Schema

## golf_academic_exclusions

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| player_id | uuid | NO | - |
| start_date | date | NO | - |
| end_date | date | NO | - |
| reason | text | YES | - |
| excluded_by | uuid | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_announcement_acknowledgements

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| announcement_id | uuid | NO | - |
| player_id | uuid | NO | - |
| acknowledged_at | timestamp with time zone | YES | now() |

## golf_announcement_documents

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| announcement_id | uuid | NO | - |
| document_id | uuid | NO | - |
| sort_order | integer | YES | 0 |
| created_at | timestamp with time zone | YES | now() |

## golf_announcement_recipients

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| announcement_id | uuid | NO | - |
| player_id | uuid | NO | - |
| created_at | timestamp with time zone | YES | now() |

## golf_announcement_tasks

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| announcement_id | uuid | NO | - |
| task_id | uuid | NO | - |
| sort_order | integer | YES | 0 |
| created_at | timestamp with time zone | YES | now() |

## golf_announcements

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| team_id | uuid | NO | - |
| title | text | NO | - |
| body | text | YES | - |
| urgency | text | YES | 'normal'::text |
| requires_acknowledgement | boolean | YES | false |
| send_push | boolean | YES | false |
| send_email | boolean | YES | false |
| publish_at | timestamp with time zone | YES | - |
| published_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_attendance_summary

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| player_id | uuid | NO | - |
| team_id | uuid | NO | - |
| total_events | integer | YES | 0 |
| attended_count | integer | YES | 0 |
| absent_count | integer | YES | 0 |
| excused_count | integer | YES | 0 |
| attendance_percentage | numeric | YES | - |
| period_start_date | date | YES | - |
| period_end_date | date | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_availability_polls

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| team_id | uuid | NO | - |
| title | text | NO | - |
| description | text | YES | - |
| created_by | uuid | NO | - |
| date_options | jsonb | NO | '[]'::jsonb |
| time_options | jsonb | YES | '[]'::jsonb |
| duration_minutes | integer | YES | - |
| deadline | timestamp with time zone | YES | - |
| status | text | YES | 'open'::text |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_calendar_feeds

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| name | text | NO | 'Calendar Feed'::text |
| feed_type | text | YES | 'all_events'::text |
| feed_token | text | NO | encode(gen_random_bytes(32), 'hex'::text) |
| team_id | uuid | YES | - |
| player_id | uuid | YES | - |
| is_active | boolean | YES | true |
| last_synced_at | timestamp with time zone | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_calendar_notifications

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| event_id | uuid | NO | - |
| user_id | uuid | NO | - |
| notification_type | text | NO | - |
| message | text | YES | - |
| sent_at | timestamp with time zone | YES | - |
| read_at | timestamp with time zone | YES | - |
| created_at | timestamp with time zone | YES | now() |
| title | text | YES | - |
| action_url | text | YES | - |

## golf_calendar_sync_log

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| sync_state_id | uuid | YES | - |
| user_id | uuid | NO | - |
| sync_type | text | NO | - |
| status | text | NO | - |
| events_synced | integer | YES | 0 |
| events_created | integer | YES | 0 |
| events_updated | integer | YES | 0 |
| events_deleted | integer | YES | 0 |
| error_message | text | YES | - |
| started_at | timestamp with time zone | YES | now() |
| completed_at | timestamp with time zone | YES | - |
| created_at | timestamp with time zone | YES | now() |

## golf_calendar_sync_state

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| provider | text | NO | - |
| external_calendar_id | text | YES | - |
| sync_token | text | YES | - |
| last_sync_at | timestamp with time zone | YES | - |
| sync_enabled | boolean | YES | true |
| sync_direction | text | YES | 'both'::text |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_coach_blocked_time

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| coach_id | uuid | NO | - |
| start_date | date | NO | - |
| end_date | date | NO | - |
| start_time | time without time zone | YES | - |
| end_time | time without time zone | YES | - |
| reason | text | YES | - |
| is_recurring | boolean | YES | false |
| recurrence_rule | text | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_coach_insights

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| coach_id | uuid | YES | - |
| player_id | uuid | YES | - |
| team_id | uuid | YES | - |
| insight_type | text | NO | - |
| title | text | NO | - |
| content | text | YES | - |
| priority | text | YES | 'medium'::text |
| status | text | YES | 'active'::text |
| acknowledged_at | timestamp with time zone | YES | - |
| dismissed | boolean | YES | false |
| dismissed_at | timestamp with time zone | YES | - |
| resolved_at | timestamp with time zone | YES | - |
| metadata | jsonb | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| source_type | text | YES | 'system'::text |
| source_id | uuid | YES | - |
| action_taken | boolean | YES | false |
| action_type | text | YES | - |
| action_date | timestamp with time zone | YES | - |
| outcome_status | text | YES | - |
| outcome_measured_at | timestamp with time zone | YES | - |
| outcome_notes | text | YES | - |
| outcome_metric_name | text | YES | - |
| outcome_metric_before | numeric | YES | - |
| outcome_metric_after | numeric | YES | - |

## golf_coach_philosophy

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| coach_id | uuid | NO | - |
| priority_ball_striking | integer | YES | 1 |
| priority_short_game | integer | YES | 2 |
| priority_putting | integer | YES | 3 |
| priority_course_management | integer | YES | 4 |
| priority_mental_game | integer | YES | 5 |
| alert_sensitivity | text | YES | 'balanced'::text |
| decline_threshold | numeric | YES | 2.0 |
| pressure_gap_threshold | numeric | YES | 2.0 |
| bubble_zone_range | numeric | YES | 1.5 |
| coaching_philosophy | text | YES | - |
| expectations | text | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| weight_historical | integer | NO | 35 |
| weight_recent_form | integer | NO | 30 |
| weight_tournament | integer | NO | 20 |
| weight_qualifying | integer | NO | 10 |
| weight_subjective | integer | NO | 5 |
| alert_scoring_decline | boolean | NO | true |
| alert_stat_regression | boolean | NO | true |
| alert_tournament_pressure | boolean | NO | true |
| alert_plateau | boolean | NO | false |
| alert_bubble_player | boolean | NO | true |
| alert_surge_player | boolean | NO | true |
| alert_streaks | boolean | NO | true |
| alert_recurring_weakness | boolean | NO | true |
| alert_closing_holes | boolean | NO | false |
| alert_par_3_issues | boolean | NO | false |
| show_strokes_gained | boolean | NO | true |
| show_advanced_stats | boolean | NO | true |
| insight_verbosity | text | NO | 'detailed'::text |

## golf_coach_settings

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| coach_id | uuid | NO | - |
| email_notifications | boolean | YES | true |
| push_notifications | boolean | YES | true |
| notify_round_completed | boolean | YES | true |
| notify_messages | boolean | YES | true |
| notify_team_activity | boolean | YES | true |
| default_view | text | YES | 'roster'::text |
| timezone | text | YES | 'America/Chicago'::text |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_coaches

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| user_id | uuid | NO | - |
| organization_id | uuid | YES | - |
| full_name | text | YES | - |
| email | text | YES | - |
| phone | text | YES | - |
| avatar_url | text | YES | - |
| title | text | YES | - |
| bio | text | YES | - |
| onboarding_completed | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_coachhelm_settings

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| coach_id | uuid | NO | - |
| team_id | uuid | YES | - |
| enabled | boolean | YES | true |
| auto_insights | boolean | YES | true |
| weekly_summary | boolean | YES | true |
| trend_alerts | boolean | YES | true |
| insight_frequency | text | YES | 'daily'::text |
| min_rounds_for_insights | integer | YES | 3 |
| focus_areas | ARRAY | YES | '{}'::text[] |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| user_id | uuid | YES | - |
| disabled_at | timestamp with time zone | YES | - |
| disabled_reason | text | YES | - |

## golf_conversation_participants

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| conversation_id | uuid | NO | - |
| user_id | uuid | NO | - |
| joined_at | timestamp with time zone | YES | now() |
| last_read_at | timestamp with time zone | YES | - |

## golf_conversations

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| team_id | uuid | YES | - |
| is_team_chat | boolean | YES | false |
| title | text | YES | - |
| created_by | uuid | NO | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| is_team_channel | boolean | YES | false |

## golf_course_holes

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| course_id | uuid | NO | - |
| hole_number | integer | NO | - |
| par | integer | NO | - |
| yardage | integer | YES | - |
| handicap_index | integer | YES | - |
| created_at | timestamp with time zone | YES | now() |

## golf_courses

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| name | text | NO | - |
| city | text | YES | - |
| state | text | YES | - |
| country | text | YES | 'USA'::text |
| holes | integer | YES | 18 |
| par | integer | YES | - |
| course_rating | numeric | YES | - |
| slope_rating | integer | YES | - |
| created_at | timestamp with time zone | YES | now() |

## golf_document_versions

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| document_id | uuid | NO | - |
| version_number | integer | NO | - |
| file_url | text | NO | - |
| file_size | bigint | YES | - |
| uploaded_by | uuid | YES | - |
| change_notes | text | YES | - |
| created_at | timestamp with time zone | YES | now() |
| file_name | text | YES | - |
| mime_type | text | YES | - |
| storage_path | text | YES | - |

## golf_documents

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| team_id | uuid | NO | - |
| uploaded_by | uuid | YES | - |
| title | text | NO | - |
| description | text | YES | - |
| file_url | text | NO | - |
| file_type | text | YES | - |
| file_size | integer | YES | - |
| category | text | YES | - |
| is_public | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |
| current_version_id | uuid | YES | - |
| version_count | integer | YES | 1 |
| folder | text | YES | - |
| updated_at | timestamp with time zone | YES | now() |

## golf_event_attendance

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| event_id | uuid | NO | - |
| player_id | uuid | NO | - |
| status | text | YES | 'pending'::text |
| rsvp_at | timestamp with time zone | YES | - |
| checked_in | boolean | YES | false |
| checked_in_at | timestamp with time zone | YES | - |
| notes | text | YES | - |
| created_at | timestamp with time zone | YES | now() |
| notified_at | timestamp with time zone | YES | - |

## golf_event_exclusions

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| player_id | uuid | NO | - |
| event_id | uuid | NO | - |
| reason | text | YES | - |
| excluded_by | uuid | YES | - |
| created_at | timestamp with time zone | YES | now() |

## golf_event_status_log

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| event_id | uuid | NO | - |
| old_status | text | YES | - |
| new_status | text | NO | - |
| changed_by | uuid | YES | - |
| change_reason | text | YES | - |
| changed_at | timestamp with time zone | YES | now() |

## golf_events

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| team_id | uuid | NO | - |
| created_by | uuid | YES | - |
| title | text | NO | - |
| description | text | YES | - |
| event_type | text | NO | - |
| location | text | YES | - |
| course_id | uuid | YES | - |
| start_time | timestamp with time zone | NO | - |
| end_time | timestamp with time zone | YES | - |
| all_day | boolean | YES | false |
| recurring | boolean | YES | false |
| recurrence_rule | text | YES | - |
| parent_event_id | uuid | YES | - |
| status | text | YES | 'scheduled'::text |
| cancelled_at | timestamp with time zone | YES | - |
| cancellation_reason | text | YES | - |
| metadata | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| requires_rsvp | boolean | YES | false |
| rsvp_deadline | timestamp with time zone | YES | - |
| max_attendees | integer | YES | - |

## golf_external_calendars

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| player_id | uuid | NO | - |
| provider | text | NO | - |
| provider_calendar_id | text | YES | - |
| calendar_name | text | YES | - |
| is_synced | boolean | YES | true |
| sync_enabled | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_holes

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| round_id | uuid | NO | - |
| hole_number | integer | NO | - |
| par | integer | NO | - |
| score | integer | YES | - |
| putts | integer | YES | - |
| fairway_hit | boolean | YES | - |
| gir | boolean | YES | - |
| up_and_down | boolean | YES | - |
| sand_save | boolean | YES | - |
| penalty_strokes | integer | YES | 0 |
| notes | text | YES | - |
| created_at | timestamp with time zone | YES | now() |

## golf_insight_effectiveness

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| team_id | uuid | NO | - |
| period_start | date | NO | - |
| period_end | date | NO | - |
| insight_type | text | NO | - |
| insights_generated | integer | YES | 0 |
| insights_dismissed | integer | YES | 0 |
| insights_acted_upon | integer | YES | 0 |
| insights_with_outcome | integer | YES | 0 |
| outcomes_improved | integer | YES | 0 |
| outcomes_no_change | integer | YES | 0 |
| outcomes_worsened | integer | YES | 0 |
| action_rate | numeric | YES | - |
| improvement_rate | numeric | YES | - |
| effectiveness_score | numeric | YES | - |
| predictions_made | integer | YES | 0 |
| predictions_accurate | integer | YES | 0 |
| mean_absolute_error | numeric | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_insight_feedback

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| insight_id | uuid | NO | - |
| review_id | uuid | NO | - |
| coach_id | uuid | NO | - |
| accuracy | text | NO | - |
| feedback_text | text | YES | - |
| insight_type | text | NO | - |
| metric_name | text | YES | - |
| predicted_value | numeric | YES | - |
| actual_assessment | text | YES | - |
| was_overconfident | boolean | YES | - |
| was_underconfident | boolean | YES | - |
| error_category | text | YES | - |
| created_at | timestamp with time zone | YES | now() |

## golf_insight_generation_log

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| team_id | uuid | YES | - |
| player_id | uuid | YES | - |
| insight_type | text | YES | - |
| rounds_analyzed | integer | YES | - |
| insights_generated | integer | YES | - |
| engine_version | text | YES | - |
| duration_ms | integer | YES | - |
| created_at | timestamp with time zone | YES | now() |

## golf_insight_weights

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| team_id | uuid | YES | - |
| coach_id | uuid | YES | - |
| insight_type | text | NO | - |
| metric_name | text | YES | - |
| base_weight | numeric | YES | 1.0 |
| coach_adjustment | numeric | YES | 0.0 |
| accuracy_rate | numeric | YES | 0.5 |
| sample_size | integer | YES | 0 |
| threshold_multiplier | numeric | YES | 1.0 |
| last_updated_at | timestamp with time zone | YES | now() |

## golf_learned_behavior

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| entity_id | uuid | NO | - |
| entity_type | text | NO | - |
| interaction_type | text | NO | - |
| target_type | text | YES | - |
| timestamp | timestamp with time zone | NO | now() |
| metadata | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |

## golf_message_attachments

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| message_id | uuid | NO | - |
| file_name | text | NO | - |
| file_type | text | NO | - |
| mime_type | text | NO | - |
| file_size | integer | NO | - |
| storage_path | text | NO | - |
| url | text | YES | - |
| thumbnail_url | text | YES | - |
| width | integer | YES | - |
| height | integer | YES | - |
| duration_seconds | integer | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_messages

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| conversation_id | uuid | NO | - |
| sender_id | uuid | NO | - |
| content | text | NO | - |
| read | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |
| has_attachments | boolean | YES | false |
| edited_at | timestamp with time zone | YES | - |
| is_deleted | boolean | YES | false |

## golf_patterns_v2

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| player_id | uuid | NO | - |
| pattern_type | text | NO | - |
| conditions | jsonb | NO | '[]'::jsonb |
| outcome | jsonb | YES | - |
| support | numeric | NO | 0 |
| confidence | numeric | NO | 0 |
| lift | numeric | YES | 1 |
| conviction | numeric | YES | 1 |
| stroke_impact | numeric | YES | 0 |
| actionability | numeric | YES | 0 |
| sample_size | integer | YES | 0 |
| first_detected | timestamp with time zone | YES | now() |
| last_occurrence | timestamp with time zone | YES | now() |
| occurrence_count | integer | YES | 1 |
| trend | text | YES | - |
| is_active | boolean | YES | true |
| metadata | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| severity | text | YES | 'medium'::text |
| strokes_impact | numeric | YES | - |
| validated_by_coach | boolean | YES | false |
| validation_date | timestamp with time zone | YES | - |
| validator_coach_id | uuid | YES | - |
| source_round_ids | ARRAY | YES | '{}'::uuid[] |
| lifecycle_state | text | YES | 'detected'::text |
| resolved_at | timestamp with time zone | YES | - |
| resolution_notes | text | YES | - |

## golf_player_attendance_stats

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| player_id | uuid | NO | - |
| team_id | uuid | NO | - |
| period_start | date | NO | - |
| period_end | date | NO | - |
| total_events | integer | YES | 0 |
| attended_events | integer | YES | 0 |
| excused_absences | integer | YES | 0 |
| unexcused_absences | integer | YES | 0 |
| attendance_rate | numeric | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_player_availability_blocks

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| player_id | uuid | NO | - |
| start_date | date | NO | - |
| end_date | date | NO | - |
| start_time | time without time zone | YES | - |
| end_time | time without time zone | YES | - |
| reason | text | YES | - |
| recurrence_rule | text | YES | - |
| is_recurring | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_player_classes

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| player_id | uuid | NO | - |
| team_id | uuid | YES | - |
| class_name | text | NO | - |
| instructor | text | YES | - |
| days | ARRAY | YES | - |
| start_time | time without time zone | YES | - |
| end_time | time without time zone | YES | - |
| building | text | YES | - |
| room | text | YES | - |
| credits | integer | YES | - |
| color | text | YES | - |
| notes | text | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_player_courses

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| player_id | uuid | NO | - |
| course_id | uuid | YES | - |
| course_name | text | YES | - |
| relationship | text | YES | 'played'::text |
| rounds_played | integer | YES | 0 |
| best_score | integer | YES | - |
| average_score | numeric | YES | - |
| last_played_at | date | YES | - |
| notes | text | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_player_focus_areas

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| player_id | uuid | NO | - |
| team_id | uuid | YES | - |
| coach_id | uuid | YES | - |
| area_type | text | NO | - |
| title | text | NO | - |
| description | text | YES | - |
| status | text | YES | 'active'::text |
| target_metric | text | YES | - |
| current_value | numeric | YES | - |
| target_value | numeric | YES | - |
| started_at | timestamp with time zone | YES | now() |
| completed_at | timestamp with time zone | YES | - |
| notes | text | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| from_review_id | uuid | YES | - |
| from_insight_id | uuid | YES | - |
| review_context | text | YES | - |
| progress_notes | jsonb | YES | '[]'::jsonb |
| priority | integer | YES | 1 |

## golf_player_insight_preferences

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| player_id | uuid | NO | - |
| notify_performance_decline | boolean | YES | true |
| notify_improvement_detected | boolean | YES | true |
| notify_pattern_found | boolean | YES | true |
| notify_practice_suggestion | boolean | YES | true |
| enabled_insight_types | ARRAY | YES | ARRAY['performance_decline'::text, 'performance_improvement'::text, 'pattern_detected'::text, 'practice_recommendation'::text] |
| max_insights_per_week | integer | YES | 10 |
| min_severity_level | text | YES | 'low'::text |
| show_strokes_impact | boolean | YES | true |
| show_comparison_to_team | boolean | YES | true |
| preferred_verbosity | text | YES | 'standard'::text |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_player_settings

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| player_id | uuid | NO | - |
| email_notifications | boolean | YES | true |
| push_notifications | boolean | YES | true |
| notify_task_assigned | boolean | YES | true |
| notify_messages | boolean | YES | true |
| notify_event_reminder | boolean | YES | true |
| default_tees | text | YES | 'Blue'::text |
| timezone | text | YES | 'America/Chicago'::text |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_player_stats_cache

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| player_id | uuid | NO | - |
| scoring_average | numeric | YES | - |
| scoring_average_vs_par | numeric | YES | - |
| rounds_played | integer | YES | 0 |
| best_round | integer | YES | - |
| worst_round | integer | YES | - |
| par3_average | numeric | YES | - |
| par4_average | numeric | YES | - |
| par5_average | numeric | YES | - |
| eagles | integer | YES | 0 |
| birdies | integer | YES | 0 |
| pars | integer | YES | 0 |
| bogeys | integer | YES | 0 |
| double_bogeys | integer | YES | 0 |
| triple_plus | integer | YES | 0 |
| strokes_gained_total | numeric | YES | - |
| strokes_gained_tee | numeric | YES | - |
| strokes_gained_approach | numeric | YES | - |
| strokes_gained_around_green | numeric | YES | - |
| strokes_gained_putting | numeric | YES | - |
| driving_accuracy_percentage | numeric | YES | - |
| fairways_hit | integer | YES | 0 |
| fairways_total | integer | YES | 0 |
| driving_distance_average | numeric | YES | - |
| gir_percentage | numeric | YES | - |
| greens_hit | integer | YES | 0 |
| greens_total | integer | YES | 0 |
| approach_proximity_average | numeric | YES | - |
| scrambling_percentage | numeric | YES | - |
| scrambles_converted | integer | YES | 0 |
| scramble_attempts | integer | YES | 0 |
| sand_save_percentage | numeric | YES | - |
| sand_saves | integer | YES | 0 |
| sand_attempts | integer | YES | 0 |
| up_and_down_percentage | numeric | YES | - |
| putts_per_round | numeric | YES | - |
| putts_per_gir | numeric | YES | - |
| one_putt_percentage | numeric | YES | - |
| three_putt_percentage | numeric | YES | - |
| total_putts | integer | YES | 0 |
| putt_make_pct_0_3ft | numeric | YES | - |
| putt_make_pct_3_5ft | numeric | YES | - |
| putt_make_pct_5_10ft | numeric | YES | - |
| putt_make_pct_10_15ft | numeric | YES | - |
| putt_make_pct_15_20ft | numeric | YES | - |
| putt_make_pct_20_plus_ft | numeric | YES | - |
| putt_make_pct_left_to_right | numeric | YES | - |
| putt_make_pct_right_to_left | numeric | YES | - |
| putt_make_pct_straight | numeric | YES | - |
| penalty_strokes_per_round | numeric | YES | - |
| total_penalties | integer | YES | 0 |
| approach_miss_left_pct | numeric | YES | - |
| approach_miss_right_pct | numeric | YES | - |
| approach_miss_short_pct | numeric | YES | - |
| approach_miss_long_pct | numeric | YES | - |
| last_round_date | date | YES | - |
| rounds_in_calculation | integer | YES | 0 |
| calculation_period_start | date | YES | - |
| calculation_period_end | date | YES | - |
| engine_version | text | YES | 'v2'::text |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| rounds_this_season | integer | YES | 0 |
| season_start_date | date | YES | - |
| last_5_average | numeric | YES | - |
| last_10_average | numeric | YES | - |
| improvement_trend | numeric | YES | - |
| trend_direction | text | YES | - |
| sg_total_per_round | numeric | YES | - |
| sg_tee_per_round | numeric | YES | - |
| sg_approach_per_round | numeric | YES | - |
| sg_around_green_per_round | numeric | YES | - |
| sg_putting_per_round | numeric | YES | - |
| is_stale | boolean | YES | false |
| next_refresh_due | timestamp with time zone | YES | - |
| round_ids_included | ARRAY | YES | - |

## golf_players

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| user_id | uuid | NO | - |
| first_name | text | YES | - |
| last_name | text | YES | - |
| email | text | YES | - |
| phone | text | YES | - |
| avatar_url | text | YES | - |
| hometown | text | YES | - |
| state | text | YES | - |
| handicap | numeric | YES | - |
| handicap_index | numeric | YES | - |
| high_school_name | text | YES | - |
| graduation_year | integer | YES | - |
| gpa | numeric | YES | - |
| onboarding_completed | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| profile_complete | boolean | YES | false |

## golf_poll_responses

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| poll_id | uuid | NO | - |
| player_id | uuid | NO | - |
| date_option | text | NO | - |
| time_option | text | YES | - |
| is_available | boolean | NO | - |
| preference_level | integer | YES | - |
| notes | text | YES | - |
| created_at | timestamp with time zone | YES | now() |

## golf_prediction_model_performance

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| team_id | uuid | YES | - |
| model_type | text | NO | - |
| model_version | text | YES | - |
| period_start | date | NO | - |
| period_end | date | NO | - |
| predictions_made | integer | YES | 0 |
| predictions_validated | integer | YES | 0 |
| accuracy_rate | numeric | YES | - |
| mean_absolute_error | numeric | YES | - |
| root_mean_square_error | numeric | YES | - |
| calibration_score | numeric | YES | - |
| overconfidence_rate | numeric | YES | - |
| underconfidence_rate | numeric | YES | - |
| accuracy_by_confidence | jsonb | YES | '{}'::jsonb |
| error_distribution | jsonb | YES | '{}'::jsonb |
| systematic_bias | numeric | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_predictions

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| player_id | uuid | NO | - |
| metric | text | NO | - |
| predicted_value | numeric | NO | - |
| confidence | numeric | NO | 0 |
| confidence_interval_low | numeric | YES | - |
| confidence_interval_high | numeric | YES | - |
| prediction_window_days | integer | YES | 30 |
| trend | text | YES | - |
| key_drivers | jsonb | YES | '[]'::jsonb |
| input_features | jsonb | YES | '[]'::jsonb |
| model_version | text | YES | 'v2'::text |
| due_date | date | YES | - |
| validated_at | timestamp with time zone | YES | - |
| actual_value | numeric | YES | - |
| was_accurate | boolean | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| prediction_context | jsonb | YES | '{}'::jsonb |
| confidence_factors | jsonb | YES | '[]'::jsonb |
| error_analysis | jsonb | YES | '{}'::jsonb |
| error_category | text | YES | - |
| related_round_id | uuid | YES | - |
| related_event_id | uuid | YES | - |
| predicted_low | numeric | YES | - |
| predicted_high | numeric | YES | - |

## golf_putting_tendencies

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| player_id | uuid | NO | - |
| total_putts_analyzed | integer | YES | 0 |
| make_percentage_overall | numeric | YES | - |
| left_to_right_attempts | integer | YES | 0 |
| left_to_right_made | integer | YES | 0 |
| left_to_right_pct | numeric | YES | - |
| right_to_left_attempts | integer | YES | 0 |
| right_to_left_made | integer | YES | 0 |
| right_to_left_pct | numeric | YES | - |
| straight_attempts | integer | YES | 0 |
| straight_made | integer | YES | 0 |
| straight_pct | numeric | YES | - |
| miss_left_percentage | numeric | YES | - |
| miss_right_percentage | numeric | YES | - |
| miss_short_percentage | numeric | YES | - |
| miss_long_percentage | numeric | YES | - |
| avg_distance_on_makes_ft | numeric | YES | - |
| avg_distance_on_misses_ft | numeric | YES | - |
| short_putt_attempts | integer | YES | 0 |
| short_putt_made | integer | YES | 0 |
| short_putt_pct | numeric | YES | - |
| last_calculated | timestamp with time zone | YES | - |
| rounds_in_sample | integer | YES | 0 |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_qualifier_entries

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| qualifier_id | uuid | NO | - |
| player_id | uuid | NO | - |
| round_id | uuid | YES | - |
| status | text | YES | 'entered'::text |
| score | integer | YES | - |
| position | integer | YES | - |
| notes | text | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| total_score | integer | YES | - |
| total_to_par | integer | YES | - |
| rounds_completed | integer | YES | 0 |
| is_tied | boolean | YES | false |

## golf_qualifiers

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| team_id | uuid | NO | - |
| created_by | uuid | YES | - |
| name | text | NO | - |
| description | text | YES | - |
| course_id | uuid | YES | - |
| course_name | text | YES | - |
| start_date | date | NO | - |
| end_date | date | YES | - |
| status | text | YES | 'upcoming'::text |
| spots_available | integer | YES | - |
| entry_deadline | date | YES | - |
| rules | text | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_review_events

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| review_id | uuid | NO | - |
| player_id | uuid | NO | - |
| actor_id | uuid | YES | - |
| event_type | text | NO | - |
| event_data | jsonb | YES | '{}'::jsonb |
| notes | text | YES | - |
| created_at | timestamp with time zone | YES | now() |

## golf_review_insights

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| review_id | uuid | NO | - |
| round_id | uuid | NO | - |
| player_id | uuid | NO | - |
| insight_type | text | NO | - |
| title | text | NO | - |
| description | text | NO | - |
| severity | text | YES | 'info'::text |
| metric_name | text | YES | - |
| metric_value | numeric | YES | - |
| metric_baseline | numeric | YES | - |
| metric_comparison | text | YES | - |
| hole_numbers | ARRAY | YES | - |
| evidence | jsonb | YES | '[]'::jsonb |
| coach_accuracy | text | YES | - |
| coach_accuracy_at | timestamp with time zone | YES | - |
| coach_notes | text | YES | - |
| is_highlighted | boolean | YES | false |
| is_hidden | boolean | YES | false |
| created_focus_area_id | uuid | YES | - |
| confidence | numeric | YES | 0.75 |
| display_order | integer | YES | 0 |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_round_reviews

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| round_id | uuid | NO | - |
| player_id | uuid | NO | - |
| round_score | integer | YES | - |
| round_score_to_par | integer | YES | - |
| scoring_avg_before | numeric | YES | - |
| scoring_avg_after | numeric | YES | - |
| highlights | jsonb | YES | '[]'::jsonb |
| areas_to_review | jsonb | YES | '[]'::jsonb |
| round_stats | jsonb | YES | - |
| patterns_detected | jsonb | YES | '[]'::jsonb |
| summary | text | YES | - |
| primary_takeaway | text | YES | - |
| next_practice_priority | text | YES | - |
| coach_notes | text | YES | - |
| coach_viewed_at | timestamp with time zone | YES | - |
| shared_with_coach | boolean | YES | false |
| shared_at | timestamp with time zone | YES | - |
| engine_version | text | YES | 'v2'::text |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| ai_model_version | text | YES | - |
| sentiment_score | numeric | YES | - |
| regeneration_count | integer | YES | 0 |
| last_regenerated_at | timestamp with time zone | YES | - |
| insights_count | integer | YES | 0 |
| highlights_count | integer | YES | 0 |
| areas_count | integer | YES | 0 |
| status | text | YES | 'draft'::text |
| published_at | timestamp with time zone | YES | - |
| published_by | uuid | YES | - |
| coach_rating | integer | YES | - |
| coach_feedback_text | text | YES | - |
| player_viewed_at | timestamp with time zone | YES | - |
| player_acknowledged_at | timestamp with time zone | YES | - |
| action_items | jsonb | YES | '[]'::jsonb |
| version | integer | YES | 1 |
| generation_method | text | YES | 'v1'::text |

## golf_round_stats_cache

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| round_id | uuid | NO | - |
| player_id | uuid | NO | - |
| total_score | integer | YES | - |
| score_to_par | integer | YES | - |
| front_nine | integer | YES | - |
| back_nine | integer | YES | - |
| strokes_gained_total | numeric | YES | - |
| strokes_gained_tee | numeric | YES | - |
| strokes_gained_approach | numeric | YES | - |
| strokes_gained_around_green | numeric | YES | - |
| strokes_gained_putting | numeric | YES | - |
| fairways_hit | integer | YES | - |
| fairways_total | integer | YES | - |
| driving_distance_avg | numeric | YES | - |
| greens_hit | integer | YES | - |
| greens_total | integer | YES | - |
| total_putts | integer | YES | - |
| one_putts | integer | YES | - |
| three_putts | integer | YES | - |
| scrambles_converted | integer | YES | - |
| scramble_attempts | integer | YES | - |
| sand_saves | integer | YES | - |
| sand_attempts | integer | YES | - |
| eagles | integer | YES | 0 |
| birdies | integer | YES | 0 |
| pars | integer | YES | 0 |
| bogeys | integer | YES | 0 |
| double_bogeys | integer | YES | 0 |
| triple_plus | integer | YES | 0 |
| penalty_strokes | integer | YES | 0 |
| detailed_stats | jsonb | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_rounds

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| player_id | uuid | NO | - |
| team_id | uuid | YES | - |
| course_id | uuid | YES | - |
| course_name | text | YES | - |
| course_city | text | YES | - |
| course_state | text | YES | - |
| course_rating | numeric | YES | - |
| course_slope | integer | YES | - |
| tees_played | text | YES | - |
| round_date | date | NO | - |
| round_type | text | YES | 'practice'::text |
| holes_played | integer | YES | 18 |
| total_score | integer | YES | - |
| front_nine | integer | YES | - |
| back_nine | integer | YES | - |
| score_to_par | integer | YES | - |
| status | text | YES | 'in_progress'::text |
| current_hole | integer | YES | 1 |
| total_putts | integer | YES | - |
| total_fairways_hit | integer | YES | - |
| total_fairways | integer | YES | - |
| total_gir | integer | YES | - |
| total_gir_possible | integer | YES | - |
| weather_conditions | text | YES | - |
| notes | text | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| strokes_gained_total | numeric | YES | - |
| strokes_gained_tee | numeric | YES | - |
| strokes_gained_approach | numeric | YES | - |
| strokes_gained_around_green | numeric | YES | - |
| strokes_gained_putting | numeric | YES | - |
| qualifier_id | uuid | YES | - |
| qualifier_round_number | integer | YES | - |

## golf_shots

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| round_id | uuid | NO | - |
| hole_id | uuid | YES | - |
| hole_number | integer | NO | - |
| shot_number | integer | NO | - |
| shot_type | text | YES | - |
| club_used | text | YES | - |
| distance_to_hole_before | numeric | YES | - |
| distance_to_hole_after | numeric | YES | - |
| distance_unit | text | YES | 'yards'::text |
| shot_distance | numeric | YES | - |
| lie_before | text | YES | - |
| lie_after | text | YES | - |
| result | text | YES | - |
| is_penalty | boolean | YES | false |
| penalty_type | text | YES | - |
| putt_made | boolean | YES | - |
| putt_distance_feet | numeric | YES | - |
| putt_break | text | YES | - |
| putt_slope | text | YES | - |
| notes | text | YES | - |
| created_at | timestamp with time zone | YES | now() |
| club_type | text | YES | - |
| distance_unit_before | text | YES | 'yards'::text |
| distance_unit_after | text | YES | 'yards'::text |
| miss_direction | text | YES | - |
| updated_at | timestamp with time zone | YES | now() |

## golf_task_assignments

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| task_id | uuid | NO | - |
| player_id | uuid | NO | - |
| status | text | YES | 'pending'::text |
| completed_at | timestamp with time zone | YES | - |
| upload_url | text | YES | - |
| notes | text | YES | - |
| assigned_at | timestamp with time zone | YES | now() |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_task_reminders

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| task_id | uuid | NO | - |
| scheduled_for | timestamp with time zone | NO | - |
| reminder_type | USER-DEFINED | NO | 'in_app'::reminder_type |
| sent | boolean | NO | false |
| sent_at | timestamp with time zone | YES | - |
| error | text | YES | - |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

## golf_task_templates

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| team_id | uuid | NO | - |
| title | text | NO | - |
| description | text | YES | - |
| default_assignee_type | text | YES | 'all_players'::text |
| category | text | YES | - |
| default_priority | text | YES | 'normal'::text |
| default_due_days | integer | YES | - |
| created_by | uuid | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_tasks

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| team_id | uuid | NO | - |
| assigned_by | uuid | YES | - |
| assigned_to | uuid | YES | - |
| title | text | NO | - |
| description | text | YES | - |
| task_type | text | YES | - |
| due_date | date | YES | - |
| status | text | YES | 'pending'::text |
| completed_at | timestamp with time zone | YES | - |
| priority | text | YES | 'medium'::text |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| reminder_at | timestamp with time zone | YES | - |
| reminder_type | USER-DEFINED | YES | - |
| reminder_sent | boolean | YES | false |
| category | text | YES | - |

## golf_team_coach_staff

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| team_id | uuid | NO | - |
| coach_id | uuid | NO | - |
| role | text | YES | 'head_coach'::text |
| is_primary | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |

## golf_team_coachhelm_settings

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| team_id | uuid | NO | - |
| enabled | boolean | NO | true |
| disabled_at | timestamp with time zone | YES | - |
| disabled_by | uuid | YES | - |
| disabled_reason | text | YES | - |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

## golf_team_join_requests

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| team_id | uuid | NO | - |
| player_id | uuid | NO | - |
| status | text | NO | 'pending'::text |
| message | text | YES | - |
| rejection_reason | text | YES | - |
| reviewed_by | uuid | YES | - |
| reviewed_at | timestamp with time zone | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_team_members

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| team_id | uuid | NO | - |
| player_id | uuid | NO | - |
| status | USER-DEFINED | YES | 'pending'::team_member_status |
| jersey_number | integer | YES | - |
| joined_at | timestamp with time zone | YES | - |
| approved_by | uuid | YES | - |
| approved_at | timestamp with time zone | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_team_settings

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| team_id | uuid | NO | - |
| scoring_format | text | YES | 'stroke_play'::text |
| handicap_system | text | YES | 'usga'::text |
| default_tees | text | YES | 'blue'::text |
| timezone | text | YES | 'America/New_York'::text |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_teams

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | uuid_generate_v4() |
| organization_id | uuid | YES | - |
| name | text | NO | - |
| join_code | text | NO | - |
| logo_url | text | YES | - |
| primary_color | text | YES | - |
| secondary_color | text | YES | - |
| description | text | YES | - |
| season | text | YES | - |
| created_by | uuid | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| timezone | text | NO | 'America/New_York'::text |

## golf_travel_budgets

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| itinerary_id | uuid | NO | - |
| category | USER-DEFINED | NO | - |
| budgeted_amount | numeric | NO | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_travel_expense_splits

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| expense_id | uuid | NO | - |
| player_id | uuid | NO | - |
| amount | numeric | NO | - |
| paid | boolean | YES | false |
| paid_at | timestamp with time zone | YES | - |
| created_at | timestamp with time zone | YES | now() |

## golf_travel_expenses

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| itinerary_id | uuid | YES | - |
| team_id | uuid | NO | - |
| category | USER-DEFINED | NO | 'other'::golf_expense_category |
| description | text | NO | - |
| amount | numeric | NO | - |
| receipt_url | text | YES | - |
| paid_by | USER-DEFINED | NO | 'team'::golf_expense_paid_by |
| vendor_name | text | YES | - |
| expense_date | date | YES | - |
| notes | text | YES | - |
| created_by | uuid | NO | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_travel_itineraries

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| team_id | uuid | NO | - |
| event_id | uuid | YES | - |
| event_name | text | YES | - |
| destination | text | YES | - |
| transportation_type | text | YES | - |
| departure_date | date | YES | - |
| departure_time | time without time zone | YES | - |
| departure_location | text | YES | - |
| return_date | date | YES | - |
| return_time | time without time zone | YES | - |
| flight_info | jsonb | YES | - |
| hotel_name | text | YES | - |
| hotel_address | text | YES | - |
| hotel_phone | text | YES | - |
| hotel_confirmation | text | YES | - |
| room_assignments | jsonb | YES | - |
| uniform_requirements | text | YES | - |
| gear_list | ARRAY | YES | - |
| notes | text | YES | - |
| created_by | uuid | YES | - |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## golf_validations

| Column | Type | Nullable | Default |
|--------|------|----------|----------|
| id | uuid | NO | gen_random_uuid() |
| prediction_id | uuid | YES | - |
| player_id | uuid | NO | - |
| stated_confidence | numeric | NO | - |
| actual_value | numeric | YES | - |
| predicted_value | numeric | NO | - |
| was_correct | boolean | YES | - |
| error_margin | numeric | YES | - |
| calibration_bucket | text | YES | - |
| validated_at | timestamp with time zone | YES | now() |
| created_at | timestamp with time zone | YES | now() |

