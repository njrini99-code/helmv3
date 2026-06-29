## CoachHelm Tab Wiring Gaps

Investigator: investigator-3 (CoachHelm). Scope = player-facing CoachHelm tab.

### Sub-feature trace (one line each)

- **Hero / Secondary Insights feed**: `coachhelm/page.tsx:141` (server prop) -> `getTopInsightForPlayer` / `getInsightsForPlayer` (insight-delivery actions) -> `golf_coach_insights` table -> rendered via `HeroInsightCard` / `InsightCard` (`PlayerCoachHelmDashboard.tsx:354,367`). **Status: WIRED** (deterministic, no LLM).
- **Focus Areas**: page.tsx:142 -> `getPlayerCoachHelmDashboard` -> `golf_player_focus_areas` -> `<FocusAreasGrid>` (`PlayerCoachHelmDashboard.tsx:400`). **WIRED**.
- **Performance Prediction**: page.tsx:142 -> `getPlayerCoachHelmDashboard` (which calls v2 orchestrator on demand) -> `<PerformancePrediction>` (line 402). **WIRED**.
- **Composite Rating + Trend Dashboard (V3)**: page.tsx:157-165 dynamic-imports `coachhelm-data` actions (`getPlayerProfile` / `getPlayerTrendAnalysis` / `getPlayerShotContext`) -> v2 stats / trends / shot-analysis modules -> `<CompositeRatingCard>` / `<TrendDashboard>`. **WIRED but defensively swallowed** (see Gap below).
- **Shot Analysis (Deep Dive)**: same V3 chain -> `<ShotAnalysisCard>`. **WIRED**.
- **What If panel**: `<WhatIfPanel>` rendered (line 449) but only `playerId` + `profileData` are passed; **`onSimulate` is never wired** so the "Simulate" button is dead. **PARTIAL**.
- **Shot Analytics tab**: page.tsx:143 -> `getPlayerShotAnalytics` -> `<ShotAnalyticsPanel>`. **WIRED**.
- **Refresh button**: re-fetches dashboard + analytics + `router.refresh()` (line 163-189). **WIRED**.
- **Insight feedback**: `handleInsightAction` -> `rateInsightAsPlayer` server action (line 232). **WIRED**.
- **Round Review (referenced via hook)**: `useRoundReviewV2` -> `generateAndStoreRoundReview` (rule-based) + optional `generateAIRoundReview` (v2 orchestrator). **WIRED, no LLM** (template NLG, despite name).
- **Drill chips / Drill sheet**: `<DrillSheet>` "Add to my practice plan" button -> `defaultAddToPlan` toast stub (`DrillSheet.tsx:76-78`). **STUB ("Coming soon")**.
- **Background analysis pipeline**: `submitGolfRoundComprehensive` (`golf.ts:1684`) -> `POST /api/coachhelm/analyze-player` -> `triggerPlayerInsightsAfterRound` -> v2 `coachHelmIntelligence.analyzePlayer`. **WIRED**.
- **Cron `coachhelm-safety-net`**: scheduled `*/30 * * * *` in `vercel.json`, real Supabase work, calls `triggerPlayerInsightsAfterRound`. **WIRED**.

### Confirmed Gaps (High confidence)

- `src/components/golf/coachhelm/insight-card/DrillSheet.tsx:76-78` — `defaultAddToPlan` is a "Coming soon" toast stub; no task-assignment row created. The component file comment (lines 18-22) explicitly says "ships in a follow-up plan". **Severity: Major**. Fix: replace `defaultAddToPlan` with a server action that inserts into the player's practice plan / `golf_tasks` and revalidates the practice-plan path.
- `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx:449-453` — `<WhatIfPanel>` is rendered without an `onSimulate` prop, so its per-row "Simulate" buttons are silently disabled (the conditional render at `WhatIfPanel.tsx:183` hides them). The underlying engine (`v2/simulation/scenario-engine.ts`, `monte-carlo.ts`) and the panel UI both exist. **Severity: Major**. Fix: add a server action wrapping `coachHelmIntelligence` simulation (or `runScenario` from `v2/simulation`) and pass it as `onSimulate`.
- `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx:157-166` — V3 actions (`getPlayerProfile`, `getPlayerTrendAnalysis`, `getPlayerShotContext`) are dynamic-imported and any throw is silently swallowed with the stale comment `/* V3 actions not yet available — degrade gracefully */`. The actions ARE shipped (`src/app/golf/actions/coachhelm-data.ts` is 1021 lines and fully implemented). **Severity: Minor**. Fix: import statically; surface real errors to `logServerError` instead of dropping them.
- `src/lib/coachhelm/v2/mining/stats-insight-generator.ts:63` — `// TODO: Replace with dynamic baselines from stats/baselines.ts` — the file already imports `PlayerBaseline` and exposes `compareAgainstBaseline` (lines 33-61) that does the right thing, but the static `BENCHMARKS` table (lines 65-113) is still referenced. Migration is half-done. **Severity: Minor**. Fix: remove `BENCHMARKS` once all downstream call sites use `compareAgainstBaseline`.
- `src/components/golf/coachhelm/player/RecentRoundReviews.tsx` — exported from `player/index.ts:6` but no consumer in the dashboard tree (only itself imports it). **Dead code.** **Severity: Minor**. Fix: either render it (the user request includes "Recent rounds" tile equivalent) or delete and remove the export.
- `src/hooks/coachhelm/useCoachHelmSettings.ts:100,116` — `'golf_coachhelm_settings' as 'users'` and `as any` casts because the table isn't in generated Supabase types. **Severity: Minor**. Fix: regenerate `database.types.ts` and remove casts.

