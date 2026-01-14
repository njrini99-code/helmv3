# ROUTE INVENTORY & ORPHAN DETECTION REPORT
> Generated: 2026-01-01
> Project: Helm Sports Labs v3

---

## EXECUTIVE SUMMARY

| Metric | Count |
|--------|-------|
| Total Pages (page.tsx) | 68 |
| Total Layouts (layout.tsx) | 29 |
| API Routes (route.ts) | 3 |
| Loading States (loading.tsx) | 33 |
| Error Boundaries (error.tsx) | 26 |
| Route Groups | 7 |
| **Orphaned Pages** | **8** |
| **Missing Loading States** | **35** |
| **Missing Error Boundaries** | **42** |

---

## SECTION 1: ROOT LEVEL ROUTES

| Route | File | Protected | Loading | Error | Navigation Links |
|-------|------|-----------|---------|-------|------------------|
| `/` | `src/app/page.tsx` | ❌ Public | ❌ | ✅ | ✅ Landing page |
| `/about` | `src/app/about/page.tsx` | ❌ Public | ❌ | ❌ | ✅ Navigation |
| `/help` | `src/app/help/page.tsx` | ❌ Public | ❌ | ❌ | ✅ Navigation |

### Root Level Findings:
- ✅ Landing page properly configured as public
- ⚠️ `/about` missing loading.tsx and error.tsx
- ⚠️ `/help` missing loading.tsx and error.tsx

---

## SECTION 2: BASEBALL ROUTES

### 2.1 Authentication Routes - `/baseball/(auth)/`

| Route | File | Protected | Loading | Error | Navigation Links |
|-------|------|-----------|---------|-------|------------------|
| `/baseball/login` | `src/app/baseball/(auth)/login/page.tsx` | ❌ Public | ❌ | ❌ | ✅ Multiple |
| `/baseball/signup` | `src/app/baseball/(auth)/signup/page.tsx` | ❌ Public | ❌ | ❌ | ✅ Multiple |
| `/baseball/forgot-password` | `src/app/baseball/(auth)/forgot-password/page.tsx` | ❌ Public | ❌ | ❌ | ✅ Login form |
| `/baseball/reset-password` | `src/app/baseball/(auth)/reset-password/page.tsx` | ❌ Public | ❌ | ❌ | ✅ Email link |
| `/baseball/complete-signup` | `src/app/baseball/(auth)/complete-signup/page.tsx` | ❌ Public | ❌ | ❌ | ⚠️ OAuth only |

### 2.2 Onboarding Routes - `/baseball/(onboarding)/`

| Route | File | Protected | Loading | Error | Navigation Links |
|-------|------|-----------|---------|-------|------------------|
| `/baseball/coach-onboarding` | `src/app/baseball/(onboarding)/coach-onboarding/page.tsx` | ❌ Public* | ❌ | ❌ | ✅ Landing CTAs |
| `/baseball/coach` | `src/app/baseball/(onboarding)/coach/page.tsx` | ❌ Public* | ❌ | ❌ | ⚠️ Internal only |
| `/baseball/player` | `src/app/baseball/(onboarding)/player/page.tsx` | ❌ Public* | ✅ | ❌ | ⚠️ Internal only |

*Note: Onboarding routes commented out in middleware but still accessible

### 2.3 Dashboard Routes - `/baseball/(dashboard)/dashboard/`

