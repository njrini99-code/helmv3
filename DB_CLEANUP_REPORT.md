# Database Cleanup Report - Helm Sports Labs

**Generated:** 2026-03-10
**Database:** Helm-Production (Supabase)
**Accuracy target:** ZERO false positives

---

## Summary

| Metric | Count |
|--------|-------|
| Total public tables | 155 |
| Confirmed referenced (in code) | 130 |
| Referenced via infrastructure only | 1 |
| Confirmed unreferenced | 24 |
| Tables with RLS policies | 151 |
| Views | 1 (unused) |
| Edge functions | 2 |
| Cron jobs | 0 (pg_cron not enabled) |
| Realtime publication tables | 4 |
| Dynamic `.from(variable)` patterns | 2 (both fully traceable) |

---

## Confirmed Unreferenced Tables (24)

These tables have **zero** application code references (no `.from()` calls, no camelCase variants, no dynamic patterns), **zero** infrastructure dependencies from referenced tables (no FK targets, no trigger side-effects, no view usage, no function calls), and are safe candidates for deprecation.

### Golf Tables (15)

| Table | Columns | FK Dependencies | Created In Migration | Notes |
|-------|---------|----------------|---------------------|-------|
| `golf_availability_polls` | 8 | FK target of `golf_poll_responses` (also unreferenced) | Calendar feature set | Polling feature never wired up |
| `golf_calendar_sync_log` | 7 | FK to `golf_calendar_sync_state` (also unreferenced) | Calendar sync feature | Calendar sync never completed |
| `golf_calendar_sync_state` | 6 | FK target of `golf_calendar_sync_log` (also unreferenced) | Calendar sync feature | Calendar sync never completed |
| `golf_coach_settings` | ~5 | None from referenced tables | Early schema | Superseded by `golf_coachhelm_settings` and `golf_team_settings` |
| `golf_event_exclusions` | 6 | None from referenced tables | Calendar feature | Player exclusion feature not wired |
| `golf_event_status_log` | 6 | None from referenced tables | Calendar feature | Event status audit log never read |
| `golf_external_calendars` | ~8 | None from referenced tables | Calendar feature | External calendar import never completed |
| `golf_insight_feedback` | ~7 | None from referenced tables | CoachHelm | Insight feedback loop not wired |
| `golf_insight_weights` | ~6 | None from referenced tables | CoachHelm | Custom insight weighting not wired |
| `golf_player_availability_blocks` | ~6 | None from referenced tables | Calendar feature | Player availability blocks never wired |
| `golf_player_insight_preferences` | ~5 | None from referenced tables | CoachHelm | Per-player insight prefs not wired |
| `golf_player_settings` | ~5 | None from referenced tables | Early schema | Distinct from `baseball_player_settings` (which IS used) |
| `golf_poll_responses` | ~5 | FK to `golf_availability_polls` (also unreferenced) | Calendar feature | Part of unused polling system |
| `golf_putting_tendencies` | ~25 | View `player_putt_tendencies` exists but is never queried | Stats feature | Data computed but never read by app |
| `golf_travel_expense_splits` | ~5 | None from referenced tables | Travel feature | Per-player expense splitting not wired |

### Baseball Tables (5)

| Table | Columns | FK Dependencies | Notes |
|-------|---------|----------------|-------|
| `baseball_academics` | ~8 | None from referenced tables | Superseded by `baseball_academic_eligibility` (which IS used) |
| `baseball_announcement_documents` | ~4 | None from referenced tables | Announcement-document link table never used |
| `baseball_announcement_tasks` | ~4 | None from referenced tables | Announcement-task link table never used |
| `baseball_coach_settings` | ~5 | None from referenced tables | Coach settings never wired up |
| `baseball_dream_schools` | ~5 | None from referenced tables | Dream schools feature not wired; `player_dream_schools` also unused |

### Shared/Platform Tables (4)

