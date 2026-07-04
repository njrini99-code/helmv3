# COACH — Errors & Notes

Issues and non-pass renders from the 2026-07-04 audit.

## 2. `/baseball/dashboard/activate`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/activate/page.tsx`
- **DB tables:** `baseball_players`
- Redirect: /baseball/dashboard/activate → http://localhost:3000/baseball/dashboard/command-center
- Player-only recruiting activation. Coach → command-center (`activate/page.tsx`).
- **Screenshot:** [02-coach-baseball-dashboard-activate](desktop/02-coach-baseball-dashboard-activate.png)

## 3. `/baseball/dashboard/analytics`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/analytics/page.tsx`
- **DB tables:** `baseball_recruiting_engagement_events`
- Redirect: /baseball/dashboard/analytics → http://localhost:3000/baseball/dashboard/command-center
- Player recruiting analytics. Coach → command-center (`analytics/page.tsx`).
- **Screenshot:** [03-coach-baseball-dashboard-analytics](desktop/03-coach-baseball-dashboard-analytics.png)

## 6. `/baseball/dashboard/camps`

- **Render:** navigation_failed
- **Page:** `src/app/baseball/(dashboard)/dashboard/camps/page.tsx`
- **Actions/read-models:** `src/app/baseball/actions/camps.ts`
- **DB tables:** `baseball_camp_registrations`, `baseball_camps`
- Status: navigation_failed
- Issues: navigation_failed
- Error: TimeoutError: page.goto: Timeout 60000ms exceeded.
Call log:
  - navigating to "http://localhost:3000/baseball/dashboard/camps", waiting until "networkidle"

- **Screenshot:** [06-coach-baseball-dashboard-camps](desktop/06-coach-baseball-dashboard-camps.png)

## 7. `/baseball/dashboard/college-interest`

- **Render:** pass
- **Page:** `src/app/baseball/(dashboard)/dashboard/college-interest/page.tsx`
- **DB tables:** `baseball_recruiting_engagement_events`
- Console: Failed to load resource: the server responded with a status of 400 ()
- **Screenshot:** [07-coach-baseball-dashboard-college-interest](desktop/07-coach-baseball-dashboard-college-interest.png)

## 10. `/baseball/dashboard/compare`

- **Render:** pass
- **Page:** `src/app/baseball/(dashboard)/dashboard/compare/page.tsx`
- **DB tables:** `baseball_player_aggregates`, `baseball_players`
- Empty state rendered
- **Screenshot:** [10-coach-baseball-dashboard-compare](desktop/10-coach-baseball-dashboard-compare.png)

## 13. `/baseball/dashboard/dev-plan`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/dev-plan/page.tsx`
- **Actions/read-models:** `src/app/baseball/actions/dev-plans.ts`
- **DB tables:** `baseball_dev_plan_goals`, `baseball_developmental_plans`
- Redirect: /baseball/dashboard/dev-plan → http://localhost:3000/baseball/coach-onboarding
- Player-only → coach-onboarding if no player record.
- Console: Failed to load resource: the server responded with a status of 500 (Internal Server Error)
- **Screenshot:** [13-coach-baseball-dashboard-dev-plan](desktop/13-coach-baseball-dashboard-dev-plan.png)

## 17. `/baseball/dashboard/events`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/events/page.tsx`
- **DB tables:** `baseball_events`
- Redirect: /baseball/dashboard/events → http://localhost:3000/baseball/dashboard/command-center
- Showcase org only. College coach → command-center (`requireShowcaseOrgRoute`).
- **Screenshot:** [17-coach-baseball-dashboard-events](desktop/17-coach-baseball-dashboard-events.png)

## 20. `/baseball/dashboard/lift`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/lift/page.tsx`
- **DB tables:** `baseball_lift_assignments`, `baseball_lift_results`
- Redirect: /baseball/dashboard/lift → http://localhost:3000/baseball/dashboard/performance
- Player route → performance hub redirect.
- **Screenshot:** [20-coach-baseball-dashboard-lift](desktop/20-coach-baseball-dashboard-lift.png)

