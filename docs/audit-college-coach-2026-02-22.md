# BaseballHelm College Coach Dashboard — Full Audit
Date: 2026-02-22

---

## Executive Summary

The college coach recruiting dashboard is **functionally complete** for core flows (Discover, Pipeline, Watchlist, Compare, Camps, Messages, Calendar). Auth guards are consistent, the `recruiting_activated` filter is applied correctly, RLS helper functions are properly migrated, and TypeScript compiles with **zero errors**.

The primary issues fall into three categories:
1. **Rule violations**: `createClient()` at component body level (not in `useRef`); raw `lucide-react` imports in calendar + settings components; `animate-spin` spinners in Discover flow.
2. **UX dead ends**: The Analytics page is a stub for coaches (redirects them back to Command Center); the Command Center's "Roster" and "Stats" tabs could be considered team management UI exposed to college coaches.
3. **Stub function**: `resolveUnmatchedPlayers()` in `stats.ts` returns success without actually re-processing CSV.

---

## Critical Issues (launch blockers)

- [ ] **`use-messages.ts` — `createClient()` at hook body level (×2)** — `src/hooks/use-messages.ts:13,78` — `const supabase = createClient()` is called at the top of `useMessages` and `useConversations` hooks. Because `supabase` ends up in `useEffect`/`useCallback` dependency arrays, this creates a new client object on every render, which can trigger re-subscriptions and infinite re-fetching of conversations and messages. Rule 5 violation. Both hooks need `const supabaseRef = useRef(createClient()); const supabase = supabaseRef.current;`.

- [ ] **`compare/page.tsx` — `createClient()` at component body level** — `src/app/baseball/(dashboard)/dashboard/compare/page.tsx:27` — `const supabase = createClient()` is declared in `CompareContent()` component body. It is then referenced in `useEffect` with `// eslint-disable-next-line react-hooks/exhaustive-deps` suppression to avoid the infinite-loop warning, masking the root problem. Rule 5 violation.

- [ ] **`camps/page.tsx` — `createClient()` at component body level** — `src/app/baseball/(dashboard)/dashboard/camps/page.tsx:203` — Same pattern as compare. `const supabase = createClient()` in `CampsPage` function body. The `supabase` instance is also used inside `onClose` callback on the `CreateCampModal`, which will use a stale reference if the component re-renders between open and close. Rule 5 violation.

---

## High Priority (UX broken/incomplete)

- [ ] **Calendar components use raw `lucide-react` imports** — 8 files in `src/components/baseball/calendar/` violate the icon system rule (Rule 6):
  - `EventDetailModal.tsx:5` — `import { X, Trash2, MapPin, Calendar, Clock, Users, AlertCircle, UserPlus } from 'lucide-react'`
  - `DayView.tsx:4` — `import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'`
  - `CalendarHeader.tsx:3` — `import { ChevronLeft, ChevronRight, Plus, List, CalendarDays, Menu, LayoutGrid } from 'lucide-react'`
  - `QuickAddEventFAB.tsx:5` — `import { Plus, X, Calendar } from 'lucide-react'`
  - `WeekView.tsx:4` — `import { Calendar } from 'lucide-react'`
  - `EventListView.tsx:3` — `import { Calendar } from 'lucide-react'`
  - `EventCard.tsx:3` — `import { MapPin, Users } from 'lucide-react'`
  - `RSVPButtons.tsx:5` — `import { CheckCircle2, HelpCircle, XCircle, Loader2 } from 'lucide-react'`
  
  Calendar is in the college coach nav, so coaches see all these components. Should use `@/components/icons`.

- [ ] **`recruiting-preferences-client.tsx` — raw `lucide-react` import AND spinner** — `src/app/baseball/(dashboard)/dashboard/settings/recruiting-preferences/recruiting-preferences-client.tsx:14` — `import { Check, Loader2, Save, MapPin, GraduationCap } from 'lucide-react'` (Rule 6 violation). Additionally, `Loader2 animate-spin` at line 287 is a spinner, not a skeleton (Rule 4 violation). Replace with `@/components/icons` equivalents and a skeleton/disabled state.

