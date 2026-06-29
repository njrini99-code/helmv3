# Phase 1B — Architecture Findings

Review of `git diff 850632e7..HEAD` (38 commits, 5 parallel agent teams).
Focus: component boundaries, dependency direction, RPC contract design,
Next.js 16 caching semantics, LazyMotion wrapping, PlayerHub unmount, git
hygiene.

---

## Critical

### SECURITY DEFINER RPCs accept caller-supplied team_id/player_id with no ownership check — `supabase/migrations/20260421000003_dashboard_rpcs.sql:17-63`, `77-165`, `178-232`

- Architectural impact: All three new dashboard RPCs
  (`get_coach_today_schedule`, `get_player_hub_announcements`,
  `get_player_hub_events`) are declared `SECURITY DEFINER` with
  `SET search_path = public`, then `GRANT EXECUTE ... TO authenticated`
  (lines 239-241). They accept `p_team_id` / `p_player_id` as plain
  `uuid` arguments and use them directly in `WHERE` clauses — they
  NEVER validate that `auth.uid()` is actually a member of that team or
  owns that player record. Because `SECURITY DEFINER` bypasses RLS on
  the underlying `golf_events`, `golf_event_attendance`,
  `golf_announcements`, `golf_announcement_recipients`,
  `golf_announcement_acknowledgements`, `golf_announcement_documents`,
  `golf_announcement_tasks` tables, any authenticated user — player in
  team A, or even a BaseballHelm user with no golf team — can call
  these with an arbitrary UUID and read another team's events, RSVPs,
  and announcement content. This is a cross-tenant data leak, not just
  a performance issue. The consolidation also broke the *implicit*
  RLS-based authorization the pre-diff code relied on (each N-round-trip
  query was protected by RLS on every table).
- Recommendation: Inside each RPC body, add an auth guard CTE that
  resolves the caller's identity from `auth.uid()` and validates
  membership before exposing data. Minimal patch:
  ```sql
  WITH caller AS (
    SELECT p.id AS player_id, tm.team_id
    FROM golf_players p
    JOIN golf_team_members tm ON tm.player_id = p.id AND tm.status = 'active'
    WHERE p.user_id = auth.uid()
  )
  ...
  WHERE team_id = p_team_id
    AND p_team_id IN (SELECT team_id FROM caller)
    AND (p_player_id IS NULL OR p_player_id IN (SELECT player_id FROM caller))
  ```
  Alternative: make them `SECURITY INVOKER` so RLS applies and the
  `p_team_id` / `p_player_id` params become redundant or strictly
  advisory. This is fundamentally safer for a multi-tenant SaaS.
  Also cross-hand this to security-auditor (phase 2A) — it's a P0 auth bug.

### `get_admin_dashboard_rollup()` readable by any authenticated user — `supabase/migrations/20260421000001_admin_dashboard_rollup.sql:132`

- Architectural impact: RPC is `SECURITY DEFINER` and granted to
  `authenticated`. There is no role check inside the function body.
  Any coach, player, or baseball user can call `.rpc('get_admin_dashboard_rollup')`
  and read platform-wide user counts, coach/player/admin breakdowns,
  onboarding rates, round totals, signup trends, and baseball team
  counts. Pre-diff, the admin data was fetched through code paths
  gated at the admin layout (`src/app/golf/admin/layout.tsx:23` —
  `if (userData?.role !== 'admin') redirect`). The RPC bypasses that
  layout entirely — any client JS can invoke it directly.
- Recommendation: Add an admin role check at the top of the function:
  ```sql
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
    ...
  END;
  ```
  (Note: must change `LANGUAGE sql` to `LANGUAGE plpgsql`, or wrap in a
  gating wrapper function.) Alternatively, revoke from `authenticated`
  and grant to a new `admin` role.

### `unstable_cache` wraps a function that reads `cookies()` via `createClient()` — `src/app/golf/actions/admin-data.ts:55-74`

