# GolfHelm Multi-Agent Code Review

**Date**: 2026-02-13 | **Agents**: 4 (Code Quality, Security, Performance, Architecture)

---

## Executive Summary

| Dimension | Critical | High | Medium | Total |
|-----------|----------|------|--------|-------|
| Security | 3 | 5 | 4 | 12 |
| Performance | 2 | 4 | 6 | 12 |
| Code Quality | 3 | 4 | 2 | 9 |
| Architecture | 0 | 4 | 5 | 9 |
| **Totals** | **8** | **17** | **17** | **42** |

**Overall Assessment**: The architecture is solid with excellent patterns (discriminated unions, server/client separation, layered CoachHelm AI). The critical issues are concentrated in **security** (unauthenticated endpoints, broken RLS policies) and **performance** (dashboard entirely client-rendered, duplicate data fetching). Code quality is good but has systemic `any` usage and console logging violations.

---

## CRITICAL Issues (Fix Immediately)

### SEC-1. Unauthenticated `seedTestShotData()` with Service-Role Access
**File**: `src/app/golf/actions/golf.ts:4199`

Exported server action uses `createAdminClient()` (service role, bypasses ALL RLS) with **zero authentication**. Any user can invoke this to read/write shot data across all teams.

**Fix**: Delete or gate behind `role === 'admin'` check.

### SEC-2. Unauthenticated Error Logging Endpoint with Admin Client
**File**: `src/app/api/log-error/route.ts`

POST endpoint uses `createAdminClient()` with no auth check. Any anonymous user can write arbitrary data to `error_logs` and set fake `user_id` values.

**Fix**: Add `supabase.auth.getUser()`, use authenticated user's ID.

### SEC-3. Broken RLS Coach-Access SELECT Policies (7 Tables)
**File**: `supabase/migrations/034_all_rls_policies.sql`

`*_select_team` policies on `golf_rounds`, `golf_holes`, `golf_shots`, `golf_classes`, `golf_reviews`, `golf_focus_areas`, and `golf_calendar_notifications` reference non-existent columns (`gc.team_id`, `gp.team_id`). Coaches **cannot see any team data** through RLS for these tables. UPDATE policies were fixed in a later migration, but SELECT policies remain broken.

**Fix**: New migration to drop/recreate affected SELECT policies using the correct join path: `golf_coaches.organization_id -> golf_teams -> golf_team_members`.

### PERF-1. Dashboard Page Entirely Client-Rendered
**File**: `src/app/golf/(dashboard)/dashboard/page.tsx`

Main dashboard is `'use client'` with all data fetching in `useEffect`. Server sends an empty shell, then client makes 5-7 sequential Supabase queries. The layout already resolves auth/role/team on the server but the page throws it away.

**Estimated impact**: 1-3 second Time-to-Content penalty on every dashboard visit.

**Fix**: Convert to server component. Fetch initial data server-side, pass as props to client sub-components.

### PERF-2. `framer-motion` Full Bundle in 2 Dashboard Components
**Files**: `src/components/golf/dashboard/premium-components.tsx:22`, `src/components/golf/dashboard/stat-card-sparkline.tsx:5`

These import `motion` directly instead of `m` from framer-motion, defeating the `LazyMotion` tree-shaking setup already in place.

**Estimated impact**: 30-40 KB additional gzipped JS.

**Fix**: Replace `import { motion }` with `import { m }` and change all `motion.div` to `m.div`.

### CQ-1. `console.error` in Production Code (14+ instances)
**Files**: `src/app/golf/actions/teams.ts` (14), `src/app/golf/actions/shot-analytics.ts` (2), `src/app/golf/actions/documents.ts`

Violates project rule: "No `console.log` in production code."

**Fix**: Remove all console statements. Errors are already returned in response objects.

### CQ-2. Entire File ESLint Disabled for `any`
**File**: `src/app/golf/actions/documents.ts:1`

File-level `/* eslint-disable @typescript-eslint/no-explicit-any */` disables TypeScript strict mode entirely.

**Fix**: Run `npm run db:types`, remove eslint disable and type assertions.

### CQ-3. 150+ `any` Type Suppressions Across 35 Files
Top offenders: `caldav-sync.ts` (25), `insights.ts` (25), `tasks.ts` (19), `coachhelm-analytics.ts` (15), `travel.ts` (13).

**Fix**: Regenerate Supabase types, use proper `PostgrestFilterBuilder` generics.

---

## HIGH Issues

### Security

| # | Issue | File | Fix |
|---|-------|------|-----|
| SEC-4 | Mass assignment in calendar events API (spreads untrusted body) | `src/app/api/calendar/events/route.ts:83` | Pick only allowed fields |
| SEC-5 | IDOR in putt tendencies API (any coach can view any player) | `src/app/api/golf/players/[playerId]/putt-tendencies/route.ts:67` | Verify coach's team matches player's team |
| SEC-6 | 9 document actions missing auth checks (rely solely on RLS) | `src/app/golf/actions/documents.ts` | Add `auth.getUser()` to all functions |
| SEC-7 | Missing auth in schedule/availability functions | `src/app/golf/actions/golf.ts:1940,1975,2252` | Add auth + team ownership checks |
| SEC-8 | Qualifier status update IDOR (any auth user can change any qualifier) | `src/app/golf/actions/golf.ts:1675` | Add coach ownership verification |

### Performance

