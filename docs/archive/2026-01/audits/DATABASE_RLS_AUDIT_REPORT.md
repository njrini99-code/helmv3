# Database & RLS Security Audit Report

**Date:** 2026-01-13
**Project:** Helm Sports Labs (cwkrcnbgjvahchzzzetw)

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Total Tables | 83 |
| Tables with RLS Enabled | 83 (100%) |
| Tables Missing UPDATE Policy | 41 |
| Tables Referenced in Code but Missing from DB | 23 |
| SECURITY DEFINER Functions | 13 |
| Functions with Mutable Search Path | 22 |
| Critical Issues | 8 |
| Warnings | 35 |
| Suggestions | 15 |

---

## Critical Issues (P0 - Must Fix)

### 1. [CRITICAL] Missing Tables - Code References Non-Existent Tables

**Severity:** P0 - Application will crash
**Impact:** Runtime errors, broken features

The following tables are referenced in code but DO NOT EXIST in the database:

| Table Name | Usage Count | Files Affected |
|------------|-------------|----------------|
| `profile_views` | 9 | baseball-dashboard.ts, use-stats.ts, account/delete/route.ts |
| `golf_calendar_notifications` | 9 | rsvp.ts, event-lifecycle.ts, golf.ts |
| `golf_calendar_sync_state` | 7 | Multiple calendar sync files |
| `golf_player_courses` | 6 | Player course management |
| `golf_coach_blocked_time` | 5 | Coach availability blocking |
| `golf_availability_polls` | 4 | Availability polling system |
| `golf_external_calendars` | 4 | External calendar integration |
| `demo_requests` | 2 | Admin command center |
| `error_logs` | 1 | Error logging API |
| `player_dream_schools` | 1 | Dream schools manager |
| `putt_details` | 2 | Putt tracking system |
| `organization_settings` | 1 | Organization settings |
| `golf_poll_responses` | 2 | Poll response tracking |
| `golf_event_exclusions` | 2 | Event exclusions |
| `golf_calendar_feed_access` | 3 | Calendar feed access logs |
| `golf_calendar_sync_log` | 3 | Sync logging |
| `golf_player_availability_blocks` | 3 | Player availability |
| `golf_academic_exclusions` | 3 | Academic exclusions |
| `golf_attendance_summary` | 1 | Attendance summaries |
| `golf_event_status_log` | 1 | Event status history |
| `golf_player_attendance_stats` | 1 | Attendance statistics |
| `player_putt_tendencies` | 1 | Putt tendency analysis |
| `approach_miss_details` | 1 | Approach shot analysis |

**Fix:** Create migrations for all missing tables OR remove code references.

---

### 2. [CRITICAL] 41 Tables Missing UPDATE Policies

**Severity:** P0 - Data modification will fail
**Impact:** Users cannot update data in these tables

Tables missing UPDATE RLS policies:

```
baseball_coach_philosophy, baseball_player_aggregates, baseball_stat_uploads,
camp_registrations, coach_calendar_events, coach_notes, coach_recruiting_philosophy,
colleges, conversation_participants, conversations, golf_announcement_acknowledgements,
golf_calendar_syncs, golf_causal_relationships, golf_conversation_participants,
golf_conversations, golf_course_holes, golf_course_tees, golf_event_attendance,
golf_global_patterns, golf_insight_generation_log, golf_messages, golf_patterns_v2,
golf_player_insights, golf_qualifier_entries, golf_task_completions, golf_validations,
high_schools, login_attempts, messages, notifications, player_achievements,
player_comparisons, player_engagement_events, player_metrics, player_percentiles,
player_settings, recruiting_interests, team_members, video_views, videos, watchlists
```

**Fix:** Add UPDATE policies for each table based on ownership/role patterns.

---

### 3. [CRITICAL] Leaked Password Protection Disabled

**Severity:** P0 - Security vulnerability
**Impact:** Users can set compromised passwords

Supabase Auth's leaked password protection (HaveIBeenPwned check) is disabled.

**Fix:** Enable in Supabase Dashboard → Authentication → Password Settings

---

### 4. [CRITICAL] pg_trgm Extension in Public Schema

**Severity:** P0 - Security vulnerability
**Impact:** Extension can be manipulated by authenticated users

The `pg_trgm` extension is installed in the public schema instead of a protected schema.

**Fix:**
```sql
DROP EXTENSION IF EXISTS pg_trgm;
CREATE EXTENSION pg_trgm SCHEMA extensions;
```

---

## Security Warnings (P1 - Should Fix)

### 5. [WARNING] 22 Functions with Mutable Search Path

**Severity:** P1 - Potential SQL injection vector
**Impact:** Functions could reference wrong objects if search_path is manipulated