## 22. `/baseball/dashboard/my-stats`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/my-stats/page.tsx`
- **DB tables:** `baseball_games`, `baseball_player_aggregates`, `baseball_player_season_stats`
- Redirect: /baseball/dashboard/my-stats → http://localhost:3000/baseball/dashboard/stats-center
- Player stats → stats-center redirect.
- **Screenshot:** [22-coach-baseball-dashboard-my-stats](desktop/22-coach-baseball-dashboard-my-stats.png)

## 23. `/baseball/dashboard/organization`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/organization/page.tsx`
- **DB tables:** `baseball_organizations`, `baseball_teams`
- Redirect: /baseball/dashboard/organization → http://localhost:3000/baseball/dashboard/command-center
- Showcase org only (`requireShowcaseOrgRoute`).
- **Screenshot:** [23-coach-baseball-dashboard-organization](desktop/23-coach-baseball-dashboard-organization.png)

## 24. `/baseball/dashboard/page.tsx`

- **Render:** 404_surface
- **Page:** `src/app/baseball/(dashboard)/dashboard/page.tsx`
- Status: 404_surface
- Issues: 404_surface, http_404, thin_content
- INVALID AUDIT PATH — use /baseball/dashboard (redirects to command-center).
- Console: Failed to load resource: the server responded with a status of 404 (Not Found)
- **Screenshot:** [24-coach-baseball-dashboard-page-tsx](desktop/24-coach-baseball-dashboard-page-tsx.png)

## 34. `/baseball/dashboard/profile`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/profile/page.tsx`
- **DB tables:** `baseball_players`, `users`
- Redirect: /baseball/dashboard/profile → http://localhost:3000/baseball/dashboard/command-center
- Player profile editor. Coach client redirect → command-center (`profile/page.tsx`).
- **Screenshot:** [34-coach-baseball-dashboard-profile](desktop/34-coach-baseball-dashboard-profile.png)

## 36. `/baseball/dashboard/readiness`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/readiness/page.tsx`
- **DB tables:** `baseball_readiness_checkins`
- Redirect: /baseball/dashboard/readiness → http://localhost:3000/baseball/dashboard/performance
- Player route → performance hub redirect.
- **Screenshot:** [36-coach-baseball-dashboard-readiness](desktop/36-coach-baseball-dashboard-readiness.png)

## 40. `/baseball/dashboard/settings/ai`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/settings/ai/page.tsx`
- **DB tables:** `baseball_coaches`, `users`
- Redirect: /baseball/dashboard/settings/ai → http://localhost:3000/baseball/dashboard/settings/program#ai
- Alias → settings/program#ai.
- **Screenshot:** [40-coach-baseball-dashboard-settings-ai](desktop/40-coach-baseball-dashboard-settings-ai.png)

## 41. `/baseball/dashboard/settings/appearance`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/settings/appearance/page.tsx`
- **DB tables:** `baseball_coaches`, `users`
- Redirect: /baseball/dashboard/settings/appearance → http://localhost:3000/baseball/dashboard/settings/program#appearance
- Alias → settings/program#appearance.
- **Screenshot:** [41-coach-baseball-dashboard-settings-appearance](desktop/41-coach-baseball-dashboard-settings-appearance.png)

## 43. `/baseball/dashboard/settings/data-retention`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/settings/data-retention/page.tsx`
- **DB tables:** `baseball_coaches`, `users`
- Redirect: /baseball/dashboard/settings/data-retention → http://localhost:3000/baseball/dashboard/settings/program#data-retention
- **Screenshot:** [43-coach-baseball-dashboard-settings-data-retention](desktop/43-coach-baseball-dashboard-settings-data-retention.png)

