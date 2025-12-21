# Dashboard Audit Report

**Generated:** December 18, 2024
**Status:** CRITICAL ISSUES FOUND

---

## Executive Summary

The current implementation has a **single unified dashboard** at `/dashboard/*` instead of separate dashboards per coach type. While the sidebar shows different navigation based on `coach_type`, all coaches share the same routes and many pages don't properly differentiate between coach types.

### Critical Issues

1. **No coach-type-specific routes** - Everything under `/dashboard/`, not `/coach/college/`, etc.
2. **Main dashboard shows recruiting UI to ALL coach types** (including HS/Showcase who shouldn't see it)
3. **No role-based route protection** - Any coach can access any page
4. **JUCO mode toggle exists but doesn't properly separate content**
5. **Showcase coach has no multi-team support**

---

## Route Structure Analysis

### Current Routes (ACTUAL)
```
/dashboard                    - Main dashboard (recruiting-focused for ALL coaches)
/dashboard/team               - Team dashboard (for team mode)
/dashboard/discover           - Player discovery
/dashboard/watchlist          - Watchlist management
/dashboard/pipeline           - Pipeline/kanban board
/dashboard/compare            - Player comparison
/dashboard/camps              - Camp management
/dashboard/roster             - Roster management
/dashboard/videos             - Video library
/dashboard/dev-plans          - Development plans (coach)
/dashboard/dev-plan           - Development plan (player)
/dashboard/college-interest   - College interest tracking
/dashboard/calendar           - Calendar
/dashboard/messages           - Messages
/dashboard/messages/[id]      - Conversation thread
/dashboard/profile            - Profile editor (player)
/dashboard/program            - Program profile (coach)
/dashboard/settings           - Settings
/dashboard/settings/privacy   - Privacy settings
/dashboard/analytics          - Analytics
/dashboard/activate           - Recruiting activation (player)
/dashboard/colleges           - College browsing (player)
/dashboard/journey            - Recruiting journey (player)
/dashboard/players/[id]       - Player detail view
```

### Expected Routes (PER CLAUDE.md SPEC)
```
/coach/college/               - College coach dashboard
/coach/college/discover       - Discover players
/coach/college/watchlist      - Watchlist
/coach/college/pipeline       - Pipeline
/coach/college/compare        - Compare players
/coach/college/camps          - Camps
/coach/college/messages       - Messages
/coach/college/calendar       - Calendar
/coach/college/program        - Program profile
/coach/college/settings       - Settings

/coach/high-school/           - HS coach dashboard
/coach/high-school/roster     - Roster
/coach/high-school/videos     - Video library
/coach/high-school/dev-plans  - Dev plans
/coach/high-school/interest   - College interest
/coach/high-school/calendar   - Calendar
/coach/high-school/messages   - Messages
/coach/high-school/team-settings
/coach/high-school/settings

/coach/juco/                  - JUCO dashboard (with mode toggle)
(recruiting mode pages same as college)
(team mode pages same as HS)

/coach/showcase/              - Showcase org dashboard
/coach/showcase/teams         - Teams list
/coach/showcase/events        - Events
/coach/showcase/team/[id]/roster
/coach/showcase/team/[id]/videos
etc.
```

---

## Dashboard Analysis by Coach Type

### 1. COLLEGE COACH

**Expected Features:**
- [x] Discover Players
- [x] Watchlist
- [x] Pipeline (Kanban)
- [x] Compare Players
- [x] Camps
- [x] Messages
- [x] Calendar
- [x] Program Profile
- [x] Settings

**Current Status: 85% FUNCTIONAL**

| Page | Exists | Renders | Works | Notes |
|------|--------|---------|-------|-------|
| Dashboard | YES | YES | PARTIAL | Shows recruiting stats, pipeline counts |
| Discover | YES | YES | YES | Filters, search, player cards |
| Watchlist | YES | YES | YES | 596 lines, full CRUD |
| Pipeline | YES | YES | YES | Drag-drop kanban |
| Compare | YES | YES | YES | Side-by-side comparison |
| Camps | YES | YES | YES | Camp CRUD |
| Messages | YES | YES | YES | Conversation list + thread |
| Calendar | YES | YES | YES | FullCalendar integration |
| Program | YES | YES | YES | Program profile editor |
| Settings | YES | YES | YES | Basic settings |

**Issues:**
- Dashboard is accessible to ALL coach types (should be restricted)
- No access control - HS coach can visit `/dashboard/discover`

---

### 2. HIGH SCHOOL COACH

**Expected Features:**
- [x] Team Dashboard (NOT recruiting dashboard)
- [x] Roster Management
- [x] Video Library
- [x] Dev Plans
- [x] College Interest Tracking
- [x] Calendar
- [x] Messages
- [ ] Team Join Links (generate invite codes)
- [x] Settings

**Current Status: 70% FUNCTIONAL**

| Page | Exists | Renders | Works | Notes |
|------|--------|---------|-------|-------|
| Dashboard | YES | YES | WRONG | Shows recruiting UI, should show team UI |
| Team Dashboard | YES | YES | YES | `/dashboard/team` - correct team UI |
| Roster | YES | YES | YES | 343 lines, player list |
| Videos | YES | YES | YES | Video library |
| Dev Plans | YES | YES | YES | Plan CRUD |
| College Interest | YES | YES | YES | 455 lines, tracks views/watchlists |
| Calendar | YES | YES | YES | Shared calendar component |
| Messages | YES | YES | YES | Shared messages component |
| Settings | YES | YES | YES | Shared settings |

**Critical Issues:**
1. **HS Coach sees RECRUITING dashboard by default** - Should see Team Dashboard
2. **Can access `/dashboard/discover`** - Should be blocked
3. **Can access `/dashboard/watchlist`** - Should be blocked
4. **Can access `/dashboard/pipeline`** - Should be blocked
5. **No team invite link generation**

---

### 3. JUCO COACH

**Expected Features:**
- [x] Mode Toggle (Recruiting <-> Team)
- [ ] Recruiting Mode = Same as College Coach
- [ ] Team Mode = Same as HS Coach + Academics
- [ ] Academics Tracking
- [ ] Transfer Portal features

**Current Status: 40% FUNCTIONAL**

| Feature | Exists | Works | Notes |
|---------|--------|-------|-------|
| Mode Toggle | YES | PARTIAL | In sidebar, switches nav items |
| Recruiting Mode | YES | YES | Uses same pages as college |
| Team Mode | YES | YES | Uses same team pages |
| Academics | NO | NO | Not implemented |
| Transfer Tracking | NO | NO | Not implemented |

**Critical Issues:**
1. **Mode toggle exists in sidebar but doesn't gate content**
2. **No academics tracking page**
3. **Dashboard doesn't change based on mode** - always shows recruiting
4. **No transfer portal integration**

---

### 4. SHOWCASE COACH

**Expected Features:**
- [ ] Organization Dashboard
- [ ] Multi-Team Management (team switcher)
- [ ] Events Management
- [ ] Per-Team Views (roster, videos, etc.)
- [ ] Team CRUD

**Current Status: 20% FUNCTIONAL**

| Feature | Exists | Works | Notes |
|---------|--------|-------|-------|
| Org Dashboard | NO | NO | Uses generic team dashboard |
| Team Switcher | NO | NO | Not implemented |
| Teams List | NO | NO | Not implemented |
| Events | NO | NO | Not implemented |
| Multi-team Roster | NO | NO | Single team only |

**Critical Issues:**
1. **No multi-team support whatsoever**
2. **No organization dashboard**
3. **No team creation/switching UI**
4. **Uses single-team model like HS coach**
5. **No event management (showcases, tryouts, etc.)**

---

## Sidebar Navigation Analysis

### Current Logic (in sidebar.tsx)

```typescript
// Navigation selection based on coach_type and mode
if (coach?.coach_type === 'college') {
  return coachRecruitingNav;  // Recruiting only
} else if (coach?.coach_type === 'juco') {
  return currentMode === 'recruiting' ? coachRecruitingNav : coachTeamNav;  // Toggle
} else {
  // HS and Showcase coaches only have team mode
  return coachTeamNav;
}
```

**This is CORRECT** - Navigation changes based on coach type.

**Problem:** The pages themselves don't enforce access control. HS coach can manually visit `/dashboard/discover`.

---

## Dev Mode Accounts

All 4 coach types have dev accounts for testing:

| Type | Email | coach_type |
|------|-------|------------|
| College | coach@college.dev | `college` |
| HS | coach@highschool.dev | `high_school` |
| JUCO | coach@juco.dev | `juco` |
| Showcase | coach@showcase.dev | `showcase` |

Access via `/dev` page.

---

## Recommended Fixes (Priority Order)

### Phase 1: Route Protection (CRITICAL)

1. Add middleware to protect routes based on coach_type
2. Redirect coaches to appropriate default dashboard
3. Block access to irrelevant pages

### Phase 2: College Coach (Complete existing)

1. Already mostly working
2. Add route protection
3. Minor polish

### Phase 3: HS Coach (Fix default dashboard)

1. Make `/dashboard` redirect to `/dashboard/team` for HS coaches
2. Block recruiting routes (discover, watchlist, pipeline)
3. Add team invite link generation

### Phase 4: JUCO Coach (Mode toggle content)

1. Make dashboard responsive to mode toggle
2. Add academics page
3. Ensure content switches with mode

### Phase 5: Showcase Coach (Major work)

1. Create organization dashboard
2. Implement team switcher
3. Create teams list/CRUD
4. Add events management
5. Per-team views

---

## Files to Create/Modify

### New Files Needed:
```
src/middleware.ts             - Update for coach-type route protection
src/app/(dashboard)/dashboard/academics/page.tsx  - JUCO academics
src/app/(dashboard)/dashboard/teams/page.tsx      - Showcase team list
src/app/(dashboard)/dashboard/events/page.tsx     - Showcase events
src/components/layout/team-switcher.tsx           - Showcase team switcher
```

### Files to Modify:
```
src/app/(dashboard)/dashboard/page.tsx  - Add coach_type routing logic
src/components/layout/sidebar.tsx       - Already correct, no changes needed
src/middleware.ts                       - Add route protection
```

---

## Summary Table

| Dashboard | Routes | Navigation | Content | Access Control | Overall |
|-----------|--------|------------|---------|----------------|---------|
| College   | SHARED | CORRECT    | GOOD    | NONE           | 85%     |
| HS        | SHARED | CORRECT    | WRONG DEFAULT | NONE     | 70%     |
| JUCO      | SHARED | PARTIAL    | PARTIAL | NONE           | 40%     |
| Showcase  | SHARED | CORRECT    | MISSING | NONE           | 20%     |

**Overall Platform Readiness: 55%**

---

## Next Steps

1. Read this audit completely
2. Implement route protection middleware
3. Fix HS coach default dashboard
4. Build missing Showcase features
5. Add JUCO-specific features
6. Test all 4 dashboards end-to-end
