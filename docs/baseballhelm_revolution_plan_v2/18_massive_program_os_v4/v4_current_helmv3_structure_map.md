# V4 Current HelmV3 Structure Map

This map is based on the local repo at `/Users/ricknini/Downloads/helmv3` as inspected during the V4 pass. The next build agent must verify again before editing, but this is the working product map.

## Existing Baseball App Surfaces

The repo already has a substantial baseball product. It is not a blank slate.

### Program-Type Entrypoints

Current route groups include:

- `src/app/baseball/(coach-dashboard)/coach/college/page.tsx`
- `src/app/baseball/(coach-dashboard)/coach/high-school/page.tsx`
- `src/app/baseball/(coach-dashboard)/coach/juco/page.tsx`
- `src/app/baseball/(coach-dashboard)/coach/showcase/page.tsx`
- `src/app/baseball/(player-dashboard)/player/college/page.tsx`
- `src/app/baseball/(player-dashboard)/player/high-school/page.tsx`
- `src/app/baseball/(player-dashboard)/player/juco/page.tsx`
- `src/app/baseball/(player-dashboard)/player/showcase/page.tsx`

V4 implication:

- Do not build one generic dashboard and call it done.
- Preserve the product-type branching, but make it coherent through a shared Program OS shell.
- College, high school, showcase, and JUCO should share foundations but have different default navigation, terminology, permissions, and demo data.

### Existing Dashboard Routes

Current baseball dashboard routes include:

- `dashboard`
- `dashboard/command-center`
- `dashboard/team`
- `dashboard/roster`
- `dashboard/program`
- `dashboard/calendar`
- `dashboard/events`
- `dashboard/announcements`
- `dashboard/tasks`
- `dashboard/messages`
- `dashboard/documents`
- `dashboard/travel`
- `dashboard/academics`
- `dashboard/stats`
- `dashboard/stats/games`
- `dashboard/stats/season`
- `dashboard/stats/upload`
- `dashboard/my-stats`
- `dashboard/dev-plan`
- `dashboard/dev-plans`
- `dashboard/players/[id]`
- `dashboard/profile`
- `dashboard/videos`
- `dashboard/analytics`
- `dashboard/compare`
- `dashboard/comparisons`
- `dashboard/discover`
- `dashboard/watchlist`
- `dashboard/pipeline`
- `dashboard/camps`
- `dashboard/college-interest`
- `dashboard/organization`
- `dashboard/settings`
- `dashboard/settings/privacy`
- `dashboard/settings/philosophy`
- `dashboard/settings/recruiting-preferences`

V4 implication:

- There is already feature surface area. The job is not to add 30 tabs. The job is to reorganize and deepen the surfaces into an operating system.
- Recruiting/discover/watchlist/pipeline/camps should not dominate the default team OS for college teams, but they remain important for high school/showcase and later recruiting workflows.
- Stats, team, roster, player profile, command center, tasks, announcements, calendar, academics, travel, documents, and videos should be wired into one source-linked graph.

### Existing Baseball Actions

Current baseball server action files include:

- `academics.ts`
- `announcements.ts`
- `auth.ts`
- `calendar.ts`
- `dev-plans.ts`
- `discover.ts`
- `documents.ts`
- `games.ts`
- `insights.ts`
- `interests.ts`
- `lineups.ts`
- `messages.ts`
- `onboarding.ts`
- `philosophy.ts`
- `player-dashboard.ts`
- `player-peek.ts`
- `recruiting-philosophy.ts`
- `stats.ts`
- `tasks.ts`
- `team-dashboard.ts`
- `teams.ts`
- `travel.ts`
- `watchlist.ts`

V4 implication:

- Build using the existing action layer first.
- Add new action modules only for genuinely new V4 systems such as `performance.ts`, `imports.ts`, `signals.ts`, `practice.ts`, `meetings.ts`, and `settings-capabilities.ts`.
- Avoid scattering business logic in components.

### Existing Baseball Components

Current component groups include:

- announcements and acknowledgement tracking
- box score upload/entry/view
- calendar wrapper
- command center and analytics panels
- dashboard widgets for recruiting/team activity
- dev plan detail/progress
- documents
- games
- peek panel and player quick actions
- player profile and notes/insights
- player stats charts/session history
- position planner
- roster table/cards/toolbar
- program roster/tabs
- recruiting philosophy
- season stats
- stats upload/history
- tasks
- team dashboard/analytics/roster/video upload
- travel and expenses

