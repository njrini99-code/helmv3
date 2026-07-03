## Insights [coach]

Route: `/golf/dashboard/insights`
Primary table: `golf_coach_insights`
Audited: 2026-06-20

### End-to-end wiring (actual)

**Route + role gate** — `src/app/golf/(dashboard)/dashboard/insights/page.tsx`
- L49-50: `getGolfSessionProfile()`; redirects to `/golf/login` if no session. AUTH OK.
- L52-62: `if (!coach) return <FeatureUnavailable …/>` — a player who navigates here gets a friendly "coaches only" surface with a CTA to `/golf/dashboard/coachhelm`. ROLE GATE OK (the page enforces its own gate, not just nav-hiding).
- L65: `getInsightFilterOptions(coach.id)` for the player dropdown.
- L75-103: thin fork on `isRedesignEnabled()` (`NEXT_PUBLIC_REDESIGN`, default OFF — `src/lib/redesign/flag.ts:62-65`). Flag ON → `<FairwayCoachHelmSignals>` (separate redesign surface, out of scope here). Flag OFF (live default) → `<InsightsPageContent>`.

**Client content** — `InsightsPageContent.tsx`
- Read: `getInsightsForCoach(coachId, { limit:100, player_id, priorities, categories })` (L345-350). Server then ranks + dedupes + collapses par-scoring and slices to `limit`. Client does text/dateRange/status filtering + lifecycle/category chip filtering + sort + paginate in `useMemo` (L374-394).
- Stats: `getInsightsStats(coachId)` (L360-365) → 4 StatCards (L634-658) + hero subtitle (L612-622).
- Per-row actions via the unified `InsightCard` primitive → `handleCoachAction` (L524-560): `acknowledged` → `acknowledgeInsight`, `dismissed` → `dismissInsight`, `create_focus_area` → `createFocusAreaFromInsight` + redirect to `/golf/dashboard/development`. Optimistic removal from `allInsights` with rollback on failure.
- Bulk bar `InsightBulkActions` → `bulkDismissInsights` / `bulkAcknowledgeInsights` / `bulkResolveInsights` + Export.
- Generate button → `generateTeamInsights()` (engine sweep). Refresh button → re-fetch. AI Settings link → `/golf/dashboard/settings/coaching-intelligence` (real route).

**Server reads** — `src/app/golf/actions/insight-delivery.ts`
- `getInsightsForCoach` (L444-581): `auth.getUser()` first; if `player_id` supplied → `verifyPlayerAccess`; otherwise relies on `golf_coach_insights` RLS. Selects sport-prefixed table + drill join (`INSIGHT_SELECT` L175-186). Paginates the full visible set via `fetchAllRowsResult` (no 1000-row cap risk), applies `applyInsightVisibility` (v3-engine + visible lifecycle + not-dismissed), ranks/dedupes, slices to limit. PAGINATION + VISIBILITY OK.
- `getInsightsStats` (L695-750, insight-management.ts): `applyInsightVisibility` + `.eq('coach_id', coachId)`.
- `getInsightFilterOptions` (L611-679): resolves active team via `resolveCoachTeamIdWithCookie`, lists active players.

**Server mutations** — `src/app/golf/actions/insights.ts` + `insight-management.ts`
- `acknowledgeInsight` / `dismissInsight` / `resolveInsight`: `auth.getUser()` → `verifyInsightAccess` (team-scoped ownership) → UPDATE with `.eq('team_id', access.teamId)` → `revalidatePath('/golf/dashboard')`. AUTH + REVALIDATE OK. No destructive delete.
- Bulk actions: `auth.getUser()` → resolve coach → UPDATE `.eq('coach_id', coach.id).in('id', …)` → revalidate `/golf/dashboard`, `/insights`, (dismiss also `/alerts` `/intelligence`). OK.
- `exportInsights`: auth + coach-scoped; columns pinned to live schema; CSV escaping present.

**Schema** — `golf_coach_insights` columns used (`lifecycle_state`, `category`, `evidence`, `signature`, `outcome_status`, etc.) all confirmed present in `src/lib/types/database.ts` (the source-of-truth types). NOTE: `memory/context/golfhelm-database.md` is STALE — it omits `lifecycle_state`/`category`/`evidence`/`signature`/`engine_version`. Doc-only drift, not a code bug.

### Expected vs actual (feature-doc #15)

The feature doc describes Insights surfacing from `golf_coach_insights`, severity (priority) persistence, dismiss/acknowledge/resolve controls, and empty/loading states. The live page matches: evidence-backed rows surface through the v3 visibility contract; priority persists on the row and drives sort + StatCard trend; dismiss/ack/resolve are wired with auth + revalidate; loading skeleton (`InsightListView` L277-294), generic empty state (L296-307), and triage empty state (L916-947) all present.

Two documented "Known Gaps" are still open and visible on this tab:
- "Philosophy priority ranking unused" — the live read ranks via the shared `scoreInsight` composite with NEUTRAL weights on the team sweep (`getInsightsForCoach` L570-578 only loads coach weights when a `player_id` is supplied). So the coach's philosophy priorities do not reorder the team-wide feed. Matches the doc gap.
- "Outcome measurement missing" — `outcome_status` IS now projected and the `OutcomeBadge` lights up when set, but there's no coach control on this tab to SET an outcome; it depends on a nightly backfill. Partial.

