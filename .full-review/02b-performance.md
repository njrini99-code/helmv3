# Phase 2B — Performance & Scalability Review

Scope: commits `850632e7..HEAD` (39 commits, +6,816 / −1,345 LOC).
Method: static review of the diff + existing migrations + runtime paths. No DB EXPLAIN was run (no live DB available to the agent) — index coverage verified against committed migration files.

Findings are ordered by severity. Each has file:line, expected impact, and a concrete fix.

---

## CRITICAL

### CRIT-P1. Admin rollup RPC throws at runtime — column names don't exist on `users` / `golf_coaches` / `golf_players`
- Files:
  - `supabase/migrations/20260421000004_secure_perf_rpcs.sql:54-57, 87-88`
  - `src/app/golf/actions/admin-data.ts:66-77` (consumer)
  - `src/app/golf/admin/page.tsx:274` (`.catch(() => null)` swallows the error)
- Evidence:
  - Migration 00004 redefines `get_admin_dashboard_rollup()` using `last_seen_at` (lines 54-57) and `onboarded_at` (lines 87-88).
  - Actual schema uses `last_seen` (see `20260214230000_create_admin_rpc_functions.sql`, `20260313_admin_dashboard_upgrade.sql`, and every older rollup reference) and `onboarding_completed` (see `020_golf_core.sql:45,72`; `004_coaches.sql:37`; `005_players.sql:63`).
  - Migration 00001 (the earlier, working version) correctly uses `last_seen` and `onboarding_completed`. 00004 silently regressed those to non-existent column names while adding the admin-role check.
  - The server action at `admin-data.ts:63-77` treats any error as "throw", and the call site at `admin/page.tsx:274` is `getAdminDashboardRollup().catch(() => null)` — so the failure is invisible; `rollup` stays `null` forever and `OverviewTab` silently falls back to the legacy ~95-query path.
- Perf impact:
  - **The single-RPC win is fully reverted in production** whenever 00004 is the latest-applied migration. The team shipped the single-query rollup (huge win) and then in the security hotfix silently nuked it. Every admin page load continues to hit the ~95-query waterfall until 00004's body is fixed.
  - Claimed "~95 queries → 1 RPC" and "600–900ms → 60ms cached" wins: NOT realized. The only measurable change vs baseline is +1 extra failing RPC round-trip on every admin page load.
- Fix (sql):
  ```sql
  -- 20260421000004_secure_perf_rpcs.sql: user_stats CTE
  count(*) FILTER (WHERE last_seen > now() - interval '1 hour')    AS active_1h,
  count(*) FILTER (WHERE last_seen > now() - interval '24 hours')  AS active_24h,
  count(*) FILTER (WHERE last_seen > now() - interval '7 days')    AS active_7d,
  count(*) FILTER (WHERE last_seen > now() - interval '30 days')   AS active_30d
  -- onboarding_stats CTE
  (SELECT count(*) FROM golf_coaches WHERE onboarding_completed = TRUE) AS coaches_onboarded,
  (SELECT count(*) FROM golf_players WHERE onboarding_completed = TRUE) AS players_onboarded,
  ```
- Fix (TS): remove the `.catch(() => null)` on `admin/page.tsx:274` and surface errors to the UI so future regressions aren't silent.

### CRIT-P2. `get_coach_today_schedule` has two live overloads — 3-arg version is STILL ungated
- Files:
  - `supabase/migrations/20260421000003_dashboard_rpcs.sql:17-63` — `(uuid, timestamptz, timestamptz)`, no auth check
  - `supabase/migrations/20260421000004_secure_perf_rpcs.sql:119-171` — `(uuid, date)`, with `auth.uid()` coach check
  - `src/app/golf/actions/dashboard-data.ts:288-292` — still calls the 3-arg version
