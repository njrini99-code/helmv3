# V10 Repo Grounding And GolfHelm Translation

## Purpose

This file tells Claude how to use the existing `Downloads/helmv3` app efficiently. The goal is not to invent a new product beside HelmV3. The goal is to translate the mature GolfHelm patterns into a baseball-specific operating system while respecting the current BaseballHelm routes, actions, Supabase schema, and component inventory.

## Confirmed Current Repo Shape

The current app already contains meaningful BaseballHelm pieces:

- `src/app/baseball/actions/stats.ts` has CSV upload, player matching, stat row creation, and aggregate recalculation.
- `src/app/baseball/actions/insights.ts` has a basic Baseball insight generator.
- `src/components/baseball/command-center/CommandCenterClient.tsx` has a roster/stats command view with player cards, stat chips, filters, week calendar data, and peek panel hooks.
- `src/components/baseball/stats/StatsUploadClient.tsx` has a multi-step CSV upload flow with preview, column mapping, player matching, configure, processing, and completion steps.
- `src/components/baseball/position-planner/PositionPlanner.tsx` has a baseball diamond recruiting/depth visualization.
- `src/components/coach/lineup/LineupBuilder.tsx` has a basic drag-and-drop batting order builder.
- `src/components/baseball/player-profile/*` has profile, insights, and notes surfaces.
- `src/components/baseball/player-stats/*` has game-vs-practice, session history, overview cards, and trends.
- `src/components/baseball/calendar/BaseballCalendarWrapper.tsx`, announcements, tasks, documents, travel, team, roster, games, season stats, and box score components exist.
- `supabase/migrations_archive/pre_20260527/032_baseball_advanced.sql` defines `baseball_player_stats`, `baseball_stat_uploads`, `baseball_player_aggregates`, `baseball_coach_insights`, and `baseball_coach_philosophy`.
- `supabase/migrations_archive/pre_20260527/037_baseball_missing_tables.sql` defines baseball invitations, lineups, lineup positions, and additional stats tables.
- `supabase/migrations_archive/pre_20260527/20260208000000_baseball_team_management.sql` defines documents, tasks, announcements, event attendance, travel, and enhanced event fields.
- `supabase/migrations_archive/pre_20260527/20260222200000_baseball_box_score_system.sql` defines games, batting box scores, pitching box scores, season stats, and box score upload tracking.

The current BaseballHelm limitation is not that nothing exists. The limitation is that the pieces are not yet unified into a source-backed baseball operating system.

## GolfHelm Systems To Reuse

### Fairway App Shell

Relevant files:

- `src/components/fairway/app-shell/AppShell.tsx`
- `src/app/golf/(dashboard)/GolfDashboardShell.tsx`
- `src/components/fairway/app-shell/FairwaySidebar.tsx`
- `src/components/fairway/app-shell/FairwayTopBar.tsx`
- `src/components/fairway/app-shell/RouteTransition.tsx`
- `src/components/fairway/command/*`
- `src/components/fairway/controls/*`
- `src/components/fairway/forms/*`
- `src/components/fairway/feedback/*`
- `src/components/fairway/overlays/*`
- `src/components/fairway/data-table/*`

What to reuse:

- Desktop sidebar plus top command entry.
- Route transition wrapper with reduced-motion support.
- Mobile drawer focus trap and safe-area behavior.
- Command palette lazy-loading.
- Skip-link and keyboard accessibility pattern.
- Density preference and animation preference concepts.
- Shared controls such as segmented controls, toolbar, status pills, badges, sheets, popovers, modals, skeletons, insufficient-data states, and data tables.

How to translate:

- Create a BaseballHelm shell layer rather than keeping Baseball on the generic `Sidebar` forever.
- Either wrap Fairway primitives in `src/components/baseball/foundation/*` or create a `baseball-ds` token scope that aliases the shared primitives without golf labels.
- Use baseball-specific nav sections: Today, Command, Signals, Roster, Practice, Stats Lab, Video, Performance, Calendar/Ops, Reports, Settings.
- For player mobile, preserve a small top-level bottom nav if it improves daily use. For coach desktop, prioritize a dense command shell with sidebar and top command.

Do not reuse:

- Golf-only terminology such as round, hole, tee strategy, PGA, fairway percentage as a primary baseball concept, course library, qualifying, or strokes gained labels.
- Cream/glass styling everywhere if it makes BaseballHelm look like a copy. Use the component quality, not the sport-specific skin.

### Fairway Chart System

Relevant files:

- `src/components/fairway/charts/ChartFrame.tsx`
- `src/components/fairway/charts/LeakMap.tsx`
- `src/components/fairway/charts/ShotDispersion.tsx`
- `src/components/fairway/charts/StatTile.tsx`
- `src/components/fairway/charts/TrendChart.tsx`
- `src/components/fairway/charts/Sparkline.tsx`
- `src/components/fairway/charts/Ribbon.tsx`
- `src/components/fairway/charts/StandingStrip.tsx`
- `src/components/fairway/charts/GenomeRadar.tsx`
- `src/components/fairway/charts/InstrumentTable.tsx`
- `src/components/fairway/charts/theme.ts`
- `src/components/fairway/charts/useCanvasLayer.ts`

