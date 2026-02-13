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

## Tables by Role & Feature (74 total)

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
| `golf_task_assignments` | Tasks | Task ↔ player assignments |
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