| # | Issue | File | Impact |
|---|-------|------|--------|
| PERF-3 | Duplicate data fetching (dashboard queries + enhanced server action) | `dashboard/page.tsx` + `dashboard-data.ts` | 6-10 unnecessary DB round trips |
| PERF-4 | Pervasive `SELECT *` (55+ occurrences) | 35+ action files | 2-5x more data transferred |
| PERF-5 | Calendar page re-authenticates from scratch (pattern repeated across pages) | `dashboard/calendar/page.tsx` | 200-500ms unnecessary queries |
| PERF-6 | Player rounds page has no LIMIT clause | `dashboard/rounds/page.tsx:179` | Linear growth with data |

### Code Quality

| # | Issue | File | Fix |
|---|-------|------|-----|
| CQ-4 | Incorrect type import path (`@/types/table`) | `src/components/ui/row-actions-menu.tsx:6`, `data-table.tsx:15` | Move to `@/lib/types` |
| CQ-5 | Notification catch blocks swallow errors silently | `src/app/golf/actions/teams.ts` (4 locations) | Return warnings or log to Sentry |
| CQ-6 | Generic type constraint uses `any` | `src/app/golf/actions/stats-data.ts:127` | Use `PostgrestFilterBuilder` type |

### Architecture

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| ARCH-1 | `lib/` imports from `app/` (circular dependency) | `src/lib/offline/sync-engine.ts`, `orchestrator.ts:962` | Non-portable lib layer |
| ARCH-2 | 250+ `'use client'` components (many unnecessary) | Various | Larger client bundles |
| ARCH-3 | Duplicate auth stores (2 Zustand + server layout) | `stores/golf-auth-store.ts`, `stores/auth-store.ts` | 3 sources of truth |
| ARCH-4 | CoachHelm orchestrator too large (1509 lines) | `src/lib/coachhelm/v2/orchestrator.ts` | Hard to maintain/test |

---

## MEDIUM Issues

### Security
- SEC-9: Coach calendar feed ignores token parameter (`src/app/api/calendar/coach/[token]/route.ts`)
- SEC-10: DM privacy leak fix — verify migration `20260212000003` applied to production
- SEC-11: Stats data actions missing application-level auth (`src/app/golf/actions/stats-data.ts`)
- SEC-12: Calendar events GET doesn't verify team membership (`src/app/api/calendar/events/route.ts:40`)

### Performance
- PERF-7: TamboProvider + OfflineProvider loaded on every page (~15MB in node_modules)
- PERF-8: PlayerFocusAreas uses spinner instead of skeleton (design system violation + extra waterfall)
- PERF-9: `getRoundDetails` has 5 sequential auth queries (200-400ms overhead)
- PERF-10: `getDetailedStats` fetches all shots with `SELECT *` + nested relations
- PERF-11: Pending performance index migration not applied to production
- PERF-12: Missing `revalidate` on dashboard, stats, messages, tasks pages

### Code Quality
- CQ-7: TODO comments reference missing database tables (4 dead code paths in event-lifecycle.ts, attendance.ts)
- CQ-8: Missing sample size validation in some CoachHelm insight generators

### Architecture
- ARCH-5: Inconsistent component organization (split between app/ and components/)
- ARCH-6: Duplicate database type files (`database.types.ts` + `database.ts`)
- ARCH-7: Missing CoachHelm unit tests entirely (0 test files in `src/lib/coachhelm/v2/`)
- ARCH-8: Stats calculator not cached (reprocesses all shots per request)
- ARCH-9: No rate limiting on expensive server actions (`getDetailedStats`, `analyzePlayer`)

---

## Positive Observations

**Security**: Login has rate limiting + account lockout. Messaging sanitizes with `sanitizeHtml()`. Most team actions verify coach ownership. Admin dashboard gates on `role === 'admin'`. Message INSERT policy correctly requires `sender_id = auth.uid()`.

**Performance**: Server actions use `Promise.all` for parallel queries. `TrendChart` and `CommandPalette` dynamically imported. Dashboard components use `memo()`, `useMemo()`, and stable constants. Insight generator batches players (3 at a time). Most pages set `revalidate` for ISR caching.

**Code Quality**: `'use client'` directives properly placed on interactive components. Server/client Supabase correctly separated. Table names consistently use `golf_` prefix.

**Architecture**: Excellent discriminated union state machine for dashboard. CoachHelm's layered architecture (orchestrator -> mining -> prediction -> NLG) is well-designed. GolfUserContext pattern is ideal for server->client data flow. Type system is comprehensive with 100+ typed golf metrics. 76 golf tables all have RLS enabled.

---

## Recommended Priority Order

### Phase 1: Security Critical (This Week)
1. Delete or gate `seedTestShotData()` — zero-effort exploit
2. Add auth to `/api/log-error` — unauthenticated DB writes
3. Fix broken `*_select_team` RLS policies — coaches can't see team data
4. Fix mass assignment in calendar events API
5. Fix putt tendencies IDOR

### Phase 2: Performance Critical (Next Sprint)
6. Convert dashboard page to server component (1-3s improvement)
7. Fix `motion` -> `m` imports in 2 files (30-40KB saved)
8. Consolidate duplicate dashboard data fetching (6-10 fewer DB round trips)
9. Apply pending performance index migration

### Phase 3: Code Quality (Ongoing)
10. Run `npm run db:types` to regenerate Supabase types
11. Remove all `console.error` statements
12. Replace `SELECT *` with explicit columns in top server actions
13. Fix type import violations

### Phase 4: Architecture (Quarter)
14. Extract CoachHelm insight converters from orchestrator (~700 lines)
15. Audit and convert unnecessary `'use client'` components
16. Add CoachHelm unit tests
17. Resolve circular `lib/` -> `app/` dependencies
