# Baseball Fairway Continual Nav Issues Registry

Generated from the labeled QA pack in this folder and reconciled against merged PR #787 (`fix(baseball): Fairway routing + Helm Bridge observability (unified)`).

## Fixed in this pass

| Area | Screenshot(s) | Symptom | Diagnosis | Fix |
|---|---|---|---|---|
| Player Recruiting nav | `player/desktop/05-player-baseball-dashboard-college-interest.png` | Player saw an `Interest` tab that redirected to Today. | `/baseball/dashboard/college-interest` is a coach-facing player-interest dashboard, but it was wired into `PLAYER_RECRUITING_TABS`. | Removed the player `Interest` tab and registered `college-interest` in the coach Recruiting hub. |
| Coach Recruiting nav | `coach/desktop/07-coach-baseball-dashboard-college-interest.png` | Real coach page rendered but was not owned by a coach hub after removing it from player nav. | Route was data-backed but orphaned from grouped Fairway nav. | Added `college-interest` to `BASEBALL_NAV_REGISTRY` with `hub: 'recruiting'` and ordered it after Pipeline. |
| Recruiting data 400 | `coach/desktop/07-coach-baseball-dashboard-college-interest.png` | Console 400 while page rendered. | Client selected nonexistent `baseball_coaches.school_name` / `division` columns. Production schema stores coach identity on `full_name` and school fields through `organizations`. | Updated the query to select `full_name` and `organization:organizations(name, division)`. |
| Player analytics polling | `player/desktop/02-player-baseball-dashboard-analytics.png` | Console 400/noisy analytics fetch. | `useAnalytics` created a new Supabase client each render and used it as an effect dependency, encouraging repeated fetches; the engagement query had no error fallback. | Stabilized the Supabase client with `useRef`, removed it from the effect dependency cycle, selected explicit columns, and fall back to zeroed analytics on query error. |
| Messages participant names | `coach/mobile/04-coach-mobile-baseball-dashboard-messages.png`, `player/mobile/03-player-mobile-baseball-dashboard-messages.png` | Mobile Messages showed `Unknown` in the conversation row. | The conversation RPC returns `participant_names`, but the UI only used hydrated `users`/coach/player joins; if those joins were blocked or empty, it dropped the known name. | Added `other_user.display_name` and mapped it from `participant_names`; list and thread participant fallbacks now use it before `Unknown`. |

## Expected redirects/noise in the pack

These are not broken Fairway routes. They should stay out of the actionable error list unless the product decision changes.

| Route | Screenshot(s) | Why it redirects |
|---|---|---|
| `/baseball/dashboard/activate` as coach | `coach/desktop/02-coach-baseball-dashboard-activate.png` | Player-only recruiting activation; coaches go to Command Center. |
| `/baseball/dashboard/analytics` as coach | `coach/desktop/03-coach-baseball-dashboard-analytics.png` | Player-only analytics; coaches go to Command Center. |
| `/baseball/dashboard/profile` as coach | `coach/desktop/34-coach-baseball-dashboard-profile.png` | Player profile editor; coaches go to Command Center. |
| `/baseball/dashboard/lift`, `/baseball/dashboard/readiness`, `/baseball/dashboard/my-stats` as coach | `coach/desktop/20-*`, `22-*`, `36-*` | Player-owned surfaces; coaches land on Performance/Stats Center. |
| `/baseball/dashboard/events`, `/organization`, `/teams` for college coach | `coach/desktop/17-*`, `23-*`, `69-*` | Showcase/academy/club organization routes; college program redirects to Command Center. |
| `/baseball/dashboard/settings/*` aliases | `coach/desktop/40-*`, `41-*`, `43-*`, `44-*`, `45-*`, `48-*`, `51-*`, `57-*` | Accepted consolidated settings routes that redirect to `/settings/program` anchors. |
| `/baseball/dashboard/settings/privacy` as coach | `coach/desktop/52-*` | Player-only privacy settings; coaches go to Command Center. |
| `/baseball/dashboard/team` and `/baseball/dashboard/stats` | `coach/desktop/61-*`, `68-*` | Legacy aliases retained for bookmarks. |
| `/baseball/dashboard/page.tsx` | `coach/desktop/24-coach-baseball-dashboard-page-tsx.png` | Invalid audit path. The real route is `/baseball/dashboard`. |

## Remaining follow-ups

| Area | Screenshot(s) | Status | Next check |
|---|---|---|---|
| Camps audit timeout | `coach/desktop/06-coach-baseball-dashboard-camps.png` | Page content appears to render, but the audit marked `navigation_failed` waiting for `networkidle`. No stale nav link or route-contract failure remains. | Re-run the route audit after the analytics/client-fetch loop fix. If it still times out, instrument pending network requests on the Camps page. |
| Player dev-plan cold URL | `player/desktop/07-player-baseball-dashboard-dev-plan.png`, `player/mobile/04-player-mobile-baseball-dashboard-dev-plan.png` | In-app sidebar navigation works; hard URL can bounce during auth/nav-context resolution and produce a transient 500 console line. | Re-run after the player shell role-resolution changes from #787 plus this pass. If still noisy, move the role guard to a server wrapper before the client action can mount. |
| Mobile Messages perceived thinness | `coach/mobile/04-coach-mobile-baseball-dashboard-messages.png`, `player/mobile/03-player-mobile-baseball-dashboard-messages.png` | Mobile list is valid but visually sparse with one conversation. Name fallback is fixed here. | After regenerating screenshots, decide whether to add a mobile empty-detail prompt under sparse lists. |
| Stats visual gaps | `coach/desktop/61-*`, `62-*`, `player/desktop/12-*` | Tables and cards render, but several chart/advanced stat fields are empty in seed data. | Seed/compute event-level stat visuals; not a routing issue. |