- [ ] **Recruiting-philosophy components use raw `lucide-react`** — 3 files used on the Recruiting Preferences settings page (college coaches can access this):
  - `PositionPriorityRanker.tsx:6` — `import { GripVertical, X, Plus } from 'lucide-react'`
  - `MatchScoreBadge.tsx:8` — `import { ChevronDown, Target, AlertCircle } from 'lucide-react'`
  - `MinimumStandards.tsx:6` — `import { AlertTriangle, Check } from 'lucide-react'`

- [ ] **Analytics page is a dead end for coaches** — `src/app/baseball/(dashboard)/dashboard/analytics/page.tsx:36-57` — The page shows a "Recruiting Analytics" message that says "go to Command Center" for coach users. However, the college coach Dashboard page links to `/baseball/dashboard/analytics` from the "Profile Views" and "Messages" stat cards (`src/app/baseball/(coach-dashboard)/coach/college/page.tsx:170,181`). Coaches who click those cards hit a placeholder page. Either: (a) build real analytics, or (b) update the href in the dashboard cards to link to Command Center.

- [ ] **Discover page spinners (not skeletons) for "Updating results..."** — `src/components/coach/discover/DiscoverView.tsx:598,640` — When filter changes are in-flight, an inline `animate-spin` ring is shown as "Updating results..." feedback. Rule 4 says no spinners — use skeleton shimmer or a progress bar instead. The initial load correctly uses a skeleton grid; the re-fetch state should do the same.

- [ ] **FilterPanel save-search button spinner** — `src/components/coach/discover/FilterPanel.tsx:623` — `<div className="animate-spin h-4 w-4 border-2 border-slate-900 border-t-transparent rounded-full" />` on the save-search button during loading. Rule 4 violation; replace with a disabled state or skeleton.

---

## Medium Priority (partial feature / pattern warnings)

- [ ] **`resolveUnmatchedPlayers()` is a stub** — `src/app/baseball/actions/stats.ts:313-329` — The function body comment says "This would require storing the original CSV data to re-process / For now, return success as a placeholder." It inserts nothing and returns `{ success: true }` without doing any work. The CSV unmatched-player resolution UI flow (in Command Center stats upload) shows a confirmation UI that then calls this function — users think they resolved the issue but nothing happens.

- [ ] **`use-baseball-dashboard.ts` — `createClient()` at module level** — `src/hooks/use-baseball-dashboard.ts:22` — `const supabaseClient = createClient()` is at module scope (outside any hook). This is executed once when the module is imported. While it avoids per-render recreation, it is a module-level singleton which can cause issues with SSR or multi-user test environments. Should be wrapped in `useRef` inside the hook.

- [ ] **`use-watchlist.ts:16` — `useMemo` instead of `useRef` for Supabase client** — `src/hooks/use-watchlist.ts:16` — `const supabase = useMemo(() => createClient(), [])` is acceptable but non-standard. Rule 5 requires `useRef`. Replace with `const supabaseRef = useRef(createClient()); const supabase = supabaseRef.current;`.

- [ ] **`WatchlistClient.tsx:80` — `useMemo` instead of `useRef` for Supabase client** — `src/app/baseball/(dashboard)/dashboard/watchlist/WatchlistClient.tsx:80` — Same pattern as `use-watchlist.ts`. Should use `useRef`.

- [ ] **Calendar page shows team-management-flavored UI for college coaches** — `src/app/baseball/(dashboard)/dashboard/calendar/page.tsx` — College coaches who have a team (committed players) see a full team event calendar with Roster RSVP tracking. College coaches who have no team see an empty calendar with no recruiting-specific events (no prospect visit scheduling, no campus visit tracking). The calendar should either be gated to coaches who have a team, or show a recruiting-calendar mode for coaches without a team.

- [ ] **Command Center exposes "Upload Stats" link to college coaches** — `src/components/baseball/command-center/CommandCenterClient.tsx:~460` — There is an "Upload Stats" button in the Roster tab linking to `/baseball/dashboard/stats/upload`. This is a team-stats-management flow. College coaches with a committed-player roster can use this, but it is not clearly college-coach-specific UI. No harm currently, but could confuse.

- [ ] **`programs/[id]/page.tsx` — `organization_settings`, `organization_facilities`, `program_commitments` tables not yet created** — `src/app/baseball/(public)/program/[id]/page.tsx:73-76` — Comment in code: "Note: organization_settings, organization_staff, organization_facilities, and program_commitments tables don't exist yet - will be added in future." The `facilities` and `commitments` arrays are initialized empty and never populated. The Program Profile page renders but without facilities or commitment history sections.