Affected functions:
- `update_philosophy_updated_at`
- `update_updated_at`
- `update_golf_updated_at_column`
- `set_dev_plan_sent_at`
- `get_active_dev_plans`
- `update_camp_status`
- `update_player_comparisons_updated_at`
- `update_qualifier_leaderboard`
- `get_player_class_schedule`
- `calculate_round_stats`
- `update_team_lineups_updated_at`
- `calculate_batting_avg`
- `calculate_obp`
- `update_baseball_stats_updated_at`
- `update_camp_counts`
- `calculate_profile_completion`
- `get_qualifier_leaderboard`
- `get_player_task_status`
- `get_player_engagement_trend`
- `calculate_slg`
- `generate_invite_code`
- `get_golf_round_summary`

**Fix:** Add `SET search_path = public` to each function definition.

Example:
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### 6. [WARNING] 13 SECURITY DEFINER Functions

**Severity:** P1 - Elevated privilege risk
**Impact:** Functions run with owner privileges, bypassing RLS

SECURITY DEFINER functions (require careful review):
1. `cleanup_old_login_attempts` - ✅ Expected (admin operation)
2. `coach_has_subscription` - ⚠️ Review needed
3. `generate_feed_token` - ✅ Expected (token generation)
4. `get_engagement_trends` - ⚠️ Review needed
5. `get_player_engagement_summary` - ⚠️ Review needed
6. `get_player_notes` - ⚠️ Review needed (may leak private data)
7. `get_recent_engagement` - ⚠️ Review needed
8. `get_upcoming_events` - ⚠️ Review needed
9. `handle_new_user` - ✅ Expected (auth trigger)
10. `player_has_subscription` - ⚠️ Review needed
11. `record_profile_view` - ✅ Expected (cross-user write)
12. `set_default_feed_token` - ✅ Expected (trigger)
13. `update_event_rsvp_counts` - ✅ Expected (denormalization trigger)

**Fix:** Review each function to ensure proper input validation and authorization checks.

---

### 7. [WARNING] RLS Not Forced on Any Table

**Severity:** P1 - Table owner bypass risk
**Impact:** Database owner/postgres role bypasses all RLS policies

All 83 tables have `relforcerowsecurity = false`.

**Fix:** For sensitive tables, add:
```sql
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE players FORCE ROW LEVEL SECURITY;
ALTER TABLE coaches FORCE ROW LEVEL SECURITY;
-- etc.
```

---

### 8. [WARNING] RLS InitPlan Performance Issues

**Severity:** P1 - Performance degradation
**Impact:** Slow queries due to suboptimal RLS policy evaluation

Tables with `auth_rls_initplan` warnings (policies evaluated per-row instead of once):
- `players` (5 policies)
- `coaches` (5 policies)
- `golf_tasks` (5 policies)
- `golf_shots` (5 policies)
- `golf_rounds` (5 policies)
- `golf_round_reviews` (5 policies)
- `golf_players` (5 policies)
- `golf_player_focus_areas` (5 policies)
- `golf_player_classes` (5 policies)
- `golf_holes` (5 policies)
- `golf_events` (5 policies)
- `golf_documents` (5 policies)
- `golf_coaches` (5 policies)
- `golf_coach_notes` (5 policies)
- `golf_announcements` (5 policies)
- `developmental_plans` (5 policies)

**Fix:** Rewrite policies to use `auth.uid()` directly instead of subqueries where possible.

---

## Suggestions (P2/P3 - Nice to Have)

### 9. [INFO] Unused Indexes Detected

Multiple unused indexes detected that consume storage but provide no benefit:
- `players` - 9 unused indexes
- `player_engagement_events` - 9 unused indexes
- `golf_rounds` - 6 unused indexes
- `events` - 6 unused indexes
- `developmental_plans` - 6 unused indexes
- `videos` - 5 unused indexes
- `golf_tasks` - 5 unused indexes
- `golf_qualifiers` - 5 unused indexes
- `golf_events` - 5 unused indexes
- `golf_announcements` - 5 unused indexes
- `coaches` - 5 unused indexes
- `coach_notes` - 5 unused indexes
- `coach_calendar_events` - 5 unused indexes
- `camps` - 5 unused indexes

**Fix:** Review index usage statistics and drop unused indexes:
```sql
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE idx_scan = 0;
```

---

### 10. [INFO] Tables in Database Not Used in Code