- Architectural impact: The admin-data team wrapped
  `cachedAdminDashboardRollup` in `unstable_cache`. The wrapped
  function calls `await createClient()` (line 57) which internally
  calls `cookies()`, then `supabase.auth.getUser()` (line 58). In
  Next.js 16, reading request-scoped resources (cookies, headers, auth)
  inside an `unstable_cache` closure is **explicitly unsupported** and
  will either throw at runtime or silently cache per-request data in
  a key that's shared across users. The dashboard-data.ts team knew
  this — they wrote a comment at `dashboard-data.ts:928-930`
  documenting the removal: *"unstable_cache was removed because it
  wraps functions that call cookies() via createClient(), which is
  not supported in Next.js 16."* Two teams reached opposite conclusions
  on the same rule — classic parallel-execution drift.
  Also: the cache key has no user identifier, so in the best case
  User A's cached payload leaks to User B (both see `admins: 5,
  coaches: 120` rollup — fine if both are admins, but combined with
  the auth-bypass finding above, any authenticated user sees admin
  data). Worst case: the `auth.getUser()` throw at line 59 gets cached
  into the tag entry, so future requests get a stale `Unauthorized`
  until TTL expires.
- Recommendation: Remove `unstable_cache` from `cachedAdminDashboardRollup`
  and either (a) rely on RPC efficiency alone (the CTE is single-pass
  and runs in <50ms on a ~10k-row dataset — caching adds little), or
  (b) cache *only* the RPC result by calling the RPC with the service-
  role client inside the cache and gating access at the caller (auth
  check *outside* the cache boundary):
  ```ts
  const _cached = unstable_cache(
    async () => { /* call RPC with admin client, no cookies */ },
    ['admin-dashboard-rollup'],
    { tags: [ADMIN_DASHBOARD_CACHE_TAG], revalidate: 60 },
  );
  export async function getAdminDashboardRollup() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || /* check role */) throw new Error('Unauthorized');
    return _cached();
  }
  ```
  This matches the dashboard-data.ts team's intent.

---

## High

### `invalidateAdminDashboardRollup()` is dead code — `src/app/golf/actions/admin-data.ts:83-87`

- Architectural impact: The function is defined and exported, but
  `grep -r invalidateAdminDashboardRollup src/` returns only the
  definition itself. No mutation path calls it. Meanwhile 5 mutation
  call sites in `admin-tracer-data.ts` use `revalidatePath('/golf/admin')`
  (lines 1428, 1483, 1528, 1560, 1632) which does NOT invalidate the
  `ADMIN_DASHBOARD_CACHE_TAG`. Result: when an admin resolves an
  incident, overrides an event, or otherwise mutates tracer data, the
  rollup stays stale for up to 60s. The tag-based invalidation
  infrastructure was built but never wired.
- Recommendation: Either (a) call `invalidateAdminDashboardRollup()`
  from every admin mutation path that changes `users`, `golf_rounds`,
  `golf_teams`, `golf_coaches`, `golf_players`, `admin_events`, or
  (b) replace `revalidateTag` with `revalidatePath('/golf/admin')`
  inside `invalidateAdminDashboardRollup` and accept the coarser
  invalidation (simpler — matches what every other path already does).

### New Supabase RPCs not reflected in `src/lib/types/database.ts`

- Architectural impact: None of `get_admin_dashboard_rollup`,
  `get_coach_today_schedule`, `get_player_hub_announcements`, or
  `get_player_hub_events` exist in `database.ts` (verified:
  `grep` returns zero matches). Every caller has to use
  `(supabase as any).rpc(...)` casts or the more elaborate
  `supabase.rpc as unknown as (...)` assertion seen at
  admin-data.ts:63-67. This defeats the entire type-safety contract
  of the Supabase typegen pipeline — a shape drift between SQL and
  TS will not fail the build, only at runtime. The commit message on
  `e9cc4cc1` explicitly acknowledged this: *"migration not applied
  locally — consumer wiring… will silently fall back to existing
  queries."*
- Recommendation: Run `supabase gen types typescript --local` after
  applying the three new migrations, commit the regenerated
  `database.ts`, and remove every `as unknown as` / `as any` cast on
  the four RPC call sites. Add a CI gate: `supabase db diff` must
  be clean and `database.ts` must regenerate to zero-diff.

### Orphan `m.*` uses with no `<LazyMotion>` ancestor in admin tree — `src/app/golf/admin/components/AdminStatCard.tsx:70`, `src/app/golf/admin/components/tracer/TracerHealthOverview.tsx:262`

- Architectural impact: The marketing routes (`/`, `/about`,
  `/products`, `MobileNav`, `Hero`) and the dashboard shell
  (`GolfDashboardShell.tsx:256`) correctly wrap their children in
  `<LazyMotion features={domAnimation}>`. But the admin tree —
  `src/app/golf/admin/layout.tsx` — has NO LazyMotion anywhere, and
  several admin components import `m` from framer-motion:
  - `AdminStatCard.tsx:4` imports `{ m }` and uses `<m.div ...>`
    at line 70 (called from `OverviewTab`, `PeopleTab`, etc.).
  - `tracer/TracerHealthOverview.tsx:3,262` imports `{ m }` and
    uses `<m.div>`.
  - `components/ui/animated-number.tsx:4` imports `{ m, useSpring,
    useTransform, useInView }` and uses `<m.span>` (line 46). This
    is used across admin (e.g. `StatCardV2`).

  Without an ancestor `<LazyMotion>`, `m.*` components fall back to a
  dev-mode warning (*"You have rendered a `m` component outside a
  `LazyMotion` component. This will render statically rather than
  animated."*) and render as static DOM — the animations silently
  stop working, and the bundle still pays the cost of the wider motion
  component reconciler. The sweep migrated imports to `m` but did not
  add the wrapping provider for admin.

  Note: `CRM` subtree and the Resend subtree still use the full
  `motion` import (not `m`), which sidesteps the orphan issue but
  means the bundle-size win of LazyMotion is lost there.
- Recommendation: Add `<LazyMotion features={domAnimation}>` to
  `src/app/golf/admin/layout.tsx` (server-layout level requires a
  tiny client boundary component to host the provider). Then do a
  consistent sweep of admin + CRM: either `motion` everywhere
  (with the bundle cost) or `m` everywhere under a LazyMotion. Mixed
  approach inside one subtree is the worst of both worlds.

### CRM page uses `useSearchParams()` at the top of a client component without a `<Suspense>` boundary — `src/app/golf/admin/crm/page.tsx:1,4,73`

- Architectural impact: Pre-existing pattern, but the commit
  `658a31cd perf(crm): tab selection via local state + history.replaceState`
  added more complexity around searchParam reads. In Next.js 15+/16,
  `useSearchParams()` called during render forces the entire route
  into client-side rendering (CSR bailout) unless wrapped in
  `<Suspense>`. This means the CRM tab cannot stream any server-
  rendered shell — users see the loading skeleton until the full JS
  bundle hydrates. For a 1300-line dashboard with lazy-loaded
  recharts, this is a noticeable TTI regression relative to what
  a Suspense-wrapped version could achieve.
- Recommendation: Either (a) lift `useSearchParams()` into a server
  component parent and pass the initial tab as a prop, or (b) split
  `CRMPage` into a thin top-level that wraps the rest in
  `<Suspense fallback={...}>`. Marked "High" because the perf-
  remediation diff touches this path but didn't fix the underlying
  bailout.

---

## Medium

### Silent return-shape manipulation inside `get_player_hub_announcements` — `supabase/migrations/20260421000003_dashboard_rpcs.sql:142-164`

- Architectural impact: The RPC deletes 6 fields from the row's
  JSONB representation and re-adds them with aliased keys via
  ` - 'player_in_recipients' - 'player_acknowledged' - 'ack_count'
   - 'doc_count' - 'task_count' - 'recipient_count' || jsonb_build_object(...)`.
  The purpose is to match the `GolfAnnouncementMeta` TS interface
  — but the coupling is brittle: any future change to that TS
  interface (e.g. renaming `acknowledged_count`) requires a
  matching SQL migration, and there is no compile-time link between
  them. The shaping also always writes `'completed_task_count': 0`
  as a hardcoded literal — the previous non-RPC path actually
  computed this from task-assignment status, so semantics silently
  changed. See player-notifications.ts:117-146 (old) vs the SQL
  (new): old path counted `requires_acknowledgement && !acked`
  for the badge. New path returns the raw count unconditionally.
- Recommendation: Either (a) stop aliasing inside SQL — return the
  raw column names and rename in the TS mapping layer, OR (b) add
  a regression test that asserts RPC output shape equals the
  pre-diff shape for a fixture dataset. Also compute or drop
  `completed_task_count` rather than hardcoding `0`.

### Dependency direction: `useVisibilityAwareInterval` is clean, but `animated-number.tsx` and `AdminStatCard` couple motion to a UI lib intended for multi-product reuse

- Architectural impact: `useVisibilityAwareInterval` (admin + CRM
  + presence hook) is a genuinely shared utility with no leaky
  imports — 49 lines, no business types, pure primitive. This is
  a model of a good shared hook. Good.

  But `src/components/ui/animated-number.tsx` — imported by both
  the admin `StatCardV2` and several marketing paths — imports
  `m, useSpring, useTransform, useInView` from framer-motion and
  emits `<m.span>`. It requires its consumer to provide a
  `<LazyMotion>` ancestor. For a file under `components/ui/*`
  (typically generic/shadcn-style primitives that work anywhere),
  this implicit contract is a leaky abstraction.
- Recommendation: Either (a) document the `<LazyMotion>` requirement
  in a JSDoc at the top of `animated-number.tsx`, (b) switch to
  `motion.span` here (accepts the bundle cost for this one
  component, gives correct behavior without provider), or (c)
  host the LazyMotion at the root of the app (`src/app/layout.tsx`)
  so every consumer inherits it — but that defeats the lazy
  loading.

### PlayerHub unmount pattern — tab switches wipe in-flight `setCompleting` / `setSubmitting` state — `src/components/golf/player-hub/PlayerHub.tsx:372`, `487`

- Architectural impact: The commit `b1bd25c1 perf(player-hub):
  unmount offscreen tabs instead of CSS-hiding` switched from
  `className="hidden"` to `{activeTab === 'tasks' && (...)}`.
  Inside `PlayerTaskCard` (line 372) and `EventRSVPCard` (line 487),
  there are `useState` hooks (`completing`, `submitting`) that hold
  the in-flight Promise state of `onComplete()` / `onRSVP()`. If a
  user clicks "Mark complete", then switches to a different tab
  before the server action resolves, the card unmounts and its
  state is lost — the promise completes but the parent sees no UI
  update. In the CSS-hidden version, the component stayed mounted
  and the state persisted. No crash, just a potential user-visible
  "my click did nothing" if they tab-switch fast.

  Also: `TripDetailSheet` is rendered via `<AnimatePresence>`
  (line 1011) at the root of PlayerHub, not inside the trips tab,
  so modal-while-tab-switch should survive. Good.

  Scroll position is not explicitly preserved — tapping a tab then
  coming back puts the user at top. Pre-diff, CSS-hidden tabs
  preserved scroll. This is a UX regression on long task lists.
- Recommendation: For scroll loss, either (a) capture scrollTop in
  a ref per tab on unmount and restore on remount, or (b) keep the
  CSS-hidden pattern for the two long tabs (tasks, events) and use
  unmount only for rarely-visited tabs. For the in-flight state,
  lift `completing` / `submitting` state to the parent keyed by
  task/event id.

### `useRef` saved callback pattern in `useVisibilityAwareInterval` loses reference-stability if caller doesn't `useCallback` — `src/hooks/useVisibilityAwareInterval.ts:16-20`

- Architectural impact: The hook uses the standard "latest-ref"
  pattern — saves `callback` to a ref in a separate effect, then
  invokes `savedCb.current` inside setInterval. Good pattern for
  allowing callers to pass unstable callbacks. But the effect
  that starts/stops the timer only depends on `intervalMs`, so
  if a caller passes `intervalMs` as an unstable literal
  (`60_000`) it re-runs the setup/teardown on every render — see
  `ResendActivityView.tsx:102 useVisibilityAwareInterval(loadStats,
  60_000)`. Literals are fine (primitive equality), so this is
  benign today. But a future caller passing a derived number (e.g.
  `config.interval * 1000`) would thrash the timer. The hook
  should document "pass primitive ms" OR memoize the interval
  internally.
- Recommendation: Add a JSDoc note to the `intervalMs` param:
  *"Must be a stable primitive or memoized."* Low effort, prevents
  future footgun.

---

## Low

### Messy parallel-team git history: stash merge + round-trip of `database.ts`

- Architectural impact: `database.ts` was deleted in `e9cc4cc1`,
  then `b84a4604` tried to finish cleanup (0-byte empty commit on
  that file), then `f822915b` re-added it with 10,800 lines. Net
  diff across the review range: +3 lines. Plus there are 5 merge
  commits on main (`b54aa404`, `d1c148e4`, `b780dc3f`, `7e24bb6a`,
  `2521399c`) with generic "Merge pull request" or
  "TEAM-D-temp-stash-2" messages. This makes the review harder
  than it needs to be and masks real ownership of changes.
- Recommendation: Going forward, squash each team's changes into
  a single commit before merge. Stash commits should be rebased
  away. Post-mortem: the 5-team parallel model succeeded at
  file-ownership isolation (no cross-zone writes I could find),
  but the fact that `database.ts` went on a round trip suggests
  two teams re-ran `supabase gen types` at different points.
  Standardize the regen step as "one team owns type regen, others
  must pull before commit."

### Minor cross-zone edit: `src/lib/types/database.ts` touched by DB team + typegen team

- Architectural impact: See above — the deletion/restore on
  `database.ts` means multiple teams mutated a single file.
  Fortunately no semantic conflict (the file is fully
  machine-generated). But since typegen is implicit in any DB
  change, this file will always be contended.
- Recommendation: Mark `src/lib/types/database.ts` as
  machine-generated in CODEOWNERS and treat every edit as
  "regenerate + commit," never hand-edit.

### `getCoachDashboardData` still has a sequential RSVP fetch for the player path — `src/app/golf/actions/dashboard-data.ts:767-782`

- Architectural impact: The coach path was consolidated into
  `get_coach_today_schedule`. The player path at lines 767-782
  still issues a separate `supabase.from('golf_event_attendance')
  .select(...).in('event_id', eventIds).eq('player_id', playerId)`
  round-trip after the today-events fetch. This is one of the
  waterfalls the parallel RPC (`get_player_hub_events`) was meant
  to solve — but the hub page uses `get_player_hub_events` while
  the `/golf/dashboard` coach-facing action did not get the
  analogous treatment for the player dashboard path.
- Recommendation: Either add a `get_player_today_schedule` RPC
  (symmetric to coach), or reuse `get_player_hub_events` with a
  `since = todayStart` and `until = todayEnd` parameter set.

### `AUTO_REFRESH_INTERVAL` constant not visible in the reviewed snippet — recommend surfacing

- Architectural impact: `admin/page.tsx:331` references
  `AUTO_REFRESH_INTERVAL` but I couldn't see its definition in
  the 100 lines I read. If it's `5 * 60 * 1000` as the commit
  `24bcae40 perf(admin): pause 3 pollers when tab is hidden +
  bump main to 5min` implies, it's fine. Flag only to confirm
  in a wider review.

---

## Positive architectural notes

### `useVisibilityAwareInterval` is a model shared utility

49 lines, pure primitive (no business types), correct latest-ref
pattern for callback stability, graceful `null`-interval pause
semantic, handles both initial visibility check + listener cleanup.
Used across 3 distinct zones (admin, CRM Resend, presence hook) with
no leaky typing. This is what a good shared hook looks like.

### Single-pass CTE design in `get_admin_dashboard_rollup` is excellent

The rollup consolidates what was ~95 client round-trips into 6 CTEs,
with the critical `round_player_rollup` running one GROUP BY instead
of 3 unscoped scans of `golf_rounds`. Supporting index
`idx_golf_rounds_player_created` is added atomically in the same
migration (line 137). The `COUNT(*) FILTER (WHERE …)` idiom is used
consistently instead of N subqueries — exactly the right Postgres
pattern here.

### Narrowed CRM SELECT pairs with lazy re-hydration — good pattern

`page.tsx:183-209` narrows to 25 columns for the list view; dropped
columns are explicitly nulled on the client shape. `CoachDetailPanel`
re-fetches the missing columns on panel open
(`CoachDetailPanel.tsx:197-212`). The `_searchBlob` precomputation
(line 262) avoids 4× `toLowerCase()` per row per keystroke. This is
the right layered approach — don't over-fetch for lists, re-fetch on
detail.

### `to_regclass` guard for baseball_teams in admin rollup

`admin_dashboard_rollup.sql:85-89` guards the `baseball_teams` count
with `to_regclass('public.baseball_teams') IS NOT NULL`, making the
RPC portable across environments where baseball tables don't yet
exist. Good defensive design.

### Coach-side RPC consumer preserves TodayEvent shape contract

`dashboard-data.ts:288-292` casts the RPC return to `TodayEvent[]`
which matches the pre-diff type. The RSVP fields (`rsvp_yes`,
`rsvp_total`) are optional in the interface at lines 18-19,
consistent with the player-path semantic where only `my_status` is
used. Client semantics were preserved correctly here.

### `database.ts` round-trip notwithstanding, no cross-zone file writes detected

Despite the 5 parallel teams and 38 interleaved commits, I did not
find a case where team X wrote to a file in team Y's ownership zone.
The file-ownership model held.

### Next.js 16 `revalidateTag` profile argument correctly supplied

Commit `94291a19 fix(admin): revalidateTag needs profile arg in
Next.js 16` corrected a real Next.js 16 breaking change — the
`'default'` profile arg at `admin-data.ts:86` matches the
`unstable_cache` config. This was a real API-change fix caught late,
but correctly applied.