- [ ] **`use-messages-subscription.ts` — not audited for `useRef` compliance** — `src/hooks/use-messages-subscription.ts` — Subscription hook not reviewed in detail; likely also has `createClient()` at hook body level (same file convention as `use-messages.ts`). Should be verified and fixed.

---

## Low Priority (polish)

- [ ] **`complete-signup/CompleteSignupClient.tsx` — spinner in auth flow** — `src/app/baseball/(auth)/complete-signup/CompleteSignupClient.tsx:97` — `animate-spin` spinner used during form submission. Not in the coach dashboard itself, but sets a precedent. Auth loading states should use a disabled button state, not a spinner.

- [ ] **`loading.tsx` files for auth routes use `animate-spin`** — Four `loading.tsx` files (`coach-onboarding`, `complete-signup`, `forgot-password`, `reset-password`) use `animate-spin` spinner rings. These are Next.js route-level loading boundaries, not dashboard UI. Low impact but inconsistent with the no-spinner rule.

- [ ] **`PlayerProfileClient.tsx:282` — spinner in add-to-watchlist button** — `src/app/baseball/(public)/player/[id]/PlayerProfileClient.tsx:282` — Inline spinner on the "Add to Watchlist" button during save. Should be a disabled state or subtle label change ("Adding…").

- [ ] **Discover — college coach sees JUCO teams in Browse view** — `src/app/baseball/actions/discover.ts:246` — For team/org discovery, college coaches can see `high_school | showcase | juco` orgs, which is correct per spec. No issue, just confirming it's working as designed.

- [ ] **Pipeline page — `console.error` calls left in production handlers** — `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx:244` — `console.error('Error updating pipeline stage:', err)` is present in the drag-end handler. Low severity but should be replaced with proper error logging.

---

## What Works Well

1. **TypeScript: Zero errors** — `pnpm tsc --noEmit` exits clean with 0 output lines.
2. **Auth guards: Consistent** — Every server action checked uses `supabase.auth.getUser()` or `requireCoach()` with early return on unauthorized. No naked DB calls.
3. **`recruiting_activated` filter: Correctly applied** — `getDiscoverPlayers()` applies `.eq('recruiting_activated', true)` at the DB level (not client-side). State counts also filter correctly.
4. **No `head_coach_id` references in active code** — All six occurrences are comments documenting the absence of the column. Correct coach-team lookups go through `baseball_team_coach_staff`.
5. **RLS helper functions in place** — `get_my_baseball_conversation_ids()`, `get_my_coach_id()`, `get_my_player_id()`, `is_baseball_team_coach()`, `is_baseball_primary_coach()` are all defined with `SECURITY DEFINER` in migration `20260222120000`. The recursive RLS bug on `baseball_conversation_participants` is fixed.
6. **`PageLoading` uses skeleton, not spinner** — `src/components/ui/loading.tsx` routes `PageLoading` → `GenericPageSkeleton`. Route-level loading skeletons are correct.
7. **College coach route protection works** — `useRecruitingRouteProtection()` correctly allows `college` and `juco` and blocks `high_school` / `showcase`. `useTeamRouteProtection()` explicitly excludes college coaches from team-only pages.
8. **Icon system: Dashboard and core components compliant** — The college coach dashboard, pipeline, watchlist, compare, discover, messages pages all use `@/components/icons`. Violations are isolated to calendar subdirectory and settings components.
9. **Pipeline Kanban, Position Planner, and List views all functional** — Complete feature with DnD, bulk actions, keyboard navigation, and mobile card view.
10. **Discover: Coach-type visibility rules implemented** — College coaches see HS + showcase + JUCO players. JUCO coaches restricted to HS + showcase only. College player exclusion (`neq('player_type', 'college')`) is correct.
11. **Messages: Conversation RLS is non-recursive** — Fixed in latest migrations.

---

