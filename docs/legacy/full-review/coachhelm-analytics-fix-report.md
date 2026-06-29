# Agent B: coachhelm analytics — DONE

## Fixes

- `src/lib/coachhelm/v2/analytics/effectiveness-writer.ts` (new) — daily
  rollup writer for `golf_insight_effectiveness`. Reads
  `golf_coach_insights` and writes one row per (team_id, insight_type) for
  the previous day's window. Idempotent via delete-then-insert (the live
  schema has no unique constraint on the natural key).
  Schema cited: `team_id`, `insight_type`, `period_start`, `period_end`,
  `insights_generated`, `insights_dismissed`, `insights_acted_upon`,
  `insights_with_outcome`, `outcomes_improved/no_change/worsened`,
  `action_rate`, `improvement_rate`, `effectiveness_score`.

- `src/lib/coachhelm/v2/analytics/prediction-performance-writer.ts` (new)
  — rolling 30-day snapshot writer for
  `golf_prediction_model_performance`. Reads `golf_predictions` (validated
  rows already populated by `coachhelm-validation` cron), groups by
  (team_id via `golf_team_members`, model_type=metric), computes accuracy/
  MAE/RMSE/systematic_bias/calibration_score and confidence-bucketed
  accuracy + error distribution. Idempotent via delete-then-insert.
  Schema cited: `team_id`, `model_type`, `model_version`, `period_start/end`,
  `predictions_made/validated`, `accuracy_rate`, `mean_absolute_error`,
  `root_mean_square_error`, `systematic_bias`, `calibration_score`,
  `accuracy_by_confidence` (jsonb), `error_distribution` (jsonb),
  `overconfidence_rate`, `underconfidence_rate`.

- `src/lib/coachhelm/v2/analytics/team-correlations.ts` (new) — Pearson
  correlations across team players' cached stats
  (`golf_player_stats_cache`). Computes 4 high-signal pairs (Fairways→GIR,
  Putts→Score, Scrambling→Score, 3-Putt→Score). Requires ≥4 players with
  values on both sides; otherwise the pair is omitted (no fake numbers).

- `src/app/api/cron/coachhelm-insight-lifecycle/route.ts:31-32, 169-211`
  — wired both writers to run after the per-row lifecycle eval. Errors
  are logged via `logServerError` and do NOT fail the cron (lifecycle
  progression is the load-bearing step). Response now includes
  `analytics: { effectiveness_rows_written, prediction_rows_written, ... }`
  for cron observability. The cron's existing `evaluateRow` already sets
  `resolved_at = nowIso` when an insight transitions to lifecycle_state
  'resolved' (route.ts:236-239), so problem 4(a) is already wired in this
  cron — backfill SQL covers the historical gap.

- `src/app/golf/actions/coachhelm-analytics.ts` — replaced the
  `generateMock*` zero-shaped fallbacks with a discriminated `status:
  'ok' | 'no_data'` field on `InsightEffectivenessData`,
  `PredictionPerformanceData`, `PatternImpactData`, and
  `CoachHelmOverviewData`, plus an `earliestDataDate` so the UI can tell
  the coach how long until tracking becomes useful. New helpers:
  `emptyInsightEffectiveness` and `emptyPredictionPerformance` (replace
  the prior `generateMock*`), plus `getEarliestInsightDate`,
  `getEarliestPredictionDate`, `getEarliestRoundDate`. The Overview
  action now reports `status='no_data'` only when the team has zero
  insights, zero patterns, AND zero validated predictions — partial
  activity still renders real numbers.

- `src/app/golf/actions/intelligence-dashboard.ts:481-505` — replaced
  `generateTeamCorrelations`'s 2 hardcoded `isDefault:true` rows with
  real Pearson correlations from `computeTeamCorrelations`. Same
  treatment in the in-flight fallback at `getTeamInsightsSummary:417-430`
  (when no `golf_patterns_v2` rows exist for the team, fall through to
  computed correlations rather than placeholder rows).

- `src/components/golf/coachhelm/analytics/AnalyticsSummaryCards.tsx` —
  short-circuit to a single empty-state card when `data.status ===
  'no_data'`. The card text adapts to `earliestDataDate`: "Your team
  has N days of round data..." vs. "Tracking starts after your team
  logs its first round."

- `src/components/golf/coachhelm/analytics/InsightEffectivenessPanel.tsx`,
  `.../PredictionAccuracyPanel.tsx`, `.../PatternImpactPanel.tsx` —
  each now early-returns the `EmptyState` when `data.status === 'no_data'`
  in both compact and full views, instead of rendering 0% / 0 strokes
  / 0 trends as if they were real. Empty-state copy rewritten to "Tracking
  starts after first rounds / first validated predictions / first patterns
  detected" so it reads as a baseline, not a failure.

