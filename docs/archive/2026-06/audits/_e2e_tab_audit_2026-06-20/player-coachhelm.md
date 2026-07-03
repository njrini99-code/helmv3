## Player CoachHelm [player]

End-to-end audit of the player CoachHelm surface: the home (`/golf/dashboard/coachhelm`),
the `/golf/dashboard/my-insights` redirect, and the chat history page
(`/golf/dashboard/coachhelm/chat`). Active render path in prod is the **Fairway redesign**
(`.env.local` → `NEXT_PUBLIC_REDESIGN=true`), so `FairwayPlayerCoachHelm` is what players
actually see; the legacy `PlayerCoachHelmDashboard` is the flag-OFF fork and is effectively dead.

Reference: `memory/context/golfhelm-features.md` #20 (Player CoachHelm) + #12 (Engine).

---

### Actual end-to-end wiring

**Route / role-gate.** `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx:126-135` resolves the
session via `getGolfSessionProfile()` (`src/lib/auth/session.ts:142-167`), redirects unauthenticated
to `/golf/login`, returns `NotPlayerState` for a coach, and `redirect('/golf/player')` when there is
no player profile at all. The `(dashboard)/layout.tsx:34-35` adds an auth backstop. Role-gate is
correct — a coach never sees player data here.

**Parallel data fetch (page.tsx:150-179).**
- `getPlayerCoachHelmDashboard(player.id)` — `src/app/golf/actions/insights.ts:2416-2530`. Calls
  `verifyPlayerAccess` (self-or-coach), `isCoachHelmEnabledForPlayer` (gate → `COACHHELM_DISABLED`
  errorCode), reads `golf_players`, runs the in-memory V2 engine (`analyzePlayer`), reads
  `golf_rounds` (last 5 completed), merges evidence-backed rows from `golf_coach_insights`
  (`loadEvidenceBackedInsights`, ranked via the shared `scoreInsight`). `prediction` is
  `analysis.predictions[0]` (the predictor persists to `golf_predictions` as a side effect).
- `getPlayerShotAnalytics(player.id, 30)` — `src/app/golf/actions/shot-analytics.ts:219`. Auth +
  `verifyPlayerAccess`; reads `golf_rounds`, paginates `golf_holes` / `golf_shots` via
  `fetchAllRowsResult` (PostgREST 1000-row cap handled correctly). Returns `success:false` when no
  rounds in window → page coalesces to `null` → honest "awaiting" readouts.
- `getTopInsightForPlayer` / `getInsightsForPlayer` / `getThemesForPlayer` —
  `src/app/golf/actions/insight-delivery.ts`. All auth + `verifyPlayerAccess`, all read
  `golf_coach_insights WHERE evidence IS NOT NULL` through `applyInsightVisibility` (v3-engine +
  visible-lifecycle + not-dismissed), all paginate via `fetchAllRowsResult`, all rank with the shared
  composite. `getThemesForPlayer` is `.catch(() => null)` so a themes failure can never reject the page.
- V3 panels (page.tsx:170-178): `getPlayerProfile` / `getPlayerTrendAnalysis` / `getPlayerShotContext`
  (`src/app/golf/actions/coachhelm-data.ts`), each auth-checked. Failures degrade to `null`.

**Standing (redesign fork only, page.tsx:208-209).** `loadPlayerStandingMap(player.id)` reads
`golf_player_standing` via the admin client (RLS-bypass) filtered only by `player_id`; safe here
because `player.id` is the authenticated player's own id (no cross-player param).

**Render (FairwayPlayerCoachHelm).** `src/components/fairway/pages/coachhelm/FairwayPlayerCoachHelm.tsx`
mounts `CoachHelmShell active="brief" role="player"` → `CoachHelmSubNav` player tab set =
Overview (`/coachhelm`) · Development (`/my-development`) · Standing (`/my-standing`) — all three
routes exist and are player-gated. Cockpit = `EdgeInstrument` (hero, top insight) +
`PredictionInstrument` + `StrengthRadarInstrument` (GenomeRadar from shot snapshot) + 4 micro
`Readout`s (rounds/fairways/GIR/putts). Below: themes feed (flag-gated) OR flat secondary insight feed
(`InsightCard` → `InsightPanel` expand-in-place), `FocusAreasGrid`, `PerformancePrediction`,
`CompositeRatingCard`, `TrendDashboard`, and a collapsible Deep Dive (`ShotAnalysisCard` / `WhatIfPanel`).