What to reuse:

- ChartFrame with title, subtitle, state handling, table fallback, and actions.
- "Insufficient data" honesty rather than fake 0 values.
- Canvas layer for dense scatter plots.
- Tooltips, table alternatives, source captions, and numeric formatting discipline.
- StatTile honesty contract for starved metrics.
- Scatter, heatmap, trend, ribbon, strip, instrument table, and comparison chart patterns.

How to translate:

- `LeakMap` becomes pitch/hit gap charts such as chase-rate by zone, hard-hit gap by pitch type, whiff gap by count, pitch command gap by zone, or catcher receiving gap by pitcher.
- `ShotDispersion` becomes baseball spray/command dispersion: batted-ball spray, pitch miss pattern, pitch release variance, catcher throw scatter, and fielder range error clustering.
- `GenomeRadar` becomes Player DNA or Development Fingerprint with baseball dimensions, always paired with a grouped-bar/table fallback because radar charts are not precise enough alone.
- `StandingStrip` becomes cohort standing across team, conference, class year, position group, or target benchmark.
- `Ribbon` becomes recent-trend strip for exit velocity, chase, strike percentage, workload, readiness, soreness, lift completion, and class conflicts.

Do not reuse:

- PGA/LPGA standards.
- Golf category names.
- Strokes-gained assumptions unless a baseball run-value model is explicitly implemented and labeled as such.

### CoachHelm Signals And Insight Delivery

Relevant files:

- `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx`
- `src/components/fairway/pages/coachhelm/FairwayBrief.tsx`
- `src/components/fairway/pages/coachhelm/CoachHelmShell.tsx`
- `src/app/golf/actions/insight-delivery.ts`
- `src/app/golf/actions/insight-management.ts`
- `src/app/golf/actions/coachhelm-analytics.ts`
- `src/lib/coachhelm/v2/*`
- `src/lib/coachhelm/v3/*`

What to reuse:

- One signals workspace, with filtered route variants instead of separate duplicated insight pages.
- Insight row vocabulary: severity, status, source, confidence, evidence, recommended action, owner, lifecycle.
- Optimistic triage actions with rollback.
- URL-as-state filters for shareable views.
- Signal grouping by player, category, source, status, and priority.
- CoachHelm lifecycle: generate, rank, expose, acknowledge, convert to action, resolve, measure outcome.
- Effectiveness ledger concept from `src/lib/coachhelm/v3/effectiveness/event-ledger.ts`.
- Source/citation infrastructure from `src/lib/coachhelm/v3/llm/citations.ts`.

How to translate:

- Build Baseball CoachHelm around canonical baseball facts and signals:
  - official game stats
  - scrimmage stats
  - practice plan blocks
  - sensor metrics
  - video evidence
  - lifting and readiness
  - class conflicts
  - event attendance
  - player timeline events
  - staff actions
- Keep AI outputs structured. The product should read like a decision engine, not a chat interface.
- Store source references and confidence on every generated card.
- Allow coach feedback to train ranking and threshold sensitivity.

Do not reuse:

- Golf rules such as lag putt, approach proximity, bunker miss, short-side scrambling, opening-hole delta, or pressure-decel chain.
- Round recap naming for baseball. Use Postgame Action Review, not a generic recap generator.

### Fairway Calendar

Relevant files:

- `src/components/fairway/pages/calendar/FairwayCalendar.tsx`
- `src/components/fairway/pages/calendar/FairwayCalendarHero.tsx`
- `src/components/fairway/pages/calendar/FairwayAgendaView.tsx`
- `src/components/fairway/pages/calendar/FairwayMonthGrid.tsx`
- `src/components/fairway/pages/calendar/FairwayEventDetailDrawer.tsx`
- `src/components/fairway/pages/calendar/FairwayEventEditor.tsx`
- `src/components/fairway/pages/calendar/FairwayAvailabilityList.tsx`

What to reuse:

- A single calendar shell that owns hero, view toggle, member rail, event drawer, and event editor.
- Agenda default when upcoming events are sparse.
- Range-driven event loading.
- Availability overlay.
- RSVP/attendance patterns.
- Sheet/drawer event details instead of page jumps.

How to translate:

- Baseball calendar must attach practice plans, scrimmage lineups, games, lift blocks, travel, academic conflicts, equipment tasks, and video capture requirements.
- Event drawer should show source-linked operational payload:
  - practice plan blocks
  - lineup/scrimmage plan
  - attendance/check-in
  - lift assignment
  - player restrictions
  - video requirements
  - weather/location
  - staff owner
  - post-event action items