21 tables exist in the database but have no code references:
- `golf_announcement_acknowledgements`
- `golf_calendar_syncs`
- `golf_causal_relationships`
- `golf_coach_notes`
- `golf_coachhelm_settings`
- `golf_confidence_calibration`
- `golf_conversation_participants`
- `golf_conversations`
- `golf_course_tees`
- `golf_event_rsvps`
- `golf_global_patterns`
- `golf_learned_behavior`
- `golf_messages`
- `golf_patterns_v2`
- `golf_player_insights`
- `golf_predictions`
- `golf_recurring_events`
- `golf_task_completions`
- `golf_team_coachhelm_settings`
- `golf_validations`
- `player_achievements`

**Note:** These may be used by backend processes or planned features. Verify before removal.

---

## RLS Policy Coverage Matrix

### Baseball Tables

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| users | ✅ | ✅ | ✅ | ❌ |
| coaches | ✅ | ✅ | ✅ | ✅ |
| players | ✅ | ✅ | ✅ | ✅ |
| organizations | ✅ | ✅ | ✅ | ❌ |
| teams | ✅ | ✅ | ✅ | ❌ |
| team_members | ✅ | ✅ | ❌ | ✅ |
| watchlists | ✅ | ✅ | ❌ | ✅ |
| videos | ✅ | ✅ | ❌ | ✅ |
| conversations | ✅ | ✅ | ❌ | ❌ |
| messages | ✅ | ✅ | ❌ | ❌ |
| notifications | ✅ | ✅ | ❌ | ✅ |
| player_settings | ✅ | ✅ | ❌ | ❌ |
| developmental_plans | ✅ | ✅ | ✅ | ✅ |

### Golf Tables

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| golf_teams | ✅ | ✅ | ✅ | ✅ |
| golf_coaches | ✅ | ✅ | ✅ | ❌ |
| golf_players | ✅ | ✅ | ✅ | ❌ |
| golf_rounds | ✅ | ✅ | ✅ | ✅ |
| golf_holes | ✅ | ✅ | ✅ | ✅ |
| golf_shots | ✅ | ✅ | ✅ | ✅ |
| golf_events | ✅ | ✅ | ✅ | ✅ |
| golf_qualifiers | ✅ | ✅ | ✅ | ✅ |
| golf_tasks | ✅ | ✅ | ✅ | ✅ |
| golf_documents | ✅ | ✅ | ✅ | ✅ |

---

## Recommended Fix Priority

### Immediate (This Week)

1. **Create missing tables** for `profile_views`, `golf_calendar_notifications`, and other critical missing tables
2. **Enable leaked password protection** in Supabase Auth
3. **Add UPDATE policies** to tables that need them

### Short-term (This Sprint)

4. **Fix function search paths** for all 22 affected functions
5. **Move pg_trgm extension** to extensions schema
6. **Review SECURITY DEFINER functions** for proper authorization

### Medium-term (This Quarter)

7. **Optimize RLS policies** to avoid InitPlan performance issues
8. **Clean up unused indexes**
9. **Enable FORCE RLS** on sensitive tables
10. **Remove or implement unused database tables**

---

## Migration Script for Critical Fixes

```sql
-- Migration: fix_critical_issues.sql

-- 1. Create missing profile_views table (or view pointing to player_engagement_events)
CREATE OR REPLACE VIEW profile_views AS
SELECT
  id,
  player_id,
  coach_id,
  engagement_date AS viewed_at,
  created_at
FROM player_engagement_events
WHERE engagement_type = 'profile_view';

-- 2. Create golf_calendar_notifications table
CREATE TABLE IF NOT EXISTS golf_calendar_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES golf_events(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  message TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE golf_calendar_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "golf_calendar_notifications_select_own"
ON golf_calendar_notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "golf_calendar_notifications_insert_own"
ON golf_calendar_notifications FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "golf_calendar_notifications_update_own"
ON golf_calendar_notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE INDEX idx_golf_calendar_notifications_user ON golf_calendar_notifications(user_id);
CREATE INDEX idx_golf_calendar_notifications_event ON golf_calendar_notifications(event_id);

-- 3. Add UPDATE policies to critical tables (example for watchlists)
CREATE POLICY "watchlists_update_coach"
ON watchlists FOR UPDATE TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

-- 4. Fix function search paths (example)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Move pg_trgm to extensions schema
-- Note: This may require recreating dependent indexes
-- DROP EXTENSION pg_trgm;
-- CREATE EXTENSION pg_trgm SCHEMA extensions;
```

---

## Appendix: Full Table List with RLS Status

<details>
<summary>Click to expand all 83 tables</summary>