| Route | File | Protected | Loading | Error | Navigation Links |
|-------|------|-----------|---------|-------|------------------|
| `/baseball/dashboard` | `.../dashboard/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Multiple |
| `/baseball/dashboard/discover` | `.../discover/page.tsx` | ✅ Auth+Role | ✅ | ✅ | ✅ Multiple |
| `/baseball/dashboard/watchlist` | `.../watchlist/page.tsx` | ✅ Auth+Role | ✅ | ✅ | ✅ Sidebar |
| `/baseball/dashboard/pipeline` | `.../pipeline/page.tsx` | ✅ Auth+Role | ✅ | ✅ | ✅ Sidebar |
| `/baseball/dashboard/compare` | `.../compare/page.tsx` | ✅ Auth | ✅ | ❌ | ✅ Sidebar |
| `/baseball/dashboard/camps` | `.../camps/page.tsx` | ✅ Auth+Role | ✅ | ❌ | ✅ Dashboard |
| `/baseball/dashboard/messages` | `.../messages/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Multiple |
| `/baseball/dashboard/messages/[id]` | `.../messages/[id]/page.tsx` | ✅ Auth | ❌ | ✅ | ✅ Messages |
| `/baseball/dashboard/calendar` | `.../calendar/page.tsx` | ✅ Auth | ✅ | ❌ | ✅ Multiple |
| `/baseball/dashboard/roster` | `.../roster/page.tsx` | ✅ Auth | ✅ | ❌ | ✅ Sidebar |
| `/baseball/dashboard/videos` | `.../videos/page.tsx` | ✅ Auth | ✅ | ❌ | ✅ Sidebar |
| `/baseball/dashboard/profile` | `.../profile/page.tsx` | ✅ Auth | ✅ | ❌ | ✅ Header menu |
| `/baseball/dashboard/settings` | `.../settings/page.tsx` | ✅ Auth | ✅ | ❌ | ✅ Header menu |
| `/baseball/dashboard/settings/privacy` | `.../settings/privacy/page.tsx` | ✅ Auth | ❌ | ❌ | ✅ Settings |
| `/baseball/dashboard/team` | `.../team/page.tsx` | ✅ Auth | ❌ | ❌ | ✅ Sidebar |
| `/baseball/dashboard/team/high-school` | `.../team/high-school/page.tsx` | ✅ Auth | ❌ | ❌ | ⚠️ Unknown |
| `/baseball/dashboard/teams` | `.../teams/page.tsx` | ✅ Auth | ✅ | ❌ | ⚠️ Unknown |
| `/baseball/dashboard/program` | `.../program/page.tsx` | ✅ Auth | ❌ | ❌ | ✅ Dashboard |
| `/baseball/dashboard/colleges` | `.../colleges/page.tsx` | ✅ Auth | ✅ | ❌ | ⚠️ Unknown |
| `/baseball/dashboard/journey` | `.../journey/page.tsx` | ✅ Auth | ✅ | ❌ | ⚠️ Unknown |
| `/baseball/dashboard/analytics` | `.../analytics/page.tsx` | ✅ Auth | ✅ | ❌ | ✅ Dashboard |
| `/baseball/dashboard/dev-plan` | `.../dev-plan/page.tsx` | ✅ Auth | ❌ | ❌ | ⚠️ Unknown |
| `/baseball/dashboard/dev-plans` | `.../dev-plans/page.tsx` | ✅ Auth | ✅ | ❌ | ⚠️ Unknown |
| `/baseball/dashboard/activate` | `.../activate/page.tsx` | ✅ Auth | ❌ | ❌ | ✅ Dashboard |
| `/baseball/dashboard/college-interest` | `.../college-interest/page.tsx` | ✅ Auth | ❌ | ❌ | ⚠️ Unknown |
| `/baseball/dashboard/events` | `.../events/page.tsx` | ✅ Auth | ❌ | ❌ | ⚠️ Unknown |
| `/baseball/dashboard/comparisons` | `.../comparisons/page.tsx` | ✅ Auth | ❌ | ❌ | ⚠️ Unknown |
| `/baseball/dashboard/academics` | `.../academics/page.tsx` | ✅ Auth | ❌ | ❌ | ⚠️ Unknown |
| `/baseball/dashboard/players/[id]` | `.../players/[id]/page.tsx` | ✅ Auth | ❌ | ✅ | ✅ Discover |
| `/baseball/dashboard/players/[id]/profile` | `.../players/[id]/profile/page.tsx` | ✅ Auth | ❌ | ✅ | ✅ Player card |

### 2.4 Public Routes - `/baseball/(public)/`

| Route | File | Protected | Loading | Error | Navigation Links |
|-------|------|-----------|---------|-------|------------------|
| `/baseball/player/[id]` | `.../player/[id]/page.tsx` | ❌ Public | ❌ | ✅ | ⚠️ External share |
| `/baseball/program/[id]` | `.../program/[id]/page.tsx` | ❌ Public | ✅ | ✅ | ⚠️ External share |

