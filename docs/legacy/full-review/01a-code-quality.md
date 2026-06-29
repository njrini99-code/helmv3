# Phase 1A — Code Quality Findings

Review scope: 38 commits, `850632e7..HEAD`, performance remediation wave 1+2.
Focus: complexity, maintainability, duplication, clean-code, tech debt, error handling.

---

## Critical

### (none)

No critical code-quality bugs. The diff is net-positive and the remaining issues are all medium/low. The RPC wrappers have correct (if loose) error handling, cache invalidation is wired, and `memo` comparators are exhaustive.

---

## High

### H1. Dead cache wrapper + `revalidateTag` API drift — src/app/golf/actions/admin-data.ts:46–86

- **Issue:** `cachedAdminDashboardRollup` is defined with `unstable_cache` and awaits `createClient()` inside the cached function. `createClient()` calls `cookies()`, which Next.js 16 explicitly disallows inside `unstable_cache`. This is acknowledged in `dashboard-data.ts:927–930` ("`unstable_cache` was removed because it wraps functions that call `cookies()` via `createClient()`") — but the same team that wrote that comment left `unstable_cache` live in `admin-data.ts`. At runtime this will either (a) throw "cookies() can only be used inside a Server Component", or (b) silently strip auth and call the RPC unauthenticated (because `auth.getUser()` returns null under a cached cookie-less context), hitting the `throw new Error('Unauthorized')` on line 67. Commit `1a7cf87b`'s wiring in `admin/page.tsx:274` (`getAdminDashboardRollup().catch(() => null)`) swallows that error silently — so the rollup tile just never populates and nobody notices.
- **Secondary issue:** `revalidateTag(ADMIN_DASHBOARD_CACHE_TAG, 'default')` (line 86) — the second arg `'default'` looks like a cacheLife profile name, but `revalidateTag` takes only `(tag: string)` in Next.js 16 stable. The last commit (`94291a19`, "revalidateTag needs profile arg in Next.js 16") asserts this is required, but the function is only typed that way when Cache Components (`experimental.cacheComponents = true` or `'use cache'` directive) are enabled. This wrapper uses legacy `unstable_cache`, not `'use cache'`, so the second arg is at best a type error under the real signature and at worst a silent no-op.
- **Evidence:** `invalidateAdminDashboardRollup` is also *never called from any mutation path* — Grep for `invalidateAdminDashboardRollup` returns only its definition and self-reference. So the cache will serve stale rollup data for up to 60s after admin_events writes with zero invalidation.
- **Fix:**
  ```ts
  // Option A: drop unstable_cache + keep tag infra for Cache Components later
  export async function getAdminDashboardRollup(): Promise<AdminDashboardRollup> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');
    const { data, error } = await supabase.rpc('get_admin_dashboard_rollup');
    if (error) throw error;
    if (!data) throw new Error('Empty rollup response');
    return data as AdminDashboardRollup;
  }

  // And fix the invalidator to the real v16 signature:
  export async function invalidateAdminDashboardRollup() {
    revalidateTag(ADMIN_DASHBOARD_CACHE_TAG); // no 2nd arg
  }
  ```
  Or keep caching but pass the session via a parameter instead of reading cookies inside the cached function. Then wire `invalidateAdminDashboardRollup()` into every admin_events-affecting mutation (user role change, round submit notifications, etc.).

### H2. Error swallowed + stale-data feedback loop — src/app/golf/admin/page.tsx:272–279

- **Issue:** `getAdminDashboardRollup().catch(() => null)` silently converts any rollup failure (auth, RPC signature drift, network) to `null`. Combined with H1, the rollup tile can be perpetually empty with no user feedback and no telemetry. `data` (from legacy `getAdminDashboardData()`) still loads, so the page appears healthy but one data source is dark.
- **Fix:** Log the failure (at minimum `console.error`), or emit an admin-event so it shows up in the System tab:
  ```ts
  getAdminDashboardRollup().catch((err) => {
    console.error('[admin] rollup failed:', err);
    return null;
  }),
  ```

### H3. Dead/unreachable `error` UI branch — src/app/golf/admin/crm/page.tsx:540–558, 79

