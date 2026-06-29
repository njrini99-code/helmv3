# GolfHelm Stats and CoachHelm Test Discovery

Date: 2026-06-29

Branch: `test-hardening/golf-stats-coachhelm-contracts`

Scope: discovery for an advisory Business Contracts lane. This report maps current sources of truth and testing opportunities. It does not redefine product behavior.

## GolfHelm Stats Source Map

| Area | File path | Exports / constants | Pure / testable | Current coverage | Risk |
|---|---|---|---|---|---|
| Round totals, scoring averages, 18-hole normalization | `src/lib/golf/stat-formulas.ts` | `computeScoringAverage`, `computeScoringAverageVsPar`, `computePerRound18`, `computePuttsPerRound` | Pure | Existing unit coverage plus new business contracts | High |
| Hole scoring, score-to-par, scoring by par | `src/lib/utils/golf-stats-calculator-shots.ts` | `calculateHoleStatsFromShots`, `calculateStatsFromShots` | Pure | Existing utility tests plus new contracts | High |
| Putts / 3-putts | `src/lib/utils/golf-stats-calculator-shots.ts` | `calculateHoleStatsFromShots`, `normalizePuttFeet`, `getPuttDistanceBucket` | Pure | Existing putting tests plus new contracts | High |
| GIR | `src/lib/utils/golf-stats-calculator-shots.ts`, `src/lib/golf/stat-formulas.ts` | `isGreenHit`, `computeGirPct`, `calculateStatsFromShots` | Pure | Existing tests plus new contracts | High |
| Fairways | `src/lib/utils/golf-stats-calculator-shots.ts`, `src/lib/golf/stat-formulas.ts` | `computeFairwayPct`, fairway splits in `calculateStatsFromShots` | Pure | Existing stats tests | Medium |
| Scrambling / up-and-downs | `src/lib/utils/golf-stats-calculator-shots.ts`, `src/lib/golf/stat-formulas.ts` | `computeScramblingPct`, `calculateHoleStatsFromShots` | Pure | New contracts cover GIR gating | High |
| Sand saves | `src/lib/utils/golf-stats-calculator-shots.ts`, `src/lib/golf/stat-formulas.ts` | `computeSandSavePct`, `sand_save` handling in hole calculator | Pure | Existing utility tests; matrix tracks next fixture | Medium |
| Penalties | `src/lib/utils/golf-stats-calculator-shots.ts` | `getPenaltyCategory`, penalty aggregation, `calculateStrokesGainedForShot` | Pure | Existing SG property tests; matrix tracks starter | High |
| Driving distance | `src/lib/utils/golf-stats-calculator-shots.ts` | driving distance fields and driver/non-driver splits | Pure | Existing stats tests | Medium |
| Proximity | `src/lib/utils/golf-stats-calculator-shots.ts` | approach/putting proximity fields and bucket helpers | Pure | Existing utility tests; new import bucket contracts | High |
| Strokes gained | `src/lib/utils/golf-stats-calculator-shots.ts`, `src/lib/golf/strokes-gained.ts` | `getExpectedStrokes`, `calculateStrokesGainedForShot`, `formatStrokesGained` | Pure | Existing property tests plus new null-honesty contract | High |
| PGA/LPGA/team baselines | `src/lib/golf/sg-benchmarks.ts`, `src/lib/golf/strokes-gained.ts` | `SG_BASELINE_OPTIONS`, `sgBaselineScale`, `defaultSgBaseline`, `WOMENS_SG_SCALE` | Pure | Existing baseline tests plus new explicitness contract | High |
| Stat cache tables | `src/lib/cache/golf-stats-calculator.ts`, Supabase migrations | `getStatsFromCache`, `refreshStatsCache`, `getTeamPlayerStats` | Server/DB backed | Existing CI/RLS/schema coverage; no new DB fixture in this PR | High |
| Stat rollups | Supabase functions referenced by `stat-formulas.ts` comments | DB functions: `recompute_golf_round_totals`, `update_player_stats_cache`, `refresh_player_standing` | DB-backed | RLS/schema lanes, types drift | High |
| Coach/player stat views | `src/app/golf/actions/stats-data.ts`, `src/app/golf/(dashboard)/dashboard/stats/stats-client.tsx`, `src/app/golf/(dashboard)/dashboard/stats/team/*` | Server actions and UI states | Testable with adapters | Existing action/component tests plus new product-trust static contracts | High |

## CoachHelm Source Map

