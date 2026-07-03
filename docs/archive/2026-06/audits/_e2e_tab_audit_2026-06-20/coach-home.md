## Coach Dashboard home [coach]

**Route:** `/golf/dashboard` (coach branch)
**Entry file:** `src/app/golf/(dashboard)/dashboard/page.tsx`
**Rendered component on prod:** `FairwayCoachDashboard` (redesign flag is **ON** — `.env.local:45 NEXT_PUBLIC_REDESIGN=true`)
**Legacy component (flag OFF):** `CoachDashboard`

---

### End-to-end wiring (actual)

1. **Auth + role resolution.** `page.tsx:80` calls `getGolfSessionProfile()` (`src/lib/auth/session.ts:142`), which runs `supabase.auth.getUser()` and selects `golf_coaches` + `golf_players` by `user_id`. No session → `redirect('/golf/login')` (`page.tsx:82-84`). The layout (`src/app/golf/(dashboard)/layout.tsx:34-35,98-149`) independently re-resolves the same session, gates onboarding, and renders `FairwayDashboardShell` when the flag is on. The coach branch (`page.tsx:92`) only runs when `session.coach` is truthy; a player falls to `page.tsx:165`. **Role-gate is enforced at both layer and page; no cross-role leak.**

2. **Team resolution.** `page.tsx:97` → `resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id)` (`src/lib/golf/resolve-team-server.ts:35`) reads the `golf_active_team` cookie, validates coach access, and falls back to org/staffed-team resolution. No team → empty-state dashboard (`page.tsx:143-161`).

3. **Data fetch.** `page.tsx:106` → `getCachedCoachDashboardData(coach.id, userId, teamId, dateRange)` → `getCoachDashboardData()` (`src/app/golf/actions/dashboard-data.ts:225`). This server action:
   - Auth-checks first: `supabase.auth.getUser()` + `if (user.id !== userId) throw 'Unauthorized'` (`dashboard-data.ts:243-245`) **before any private reads**. ✅
   - Reads team timezone from `golf_team_settings` (`:236-241`).
   - Batch 1 (`:270-323`): `golf_teams`, `golf_team_members` (roster count + player list), `golf_events` (upcoming count + calendar list), `golf_qualifiers` (active count), `golf_tasks` (pending), `golf_announcements` (recent), and the **`get_coach_today_schedule` RPC** for today's events + RSVP counts.
   - Batch 2 (`:368-407`): `golf_rounds` paginated via `fetchAllRowsResult` (both `recentRounds` and `allRounds`) so the full windowed set is covered (no 1000-row truncation), plus a head-count "rounds this week". ✅
   - Derives team scoring avg (18-hole-only), top players, monthly trend, sparklines, GIR% (weighted), Putts/Rd (hole-weighted), team-pulse per-player trends, and action items.

4. **Render.** `page.tsx:121-140` reshapes the payload into `CoachDashboardData` and calls `renderCoachDashboard()` (`page.tsx:31`), which forks on `isRedesignEnabled()` → `FairwayCoachDashboard` (`src/components/fairway/pages/dashboard/FairwayCoachDashboard.tsx:145`).

5. **Fairway dashboard composition** (`FairwayCoachDashboard.tsx`):
   - Masthead `ViewHeader` (single h1) with promoted quick actions: **Add Player** → `/golf/dashboard/roster`, **Schedule** → `/golf/dashboard/calendar`, **Qualifier** → `/golf/dashboard/qualifiers` (`:324-347`). All routes exist. ✅
   - `Segmented` date-range control → `router.push('/golf/dashboard?range=...')` (`:160-167,355-360`); preserves the force-dynamic re-fetch contract. ✅
   - `JoinRequestAlert` (`:364`) — coach join-request banner.
   - CoachHelm signal hero `InsightCard` (`:367-390`) sourced from `deriveCoachSignal()` (`coach-signal.ts`); CTA → `/golf/dashboard/intelligence` + `/golf/dashboard/whats-new` (both routes exist). ✅
   - Team KPIs as `MetricCard`s with honest `InsufficientData` fallback (`:393-456`).
   - Recent Rounds `DataTable` (`:495-516`), Performance `TrendChart` (`:520-550`), `TeamPulsePanel` + Top Performers list → `/golf/dashboard/players/${id}` (matches `[playerId]` dynamic segment) (`:553-618`).
   - Loading (`loading.tsx` → `DashboardSkeleton`) and error (`error.tsx` → `RouteErrorBoundary`) states are real (not bare spinners). ✅

---

### Expected vs actual

The dashboard home is an aggregation surface, not a single documented feature. Compared against #16 Intelligence (CoachHelm overview), #5 Roster, #4 Calendar, #2 Stats:

- **Coach sees coach overview, not player home.** ✅ Confirmed — role branch is clean.
- **Overview cards / KPIs.** Present and honest (insufficient-data gate prevents fake zeros). ✅
- **Quick actions.** Present and wired to real routes. ✅
- **CoachHelm signal / "AI on home".** Present via the signal hero (deliberately never shows a hollow effectiveness %). ✅
- **Notification badges.** The only badge-like element is `JoinRequestAlert` — fetch-on-mount, no realtime/poll. Minor gap.
- **Divergence from legacy:** the redesign drops two whole regions that the legacy `CoachDashboard` rendered from the SAME payload — the **Today's schedule timeline** (`TodayTimeline`, payload `todayEvents`) and the **Action Items list** (`ActionItemsCard`, payload `actionItems`). In Fairway these only feed the one-line signal headline. It also drops the **per-KPI trend arrows + sparklines** that the payload computes (`sparklines.*.trend` / `.sparkline`).

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| MEDIUM | incomplete-feature | `src/components/fairway/pages/dashboard/FairwayCoachDashboard.tsx:393-456` | KPI `MetricCard`s are passed only `value`+`footnote`; the computed `enhancedData.sparklines.{scoringAvg,girPct,puttsPerRound}.trend` and `.sparkline` are never passed. `MetricCard` natively supports `delta` + `sparkline` (`MetricCard.tsx:83-88`). | Coach loses the at-a-glance "improving/declining" direction + recent-form sparkline that the legacy `StatCardSparkline` showed and that the server already computes every load. Wasted compute, weaker overview. | Pass a `delta` (derive from `trend`/`previousAverage`) and a `sparkline` node into each `MetricCard`, mirroring the legacy `StatCardSparkline` wiring. |
| MEDIUM | incomplete-feature | `src/components/fairway/pages/dashboard/FairwayCoachDashboard.tsx` (no render of `enhancedData.todayEvents` / `enhancedData.actionItems`) | The Fairway home never renders a Today's-schedule timeline or an Action-Items list. Legacy `CoachDashboard.tsx:362-371` (`TodayTimeline`) and `:458-461` (`ActionItemsCard`) render both. In Fairway, `todayEvents` + `actionItems` only collapse into the single signal headline (`coach-signal.ts:50-53`). | A coach landing on home no longer sees today's events or the list of pending tasks/announcements/deadlines that the server fetched — only a one-line summary count. Primary "what do I do today" surface is degraded. | Add a Today region (reuse `todayEvents`) and an Action Items region (reuse `actionItems`) to the Fairway layout; the data is already in `enhancedData`. |
| LOW | dead-control | `src/app/golf/actions/dashboard-data.ts:464-466,690` | `stats.previousAverage` is computed (split-half of normalized scores) and returned, but neither `FairwayCoachDashboard` nor legacy `CoachDashboard` consumes it for a delta/"vs prior" chip. | Wasted computation; the "vs last period" comparison the value was built for is never shown. | Either render a `delta` chip on the Scoring Avg `MetricCard` using `previousAverage`, or drop the computation. |
| LOW | revalidation | `src/components/golf/roster/JoinRequestAlert.tsx:34-43` | The pending-join-request banner (the only badge-like element on home) is a one-shot `getTeamJoinRequests()` fetch on mount with no polling/realtime subscription and no revalidation hook. | A coach who receives a new join request while sitting on the dashboard sees no badge update until a full page reload. | Add a periodic refetch or a Supabase realtime subscription on `golf_team_members` pending rows, or revalidate on focus. |
| INFO | rls | `supabase/migrations/20260527000000_prod_public_baseline.sql:2372-2425,20300` | `get_coach_today_schedule` is `SECURITY DEFINER` with `GRANT ALL ... TO anon`. | Looks like an over-broad anon grant, BUT the function body raises `Forbidden` unless `auth.uid()` matches a coach in the team's org (`:2377-2385`), so an anon caller (`auth.uid()=null`) always fails. Not exploitable as-is. | No action required; noted for the SECURITY DEFINER grant-audit backlog. Could `REVOKE ... FROM anon` for defense-in-depth. |

---

### Coverage / open questions

- Could not exercise the running app; trend-arrow / sparkline / today-region gaps are confirmed purely from code (the payload computes them; the Fairway component does not pass/render them). Needs a live click-through to confirm the visual delta vs the legacy dashboard.
- `JoinRequestAlert` realtime gap is code-confirmed but its user impact (how often a coach sits on home while requests arrive) is product-judgment.
- All tables/columns/routes referenced were verified against `memory/context/golfhelm-database.md`, `memory/glossary.md`, and the filesystem. No wrong-table, wrong-client, destructive-write, or pagination-cap issues found on this path.
