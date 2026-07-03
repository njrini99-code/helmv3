# Admin Dashboard & CRM — Database Context (Live Data Feb 16 2026)

## Platform Stats (REAL)
- 37 total users: 31 players, 5 coaches, 1 admin
- 18 have logged in, 19 never logged in (51% never-login rate!)
- 2 active in last 24h, 12 active 2-7d, 4 active 8-30d
- 4 teams: Demo University Golf, Men's Golf, Women's Golf, QA Test Golf Team
- 76 rounds (61 completed, 15 in_progress — 11 stale from same player on Feb 14)
- 11,353 shots tracked
- 103 coach insights generated, 4 round reviews
- 108 admin events (61 round_submitted, 37 signups, 4 ai_generation)
- 9 error logs (all LazyMotion warnings from Feb 11)

## CRM Stats (REAL)
- 354 coaches imported (D3: 251, D2: 103)
- Programs: both (250), mens (104)
- 53 unique conferences
- ALL 354 are status=new_lead (nobody moved through pipeline)
- 100% have email, 71% have title
- 0% have: phone, tags, notes, team_size, current_software, budget_range, pain_points
- 0 contact logs, 0 events, 0 starred, 0 prioritized
- 0 last_contacted_at, 0 next_follow_up_at

## Key Tables Available

### Admin/Monitoring
- `admin_events` (108 rows) - event_type, severity, title, message, metadata, user_id, resolved
- `admin_analytics_events` (47 rows) - user_id, event_type, page_path, feature_name, session_id, duration_ms
- `error_logs` (9 rows) - message, severity, stack, context, url, user_agent
- `admin_api_perf_log` (0 rows) - empty
- `admin_client_errors` (0 rows) - empty
- `login_attempts` (0 rows) - empty
- `page_views` (0 rows) - empty
- `audit_log` (0 rows) - empty

### CRM
- `crm_coaches` (354 rows) - full coach profile with status pipeline fields
- `crm_contact_log` (0 rows) - empty
- `crm_events` (0 rows) - empty
- `crm_google_calendar_tokens` (0 rows) - empty
- `demo_requests` (0 rows) - empty

### User/Team
- `users` (37 rows) - id, email, role, created_at, last_seen, notification_preferences
- `golf_teams` (4 rows) - name, organization, join_code, season
- `golf_coaches` (5 rows) - user_id, team_id
- `golf_players` (32 rows) - user profile data
- `golf_team_members` - junction table

### Activity
- `golf_rounds` (76 rows) - player_id, course, score, status, round_type
- `golf_shots` (11,353 rows) - detailed shot data
- `golf_events` (5 rows) - team events
- `golf_messages` (8 rows) - messaging
- `golf_announcements` (1 row)
- `golf_tasks` (0 rows)
- `notifications` (13 rows)

### AI/Intelligence
- `golf_coach_insights` (103 rows) - AI-generated insights
- `golf_round_reviews` (4 rows) - AI round reviews
- `golf_patterns_v2` (0 rows)
- `golf_predictions` (0 rows)

## What the Data Tells Us (Problems to Surface)
1. 51% of users NEVER logged in — onboarding is broken
2. 15 stale in_progress rounds (11 from one player) — data quality issue
3. CRM has 354 coaches but ZERO pipeline movement — CRM is unused
4. No contact logs, no events, no follow-ups — sales process not tracked
5. All errors are the same LazyMotion warning — not real diversity
6. Very low feature adoption (0 tasks, 0 qualifiers, 0 travel, 1 announcement)
7. Only 4 round reviews out of 76 rounds — AI underutilized