### 2.5 Join Route

| Route | File | Protected | Loading | Error | Navigation Links |
|-------|------|-----------|---------|-------|------------------|
| `/baseball/join/[code]` | `src/app/baseball/join/[code]/page.tsx` | ❌ Public | ❌ | ❌ | ⚠️ Invite links |

---

## SECTION 3: GOLF ROUTES

### 3.1 Authentication Routes - `/golf/(auth)/`

| Route | File | Protected | Loading | Error | Navigation Links |
|-------|------|-----------|---------|-------|------------------|
| `/golf/login` | `src/app/golf/(auth)/login/page.tsx` | ❌ Public | ❌ | ❌ | ✅ Multiple |
| `/golf/signup` | `src/app/golf/(auth)/signup/page.tsx` | ❌ Public | ❌ | ❌ | ✅ Multiple |
| `/golf/forgot-password` | `src/app/golf/(auth)/forgot-password/page.tsx` | ❌ Public | ❌ | ❌ | ✅ Login form |
| `/golf/reset-password` | `src/app/golf/(auth)/reset-password/page.tsx` | ❌ Public | ❌ | ❌ | ✅ Email link |

**Note:** Golf does NOT have `/golf/complete-signup` - OAuth is disabled

### 3.2 Onboarding Routes - `/golf/(onboarding)/`

| Route | File | Protected | Loading | Error | Navigation Links |
|-------|------|-----------|---------|-------|------------------|
| `/golf/coach` | `src/app/golf/(onboarding)/coach/page.tsx` | ❌ Public* | ❌ | ❌ | ⚠️ Internal only |
| `/golf/player` | `src/app/golf/(onboarding)/player/page.tsx` | ❌ Public* | ❌ | ❌ | ⚠️ Internal only |

### 3.3 Dashboard Routes - `/golf/(dashboard)/dashboard/`

| Route | File | Protected | Loading | Error | Navigation Links |
|-------|------|-----------|---------|-------|------------------|
| `/golf/dashboard` | `.../dashboard/page.tsx` | ✅ Auth | ✅ | ❌ | ✅ Multiple |
| `/golf/dashboard/roster` | `.../roster/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Dashboard |
| `/golf/dashboard/calendar` | `.../calendar/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Dashboard |
| `/golf/dashboard/messages` | `.../messages/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Dashboard |
| `/golf/dashboard/settings` | `.../settings/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Sidebar |
| `/golf/dashboard/qualifiers` | `.../qualifiers/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Dashboard |
| `/golf/dashboard/qualifiers/[id]` | `.../qualifiers/[id]/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Qualifiers |
| `/golf/dashboard/rounds` | `.../rounds/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Dashboard |
| `/golf/dashboard/rounds/new` | `.../rounds/new/page.tsx` | ✅ Auth | ✅ | ❌ | ✅ Rounds list |
| `/golf/dashboard/rounds/[id]` | `.../rounds/[id]/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Rounds |
| `/golf/dashboard/stats` | `.../stats/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Dashboard |
| `/golf/dashboard/team` | `.../team/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Sidebar |
| `/golf/dashboard/classes` | `.../classes/page.tsx` | ✅ Auth | ❌ | ✅ | ⚠️ Unknown |
| `/golf/dashboard/documents` | `.../documents/page.tsx` | ✅ Auth | ✅ | ✅ | ⚠️ Unknown |
| `/golf/dashboard/travel` | `.../travel/page.tsx` | ✅ Auth | ✅ | ✅ | ⚠️ Unknown |
| `/golf/dashboard/tasks` | `.../tasks/page.tsx` | ✅ Auth | ❌ | ✅ | ⚠️ Unknown |
| `/golf/dashboard/announcements` | `.../announcements/page.tsx` | ✅ Auth | ✅ | ✅ | ✅ Dashboard |

### 3.4 Join Route

| Route | File | Protected | Loading | Error | Navigation Links |
|-------|------|-----------|---------|-------|------------------|
| `/golf/join/[code]` | `src/app/golf/join/[code]/page.tsx` | ❌ Public | ❌ | ❌ | ⚠️ Invite links |

---