| Area | File path | Exports / constants | Pure / testable | Current coverage | Risk |
|---|---|---|---|---|---|
| Metric direction | `src/lib/coachhelm/v3/metrics/registry.ts` | `METRIC_DIRECTION`, `getMetricDirection`, `improvementSign` | Pure | Existing registry tests plus new parity contracts | High |
| Lower-is-better vs higher-is-better rendering | `src/lib/coachhelm/v3/standing/metric-config.ts` | `METRIC_RENDER_CONFIG`, `getMetricRenderConfig` | Pure | New parity contract against registry | High |
| Strengths / weaknesses | `src/lib/golf/strokes-gained.ts`, `src/lib/coachhelm/v2/mining/*` | `generateStatisticalStrengthsWeaknesses`, mining generators | Mostly pure | Existing mining tests | Medium |
| Evidence payloads | `src/lib/coachhelm/v2/insights/types.ts`, `src/lib/coachhelm/shared/evidence-types.ts`, `src/app/golf/actions/insight-delivery.ts` | `InsightEvidence`, `Diagnosis`, `calcConfidence`, row mappers | Mixed | Existing insight-delivery tests plus new evidence contracts | High |
| Prediction / confidence | `src/lib/coachhelm/v2/prediction/*`, `src/lib/coachhelm/shared/evidence-types.ts` | prediction engines, `calcConfidence` | Mostly pure | Existing prediction quality tests plus new sample-honesty contract | High |
| Sample-size checks | `src/lib/coachhelm/v3/ranking/score.ts`, `src/lib/coachhelm/shared/evidence-types.ts` | `sampleDamping`, `MIN_CALIBRATED_SAMPLES` | Pure / server helper | Existing ranking tests plus new business contract | High |
| Composite scores | `src/lib/coachhelm/v3/ranking/score.ts`, `src/lib/coachhelm/v3/composite/*` | `scoreInsight`, `rankInsights`, `COMPOSITE_RULES` | Pure plus loaders | Existing ranking/composite tests plus new bounds contract | High |
| Insight generation | `src/lib/coachhelm/v3/generators/*`, `src/lib/coachhelm/v2/mining/*` | generator classes and mining functions | Mixed | Existing generator tests | High |
| LLM prompt/composer | `src/lib/coachhelm/v3/llm/compose.ts`, `src/lib/coachhelm/v3/llm/round-review.ts`, `src/lib/coachhelm/v3/llm/hero-narrative.ts` | `compose`, task-specific prompt builders | Server/LLM boundary; partially testable with mocks | Existing compose tests; new citation/budget contracts | High |
| Budget / usage ceilings | `src/lib/coachhelm/v3/llm/budget.ts`, `src/lib/coachhelm/v3/llm/types.ts` | `checkBudget`, `recordSpend`, `FALLBACK_PRIORITY`, `estimateCostUsd` | Mixed | New pure metadata contract; DB behavior still needs fixture | High |
| NLG / output formatting | `src/lib/coachhelm/v2/nlg/insight-composer.ts`, `src/lib/coachhelm/v3/llm/citations.ts`, `src/lib/coachhelm/v3/themes/assemble.ts` | `InsightComposer`, `verifyCitations`, `sanitizeProse` | Pure | Existing theme tests plus new citation contract | High |

## Product Trust Source Map

| Flow | File path | Current behavior | Risk to catch | Risk |
|---|---|---|---|---|
| DB/API error to stats UI state | `src/app/golf/(dashboard)/dashboard/stats/stats-client.tsx` | `statsError` renders explicit error card before empty state | Failed load showing `0 stats` | High |
| Empty data to stats empty state | `src/app/golf/(dashboard)/dashboard/stats/stats-client.tsx` | Empty state appears after loading and error checks | Empty success vs failed load collapse | High |
| Failed detailed stat load | `src/app/golf/(dashboard)/dashboard/stats/stats-client.tsx` | `setStatsError('Failed to load stats. Please try again.')` | Failed stat load showing dashboard as healthy | High |
| Coach insight query failure | `src/app/golf/actions/insight-delivery.ts` | `getInsightsForCoachWithMeta` returns `{ ok:false }`; legacy shim collapses to `[]` for old callers | Failed AI insight showing fake healthy answer | High |
| Failed CoachHelm route load | `src/app/golf/(dashboard)/dashboard/coachhelm/error.tsx`, `src/app/golf/(dashboard)/dashboard/analytics/coachhelm/error.tsx` | Route error boundaries show failure copy | AI unavailable showing stale/generated-looking advice | High |
| Failed save to toast/state | `src/app/golf/actions/golf.ts`, round draft clients | Existing actions return structured errors in several paths | Failed save showing "Saved" | High |
| Partial import/data normalization | `src/lib/coachhelm/v3/ingest/providers/*`, `src/lib/utils/golf-stats-calculator-shots.ts` | Provider adapters plus normalization helpers | Partial data showing complete | Medium |

## Testing Opportunity List

### Safe Tests Added Now

- `src/contracts/golf/stats.contract.test.ts`: formula null-honesty, 18-hole normalization, score-to-par aggregation, 3-putts, scrambling GIR gating, partial round scoring, SG baseline explicitness.
- `src/contracts/coachhelm/truth.contract.test.ts`: metric direction parity, improvement sign, citation verification, sample-size honesty, score bounds, LLM budget metadata.
- `src/contracts/product-trust/states.contract.test.ts`: static radar for stats failure states, CoachHelm meta error results, route error boundaries.
- `src/contracts/access/golf-access.contract.test.ts`: static radar for insight scope, `golf_team_coach_staff`, and cross-tenant RLS coverage.
- `src/contracts/imports/normalization.contract.test.ts`: normalization and bucket stability.

### Tests Needing Tiny Adapters

- Extract pure save result mappers from round save clients so TRUST-002 can test failed save cannot show "Saved" without rendering a whole page.
- Export or centralize import result summary builders so TRUST-003 can assert failed rows are surfaced.
- Add a small factory for CoachHelm evidence rows so all insight mappers can be tested against the same evidence contract.

### Tests Needing Product Decision

- Whether legacy benchmark metadata in `src/lib/golf/sg-benchmarks.ts` should remain while `SG_BASELINE_OPTIONS` exposes only PGA/LPGA runtime keys.
- Whether every CoachHelm generator must use the v3 metric registry, or whether v2 legacy metric aliases remain valid indefinitely.
- Whether the advisory business lane should create real GitHub issues automatically or maintain issue drafts in-repo until labels/permissions are finalized.

### Tests Too Risky For This PR

- Full DB recomputation fixture proving `golf_player_stats_cache` exactly matches raw shot facts across a seeded player/team/time period.
- End-to-end UI tests that force Supabase/API failures across every stats and CoachHelm route.
- Promptfoo/LLM semantic evals for every CoachHelm output class.