| Table | Columns | FK Dependencies | Notes |
|-------|---------|----------------|-------|
| `feature_flags` | ~6 | None from referenced tables | Feature flag system never implemented in code |
| `organization_settings` | ~5 | None from referenced tables | Only appears in a code comment as "not yet implemented" |
| `page_views` | ~6 | None from referenced tables | Superseded by `admin_analytics_events` (page_view events) |
| `player_dream_schools` | ~5 | None from referenced tables | Duplicate of `baseball_dream_schools`; neither is used |

---

## Needs Human Review (1)

### `golf_review_events`

| Aspect | Detail |
|--------|--------|
| **Status** | REFERENCED VIA INFRASTRUCTURE |
| **Code references** | Zero in application code |
| **Infrastructure** | Trigger `trigger_review_status_change` fires on `golf_round_reviews` (heavily used) and calls `log_review_status_change()` which INSERTs into this table |
| **Risk of removal** | Dropping this table would cause the trigger function to error on every round review status change |
| **Recommendation** | KEEP unless you also drop the trigger. The data is an audit trail of review status transitions. Consider whether you want this audit log. If not, drop the trigger first, then the table. |

---

## Referenced Tables (130)

### Golf (67 tables - all referenced in code)

| Table | Code Files | Reference Type |
|-------|-----------|----------------|
| `approach_miss_details` | golf.ts, stats-data.ts, continue round page | Direct |
| `golf_academic_exclusions` | calendar/availability.ts | Direct |
| `golf_announcement_acknowledgements` | announcements.ts | Direct |
| `golf_announcement_documents` | announcements.ts | Direct |
| `golf_announcement_recipients` | announcements.ts | Direct |
| `golf_announcement_tasks` | announcements.ts | Direct |
| `golf_announcements` | 6+ files (announcements, dashboard, admin) | Direct |
| `golf_attendance_summary` | attendance.ts | Direct |
| `golf_calendar_feeds` | calendar-feeds.ts | Direct |
| `golf_calendar_notifications` | calendar pages, email.ts | Direct |
| `golf_coach_blocked_time` | availability.ts | Direct |
| `golf_coach_insights` | 8+ files (insights, alerts, patterns, admin) | Direct |
| `golf_coach_philosophy` | insight-management.ts, intelligence | Direct |
| `golf_coachhelm_settings` | useCoachHelmSettings.ts, gate.ts | Direct |
| `golf_coaches` | 14+ files (auth, session, ownership, actions) | Direct |
| `golf_conversation_participants` | messages, notifications | Direct |
| `golf_conversations` | messages, admin-data | Direct |
| `golf_course_holes` | continue round, courses.ts | Direct |
| `golf_courses` | courses.ts, round-reviews.ts | Direct |
| `golf_document_versions` | documents.ts | Direct |
| `golf_documents` | 6+ files (documents, announcements) | Direct |
| `golf_event_attendance` | 7+ files (attendance, dashboard, RSVP) | Direct |
| `golf_events` | 18+ files (calendar, attendance, events) | Direct |
| `golf_holes` | 11+ files (rounds, stats, CoachHelm mining) | Direct |
| `golf_insight_effectiveness` | admin-data.ts, coachhelm-analytics.ts | Direct |
| `golf_insight_generation_log` | insights.ts, generate-review API | Direct |
| `golf_learned_behavior` | behavior-learner.ts | Direct |
| `golf_message_attachments` | message-attachments.ts | Direct |
| `golf_messages` | 8+ files (messages, admin, notifications) | Direct |
| `golf_patterns_v2` | 9+ files (patterns, insights, CoachHelm) | Direct |
| `golf_player_attendance_stats` | attendance.ts | Direct |
| `golf_player_classes` | classes page, availability.ts | Direct |
| `golf_player_courses` | golf.ts | Direct |
| `golf_player_focus_areas` | 6+ files (development, insights, reviews) | Direct |
| `golf_player_notification_state` | player-notifications.ts | Direct |
| `golf_player_stats_cache` | 4+ files (stats, dashboard, insights) | Direct |
| `golf_players` | 70+ files (most-referenced golf table) | Direct |
| `golf_poll_responses` | — | Unreferenced (see above) |
| `golf_prediction_model_performance` | admin-data.ts, coachhelm-analytics.ts | Direct |
| `golf_predictions` | 4+ files (CoachHelm prediction engine) | Direct |
| `golf_qualifier_entries` | 5+ files (qualifiers, CoachHelm) | Direct |
| `golf_qualifiers` | 8+ files (qualifiers, dashboard, admin) | Direct |
| `golf_review_insights` | round-reviews.ts | Direct |
| `golf_round_reviews` | 4+ files (reviews, admin, hooks) | Direct |
| `golf_round_stats_cache` | stats-calculator.ts, round-reviews.ts | Direct |
| `golf_rounds` | 44+ files (rounds, stats, CoachHelm, reviews) | Direct |
| `golf_shots` | 14+ files (rounds, stats, CoachHelm mining) | Direct |
| `golf_task_assignments` | 6+ files (tasks, announcements, hub) | Direct |
| `golf_task_reminders` | task-reminders.ts, edge function | Direct |
| `golf_task_templates` | task-templates.ts, tasks.ts | Direct |
| `golf_tasks` | 11+ files (tasks, announcements, dashboard) | Direct |
| `golf_team_coach_staff` | onboarding.ts, teams.ts | Direct |
| `golf_team_coachhelm_settings` | gate.ts | Direct |
| `golf_team_join_requests` | teams.ts | Direct |
| `golf_team_members` | 57+ files (second most-referenced) | Direct |
| `golf_team_settings` | 5+ files (calendar, settings, dashboard) | Direct |
| `golf_teams` | 50+ files (teams, calendar, auth, CoachHelm) | Direct |
| `golf_travel_budgets` | travel.ts | Direct |
| `golf_travel_expenses` | travel.ts, tests | Direct |
| `golf_travel_itineraries` | 6+ files (travel, hub, admin) | Direct |
| `golf_validations` | outcome-validator.ts, confidence-calibrator.ts | Direct |
| `putt_details` | 6+ files (rounds, stats, putting API) | Direct |