## SECTION 4: API ROUTES

| Route | File | Method(s) | Purpose |
|-------|------|-----------|---------|
| `/auth/callback` | `src/app/auth/callback/route.ts` | GET | OAuth callback handler |
| `/api/calendar/events` | `src/app/api/calendar/events/route.ts` | GET/POST | Calendar event CRUD |
| `/api/log-error` | `src/app/api/log-error/route.ts` | POST | Error logging endpoint |

---

## SECTION 5: ROUTE GROUP ANALYSIS

### 5.1 Route Groups Detected

| Group | Sport | Purpose | Layout | File Count |
|-------|-------|---------|--------|------------|
| `(auth)` | Baseball | Auth pages | ❌ None | 5 pages |
| `(auth)` | Golf | Auth pages | ❌ None | 4 pages |
| `(onboarding)` | Baseball | Onboarding flow | ✅ Partial | 3 pages |
| `(onboarding)` | Golf | Onboarding flow | ❌ None | 2 pages |
| `(dashboard)` | Baseball | Authenticated area | ✅ Yes | 28 pages |
| `(dashboard)` | Golf | Authenticated area | ✅ Yes | 17 pages |
| `(public)` | Baseball | Public profiles | ✅ Yes | 2 pages |

### 5.2 Layout Hierarchy

```
src/app/layout.tsx (Root - all pages)
├── src/app/baseball/(dashboard)/layout.tsx
│   └── 18 feature-specific layouts under dashboard/
├── src/app/golf/(dashboard)/layout.tsx
│   └── 7 feature-specific layouts under dashboard/
└── src/app/baseball/(public)/layout.tsx
```

---

## SECTION 6: ORPHANED PAGES DETECTED

Pages that exist but have NO navigation links pointing to them:

| # | Route | Risk | Recommendation |
|---|-------|------|----------------|
| 1 | `/baseball/dashboard/team/high-school` | LOW | Appears intentional - niche feature |
| 2 | `/baseball/dashboard/teams` | MEDIUM | No links found - check if used |
| 3 | `/baseball/dashboard/colleges` | MEDIUM | No links found - player feature? |
| 4 | `/baseball/dashboard/journey` | MEDIUM | No links found - player feature? |
| 5 | `/baseball/dashboard/dev-plan` | LOW | Likely accessed via dev-plans |
| 6 | `/baseball/dashboard/dev-plans` | MEDIUM | No links found in nav |
| 7 | `/baseball/dashboard/college-interest` | MEDIUM | No links found - HS coach feature? |
| 8 | `/baseball/dashboard/events` | MEDIUM | No links found |
| 9 | `/baseball/dashboard/comparisons` | MEDIUM | No links found |
| 10 | `/baseball/dashboard/academics` | MEDIUM | No links found - JUCO feature? |
| 11 | `/golf/dashboard/classes` | MEDIUM | No links found in main nav |
| 12 | `/golf/dashboard/documents` | MEDIUM | No links found in main nav |
| 13 | `/golf/dashboard/travel` | MEDIUM | No links found in main nav |
| 14 | `/golf/dashboard/tasks` | MEDIUM | No links found in main nav |

### Analysis:
Many "orphaned" pages appear to be role-specific features that may be conditionally shown in the sidebar based on user role. Need to check sidebar component for role-based navigation.

---

## SECTION 7: DUPLICATE/CONFLICT DETECTION

### 7.1 Potential Conflicts

| Route Pattern | Instances | Issue |
|---------------|-----------|-------|
| `/baseball/dashboard/team` vs `/baseball/dashboard/teams` | 2 | Similar naming - potential confusion |
| `/baseball/dashboard/dev-plan` vs `/baseball/dashboard/dev-plans` | 2 | Singular vs plural - likely intentional |
| `/baseball/dashboard/compare` vs `/baseball/dashboard/comparisons` | 2 | Different purpose? Check functionality |

### 7.2 Dynamic Route Conflicts
None detected - all dynamic routes (`[id]`, `[code]`) are properly nested.

---

## SECTION 8: MIDDLEWARE PROTECTION ANALYSIS