**Write path.** `rateInsightAsPlayer` (`src/app/golf/actions/player-feedback.ts`) — auth, derives
`player_id` from auth (never trusts the client), ownership check against `golf_coach_insights.player_id`,
**upserts** `golf_insight_player_feedback` with `onConflict:'insight_id,player_id'` (no destructive
delete), fans to the behavior learner, and `revalidatePath('/golf/dashboard/coachhelm')` +
`/my-development`. `handleMakePlan` (themes path) calls `createGoal` with non-fabricated defaults.

**`/my-insights`** (`my-insights/page.tsx`) → `redirect('/golf/dashboard/coachhelm')`. Correct.

**Chat** (`coachhelm/chat/page.tsx`) — coach-only; a player gets `FeatureUnavailable` → "Open Messages".
The player sub-nav has NO Ask/chat tab, so players never link here. Correct.

---

### Expected vs actual (feature-doc #20 / #12)

| Spec point | Status |
|---|---|
| Player-only page; coaches redirected | ✅ correct (coach → NotPlayerState) |
| `getPlayerCoachHelmDashboard` + `getPlayerShotAnalytics(…,30)` | ✅ wired |
| Predictions from `golf_predictions` | ✅ surfaced via engine; predictor persists to the table |
| `/my-insights` redirects to `/coachhelm` | ✅ correct |
| Honest empty states (no fake 0) | ✅ cold-start, per-instrument "awaiting", InsufficientData all present |
| Tabs incl. Driving spray | ⚠️ The cockpit "Shot mix" radar covers driving; the standalone driving spray chart (PR #303 `FairwayDrivingSpray`) is NOT mounted on this player CoachHelm surface — it lives in the player Hub cockpit Driving tab, not here. Not a regression, but the focus item's "Driving spray" is not on this tab. |
| Engine "Player insight preferences no UI" gap | open (no player settings page) — consistent with doc |

The two real divergences are in the **What-If deep-dive panel** (below), which is wired to a data
shape the server action never returns.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| HIGH | broken-wiring | `src/components/golf/coachhelm/player/WhatIfPanel.tsx:51` + `coachhelm-data.ts:105-115` | `WhatIfPanel` resolves its improvement list from `profileData?.improvements`, but `getPlayerProfile`'s `PlayerProfileData` has **no `improvements` field** (only composite/categories/percentiles/baselines/playerState). `resolvedImprovements` is therefore always `[]`. | The "What If" Deep-Dive tab **always** renders the empty state ("No improvement data yet"). The list of improvement opportunities never appears, and the per-item **Simulate** buttons never render — so the entire What-If interactive flow is unreachable on prod. | Either have `getPlayerProfile` return an `improvements` array, or pass a real `improvements` prop to `WhatIfPanel` from a source that produces them (e.g. derive from `getPlayerWhatIf`/focus areas). Until then the tab is dead UI. |
| HIGH | dead-control | `FairwayPlayerCoachHelm.tsx:672-690` (also legacy `PlayerCoachHelmDashboard.tsx:567-583`) | The `onSimulate` handler (which calls `getPlayerWhatIf`) is only ever invoked by the Simulate buttons inside `WhatIfPanel`. Because the improvement list is always empty (finding above), those buttons never render, so `onSimulate`/`getPlayerWhatIf` is **dead code on this surface**. | The What-If simulation feature is completely non-functional for players; the `getPlayerWhatIf` server action is never exercised from the UI. | Fix the `improvements` data wiring (finding above); the Simulate path then becomes live. |
| MEDIUM | wrong-data | `WhatIfPanel.tsx:49-50,112` + `FairwayPlayerCoachHelm.tsx:677` | `currentPrediction` is read from `profileData?.currentPrediction`, a field `getPlayerProfile` never returns, and the parent passes no `currentPrediction` prop. So `hasPrediction` is always `false` ("Predicted: --") and `onSimulate`'s `baseline = profileData?.currentPrediction ?? 0` is always `0` — projected score = raw delta, not an actual scoring number. | Even if improvements were fixed, the "Predicted" readout would stay "--" and the simulated "projected score" would be a bare delta mislabeled as a score. | Source `currentPrediction` from `data.prediction.predictedValue` (already fetched on the page) and pass it into `WhatIfPanel` as a prop, and use it as the simulation baseline. |
| LOW | ux-gap | `FairwayPlayerCoachHelm.tsx:846-852,201-207` | `team_pct` (a 0–100 percentile rank, direction-normalized in the standing RPCs so higher = better) is rendered by `ordinalRank()` as a literal place ("82nd") with the label "team rank" and a "Best on the team" chip at ≥90. A percentile of 82 means "ahead of 82% of the team," not "82nd place." | Players may misread the percentile as a roster position. Data is correct; the wording/format overstates it as a place. | Label as "team percentile" (e.g. "82nd pct" / "top 18%") instead of an ordinal place, or render the actual rank position if that is the intent. |
| INFO | revalidation | `player-feedback.ts:220-221` | `rateInsightAsPlayer` revalidates `/coachhelm` + `/my-development` but the client also calls `router.refresh()` after every rate (`FairwayPlayerCoachHelm.tsx:273`), so optimistic feedback reconciles correctly. No action needed — recorded for completeness. | None. | — |
| INFO | dead-control | `PlayerCoachHelmDashboard.tsx` (whole file) | The legacy flag-OFF player dashboard is unreachable in prod (`NEXT_PUBLIC_REDESIGN=true`). Its What-If panel has the same broken `improvements` wiring, and its `HeroNarrativeCard` passes the RAW `team_pct` (no 0–1 vs 0–100 normalization, unlike the Fairway path). Only relevant if the flag is ever turned off. | None in prod. | If the legacy fork is retired, delete it; otherwise port the Fairway `team_pct` normalization + improvements fix. |

---

### Things verified correct (no finding)

- **Auth on every action.** All player-facing fetchers (`getPlayerCoachHelmDashboard`,
  `getPlayerShotAnalytics`, `getTopInsightForPlayer`, `getInsightsForPlayer`, `getThemesForPlayer`,
  `getPlayerProfile/Trend/ShotContext`) call `auth.getUser()` and `verifyPlayerAccess` before reading
  private data. The write action derives `player_id` from auth and checks insight ownership.
- **Sport-prefixed tables only** — `golf_players`, `golf_rounds`, `golf_holes`, `golf_shots`,
  `golf_coach_insights`, `golf_player_standing`, `golf_player_stats_cache`, `golf_insight_player_feedback`,
  `golf_predictions`. No bare/wrong table names.
- **Pagination** — `golf_holes` / `golf_shots` / the insight feeds / shot-driver fetch all use
  `fetchAllRowsResult` (or an explicit `.limit()` cap with `.order()`), so nothing silently truncates at 1000.
- **Empty/loading/error states** — cold-start `EmptyState`, per-instrument `awaiting` Readouts,
  `InsufficientData` for null V3 panels, `FocusAreasGrid`/`CompositeRatingCard` own honest empties; the
  page wraps the parallel fetch in try/catch → `ErrorState`, and `COACHHELM_DISABLED` → dedicated state.
- **No destructive writes** — feedback is an `upsert(onConflict)`, not delete-then-insert.
- **Correct Supabase clients** — server actions use `await createClient()`; the standing loader
  intentionally uses the admin client for the player's own row only.
- **team_pct direction** — standing RPCs order by a per-metric direction token (`lower_better → DESC`,
  else `ASC`) so higher `team_pct` = better for every metric; the EdgeInstrument's ≥90 = "Best on the team"
  is semantically correct (only the ordinal *wording* is the LOW finding above).
- **Cross-feature links** — sub-nav (Overview/Development/Standing), "AI settings" (`/settings`),
  "Log your first round" (`/rounds/new`), and the legacy "View N more" → `/my-development` all resolve
  to existing routes.
- **GenomeRadar / micro-readout math** — fairway%/GIR%/up-and-down% used directly (0–100 scale);
  putting axis = `100 - threePuttRate` (share NOT three-putting); axes omitted when the sub-stat has
  zero shots (no fabricated shape). `formatPercent(confidence,0)` correctly renders the 0–1
  calibrated confidence as a percentage.
