# Phase 1: Code Quality & Architecture Review

Detailed findings in companion files:
- `01a-code-quality.md` — code-reviewer agent output
- `01b-architecture.md` — architect-review agent output

## Findings consolidated by severity

### CRITICAL (must fix before shipping)

#### C1. Cross-tenant data leak in 3 new dashboard RPCs
**Source:** 1B
**Files:** `supabase/migrations/20260421000003_dashboard_rpcs.sql`
**Issue:** `get_coach_today_schedule(team_id, date)`, `get_player_hub_announcements(team_id, player_id)`, and `get_player_hub_events(team_id, player_id, since)` are `SECURITY DEFINER` + granted to `authenticated` but accept caller-supplied team/player IDs with no ownership verification. Any authenticated user can read any team's events/announcements/schedules.
**Blast radius:** full multi-tenant data exposure for dashboards.
**Fix:** enforce ownership inside each function — verify `auth.uid()` belongs to `p_team_id` (coaches: `golf_coaches.team_id`, players: `golf_players.team_id`), or derive the IDs from `auth.uid()` entirely.

#### C2. Admin dashboard data readable by non-admins
**Source:** 1B
**Files:** `supabase/migrations/20260421000001_admin_dashboard_rollup.sql`
**Issue:** `get_admin_dashboard_rollup()` is `SECURITY DEFINER` + granted to `authenticated` with no admin-role check. Previously the `admin/layout.tsx` route gate protected this data; the RPC bypasses the layout entirely. Any authenticated user can query it.
**Fix:** add `IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;` at top of function body. Change `LANGUAGE sql` to `LANGUAGE plpgsql` to allow the check.

#### C3. `unstable_cache` wraps `cookies()`/`auth.getUser()` — explicitly unsupported in Next.js 16
**Source:** 1A + 1B
**Files:** `src/app/golf/actions/admin-data.ts:55-74`
**Issue:** Inside the `unstable_cache` body, `createClient()` calls `cookies()`, which throws inside cached scopes in Next.js 16 (the parallel Team D removed this exact pattern in `dashboard-data.ts:928-930` and documented why). Additionally:
- `revalidateTag(tag, 'default')` at line 84 passes a second arg that belongs to Cache Components, not legacy `unstable_cache`
- `invalidateAdminDashboardRollup()` is exported but has **zero call sites** — admin mutations still use `revalidatePath`, cache tag is never invalidated
**Fix:** auth check outside the cache; cache only the pure RPC data using `createAdminClient()` (service-role, no cookies). Drop the profile arg on `revalidateTag` OR switch to `revalidatePath`. Wire invalidation to admin write paths OR accept 60s staleness and remove the invalidation API.

### HIGH

#### H1. LazyMotion orphans in admin tree
**Source:** 1B
**Files:** `AdminStatCard.tsx`, `TracerHealthOverview.tsx`, `ui/animated-number.tsx` use `<m.*>` but there's no `<LazyMotion>` ancestor in the admin layout
**Impact:** animations silently no-op (static DOM); visual regression from the pre-sweep state
**Fix:** add `<LazyMotion features={domAnimation}>` at `admin/layout.tsx` wrapping children

#### H2. 4 new RPCs not in `database.ts` — `as any` casts at every call site
**Source:** 1B
**Files:** `admin-data.ts`, `dashboard-data.ts`, `player-notifications.ts`
**Impact:** no compile-time validation of RPC arg shapes or return types; silent drift risk
**Fix:** run `npm run db:types` after applying migrations locally; commit the regenerated `database.ts`. Note: `database.ts` was deleted then re-added during parallel work (per Team A notes), so review that round-trip first

#### H3. Error swallowing — admin & CRM
**Source:** 1A
**Locations:**
- `admin/page.tsx` — `.catch(() => null)` on the rollup call silently hides failures
- `crm/page.tsx:540-558` — `error` state declared but never `setError(...)`'d; the error UI is dead code
- `crm/page.tsx fetchAllCoaches` — destructures only `{ data }`, ignores `error`
**Fix:** set error state on failure; render the error UI when it's set; log failures

### MEDIUM

#### M1. PlayerHub memoization is ~mostly~ theater
**Source:** 1A
**Files:** `src/components/golf/player-hub/PlayerHub.tsx`
**Issue:** `React.memo` added to TripCard / PlayerTaskCard / EventRSVPCard, but parent passes inline arrow callbacks (`onExpand={() => setSelectedTrip(trip)}`). Every parent render creates fresh callback identities → memo comparators fail → cards re-render anyway. The memoization buys ONLY the per-mount `now` effect removal, not the inline-callback re-render prevention.
**Fix:** `useCallback` per-id wrappers, or use stable refs keyed by trip/task/event id

#### M2. Tab unmounting loses scroll + form state
**Source:** 1A
**Files:** `PlayerHub.tsx`
**Issue:** `{activeTab === X && <TabBody />}` destroys offscreen tabs. Any in-flight `setSubmitting` state (RSVP in progress) or scroll position is lost on tab switch.
**Fix:** use `display: activeTab === x ? 'block' : 'none'` to preserve state, OR accept the tradeoff and document

#### M3. Hand-rolled visibility-interval patterns in 5+ other files
**Source:** 1A
**Files:** `useAdminRealtime.ts`, `use-presence.ts`, `useNotifications.ts`, `notification-badge-context.tsx`, and both round-start pollers
**Issue:** `useVisibilityAwareInterval` is clean, but only applied to the 3 targets in the plan; the rest still hand-roll the same pattern
**Fix:** wave-3 cleanup

### Notable architecture concerns (surfaced in 1B)

- No cross-zone file writes detected across 38 parallel commits — the ownership-boundary strategy worked
- Single-pass CTE design in the admin rollup is the highest-quality artifact in the diff
- `useVisibilityAwareInterval` is a clean, tested shared utility with correct effect lifecycle

### Positive notes

- CRM stats reducer, single-pass filter, `roundsByPlayer` Map fanout, and `useSyncExternalStore`-based `use-media-query.ts` are all correct textbook improvements
- `AdminRealtimeProvider` context memoization correctly addresses the audit's P0-2
- `hero-golf.jpg` resize + `quality={72}` is a real LCP win
- SQL migrations are well-commented and use composable CTEs

## Critical issues for Phase 2 context

Phase 2 (Security + Performance) should know:
- C1 and C2 are SECURITY issues — the security-auditor agent will likely re-surface them with CVSS scoring
- C3 is a PERFORMANCE + correctness issue — the cache is broken; first-load path is hitting the RPC every time + throwing or silently mis-caching
- H1 (LazyMotion orphans) is a silent perf regression — animations that used to work now no-op

## Migration deployment caveat (from 1A)

`20260421000001_admin_dashboard_rollup.sql` references `baseball_teams` (line 8 CTE) — if that table doesn't exist in a given environment, the migration fails. Gate with `to_regclass('public.baseball_teams') IS NOT NULL` or remove the reference.
