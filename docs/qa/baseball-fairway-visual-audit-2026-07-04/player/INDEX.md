# BaseballHelm QA — PLAYER

**Account:** rinin376@gmail.com (Marcus Rodriguez #7, Rini University Baseball)
**Audit date:** 2026-07-04
**Shell:** Fairway (BaseballFairwayShell)

## Desktop routes

| # | Screenshot | Route | Render | Page | DB tables | Notes |
|---|------------|-------|--------|------|-----------|-------|
| 1 | [01-player-baseball-dashboard-activate](desktop/01-player-baseball-dashboard-activate.png) | `/baseball/dashboard/activate` | pass | `src/app/baseball/(dashboard)/dashboard/activate/page.tsx` | baseball_players | — |
| 2 | [02-player-baseball-dashboard-analytics](desktop/02-player-baseball-dashboard-analytics.png) | `/baseball/dashboard/analytics` | pass | `src/app/baseball/(dashboard)/dashboard/analytics/page.tsx` | baseball_recruiting_engagement_events | Console: Failed to load resource: the server responded with a status of 400 () |
| 3 | [03-player-baseball-dashboard-announcements](desktop/03-player-baseball-dashboard-announcements.png) | `/baseball/dashboard/announcements` | pass | `src/app/baseball/(dashboard)/dashboard/announcements/page.tsx` | baseball_announcement_acknowledgements, baseball_announcements, baseball_players, baseball_team_members | — |
| 4 | [04-player-baseball-dashboard-calendar](desktop/04-player-baseball-dashboard-calendar.png) | `/baseball/dashboard/calendar` | pass | `src/app/baseball/(dashboard)/dashboard/calendar/page.tsx` | baseball_coaches, baseball_coaches_public, baseball_event_attendance, baseball_events… | — |
| 5 | [05-player-baseball-dashboard-college-interest](desktop/05-player-baseball-dashboard-college-interest.png) | `/baseball/dashboard/college-interest` | redirect | `src/app/baseball/(dashboard)/dashboard/college-interest/page.tsx` | baseball_recruiting_engagement_events | Redirect: /baseball/dashboard/college-interest → http://localhost:3000/baseball/player/today; Middleware RECRUITING_ROUTES requires coach record → player/today. Nav tab still visible for college players — should gate or hide. |
| 6 | [06-player-baseball-dashboard-colleges](desktop/06-player-baseball-dashboard-colleges.png) | `/baseball/dashboard/colleges` | pass | `src/app/baseball/(dashboard)/dashboard/colleges/page.tsx` | baseball_colleges, baseball_recruiting_journey_schools | — |
| 7 | [07-player-baseball-dashboard-dev-plan](desktop/07-player-baseball-dashboard-dev-plan.png) | `/baseball/dashboard/dev-plan` | redirect | `src/app/baseball/(dashboard)/dashboard/dev-plan/page.tsx` | baseball_dev_plan_goals, baseball_developmental_plans | Redirect: /baseball/dashboard/dev-plan → http://localhost:3000/baseball/player/today; Hard navigation can bounce to today (navContext race in dashboard layout). In-app sidebar link works.; Console: Failed to load resource: the server responded with a status of 500 (Internal Server Error) |
| 8 | [08-player-baseball-dashboard-documents](desktop/08-player-baseball-dashboard-documents.png) | `/baseball/dashboard/documents` | pass | `src/app/baseball/(dashboard)/dashboard/documents/page.tsx` | baseball_documents | — |
| 9 | [09-player-baseball-dashboard-journey](desktop/09-player-baseball-dashboard-journey.png) | `/baseball/dashboard/journey` | pass | `src/app/baseball/(dashboard)/dashboard/journey/page.tsx` | baseball_recruiting_journey_schools | — |
| 10 | [10-player-baseball-dashboard-lift](desktop/10-player-baseball-dashboard-lift.png) | `/baseball/dashboard/lift` | pass | `src/app/baseball/(dashboard)/dashboard/lift/page.tsx` | baseball_lift_assignments, baseball_lift_results | — |
| 11 | [11-player-baseball-dashboard-messages](desktop/11-player-baseball-dashboard-messages.png) | `/baseball/dashboard/messages` | pass | `src/app/baseball/(dashboard)/dashboard/messages/page.tsx` | baseball_message_threads, baseball_messages | — |
| 12 | [12-player-baseball-dashboard-my-stats](desktop/12-player-baseball-dashboard-my-stats.png) | `/baseball/dashboard/my-stats` | pass | `src/app/baseball/(dashboard)/dashboard/my-stats/page.tsx` | baseball_games, baseball_player_aggregates, baseball_player_season_stats | — |
| 13 | [13-player-baseball-dashboard-profile](desktop/13-player-baseball-dashboard-profile.png) | `/baseball/dashboard/profile` | pass | `src/app/baseball/(dashboard)/dashboard/profile/page.tsx` | baseball_players, users | — |
| 14 | [14-player-baseball-dashboard-readiness](desktop/14-player-baseball-dashboard-readiness.png) | `/baseball/dashboard/readiness` | pass | `src/app/baseball/(dashboard)/dashboard/readiness/page.tsx` | baseball_readiness_checkins | — |
| 15 | [15-player-baseball-dashboard-settings-notifications](desktop/15-player-baseball-dashboard-settings-notifications.png) | `/baseball/dashboard/settings/notifications` | redirect | `src/app/baseball/(dashboard)/dashboard/settings/notifications/page.tsx` | baseball_coaches, users | Redirect: /baseball/dashboard/settings/notifications → http://localhost:3000/baseball/player/today; Coach-only settings alias → program#notifications; player lands on today. |
| 16 | [16-player-baseball-dashboard-settings-privacy](desktop/16-player-baseball-dashboard-settings-privacy.png) | `/baseball/dashboard/settings/privacy` | pass | `src/app/baseball/(dashboard)/dashboard/settings/privacy/page.tsx` | baseball_player_settings | — |
| 17 | [17-player-baseball-dashboard-tasks](desktop/17-player-baseball-dashboard-tasks.png) | `/baseball/dashboard/tasks` | pass | `src/app/baseball/(dashboard)/dashboard/tasks/page.tsx` | baseball_players, baseball_tasks, baseball_team_members | — |
| 18 | [18-player-baseball-dashboard-videos](desktop/18-player-baseball-dashboard-videos.png) | `/baseball/dashboard/videos` | pass | `src/app/baseball/(dashboard)/dashboard/videos/page.tsx` | baseball_video_annotations, baseball_videos | — |
| 19 | [19-player-baseball-player-passport](desktop/19-player-baseball-player-passport.png) | `/baseball/player/passport` | pass | `src/app/baseball/(player-dashboard)/player/passport/page.tsx` | — | — |
| 20 | [20-player-baseball-player-practice](desktop/20-player-baseball-player-practice.png) | `/baseball/player/practice` | pass | `src/app/baseball/(player-dashboard)/player/practice/page.tsx` | baseball_practice_attendance, baseball_practice_segments, baseball_practices | — |
| 21 | [21-player-baseball-player-timeline](desktop/21-player-baseball-player-timeline.png) | `/baseball/player/timeline` | pass | `src/app/baseball/(player-dashboard)/player/timeline/page.tsx` | baseball_player_timeline_events | — |
| 22 | [22-player-baseball-player-today](desktop/22-player-baseball-player-today.png) | `/baseball/player/today` | pass | `src/app/baseball/(player-dashboard)/player/today/page.tsx` | — | — |

## Mobile spot-checks

- **01-player-mobile-baseball-player-today** — `/baseball/player/today` — pass ([screenshot](mobile/01-player-mobile-baseball-player-today.png))
- **02-player-mobile-baseball-dashboard-my-stats** — `/baseball/dashboard/my-stats` — pass ([screenshot](mobile/02-player-mobile-baseball-dashboard-my-stats.png))
- **03-player-mobile-baseball-dashboard-messages** — `/baseball/dashboard/messages` — thin_content ([screenshot](mobile/03-player-mobile-baseball-dashboard-messages.png))
- **04-player-mobile-baseball-dashboard-dev-plan** — `/baseball/dashboard/dev-plan` — pass ([screenshot](mobile/04-player-mobile-baseball-dashboard-dev-plan.png))
- **05-player-mobile-baseball-dashboard-journey** — `/baseball/dashboard/journey` — pass ([screenshot](mobile/05-player-mobile-baseball-dashboard-journey.png))
- **06-player-mobile-baseball-dashboard-profile** — `/baseball/dashboard/profile` — pass ([screenshot](mobile/06-player-mobile-baseball-dashboard-profile.png))
- **07-player-mobile-baseball-dashboard-calendar** — `/baseball/dashboard/calendar` — pass ([screenshot](mobile/07-player-mobile-baseball-dashboard-calendar.png))

## Code references (shared)

- Nav registry: `src/lib/baseball/nav-registry.ts`
- Hub tabs: `src/app/baseball/(dashboard)/_components/hub-definitions.ts`
- Fairway shell: `src/app/baseball/(dashboard)/BaseballFairwayShell.tsx`
- Route guards: `src/lib/baseball/server-route-guards.ts`, `src/lib/supabase/middleware.ts`
- Feature docs: `memory/context/baseballhelm-features.md`
- Schema: `memory/context/baseballhelm-database.md`

## manifest.json

Machine-readable copy of this index with full table lists and action paths.