### Baseball (52 tables - all referenced in code)

All 52 baseball tables (excluding the 5 unreferenced above) are directly referenced in application code across actions, pages, components, and hooks.

### Admin (4 tables - all referenced)

| Table | Key Files |
|-------|----------|
| `admin_analytics_events` | useAnalyticsTracking.ts, admin-data.ts |
| `admin_api_perf_log` | useAdminRealtime.ts |
| `admin_client_errors` | useAdminRealtime.ts |
| `admin_events` | admin-logger.ts, AdminErrorHandler.tsx, admin-data.ts |

### CRM (5 tables - all referenced)

| Table | Key Files |
|-------|----------|
| `crm_coaches` | 11+ CRM component files |
| `crm_contact_log` | 7+ CRM files, webhooks |
| `crm_email_events` | webhooks/resend, CoachDetailPanel |
| `crm_events` | 5+ CRM files, Google Calendar sync |
| `crm_google_calendar_tokens` | Google Calendar OAuth routes |

### Shared/Platform (9 tables - referenced)

| Table | Key Files |
|-------|----------|
| `audit_log` | admin-data.ts |
| `demo_requests` | demo-request.ts, admin-data.ts |
| `device_tokens` | push.ts, push-notifications.ts |
| `error_logs` | error-logging.ts, log-error API |
| `login_attempts` | account-lockout.ts, admin-data.ts |
| `notifications` | use-notifications.ts, task-reminders, edge function |
| `organizations` | 12+ files (onboarding, auth, discover) |
| `push_subscriptions` | task-reminders.ts, edge function |
| `users` | 27+ files (auth, onboarding, actions) |

---

## Unreferenced Columns

> Column-level analysis was not performed for this report. Per the cleanup-db command rules, column analysis requires checking every column against `select('*')` patterns and `.select()`, `.insert()`, `.update()`, `.eq()`, `.order()` calls. Given the size of this codebase (256+ components, 41 action files), column-level analysis should be run as a follow-up task.

---

## Dynamic Pattern Analysis

### No Risk of Hidden Table References