| # | Table | RLS Enabled | Policies |
|---|-------|-------------|----------|
| 1 | baseball_coach_insights | ✅ | 3 |
| 2 | baseball_coach_philosophy | ✅ | 2 |
| 3 | baseball_player_aggregates | ✅ | 3 |
| 4 | baseball_player_stats | ✅ | 4 |
| 5 | baseball_stat_uploads | ✅ | 3 |
| 6 | camp_registrations | ✅ | 4 |
| 7 | camps | ✅ | 4 |
| 8 | coach_calendar_events | ✅ | 2 |
| 9 | coach_notes | ✅ | 2 |
| 10 | coach_recruiting_philosophy | ✅ | 2 |
| 11 | coaches | ✅ | 5 |
| 12 | colleges | ✅ | 2 |
| 13 | conversation_participants | ✅ | 3 |
| 14 | conversations | ✅ | 3 |
| 15 | developmental_plans | ✅ | 5 |
| 16 | events | ✅ | 4 |
| 17 | golf_announcement_acknowledgements | ✅ | 3 |
| 18 | golf_announcements | ✅ | 5 |
| 19 | golf_calendar_feeds | ✅ | 4 |
| 20 | golf_calendar_syncs | ✅ | 3 |
| 21 | golf_causal_relationships | ✅ | 3 |
| 22 | golf_coach_insights | ✅ | 4 |
| 23 | golf_coach_notes | ✅ | 5 |
| 24 | golf_coach_philosophy | ✅ | 4 |
| 25 | golf_coaches | ✅ | 5 |
| 26 | golf_coachhelm_settings | ✅ | 4 |
| 27 | golf_confidence_calibration | ✅ | 4 |
| 28 | golf_conversation_participants | ✅ | 3 |
| 29 | golf_conversations | ✅ | 3 |
| 30 | golf_course_holes | ✅ | 3 |
| 31 | golf_course_tees | ✅ | 3 |
| 32 | golf_courses | ✅ | 4 |
| 33 | golf_documents | ✅ | 5 |
| 34 | golf_event_attendance | ✅ | 3 |
| 35 | golf_event_rsvps | ✅ | 4 |
| 36 | golf_events | ✅ | 5 |
| 37 | golf_global_patterns | ✅ | 3 |
| 38 | golf_holes | ✅ | 5 |
| 39 | golf_insight_generation_log | ✅ | 3 |
| 40 | golf_learned_behavior | ✅ | 4 |
| 41 | golf_messages | ✅ | 3 |
| 42 | golf_organizations | ✅ | 4 |
| 43 | golf_patterns_v2 | ✅ | 3 |
| 44 | golf_player_classes | ✅ | 5 |
| 45 | golf_player_focus_areas | ✅ | 5 |
| 46 | golf_player_insights | ✅ | 4 |
| 47 | golf_players | ✅ | 5 |
| 48 | golf_predictions | ✅ | 4 |
| 49 | golf_qualifier_entries | ✅ | 3 |
| 50 | golf_qualifiers | ✅ | 4 |
| 51 | golf_recurring_events | ✅ | 4 |
| 52 | golf_round_reviews | ✅ | 5 |
| 53 | golf_rounds | ✅ | 5 |
| 54 | golf_shots | ✅ | 5 |
| 55 | golf_task_completions | ✅ | 4 |
| 56 | golf_tasks | ✅ | 5 |
| 57 | golf_team_coachhelm_settings | ✅ | 4 |
| 58 | golf_team_settings | ✅ | 4 |
| 59 | golf_teams | ✅ | 4 |
| 60 | golf_travel_itineraries | ✅ | 4 |
| 61 | golf_validations | ✅ | 3 |
| 62 | high_schools | ✅ | 2 |
| 63 | lineup_positions | ✅ | 4 |
| 64 | login_attempts | ✅ | 2 |
| 65 | messages | ✅ | 3 |
| 66 | notifications | ✅ | 2 |
| 67 | organizations | ✅ | 4 |
| 68 | player_achievements | ✅ | 2 |
| 69 | player_comparisons | ✅ | 2 |
| 70 | player_engagement_events | ✅ | 3 |
| 71 | player_metrics | ✅ | 2 |
| 72 | player_percentiles | ✅ | 3 |
| 73 | player_settings | ✅ | 2 |
| 74 | players | ✅ | 5 |
| 75 | recruiting_interests | ✅ | 2 |
| 76 | team_coach_staff | ✅ | 4 |
| 77 | team_invitations | ✅ | 4 |
| 78 | team_lineups | ✅ | 4 |
| 79 | team_members | ✅ | 3 |
| 80 | teams | ✅ | 4 |
| 81 | users | ✅ | 4 |
| 82 | video_views | ✅ | 3 |
| 83 | videos | ✅ | 3 |
| 84 | watchlists | ✅ | 2 |

</details>

---

*Report generated by Claude Code comprehensive audit*
