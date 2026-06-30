# Route Ownership Matrix

Helm Sports Labs route ownership for GolfHelm and BaseballHelm. Canonical URLs never include App Router route groups like `(auth)` or `(dashboard)`.

## Products

| Product | URL prefix | Primary nav source |
| --- | --- | --- |
| GolfHelm | `/golf` | `src/components/golf/layout/GolfSidebar.tsx`, `FairwayDashboardShell.tsx` |
| BaseballHelm | `/baseball` | `src/components/layout/sidebar.tsx` |
| Shared marketing/legal | `/`, `/about`, `/privacy`, `/terms` | Landing + legal route groups |
| CoachHelm API | `/api/coachhelm` | API handlers only |
| Platform admin | `/golf/admin`, `/admin` | Admin-only surfaces |

## GolfHelm — coach primary nav

| Route | Owner | Role | Notes |
| --- | --- | --- | --- |
| `/golf/dashboard` | Dashboard | coach | Home |
| `/golf/dashboard/intelligence` | CoachHelm | coach | Coach primary CoachHelm entry |
| `/golf/dashboard/roster` | Team ops | coach | |
| `/golf/dashboard/rounds` | Rounds | coach | |
| `/golf/dashboard/calendar` | Team ops | coach | |
| `/golf/dashboard/stats` | Stats | coach/player | Tab subsurfaces, single physical route |
| `/golf/dashboard/messages` | Messaging | shared | |

## GolfHelm — player primary nav

| Route | Owner | Role | Notes |
| --- | --- | --- | --- |
| `/golf/dashboard/coachhelm` | CoachHelm | player | Player CoachHelm entry |
| `/golf/dashboard/my-qualifiers` | Qualifiers | player | |
| `/golf/dashboard/rounds/create` | Rounds | player | Round entry |

## CoachHelm surface classification

| Route | Classification | Decision |
| --- | --- | --- |
| `/golf/dashboard/coachhelm` | canonical page | Player CoachHelm hub |
| `/golf/dashboard/coachhelm/chat` | canonical page | Chat subsurface |
| `/golf/dashboard/intelligence` | canonical page | Coach intelligence hub |
| `/golf/dashboard/alerts` | role-specific page | Coach alerts |
| `/golf/dashboard/patterns` | role-specific page | Coach patterns |
| `/golf/dashboard/insights` | role-specific page | Coach insights |
| `/golf/dashboard/development` | role-specific page | Coach development plans |
| `/golf/dashboard/my-insights` | redirect/alias | Redirects to player CoachHelm |

## BaseballHelm — primary surfaces

| Route | Owner | Role | Notes |
| --- | --- | --- | --- |
| `/baseball/dashboard` | Coach dashboard | coach | Command center family |
| `/baseball/player/today` | Player hub | player | Player home |
| `/baseball/player/timeline` | Player timeline | player | |
| `/baseball/packet/:token` | Public packet | public | Dynamic — needs crawler sample |
| `/baseball/coach-onboarding` | Onboarding | coach | Canonical coach onboarding |
| `/baseball/login` | Auth | public | |
| `/baseball/signup` | Auth | public | |

## Auth expectations

| Area | Unauthenticated behavior |
| --- | --- |
| `/golf/login`, `/golf/signup` | Public |
| `/golf/dashboard/**` | Redirect to `/golf/login` |
| `/baseball/login`, `/baseball/signup` | Public |
| `/baseball/dashboard/**`, `/baseball/player/**` | Redirect to `/baseball/login` |

## Detection tooling

```bash
npm run routes:inventory   # Build route inventory
npm run routes:check       # Static P0/P1 hygiene checks + report
npm run routes:crawl       # Playwright runtime crawler
```

Reports land in `docs/operations/generated/`. Issue drafts land in `docs/operations/revealed-bugs/routes/`.