- Calendar is not just dates. It is the schedule backbone of Team Ops, Practice, Performance, Stats, and CoachHelm.

## BaseballHelm Systems To Keep And Upgrade

### Command Center

Keep `CommandCenterClient` as the starting point, but do not leave it as roster cards plus stat chips. Upgrade it into the coach's command cockpit:

- Top directive panel: what changed since last login.
- Signal queue: source-backed urgent/high items.
- Today rail: practice, game, lift, travel, class conflict, attendance.
- Player attention grid: pitchers, hitters, two-way, limited, trending, missing data.
- Import health: last official file, last sensor upload, pending review.
- Practice action panel: next practice prescription, unresolved practice effectiveness reviews, and available CoachHelm signal-to-block conversions.
- Performance overlay: readiness, soreness, workload, lift compliance, return-to-play limits where allowed.

### Stats Upload

Keep `StatsUploadClient` as the flow foundation, but replace shallow CSV handling with a source-specific Import Dossier:

- Source selection: official game stats, scrimmage, practice, sensor, video, lift, class, readiness, generic.
- Provider profile: GameChanger XML/CSV, StatCrew XML, Presto/SIDEARM/NCAA XML, TrackMan, Rapsodo, Blast, Diamond Kinetics, Synergy, 6-4-3, TeamBuildr, Teamworks/classes, ArmCare, OnForm, Google Sheets, generic CSV/XLSX/PDF/manual.
- File intake: raw file storage, fingerprint, provider detection, schema version, season/team/event link.
- Mapping: automatic column mapping plus visible confidence.
- Player match: external ID first, then roster number/name, then fuzzy match, then manual.
- Preview: rows, changed objects, warnings, duplicate candidates, source confidence.
- Commit: writes canonical facts, source refs, import rows, player timeline events, signal candidates, and affected aggregates.
- Rollback: revert all rows from import run and preserve audit log.

### Lineup Builder And Position Planner

Keep the basic drag/drop lineup and diamond ideas, but make them serious:

- Batting order plus defensive positions in one workspace.
- Defensive diamond labeled by position with player cards.
- Scrimmage mode with Team A/Team B, innings, pitchers by inning, catcher assignments, defensive rotations, pitch count targets, and planned situational constraints.
- Bench/available rail with filters for position, handedness, status, workload, attendance, and readiness.
- Conflict badges: pitcher unavailable, soreness high, class conflict, lift restriction, low readiness, missing status, duplicate slot.
- Save as lineup template, game lineup, scrimmage lineup, or practice block attachment.
- Export/print/share to players with role-safe details.

### Existing Baseball Schema

Keep and extend existing `baseball_*` tables. Do not create a parallel clean-room schema.

Tables to preserve:

- `baseball_teams`
- `baseball_team_members`
- `baseball_team_coach_staff`
- `baseball_players`
- `baseball_coaches`
- `baseball_events`
- `baseball_event_attendance`
- `baseball_tasks`
- `baseball_announcements`
- `baseball_documents`
- `baseball_travel_itineraries`
- `baseball_team_lineups`
- `baseball_lineup_positions`
- `baseball_games`
- `baseball_box_score_batting`
- `baseball_box_score_pitching`
- `baseball_player_season_stats`
- `baseball_box_score_uploads`
- `baseball_player_stats`
- `baseball_stat_uploads`
- `baseball_player_aggregates`
- `baseball_coach_insights`
- `baseball_coach_philosophy`
- `baseball_videos`

Tables to add or extend:

- source registry
- external IDs
- import runs/files/rows/mappings/player matches/warnings
- canonical fact tables for pitch, swing, batted ball, catching, fielding, baserunning, lift, readiness, and classes where existing tables are insufficient
- source refs on facts and insights
- player timeline events
- signals and signal sources
- staff actions and action outcomes
- practice plans, blocks, stations, groups, attendance, and effectiveness windows
- video event references
- performance/lift assignments/results/readiness check-ins
- settings for integration profiles and AI review gates

## Implementation Priority For Claude

1. Build the shared BaseballHelm design foundation.
2. Create source and import traceability before expanding stats.
3. Create role/capability-aware navigation before adding pages.
4. Convert Command Center into the default staff workspace.
5. Convert Player Today into the default player workspace.
6. Build Import Dossier and source drawers.
7. Build practice plan generator and scrimmage lineup workspace.
8. Build stat visuals with source confidence and table fallbacks.
9. Build performance/lifting/readiness workflows.
10. Build Baseball CoachHelm on canonical facts, not on shallow averages.

## Acceptance Standard

Claude should not consider a screen complete unless it has:

- a clear primary decision or workflow
- source visibility for important data
- empty/loading/error states
- role-safe data boundaries
- desktop and mobile behavior
- keyboard/focus support for interactive controls
- table fallback for charts
- action conversion path
- audit/timeline output for important changes
- no golf-specific terminology unless the code path is still in GolfHelm

