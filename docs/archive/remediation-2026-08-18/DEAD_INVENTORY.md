# Dead-code inventory — golf and shared

Generated from the classification run of 2026-08-19. **Nothing here has been
deleted.** Golf is documentation-only by standing owner directive; the
baseball equivalent is in `DEAD_BASEBALL_CODE.md`.

## The number that matters

**46 of 85** unreferenced files are **UNWIRED** — finished, functional,
and never connected. **30 are SUPERSEDED and 5 are ABANDONED** — together the
removable side of the ledger, smaller than the recoverable side. That is the
class you said existed ("some stuff was supposed to be wired and never was"),
and it is the largest bucket in the inventory.

| class | count | meaning |
|---|---:|---|
| **UNWIRED** | 46 | finished and working, never connected — **recoverable** |
| *of which transitive* | *2* | *imported only by another UNWIRED file; no separate fix* |
| **SUPERSEDED** | 30 | a newer implementation replaced it — removable, but check what the replacement dropped |
| **ABANDONED** | 5 | incomplete, stubbed or obsolete — genuinely removable |
| **ACTUALLY_REACHABLE** | 1 | the instrument was wrong; it is live |
| **UNCERTAIN** | 3 | instruments disagreed — do not act |

Two counts moved from the first-pass numbers after the skeptic passes caught
real errors: `team-sg-baseline.ts` moved UNWIRED → SUPERSEDED (the coach
control it would restore was deliberately deleted 2026-06-22, see the
Superseded table), and `ComparativeBenchmarks.tsx` /
`DataFreshnessAlerts.tsx` moved UNCERTAIN → UNWIRED (both skeptic passes
found their exact-match data source sitting unread in `admin-data.ts`; the
first-pass "no data source located" claim was wrong). Both are logged in
Corrections below.

### Correction — two more knip false positives, same trap (2026-08-19 06:40)

`weeklyHealthPing` and `onCoachHelmRoundSubmitted` (`src/lib/inngest/functions.ts`)
appear in knip's unused-exports list. **Both are live.**

    export const functions = [weeklyHealthPing, onCoachHelmRoundSubmitted];   :148

and `src/app/api/inngest/route.ts` serves that array via `serve({ client, functions })`.
Inngest discovers them by hitting the endpoint on PUT.

This is the **third** instance of one trap: a symbol consumed through an
AGGREGATE — a barrel re-export, or an array/object collecting it — rather than
by a direct named import. The first was `sendGolfMessageWithAttachments`
(re-exported via `actions/messages.ts`); the second and third are these.

**Generalisation, and the reason it belongs at the top of this document rather
than in a footnote:** before believing any "unused export" here, check whether
the symbol is gathered into an aggregate somewhere in its own file. Knip walks
the import graph correctly; it simply cannot know that a plain array is a
registry. Anything registry-shaped — `functions`, route tables, plugin lists,
`surface-registry.ts`, `nav-registry.ts`, `feature-registry.ts` — will produce
this same false positive.

**MEASURED, AND MY CLAIM ABOVE WAS OVERSTATED.** I wrote that the 881
unused-EXPORTS list was "almost certainly full of this." It was triaged
(873 of 881; `UNUSED_EXPORTS_TRIAGE.md`) and the mechanism accounts for far
less than I implied:

| bucket | n | % | |
|---|---:|---:|---|
| NO_INFILE_REFERENCE | 365 | 41% | survives — the deliverable |
| BARE_ITEM_CONTEXT_UNCLEAR | 239 | 27% | array-member shaped, enclosing literal unconfirmed |
| AGGREGATE_OF_REFERENCES | 125 | **14%** | confirmed false positive |
| REFERENCED_IN_FILE_OTHER | 84 | 9% | |
| CALLED_IN_FILE | 60 | 6% | |

**Confirmed aggregate consumption is 14%, not "most of it."** So the mechanism I
named is real but minor, and saying otherwise would have sent someone hunting
the wrong cause.

The conclusion survives for a different reason: **58% have an in-file reference
of some kind**, so fewer than half the entries come through clean. "The list is
86% trustworthy" is equally wrong — the 27% unresolved bucket is *probably*
mostly aggregates and is deliberately not counted as such without proof.

Overstated as to mechanism; roughly right as to conclusion; wrong to have stated
either without measuring.

**The 365 survivors are CONCENTRATED, which is the actionable part.** Twelve
files hold ~40%: `lifting-v11.ts` 35 · `skeleton.tsx` 25 · `round-reviews.ts` 14
· `v3/motion.ts` 13 · `insights.ts` 12 · `recruiting-philosophy.ts` 11, then a
tail. That is not 365 scattered dead symbols — a file exporting 25 unreferenced
skeletons is **one decision, not 25**.

**Evidentiary standing, stated plainly:** the 46 UNWIRED *files* above were each
checked individually. These 365 have passed ONE mechanical filter. Dynamic
dispatch, string lookup, framework convention and cross-file aggregates all look
identical to dead under it. Nothing should be deleted on this pass alone.

A caveat that applies to every row: knip cannot follow `next/dynamic`, and
`golf/admin/page.tsx` uses it. Entries under `golf/admin/` carry a higher
false-positive risk than the rest, and the skeptic corrections below caught
several.

---

## Wire these — ranked by value ÷ effort

Each names the missing connection precisely enough to act on without redoing
the analysis.