## Feature Completeness Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| Dashboard (college/page.tsx) | ✅ Working | Real data via `useBaseballCoachDashboard`. Stats, pipeline summary, activity feed, map, saved searches all load. |
| Command Center | ✅ Working | Roster + stats tabs, insights feed, calendar widget. Requires committed-player team to show data. |
| Discover — Player mode | ✅ Working | Filters, map, pagination, watchlist toggle all functional. `recruiting_activated` correctly enforced. |
| Discover — Team mode | ✅ Working | Org cards with top prospects, head coach name from `baseball_team_coach_staff`. |
| Discover — Inline spinners | ⚠️ Partial | "Updating results..." spinner violates Rule 4. Functionally works. |
| Pipeline (Kanban) | ✅ Working | DnD stage moves, filter by grad year, real DB updates. |
| Pipeline (Position Planner) | ✅ Working | `PositionPlanner` component with watchlist data. |
| Pipeline (List view) | ✅ Working | Bulk actions, keyboard nav (j/k/Enter/x), inline note editing. |
| Watchlist | ✅ Working | Sort, filter, CSV export, note editing, remove. |
| Compare | ✅ Working | Up to 4 players, `recruiting_activated` filter on search. `createClient()` at component level (Rule 5 violation). |
| Calendar | ⚠️ Partial | Shows team events. College coaches with no team see empty calendar. No recruiting-specific events (prospect visits). |
| Camps | ✅ Working | Coach can create/edit/delete camps and view roster. `createClient()` at component level (Rule 5 violation). |
| Messages | ✅ Working | Conversation list, chat window, new message modal, real-time subscription. `createClient()` at hook body level (potential re-subscription bug). |
| Analytics | ⚠️ Stub | Coach-facing analytics page redirects to Command Center instead of showing data. Dashboard links to this dead-end page. |
| Program Profile `/program/[id]` | ⚠️ Partial | Shows coach staff and roster. Facilities and program commitments sections empty (tables not yet created per code comment). |
| Player Profile `/player/[id]` | ✅ Working | Loads player data, videos, stats. Watchlist toggle functional via `toggleWatchlistPlayer`. |
| Recruiting Preferences Settings | ⚠️ Partial | Functional but uses `lucide-react` imports + Loader2 spinner (Rules 4 & 6 violations). |
| CSV Stat Upload (Command Center) | ⚠️ Stub | Upload works. `resolveUnmatchedPlayers()` is a no-op stub — unmatched player resolution does nothing. |

---

## Recommended Fix Order

1. **Fix `use-messages.ts` `createClient()` at hook body level** — Most impactful bug risk. Creates new Supabase channels on every render. Add `useRef`.

2. **Fix `compare/page.tsx` and `camps/page.tsx` `createClient()` at component body** — Wrap in `useRef`. Suppress ESLint comment in compare is masking a real issue.

3. **Fix Calendar components `lucide-react` imports (8 files)** — College coaches use Calendar nav item daily. Map each lucide icon to the nearest `@/components/icons` equivalent.

4. **Fix `recruiting-preferences-client.tsx` — `lucide-react` import + Loader2 spinner** — Replace with `@/components/icons`; replace Loader2 with button disabled state.

5. **Fix Analytics page dead end for coaches** — Either (a) redirect `/baseball/dashboard/analytics` to `/baseball/dashboard/command-center` when `user.role === 'coach'`, or (b) update the dashboard stat card hrefs to point to Command Center directly.

6. **Fix recruiting-philosophy components `lucide-react` imports** — 3 files (`PositionPriorityRanker`, `MatchScoreBadge`, `MinimumStandards`).

7. **Replace Discover inline spinners with skeleton/progress bar** — `DiscoverView.tsx` lines 598 and 640, `FilterPanel.tsx` line 623.

8. **Implement `resolveUnmatchedPlayers()`** — Store CSV row data on upload (or fetch from storage) and re-process with the provided player ID mappings. Until fixed, the unmatched-player modal is misleading.

9. **Fix `use-watchlist.ts`, `WatchlistClient.tsx`, `use-baseball-dashboard.ts` — `useMemo`/module-level `createClient()`** — Low risk but rules-non-compliant. Convert to `useRef` pattern.

10. **Add recruiting-specific calendar mode for college coaches** — Show prospect visit events, campus visit reminders, contact period deadlines. College coaches without a team should not see an empty team calendar.

11. **Fix `program/[id]` facilities + commitments sections** — Create the `organization_facilities` and `program_commitments` tables (or remove the section placeholders until the tables exist).

---

*Audited by: subagent-audit 2026-02-22 | Files read: ~60 | TypeScript errors: 0*