1. **No string concatenation**: Zero instances of `'golf_' +` or `` `baseball_${...}` `` table name construction
2. **No config-driven tables**: No production config files listing table name arrays
3. **`fromUntyped()` wrapper**: All 15+ call sites pass string literals (deterministic)
4. **`messages.ts` sport-conditional**: Resolves to exactly 6 known tables (golf/baseball conversations, participants, messages)
5. **`ownership.ts` union type**: Constrained to exactly 3 tables (`golf_events`, `golf_players`, `golf_rounds`)

---

## Recommended Removal Steps

For the 24 confirmed unreferenced tables:

### Step 1: Deprecation Migration
```sql
-- Run in staging/preview first
ALTER TABLE golf_availability_polls RENAME TO _deprecated_golf_availability_polls;
ALTER TABLE golf_poll_responses RENAME TO _deprecated_golf_poll_responses;
ALTER TABLE golf_calendar_sync_log RENAME TO _deprecated_golf_calendar_sync_log;
ALTER TABLE golf_calendar_sync_state RENAME TO _deprecated_golf_calendar_sync_state;
ALTER TABLE golf_coach_settings RENAME TO _deprecated_golf_coach_settings;
ALTER TABLE golf_event_exclusions RENAME TO _deprecated_golf_event_exclusions;
ALTER TABLE golf_event_status_log RENAME TO _deprecated_golf_event_status_log;
ALTER TABLE golf_external_calendars RENAME TO _deprecated_golf_external_calendars;
ALTER TABLE golf_insight_feedback RENAME TO _deprecated_golf_insight_feedback;
ALTER TABLE golf_insight_weights RENAME TO _deprecated_golf_insight_weights;
ALTER TABLE golf_player_availability_blocks RENAME TO _deprecated_golf_player_availability_blocks;
ALTER TABLE golf_player_insight_preferences RENAME TO _deprecated_golf_player_insight_preferences;
ALTER TABLE golf_player_settings RENAME TO _deprecated_golf_player_settings;
ALTER TABLE golf_putting_tendencies RENAME TO _deprecated_golf_putting_tendencies;
ALTER TABLE golf_travel_expense_splits RENAME TO _deprecated_golf_travel_expense_splits;
ALTER TABLE baseball_academics RENAME TO _deprecated_baseball_academics;
ALTER TABLE baseball_announcement_documents RENAME TO _deprecated_baseball_announcement_documents;
ALTER TABLE baseball_announcement_tasks RENAME TO _deprecated_baseball_announcement_tasks;
ALTER TABLE baseball_coach_settings RENAME TO _deprecated_baseball_coach_settings;
ALTER TABLE baseball_dream_schools RENAME TO _deprecated_baseball_dream_schools;
ALTER TABLE feature_flags RENAME TO _deprecated_feature_flags;
ALTER TABLE organization_settings RENAME TO _deprecated_organization_settings;
ALTER TABLE page_views RENAME TO _deprecated_page_views;
ALTER TABLE player_dream_schools RENAME TO _deprecated_player_dream_schools;

-- Also deprecate the unused view
DROP VIEW IF EXISTS player_putt_tendencies;
```

### Step 2: Deploy to Preview/Staging

### Step 3: Run Full Test Suite
```bash
npm run typecheck
npm run lint
npm run build
```

### Step 4: Manual Smoke Test (1 week)
Monitor for any errors related to the renamed tables.

### Step 5: DROP Migration (after 1 week of stability)
Create a final migration to permanently drop the `_deprecated_*` tables.

### Step 6: External Integration Warning
- No webhooks reference these tables
- No Supabase Realtime subscriptions reference these tables
- No cron jobs reference these tables (pg_cron not enabled)
- RLS policies on these tables will be automatically dropped with the tables

---

## Dependency Order for Safe Removal

Remove in this order to respect FK constraints:

1. First: child tables (no other table depends on them)
   - `golf_poll_responses` (FK to `golf_availability_polls`)
   - `golf_calendar_sync_log` (FK to `golf_calendar_sync_state`)

2. Then: parent tables
   - `golf_availability_polls`
   - `golf_calendar_sync_state`

3. Then: all other standalone unreferenced tables (no cross-dependencies)