- **Issue:** `const [error, setError] = useState<string | null>(null)` is declared, but `setError(...)` is called only in the retry-button handler (line 550: `setError(null)`) and never assigned a non-null value anywhere in the file. `fetchAllCoaches` (line 267–271) catches and `console.error`s only. This means:
  1. The "Error Loading CRM" UI (lines 540–558) is unreachable.
  2. Real fetch failures (RLS denial, network) leave the user with an empty table, no retry affordance, and `loading=false`.
- **Fix:**
  ```ts
  } catch (err) {
    console.error('Failed to fetch all coaches:', err);
    setError(err instanceof Error ? err.message : 'Failed to load coaches');
  }
  ```

### H4. Silent stale-read on Supabase errors — src/app/golf/admin/crm/page.tsx:211–274

- **Issue:** The Supabase call destructures only `{ data }`, never `error`. On 4xx/5xx (RLS, invalid column, network), `data` is `null`, the code produces an empty `allCoaches` array, and the UI renders the empty-state "No coaches found" as if the CRM were empty. This is especially risky because commit `b63612aa` narrowed the SELECT list — if any column name drifts (or is typo'd) the whole table appears deleted to the user.
- **Fix:**
  ```ts
  const { data, error } = await supabase.from('crm_coaches')...
  if (error) throw error;
  ```
  (Same issue exists in `updateCoach` line 352 — the error is thrown correctly there, good — but the select has no error check.)

---

## Medium

### M1. 5× duplicated `visibilitychange` listener pattern — src/hooks/*, src/contexts/notification-badge-context.tsx

- **Issue:** The team created `useVisibilityAwareInterval` (good) and adopted it in 6 call sites. But 5 *other* files in the codebase still hand-roll the exact same visibilitychange + setInterval pattern:
  - `src/hooks/useAdminRealtime.ts:343`
  - `src/hooks/use-presence.ts:41`
  - `src/hooks/useNotifications.ts:160`
  - `src/hooks/golf/use-round-status-sync.ts:143`
  - `src/contexts/notification-badge-context.tsx:131`
  - `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx:407`
  - `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx:312`

  These were in scope of Wave 1 per the audit but weren't migrated. The abstraction now exists; every one of these is dead code drift waiting to cause a heisenbug (pause-on-hide works in some places, not in others).
- **Fix:** File a follow-up task; replace each with `useVisibilityAwareInterval(fn, ms)` or a lean `useVisibilityAware` variant that gives `isVisible` boolean + callback. `useAdminPresence.ts` already demonstrates the pattern.

### M2. CRM `fetchAllCoaches` violates SRP and leaks `_searchBlob` type — src/app/golf/admin/crm/page.tsx:211–274

- **Issue:** `fetchAllCoaches` does four jobs: (1) fetch, (2) map DB rows → Coach shape by defaulting missing fields, (3) attach a private `_searchBlob` cache, (4) compute `uniqueConferences`. The map block on lines 223–263 manually assigns 30+ columns; any new `Coach` field silently defaults to null. The `_searchBlob` is smuggled via `Array<Coach & { _searchBlob: string }>` but then erased back to `Coach[]` in `setAllCoaches(coachData)` (line 264) — the downstream consumer has to `as Coach & { _searchBlob?: string }` to use it (line 300, 356, 392). Same field is recomputed in 3 places (fetch, updateCoach, bulkUpdateCoaches) with identical code.
- **Fix:** (a) Extract a `rowToCoach(c: Partial<Coach>): Coach & { _searchBlob: string }` helper. (b) Extract `computeSearchBlob(c: Coach): string`. (c) Either make `_searchBlob` a proper field on the local state type (`CoachWithBlob`) or move to a parallel `Map<string, string>` keyed by id, so `Coach` stays clean. Current approach will leak blob state to anything that receives the array (BulkEmailModal, PipelineView, ConferenceGroupView all now carry a field they can't see).

### M3. CRM page component at 916 lines, god-component tendency — src/app/golf/admin/crm/page.tsx

- **Issue:** `CRMPage` owns 20+ `useState` hooks, 6 `useCallback`s, 2 `useMemo`s, a 130-line stats reducer and filter block, a 100-line column-mapping block, 7 modal slots, sidebar + mobile-header markup, CSV export, keyboard shortcuts, and tab routing. The file is past the maintainability cliff.
- **Evidence:** line counts by concern:
  - Tab/URL sync: 84–170 (87 lines)
  - Fetch + mapping: 175–274 (99 lines)
  - Filter useMemo: 279–329 (50 lines)
  - CRUD handlers: 336–472 (136 lines)
  - Stats useMemo: 497–535 (38 lines)
  - JSX: 563–915 (352 lines)
- **Fix:** Extract (a) `useCRMCoaches()` custom hook owning `allCoaches`, `filters`, `filteredCoaches`, `stats`, `updateCoach`, `bulkUpdateCoaches`, `toggleStar`; (b) `<CRMSidebar />` + `<CRMMobileHeader />`; (c) `useCRMTabRouter()` for the history.replaceState + searchParams dance. Keeps `CRMPage` to a composition layer < 200 lines.

### M4. PlayerHub: inline arrow callbacks defeat the new `memo()` — src/components/golf/player-hub/PlayerHub.tsx:800–802, 818–823, 838–846, 902–908, 920–928, 960–968, 982–990

- **Issue:** Commit `6c07a123` wrapped `TripCard`, `PlayerTaskCard`, `EventRSVPCard` in `React.memo` and lifted `now` to the parent (good). But the parent then passes *inline arrow functions* as `onExpand`, `onComplete`, `onRSVP`:
  ```tsx
  <TripCard ... onExpand={() => setSelectedTrip(trip)} />        // :801
  <PlayerTaskCard ... onComplete={() => handleCompleteTask(task.id)} />  // :822
  <EventRSVPCard ... onRSVP={(status) => handleRSVP(event.event_id, status)} />  // :844
  ```
  A new function reference is created on every parent render, so `React.memo`'s default shallow compare fails on the prop and the card re-renders anyway. The `memo` is load-bearing only for the `now` tick propagation; for any parent state change (tab switch, selectedTrip, submitting), every card still re-renders.
- **Fix:** Stabilize at the card layer — either pass `onExpand(trip)` / `onComplete(taskId)` / `onRSVP(eventId, status)` signatures and let the memoized card store its own closure, OR use a `useEvent`-style ref pattern. Example:
  ```tsx
  // Pass id-aware callback down, wrap in useCallback at parent
  const handleExpandTrip = useCallback((t: TripData) => setSelectedTrip(t), []);
  <TripCard key={trip.id} trip={trip} now={now} onExpand={handleExpandTrip} />
  // Inside TripCard: onClick={() => onExpand(trip)}
  ```
  Same for `handleComplete`/`handleRSVP`. Also, `handleCompleteTask` (PlayerHub.tsx:683–685) and `handleRSVP` (687–689) are useCallbacks that just `await` the prop — the wrapper adds nothing; drop them or make them actually guard (e.g., prevent double-submit).

### M5. PlayerHub filter arrays aren't memoized — src/components/golf/player-hub/PlayerHub.tsx:669–674

- **Issue:**
  ```tsx
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const overdueTasks = tasks.filter(t => t.status === 'overdue');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const pendingEvents = events.filter(e => !e.rsvp_status || e.rsvp_status === 'pending');
  const upcomingTrips = now ? trips.filter(...) : trips;
  ```
  These all execute every render, producing fresh arrays, and are passed to child components. Combined with M4, this means the "stable callback → memoized card" chain is broken at both ends. After the `now` state lift, the parent now re-renders every time a task/event card calls `setSubmitting`.
- **Fix:** Wrap in `useMemo([tasks])`, `useMemo([tasks])`, `useMemo([events])`, `useMemo([trips, now])`. Same for the IIFEs at lines 953–972 and 974–994 inside the events tab JSX.

### M6. Unmounting offscreen tabs loses scroll/form state — src/components/golf/player-hub/PlayerHub.tsx:731, 866, 890, 947

- **Issue:** Commit `b1bd25c1` changed `<div className={active ? 'block' : 'hidden'}>` to `{activeTab === X && <div>...</div>}`. This is a behavior change, not a perf tweak: switching tabs now destroys the subtree and remounts on return. Consequences:
  - Scroll position resets to top on every tab switch.
  - Any in-flight `setCompleting(true)` / `setSubmitting('accepted')` state inside a card is lost if the user switches tabs mid-action.
  - `AnimatePresence` exit animations on the old tab don't fire because the parent conditional removes them synchronously.
- **Fix:** Either (a) keep CSS-hide for tabs that can hold user state but keep conditional-mount for the heavy Resend/BI tabs only (per Next.js code-splitting pattern), or (b) preserve scroll with a `sessionStorage`-backed scroll restoration hook + disable in-card async state during switch. The audit called out "PlayerHub tab unmounting — does unmounting offscreen tabs lose scroll position / form state?" in `00-scope.md:73` — the answer is yes, and it wasn't addressed.

### M7. `useRouter` removed but `searchParams` still drives a sync effect — src/app/golf/admin/crm/page.tsx:165–170

- **Issue:** The effect watching `searchParams` re-runs on every searchParams change, compares to `activeTabRef.current`, and conditionally setsActiveTabState. But `setActiveTab` calls `window.history.replaceState` directly, which does *not* update Next.js `useSearchParams()` hook output. So there's an asymmetry:
  - Clicking a tab: local state updates, URL updates via `replaceState`, `searchParams` hook stays stale, effect no-ops (good).
  - Browser back/forward: URL changes, `searchParams` hook updates, effect runs, local state updates (good).
  - But: on initial mount, both `useState(() => url)` init and the effect fire, potentially double-setting. Since they read the same URL it's harmless, but it's fragile and undocumented. The `activeTabRef` indirection is also only in service of `setActiveTab`'s stable identity in the keyboard-shortcut effect deps — simpler to `useRef` both or inline the URL read.
- **Fix:** Prefer a dedicated `useTabFromURL` hook that encapsulates the replaceState + popstate listener contract. As-is, an engineer reading this will not be able to reason about whether changing searchParams programmatically (e.g., from a parent) would work (it won't, because the tab never reads it after mount except in this escape hatch).

---

## Low

### L1. Intentional `exhaustive-deps` disables are ambient — crm/page.tsx, CoachTable lines

- **Issue:** 5 `// eslint-disable-next-line react-hooks/exhaustive-deps` comments in `crm/page.tsx` alone (lines 273, 409, 422). Each one has a rationale in comments, which is good — but the linter is now a soft suggestion rather than a safety net in this file. Mixing `useCallback([],...)` + disabled deps + closure-captured state is exactly the shape that produces stale-closure bugs later.
- **Fix:** Re-express each using either a ref (for truly-stable refs) or put the captured value in deps. `handleStatusChange` on line 420 captures `updateCoach` via closure but omits it; if `updateCoach` ever becomes non-stable, `handleStatusChange` silently goes stale.

### L2. Dead `coachByEmail` fetch — src/app/golf/admin/crm/components/InboundLeadsView.tsx:155–183

- **Issue:** `coachByEmail` state is populated but the final table markup (not shown in diff context but traced via the diff) doesn't obviously consume it — the `EmailStatusBadge` is imported but I only see it referenced once per lead. If it *is* used, fine; if not, the `.in('email', leadEmails)` query is firing for every render of visible leads with no UI payoff.
- **Fix:** Verify the badge actually mounts. Either remove if dead, or gate behind `leadEmails.length > 0 && someBadgeVisibleFlag`.

### L3. `@ts-ignore`-equivalent `(supabase as any).rpc(...)` in 3 places — admin-data.ts:61, dashboard-data.ts:288, player-notifications.ts:334

- **Issue:** The cast pattern `(supabase.rpc as unknown as (fn: 'X') => Promise<...>)('X')` in admin-data.ts is defensible with the "types lag behind" comment. But `(supabase as any).rpc('get_coach_today_schedule', ...)` in dashboard-data.ts and `(supabase as any).rpc('get_player_hub_announcements'...)` are straight `any`-casts. A drop to `any` here means TS can't tell you if the param shape drifts from the SQL signature.
- **Fix:** Add the 3 RPCs to `src/lib/types/database.ts` (the diff already touches that file). Then delete the casts. At minimum, put the casts behind a typed `callRpc<T>()` wrapper so new RPC call sites don't keep introducing `any`.

### L4. Trivial `refreshData` alias — src/app/golf/admin/crm/page.tsx:492

- **Issue:** `const refreshData = () => { fetchAllCoaches(); };` — one-line passthrough used 6 times. It's not memoized, so every render creates a new function, passed to modals via prop. Small, but noise.
- **Fix:** Just pass `fetchAllCoaches` directly; it's already a `useCallback`.

### L5. `handleCompleteTask`/`handleRSVP` are no-op wrappers — src/components/golf/player-hub/PlayerHub.tsx:683–689

- **Issue:** Both just `await` the prop. They add a useCallback indirection but no logic.
- **Fix:** Delete both; pass `onCompleteTask`/`onRSVP` directly. Or use them to add double-submit guards (`if (submitting) return`), which would actually justify them.

### L6. `handleStatusChange` comment is misleading — src/app/golf/admin/crm/page.tsx:420–423

- **Issue:** Comment says "stable handlers ... avoid creating new function refs on every CRMPage render (which would defeat the React.memo on CoachTableRow)." True, but the function then calls `updateCoach`, which is *not* a useCallback — it's a plain `async` on line 336 and thus a new reference each render. `handleStatusChange`'s useCallback `[]` deps capture a stale `updateCoach` from first render via closure. Works today (state updates via setState, not via captured allCoaches), but this is a landmine.
- **Fix:** Make `updateCoach` a proper `useCallback` with `[supabase, selectedCoach?.id]` (or refactor to use functional setState and a ref for `selectedCoach`).

### L7. `allCoaches.find` in O(n²) in `handleSendFollowup` — src/app/golf/admin/crm/page.tsx:434–444

- **Issue:** For each recipient, `allCoaches.find(...)` scans the entire array. If you follow-up to 500 recipients on a list of 2000 coaches, that's 1M comparisons. Not a hot path today but the existing `_searchBlob` infra would suggest a `Map<email, Coach>` is warranted.
- **Fix:** Build `new Map(allCoaches.flatMap(c => c.email ? [[c.email.toLowerCase(), c]] : []))` once, look up from there.

### L8. Migration resilience drift — supabase/migrations/20260421000001_admin_dashboard_rollup.sql:85–89

- **Issue:** The `COALESCE(... to_regclass('public.baseball_teams') IS NOT NULL ...)` pattern guards a missing table, but the subquery `SELECT COUNT(*) FROM baseball_teams` still gets parsed and will error at CREATE FUNCTION time in an env without the table (`relation "baseball_teams" does not exist`). The comment claims it's resilient; it isn't — Postgres evaluates the table reference at function-creation time when `LANGUAGE sql STABLE`. This will fail to deploy on any env where baseball_teams is absent.
- **Fix:** Either drop the baseball arm (and add it in a separate baseball migration), or use `LANGUAGE plpgsql` with `EXECUTE format(...)` for the guarded section.

### L9. `invalidateAdminDashboardRollup` is unused — src/app/golf/actions/admin-data.ts:83

- **Issue:** Exported but zero call sites. The realtime admin_events path still doesn't invalidate. Either dead export or forgotten wire-up. (Tied to H1.)

---

## Positive notes

Real wins the diff earns:

1. **`useVisibilityAwareInterval` (src/hooks/useVisibilityAwareInterval.ts)** — 49 lines, correctly uses a ref for the callback to avoid re-scheduling on identity changes; clean `start/stop` idempotency; honors an initial-hidden state. Textbook implementation. Adopted in 6 call sites so far.

2. **CRM stats reducer consolidation (crm/page.tsx:497–535)** — went from 6 separate `.filter().length` passes (6× O(n)) to a single for-loop with a pre-zeroed `byStatus` / `byStage` accumulator and `Date.parse()` instead of `new Date()` per row. Also replaced `.includes()` with `Set` lookup for `notInPipeline`. This is the kind of mechanical perf win that stays correct and readable.

3. **CRM `filteredCoaches` single-pass (crm/page.tsx:279–329)** — replaced 10 chained `.filter()` calls (10 array allocations per keystroke) with one pass, pre-hoisted flags, and a precomputed `_searchBlob`. Correctly handles the null-blob fallback for legacy data. Search-bar flicker from the old fetch-loop is fixed as a side-effect (acknowledged in comment).

4. **`get_coach_today_schedule` RPC + dashboard-data.ts:285–292** — collapsed the 2-round-trip RSVP waterfall into one CTE call. Cleanly typed; shape returns straight into `TodayEvent[]`; removed 30 lines of map/reduce that used to run in the server action.

5. **`roundsByPlayer` Map (dashboard-data.ts:420–426)** — single fanout of `allRounds` by `player_id`, reused by top-players *and* team-pulse rollups. Went from O(2·P·R) to O(R + P·k). Correct, documented, no regression.

6. **`use-media-query.ts` → `useSyncExternalStore`** — eliminates the "render false, effect, render true" double-mount that caused login-page layout shift. Server snapshot pinned to `false` preserves mobile-first SSR behavior. Small file, right tool for the job.

7. **`get_admin_dashboard_rollup()` SQL** — everything runs in single-pass CTEs, `COUNT(*) FILTER (WHERE ...)` instead of N subqueries, `round_player_rollup` is grouped once and reused, `SECURITY DEFINER` + `SET search_path = public` hardening is correct, `REVOKE FROM anon, public` grant is tight, supporting partial index `idx_golf_rounds_player_created` is appropriate. The SQL craft here is the highest-quality artifact in the diff.

8. **`CoachTableRow` `React.memo` with custom comparator (CoachTable.tsx:323–347)** — comparator is exhaustive over all 15 props, no shortcuts. Correctly identifies that row re-render should be a function of `coach === coach` (reference equality on the data row, not deep-equal) + own selection/focus/dropdown state.

9. **Resend subtree code organization (crm/components/resend/)** — clean split: `ResendActivityView` is the orchestrator, `KPIGrid`/`LiveActivityFeed`/`EmailsTable`/`EmailDetailPanel`/`DomainBreakdown` each own one concern, `shared.tsx` for cross-cutting config. Feature-folder structure done right; no file over ~540 lines.

10. **`get_player_hub_announcements` + `get_player_hub_events` RPCs** — correctly mirror the TS visibility rules (`no recipients → visible to all team` vs. `recipients → must include player`). The JSONB aggregation with `to_jsonb() - 'field' || jsonb_build_object(...)` to remap field names is cleaner than doing it in TS. Saves 5 round-trips for announcements, 3 for events.

11. **`AdminRealtimeProvider` context value `useMemo` (commit 38c9d224)** — trivial but right: `useMemo(() => ({ realtime, presence, alerts, currentUserId }), [...])` keeps every consumer from re-rendering on parent state ticks.

12. **Deprecation comment on `getAdminDashboardData` (admin-data.ts:1432–1437)** — marks the 95-query path, names the replacement, and states the wave-3 removal target. This is exactly how to document a staged migration.

---

## Summary of action items (priority order)

1. **H1** — Remove `unstable_cache` wrapper or pass session explicitly; fix `revalidateTag` arity.
2. **H3/H4** — Wire real error state in CRM page; destructure `error` from Supabase calls.
3. **H2** — Stop swallowing rollup errors.
4. **M4/M5** — Restore the memoization win in PlayerHub by fixing inline arrows + filter arrays.
5. **M1** — Migrate the 5 remaining hand-rolled visibilitychange sites to `useVisibilityAwareInterval`.
6. **M3** — Extract `useCRMCoaches` hook + sidebar components from the 916-line page.
7. **L8** — Guard `baseball_teams` reference in migration properly or split.

No architectural objections — the refactor direction is correct, the primitives added (`useVisibilityAwareInterval`, the 3 RPCs, rollup cache-tag) are the right ones. Wave 3 (structural) remains necessary.
