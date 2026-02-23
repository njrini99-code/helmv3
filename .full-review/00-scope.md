# Review Scope

## Target

Full comprehensive review of GolfHelm — player dashboard, coach dashboard, all features, and database. This covers the entire GolfHelm product within the Helm Sports Labs multi-sport SaaS platform.

## Files (~738 total)

### Player Dashboard Routes (~28 files)
- `src/app/golf/(dashboard)/dashboard/hub/` — Player home
- `src/app/golf/(dashboard)/dashboard/coachhelm/` — Player AI insights
- `src/app/golf/(dashboard)/dashboard/my-development/` — Player development plans
- `src/app/golf/(dashboard)/dashboard/my-qualifiers/` — Player qualifiers
- `src/app/golf/(dashboard)/dashboard/rounds/` — Round entry, continue, review
- `src/app/golf/(dashboard)/dashboard/classes/` — Academic classes

### Coach Dashboard Routes (~30 files)
- `src/app/golf/(dashboard)/dashboard/alerts/` — Coach alerts
- `src/app/golf/(dashboard)/dashboard/patterns/` — Pattern analysis
- `src/app/golf/(dashboard)/dashboard/insights/` — Insight management
- `src/app/golf/(dashboard)/dashboard/intelligence/` — Intelligence hub
- `src/app/golf/(dashboard)/dashboard/analytics/coachhelm/` — CoachHelm analytics
- `src/app/golf/(dashboard)/dashboard/development/` — Player development management
- `src/app/golf/(dashboard)/dashboard/stats/team/` — Team stats
- `src/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/` — AI settings
- `src/app/golf/(dashboard)/dashboard/qualifiers/new/` — Create qualifier

### Shared Dashboard Routes (~42 files)
- Calendar, Roster, Messages, Announcements, Tasks, Documents, Travel, Qualifiers, Stats, Team, Settings

### Server Actions (42 files)
- `src/app/golf/actions/` — All server action files covering CoachHelm AI, rounds/stats, calendar/events, team management, auth/onboarding, admin

### Components (282 files across 18+ directories)
- `src/components/golf/coachhelm/` — 76 CoachHelm AI components
- `src/components/golf/calendar/` — 43 calendar components
- `src/components/golf/stats/` — 19 stats components
- `src/components/golf/tasks/` — 14 task components
- `src/components/golf/announcements/` — 13 announcement components
- `src/components/golf/rounds/` — 12 round components
- `src/components/golf/dashboard/` — 12 dashboard components
- `src/components/golf/messages/` — 10 messaging components
- `src/components/golf/roster/` — 10 roster components
- `src/components/golf/settings/` — 9 settings components
- `src/components/golf/documents/` — 9 document components
- Plus layout, classes, player-hub, travel, qualifiers, profile, offline directories
- 31 top-level component files (shot tracking, scorecard, mobile nav, offline, etc.)

### Lib / CoachHelm Engine (52 files)
- `src/lib/coachhelm/` — V1 legacy engine + V2 engine (orchestrator, mining, prediction, learning, reasoning, NLG, features, services)

### Lib / Utilities
- `src/lib/golf/` — 4 files (round types, SG benchmarks, strokes gained, trends)
- `src/lib/utils/` — 6 golf-relevant files (stats calculator, formatting, audit logger, etc.)
- `src/lib/cache/` — 2 files (golf queries, golf stats calculator)
- `src/lib/types/` — 10 type definition files
- `src/lib/supabase/` — 6 client files

### Hooks (15 files)
- `src/hooks/golf/` — Realtime, data, offline, keyboard, attachments, preferences

### Stores (5 files)
- `src/stores/` — Zustand stores for auth, offline sync, team state, UI

### Database Migrations (114 files)
- `supabase/migrations/` — 69 sequential migrations + 45 timestamped patches
- Covers: golf core, rounds, courses, events, qualifiers, communication, tasks, documents, travel, academics, calendar, CoachHelm, stats cache, shot system, RLS, indexes

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: Next.js 16 (App Router) + Supabase + TypeScript strict + Tailwind

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report