### 8.1 Public Routes (from middleware.ts)
```typescript
const isPublicRoute =
  pathname === '/' ||
  pathname === '/baseball/login' ||
  pathname === '/baseball/signup' ||
  pathname === '/golf/login' ||
  pathname === '/golf/signup' ||
  pathname.startsWith('/baseball/player/') ||  // Public player profiles
  pathname.startsWith('/golf/player/');        // Public player profiles
```

### 8.2 Role-Restricted Routes (RECRUITING_ROUTES)
```typescript
const RECRUITING_ROUTES = [
  '/baseball/dashboard/discover',
  '/baseball/dashboard/watchlist',
  '/baseball/dashboard/pipeline',
  '/baseball/dashboard/compare',
  '/baseball/dashboard/camps',
];
// Only allowed: ['college', 'juco'] coach types
```

### 8.3 Findings

| Issue | Description | Severity |
|-------|-------------|----------|
| ⚠️ Onboarding Commented | Onboarding routes protection is commented out | LOW |
| ✅ Dashboard Protected | All `/*/dashboard/*` routes require auth | OK |
| ⚠️ Golf No Role Check | Golf routes don't have role-based restrictions | MEDIUM |
| ✅ Public Profiles Work | Public player/program profiles accessible | OK |

---

## SECTION 9: LOADING & ERROR STATE COVERAGE

### 9.1 Missing Loading States (35 pages)

**Baseball Auth:**
- `/baseball/login`
- `/baseball/signup`
- `/baseball/forgot-password`
- `/baseball/reset-password`
- `/baseball/complete-signup`

**Baseball Onboarding:**
- `/baseball/coach-onboarding`
- `/baseball/coach`

**Baseball Dashboard:**
- `/baseball/dashboard/messages/[id]`
- `/baseball/dashboard/settings/privacy`
- `/baseball/dashboard/team`
- `/baseball/dashboard/team/high-school`
- `/baseball/dashboard/program`
- `/baseball/dashboard/dev-plan`
- `/baseball/dashboard/activate`
- `/baseball/dashboard/college-interest`
- `/baseball/dashboard/events`
- `/baseball/dashboard/comparisons`
- `/baseball/dashboard/academics`
- `/baseball/dashboard/players/[id]`
- `/baseball/dashboard/players/[id]/profile`

**Golf Auth:**
- `/golf/login`
- `/golf/signup`
- `/golf/forgot-password`
- `/golf/reset-password`

**Golf Onboarding:**
- `/golf/coach`
- `/golf/player`

**Golf Dashboard:**
- `/golf/dashboard/classes`
- `/golf/dashboard/tasks`

**Other:**
- `/about`
- `/help`
- `/baseball/join/[code]`
- `/golf/join/[code]`
- `/baseball/player/[id]`

### 9.2 Missing Error Boundaries (42 pages)

Similar pattern - auth and many dashboard pages missing error.tsx

---

## SECTION 10: BROKEN LINK DETECTION

### 10.1 Links to Non-Existent Routes

| Source File | Link | Issue |
|-------------|------|-------|
| `Navigation.tsx:150` | `/baseball/(auth)/coach-onboarding` | Wrong path - should be `/baseball/coach-onboarding` |
| `MobileNav.tsx:96` | `/baseball/(auth)/coach-onboarding` | Wrong path - should be `/baseball/coach-onboarding` |
| `FinalCTA.tsx:45` | `/baseball/(auth)/coach-onboarding` | Wrong path - should be `/baseball/coach-onboarding` |
| `Hero.tsx:69` | `/baseball/(auth)/coach-onboarding` | Wrong path - should be `/baseball/coach-onboarding` |
| `dark-header.tsx:224` | `/dashboard/notifications` | Missing sport prefix |
| `dark-header.tsx:290` | `/dashboard/profile` | Missing sport prefix |
| `dark-header.tsx:303` | `/dashboard/settings` | Missing sport prefix |
| `golf-sign-up-form.tsx:252` | `/terms` | Page doesn't exist |
| `golf-sign-up-form.tsx:254` | `/privacy` | Page doesn't exist |
| `baseball-sign-up-form.tsx:296` | `/terms` | Page doesn't exist |
| `baseball-sign-up-form.tsx:298` | `/privacy` | Page doesn't exist |