### Likely Gaps (Medium confidence)

- **No LLM / AI-SDK calls anywhere in CoachHelm.** Grep for `openai|anthropic|generateText|streamText|@ai-sdk|llm` across `src/lib/coachhelm/**`, `src/components/golf/coachhelm/**`, `src/hooks/coachhelm/**`, `src/app/api/coachhelm/**` returns zero hits. NLG (`src/lib/coachhelm/v2/nlg/insight-composer.ts:31` `sanitizeText`) is purely template-based. The product calls itself "AI" and the page metadata reads "AI-powered insights" (`page.tsx:17`), but the entire pipeline is deterministic statistics + rule-based NLG. **Severity: Major** (depending on product expectation; may be intentional). No fix until product confirms whether an LLM rewrite of generated insight text is intended.
- `src/lib/coachhelm/v2/simulation/scenario-engine.ts` and `monte-carlo.ts` exist (re-exported from `v2/index.ts`) but have **no UI consumer in the player tab** other than the dead `WhatIfPanel.onSimulate`. **Severity: Minor**. Fix: wire as part of the WhatIfPanel fix above.
- `src/app/golf/actions/round-review-system.ts:1279` writes `ai_model_version: existingReview.engine_version ?? 'v1.0'` — implies a v1.0 engine version exists in DB but no v1 review generator code is in repo. **Severity: Minor / informational**. Fix: clean up legacy version string after data backfill.

### v1 vs v2 status

- `src/lib/coachhelm/v2/stats/` is the **only** stats module — there is no `src/lib/coachhelm/stats/`. Migration is structurally complete on the stats side; the `v2/` directory is a complete engine (orchestrator, mining, prediction, learning, reasoning, NLG, gate, feedback, trends, shot-analysis, simulation, stats).
- `src/lib/coachhelm/` root still owns three v1-era files used by 20+ consumers: `types.ts`, `insight-types.ts`, `constants.ts` (CoachPhilosophy, FocusArea, RoundReview shapes; `PHILOSOPHY_DEFAULTS`). These are **types-only / constants-only** — not duplicate engines — and are referenced by both v2 internals (`generateRoundReview` returns the v1 `RoundReview` shape) and by settings / round-review pages. Not a true v1/v2 split, but the "v1.0" engine_version string in `round-review-system.ts:1279` is residual from an older migration.
- 80 imports of `@/lib/coachhelm/v2/...` across `src/`. v2 is the canonical engine.

### Summary

CoachHelm is **mostly wired, with two real wiring gaps and a "no actual LLM" caveat.** The data pipeline (round submit -> /api/coachhelm/analyze-player -> v2 orchestrator -> `golf_coach_insights` -> page server props -> client render) is end-to-end functional, all six crons in `vercel.json` are real and call live engine code, V3 stats/trends/shot-analysis modules are wired through `coachhelm-data.ts` to the dashboard, and there is **no mock data, no hardcoded JSON arrays, and no 501/empty-body API routes** in the scope.

The single biggest concrete blocker is **`<WhatIfPanel>` is rendered without `onSimulate`** (`PlayerCoachHelmDashboard.tsx:449`), so the "Simulate" button on every improvement row is silently disabled — the engine for it (`v2/simulation/*`) is fully built and re-exported from `v2/index.ts` but nothing in the player tab calls it. Secondary blocker is the **drill "Add to practice plan" CTA which is a `toast.info('Noted', ...)` stub** (`DrillSheet.tsx:76-78`) explicitly marked as "ships in a follow-up plan".

The strategic finding is that CoachHelm contains **zero LLM calls** — no `openai`, `anthropic`, `generateText`, `streamText`, `@ai-sdk` anywhere in scope, and `package.json` has no AI provider dependencies (grep returned nothing). The "AI" surface is a template-NLG layer over a deterministic statistical engine. If product expects model-generated coaching language this is the largest missing piece; if the deterministic approach is intentional, the audit is complete.