No error STATE: there is no error UI. `fetchInsights` (L341-358) swallows failures in a `finally` with no catch — `getInsightsForCoach` returns `[]` on any server error, so a failed read renders the generic "No insights found" empty state, indistinguishable from a genuinely empty team. `fetchStats` silently no-ops on failure. This is a real gap vs the rubric's "error state present."

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| MEDIUM | wrong-data | insight-management.ts:704-710 vs insight-delivery.ts:508-531 | StatCards/hero count via `getInsightsStats` filter by `.eq('coach_id', coachId)`, but the list (`getInsightsForCoach`, no player_id) is scoped only by RLS, which (policy `coach_insights_select_via_player_team`, baseline.sql:18551) returns insights for ANY player on a staffed team regardless of which coach generated them. In a multi-coach program the StatCards undercount what the list shows; team-wide rows (`player_id IS NULL`) created by another coach appear in the list but not the stats. | Coach sees e.g. "12 Total Insights" while the feed lists 20 — numbers contradict the same screen. | Make stats use the SAME scope as the list: derive counts from the RLS-scoped read (or aggregate `getInsightsForCoach` results) instead of `.eq('coach_id', coachId)`. |
| MEDIUM | no-error-state | InsightsPageContent.tsx:341-358 | `fetchInsights` has no error branch; `getInsightsForCoach` returns `[]` on any failure (insight-delivery.ts:552-558). A failed/timed-out read renders the generic "No insights found" empty state. `fetchStats` (L360-365) also silently no-ops. | A backend error looks identical to an empty team; coach has no signal that data failed to load and no retry affordance beyond the manual refresh. | Surface a distinct error state (toast or inline banner) when the read throws/returns an error; have `getInsightsForCoach` return a discriminated result or set an error flag. |
| MEDIUM | dead-control | insight-card/InsightCard.tsx:744-775 + InsightsPageContent.tsx:539-552 | The coach per-row "Create focus area" button uses `PromoteToFocusAreaButton` (its own drawer → `createFocusAreaFromInsightV2`) for ALL active insights (`promotable` true unless resolved). The parent `onAction('create_focus_area')` path (→ `createFocusAreaFromInsight` + redirect to `/development`) only fires for resolved insights, where it renders a *second* "Create focus area" button. So the parent handler + its redirect-to-development behavior is effectively unreachable for normal (active) insights, and the two code paths use two different server actions. | Not user-visible breakage today (the promote drawer works), but the `handleCoachAction` create_focus_area branch is dead code for the common case and the post-create UX diverges (drawer + `router.refresh()` vs redirect to /development). Maintenance hazard / inconsistent flow. | Pick one promotion path. Either route the promote button through `onAction`, or delete the unreachable `create_focus_area` branch + its redirect in `handleCoachAction`. |
| LOW | wrong-data | InsightsPageContent.tsx:643-646 | "Active" StatCard `trend` value is `stats.byPriority.urgent + stats.byPriority.high` rendered with `direction:'up'`. This is a count of urgent+high insights, not a trend/delta, shown as an up-arrow trend chip. | Coach may read the green up-arrow as "active insights improving" when it is just a static urgent+high tally. Mildly misleading. | Label it explicitly (e.g. a separate "Needs attention" stat) or drop the `direction:'up'` trend semantics. |
| LOW | revalidation | insights.ts:1046,1181,1238,1294 | `generateTeamInsights`, `acknowledgeInsight`, `dismissInsight`, `resolveInsight` only `revalidatePath('/golf/dashboard')`, not `/golf/dashboard/insights`. (Bulk actions in insight-management.ts:294 DO revalidate `/insights`.) | The Insights page is a client component that re-fetches via its own handlers, so the UI updates anyway; but a hard nav to `/insights` after a single-row action can show stale server-rendered shell. Inconsistent with the bulk path. | Add `revalidatePath('/golf/dashboard/insights')` to the single-row + generate actions for parity. |
| INFO | placeholder-data | insight-management.ts:704-732 | `getInsightsStats` counts a "Dismissed" bucket, but `applyInsightVisibility` chains `.neq('status','dismissed')` and `.in('lifecycle_state', ['detected','matured','addressed','resolved'])`, so dismissed/archived rows are excluded from the query entirely. `stats.dismissed` is therefore structurally always 0. The page only renders Total/Active/Acknowledged/Resolved cards (not Dismissed), so it is not visible — but the field is misleading for any future consumer. | None on this tab (Dismissed card not shown). | Either drop the `dismissed` field from `InsightsStats` or compute it from an un-filtered query if a Dismissed count is wanted. |
| INFO | docs | memory/context/golfhelm-database.md (golf_coach_insights block) | The DB reference doc omits `lifecycle_state`, `category`, `evidence`, `signature`, `engine_version`, `addressed_at`, `archived_at` — all of which exist in `src/lib/types/database.ts` and are load-bearing for this tab. | Doc-only; could mislead future query authors into thinking the columns don't exist. | Regenerate `golfhelm-database.md` from the live schema. |

### Verdict

The Insights tab is largely correctly wired: role-gated, auth-checked, RLS + v3-visibility scoped, sport-prefixed tables, paginated reads (no 1000-row truncation), no destructive writes, optimistic UI with rollback, and all interactive controls (search, filter panel, triage chips, player select, sort, pagination, per-row ack/dismiss/promote, bulk ack/dismiss/resolve, export, generate, refresh, settings link) are wired to real handlers. The most material issue is the stats-vs-list scope divergence in multi-coach programs (MEDIUM, wrong-data) and the absent error state (MEDIUM). The create-focus-area dead path is a maintenance/consistency hazard. No CRITICAL/HIGH defects found.