---

## SECTION 11: RECOMMENDATIONS

### 11.1 Critical Issues (Fix Immediately)

1. **Broken Navigation Links** - Coach onboarding links use wrong path syntax
   - Fix: Change `/baseball/(auth)/coach-onboarding` to `/baseball/coach-onboarding`

2. **Missing Terms/Privacy Pages** - Links exist but pages don't
   - Fix: Create `/terms/page.tsx` and `/privacy/page.tsx`

3. **Dark Header Wrong Paths** - Missing sport prefix
   - Fix: Use dynamic sport-based paths or relative links

### 11.2 High Priority

1. **Add Error Boundaries** to auth pages to prevent white screen on errors
2. **Add Loading States** to dynamic routes like `[id]` pages
3. **Review Orphaned Pages** - Confirm if they should be in navigation

### 11.3 Medium Priority

1. **Consolidate Similar Routes** - `team`/`teams`, `dev-plan`/`dev-plans`
2. **Add Golf Role-Based Protection** - Match baseball's RECRUITING_ROUTES pattern
3. **Add Loading States** to remaining 35 pages

### 11.4 Low Priority

1. **Add Error Boundaries** to static pages (`/about`, `/help`)
2. **Create Auth Route Group Layouts** for consistent auth page styling

---

## APPENDIX A: COMPLETE FILE INVENTORY

### Pages (68 total)
```
src/app/page.tsx
src/app/about/page.tsx
src/app/help/page.tsx
src/app/baseball/(auth)/login/page.tsx
src/app/baseball/(auth)/signup/page.tsx
src/app/baseball/(auth)/forgot-password/page.tsx
src/app/baseball/(auth)/reset-password/page.tsx
src/app/baseball/(auth)/complete-signup/page.tsx
src/app/baseball/(onboarding)/coach-onboarding/page.tsx
src/app/baseball/(onboarding)/coach/page.tsx
src/app/baseball/(onboarding)/player/page.tsx
src/app/baseball/(dashboard)/dashboard/page.tsx
src/app/baseball/(dashboard)/dashboard/discover/page.tsx
src/app/baseball/(dashboard)/dashboard/watchlist/page.tsx
src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx
src/app/baseball/(dashboard)/dashboard/compare/page.tsx
src/app/baseball/(dashboard)/dashboard/camps/page.tsx
src/app/baseball/(dashboard)/dashboard/messages/page.tsx
src/app/baseball/(dashboard)/dashboard/messages/[id]/page.tsx
src/app/baseball/(dashboard)/dashboard/calendar/page.tsx
src/app/baseball/(dashboard)/dashboard/roster/page.tsx
src/app/baseball/(dashboard)/dashboard/videos/page.tsx
src/app/baseball/(dashboard)/dashboard/profile/page.tsx
src/app/baseball/(dashboard)/dashboard/settings/page.tsx
src/app/baseball/(dashboard)/dashboard/settings/privacy/page.tsx
src/app/baseball/(dashboard)/dashboard/team/page.tsx
src/app/baseball/(dashboard)/dashboard/team/high-school/page.tsx
src/app/baseball/(dashboard)/dashboard/teams/page.tsx
src/app/baseball/(dashboard)/dashboard/program/page.tsx
src/app/baseball/(dashboard)/dashboard/colleges/page.tsx
src/app/baseball/(dashboard)/dashboard/journey/page.tsx
src/app/baseball/(dashboard)/dashboard/analytics/page.tsx
src/app/baseball/(dashboard)/dashboard/dev-plan/page.tsx
src/app/baseball/(dashboard)/dashboard/dev-plans/page.tsx
src/app/baseball/(dashboard)/dashboard/activate/page.tsx
src/app/baseball/(dashboard)/dashboard/college-interest/page.tsx
src/app/baseball/(dashboard)/dashboard/events/page.tsx
src/app/baseball/(dashboard)/dashboard/comparisons/page.tsx
src/app/baseball/(dashboard)/dashboard/academics/page.tsx
src/app/baseball/(dashboard)/dashboard/players/[id]/page.tsx
src/app/baseball/(dashboard)/dashboard/players/[id]/profile/page.tsx
src/app/baseball/(public)/player/[id]/page.tsx
src/app/baseball/(public)/program/[id]/page.tsx
src/app/baseball/join/[code]/page.tsx
src/app/golf/(auth)/login/page.tsx
src/app/golf/(auth)/signup/page.tsx
src/app/golf/(auth)/forgot-password/page.tsx
src/app/golf/(auth)/reset-password/page.tsx
src/app/golf/(onboarding)/coach/page.tsx
src/app/golf/(onboarding)/player/page.tsx
src/app/golf/(dashboard)/dashboard/page.tsx
src/app/golf/(dashboard)/dashboard/roster/page.tsx
src/app/golf/(dashboard)/dashboard/calendar/page.tsx
src/app/golf/(dashboard)/dashboard/messages/page.tsx
src/app/golf/(dashboard)/dashboard/settings/page.tsx
src/app/golf/(dashboard)/dashboard/qualifiers/page.tsx
src/app/golf/(dashboard)/dashboard/qualifiers/[id]/page.tsx
src/app/golf/(dashboard)/dashboard/rounds/page.tsx
src/app/golf/(dashboard)/dashboard/rounds/new/page.tsx
src/app/golf/(dashboard)/dashboard/rounds/[id]/page.tsx
src/app/golf/(dashboard)/dashboard/stats/page.tsx
src/app/golf/(dashboard)/dashboard/team/page.tsx
src/app/golf/(dashboard)/dashboard/classes/page.tsx
src/app/golf/(dashboard)/dashboard/documents/page.tsx
src/app/golf/(dashboard)/dashboard/travel/page.tsx
src/app/golf/(dashboard)/dashboard/tasks/page.tsx
src/app/golf/(dashboard)/dashboard/announcements/page.tsx
src/app/golf/join/[code]/page.tsx
```