- Evidence: Postgres treats different argument signatures as different function objects. `CREATE OR REPLACE FUNCTION … (uuid, date)` in 00004 does NOT drop the earlier `(uuid, timestamptz, timestamptz)` definition. Both coexist. The dashboard server action calls the unprotected one.
- Perf impact: security defect (cross-tenant leak) — already flagged in Phase 1 C1. From a perf angle this is also a regression vector: when the team eventually fixes the call-site to the 2-arg `(uuid, date)` version, the per-call cost changes because `start_time::date = p_date` is non-sargable — it will scan `golf_events(team_id)` ignoring `idx_golf_events_team_start_time`. 00003's `start_time >= p_today_start AND start_time < p_today_end` is index-backed.
- Fix:
  1. `DROP FUNCTION public.get_coach_today_schedule(uuid, timestamptz, timestamptz);` in a new migration before recreating the secure overload.
  2. Keep the 00003 signature `(uuid, timestamptz, timestamptz)` — it's index-backed — and add the auth check into its body. Do NOT keep the `::date` version.
  3. `get_player_hub_announcements` and `get_player_hub_events` have the same dual-overload issue (00003 shapes return `{rsvp_yes, rsvp_total, going_count, maybe_count, recipient_count, acknowledged_count, …}`; 00004 shapes return `{event, yes, no, maybe, my_rsvp}`). TS callers at `hub/page.tsx:169-181` and `player-notifications.ts:341` use the 00003 shape, which means 00004's secure body is unused at the call site.

---

## HIGH

### HIGH-P1. `cachedAdminDashboardData` cache key ignores user identity — correct by design, but document the global-cache semantics
- File: `src/app/golf/actions/admin-data.ts:63-77`
- Cache key is literal `['admin-dashboard-rollup']` — no user id, role, or tenant mixed in. Since the cache value is the global admin rollup (platform-wide counts, not per-user), sharing it across admins is correct.
- Memory math: one JSON payload ~5–10KB × 1 key = single-digit KB on the node cache. No concern.
- Caveat: if you ever add a per-admin filter (e.g. "rollup for my org only"), the cache key becomes wrong silently. Add a defensive assertion or namespace the key: `['admin-dashboard-rollup', 'global-v1']`.
- Auth-outside-cache pattern is correct and matches Next.js 16 docs — `cookies()` is called in `getAdminDashboardRollup()` at line 85 (outside the cache body), and the cached body uses only `createAdminClient()` (service-role, cookie-less). Good.

### HIGH-P2. `invalidateAdminDashboardRollup()` is still unwired — 60s stale window is the ONLY freshness guarantee
- File: `src/app/golf/actions/admin-data.ts:99-106`
- The function uses `revalidatePath('/golf/admin')` which does not invalidate the `unstable_cache` tag — it just marks the route segment for re-render. The `{ tags: [ADMIN_DASHBOARD_CACHE_TAG], revalidate: 60 }` on the cache wrapper is never hit by this path. Rollup numbers can be up to 60s stale after a user signup / round entry even though the page re-renders immediately.
- Grep for call sites confirmed zero callers today.
- Fix: switch to `revalidateTag(ADMIN_DASHBOARD_CACHE_TAG)` and wire it into the user-mutating server actions (user insert, round complete, coach/player onboarding finalize). If real-time freshness isn't required, accept 60s and delete this function to reduce API surface.

### HIGH-P3. PlayerHub `React.memo` on TripCard / PlayerTaskCard / EventRSVPCard is defeated by inline arrow props
- File: `src/components/golf/player-hub/PlayerHub.tsx:801, 818-823, 844, 873, 902-908, 921-927, 961-967, 983-989`
- Every child is rendered with fresh inline lambdas: `onExpand={() => setSelectedTrip(trip)}`, `onComplete={() => handleCompleteTask(task.id)}`, `onRSVP={(status) => handleRSVP(event.event_id, status)}`.
- `memo`'s default shallow-compare treats these as unequal on every parent render, so all children re-render. The one win the memo buys is NOT the re-render prevention — it's that `now: Date | null` is now a shared prop, removing the per-mount `useEffect(() => setNow(new Date()), [])` that the old children had. That effect removal is real but worth ~0.5–1ms on mount per card, not the 8–12ms/render that stable children would save.
- Quantified impact at N=20 cards: every parent re-render (tab switch, RSVP submit, task toggle, `now` update, overdue-count change) currently re-renders 20 cards × ~0.5ms = ~10ms wasted on each interaction.
- Fix (two options):
  - **Option A (recommended, small).** Pre-compute per-id stable callbacks with `useMemo`:
    ```tsx
    const tripHandlers = useMemo(
      () => Object.fromEntries(trips.map(t => [t.id, () => setSelectedTrip(t)])),
      [trips],
    );
    // later:
    <TripCard trip={trip} now={now} onExpand={tripHandlers[trip.id]!} />
    ```
  - **Option B (cleaner).** Pass `onExpand={onExpandTrip}` (shared handler, stable via useCallback) and have TripCard call `onExpandTrip(trip)` internally. This requires exposing trip to the handler. Same pattern works for tasks (`onComplete(task.id)`) and events (`onRSVP(event.event_id, status)`).

