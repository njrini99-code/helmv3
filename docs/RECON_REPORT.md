<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Feb/March 2026 point-in-time report; the ground it covers has since had a dedicated, later remediation pass (project memory: "Golf stats correctness audit", "Shot-tracking unit audit — feet/yards blend corrupts proximity").
KEPT FOR HISTORY -- do not delete this file.
-->

# BaseballHelm Overnight Build - Reconnaissance Report

> **Generated**: 2026-02-16 22:10 EST
> **Agent**: Overnight Build Autonomous Agent
> **Deadline**: 6 AM EST (8 hours)

---

## Executive Summary

BaseballHelm is a college baseball recruiting platform with significant infrastructure already in place. The codebase has ~40 route directories under `/baseball/(dashboard)/dashboard/`, with many pages implemented but needing completion. The core architecture follows Next.js 16 App Router patterns with Supabase for data.

**Estimated Production Readiness: 65%**

### What Exists ✅
- Complete auth system (login, signup, onboarding)
- Dashboard layout with role-based sidebar
- Core recruiting features (discover, pipeline, compare)
- Database schema with 104+ migrations
- Type definitions in `@/lib/types`
- Design system (glassmorphism, icons, components)
- Coach and player dashboard hooks
- Server actions in `/baseball/actions/` (20 files)

### What's Missing ❌
- Several routes have placeholder or "Coming Soon" content
- Console.log statements throughout (28+)
- Some pages lack real data fetching
- Missing error boundaries
- Some routes not wired in sidebar
- Test coverage is minimal

---

## Phase 1 Priority: Missing Routes Analysis

### Coach Dashboard Routes (Recruiting Mode)

| Route | Status | Notes |
|-------|--------|-------|
| `/dashboard` | ✅ Complete | Bento grid, stats, engagement chart |
| `/dashboard/command-center` | ✅ Complete | Needs team setup first |
| `/dashboard/discover` | ✅ Complete | Filters, map, search |
| `/dashboard/pipeline` | ✅ Complete | Kanban + list + position views |
| `/dashboard/compare` | ✅ Complete | Side-by-side comparison |
| `/dashboard/calendar` | ⚠️ Needs Review | Check data fetching |
| `/dashboard/camps` | ⚠️ Needs Review | Check CRUD |
| `/dashboard/messages` | ✅ Complete | Realtime messaging |
| `/dashboard/stats/upload` | ⚠️ Needs Review | CSV import |

### Coach Team Dashboard Routes (HS/JUCO)

| Route | Status | Notes |
|-------|--------|-------|
| `/dashboard/team` | ⚠️ Needs Review | Team home |
| `/dashboard/team/high-school` | ⚠️ Needs Review | HS-specific |
| `/dashboard/roster` | ⚠️ Needs Review | Team members |
| `/dashboard/videos` | ⚠️ Needs Review | Video management |
| `/dashboard/dev-plans` | ⚠️ Needs Review | Development plans |
| `/dashboard/academics` | ⚠️ Needs Review | Academic tracking |
| `/dashboard/college-interest` | ⚠️ Needs Review | Interest tracking |
| `/dashboard/announcements` | ⚠️ Needs Review | Team announcements |
| `/dashboard/tasks` | ⚠️ Needs Review | Task management |
| `/dashboard/documents` | 🔴 Coming Soon | Placeholder content |
| `/dashboard/travel` | 🔴 Coming Soon | Placeholder content |

### Player Dashboard Routes

| Route | Status | Notes |
|-------|--------|-------|
| `/dashboard` (player) | ✅ Complete | Profile card, stats |
| `/dashboard/profile` | ⚠️ Needs Review | Profile editor |
| `/dashboard/colleges` | ⚠️ Needs Review | College browser |
| `/dashboard/journey` | 🔴 Error | Empty catch block |
| `/dashboard/camps` | ⚠️ Needs Review | Camp registration |
| `/dashboard/analytics` | ⚠️ Needs Review | Player analytics |
| `/dashboard/activate` | ⚠️ Needs Review | Recruiting activation |
| `/dashboard/videos` | ⚠️ Needs Review | Video upload |
| `/dashboard/dev-plan` | ⚠️ Needs Review | View dev plan |

### Showcase/Org Routes

| Route | Status | Notes |
|-------|--------|-------|
| `/dashboard/organization` | ⚠️ Needs Review | Org dashboard |
| `/dashboard/teams` | ⚠️ Needs Review | Multi-team management |
| `/dashboard/events` | ⚠️ Needs Review | Event management |

---

## Database Schema Summary