### Layouts (29 total)
```
src/app/layout.tsx
src/app/baseball/(dashboard)/layout.tsx
src/app/baseball/(dashboard)/dashboard/activate/layout.tsx
src/app/baseball/(dashboard)/dashboard/analytics/layout.tsx
src/app/baseball/(dashboard)/dashboard/calendar/layout.tsx
src/app/baseball/(dashboard)/dashboard/camps/layout.tsx
src/app/baseball/(dashboard)/dashboard/college-interest/layout.tsx
src/app/baseball/(dashboard)/dashboard/colleges/layout.tsx
src/app/baseball/(dashboard)/dashboard/compare/layout.tsx
src/app/baseball/(dashboard)/dashboard/dev-plan/layout.tsx
src/app/baseball/(dashboard)/dashboard/dev-plans/layout.tsx
src/app/baseball/(dashboard)/dashboard/discover/layout.tsx
src/app/baseball/(dashboard)/dashboard/journey/layout.tsx
src/app/baseball/(dashboard)/dashboard/messages/layout.tsx
src/app/baseball/(dashboard)/dashboard/pipeline/layout.tsx
src/app/baseball/(dashboard)/dashboard/profile/layout.tsx
src/app/baseball/(dashboard)/dashboard/roster/layout.tsx
src/app/baseball/(dashboard)/dashboard/settings/layout.tsx
src/app/baseball/(dashboard)/dashboard/team/layout.tsx
src/app/baseball/(dashboard)/dashboard/videos/layout.tsx
src/app/baseball/(dashboard)/dashboard/watchlist/layout.tsx
src/app/baseball/(onboarding)/player/layout.tsx
src/app/baseball/(public)/layout.tsx
src/app/golf/(dashboard)/layout.tsx
src/app/golf/(dashboard)/dashboard/classes/layout.tsx
src/app/golf/(dashboard)/dashboard/messages/layout.tsx
src/app/golf/(dashboard)/dashboard/rounds/new/layout.tsx
src/app/golf/(dashboard)/dashboard/settings/layout.tsx
src/app/golf/(dashboard)/dashboard/tasks/layout.tsx
```

### API Routes (3 total)
```
src/app/auth/callback/route.ts
src/app/api/calendar/events/route.ts
src/app/api/log-error/route.ts
```

---

*End of Route Inventory Report*
