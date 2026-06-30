# Golf Platform — Helm Sports Labs

> College golf team management + CoachHelm AI intelligence
> Last updated: 2026-02-13

---

## Overview

GolfHelm provides college golf coaches with full team management and an AI-powered coaching intelligence system (CoachHelm). Players record rounds, track stats, and participate in team operations.

**All routes under:** `/golf/*`

---

## User Types

### Golf Coach (Administrator)
- Create team, invite players via invite code
- Full team management: roster, events, calendar, tasks, documents, travel
- View all player rounds, stats, and development
- CoachHelm AI: insights, patterns, predictions, round reviews
- Philosophy settings control AI prioritization

### Golf Player (Consumer + Data Provider)
- Join team via invite link from coach
- Record rounds with shot-by-shot tracking (50+ stats per round)
- View personal stats, development areas, and AI insights
- RSVP to events, complete tasks, view announcements
- Upload class schedule for conflict detection

---

## Directory Structure

```
src/app/golf/
├── (auth)/                      # Login, signup, forgot/reset password
├── (onboarding)/                # Coach (3-step) and player (4-step) onboarding
├── (dashboard)/dashboard/       # All dashboard pages (35+ routes)
│   ├── hub/                     # Dashboard home
│   ├── roster/, roster/[id]/    # Team roster + player profiles
│   ├── rounds/, rounds/create      # Round history + creation
│   ├── rounds/recover-draft        # Offline round recovery
│   ├── rounds/[id]/, rounds/[id]/review  # Round details + AI review
│   ├── rounds/continue/[id]     # Resume in-progress round
│   ├── calendar/                # Team calendar + RSVP
│   ├── qualifiers/              # Qualifier events + brackets
│   ├── stats/, stats/team       # Player + team statistics
│   ├── messages/                # Team messaging
│   ├── announcements/           # Team announcements
│   ├── tasks/                   # Task management
│   ├── documents/               # Document library
│   ├── travel/                  # Travel itineraries
│   ├── classes/                 # Player class schedules
│   ├── settings/                # User settings
│   ├── settings/coaching-intelligence  # CoachHelm philosophy
│   ├── development/             # Team development (coach)
│   ├── my-development/          # Personal development (player)
│   ├── my-insights/             # Personal AI insights (player)
│   ├── my-qualifiers/           # Qualifier history (player)
│   ├── intelligence/            # CoachHelm intelligence hub
│   ├── analytics/coachhelm      # CoachHelm analytics
│   ├── patterns/                # Pattern analysis
│   ├── insights/                # Team insights
│   ├── alerts/                  # Performance alerts
│   └── coachhelm/               # CoachHelm main hub
├── actions/                     # 41 server action files
├── join/[code]/                 # Team join via invite
└── admin/                       # Admin panel

src/components/golf/             # 256+ components
├── layout/                      # Header, nav, mobile nav
├── calendar/                    # Calendar system (30+ components)
├── roster/                      # Roster management
├── rounds/                      # Round entry and display
├── coachhelm/                   # CoachHelm AI (80+ components)
│   ├── insights/, settings/, patterns/, round-review/
│   ├── analytics/, alerts/, player/, reviews/, v2/
├── messages/, tasks/, qualifiers/, classes/
├── stats/, documents/, travel/
├── settings/, profile/, player-hub/
└── announcements/

src/hooks/golf/                  # 13 hooks
src/stores/golf-auth-store.ts    # Auth state (Zustand)
src/lib/types/golf.ts            # All golf types
src/lib/types/golf-course.ts     # Course types
src/lib/coachhelm/               # CoachHelm AI engine (V1 + V2)
```

---

## Database Schema

**74 golf_ tables** in production. Key table groups:

| Group | Tables | Purpose |
|-------|--------|---------|
| Core | golf_coaches, golf_players, golf_teams, golf_team_members, golf_team_settings | User and team entities |
| Rounds | golf_rounds, golf_holes, golf_shots | Round and shot tracking |
| Courses | golf_courses, golf_course_holes, golf_player_courses | Course management |
| Events | golf_events, golf_event_attendance, golf_availability_polls, golf_recurring_events + 8 more | Calendar and scheduling |
| Qualifiers | golf_qualifiers, golf_qualifier_entries | Competition |
| Communication | golf_announcements (+ acknowledgements, documents, recipients, tasks), golf_conversations, golf_messages | Team communication |
| Tasks | golf_tasks, golf_task_assignments, golf_task_templates, golf_task_reminders | Task management |
| Documents | golf_documents, golf_document_versions | Document library |
| Travel | golf_travel_itineraries, golf_travel_budgets, golf_travel_expenses, golf_travel_expense_splits | Travel logistics |
| Academics | golf_player_classes, golf_academic_exclusions | Class schedules |
| Calendar Sync | golf_calendar_feeds, golf_calendar_sync_state, golf_external_calendars + 2 more | Calendar integration |
| Stats Cache | golf_player_stats_cache, golf_round_stats_cache, golf_putting_tendencies | Performance metrics |
| CoachHelm | golf_coach_philosophy, golf_coach_insights, golf_patterns_v2, golf_predictions, golf_round_reviews + 13 more | AI intelligence |

Full schema: `memory/context/golfhelm-database.md`

---

## Server Actions (41 files)

Located in `src/app/golf/actions/`:

| Category | Files |
|----------|-------|
| Auth & Setup | auth.ts, onboarding.ts, golf.ts, teams.ts, roster.ts |
| Rounds | round-drafts.ts, round-reviews.ts, round-review-system.ts, shot-analytics.ts |
| Communication | messages.ts, message-attachments.ts, communication.ts, announcements.ts |
| Events | event-lifecycle.ts, recurring-events.ts, attendance.ts, availability-polling.ts, availability-locking.ts |
| Calendar | calendar-sync.ts, calendar-feeds.ts, caldav-sync.ts |
| Tasks | tasks.ts, task-templates.ts, task-reminders.ts |
| Documents | documents.ts |
| Analytics | stats.ts, stats-v2.ts, stats-data.ts, player-profile-stats.ts, dashboard-data.ts |
| CoachHelm | coachhelm-analytics.ts, intelligence-dashboard.ts, pattern-management.ts, insight-management.ts, insight-evidence.ts |
| Other | courses.ts, travel.ts, development.ts, alerts.ts, admin-data.ts |

---

## Separation from Baseball

GolfHelm is fully independent from BaseballHelm:
- Separate routes (`/golf/*`)
- Separate database tables (`golf_*` prefix)
- Separate components (`/components/golf/*`)
- Separate types (`golf.ts`, `golf-course.ts`)
- Separate auth store (`golf-auth-store.ts`)

**Shared:** UI components, Supabase client, Tailwind config, utilities

---

## Documentation

| File | Purpose |
|------|---------|
| `memory/projects/golfhelm.md` | Full project context |
| `memory/glossary.md` | All 74 tables, terms, enums |
| `memory/context/golfhelm-database.md` | Complete DB schema with all columns |
| `memory/context/coachhelm-ai.md` | CoachHelm AI engine reference |
| `docs/features/coachhelm/` | CoachHelm specs and blueprints |
| `docs/features/SHOT_TRACKING_DATA_FLOW.md` | Shot tracking data flow |