## Backfill SQL (user runs this)

```sql
-- 1. Backfill resolved_at for insights that already moved to
--    lifecycle_state='resolved' but never received a timestamp. Use the
--    most recent updated_at as the closest-available approximation; this
--    matches how the lifecycle cron writes resolved_at = NOW() at the
--    moment of transition.
UPDATE golf_coach_insights
SET resolved_at = COALESCE(updated_at, created_at, now())
WHERE lifecycle_state = 'resolved'
  AND resolved_at IS NULL;

-- 2. Same backfill for the legacy `status='resolved'` rows (some manual
--    paths set status without lifecycle_state). Limit to those that
--    don't already have a resolved_at.
UPDATE golf_coach_insights
SET resolved_at = COALESCE(updated_at, created_at, now())
WHERE status = 'resolved'
  AND resolved_at IS NULL;

-- 3. (Optional) Force a fresh analytics rollup for the trailing 30 days
--    so coaches see real numbers immediately instead of waiting for the
--    next nightly cron run. Re-run the
--    `coachhelm-insight-lifecycle` cron manually after this:
--      curl -H "Authorization: Bearer $CRON_SECRET" \
--           https://<host>/api/cron/coachhelm-insight-lifecycle
--    The writers are idempotent, so it's safe to re-run.

-- 4. (Recommended) Add a unique index on the natural key for
--    golf_insight_effectiveness so the writer can later switch from
--    delete-then-insert to upsert. Schema currently has no constraint.
--    Run this in Supabase SQL editor; safe to skip if you'd rather keep
--    the delete-then-insert path:
-- CREATE UNIQUE INDEX IF NOT EXISTS golf_insight_effectiveness_natural_key
--   ON golf_insight_effectiveness (team_id, insight_type, period_start, period_end);
-- CREATE UNIQUE INDEX IF NOT EXISTS golf_prediction_model_performance_natural_key
--   ON golf_prediction_model_performance (team_id, model_type, period_start, period_end);
```

## Decisions

- **correlations: real (Pearson, computed from `golf_player_stats_cache`)**
  — the cached stats already have `driving_accuracy_percentage`,
  `gir_percentage`, `putts_per_round`, `scoring_average`,
  `scrambling_percentage`, `three_putt_percentage`, so computing the
  4 high-signal coaching pairs (Fairways→GIR, Putts→Score, Scrambling→
  Score, 3-Putt→Score) was ~30 lines plus a Pearson helper. Hiding the
  tab would have been cheaper but uglier — coaches would lose a real
  feature. Threshold: ≥4 players with values on BOTH sides per pair,
  otherwise the pair is omitted (no fake numbers).

- **team_settings (`golf_team_coachhelm_settings`): left unwired**.
  No coach-facing toggle UI exists in the codebase that targets the
  team-scoped `enabled/disabled_*` columns (only the coach-level
  `CoachHelmToggle` exists, and it points at `golf_coach_coachhelm_settings`,
  not the team table). Both readers (`gate.ts:115-126` and
  `insights.ts:3080-3090`) already handle a missing row as "enabled by
  default", so the empty table is functionally inert today. The right
  fix is a Team Owner / Admin-level "Disable CoachHelm for this team"
  toggle in the team settings page — flagged for product, but adding
  the UI is out of scope for this analytics-fix pass.

- **resolved_at wiring**: the lifecycle cron's `evaluateRow`
  (route.ts:236-239) already sets `resolved_at = nowIso` when
  transitioning to `lifecycle_state='resolved'`. The manual paths in
  `insight-management.ts:392-401` and `insights.ts:1170-1176` also set
  `resolved_at`. The one path that still doesn't is
  `insights.ts:3133-3141` (the bulk "archive stale V2 insights" branch),
  but that path uses `status='resolved'`, not `lifecycle_state`, and is
  outside Agent B's file ownership. Backfill SQL above covers historical
  rows from BOTH sources (lifecycle_state OR status). Reported to team
  lead.

## Verification

- `npx tsc --noEmit` — clean for `src/`. The 121 errors reported by tsc
  are all in `helm-vid/` (a separate sub-project with its own missing
  deps) and `.next/types/validator.ts` (a stale generated file referencing
  an old route path); zero errors live in `src/`.
- File ownership respected: only the files explicitly listed in the
  agent brief were modified, plus the new `src/lib/coachhelm/v2/analytics/`
  helpers. The `insights.ts:3133-3141` resolved_at bug was identified
  but NOT touched (outside ownership).
