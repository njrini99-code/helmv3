# PLAYER — Errors & Notes

Issues and non-pass renders from the 2026-07-04 audit.

## 2. `/baseball/dashboard/analytics`

- **Render:** pass
- **Page:** `src/app/baseball/(dashboard)/dashboard/analytics/page.tsx`
- **DB tables:** `baseball_recruiting_engagement_events`
- Console: Failed to load resource: the server responded with a status of 400 ()
- **Screenshot:** [02-player-baseball-dashboard-analytics](desktop/02-player-baseball-dashboard-analytics.png)

## 5. `/baseball/dashboard/college-interest`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/college-interest/page.tsx`
- **DB tables:** `baseball_recruiting_engagement_events`
- Redirect: /baseball/dashboard/college-interest → http://localhost:3000/baseball/player/today
- Middleware RECRUITING_ROUTES requires coach record → player/today. Nav tab still visible for college players — should gate or hide.
- **Screenshot:** [05-player-baseball-dashboard-college-interest](desktop/05-player-baseball-dashboard-college-interest.png)

## 7. `/baseball/dashboard/dev-plan`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/dev-plan/page.tsx`
- **Actions/read-models:** `src/app/baseball/actions/dev-plans.ts`
- **DB tables:** `baseball_dev_plan_goals`, `baseball_developmental_plans`
- Redirect: /baseball/dashboard/dev-plan → http://localhost:3000/baseball/player/today
- Hard navigation can bounce to today (navContext race in dashboard layout). In-app sidebar link works.
- Console: Failed to load resource: the server responded with a status of 500 (Internal Server Error)
- **Screenshot:** [07-player-baseball-dashboard-dev-plan](desktop/07-player-baseball-dashboard-dev-plan.png)

## 15. `/baseball/dashboard/settings/notifications`

- **Render:** redirect
- **Page:** `src/app/baseball/(dashboard)/dashboard/settings/notifications/page.tsx`
- **DB tables:** `baseball_coaches`, `users`
- Redirect: /baseball/dashboard/settings/notifications → http://localhost:3000/baseball/player/today
- Coach-only settings alias → program#notifications; player lands on today.
- **Screenshot:** [15-player-baseball-dashboard-settings-notifications](desktop/15-player-baseball-dashboard-settings-notifications.png)

## 3. `/baseball/dashboard/messages`

- **Render:** thin_content
- Status: thin_content
- **Screenshot:** [03-player-mobile-baseball-dashboard-messages](mobile/03-player-mobile-baseball-dashboard-messages.png)