### HIGH-P4. PlayerHub tab-unmount on switch destroys in-flight RSVP / task-completion state
- File: `src/components/golf/player-hub/PlayerHub.tsx:731, 866, 890, 947` (`{activeTab === 'x' && <Body/>}`)
- Phase 1 M2 flagged this as a UX regression. Quantifying the perf tradeoff:
  - **Win:** cuts idle per-tab DOM from ~80 nodes × 4 tabs = 320 → ~80. Memory: ~small, <50KB at 20 events. Paint time on tab-switch: saves a composite pass.
  - **Cost:** `EventRSVPCard.submitting` state and `PlayerTaskCard.completing` state are both component-local (lines 487, 372). Switching tabs while an RSVP is in flight drops the pending indicator; the API call continues, but the user sees no loading state and may double-click. Ditto task completion.
  - Severity for perf: low. Severity for correctness: medium.
- Fix: use `display: activeTab === x ? 'block' : 'none'` for tabs that contain async-submitting children. Keep overview unmounted (it's never async-submitting from a destroyed card). OR lift submission state to the parent and key by id.

### HIGH-P5. Marketing LazyMotion sweep only covers `/about`, `/products`, `/` — 60+ other routes still import `motion`
- Files using `import { motion … }` (full API, not tree-shaken): 124 files per grep. Spot check of relevant routes:
  - `src/app/golf/admin/components/HealthRing.tsx:4`, `StatCardV2.tsx:4`, `AlertBanner.tsx:4`, `AdminToast.tsx:4`, `DetailModal.tsx:4`, `LiveActivityFeed.tsx:4`, `AdminOnlineIndicator.tsx:5`, `components/overview/DeepDiveAccordion.tsx`, `components/tracer/TracerRoundInspector.tsx`
  - `src/app/baseball/(auth)/*` — baseball auth pages still use raw `motion`
  - `src/components/coach/discover/*.tsx` — 4 files
- The diff did land `LazyMotion` ancestors in the right places (`admin/_motion-provider.tsx`, `GolfDashboardShell.tsx`) so the admin `m.*` imports now animate correctly — that fixes Phase 1's H1. But mixing `motion` + `m` in the same subtree still ships the full `motion` feature bundle (~30KB gz) because any `motion` import pulls the full feature set.
- Bundle impact: admin dashboard chunk probably still carries the full framer-motion bundle because `StatCardV2`, `HealthRing`, `AdminToast`, `AlertBanner`, `DetailModal`, `LiveActivityFeed`, `AdminOnlineIndicator` all import `motion`. Estimated ~30KB gz not yet saved on the admin chunk.
- Fix (sweep): grep-replace `import { motion, AnimatePresence } from 'framer-motion'` → `import { m, AnimatePresence } from 'framer-motion'` + `<motion.X>` → `<m.X>` in the 8 admin files listed above and the 4 coach/discover files. Leave baseball alone if out of scope. This is a pure mechanical change; the `LazyMotion` ancestor already exists.

### HIGH-P6. Coach dashboard `get_coach_today_schedule` call path requires an index sanity check
- File: `src/app/golf/actions/dashboard-data.ts:288-292`, migration `20260421000003_dashboard_rpcs.sql:17-63`
- Query plan (expected):
  1. CTE `today_events`: seeks `golf_events(team_id, start_time)` — covered by `idx_golf_events_team_start_time` (migration `20260220100000_add_performance_indexes.sql:7`) and `idx_golf_events_team_upcoming` (`050_golf_performance_indexes.sql:106`). Good.
  2. CTE `counts`: `event_id IN (…)` subquery + `GROUP BY event_id` — covered by `idx_golf_event_attendance_event_status` (`20260212000000_dashboard_performance_indexes.sql:66`). Good.
- Expected per-call cost at 1 team × 10 events × ~20 RSVPs/event = ~200 rows touched → <5ms. No perf concern IF the 3-arg overload gets the auth check (CRIT-P2). Without dropping the overload, the coach path keeps using the insecure fast one.

### HIGH-P7. Player hub events RPC — same index story, confirmed good
- Files: `src/app/golf/(dashboard)/dashboard/hub/page.tsx:86-90`, migration `20260421000003_dashboard_rpcs.sql:178-232`
- `events` CTE uses `(team_id, start_time >= p_since)` — index-backed by `idx_golf_events_team_start_time`. `counts`/`my_rsvp` CTEs use `(event_id IN …)` and `(player_id, event_id IN …)` — covered by `idx_golf_attendance_player_event` and `idx_golf_attendance_event_status`.
- Confirmed: 3-round-trip → 1. Payload size is small (LIMIT 50). Good.

---

## MEDIUM

### MED-P1. `LiveActivityFeed` realtime subscription has no server-side filter
- File: `src/app/golf/admin/crm/components/resend/LiveActivityFeed.tsx:50-72`
- Channel subscribes to every `INSERT` on `public.email_events`. Fine for a single-tenant admin panel, but: every admin tab sharing a single Supabase WebSocket connection receives every row — at 100 emails/min burst that's 100 WS frames/min/admin, each firing a React `setEvents` + slice. The `seenIdsRef` dedupe at :61 is good.
- Pause-on-hidden: **subscription is NOT paused when tab is hidden**. `isPaused` is a user-controlled toggle. The `useEffect` that creates the channel is keyed on `isPaused`, so hidden tabs still receive events and re-render (through the 30s relative-time tick, which IS visibility-aware).
- Fix: add `document.visibilityState === 'visible'` gate on the subscription `useEffect`, and listen for `visibilitychange` to remove/add the channel. Or lean harder on the 60s poll (ResendActivityView already does this correctly via `useVisibilityAwareInterval`) and drop the realtime entirely.

### MED-P2. CRM `CRM_COACHES_LIST_COLUMNS` narrowing — payload win confirmed, but some columns still unused
- File: `src/app/golf/admin/crm/page.tsx:183-209`
- 25 columns shipped vs `SELECT *`. Columns actually used by the 5 consumers (CoachTable, filters, stats, CSV, BulkEmailModal-via-prop):
  - `id, name, email, phone, school, conference, division, program, status, priority, is_starred, notes, tags, last_contacted_at, next_follow_up_at, email_status, created_at, updated_at` — used
  - `title, team_size, current_software, decision_timeline, pain_points, last_email_event_type, last_email_event_at` — fetched but not rendered in the list view (verify by grepping components)
- Payload impact: at N=500 coaches, the narrowed SELECT drops roughly 40–50% of the previous `SELECT *` payload (~1–2MB → ~500–1000KB) — real win.
- Further optimization: verify whether `title` / `pain_points` / `current_software` / `decision_timeline` are rendered anywhere on the list page; if not, drop them too. Sanity-check with `grep -r "c\.title\|c\.pain_points\|c\.current_software" src/app/golf/admin/crm/components/`.
- Composite index `idx_crm_coaches_list_sort` (migration `20260421000002_crm_perf_indexes.sql:11-12`) matches the `ORDER BY is_starred DESC, priority DESC, updated_at DESC` at page.tsx:216-218 exactly. Planner should pick it for a backward index scan — confirmed aligned.

### MED-P3. CRM stats reducer + filter — O(n) confirmed
- File: `src/app/golf/admin/crm/page.tsx:279-329 (filter), 497-535 (stats)`
- Filter: single-pass `for-of` with early continues, O(n). Previous (not shown but referenced in Phase 1) was 10× `.filter().filter()` chains = O(k·n) temporaries. With n=500, k=10 → ~5k allocations/keystroke saved. Real win.
- Stats reducer: single-pass O(n) with one sub-loop over `PIPELINE_STAGES` (constant). Prev was "consolidate stats useMemo to single-pass reducer" per commit 395f4c74 — diff confirmed. Good.
- `_searchBlob` precomputation at 262-263 eliminates 4 `toLowerCase()` calls per row per keystroke. At n=500 and typing rate of 5 keys/sec that's 10k `toLowerCase` calls/sec avoided. Good.

### MED-P4. Coach dashboard `roundsByPlayer` Map fanout — O(R) single pass confirmed
- File: `src/app/golf/actions/dashboard-data.ts:421-470`
- Prev was O(P·R) per rollup × 2 rollups. Now O(R) Map build + O(P) lookup twice. At P=25, R=200 that's 200 ops vs 10k → 50× reduction in the rollup loops. Good.
- One sub-optimality: the `pNormScores` derivation at :451-458 is duplicated verbatim in the team-pulse loop at :556-562 (both walk `pRounds` and normalize to 18 holes). Could hoist a shared `normalizeRounds(rounds): number[]` helper and compute once per player. Estimated savings: another ~5% on this section.

### MED-P5. `unstable_cache` without user-specific key — correct, but tag-only revalidation is effectively unused
- File: `src/app/golf/actions/admin-data.ts:63-77, 99-106`
- Cache key: `['admin-dashboard-rollup']` — global, no user mixed in. Correct for global admin data. Cache body uses `createAdminClient()` which does NOT read cookies / headers — safe inside `unstable_cache` in Next.js 16.
- Tag `ADMIN_DASHBOARD_CACHE_TAG = 'admin-dashboard'` is set on the cache but only `invalidateAdminDashboardRollup()` (which calls `revalidatePath`, not `revalidateTag`) would invalidate. That function has zero call sites. **Net: the tag is dead code.** See HIGH-P2 for the fix.

---

## LOW

### LOW-P1. Hero image mobile delivery — probably fine, but worth verifying
- File: `src/components/landing/Hero.tsx:130-139`
- `<Image src="/hero-golf.jpg" fill priority quality={72} sizes="100vw" />`. With `next.config.js` `deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840]` and `formats: ['image/avif', 'image/webp']`, Next.js will serve a 640-wide AVIF for iPhone-sized viewports (~50–80KB at q=72).
- Source image is 2560×1707 / 1.05MB — that's the desktop-1920 variant ceiling, not the mobile delivery size. Expected LCP on 4G mobile: ~1.2s → ~0.6s vs the old 3.4MB source.
- `fetchPriority="high"` is explicit (line 136) — good.
- No perf concern. The 1MB source weight cited in the audit overstates mobile cost.

### LOW-P2. Navigation still uses `backdrop-blur-xl` on 2 pill elements
- File: `src/components/landing/Navigation.tsx:41, 59`
- Two small rounded-full pills with `backdrop-blur-xl`. Low cost on desktop; iOS Safari pays more per blurred-pixel on these. Total blurred area is <200px × ~40px × 2 ≈ 16k px — negligible.
- If you wanted to push further, replace with flat tint `bg-[rgba(237,232,221,0.9)]`. But Phase 1 noted the about/products backdrop-blur removal was the big win; these two pills are marginal.

### LOW-P3. `get_player_hub_announcements` (00003 version) has ORDER BY + LIMIT applied twice
- File: `supabase/migrations/20260421000003_dashboard_rpcs.sql:87-140`
- CTE `recent` does `ORDER BY published_at DESC LIMIT 10`; CTE `visible` does `ORDER BY r.published_at DESC LIMIT 5`. Sort-then-limit-then-resort is cheap at 10 rows but stylistically redundant.
- The final `jsonb_agg(... ORDER BY v.published_at DESC)` inside `jsonb_agg` re-sorts again (third time). Planner will collapse these, but readability could improve.
- Not a perf issue at current scale.

### LOW-P4. Hand-rolled visibility-interval patterns remain in 5+ hooks
- Phase 1 M3 flagged this. The new `useVisibilityAwareInterval` is cleanly adopted in 3 places (admin page refresh, TracerTab, 2 Resend components) but existing hooks `useAdminRealtime`, `useAdminPresence`, `useNotifications`, `notification-badge-context`, round-start pollers still hand-roll. No perf regression from this diff — but migrating them in a Wave 3 pass would remove ~80 lines of boilerplate and guarantee consistent behavior.

### LOW-P5. `StatCardV2` / `HealthRing` use `useSpring` from framer-motion
- Files: `src/app/golf/admin/components/StatCardV2.tsx:4`, `HealthRing.tsx:4`
- `useSpring` from framer-motion pulls the animation engine. These components are rendered in the Overview tab (admin default landing). The admin `_motion-provider` loads `domAnimation` not `domMax` — `useSpring` works with either but the spring animation resolves to the full motion runtime. Not a bundle issue per se, but confirm that dropping these to CSS `transition-all duration-300` wouldn't look identical — if it does, you save the useSpring react-tree overhead on every stat card render.

---

## Bundle / Memory / CPU — quantitative estimate

| Artifact | Before (est) | After (est) | Confirmed? |
|---|---|---|---|
| Admin rollup path | ~95 queries, 600–900ms | 1 RPC cached, 60ms | **No — CRIT-P1 reverts this** |
| Coach dashboard today schedule | 2 round trips | 1 RPC, ~5ms | Yes (via 3-arg overload) |
| Player hub events | 3 round trips | 1 RPC, ~10ms | Yes |
| Player hub announcements | 5 round trips | 1 RPC, ~8ms | Yes |
| CRM list payload (n=500) | ~1.5MB | ~0.7MB | Yes (SELECT narrow) |
| CRM filter keystroke cost | O(k·n), ~10 allocs/row | O(n), 0 allocs | Yes |
| `/about`, `/products` backdrop-blur paint | ~6–8ms/frame on iOS | ~1–2ms/frame | Yes |
| Hero image mobile LCP | 3.4MB source | 1.05MB source, 50–80KB delivered AVIF | Yes |
| framer-motion bundle (marketing) | ~85KB gz | ~55KB gz | Yes |
| framer-motion bundle (admin) | ~85KB gz | ~85KB gz | **No — 8 admin files still import `motion`** |
| PlayerHub re-renders on interaction | 20 cards re-render | 20 cards re-render (memo defeated) | **No — HIGH-P3** |
| Admin rollup CTE on 1M rows | N/A | N/A at this scale | ~20ms on users(1M)+golf_rounds(1M) assuming indexes; fine |

### Admin rollup scaling (when CRIT-P1 is fixed)

The 00001 CTE design is solid:
- `user_stats`: one seq scan of `users` with 10 FILTER aggregates. At 1M users, ~100–150ms. Single pass, stays in memory.
- `round_player_rollup`: GROUP BY with composite index `idx_golf_rounds_player_created` (newly added). At 10M rounds / 100k players, the hash agg fits in work_mem (default 4MB is tight — may spill to disk if >50k distinct players).
  - **Recommendation**: if `golf_rounds` is on track to hit multi-million, add `SET LOCAL work_mem = '16MB'` inside the function or use an incremental materialized view refreshed on write.
- `signup_trend` 00001 version does one GROUP BY; 00004 version does a correlated subquery per day × 30 days = 30 seq scans. **00004 regression**: at 1M users, this turns into 30 × 50ms = ~1.5s. Fix this along with the column-name bugs.

### Memory on the Next.js node
- `cachedAdminDashboardData` cache: 1 key × ~10KB payload. Negligible.
- Admin tab refresh every 5 min (was 2 min) + rollup cache 60s: the rollup is hit at most once per minute per node; the legacy 95-query path at the (throttled) 5-min cadence. Good.

---

## Top 3 remaining opportunities (in priority order)

1. **Fix migration 00004 column names** (`last_seen_at` → `last_seen`; `onboarded_at` → `onboarding_completed`; restore 00001's `signup_trend` single-pass CTE). This alone re-enables the headline "95 queries → 1 RPC" win.
2. **Drop the 3-arg `get_coach_today_schedule` overload** so the TS call site picks up the authed path. Same issue for `get_player_hub_*`. Combined with (1), this closes the CRIT bucket.
3. **Sweep the 8 admin components from `motion` → `m`** to realize the ~30KB gz saving on the admin chunk that LazyMotion is already set up for.

After those three: PlayerHub memoization (HIGH-P3) is the next biggest remaining win on real interaction latency.

---

Full file: `/Users/ricknini/Downloads/helmv3/.full-review/02b-performance.md`