V4 implication:

- Reuse existing roster, player profile, stats upload, tasks, announcements, travel, documents, and command center components where possible.
- Introduce new components under clear product namespaces:
  - `components/baseball/signals/*`
  - `components/baseball/performance/*`
  - `components/baseball/practice/*`
  - `components/baseball/imports/*`
  - `components/baseball/meetings/*`
  - `components/baseball/source-trust/*`
  - `components/baseball/program-os/*`

## Existing Strength Gap

The current inspected component/action list does not show a dedicated baseball lifting/performance module. There are no obvious first-class `baseball/performance`, `baseball/lifts`, `baseball/strength`, or `baseball/readiness` surfaces.

V4 implication:

- The strength/lifting coach experience is a real missing product pillar.
- Do not add it as a weak card inside Command Center.
- Build a complete Performance OS slice:
  - strength coach dashboard
  - lift calendar
  - assignments/results
  - player lift view
  - readiness/wellness check-in
  - availability effects on practice
  - reports and staff meeting integration
  - import/export lanes for TeamBuildr/Bridge/TrainHeroic/Excel

## Existing Recruiting Gravity

The app has routes/components/actions for discover, watchlist, pipeline, compare, comparisons, camps, college interest, recruiting philosophy, and public player/program/team profiles.

V4 implication:

- Showcase/high school workflows can use recruiting surfaces more heavily.
- College team OS should demote recruiting to a later module or separate workspace.
- Do not delete recruiting blindly. Convert it into a mode-aware module:
  - College: roster construction and prospect board later.
  - High school: player exposure, college interest, showcase/camps.
  - Showcase: event rosters, player profiles, scout packets, video/stat uploads.

## Route Strategy For Massive Build

Recommended route layer:

- `/baseball/dashboard/command-center`
  - staff default for college/JUCO/team programs
- `/baseball/dashboard/today`
  - player default, mobile-first
- `/baseball/dashboard/signals`
  - operational signal inbox
- `/baseball/dashboard/performance`
  - strength/lifting coach and staff performance hub
- `/baseball/dashboard/performance/lifts`
  - lift assignments, sessions, results
- `/baseball/dashboard/performance/readiness`
  - wellness, soreness, availability, workload review
- `/baseball/dashboard/practice`
  - practice planner/intelligence board
- `/baseball/dashboard/imports`
  - import dossier
- `/baseball/dashboard/games/[id]/postgame`
  - postgame action review
- `/baseball/dashboard/meetings`
  - staff meeting mode
- `/baseball/dashboard/players/[id]`
  - player profile and timeline
- `/baseball/dashboard/settings/program`
  - program settings
- `/baseball/dashboard/settings/roles`
  - capabilities/permissions
- `/baseball/dashboard/settings/integrations`
  - import sources and export setup

Existing routes can redirect or embed into this structure rather than being destroyed.

## Component Strategy For Professional Scale

V4 should introduce a consistent Program OS component architecture:

- Server components fetch/read models.
- Client leaf components handle interactivity.
- Shared `SourceTrustBadge`, `SignalCard`, `RoleGate`, `VisibilityPill`, `PlayerStatusPill`, `ProgramTypeSwitcher`, `ImportRunStatus`, `TimelineEventCard`, and `AIInsightCard`.
- Avoid huge monolithic dashboard components.
- Every feature surface has:
  - page route
  - server read model
  - action module
  - feature components
  - empty state
  - loading skeleton
  - error boundary
  - role/capability tests

## V4 Build Agent Starting Checklist

Before edits:

1. Run route inventory for `src/app/baseball`.
2. Inspect `src/components/layout/sidebar.tsx`.
3. Inspect `src/hooks/use-baseball-auth.ts`.
4. Inspect `src/lib/supabase/middleware.ts`.
5. Inspect generated Supabase types.
6. Inspect `src/app/baseball/actions/*`.
7. Inspect current stats/upload/import utilities.
8. Inspect current command center and player profile components.
9. Identify which existing routes will be upgraded, hidden, redirected, or left alone.
10. Write this audit into the build report before modifying code.