## 44. `/baseball/dashboard/settings/demo-mode`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/settings/demo-mode/page.tsx`
- **DB tables:** `baseball_coaches`, `users`
- Redirect: /baseball/dashboard/settings/demo-mode → http://localhost:3000/baseball/dashboard/settings/program
- **Screenshot:** [44-coach-baseball-dashboard-settings-demo-mode](desktop/44-coach-baseball-dashboard-settings-demo-mode.png)

## 45. `/baseball/dashboard/settings/guardian-access`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/settings/guardian-access/page.tsx`
- **DB tables:** `baseball_coaches`, `users`
- Redirect: /baseball/dashboard/settings/guardian-access → http://localhost:3000/baseball/dashboard/settings/program#guardian-access
- **Screenshot:** [45-coach-baseball-dashboard-settings-guardian-access](desktop/45-coach-baseball-dashboard-settings-guardian-access.png)

## 48. `/baseball/dashboard/settings/notifications`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/settings/notifications/page.tsx`
- **DB tables:** `baseball_coaches`, `users`
- Redirect: /baseball/dashboard/settings/notifications → http://localhost:3000/baseball/dashboard/settings/program#notifications
- Alias → settings/program#notifications.
- **Screenshot:** [48-coach-baseball-dashboard-settings-notifications](desktop/48-coach-baseball-dashboard-settings-notifications.png)

## 51. `/baseball/dashboard/settings/player-access`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/settings/player-access/page.tsx`
- **DB tables:** `baseball_coaches`, `users`
- Redirect: /baseball/dashboard/settings/player-access → http://localhost:3000/baseball/dashboard/settings/program#player-access
- **Screenshot:** [51-coach-baseball-dashboard-settings-player-access](desktop/51-coach-baseball-dashboard-settings-player-access.png)

## 52. `/baseball/dashboard/settings/privacy`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/settings/privacy/page.tsx`
- **DB tables:** `baseball_player_settings`
- Redirect: /baseball/dashboard/settings/privacy → http://localhost:3000/baseball/dashboard/command-center
- Player-only privacy form.
- **Screenshot:** [52-coach-baseball-dashboard-settings-privacy](desktop/52-coach-baseball-dashboard-settings-privacy.png)

## 57. `/baseball/dashboard/settings/showcase-profile`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/settings/showcase-profile/page.tsx`
- **DB tables:** `baseball_coaches`, `users`
- Redirect: /baseball/dashboard/settings/showcase-profile → http://localhost:3000/baseball/dashboard/settings/program#showcase-profile
- **Screenshot:** [57-coach-baseball-dashboard-settings-showcase-profile](desktop/57-coach-baseball-dashboard-settings-showcase-profile.png)

## 61. `/baseball/dashboard/stats`

- **Render:** pass
- **Page:** `src/app/baseball/(dashboard)/dashboard/stats/page.tsx`
- Legacy → stats-center redirect.
- **Screenshot:** [61-coach-baseball-dashboard-stats](desktop/61-coach-baseball-dashboard-stats.png)

## 68. `/baseball/dashboard/team`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/team/page.tsx`
- Redirect: /baseball/dashboard/team → http://localhost:3000/baseball/dashboard/command-center
- Legacy alias → command-center (`middleware.ts` LEGACY_TEAM_ROUTES).
- **Screenshot:** [68-coach-baseball-dashboard-team](desktop/68-coach-baseball-dashboard-team.png)

## 69. `/baseball/dashboard/teams`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/teams/page.tsx`
- **DB tables:** `baseball_team_members`, `baseball_teams`
- Redirect: /baseball/dashboard/teams → http://localhost:3000/baseball/dashboard/command-center
- Showcase org only (`requireShowcaseOrgRoute`).
- **Screenshot:** [69-coach-baseball-dashboard-teams](desktop/69-coach-baseball-dashboard-teams.png)

## 4. `/baseball/dashboard/messages`

- **Render:** thin_content
- Status: thin_content
- **Screenshot:** [04-coach-mobile-baseball-dashboard-messages](mobile/04-coach-mobile-baseball-dashboard-messages.png)