### `src/app/golf/admin/components/SessionHeatmap.tsx`
- **What it does:** Session analytics: page-view/feature-usage bars, avg pages/session, avg session duration, total sessions/pageviews (7d), and an explicit 'dead features nobody uses' list.
- **Missing connection:** GrowthTab remount; data.sessionHeatmap.{pageViews,featureUsage,sessionStats,deadFeatures} is already computed by getAdminDashboardData().
- **Database:** None directly; consumes AdminDashboardData.sessionHeatmap.*.
- **Effort:** trivial · **Value:** high · **Complete:** complete · **Confidence:** high
- ⚠️ **Skeptic correction:** The 'deadFeatures, zero hits' claim is factually false. `deadFeatures` appears 5 times in BusinessIntelligenceTab.tsx's UsageSection, rendering a 'Dead Features Detected' warning box from `bi.usage.deadFeatures` -- the same `string[]` shape SessionHeatmap's own `deadFeatures` prop consumes. So a dead-feature callout already exists live in the mounted BI tab; it is not unique to the orphaned SessionHeatmap. (The 'Session'/'engagement' zero-hits portion of the claim is accurate, and SessionHeatmap's session-level stats -- avgPagesPerSession, avgSessionDurationMin, totalSessions7d -- do remain genuinely unique.) — `src/app/golf/admin/components/BusinessIntelligenceTab.tsx:720-738 (u.deadFeatures rendered as 'Dead Features Detected'); src/app/golf/admin/components/SessionHeatmap.tsx:21 (deadFeatures: string[] prop, same shape)`

### `src/app/golf/admin/components/ComparativeBenchmarks.tsx`
- **What it does:** Team-vs-team scoring comparison, per-player improvement trend lines, and an AI-usage-vs-scoring-outcome correlation panel (avg score/improvement with AI coaching vs without) — a complete, 430-line render with sortable team table, most-improved-players list, and null-safe empty states, no stubs.
- **Missing connection:** Render `<ComparativeBenchmarks teamComparisons={data.benchmarks.teamComparisons} playerTrends={data.benchmarks.playerTrends} aiCorrelation={data.benchmarks.aiCorrelation} />` inside `PeopleTab.tsx` or `BusinessIntelligenceTab.tsx`. First reported as UNCERTAIN ("data source could not be located") — **that was wrong twice over**, corrected by two independent skeptic passes: `AdminDashboardData.benchmarks.{teamComparisons,playerTrends,aiCorrelation}` is a field-for-field, type-for-type exact match to this component's props, already computed in `rollup-c.ts`'s BENCHMARKS block and already returned on every admin page load. No new query, no RPC fix — this is a one-line render, same as SessionHeatmap above.
- **Database:** None directly (pure presentational); consumes `AdminDashboardData.benchmarks` (`src/app/golf/actions/admin-data.ts:673-677`, returned via `rollupC.benchmarks` at `:3899`, computed in `src/app/golf/actions/admin/rollup-c.ts` BENCHMARKS block ~L780-867).
- **Effort:** trivial · **Value:** high · **Complete:** complete · **Confidence:** high
- ⚠️ **Reclassified from UNCERTAIN.** See Corrections below for the two independent skeptic findings that overturned the original "data source unknown" verdict.

### `src/app/golf/admin/components/DataFreshnessAlerts.tsx`
- **What it does:** Three explicit at-risk lists with named users/teams: churn-risk players (days since last round), inactive teams (days since any login), disengaged coaches (days since insight check) — a complete 418-line render with sorting, show-more, and distinct empty states per category.
- **Missing connection:** Render `<DataFreshnessAlerts churnRiskPlayers={data.freshnessAlerts.churnRiskPlayers} inactiveTeams={data.freshnessAlerts.inactiveTeams} disengagedCoaches={data.freshnessAlerts.disengagedCoaches} />` inside `SystemTab.tsx` or `PeopleTab.tsx`. Same correction as ComparativeBenchmarks: originally reported UNCERTAIN with "data source not located," overturned twice — `AdminDashboardData.freshnessAlerts.{churnRiskPlayers,inactiveTeams,disengagedCoaches}` is a field-for-field exact match, already computed in `rollup-c.ts`'s FRESHNESS ALERTS block, already returned on every admin page load, zero consumers anywhere.
- **Database:** None directly; consumes `AdminDashboardData.freshnessAlerts` (`src/app/golf/actions/admin-data.ts:667-671`, returned via `rollupC.freshnessAlerts` at `:3898`, computed in `rollup-c.ts` FRESHNESS ALERTS block L698-769).
- **Effort:** trivial · **Value:** medium · **Complete:** complete · **Confidence:** high
- ⚠️ **Reclassified from UNCERTAIN.** See Corrections below.

### `src/app/golf/admin/crm/components/pipeline/PipelineKanban.tsx`
- **What it does:** A full drag-and-drop pipeline board (7 coach_status columns) built on @dnd-kit — a coach card can be dragged between columns with keyboard support, optimistic UI, and rollback on failure. Dropping a card into a 'closed' column (won/lost/nurture) blocks the status write and opens WinLossDialog, which requires the coach to pick a reason and forces a crm_contact_log note recording it before the status change persists.
- **Missing connection:** page.tsx currently renders `<PipelineView .../>` (imported line 58) at the Pipeline tab. To wire: import `{ PipelineKanban }` from './components/pipeline/PipelineKanban' in page.tsx, and either swap PipelineView for it at the pipeline-tab render site, or add a view-toggle. PipelineKanban's props (`coaches`, `engagementMap`, `onCoachClick`, `onStatusChange`) already match data page.tsx has in scope (`allCoaches`, an engagement map, `handleStatusChange`) — no new data plumbing needed, this is a straight swap-in.
- **Database:** crm_coaches (SELECT via prop, UPDATE .status/.updated_at on drop), crm_contact_log (INSERT: coach_id, contact_type='note', notes — win/loss reason)
- **Effort:** small · **Value:** high · **Complete:** complete · **Confidence:** high
- ⚠️ **Skeptic correction:** There is exactly one `<PipelineView` render call in page.tsx, at line 1726, inside the `coachView === 'board'` branch — `grep -n "<PipelineView" src/app/golf/admin/crm/page.tsx` returns a single hit. The sibling `coachView === 'table'` and `coachView === 'conferences'` branches render CoachTable and ConferenceGroupView respectively, not additional PipelineView instances, so there's no set of three PipelineView call sites to point to. (A repo-wide grep shows the number 3 more plausibly comes from `components/__tests__/PipelineView.test.tsx`, which does render `<PipelineView` four times.) Doesn't change the UNWIRED verdict or the recommended swap-in — the single real render site at page.tsx:1726 is exactly where PipelineKanban would go — but the citation itself is wrong. — `grep -n "<PipelineView" src/app/golf/admin/crm/page.tsx → 1726:<PipelineView (single result); grep -rn "<PipelineView" src/ → also 4 hits in components/__tests__/PipelineView.test.tsx (lines 76,94,223,263)`

### `src/app/golf/admin/crm/components/badges/EngagementDetailDrawer.tsx`
- **What it does:** A right-side slide-out drawer, opened by clicking an engagement badge, that explains a coach's Hot/Warm/Cold engagement score in full: the numeric score, an opens/clicks-90d sparkline, a plain-English 'why this score?' explainer (including the 14-day half-life decay math), and the coach's last 20 email events (sent/delivered/opened/clicked/bounced/etc.) with timestamps.
- **Missing connection:** Add an optional `onClick?: (coachId: string) => void` prop to EngagementBadge.tsx (src/app/golf/admin/crm/components/badges/EngagementBadge.tsx), render it as a button when present, and call it with the real `coachId` (drop the underscore prefix). At each of EngagementBadge's 4 call sites (CoachTable.tsx, CoachDetailPanel.tsx, PipelineCard.tsx, CoachPageHeader.tsx) lift a `{selectedCoachId, drawerOpen}` bit of state and render `<EngagementDetailDrawer coachId={selectedCoachId} isOpen={drawerOpen} onClose={...} />` alongside.
- **Database:** crm_coach_engagement (read via getCoachEngagement action — score, temperature, opens_90d, clicks_90d, last_event_at), email_events (read via getCoachTimeline, filtered to source='email_event')
- **Effort:** small · **Value:** high · **Complete:** complete · **Confidence:** high
- ⚠️ **Skeptic correction:** CoachDetailPanel.tsx is not a real EngagementBadge call site — `grep -rn "EngagementBadge" src/ --include=*.tsx \| grep -v badges/EngagementBadge.tsx` shows only two comments there (lines 95, 386), no import and no JSX usage. The real reached call sites today are CoachTable.tsx (lines 427 and 969) and CoachPageHeader.tsx (line 77). PipelineCard.tsx does render EngagementBadge (line 136), but PipelineCard's only parent is PipelineColumn→PipelineKanban, which this same report separately classifies UNWIRED — so PipelineCard is not a live call site until that other wiring lands either. Following the remediation instruction as written sends the reader hunting for a call site in CoachDetailPanel.tsx that doesn't exist, and overstates today's true count as 4 when it's 2. This is the same class of error as the PipelineKanban finding's call-site citation (see next item) — both stem from counting a name mention rather than confirming an actual render call. — `grep -rn "EngagementBadge" src/ --include=*.tsx \| grep -v badges/EngagementBadge.tsx → CoachTable.tsx:12,427,969; pipeline/PipelineCard.tsx:9,136; coach/CoachPageHeader.tsx:17,77; CoachDetailPanel.tsx:95,386 (comment-only, verified by reading both lines directly)`

### `src/app/golf/actions/v3/team-practice-rx.ts`
- **What it does:** Coach-facing variant of Practice Rx: generates a 7-day team practice plan for a whole skill AREA (driving/approach/short_game/putting/scoring) rather than one player's goal, using a synthetic goal keyed to the area's representative strokes-gained metric via metricForArea(), with an explicit coach-team access check (validateCoachTeamAccess).
- **Missing connection:** src/components/fairway/pages/coachhelm/TeamCategoryLeakBand.tsx is the exact mount point — each of the 5 rendered areas already carries an area id/label from getTeamCategoryInsights. Add a 'Generate practice plan' action per area calling generateTeamPracticeRx({team_id, area_id, area_label}) from '@/app/golf/actions/v3/team-practice-rx', then render/save via planToMarkdown + saveTextDocument, exactly as this file's own header comment describes ('materialized only if the coach saves it as a Document').
- **Database:** golf_coaches (select id, organization_id; filter user_id), golf_team_coach_staff (read, via validateCoachTeamAccess in src/lib/golf/resolve-team.ts), golf_drills (select id, slug, title, duration_min, difficulty; filter impacts_metric_id), golf_team_members (select player_id; filter team_id, status='active'). Transitively via compose(): golf_coachhelm_llm_calls (insert, task='round_review'), golf_coachhelm_llm_budget, golf_coachhelm_settings.
- **Effort:** small · **Value:** high · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/CoachIntelligenceCard.tsx`
- **What it does:** Sortable per-coach effectiveness table: review rate, avg response time, insights viewed, AI-philosophy configured status.
- **Missing connection:** (1) fix the get_user_engagement_summary RPC param-name bug in admin-people-data.ts, (2) call getPeopleTabData() from PeopleTab.tsx instead of deriving everything from getAdminDashboardData(), (3) render this table in a new PeopleTab section from peopleData.coachEffectiveness.
- **Database:** None directly (pure UI); natural data source is the get_coach_effectiveness_metrics() Postgres RPC — confirmed to exist in production via pg_proc (no-arg signature).
- **Effort:** small · **Value:** high · **Complete:** complete · **Confidence:** high
- ⚠️ **Skeptic correction:** Wrong data source and wrong wiring plan. CoachIntelligenceCardProps.coaches[] (id, name, teamName, totalPlayers, roundsReviewed, totalPlayerRounds, reviewRate, avgResponseTimeHours, insightsViewed, lastActiveAt, philosophyConfigured) is an EXACT field-for-field match to the OLD monolith's AdminDashboardData.coachIntelligence, which is already computed on every admin page load and already returned in the final data object -- but read by zero mounted components (confirmed: the only other references to `.coachIntelligence` in admin-data.ts are internal derived-stat computations, not a component consumer). By contrast, admin-people-data.ts's CoachEffectivenessEntry is actually a POOR match for this component: it is missing roundsReviewed, totalPlayerRounds, reviewRate, insightsViewed, and lastActiveAt entirely, and has teamCount (number) where the component wants teamName (string\|null). The real, complete, zero-backend-work wiring path is `data.coachIntelligence` -> CoachIntelligenceCard in PeopleTab.tsx; no RPC fix and no new action-file call are needed at all. — `src/app/golf/actions/admin-data.ts:618-630 (coachIntelligence field definition, exact-match shape), :3894 (returned in getAdminDashboardDataImpl); src/app/golf/actions/admin-people-data.ts:40-49 (CoachEffectivenessEntry, mismatched shape); src/app/golf/admin/components/CoachIntelligenceCard.tsx:6-18 (props interface)`

### `src/app/golf/admin/components/UserActivityTable.tsx`
- **What it does:** Full sortable, searchable user-directory table with engagement-level badges and a CSV export button.
- **Missing connection:** Mount as an additional/alternate view inside PeopleTab.tsx, or port its CSV-export capability onto the mounted TeamUserDirectory.tsx.
- **Database:** None directly; consumes AdminDashboardData.userDirectory.
- **Effort:** small · **Value:** high · **Complete:** complete · **Confidence:** high

### `src/app/golf/actions/admin-people-data.ts`
- **What it does:** Server action getPeopleTabData(): per-user engagement summary with 8-stage lifecycle classification, per-team health scores/tiers, per-coach effectiveness metrics, onboarding funnel completion rates, and a lifecycle-stage breakdown count.
- **Missing connection:** PeopleTab.tsx should call getPeopleTabData() and render its coachEffectiveness/teamHealth/lifecycleBreakdown against CoachIntelligenceCard.tsx, shared/LifecycleBadge.tsx, and shared/EngagementScore.tsx (all three are the presentation half of this same unwired pair). Fix the one RPC param-name bug first.
- **Database:** get_user_engagement_summary RPC (exists, param-name bug confirmed by direct execution), get_team_health_dashboard RPC (exists, confirmed returning real data), get_coach_effectiveness_metrics RPC (exists), get_onboarding_funnel_analysis RPC (exists) — all in public schema, verified via pg_proc.
- **Effort:** small · **Value:** high · **Complete:** complete · **Confidence:** high

### `src/app/golf/actions/admin-bi-data.ts`
- **What it does:** Server action getEnhancedBIData(): platform-metrics time series (dau/wau/mau/newSignups/roundsToday/churnAtRiskCount), AI-effectiveness measurement (AI vs non-AI user D7 retention lift, insight action rate — literally 'does the AI coaching feature work' as a metric), engagement tiers, and feature-stickiness rates.
- **Missing connection:** Call getEnhancedBIData() from BusinessIntelligenceTab.tsx's growth sub-tab; separately fix the RPC parameter name and populate golf_platform_metrics_daily (currently empty — whatever pipeline was meant to fill it was never built or scheduled).
- **Database:** golf_platform_metrics_daily (table, 0 rows, confirmed live), get_user_engagement_summary RPC (exists, param-name bug confirmed), golf_rounds, golf_insight_generation_log, golf_coach_insights, golf_players (all real tables, not row-count-checked).
- **Effort:** medium · **Value:** high · **Complete:** complete · **Confidence:** high

### `src/app/golf/actions/admin-system-data.ts`
- **What it does:** Server action getSystemTabData(): API route performance (p50/p95/p99 latency), hourly error-rate and auth-metrics series, background-job health, system health checks, and top-DB-table sizes.
- **Missing connection:** Call getSystemTabData() from SystemTab.tsx; fix the get_api_performance_summary param-name bug; and separately build/schedule whatever hourly rollup job was meant to populate error_rate_hourly and auth_metrics_hourly (both currently empty, so the error-rate and auth-metrics portions of this action would return nothing even if wired today).
- **Database:** get_api_performance_summary RPC (exists, param-name bug confirmed), get_enhanced_system_health RPC (exists), get_db_telemetry RPC (exists), error_rate_hourly (table, 0 rows), auth_metrics_hourly (table, 0 rows), background_job_logs (table, 17848 rows, confirmed populated).
- **Effort:** medium · **Value:** high · **Complete:** complete · **Confidence:** high

### `src/components/ui/row-actions-menu.tsx`
- **What it does:** RowActionsMenu — a complete '...' kebab dropdown for table/list rows: click-outside dismiss, Escape-to-close, haptics, ARIA menu roles, a disabled state, and a WCAG-AA-darkened danger-action color.
- **Missing connection:** src/app/golf/admin/crm/components/CoachTable.tsx's hand-rolled 'Three-dot action menu' (~lines 530-543) and the other 4 named MoreHorizontal call sites should import { RowActionsMenu } and the RowAction type from '@/lib/types/table' in place of their own dropdown markup.
- **Database:** none
- **Effort:** medium · **Value:** high · **Complete:** complete · **Confidence:** high
- ⚠️ **Skeptic correction:** False. Running their exact cited command, `git log --all -p -- '*.tsx' '*.ts' \| grep -c RowActionsMenu`, returns 24 matches, not zero. RowActionsMenu was imported and rendered three times by src/components/ui/data-table.tsx — a generic reusable DataTable primitive present since the repo's `Initial commit: Helm Sports Labs v3` (40c1e6c64) — continuously from row-actions-menu.tsx's own creation (commit 9cf480596, 2026-01-02) until data-table.tsx was deleted in commit 54d461f8b (2026-02-23, "chore: remove dead code — 142 files, ~28k lines"). That commit's own message explicitly lists data-table.tsx among "src/components/ui/ 27 dead primitives ... built but never wired up" — i.e. a prior HIGH-confidence, grep-verified dead-code audit already judged RowActionsMenu's sole consumer to be dead and removed it, but did not do a transitive second pass to catch RowActionsMenu itself becoming newly orphaned as a result. It is debris from a confirmed dead-code deletion, not a component that was 'simply never connected.' Separately, the functional slot it filled (per-row actions in a data table) is now covered by Fairway's own src/components/fairway/data-table/data-table.tsx (created 2026-05-30, commit f6e2a175b), which implements its own inline `RowActions` (hover-reveal icon-button row, data-table.tsx:129-178) rather than a dropdown kebab menu — a different UI pattern serving the same job, from the team that replaced the old data-table.tsx wholesale. The conf=high rating and 'not superseded by anything' framing should be walked back; the recommendation to wire it into the five non-Fairway CRM/calendar call sites can still stand on its own merits, but not on the evidentiary basis given. — `git show 54d461f8b -- '*.tsx' \| grep -n RowActionsMenu -B5 shows `-import { RowActionsMenu } from './row-actions-menu';` and three deleted `<RowActionsMenu actions={actions} />` call sites; `git show 54d461f8b --name-status \| grep -i table` shows `D src/components/ui/data-table.tsx`; `git log -1 --format='%B' 54d461f8b` lists "src/components/ui/ 27 dead primitives (... data-table ...)"; `git log --all --follow --diff-filter=A -- src/components/ui/data-table.tsx` bottoms out at `40c1e6c64 Initial commit: Helm Sports Labs v3`; `git log --all --follow --diff-filter=A -- src/components/ui/row-actions-menu.tsx` shows creation at `9cf480596` dated 2026-01-02 (vs. 54d461f8b dated 2026-02-23); `grep -n 'RowActions\\|DataTableRowAction' src/components/fairway/data-table/data-table.tsx` shows the inline hover-reveal replacement at lines 129-178; `git log --all -p -- '*.tsx' '*.ts' \| grep -c RowActionsMenu` = 24 (their own cited command, re-run, contradicting their reported zero).`

### `src/app/golf/admin/components/GrowthCard.tsx`
- **What it does:** Platform health-score ring plus growth-trend/funnel visualization for a coaching SaaS admin (health level, npsProxy-style power-user metric).
- **Missing connection:** Data already flows: getAdminDashboardData() computes data.growth/.users/.usage/.coachhelm/.userJourney/.stickiness on every page load. Add `{ id: 'growth', label: 'Growth', ... }` to TABS in src/app/golf/admin/page.tsx:77, lazy-import GrowthTab.tsx, add a render branch beside page.tsx:984, and change `growth: 'bi'` to `growth: 'growth'` at page.tsx:244.
- **Database:** None directly; consumes AdminDashboardData.growth, .users, .usage, .coachhelm, .userJourney, .stickiness.
- **Effort:** trivial · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/EngagementCard.tsx`
- **What it does:** Weekly-active-rate and avg-rounds-per-player stat tiles plus a stickiness (DAU/MAU) box.
- **Missing connection:** Same GrowthTab remount as GrowthCard — data.engagement/.playerEngagement/.stickiness already computed server-side.
- **Database:** None directly; consumes AdminDashboardData.engagement, .playerEngagement, .stickiness.
- **Effort:** trivial · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/InsightCallout.tsx`
- **What it does:** Tab-aware narrative generator producing short severity-tagged insight blurbs (e.g. churn count, AI-generation failures, rounds-today) from AdminDashboardData.
- **Missing connection:** GrowthTab remount, or repurpose the tab='dashboard' branch inside the mounted OverviewTab.tsx.
- **Database:** None; consumes AdminDashboardData.growth.churnedPlayers30d, .health.systemErrors7d, .health.roundsToday, and other fields per tab branch.
- **Effort:** trivial · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/AdminOnlineIndicator.tsx`
- **What it does:** Rich 'who's online' UI: avatar/initials list of currently-active admins in a popover, online count, connection state.
- **Missing connection:** Render `<AdminOnlineIndicator activeAdmins={presence.activeAdmins} onlineCount={presence.onlineCount} isConnected={realtime.isConnected} currentUserId={currentUserId} />` in the admin header near page.tsx:708-721, where the 'Live Updates' text currently sits alone.
- **Database:** None; backed by a Supabase Realtime presence channel via the useAdminPresence hook, not a table.
- **Effort:** trivial · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/BaseballOps.tsx`
- **What it does:** Cross-sport visibility card: baseball recruiting pipeline counts (watchlist/priority/offer/committed) and onboarding rate, shown inside the golf admin dashboard.
- **Missing connection:** Mount in OverviewTab.tsx or a new 'Platform' section.
- **Database:** None directly; consumes AdminDashboardData.baseball — did not trace which baseball_* tables feed that field inside admin-data.ts, so did not confirm it holds non-zero live counts.
- **Effort:** trivial · **Value:** medium · **Complete:** partial · **Confidence:** medium

### `src/app/golf/admin/components/ErrorSpotlight.tsx`
- **What it does:** Error/incident spotlight: 24h error count, UX-issue signals (chunk-load errors specifically), errors-by-route breakdown, and the lead open incident.
- **Missing connection:** Mount in SystemTab.tsx alongside ErrorFeed, passing data.errorDetection.
- **Database:** None directly; consumes AdminDashboardData.errorDetection, .errorLogs.
- **Effort:** trivial · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/LiveEventCounter.tsx`
- **What it does:** Realtime event counter widget: total/error/critical event counts plus connection-state indicator.
- **Missing connection:** Render `<LiveEventCounter total={realtime.counts.total} errors={realtime.counts.errors} critical={realtime.counts.critical} isConnected={realtime.isConnected} connectionState={realtime.connectionState} />` near page.tsx:708.
- **Database:** None; backed by the Supabase Realtime event-stream hook, not a table.
- **Effort:** trivial · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/TeamIntelligenceCard.tsx`
- **What it does:** Team-vs-team scoring comparison bar chart (avg score ranked across teams).
- **Missing connection:** Mount inside PeopleTab.tsx or a dedicated Teams section.
- **Database:** None directly; consumes AdminDashboardData.teams.
- **Effort:** trivial · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/UsageMetricsCard.tsx`
- **What it does:** Usage/data-quality dashboard card: round-type breakdown donut, funnel viz, and data-completeness quality gauges.
- **Missing connection:** Mount in SystemTab.tsx (which already receives data.dataQuality for HealthCheckGrid) or BusinessIntelligenceTab.tsx.
- **Database:** None directly; consumes AdminDashboardData.usage, .dataQuality, .funnel.
- **Effort:** trivial · **Value:** medium · **Complete:** complete · **Confidence:** medium

### `src/app/golf/admin/components/UserBreakdownCard.tsx`
- **What it does:** Signups-by-week area chart, player-status donut breakdown, week-over-week signup delta.
- **Missing connection:** Mount in OverviewTab.tsx or PeopleTab.tsx.
- **Database:** None directly; consumes AdminDashboardData.users.
- **Effort:** trivial · **Value:** medium · **Complete:** complete · **Confidence:** medium

### `src/app/golf/admin/components/shared/EngagementScore.tsx`
- **What it does:** Circular-progress engagement-score ring (0-100, color-tiered) with optional tier label.
- **Missing connection:** Natural pairing is admin-people-data.ts's UserEngagement.engagementScore field — render inside CoachIntelligenceCard.tsx or UserActivityTable.tsx rows once those are wired (see above).
- **Database:** None directly.
- **Effort:** trivial · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/components/ui/row-actions-menu.tsx`
- **What it does:** RowActionsMenu — a finished, accessible kebab (···) button that opens a dropdown of row actions (icon, label, danger-variant destructive styling, disabled state), with outside-click and Escape-to-close, ARIA menu roles, 44px touch targets, and Capacitor haptic feedback on tap. This is the file the six-item list's `src/lib/types/table.ts` orphan actually points at — added here because it, not the type file, is the true root of the dead subtree.
- **Missing connection:** Two-part: (1) re-skin the menu surface off the pre-Fairway `warm-*`/`bg-cream-50/95 backdrop-blur-xl border-warm-200/50` tokens onto Fairway's `bg-elevated`/`shadow-raise`/`rounded-fw-md` tokens (or relocate the file under `src/components/fairway/`) — the rest of the app has moved past the old token set. (2) Replace the two independently hand-rolled MoreHorizontal dropdown menus in `src/app/golf/admin/crm/components/CoachTable.tsx` (lines ~540 and ~812, both duplicating the identical open/close-on-outside-click/kebab-button pattern) with `<RowActionsMenu actions={...} />`; the same pattern also appears hand-rolled in `src/app/golf/admin/crm/components/ConferenceGroupView.tsx`, `src/app/golf/admin/crm/page.tsx`, `src/components/golf/calendar/EventDetailModal.tsx`, and `src/components/golf/calendar/MobileEventSheet.tsx` as secondary candidates once the token mismatch is fixed.
- **Database:** none — pure presentation component, receives actions/onClick callbacks as props.
- **Effort:** small · **Value:** medium · **Complete:** complete · **Confidence:** high
- ⚠️ **Skeptic correction:** False. Running their exact cited command, `git log --all -p -- '*.tsx' '*.ts' \| grep -c RowActionsMenu`, returns 24 matches, not zero. RowActionsMenu was imported and rendered three times by src/components/ui/data-table.tsx — a generic reusable DataTable primitive present since the repo's `Initial commit: Helm Sports Labs v3` (40c1e6c64) — continuously from row-actions-menu.tsx's own creation (commit 9cf480596, 2026-01-02) until data-table.tsx was deleted in commit 54d461f8b (2026-02-23, "chore: remove dead code — 142 files, ~28k lines"). That commit's own message explicitly lists data-table.tsx among "src/components/ui/ 27 dead primitives ... built but never wired up" — i.e. a prior HIGH-confidence, grep-verified dead-code audit already judged RowActionsMenu's sole consumer to be dead and removed it, but did not do a transitive second pass to catch RowActionsMenu itself becoming newly orphaned as a result. It is debris from a confirmed dead-code deletion, not a component that was 'simply never connected.' Separately, the functional slot it filled (per-row actions in a data table) is now covered by Fairway's own src/components/fairway/data-table/data-table.tsx (created 2026-05-30, commit f6e2a175b), which implements its own inline `RowActions` (hover-reveal icon-button row, data-table.tsx:129-178) rather than a dropdown kebab menu — a different UI pattern serving the same job, from the team that replaced the old data-table.tsx wholesale. The conf=high rating and 'not superseded by anything' framing should be walked back; the recommendation to wire it into the five non-Fairway CRM/calendar call sites can still stand on its own merits, but not on the evidentiary basis given. — `git show 54d461f8b -- '*.tsx' \| grep -n RowActionsMenu -B5 shows `-import { RowActionsMenu } from './row-actions-menu';` and three deleted `<RowActionsMenu actions={actions} />` call sites; `git show 54d461f8b --name-status \| grep -i table` shows `D src/components/ui/data-table.tsx`; `git log -1 --format='%B' 54d461f8b` lists "src/components/ui/ 27 dead primitives (... data-table ...)"; `git log --all --follow --diff-filter=A -- src/components/ui/data-table.tsx` bottoms out at `40c1e6c64 Initial commit: Helm Sports Labs v3`; `git log --all --follow --diff-filter=A -- src/components/ui/row-actions-menu.tsx` shows creation at `9cf480596` dated 2026-01-02 (vs. 54d461f8b dated 2026-02-23); `grep -n 'RowActions\\|DataTableRowAction' src/components/fairway/data-table/data-table.tsx` shows the inline hover-reveal replacement at lines 129-178; `git log --all -p -- '*.tsx' '*.ts' \| grep -c RowActionsMenu` = 24 (their own cited command, re-run, contradicting their reported zero).`

### `src/app/golf/actions/v3/llm.ts`
- **What it does:** Two capabilities: (1) generateLlmRoundReview — an LLM-composed round-review narrative enriched with the round's strokes-gained breakdown, recent composite insight titles, a genome-derived persona label, and the player's active goal, gated by a resolved billing coach (fails closed to a deterministic template if nobody can be billed) and a per-user rate limit. (2) generateHeroNarrative — an LLM-composed one-line 'hero' headline for the player dashboard's top-insight card, same billing/rate-limit machinery.
- **Missing connection:** generateLlmRoundReview: wire into src/hooks/coachhelm/useRoundReviewV2.ts (or directly into rounds/[id]/review/page.tsx) — import generateLlmRoundReview from '@/app/golf/actions/v3/llm' and call it with the round id plus the existing deterministic summary as fallback_summary, per the file's own docstring intent ('renders the returned text alongside the existing template summary'). generateHeroNarrative: wire into src/components/golf/coachhelm/home/PlayerCoachHelmHome.tsx — replace or augment the formatPredictionHero(...) call (~line 283) with a call to generateHeroNarrative from '@/app/golf/actions/v3/llm', passing the same top-insight fields the component already computes (matching HeroNarrativeInput: player_id, metric_label, your_value_display, team_pct, etc.).
- **Database:** golf_rounds (select id, player_id, total_score, score_to_par, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, course_name), golf_players (select id, first_name), golf_team_members (select team_id; filter player_id, status), golf_team_coach_staff (select coach_id; filter team_id, order is_primary/created_at/coach_id), golf_round_stats_cache (select strokes_gained_total/tee/approach/around_green/putting; filter round_id), golf_coach_insights (select title, signature, created_at; filter player_id, source_id, signature like 'v3:composite:%'), golf_goals (select title, target_value, ends_at, metric_id; filter player_id, state='active'). Transitively via compose(): golf_coachhelm_llm_calls (insert), golf_coachhelm_llm_budget (read/upsert), golf_coachhelm_settings (read).
- **Effort:** small · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/app/golf/actions/v3/practice-rx.ts`
- **What it does:** Given a player goal, generates a structured 7-day practice plan (day-by-day drill assignments with prose) by resolving candidate drills tagged to the goal's target metric, LLM-composing via composePracticeRx with a deterministic structured fallback, and resolving a billing coach for cost attribution.
- **Missing connection:** src/components/fairway/pages/coachhelm/FocusAreaModal.tsx already renders PracticeRxForInsight (read-only) with the goal/focus-area id in scope at ~line 561 — add a 'Generate 7-day plan' CTA there that calls generatePracticeRx(goal_id) from '@/app/golf/actions/v3/practice-rx', renders the result via the already-built but orphaned planToMarkdown (src/components/fairway/pages/coachhelm/plan-markdown.ts), and persists via the existing saveTextDocument action if the user chooses to keep it.
- **Database:** golf_goals (select id, title, metric_id, target_value, current_value, window_days, player_id; filter id), golf_drills (select id, slug, title, duration_min, difficulty; filter impacts_metric_id), golf_team_members (select team_id; filter player_id, status='active'), golf_team_coach_staff (select coach_id; filter team_id, is_primary=true). Transitively via compose(): golf_coachhelm_llm_calls (insert, task='round_review' — deliberately reuses that budget bucket per a code comment citing 'Part XI.4'), golf_coachhelm_llm_budget, golf_coachhelm_settings.
- **Effort:** small · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/AuditFeed.tsx`
- **What it does:** Admin audit-log trail viewer (who did what, filterable to admin-only actions) plus login-security context.
- **Missing connection:** Mount as a new section inside SystemTab.tsx, which already receives data.loginSecurity for HealthCheckGrid — natural adjacency.
- **Database:** None directly; consumes AdminDashboardData.auditLog, .loginSecurity.
- **Effort:** small · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/shared/LifecycleBadge.tsx`
- **What it does:** 8-stage user lifecycle badge (brand_new/onboarding/active/engaged/power_user/at_risk/churned/dormant) with distinct color tones per stage.
- **Missing connection:** Its 8-stage model matches admin-people-data.ts's RPC-computed lifecycleStage field exactly; wire alongside CoachIntelligenceCard/UserActivityTable once PeopleTab.tsx calls getPeopleTabData().
- **Database:** None directly; natural pairing with get_user_engagement_summary() RPC's lifecycle_stage output.
- **Effort:** small · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/components/ui/filter-chips.tsx`
- **What it does:** FilterChips (removable active-filter chip row with an X + clear-all), ChipToggle/ChipGroup (toggleable filter chips), and BadgeChip (static tinted badge) — a complete active-filters UI kit for list/table filter bars.
- **Missing connection:** src/app/golf/admin/crm/components/CoachFilters.tsx should import { FilterChips } from '@/components/ui/filter-chips' in place of its hand-rolled onRemove/removeFilter chip row.
- **Database:** none
- **Effort:** small · **Value:** medium · **Complete:** complete · **Confidence:** medium

### `src/components/ui/pagination.tsx`
- **What it does:** Pagination (numbered pages + ellipsis + first/last), CompactPagination ('Showing X to Y of Z' + prev/next), and PageSizeSelector — a complete, accessible pagination kit.
- **Missing connection:** CoachTable.tsx and resend/EmailsTable.tsx (both in src/app/golf/admin/crm/components/) should replace their hand-rolled pager blocks with <Pagination> / <CompactPagination> from '@/components/ui/pagination'.
- **Database:** none
- **Effort:** small · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/components/ui/progress.tsx`
- **What it does:** Progress — a linear progress bar with label, percentage, 5 color variants, 3 sizes, and a genuinely-functional indeterminate mode; plus SegmentedProgress for multi-step flows (e.g. a wizard's step dots).
- **Missing connection:** src/app/golf/admin/crm/components/ImportModal.tsx and .../DuplicateReview.tsx (bulk-import progress UI) are plausible candidates to import <Progress> from '@/components/ui/progress' in place of their own progress-bar markup — not fully verified line-by-line, so treat as a lead.
- **Database:** none
- **Effort:** small · **Value:** medium · **Complete:** complete · **Confidence:** medium

### `src/app/baseball/actions/development-metrics.ts`
- **What it does:** The write+read path for a player 'development metrics' feature: two staff-only server actions that recompute a player's (or the whole roster's) derived hitting/pitching metrics from raw stat events and upsert dated, source-attributed, confidence-scored snapshots into baseball_player_development_metrics, plus one action that lets a player read back their own player_visible snapshot rows. This is meant to be the missing half of a feature whose read model (getEliteStatEvents / DerivedMetric) already powers the live Stats Center.
- **Missing connection:** Two independent gaps, both required: (1) DATABASE — the live baseball_player_development_metrics table is missing the UNIQUE (team_id, player_id, metric_key, data_context, as_of_date) constraint its own migration defines; a new migration must add it (e.g. `ALTER TABLE baseball_player_development_metrics ADD CONSTRAINT uq_baseball_dev_metric_snapshot UNIQUE (team_id, player_id, metric_key, data_context, as_of_date)` guarded for idempotency), or both upsert calls at development-metrics.ts:184-187 and :245-249 will throw 'no unique or exclusion constraint matching the ON CONFLICT specification' the first time they run. (2) CALLERS — none exist yet: add a 'Recompute development metrics' action button in src/components/baseball/stats-center/StatsCenterClient.tsx calling snapshotTeamDevelopmentMetrics (the file's own header comment calls this out as 'the cron / recompute entry point a coach hits from Stats Center'); register a scheduled Inngest function (src/lib/inngest/functions.ts currently registers none for baseball) to call snapshotTeamDevelopmentMetrics per team on a cadence; and add a call site for getPlayerDevelopmentSnapshot on a player-facing surface (e.g. the player stats/passport page) to actually render the snapshot rows once they exist.
- **Database:** baseball_player_development_metrics (upsert in snapshotPlayerDevelopmentMetrics/snapshotTeamDevelopmentMetrics; select in getPlayerDevelopmentSnapshot) — columns written: team_id, player_id, metric_key, metric_group, data_context, as_of_date, window_label, value_numeric, sample_size, confidence, trust_tier, source_id, visibility, computed_at; columns read: metric_key, metric_group, data_context, value_numeric, sample_size, confidence, trust_tier, as_of_date, window_label, visibility. Missing DB object: UNIQUE constraint uq_baseball_dev_metric_snapshot on (team_id, player_id, metric_key, data_context, as_of_date) — defined in migration 20260624000080 but absent from the live table. Also reads baseball_team_members (player_id, filtered by team_id/player_id) for roster/membership verification.
- **Effort:** medium · **Value:** medium · **Complete:** partial · **Confidence:** high
- ⚠️ **Skeptic correction:** The live `baseball_player_development_metrics` table does not merely lack the UNIQUE constraint — it has a completely different, unrelated column set from what migration 20260624000080 defines and what the action code reads/writes. Live `information_schema.columns` for the table (queried 2026-08-19 against prod) is: id, team_id, player_id, metric_key, metric_value (numeric), metric_context (jsonb), measured_at (date), source_refs (jsonb), visibility, created_at. None of metric_group, data_context, as_of_date, window_label, value_numeric, sample_size, confidence, trust_tier, source_id, or computed_at exist on the live table — yet `toSnapshotRow()` (development-metrics.ts:80-101) builds upsert rows with exactly those keys, and `getPlayerDevelopmentSnapshot`'s own `.select('metric_key, metric_group, data_context, value_numeric, sample_size, confidence, trust_tier, as_of_date, window_label, visibility')` (development-metrics.ts:297-299) requests seven columns that don't exist. So the very first call to any of the three exported actions — write (development-metrics.ts:184, :246) or read (:297) — fails immediately with a PostgREST "column ... does not exist" error, not the ON CONFLICT/unique-constraint error predicted. This also falsifies the stated mechanism ("CREATE TABLE IF NOT EXISTS ... silently no-opped the whole statement, including the constraint clause"): migration 20260624000080 also contains two separate `CREATE INDEX IF NOT EXISTS` statements for this table (idx_baseball_dev_metrics_player, idx_baseball_dev_metrics_team_group) that are NOT gated by the CREATE TABLE's IF NOT EXISTS and should have run regardless — but neither index name exists live either. The two indexes that DO exist live are `baseball_player_development_metrics_player_id_idx` (traceable to a later, unrelated migration, 20260710004200, a generic FK-covering-index pass across many baseball tables) and `baseball_player_development_metrics_team_player_idx` (traceable to no migration file at all — grepping every file under supabase/migrations/ for that exact index name returns zero hits). The evidence fits "this migration's DDL for this table never ran against prod at all, despite being stamped applied twice" (consistent with this repo's documented migration-history drift), not "one clause of one statement no-opped." Remediation is therefore not a one-line ALTER TABLE — it requires either a migration that reconciles/rebuilds the live table to the column set the code assumes, or rewriting the action code against the live schema, which is a materially larger fix than reported. — `Live query via Supabase MCP execute_sql, 2026-08-19: `select column_name, data_type from information_schema.columns where table_name='baseball_player_development_metrics'` -> {id, team_id, player_id, metric_key, metric_value, metric_context, measured_at, source_refs, visibility, created_at}; `select indexname, indexdef from pg_indexes where tablename='baseball_player_development_metrics'` -> only baseball_player_development_metrics_pkey, _team_player_idx, _player_id_idx (neither idx_baseball_dev_metrics_player nor idx_baseball_dev_metrics_team_group from the migration exist); grep -rln "baseball_player_development_metrics_team_player_idx" supabase/migrations/ -> zero hits; src/app/baseball/actions/development-metrics.ts:80-101 (toSnapshotRow), :184 and :246 (.upsert), :297-299 (.select); supabase/migrations/20260624000080_baseball_elite_stat_event_model.sql:612-648; supabase/migrations/20260710004200_fk_covering_indexes_batch2_baseball_p_z.sql:19.`
- ⚠️ **Skeptic correction:** Live `pg_policies` for the table shows 4 policies (insert/select/update/delete), and ALL FOUR gate on `is_baseball_team_staff(team_id)` with no player-self clause — there is no policy variant like `OR (player_id = <own> AND visibility = 'player_visible')`. `getPlayerDevelopmentSnapshot` is deliberately given only the non-staff `FEATURE` capability (development-metrics.ts:279-281) specifically so "a player reads their OWN player_visible rows... RLS enforces it" per its own header comment (development-metrics.ts:26-29, 296). But the live SELECT policy denies every non-staff role outright — it does not implement the intended player-visibility carve-out at all. So independent of the schema-mismatch defect above, once the schema and constraint are both fixed, `getPlayerDevelopmentSnapshot` will still return zero rows for any real player caller, because RLS blocks the read before the in-process visibility filter ever runs. This is a second, independent missing connection beyond "add a caller + add the constraint": a player-self RLS SELECT policy must be added, or the player-facing read path stays dead on arrival regardless of who wires a caller to it. — `Live query via Supabase MCP execute_sql, 2026-08-19: `select policyname, cmd, qual, with_check from pg_policies where tablename='baseball_player_development_metrics'` -> baseball_player_development_metrics_{insert,select,update,delete}, all four with qual/with_check = is_baseball_team_staff(team_id), no OR clause; src/app/baseball/actions/development-metrics.ts:26-29 (header comment claiming RLS enforces player-visible filtering), :279-281 (FEATURE-only, non-staff capability), :296 ("RLS enforces it either way" comment).`
- ⚠️ **Skeptic correction:** That exact ALTER TABLE cannot execute against the live table: `data_context` and `as_of_date` are not columns on it at all (confirmed via `information_schema.columns` for `public.baseball_player_development_metrics`: the live columns are id, team_id, player_id, metric_key, metric_value, metric_context, measured_at, source_refs, visibility, created_at — 10 columns total, none named data_context or as_of_date). The upsert calls' `onConflict: 'team_id,player_id,metric_key,data_context,as_of_date'` targets at development-metrics.ts:185 and :249 name the same nonexistent columns. So the prescribed fix is not merely insufficient, it is un-runnable as written — this is a schema-shape mismatch, not a missing-constraint problem. — `Live query: select column_name,data_type from information_schema.columns where table_name='baseball_player_development_metrics' -> 10 rows (id, team_id, player_id, metric_key, metric_value NOT NULL no default, metric_context jsonb NOT NULL default '{}', measured_at date, source_refs jsonb NOT NULL default '[]', visibility, created_at). Compare src/app/baseball/actions/development-metrics.ts:184-187 and :245-249 (onConflict strings) and supabase/migrations/20260624000080_baseball_elite_stat_event_model.sql:643-644 (the constraint they propose re-adding, which references the same two nonexistent columns).`
- ⚠️ **Skeptic correction:** Fails the task's own UNWIRED test ('if it references a table or column that was dropped ... it is ABANDONED and wiring it would fail'). The write path in toSnapshotRow (development-metrics.ts:90-105) builds an upsert payload with 14 keys — team_id, player_id, metric_key, metric_group, data_context, as_of_date, window_label, value_numeric, sample_size, confidence, trust_tier, source_id, visibility, computed_at — of which 10 (all but team_id, player_id, metric_key, visibility) do not exist on the live table. The read at development-metrics.ts:296-298 selects 'metric_key, metric_group, data_context, value_numeric, sample_size, confidence, trust_tier, as_of_date, window_label, visibility' — 8 of those 10 names are also absent live. Additionally the live `metric_value` column is NOT NULL with no default and is never populated by toSnapshotRow at all. Wiring a caller today (their proposed remediation) would make the very first invocation fail immediately on an unrelated-to-constraints column-shape error, before ever reaching the ON CONFLICT issue. The real remediation is a schema decision — migrate the live table to the 18-column shape the 20260624000080 migration and the action code both assume, or rewrite the three actions against the live 10-column shape — not 'add one constraint plus three call sites.' — `development-metrics.ts:90-105 (toSnapshotRow, full payload) and :296-298 (select column list) vs. live information_schema.columns for baseball_player_development_metrics (10 columns, listed above, none named metric_group/data_context/as_of_date/window_label/value_numeric/sample_size/confidence/trust_tier/source_id/computed_at). Migration's intended shape at supabase/migrations/20260624000080_baseball_elite_stat_event_model.sql:612-644 (18 columns).`
- ⚠️ **Skeptic correction:** Live RLS for this table does not match that documented contract. `select policyname,cmd,qual,with_check from pg_policies where tablename='baseball_player_development_metrics'` returns exactly 4 policies (SELECT/INSERT/UPDATE/DELETE), all gated solely by `is_baseball_team_staff(team_id)` — there is no player-visible OR-clause on SELECT at all. So even after the schema mismatch in corrections #1/#2 is fixed and a caller is wired up, `getPlayerDevelopmentSnapshot` would return zero rows for any player (RLS blocks all non-staff SELECT), contradicting the file's own documented player-read contract. This is not explained by their proposed cause (an `IF NOT EXISTS` no-op on CREATE TABLE): the migration's table-specific RLS block at 20260624000080:783-812 is guarded by `to_regclass('public.baseball_player_development_metrics') IS NOT NULL` and does `DROP POLICY IF EXISTS` + unconditional `CREATE POLICY` with a player-visible OR-clause — it would run and take effect regardless of whether the CREATE TABLE itself no-opped. Nor is it explained by the migration's generic per-table policy loop (20260624000080:717-780), which enumerates exactly 10 named event tables and does not include baseball_player_development_metrics. A repo-wide grep for `is_baseball_team_staff` combined with this table name returns zero hits in any migration file. So no migration currently in the repo produces the live staff-only-only policy shape; its origin is out-of-band, consistent with this repo's documented migration-history drift (32 stamps still unaccounted per prior audits) rather than with the elite-stat-event-model migration as written. This is a latent, third defect — it only becomes the active blocker once corrections #1/#2 are addressed. — `Live query: select policyname,cmd,qual,with_check from pg_policies where tablename='baseball_player_development_metrics' -> 4 rows, all qual/with_check = is_baseball_team_staff(team_id). Migration source: supabase/migrations/20260624000080_baseball_elite_stat_event_model.sql:717-780 (generic loop, 10-table VALUES list, dev-metrics table absent) and :782-812 (table-specific DO block with to_regclass guard + player-visible OR-clause). Grep: `grep -rn is_baseball_team_staff supabase/migrations/*.sql \| grep -i development_metrics` -> no matches.`

### `src/app/golf/admin/components/PlayerDropoffFunnel.tsx`
- **What it does:** Onboarding funnel visualization plus, uniquely, a 'stuck users' list — named, emailed users stuck at each specific funnel stage, ready for outreach.
- **Missing connection:** Pass `data.playerFunnel` directly to the component — both `funnel` (aggregate bars) and `stuckUsers` (the named-user list) are already computed, live, in `rollup-c.ts`, and neither is the field BI tab reads (`bi.funnel` is a separate computation). No new query needed; see the two skeptic corrections below, which overturned the original "funnel superseded / stuckUsers data source unknown" framing on both halves.
- **Database:** `AdminDashboardData.playerFunnel.{funnel,stuckUsers}` (`admin-data.ts:632-648`, returned via `rollupC.playerFunnel` at `:3895`) — already live, already computed, zero consumers of `.stuckUsers`.
- **Effort:** trivial · **Value:** medium · **Complete:** complete (corrected from partial) · **Confidence:** high
- ⚠️ **Skeptic correction:** The data source exists and is an exact match, already computed and already unused. AdminDashboardData.playerFunnel.stuckUsers (stage, users[{id, name, email, daysSinceSignup, lastActiveAt}]) is field-for-field identical to PlayerDropoffFunnelProps.stuckUsers. Grep confirms `data.playerFunnel.funnel` (the aggregate bars) is consumed by GrowthTab and OverviewTab, but `.stuckUsers` has zero consumers anywhere in src/app/golf/admin/. This should be reclassified UNWIRED complete=complete conf=high, not UNCERTAIN -- it needs no new data layer, just a render. — `src/app/golf/actions/admin-data.ts:632-648 (playerFunnel.stuckUsers, exact shape); src/app/golf/admin/components/PlayerDropoffFunnel.tsx:7-24 (props interface, identical shape)`
- ⚠️ **Skeptic correction:** Both props are already computed, live, in the exact shape the component needs, and neither one is the field BI tab uses. AdminDashboardData.playerFunnel is `{ funnel: {stage,count,percentage,dropoffFromPrevious,dropoffPct}[], stuckUsers: {stage, users:[{id,name,email,daysSinceSignup,lastActiveAt}]}[] }` — field-for-field identical to PlayerDropoffFunnelProps. It's computed in rollup-c.ts and is a fully separate computation from data.bi.funnel, which BusinessIntelligenceTab actually reads. So the 'funnel superseded / stuckUsers unknown' framing is wrong on both halves: nothing here is superseded by the BI tab (they read different fields), and stuckUsers isn't a data-layer gap — it's already sitting in data.playerFunnel.stuckUsers, unread by every mounted component. This should be complete=complete, wireable today by passing `data.playerFunnel` directly to the component with no new query. — `AdminDashboardData.playerFunnel type: src/app/golf/actions/admin-data.ts:633-648; returned via rollupC.playerFunnel: admin-data.ts:3895; computed in src/app/golf/actions/admin/rollup-c.ts (funnel/stuckUsers build block); BusinessIntelligenceTab reads the separate `bi.funnel` field: src/app/golf/admin/components/BusinessIntelligenceTab.tsx:901-902; PlayerDropoffFunnelProps: src/app/golf/admin/components/PlayerDropoffFunnel.tsx:6-22; confirmed no mounted component reads `.stuckUsers` (grep for `.playerFunnel` outside admin-data.ts/rollup-c.ts hits only OverviewTab.tsx, GrowthTab.tsx, UserFunnelViz.tsx, OverviewBriefing.tsx, all reading only `.funnel`).`

### `src/components/ui/containers.tsx`
- **What it does:** ContainerGrid (1280/1536px capped page wrapper) and ContainerReading (720px prose wrapper) — the two canonical page-width containers meant to replace ad hoc `max-w-[3xl..7xl]` wrappers across golf + baseball.
- **Missing connection:** Either containers.tsx's ContainerGrid/ContainerReading or PageContainer.tsx should be adopted into the 32 files still hand-rolling `mx-auto w-full max-w-[...]`, e.g. src/app/golf/(dashboard)/dashboard/tasks/page.tsx and src/app/golf/(dashboard)/dashboard/intelligence/page.tsx.
- **Database:** none
- **Effort:** medium · **Value:** medium · **Complete:** complete · **Confidence:** high

### `src/components/ui/reveal.tsx`
- **What it does:** Reveal — a fade+rise entrance-animation wrapper for hero sections, insight cards, and stat rows, with per-sibling stagger and a documented, deliberate fix for a real whileInView/inner-scroll-container bug.
- **Missing connection:** Golf's entrance-fade blocks (e.g. inside src/components/fairway/app-shell/RouteTransition.tsx or the card-grid entrances in cards-insight/) could import { Reveal } from '@/components/ui/reveal' in place of hand-written `initial={{opacity:0,y:8}}` blocks.
- **Database:** none
- **Effort:** medium · **Value:** medium · **Complete:** complete · **Confidence:** high
- ⚠️ **Skeptic correction:** Two of the four cited example files do not contain the `opacity: 0, y: ...` pattern they are cited for. src/components/fairway/app-shell/RouteTransition.tsx:45-46 is `initial: { opacity: 0 }, animate: { opacity: 1 }` — an opacity-only crossfade, no `y` offset at all. src/components/fairway/charts/RadialGauge.tsx:249 is `initial={reduced ? false : { opacity: 0, scale: 0.4 }}` — opacity+scale, not opacity+y. A repo-wide regex for the actual pattern (`opacity:\s*0.*y:\s*[0-9]` in *.tsx under src/components/fairway) returns 15 files with 75 line-level occurrences, and neither RouteTransition.tsx nor RadialGauge.tsx is among them (real hits include FairwayRoundSubmitOverlay.tsx, Filmstrip.tsx, TickerStrip.tsx, command-menu.tsx, cards-insight/InsightCard.tsx, and others). This matters because the same row's 'missing connection' proposes RouteTransition.tsx specifically as a Reveal.tsx call site — swapping its opacity-only crossfade for Reveal's fade+rise would change the animation, not just consolidate identical code. The UNWIRED verdict on reveal.tsx itself is unaffected (zero importers confirmed independently by filename grep, symbol grep, and sibling-import grep) — this is a citation-accuracy correction on the illustrative examples and the RouteTransition.tsx migration suggestion, not a reclassification. — `src/components/fairway/app-shell/RouteTransition.tsx:45-46; src/components/fairway/charts/RadialGauge.tsx:249`

### `src/app/golf/admin/crm/components/badges/EngagementSparkline.tsx`
- **What it does:** A small 80x24 SVG two-bar sparkline (opens vs. clicks, last 90 days) for a coach's engagement, or a muted flat line when there's no activity.
- **Missing connection:** No connection needed beyond wiring EngagementDetailDrawer (above) — this component becomes reachable automatically once the drawer is. If CoachDetailPanel.tsx is also meant to show it inline per the stale comment, add `<EngagementSparkline engagement={...} />` there directly (CoachDetailPanel already fetches engagement data).
- **Database:** None directly — pure presentational component over the `CoachEngagement` object passed as a prop (ultimately sourced from crm_coach_engagement).
- **Effort:** trivial · **Value:** low · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/DataExportButton.tsx`
- **What it does:** Generic reusable CSV-export button (serializes an array of row objects to a downloadable CSV).
- **Missing connection:** Rides along automatically once UserActivityTable.tsx is wired (see below); no independent connection needed.
- **Database:** None.
- **Effort:** trivial · **Value:** low · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/TeamRosterCard.tsx`
- **What it does:** Expandable/collapsible per-team roster listing.
- **Missing connection:** Mount inside PeopleTab.tsx.
- **Database:** None directly; consumes AdminDashboardData.teamRosters.
- **Effort:** trivial · **Value:** low · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/shared/StatusBadge.tsx`
- **What it does:** Generic 5-state status badge (healthy/warning/critical/info/neutral) wrapping the design-system Badge component.
- **Missing connection:** _not identified_
- **Database:** None.
- **Effort:** trivial · **Value:** low · **Complete:** complete · **Confidence:** high

### `src/components/ui/index.ts`
- **What it does:** The UI primitives barrel — re-exports ChartShell, ChartTooltip, ChartLegend, and CHART_PALETTE so consumers can import all four from '@/components/ui' in one line.
- **Missing connection:** Trivially fixed the moment any of the three re-exported chart primitives gets a real call site (see chart-shell.tsx / chart-tooltip.tsx / chart-legend.tsx rows) — the barrel itself needs no separate work.
- **Database:** none
- **Effort:** trivial · **Value:** low · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/crm/components/tasks/TasksDueWidget.tsx`
- **What it does:** A self-contained 'Tasks due today' panel: fetches the current admin's due-by-EOD tasks across all coaches, buckets them into overdue/today/no-date with a red 'N overdue' badge, shows a priority dot per task, lets the user one-click complete a task (optimistically removes it from the list), and can navigate to the associated coach on click.
- **Missing connection:** Mount `<TasksDueWidget onSelectCoach={...} />` somewhere reached — natural spots are the Overview/CRMDashboard tab as a sidebar panel, or swap it in for InboxView's inline tasks column (would need InboxView to stop hand-rolling dueTasks and instead render this component, or the two feeds reconciled).
- **Database:** crm_tasks (read via listMyDueTasks server action in crm-foundations.ts, filtered byEod=true; write via completeCrmTask on complete)
- **Effort:** small · **Value:** low · **Complete:** complete · **Confidence:** high

### `src/components/ui/chart-legend.tsx`
- **What it does:** ChartLegend + CHART_PALETTE — a canonical swatch+label legend row plus a shared 5-role data-viz color vocabulary (you/team/pgaTour/highlight/alert) mapped onto design tokens, meant to replace inline hex color arrays scattered per chart.
- **Missing connection:** GenomeCompareView.tsx and FairwayExpenseSummary.tsx (src/components/fairway/pages/coachhelm/ and .../travel/) each hand-roll their own legend row; either could import { ChartLegend } from '@/components/ui' — but CHART_PALETTE resolves --color-primary-600/--color-warm-600, not Fairway's fw-* token set, so wiring it into Fairway surfaces first needs the palette remapped onto fw-* tokens or it will visually clash.
- **Database:** none
- **Effort:** small · **Value:** low · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/shared/AdminCard.tsx`
- **What it does:** Generic glass-card wrapper (variant: default/stat/alert/section, with accent colors) meant to DRY up the repeated 'glass-standard rounded-2xl p-6' className pattern hand-written across nearly every card in this cluster.
- **Missing connection:** Not a route/data fix — would need to be adopted as the base wrapper by future card components; a refactor opportunity, not a missing user-facing feature.
- **Database:** None.
- **Effort:** n/a · **Value:** low · **Complete:** complete · **Confidence:** high

### `src/app/golf/admin/components/shared/CrossTabLink.tsx`
- **What it does:** Generic 'jump to another tab' link with an arrow icon and onNavigateTab callback.
- **Missing connection:** _not identified_
- **Database:** None.
- **Effort:** n/a · **Value:** low · **Complete:** complete · **Confidence:** high

---

## Paired capabilities — code AND database both built, neither connected

Four items are one feature seen from two sides: the write/read code exists,
unimported; the table it targets exists, empty. Treat each pair as a single
build-vs-ship decision, not two separate findings.

### 1. Baseball player development metrics — the cleanest pairing, and the most misleading at first glance
- **Code:** `src/app/baseball/actions/development-metrics.ts` — `snapshotPlayerDevelopmentMetrics`, `snapshotTeamDevelopmentMetrics`, `getPlayerDevelopmentSnapshot`. Zero real importers.
- **Database:** `baseball_player_development_metrics` — 0 rows, confirmed live.
- **What looked true and wasn't:** the first pass said the only gap was a missing `uq_baseball_dev_metric_snapshot` UNIQUE constraint (migration `20260624000080` defines it under `CREATE TABLE IF NOT EXISTS`, which most likely no-opped against a pre-existing table). Two skeptic passes went further and found the live table's actual columns — `id, team_id, player_id, metric_key, metric_value, metric_context, measured_at, source_refs, visibility, created_at` (10 columns) — bear almost no resemblance to the 18-column shape (`metric_group, data_context, as_of_date, window_label, value_numeric, sample_size, confidence, trust_tier, source_id, computed_at`, etc.) the migration and the action code both assume. The very first call to any of the three actions fails on "column does not exist," not an ON CONFLICT error. A third pass found the live RLS SELECT policy has no player-self clause at all (`is_baseball_team_staff(team_id)` on all four CRUD policies) — so even after the schema is fixed, the player-facing read stays dead until a policy is added too.
- **Real fix, in order:** (1) a migration to reconcile the live table to the shape the code expects, or a rewrite of the three actions against the live 10-column shape — this is a schema decision, not a one-line ALTER TABLE; (2) an RLS policy for player-self reads; (3) then wire a caller (Stats Center "Recompute" button, an Inngest scheduled job — baseball currently has zero registered Inngest functions — and a player-facing read surface). This is a genuine unshipped feature, but "large" effort, not "medium" — do not scope it as a quick win.

### 2. Admin People/System RPC layer — real RPCs, wrong parameter names
- **Code:** `admin-people-data.ts`, `admin-system-data.ts` — zero real importers.
- **Database:** the RPCs they call are real and correctly permissioned, but two are called with the wrong argument name: `admin-people-data.ts:112` calls `get_user_engagement_summary({ period_days: 30 })` against a live signature of `(time_range_days integer)`; `admin-system-data.ts:192` calls `get_api_performance_summary({ period_days: 7 })` against a live signature of `(days_back integer)`. Both fail `PGRST202` today.
- **Also relevant:** the tables underneath are a mix — `background_job_logs` = 17,855 rows (real, active) vs. `error_rate_hourly` / `auth_metrics_hourly` = 0 rows each (an hourly-rollup pipeline that was designed for but never built or scheduled).
- **Real fix:** rename the two parameters, *then* wire `PeopleTab.tsx` / `SystemTab.tsx` to call these files instead of the old monolith. Wiring before the rename ships a broken panel that will read as a regression, not a feature.

### 3. `golf_platform_metrics_daily` ↔ `admin-bi-data.ts`
Same shape as #2: `getEnhancedBIData()` has zero external callers, and its
target table `golf_platform_metrics_daily` holds 0 rows in production —
both sides of one unshipped platform-metrics feature. `BusinessIntelligenceTab.tsx`
does not import it despite being lazy-loaded via `next/dynamic`.

### 4. Golf ↔ Arccos ingest pipeline — the single highest-value item found across the whole exercise, not in the assigned file list
Flagged by the parallel pairing pass, cited here because it changes the
priority order: `api/cron/v3/ingest-sync/route.ts` and
`v3/ingest/providers/arccos.ts` are a complete cron + OAuth-refresh + sync
pipeline for pulling shot data from Arccos — fully built, with **no
INSERT/UPSERT into `golf_ingest_connections` anywhere in the repo**, so
nothing can ever create the row that starts a sync. This is not a code fix;
it needs a "connect your Arccos account" UI surface that does not exist yet.
Worth a look even though it fell outside this run's assigned file list.

### 5. `v3/llm.ts` hero_narrative — a feature that shipped, then lost its trigger
`generateHeroNarrative` has zero callers today, but
`golf_coachhelm_llm_calls` shows 186 real `task='hero_narrative'` rows,
most recent **2026-07-19** — then nothing. `HeroNarrativeCard` (its only
confirmed prior caller) was deleted 2026-08-18 in favor of
`PlayerCoachHelmHome`'s deterministic `formatPredictionHero()`, which drops
the LLM-composed contextual sentence. This is a genuine regression
candidate for the Superseded table below, not a "never shipped" story — something
that called this function was removed roughly four weeks before the file
itself was deleted, and no one traced what that intermediate caller was.

### 6. Practice Rx (`v3/practice-rx.ts` / `v3/team-practice-rx.ts`)
`golf_drills` (63 rows) and `golf_goals` (19 rows) are both live, but read
by the shipped, simpler `drills.ts` / `PracticeRxPanel.tsx` path — not by
these two files. The v3 versions would produce a richer, LLM-composed
day-by-day plan; their only real callers are each other and their own
tests. The basic experience already ships, so wiring the LLM version is a
**product decision that changes UX**, not a fill-an-empty-panel fix — flag
it to the owner rather than wiring it silently.

### 7. `task-templates.ts` ↔ `golf_task_templates`
`golf_task_templates` holds 12 real rows, actively written by the *sibling*
file `tasks.ts`, which independently reimplements the same six CRUD
operations and is the one actually wired to the UI. Not a missing
connection — see the Superseded table for the three real capabilities
(`duplicateTemplate`, `getTemplatesByCategory`, `searchTemplates`) that
exist only in the dead file and were never ported to the live one.

### 8. Admin dashboard CRM cluster ↔ `crm_coaches` / `crm_coach_engagement` / `crm_contact_log`
These tables are heavily populated (2,401 / 2,318 / 1,317 rows) and the CRM
is a live, actively used product surface. The 7 dead CRM components in this
report are not missing functionality against that live data — each
affordance was checked against its replacement (see Superseded table).
`crm_tasks` holds 0 rows even in the *shipped* UI — that is a product fact
(no coach has created a CRM task yet), not a wiring gap; do not fold it
into `TasksDueWidget.tsx`'s classification.

---

## Data with no reader — populated tables nothing displays

This bucket is close to empty. Of 78 populated golf tables checked by the
parallel pairing pass, exactly **one** has no reader anywhere in the app:

- **`golf_course_tee_edit_history`** — 21 rows, real. Single write site:
  `src/app/golf/actions/course-library.ts:2005` (an audit-log insert on
  every tee edit). No review/history surface reads it back. Arguably
  correct to stay write-only for now — an edit-history audit log is
  routinely append-only until someone builds a "view edit history" panel —
  but flagging it here because nothing currently could show it even if the
  owner wanted to.

Four tables are dead on **both** sides (zero rows, zero code references,
no plausible in-flight feature either direction), cited from the parallel
pairing pass and independently re-verifiable by the same method used
elsewhere in this report: `golf_attendance_summary`,
`golf_coach_behavior_log`, `golf_practice_sessions`, `golf_review_events`.
These are not "data with no reader" (there is no data) — listed here only
so the two adjacent-but-different categories aren't conflated.

Everywhere else in the golf data layer, a populated table has *some* live
reader — the gap in this codebase runs overwhelmingly on the
display/action side, not the read side. Do not go looking for more
silent tables; this class was checked and came back almost empty.

---

## The cluster whose agent died — classified by hand

`investigate:coachhelm-v3-lib` failed on a rate limit and never ran, so its two
files were absent from every per-cluster report. Classified directly instead.

**Both are UNWIRED BY TRANSITIVITY, which is a distinct and easier case:** each
is imported, but *only* by an action this inventory already classifies as
UNWIRED. Neither needs a connection of its own. Wire the parent and the child
comes alive with it.

### `src/lib/coachhelm/v3/llm/hero-narrative.ts`
- **What it does:** `composeHeroNarrative()` — composes the one-line "hero"
  headline for the top-insight card on the player dashboard, with evidence and
  citation handling.
- **Sole importer:** `src/app/golf/actions/v3/llm.ts:21` — itself UNWIRED.
- **Also has a test:** `src/test/coachhelm/v3/hero-narrative.test.ts` covers the
  evidence/citation interaction, so the composer is exercised even though no
  product surface reaches it.
- **Missing connection:** none of its own. Inherits whatever wires `v3/llm.ts`.
- **Note:** the round-recap path references hero-narrative only in a comment
  (`round-recap.ts:149`), not as an import — a mention, not a call site.

### `src/lib/coachhelm/v3/practice-rx/area-metric-map.ts`
- **What it does:** `metricForArea()` — maps a skill area
  (driving/approach/short_game/putting/scoring) to its representative
  strokes-gained metric.
- **Sole importer:** `src/app/golf/actions/v3/team-practice-rx.ts:20` — itself
  UNWIRED, and already listed above with `TeamCategoryLeakBand.tsx` named as its
  mount point.
- **Missing connection:** none of its own. Inherits the team-practice-rx wiring.

**Why this class matters for the totals:** transitive orphans inflate any
dead-code count without adding work. Two of the 85 files here are not two
separate problems — they are two leaves of one unwired action. Expect more of
this shape among the 44.

---

## Superseded — check what the replacement dropped

This repo has a documented history of re-skins losing interaction
affordances. A superseded component is therefore not only a cleanup
candidate; it is **evidence about its replacement**.

| file | replaced by | capability lost? |
|---|---|---|
| `src/app/golf/actions/team-sg-baseline.ts` | **Not a code replacement — a product decision.** Commit `a0c1021b3` (2026-06-22) deliberately deleted the coach-selectable SG-baseline UI (`SgBaselineSelector`) from both settings surfaces and replaced it with automatic gender-based anchoring (PGA Tour for men's teams, LPGA for women's) — 'no coach selector' by design, per the commit's own message. `getTeamSgBaseline`/`setTeamSgBaseline` and the `recompute_team_sg` RPC are the orphaned server-side half of that killed feature. | **None — do not revive.** This one looked like the single cleanest 'please connect this' item in the whole batch (small, complete, correctly-authorized, DB-verified-dead: all 5 `golf_team_settings` rows have `sg_baseline = NULL`). It is not that. A first-pass skeptic caught that the feature itself had shrunk (2 options, not the 4-5 the file's stale docblock claims) but still called it UNWIRED; a second-pass skeptic caught the real story — wiring it back in would silently reverse a two-month-old, explicitly documented product decision. See Corrections below for both passes. |
| `src/app/baseball/(onboarding)/coach-onboarding/animations/variants.ts` | Superseded by the inline STEP_TRANSITION object in the current src/app/baseball/(onboarding)/coach-onboarding/page.tsx (introduced in commit b070bc83e, restyled again in cf6a247ae's Living Annual redesign), which now sources its easing curves from @/components/baseball/living-annual instead. | None found — the replacement motion (STEP_TRANSITION + the living-annual DUR/EASE_GLIDE/EASE_PRESS kit) covers the same enter/exit/stagger needs these variants provided; it is arguably richer (blur transitions, direction-aware slide) than the generic variants it replaced. |
| `src/app/baseball/(onboarding)/coach-onboarding/hooks/useOnboardingFlow.ts` | Superseded by the inline useState-based flow state in the current page.tsx (same b070bc83e rewrite, further evolved by cf6a247ae's Living Annual redesign and the later Lifting Lab step addition). | None found. The old SignUpAs step this hook coordinated redirected non-coaches to /baseball/player; confirmed src/app/baseball/(onboarding)/player/ still exists as its own route today, so role-based routing was relocated, not dropped. The hook is in fact behind the current implementation: it lacks the 'lifting' step that shipped later and still encodes the 'plan-selection' step that was deliberately removed (per the #471 comment in current page.tsx), so reconnecting it as-is would regress the flow rather than complete it. |
| `src/app/golf/(dashboard)/dashboard/analytics/coachhelm/EffectivenessRetryButton.tsx` | superseded by the built-in retry affordance inside src/components/fairway/pages/coachhelm/FairwayEffectiveness.tsx (the component now mounted at the redirect's destination as the 'effectiveness' drill) | None — FairwayEffectiveness.tsx has its own equivalent-or-better mechanism: a dismissible InlineNotice with a 'Try again' button wired to handleRefresh(), backed by a useTransition isPending state (lines ~380-556 of that file), covering both the SSR-load-undefined case and subsequent client refresh failures. |
| `src/app/golf/(dashboard)/dashboard/my-development/LogProgressButton.tsx` | superseded by the LogProgressDrawer + handleComplete/handleReopen logic inline in src/components/fairway/pages/coachhelm/FairwayMyDevelopment.tsx | None — capability was gained, not lost: the replacement adds client-side value-range validation (rejects negative/absurdly-large numbers before the round trip), and adds an Undo/reactivate affordance on the toast after marking complete (calls reactivateFocusArea), which the legacy MarkCompleteButton did not have. |
| `src/app/golf/actions/courses.ts` | Superseded by src/app/golf/actions/course-library.ts, which uses a richer tee-based schema (golf_course_tees, golf_course_tee_holes, golf_course_edit_history, golf_course_tee_edit_history, soft-delete via deleted_at) instead of the flat golf_course_holes this file writes to. | None. Verified live: golf_course_holes (the table this file's getCourseWithHoles/createCourse/updateCourse read and write) holds 0 rows in production (checked via Supabase MCP), confirming nothing depends on this file's data path — the tee-based schema fully replaced it. The file's own docblock also flags updateCourseImpl's original DELETE-then-INSERT-on-holes pattern as the destructive-write anti-pattern that course-library.ts's stage-and-swap (updateTee) was built to avoid; course-library.ts is the safer implementation, not a degraded one. |
| `src/app/golf/actions/stats.ts` | Read side superseded by src/app/golf/actions/stats-data.ts (getStatsSummary, getDetailedStats, getSprayChartData, getTrendAnalysis, getTeamComparison, getFilterOptions, getPlayerRoundOptions, getCourseBreakdown, getWorstHoleAnalysis, getPlayerStrengthsWeaknesses, getCoachRosterStats — a fully disjoint, larger export set), consumed by StatsSpineStage.tsx, FairwayPlayerStats.tsx, and the round-review page. Write/invalidation side (onRoundCompleteAction, markStatsStaleAction) is bypassed: src/app/golf/actions/golf.ts calls invalidateOnRoundComplete() from the underlying lib directly (4 call sites, e.g. golf.ts:1960, 7334, 7556) rather than through this file's auth-wrapped action. | None found. golf.ts's direct lib calls run inside an already-authenticated server-action context, so stats.ts's extra ownership check (verifyPlayerOwnershipOrCoach) is redundant there, not missing. stats-data.ts's export set is a superset of what a stats dashboard needs; no distinct capability of stats.ts (e.g. getPlayerStatsDirectAction's 'no-cache fallback') was found consumed anywhere that stats-data.ts doesn't already cover via getDetailedStats. |
| `src/app/golf/actions/task-templates.ts` | Functionally overlapped, not chronologically superseded, by src/app/golf/actions/tasks.ts's own getTaskTemplates/createTaskTemplate/updateTaskTemplate/deleteTaskTemplate/createTaskFromTemplate/seedDefaultTemplates, which is the version actually wired to the UI. | Real gaps in the wired tasks.ts version vs this file: duplicateTemplate (clone an existing template), getTemplatesByCategory, and searchTemplates (text search across templates) have no equivalent in tasks.ts and no UI anywhere calls them. permanentlyDeleteTemplate is NOT a real extra capability — its own implementation is `return deleteTemplate(id)` verbatim (comment: 'same as deleteTemplate since soft-delete doesn't exist'). getRecurringTemplatesDue/processRecurringTemplates are self-documented stubs ("Recurring functionality is not implemented in current DB schema... Return empty array since recurring templates aren't supported yet") — genuinely ABANDONED, not a dropped affordance. |
| `src/app/golf/actions/v3/focus-area-progress.ts` | Superseded by src/lib/golf/progress-drivers.ts (evaluateAndPersistFocusAreas / runFocusAreaProgressForPlayers) | None — the file's own header states this was a straight security-motivated relocation (removing an unauthenticated 'use server' surface with createAdminClient RLS bypass), not a feature re-skin. The replacement is called from the same two production call sites (background job in golf.ts, cron route) a live focus-area feature needs. |
| `src/app/golf/actions/v3/goal-progress.ts` | Superseded by src/lib/golf/progress-drivers.ts (evaluateAndPersistGoals / runGoalProgressForPlayers) | None — same straight relocation as focus-area-progress.ts, same live call sites preserved. |
| `src/app/golf/admin/components/ActivityFeed.tsx` | src/app/golf/admin/components/overview/RecentActivityFeed.tsx | ActivityFeed additionally subscribes to useAdminRealtimeContext() for live-push updates and offers a 5-way category filter; did not confirm whether RecentActivityFeed also does realtime updates, so this specific loss is unconfirmed rather than proven. |
| `src/app/golf/admin/components/CohortRetentionMatrix.tsx` | inline CohortHeatmap() in src/app/golf/admin/components/BusinessIntelligenceTab.tsx:639 | None found — same weekly-cohort concept with similar color-banding; BI's version sits inside a fuller retention section with D1/D7/D30 comparisons alongside it. |
| `src/app/golf/admin/components/CriticalAlertsBanner.tsx` | src/app/golf/admin/components/overview/NeedsAttentionSection.tsx | NeedsAttentionSection has no per-item dismiss at all — CriticalAlertsBanner's localStorage-persisted dismiss (DISMISSED_KEY) let an admin hide a resolved-but-still-listed item; that affordance is gone in the live version. |
| `src/app/golf/admin/components/GrowthTab.tsx` | src/app/golf/admin/components/BusinessIntelligenceTab.tsx | BI tab only rebuilt the cohort-retention panel (as an inline CohortHeatmap under the same section title). It has no equivalent for: platform health score / npsProxy stat cards, the engagement funnel, session/page-view analytics, dead-feature detection, the AI-ROI card, or the tab-aware narrative InsightCallout — 5 of 6 panels have no home anywhere in the shipped product. |
| `src/app/golf/admin/components/NeedsAttention.tsx` | src/app/golf/admin/components/overview/NeedsAttentionSection.tsx (via CriticalAlertsBanner.tsx as an intermediate generation) | None beyond what CriticalAlertsBanner.tsx already lacks relative to the live version. |
| `src/app/golf/admin/components/StatCardV2.tsx` | src/app/golf/admin/components/AdminStatCard.tsx | StatCardV2 additionally offers onClick (click-through) and an isLive badge, which AdminStatCard has neither of — minor, not blocking. |
| `src/app/golf/admin/components/shared/NarrativeCallout.tsx` | inline callout block in BusinessIntelligenceTab.tsx's FunnelSection | None — same visual pattern, just not componentized (a DRY/code-quality gap, not a missing feature). |
| `src/app/golf/admin/crm/components/ContactLogModal.tsx` | View-history half superseded by CoachTimeline.tsx (built later, 2026-04-28, merges contact_log + email_events + replies); add-log half duplicated by QuickActionsPanel.tsx. | The inline 'Update Status (optional)' dropdown directly inside the same log-entry form is a minor UX convenience not present in QuickActionsPanel's log form (status change there is a separate control in the same modal, not the same form) — cosmetic, not a missing capability. |
| `src/app/golf/admin/crm/components/PipelineStats.tsx` | Superseded by src/app/golf/admin/crm/components/CRMDashboard.tsx's funnel/quick-stats section (reached, wired as the Overview tab). | One specific metric — the standalone 'Conversion %' tile (won / total coaches) — does not appear anywhere in CRMDashboard.tsx or elsewhere I found reached; everything else (funnel breakdown, hot leads, follow-ups due, division split) is present and CRMDashboard's division breakdown is strictly more general (all divisions, not hardcoded D2/D3). |
| `src/app/golf/admin/crm/components/QuickActionsToolbar.tsx` | Superseded by CRMDashboard.tsx (onboarding banner half) and QuickActionsPanel.tsx (single-coach log-contact half), both reached and wired. | None found — the file's own comment claims it 'replaces old QuickActionsPanel for inline use,' but QuickActionsPanel is the one that's actually live and is the richer of the two (also handles scheduling, notes, status, priority in the same modal, which QuickActionsToolbar's single-coach mode does not). |
| `src/components/ui/chart-shell.tsx` | src/components/fairway/charts/ChartFrame.tsx (21 real usages; adds skeleton/empty/insufficient-data/error state machine, a 'view as table' a11y toggle, and role=img + aria-label takeaway — none of which ChartShell has) | None found — ChartFrame is a strict superset of ChartShell's documented API (title/subtitle/actions/mobile pivot all present, plus more). |
| `src/components/ui/chart-tooltip.tsx` | src/components/fairway/charts/ChartTooltip.tsx (5 real usages; adds a built-in RechartsTooltip adapter and an inline prefers-reduced-transparency fallback) | None found. |
| `src/components/ui/progress-ring.tsx` | src/components/fairway/charts/RadialGauge.tsx and src/components/fairway/charts/Dial.tsx | RadialGauge/Dial require the heavier InstrumentPanel wrapper and a goodDirection concept — they are not a drop-in for a simple standalone '72% complete' ring outside the CoachHelm instrument-panel context (e.g. a plain settings/onboarding progress indicator), so a real (if narrow) gap remains for that lightweight case. |
| `src/components/ui/secondary-nav.tsx` | src/components/fairway/app-shell/FairwayHubSubNav.tsx (for golf hub sub-navigation) and src/components/fairway/pages/coachhelm/CoachHelmSubNav.tsx (for the CoachHelm cluster) | FairwayHubSubNav is hard-bound to GolfSubTab/nav-registry.ts, so it cannot serve an arbitrary {label,href} list. The OTHER use cases secondary-nav.tsx's own docstring named — CRM's Pipeline/Inbox/Sequences/Insights/Settings tabs, and Settings' Account/Notifications tabs — are NOT served by FairwayHubSubNav and still hand-roll ad hoc tab bars: confirmed at src/app/golf/admin/crm/page.tsx:1453 (`aria-current={isActive ? 'page' : undefined}` on a bespoke, non-primitive tab). So the file is dead, but the generic-tab-bar gap it targeted is still open outside golf hubs. |
| `src/components/ui/segmented-control.tsx` | src/components/fairway/controls/segmented.tsx (SegmentedControl export only) | None for SegmentedControl — fairway/controls/segmented.tsx is a strict superset (Radix a11y engine, animated pill, WCAG touch targets). The file's SECOND export, Pressable, has no replacement at all: it rides inside this otherwise-dead file as its own small orphan. Baseball built a differently-shaped utility instead (pressableClass(), a className-string generator in src/components/baseball/living-annual/pressable.ts, not a component), so Pressable itself should be tracked separately as UNWIRED if the file is ever deleted for the SegmentedControl reason alone. |
| `src/components/ui/shimmer.tsx` | src/components/fairway/feedback/Skeleton.tsx (Skeleton/SkeletonText/SkeletonCard/SkeletonStat/SkeletonList) | None found — Fairway's Skeleton system has more composed variants and an a11y announce contract shimmer.tsx does not. |
| `src/components/ui/sparkline.tsx` | src/components/fairway/charts/Sparkline.tsx and src/components/fairway/charts/EkgSparkline.tsx | None found — both handle the <2-point edge case (ui/sparkline.tsx returns null; Fairway's shows an explicit honest em-dash, arguably better) and both carry an accessible trend description. |
| `src/components/ui/status-pill.tsx` | src/components/fairway/controls/status-pill.tsx | Fairway's status-pill.tsx has no `icon` prop, no `xs` size, and no `aria-live` support — all three exist in ui/status-pill.tsx and would be lost if this file were deleted without porting them forward. |
| `src/lib/middleware/rate-limit.ts` | superseded by inline checkRateLimit(...) + manual 429 response now written directly in log-error/route.ts | None — log-error/route.ts reimplements the same 429/Retry-After response shape inline against the new limiter. |
| `src/lib/rate-limit.ts` | superseded by src/lib/auth/rate-limit.ts + src/lib/auth/action-rate-limit.ts + src/lib/auth/supabase-rate-limit.ts | None — the replacement is strictly better (survives serverless cold starts/multi-instance, durable via Upstash-or-DB). The one latent duplication is that `getClientIdentifier`'s x-forwarded-for/x-real-ip parsing logic is now hand-copied inline at 15+ call sites (auth.ts x4, demo-access.ts x2, onboarding.ts, callback/route.ts x4, log-error/route.ts, signup-gate.ts, book-call/route.ts, admin/log-event/route.ts) instead of being centralized — but log-error/route.ts's own comment treats this as a deliberate choice ('rewriting the parsing here would be a guess at a platform contract'), not an oversight, so this is an observation, not a missing connection. |

---

## Safe to remove — ABANDONED only

Split by product, per standing owner directive: **nothing in golf gets
deleted without your review** — the golf table below is documentation
only, not a deletion list. Baseball deletion is pre-authorized (seed data
nobody uses), but there is nothing to delete in this run's scope — see
below.

### GOLF — document only, review before any deletion

| file | what it was | why abandoned |
|---|---|---|
| `src/app/golf/actions/player-effectiveness.ts` | Would compute a player-facing 'how much has CoachHelm helped you' summary: total insights, how many were resolved, how many led to measured improvement, total strokes saved per round, and the top 3 resolved insights by stroke impact — the player-side mirror of the coach's CoachHelm Effectiveness page. | grep -rln getPlayerEffectiveness across src/**/*.ts(x): zero hits outside the file. Confirmed no dynamic import, no CommandPalette/surface-registry entry, no pa |
| `src/app/golf/admin/components/LiveActivityFeed.tsx` | Generic presentational activity-feed primitive (events: ActivityEvent[], click/load-more callbacks), no direct AdminDashboardData binding. | Zero importers outside its own file and the dead index.ts barrel. Name-collides with an unrelated src/app/golf/admin/crm/components/resend/LiveActivityFeed.tsx  |
| `src/app/golf/admin/components/index.ts` | Barrel re-export of AdminStatCard, the AdminChart family, StatCardV2, HealthRing, DetailModal, LiveActivityFeed, and AlertBanner. | grep for imports of this barrel path ('./components' or '@/app/golf/admin/components' from outside the directory) returns zero hits anywhere in src/. Every cons |
| `src/app/golf/admin/components/shared/index.ts` | Barrel re-export of the 7 shared/ primitives (AdminCard, CrossTabLink, DateRangePicker, NarrativeCallout, StatusBadge, LifecycleBadge, EngagementScore). | grep for imports of './shared' from within admin/components or admin/components/* returns zero hits; the './shared' hits found elsewhere (crm/resend/*, baseball |
| `src/components/golf/coachhelm/player/index.ts` | A barrel re-export file for three player CoachHelm cards: CompositeRatingCard, ShotAnalysisCard, WhatIfPanel. Its comments double as a removal log for prior exports (PerformancePrediction, AIInsightsPanel, FocusAreasGrid, TrendDashboard) deleted across earlier Fairway refactors. | grep for imports from the bare directory path '@/components/golf/coachhelm/player' (which would resolve to this index.ts): zero hits. All three real consumers b |

### BASEBALL — deletion authorized, nothing qualifies here

**Zero baseball files in this run's assigned scope are ABANDONED.** The
three baseball files reviewed — `coach-onboarding/animations/variants.ts`,
`coach-onboarding/hooks/useOnboardingFlow.ts` (both SUPERSEDED by a later
onboarding rewrite, see the Superseded table), and
`baseball/actions/development-metrics.ts` (UNWIRED, but see "Paired
capabilities" above — the schema mismatch makes this a real build, not a
quick wire) — are all removable-or-recoverable, not abandoned stubs. If a
baseball-specific abandoned-code sweep exists elsewhere (e.g.
`DEAD_BASEBALL_CODE.md` in this directory, produced by a separate session
not covered by this report), treat it as independent work — it was not
verified as part of this synthesis and its claims are not repeated here.

---

## Uncertain — do not act on these without a closer look

One file is a false alarm; the other three are genuinely unresolved
(instruments disagreed and the deciding evidence wasn't found). Don't round
either kind toward a confident verdict.

- **`src/lib/types/table.ts` — ACTUALLY_REACHABLE, not dead.** grep confirms a real, direct one-hop importer: `src/components/ui/row-actions-menu.tsx:7` (`import type { RowAction } from '@/lib/types/table'`). By knip's literal "has an importer" test this file is reachable — but that one importer is itself unreached (see `row-actions-menu.tsx` in the Wire-these list above), so this type is alive-but-dead-in-practice: correct only inside a component nobody renders.
- `src/app/golf/admin/components/AlertBanner.tsx` — UNCERTAIN. Generic dismissible, auto-dismissing alert-banner UI with a paired `useAlerts` state hook. Zero importers outside its own file and a dead barrel. Possibly superseded by the live `useAdminAlerts`/`AdminToastProvider` toast pipeline, but that pipeline uses a structurally different `Alert` type — not confirmed as a true replacement, just a plausible reason this was abandoned. Small effort, low value either way.
- `src/app/golf/admin/components/shared/DateRangePicker.tsx` — UNCERTAIN. Generic date-range selector: 7d/14d/30d/90d presets plus a custom from/to date picker. No interactive date-range filtering exists anywhere in the mounted admin dashboard, so this may be a real missing capability — but no action file was found that accepts a date-range parameter, meaning wiring it would need a backend query change too, not just a mount. Medium effort if genuinely wanted.
- `src/components/ui/shine-effect.tsx` — UNCERTAIN. A 24-line decorative top-edge specular-gradient div. Zero importers anywhere. `glass-surface.tsx`'s own doc comment describes "a specular top sheen" as one of its baked-in visual ingredients — near-identical language — suggesting the effect may have been absorbed directly into that component's CSS rather than composed via this droppable primitive, but the specific gradient rule was never located inside `glass-surface.tsx` to confirm the mechanism. Trivial either way — this is the lowest-stakes item in the whole inventory.

---

## Skeptic corrections (31)

Each investigator was attacked by two skeptics whose job was to find their
mistakes. These are the ones that landed — shown so you can see which parts
of the analysis corrected themselves.

- **`src/app/baseball/actions/development-metrics.ts`** — claimed: "the write actions are not just unwired — they are one call away from throwing 'no unique or exclusion constraint matching the ON CONFLICT s
  - actually: The live `baseball_player_development_metrics` table does not merely lack the UNIQUE constraint — it has a completely different, unrelated column set from what migration 20260624000080 defines and what the action code reads/writes. Live `information_schema.col (`Live query via Supabase MCP execute_sql, 2026-08-19: `select column_name, data_type from information_schema.co`)
- **`src/app/baseball/actions/development-metrics.ts`** — claimed: Scope limits state "No RLS policy behavior was exercised... the policies were only read from the migration source and confirmed enabled via 
  - actually: Live `pg_policies` for the table shows 4 policies (insert/select/update/delete), and ALL FOUR gate on `is_baseball_team_staff(team_id)` with no player-self clause — there is no policy variant like `OR (player_id = <own> AND visibility = 'player_visible')`. `ge (`Live query via Supabase MCP execute_sql, 2026-08-19: `select policyname, cmd, qual, with_check from pg_policie`)
- **`src/app/baseball/actions/development-metrics.ts`** — claimed: missing_connection: (1) DATABASE — ... a new migration must add it (e.g. `ALTER TABLE baseball_player_development_metrics ADD CONSTRAINT uq_
  - actually: That exact ALTER TABLE cannot execute against the live table: `data_context` and `as_of_date` are not columns on it at all (confirmed via `information_schema.columns` for `public.baseball_player_development_metrics`: the live columns are id, team_id, player_id (`Live query: select column_name,data_type from information_schema.columns where table_name='baseball_player_dev`)
- **`src/app/baseball/actions/development-metrics.ts`** — claimed: class=UNWIRED complete=partial conf=high ... missing_connection: ... (2) CALLERS — none exist yet: add a 'Recompute development metrics' act
  - actually: Fails the task's own UNWIRED test ('if it references a table or column that was dropped ... it is ABANDONED and wiring it would fail'). The write path in toSnapshotRow (development-metrics.ts:90-105) builds an upsert payload with 14 keys — team_id, player_id,  (`development-metrics.ts:90-105 (toSnapshotRow, full payload) and :296-298 (select column list) vs. live informa`)
- **`src/app/baseball/actions/development-metrics.ts`** — claimed: 'getPlayerDevelopmentSnapshot — the PLAYER-side read. A player sees ONLY their own rows whose visibility = 'player_visible' (RLS enforces it
  - actually: Live RLS for this table does not match that documented contract. `select policyname,cmd,qual,with_check from pg_policies where tablename='baseball_player_development_metrics'` returns exactly 4 policies (SELECT/INSERT/UPDATE/DELETE), all gated solely by `is_ba (`Live query: select policyname,cmd,qual,with_check from pg_policies where tablename='baseball_player_developmen`)
- **`src/app/golf/actions/task-templates.ts`** — claimed: does: '...seed default templates, filter templates by category, search templates by text, and a recurring-template due/process pipeline mean
  - actually: The recurring-template pipeline is not a real capability — it is a permanent no-op stub, and describing it among the file's capabilities overstates what the file does. getRecurringTemplatesDueImpl unconditionally returns an empty array because the underlying r (`src/app/golf/actions/task-templates.ts:697-699, code comment on getRecurringTemplatesDueImpl: 'The database sc`)
- **`src/app/golf/actions/team-sg-baseline.ts`** — claimed: Lets a coach choose which Strokes-Gained benchmark their team's SG is measured against (PGA Tour, Women's, Scratch, D1/D2/D3)
  - actually: The code no longer supports Scratch or D1/D2/D3 baselines. Migration 20260622130000_pga_lpga_only_sg_baselines.sql (2026-06-22) collapsed the system to exactly 2 selectable values, and its own comment states the intent explicitly: 'Every team now anchors its s (`src/lib/golf/sg-benchmarks.ts:83-98 (comment: 'division (D1/D2/D3) and scratch scales were removed 2026-06-22 `)
- **`src/app/golf/actions/team-sg-baseline.ts`** — claimed: class=UNWIRED complete=complete conf=high ... 'the class the owner is actually looking for: a small, complete, correctly-authorized, DB-veri
  - actually: This is SUPERSEDED (functionally killed by an explicit, documented product decision), not UNWIRED. The coach-selectable baseline UI (SgBaselineSelector) existed, was wired into both settings pages, and was deliberately deleted on 2026-06-22 in favor of automat (`Commit a0c1021b3 (2026-06-22), subject line 'feat(sg): PGA/LPGA-only strokes-gained baselines — kill NCAA D1/D`)
- **`src/app/golf/admin/components/ActivityFeed.tsx`** — claimed: Stated scope limit: 'did not confirm RecentActivityFeed also subscribes to useAdminRealtimeContext for live-push updates the way ActivityFee
  - actually: Confirmed, not unconfirmed: RecentActivityFeed.tsx (the mounted component) imports only `useMemo`, `useState`, `AdminDashboardData`, `cn`, and `Button` -- no realtime hook at all, making it a pure static render of the `activity` prop. ActivityFeed.tsx (the orp (`src/app/golf/admin/components/ActivityFeed.tsx:19,144-149 (useAdminRealtimeContext import and use); src/app/go`)
- **`src/app/golf/admin/components/ActivityFeed.tsx`** — claimed: class=SUPERSEDED conf=medium, with a stated scope limit: 'did not confirm RecentActivityFeed also subscribes to useAdminRealtimeContext for 
  - actually: This resolves their own flagged open question, and the answer changes what SUPERSEDED implies here. ActivityFeed.tsx imports and calls useAdminRealtimeContext() to merge live realtime.events into the timeline as they arrive and shows a live 'Realtime connected (`ActivityFeed.tsx:19 (import useAdminRealtimeContext), :144 (const { realtime } = useAdminRealtimeContext()), :`)
- **`src/app/golf/admin/components/CoachIntelligenceCard.tsx`** — claimed: CoachIntelligenceCard's 'natural data source is the get_coach_effectiveness_metrics() Postgres RPC' (via admin-people-data.ts's CoachEffecti
  - actually: Wrong data source and wrong wiring plan. CoachIntelligenceCardProps.coaches[] (id, name, teamName, totalPlayers, roundsReviewed, totalPlayerRounds, reviewRate, avgResponseTimeHours, insightsViewed, lastActiveAt, philosophyConfigured) is an EXACT field-for-fiel (`src/app/golf/actions/admin-data.ts:618-630 (coachIntelligence field definition, exact-match shape), :3894 (ret`)
- **`src/app/golf/admin/components/ComparativeBenchmarks.tsx`** — claimed: class=UNCERTAIN complete=unknown conf=medium; 'Its exact prop shape (teamComparisons/playerTrends/aiCorrelation) was not found as a return t
  - actually: The data source exists verbatim. AdminDashboardData.benchmarks.{teamComparisons, playerTrends, aiCorrelation} is a field-for-field, type-for-type exact match to ComparativeBenchmarksProps, including nested shapes (playerTrends[].scoringHistory: {month,avg}[]). (`src/app/golf/actions/admin-data.ts:673-676 (benchmarks field, exact shape), :3899 (returned); src/app/golf/adm`)
- **`src/app/golf/admin/components/ComparativeBenchmarks.tsx`** — claimed: class=UNCERTAIN complete=unknown: 'Its exact prop shape (teamComparisons/playerTrends/aiCorrelation) was not found as a return type in admin
  - actually: The data source exists and matches exactly. AdminDashboardData.benchmarks is `{ teamComparisons: {...}[], playerTrends: {...}[], aiCorrelation: {...} }` — every field, every type, matches ComparativeBenchmarksProps verbatim. It is fully computed (not stubbed)  (`AdminDashboardData.benchmarks type: src/app/golf/actions/admin-data.ts:673-677; returned via rollupC.benchmark`)
- **`src/app/golf/admin/components/CriticalAlertsBanner.tsx`** — claimed: class=SUPERSEDED conf=high; lineage 'this file (v1: NeedsAttention.tsx) -> CriticalAlertsBanner.tsx (v2, adds dismiss+banner) -> overview/Ne
  - actually: NeedsAttentionSection.tsx (the mounted 'v3') is NOT a superset -- it dropped CriticalAlertsBanner's per-item, localStorage-persisted (24h expiry) dismiss capability entirely. NeedsAttentionSection.tsx is a 93-line file with zero useState/localStorage/dismiss r (`src/app/golf/admin/components/CriticalAlertsBanner.tsx:14 (DISMISSED_KEY localStorage), :49-70 (dismiss() + 24`)
- **`src/app/golf/admin/components/DataFreshnessAlerts.tsx`** — claimed: class=UNCERTAIN complete=unknown conf=medium; 'this may be a genuinely missing capability, but no action file was found that accepts a date-
  - actually: The data source exists verbatim. AdminDashboardData.freshnessAlerts.{churnRiskPlayers, inactiveTeams, disengagedCoaches} is a field-for-field exact match to DataFreshnessAlertsProps (same field names, same types, same nesting). Grep confirms zero consumers of  (`src/app/golf/actions/admin-data.ts:667-671 (freshnessAlerts field, exact shape); src/app/golf/admin/components`)
- **`src/app/golf/admin/components/DataFreshnessAlerts.tsx`** — claimed: class=UNCERTAIN complete=unknown: '...this component's three explicit, day-count-specific categories... Its exact prop shape's data source w
  - actually: The data source exists and matches exactly. AdminDashboardData.freshnessAlerts is `{ churnRiskPlayers: {...}[], inactiveTeams: {...}[], disengagedCoaches: {...}[] }` — field-for-field identical to DataFreshnessAlertsProps. It's fully computed under a `// FRESH (`AdminDashboardData.freshnessAlerts type: src/app/golf/actions/admin-data.ts:667-671; returned via rollupC.fres`)
- **`src/app/golf/admin/components/PlayerDropoffFunnel.tsx`** — claimed: class=UNWIRED complete=partial conf=medium; 'This component's own stuckUsers prop's data source was not located anywhere in admin-data.ts or
  - actually: The data source exists and is an exact match, already computed and already unused. AdminDashboardData.playerFunnel.stuckUsers (stage, users[{id, name, email, daysSinceSignup, lastActiveAt}]) is field-for-field identical to PlayerDropoffFunnelProps.stuckUsers.  (`src/app/golf/actions/admin-data.ts:632-648 (playerFunnel.stuckUsers, exact shape); src/app/golf/admin/componen`)
- **`src/app/golf/admin/components/PlayerDropoffFunnel.tsx`** — claimed: class=UNWIRED complete=partial: 'This component's own stuckUsers prop's data source was not located anywhere in admin-data.ts or the three n
  - actually: Both props are already computed, live, in the exact shape the component needs, and neither one is the field BI tab uses. AdminDashboardData.playerFunnel is `{ funnel: {stage,count,percentage,dropoffFromPrevious,dropoffPct}[], stuckUsers: {stage, users:[{id,nam (`AdminDashboardData.playerFunnel type: src/app/golf/actions/admin-data.ts:633-648; returned via rollupC.playerF`)
- **`src/app/golf/admin/components/SessionHeatmap.tsx`** — claimed: 'BusinessIntelligenceTab's ''Feature Adoption'' bar chart (line 745) covers feature-usage counts but has no session-level stats and no expli
  - actually: The 'deadFeatures, zero hits' claim is factually false. `deadFeatures` appears 5 times in BusinessIntelligenceTab.tsx's UsageSection, rendering a 'Dead Features Detected' warning box from `bi.usage.deadFeatures` -- the same `string[]` shape SessionHeatmap's ow (`src/app/golf/admin/components/BusinessIntelligenceTab.tsx:720-738 (u.deadFeatures rendered as 'Dead Features D`)
- **`src/app/golf/admin/components/StatCardV2.tsx`** — claimed: class=SUPERSEDED conf=high; 'the currently-mounted AdminStatCard.tsx... already has AnimatedNumber + AdminSparkline + accentColor styling --
  - actually: Incomplete comparison: StatCardV2 also has `onClick` (click-through navigation, with a tap animation) and `isLive` (a live-data badge) props/features. AdminStatCard.tsx has neither -- grep for onClick/isLive/href/Link in that file returns zero hits. The claime (`src/app/golf/admin/components/StatCardV2.tsx:19-20 (onClick, isLive props), :92-113 (usage, tap animation, liv`)
- **`src/app/golf/admin/crm/components/CoachDetailPanel.tsx`** — claimed: EngagementDetailDrawer.tsx finding says the missing-connection fix requires lifting {selectedCoachId, drawerOpen} state 'at each of Engageme
  - actually: CoachDetailPanel.tsx does not import or render EngagementBadge at all — grep shows exactly two hits, both stale comments ('EngagementBadge.tsx's table-cell pill...' and '...same formatRelative...'), no import statement. Following their instruction literally at (`grep -n "EngagementBadge" src/app/golf/admin/crm/components/CoachDetailPanel.tsx → lines 95 and 386 only, both`)
- **`src/app/golf/admin/crm/components/ContactLogModal.tsx`** — claimed: Its 'view history' half is subsumed by CoachTimeline.tsx (reached via CoachDetailPanel.tsx, which page.tsx renders) — crm-timeline.ts's getC
  - actually: CoachTimeline is richer in event types but narrower in fields for contact_log entries specifically: it drops the next_action/next_action_date follow-up note that ContactLogModal displayed per past log entry ('Next: {next_action} ({next_action_date})', ContactL (`src/app/golf/admin/crm/components/ContactLogModal.tsx:328-335; src/app/golf/actions/crm-timeline.ts contact_lo`)
- **`src/app/golf/admin/crm/components/PipelineStats.tsx`** — claimed: PipelineStats.tsx is class=SUPERSEDED, safe to remove: 'CRMDashboard.tsx ... contains an equivalent funnel-by-stage section ... plus its own
  - actually: PipelineStats.tsx's 'Conversion' stat tile computes an overall win-rate PERCENTAGE: (coaches with status==='won' / total coaches) * 100, rendered as e.g. '12.4%'. CRMDashboard.tsx has no equivalent anywhere — its closest tile, labeled 'Won', renders a raw COUN (`src/app/golf/admin/crm/components/PipelineStats.tsx:54-57 — `const conversionRate = useMemo(() => { const won `)
- **`src/app/golf/admin/crm/components/PipelineStats.tsx`** — claimed: class=SUPERSEDED complete=complete conf=high ... does: A standalone stats block: a 4-stage funnel (lead/active/closing/closed) with progress
  - actually: "complete" doesn't hold against the only object in the repo shaped to satisfy PipelineStatsProps.statusConfig — STATUS_CONFIG in crm-config.tsx (there's no live caller to observe, so this is the only real candidate for what would actually get passed in). STATU (`src/app/golf/admin/crm/crm-config.tsx:172 (`stage: 'new'`); src/app/golf/admin/crm/components/PipelineStats.ts`)
- **`src/app/golf/admin/crm/components/badges/EngagementBadge.tsx`** — claimed: EngagementDetailDrawer.tsx finding states EngagementBadge's coachId prop 'has been destructured as _coachId (deliberately unused) since the 
  - actually: Minor/non-material: EngagementBadge.tsx's own first commit is ab11f3c21 (2026-04-28, 'Phase 1 — foundations, engagement scoring, timeline, segments') — but EngagementDetailDrawer.tsx (the drawer) was first committed in a different commit, ac0084bb8 (2026-04-28 (`git log --diff-filter=A --format="%h %ad %s" --date=short -- src/app/golf/admin/crm/components/badges/Engageme`)
- **`src/app/golf/admin/crm/components/badges/EngagementDetailDrawer.tsx`** — claimed: grep of EngagementBadge.tsx (the actual badge, used in CoachTable.tsx, CoachDetailPanel.tsx, PipelineCard.tsx, CoachPageHeader.tsx) shows it
  - actually: CoachDetailPanel.tsx is not a real EngagementBadge call site — `grep -rn "EngagementBadge" src/ --include=*.tsx \| grep -v badges/EngagementBadge.tsx` shows only two comments there (lines 95, 386), no import and no JSX usage. The real reached call sites today  (`grep -rn "EngagementBadge" src/ --include=*.tsx \| grep -v badges/EngagementBadge.tsx → CoachTable.tsx:12,427,`)
- **`src/app/golf/admin/crm/components/pipeline/PipelineKanban.tsx`** — claimed: page.tsx imports `PipelineView` from './components/PipelineView' instead, which page.tsx wires at three call sites (lines 1709, 1730, 1749).
  - actually: There is exactly one `<PipelineView` render call in page.tsx, at line 1726, inside the `coachView === 'board'` branch — `grep -n "<PipelineView" src/app/golf/admin/crm/page.tsx` returns a single hit. The sibling `coachView === 'table'` and `coachView === 'conf (`grep -n "<PipelineView" src/app/golf/admin/crm/page.tsx → 1726:<PipelineView (single result); grep -rn "<Pipel`)
- **`src/app/golf/admin/crm/page.tsx`** — claimed: PipelineKanban.tsx finding states 'page.tsx currently renders <PipelineView .../> (imported line 58) at the Pipeline tab' and that PipelineV
  - actually: The import at line 58 is correct, but PipelineView has exactly one JSX render call site in page.tsx, not three. It sits at line 1725-1726, gated by `{coachView === 'board' && (<PipelineView ... />)}`. Lines 1709/1730/1749 don't correspond to a PipelineView ren (`grep -n "PipelineView" src/app/golf/admin/crm/page.tsx → '58:import { PipelineView } from ...' and '1726:     `)
- **`src/components/ui/reveal.tsx`** — claimed: In the reveal.tsx row, the prior agent wrote: "Confirmed golf hand-rolls the identical fade+slide-on-mount pattern (`initial={{ opacity: 0, 
  - actually: Two of the four cited example files do not contain the `opacity: 0, y: ...` pattern they are cited for. src/components/fairway/app-shell/RouteTransition.tsx:45-46 is `initial: { opacity: 0 }, animate: { opacity: 1 }` — an opacity-only crossfade, no `y` offset  (`src/components/fairway/app-shell/RouteTransition.tsx:45-46; src/components/fairway/charts/RadialGauge.tsx:249`)
- **`src/components/ui/row-actions-menu.tsx`** — claimed: "grep across all of src/ for 'RowActionsMenu': zero matches outside its own definition file. git log --all -p -- '*.tsx' '*.ts' \| grep RowA
  - actually: False. Running their exact cited command, `git log --all -p -- '*.tsx' '*.ts' \| grep -c RowActionsMenu`, returns 24 matches, not zero. RowActionsMenu was imported and rendered three times by src/components/ui/data-table.tsx — a generic reusable DataTable prim (`git show 54d461f8b -- '*.tsx' \| grep -n RowActionsMenu -B5 shows `-import { RowActionsMenu } from './row-acti`)
- **`src/components/ui/secondary-nav.tsx`** — claimed: missing_connection for secondary-nav.tsx: "src/app/golf/admin/crm/page.tsx's hand-rolled tab bar (around line 1453) is the clearest remainin
  - actually: That location is not a horizontal tab bar at all -- it's a vertical, collapsible, icon-based sidebar (variable name `sidebarCollapsed`, sections grouped under `NAV_SECTIONS`) whose active item is driven by local React state (`activeTab`, `setActiveTab`), not a (`src/app/golf/admin/crm/page.tsx:1446 (`const isActive = activeTab === tab.id;`, the vertical sidebar loop) and`)

---

## What this run could not see

- Did not check whether recompute_team_sg RPC is invoked from any other code path besides this file (only confirmed the RPC exists in the DB) — if some other flow calls it, the "never exercised" claim narrows to just the coach-facing setter, not the recompute mechanism itself. Did not verify RLS policies on golf_team_settings, golf_task_templates, or golf_course_holes — reachability was checked at t
- Read-only, shared checkout with four other active Claude sessions (main, dead-baseball, dead-golf, destructive-paths, p0-callsites, policy-86, policy-93) — no `next build`, no dev server, no route-level click-through verification was run; every UNWIRED/SUPERSEDED/ABANDONED call rests on static grep/git-history evidence plus one live Supabase read, not runtime observation. Git history for src/lib/r
- No `npm run typecheck` or `npm run build` was run (four other sessions share this checkout; per repo convention the greps/db queries below are treated as sufficient evidence for read-only reachability and schema-shape questions). Reachability conclusions are grep/git-log based, not a full TS program graph — a truly exotic reference (e.g. a template-literal-constructed import path) could theoretica
- I did not run `npm run typecheck` or `npm run build` — reachability and correctness are established by static grep/read across the whole repo (src/, docs/) plus a git-history read, not a compiler pass, so a type error introduced elsewhere that only surfaces at build time would not be caught here. I did not execute any of these components in a browser, so runtime-only failures (e.g. a prop mismatch
- Static analysis (grep/ripgrep across src, and for the two llm.ts function names across the whole repo) plus live prod SQL against golf_coachhelm_llm_calls/golf_drills/golf_goals via Supabase MCP — I did not run the app or click through the UI. "No importer" conclusions rest on text search, not a compiler-driven call graph, so a very indirect runtime-string dispatch could theoretically exist, thoug
- Did not diff ActivityFeed.tsx vs the mounted overview/RecentActivityFeed.tsx render body line-by-line — classified SUPERSEDED on matching prop shape and section purpose, but did not confirm RecentActivityFeed also subscribes to useAdminRealtimeContext for live-push updates the way ActivityFeed does, so a specific realtime-vs-static affordance gap is unconfirmed. Could not find a data source anywhe
- Reachability was verified with grep-based static/dynamic-import scans (validated against a known-good import, @/components/ui/button, as a sanity check) across src/ and, after the advisor flagged the gap, the whole repo including scripts/, tools/, and config files — not with a live knip run or an actual `next build`, so tree-shaking/bundle-inclusion was not independently confirmed. The five script

**One cluster's agent died and this document originally hid that.** The closing
paragraph below was written to say all 8 clusters ran. They did not:
`investigate:coachhelm-v3-lib` failed on a rate limit, and its two files were
absent from the entire document until they were classified by hand (see "The
cluster whose agent died", above). The claim was wrong in the direction of
looking more complete than it was — the same failure direction as every
instrument defect logged during this run.

**Structural limits beyond those:** this document was assembled directly
from the per-cluster investigator + two-skeptic-pass results for the 7
clusters that completed (golf admin dashboard, golf admin CRM, shared UI
primitives, golf v3 server actions, golf core server actions, baseball
onboarding + development metrics, miscellaneous orphans, plus the
cross-cutting code↔database pairing pass) — baseball onboarding IS
included, in full, above (`variants.ts`, `useOnboardingFlow.ts`,
`development-metrics.ts`). No separate top-level synthesis model reviewed
the whole set for cross-cluster consistency before this pass; that
consistency check — the count reconciliation, the two reclassifications
(`team-sg-baseline.ts`, `ComparativeBenchmarks.tsx` /
`DataFreshnessAlerts.tsx`), and the two new sections above (Paired
capabilities, Data with no reader) — is what this specific write-up added
on top of the per-cluster reports. No file was opened at runtime; every
classification rests on static analysis (grep/git-log/import-graph) plus
live Supabase schema and row-count queries, never a `next build`, dev
server, or browser click-through, across any cluster.