**104 migrations applied** covering:
- Core tables: users, organizations, baseball_coaches, baseball_players, baseball_teams
- Recruiting: baseball_watchlists, baseball_videos, baseball_camps
- Team management: baseball_team_members, baseball_team_invitations
- Communication: baseball_messages, baseball_conversations
- Analytics: baseball_player_engagement_events
- Advanced: baseball_player_stats, baseball_player_aggregates, baseball_coach_insights

**Pipeline Stages (ONLY 5 valid):**
```
watchlist | high_priority | offer_extended | committed | uninterested
```

---

## Server Actions Available

Located in `/src/app/baseball/actions/`:

| File | Purpose |
|------|---------|
| auth.ts | Authentication |
| discover.ts | Player discovery |
| watchlist.ts | Pipeline management |
| stats.ts | Stats upload/management |
| teams.ts | Team operations |
| calendar.ts | Calendar events |
| documents.ts | Document management |
| travel.ts | Travel itineraries |
| tasks.ts | Task management |
| announcements.ts | Announcements |
| academics.ts | Academic tracking |
| insights.ts | AI insights |
| messages.ts | Messaging (stub) |

---

## Key Hooks

| Hook | Purpose |
|------|---------|
| `useAuth()` | Auth state (Zustand) |
| `useBaseballCoachDashboard()` | Consolidated coach dashboard data |
| `useBaseballPlayerDashboard()` | Consolidated player dashboard data |
| `useWatchlist()` | Pipeline management |
| `useConversations()` | Message threads |
| `useMessages()` | Individual messages |
| `useRecruitingRouteProtection()` | Route protection |

---

## Known Issues (from TODO.md)

### Critical (7 Broken Links)
- `/golf/login?message=...` - query param route
- `/baseball/login?message=...` - query param route
- `/#demo` - anchor link
- `/player-golf/round/new` - doesn't exist
- `/player-golf/stats` - doesn't exist
- `/player-golf/rounds` - doesn't exist
- `/golf/rounds` - doesn't exist

### Code Cleanup (28 console.log statements)
- classes/page.tsx (multiple)
- new/page.tsx
- coach-onboarding/page.tsx
- academics/page.tsx
- journey/page.tsx
- player/page.tsx
- tasks/page.tsx
- messages/page.tsx

### Placeholder Content
- documents/page.tsx - "Coming Soon"
- travel/page.tsx - "Coming Soon"

---

## Design System Reference

```typescript
// Glassmorphism cards
"bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass"

// Primary color
"#16A34A" (Kelly green)

// Background
"#FFFEFA" (cream)

// Dark sidebar
"#1C1917"
```

---

## Build Strategy

### Phase 1: Complete Missing Routes (2.5 hours)
Focus on routes with placeholder content or incomplete implementations:
1. Documents page - Replace "Coming Soon"
2. Travel page - Replace "Coming Soon"
3. Journey page - Fix error handling
4. Calendar page - Verify CRUD
5. Camps page - Verify CRUD
6. Video pages - Upload/playback
7. Profile page - Full editor

### Phase 2: Database & Backend (1 hour)
1. Remove console.log statements
2. Fix broken links
3. Verify RLS policies
4. Add missing error handling

### Phase 3: UI Polish (2 hours)
1. Loading skeletons on all pages
2. Empty states with CTAs
3. Error states with retry
4. Mobile responsive fixes
5. Sidebar route highlighting

### Phase 4: Error Handling (30 min)
1. Global error boundary
2. 404 page
3. Try/catch on API calls

### Phase 5: Testing & Build (1.5 hours)
1. TypeScript check
2. Build verification
3. Test critical flows

### Phase 6: Deploy & Report (30 min)
1. Final build
2. Documentation

---

## Files to Prioritize

1. `/dashboard/documents/page.tsx` - Replace placeholder
2. `/dashboard/travel/page.tsx` - Replace placeholder
3. `/dashboard/journey/page.tsx` - Fix error handling
4. `/dashboard/roster/page.tsx` - Verify functionality
5. `/dashboard/profile/page.tsx` - Full profile editor
6. `/dashboard/calendar/page.tsx` - Full CRUD
7. `/dashboard/camps/page.tsx` - Registration flow
8. `/dashboard/activate/page.tsx` - Activation flow
9. `/dashboard/analytics/page.tsx` - Charts and data

---

## Starting Phase 1 Now

Prioritizing:
1. Documents page (Coming Soon → Real feature)
2. Travel page (Coming Soon → Real feature)
3. Journey page (Fix error + complete)
4. Remaining route completions

**Clock started: 22:10 EST**
