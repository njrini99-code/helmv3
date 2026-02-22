# Baseball Onboarding Type Selection + Nested Dashboard Routing

**Date:** 2026-02-21
**Status:** Approved

## Problem

Baseball onboarding doesn't properly route users to type-specific dashboards. Coach onboarding has a redundant role selection step. Player onboarding lacks a type selection step. All users land on `/baseball/dashboard` which uses client-side redirects to route to the right view.

## Solution

### 1. Onboarding Changes

**Coach onboarding** (`/baseball/coach-onboarding`):
- Remove Step 0 "Role Selection" (already chosen at signup)
- Replace with Coach Type Selection: College, JUCO, High School, Showcase
- Store as `coach_type` on `baseball_coaches`

**Player onboarding** (`/baseball/player`):
- Add Step 0: Player Type Selection before "About You"
- Options: High School, Showcase, JUCO, College
- Store as `player_type` on `baseball_players`

### 2. Dashboard Route Structure

```
/baseball/coach/college/         -> Recruiting dashboard
/baseball/coach/juco/            -> JUCO team dashboard (mode toggle)
/baseball/coach/high-school/     -> HS coach team dashboard
/baseball/coach/showcase/        -> Organization/showcase dashboard

/baseball/player/college/        -> College player team dashboard
/baseball/player/juco/           -> JUCO player dashboard
/baseball/player/high-school/    -> HS player dashboard
/baseball/player/showcase/       -> Showcase player dashboard
```

Shared subroutes (messages, settings, calendar, roster, etc.) accessible from all dashboards via shared layout under `/baseball/coach/` and `/baseball/player/`.

### 3. Routing Logic

- After onboarding: redirect to `/baseball/coach/{type}` or `/baseball/player/{type}`
- After login: `loginAction()` checks type and redirects to correct nested route
- `/baseball/dashboard` becomes backward-compat redirect

### 4. Content Migration

| Source | Destination |
|--------|-------------|
| `dashboard/page.tsx` coach section (recruiting) | `/baseball/coach/college/page.tsx` |
| `dashboard/team/high-school/page.tsx` | `/baseball/coach/high-school/page.tsx` |
| `dashboard/team/JucoTeamDashboard.tsx` | `/baseball/coach/juco/page.tsx` |
| `dashboard/team/TeamDashboardClient.tsx` (college player) | `/baseball/player/college/page.tsx` |
| `dashboard/team/JucoPlayerDashboard.tsx` | `/baseball/player/juco/page.tsx` |
| `dashboard/page.tsx` player section | `/baseball/player/high-school/` + `/baseball/player/showcase/` |

### 5. Shared Layouts

Both `/baseball/coach/` and `/baseball/player/` get layout.tsx with:
- Auth guard (correct role + onboarding complete)
- Sidebar with role-appropriate nav
- Mobile bottom nav
