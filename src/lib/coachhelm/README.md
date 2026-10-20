# CoachHelm engine: v2 and v3

**v3 is canonical.** New CoachHelm code goes in `v3/`. Do not add a new import
of `v2/` from new code unless the symbol has no v3 home yet (see the table
below), and say so in the PR.

**v2 is not dead.** It is still on the live path, which is why it cannot be
deleted yet. Checked against the tree on 2026-10-08:

- The round-submit action calls `v2/post-round-trigger.ts` after every
  completed round. That trigger reaches the engine through
  `v2/trigger-insights-bridge.ts`, which `actions/insights-coachhelm.ts`
  registers at module load.
- `v2/orchestrator.ts` drives the v3 generators (`putt-distance`,
  `scrambling`, `par-type`, and the rest). The generator code is v3. The entry
  point that runs it is still v2.
- `v2/insights/types.ts` and `v2/insights/upsert.ts` are the shared insight
  shape and writer. v3 itself imports them in 15 files.
- Server actions, cron routes, components and hooks import v2 in 40 production
  files outside `v2/` and `v3/`. v3 is imported from outside its own folder in
  288 production files, and the v3 chat, genome, goals, qualifying and LLM
  surfaces have no v2 equivalent.

| | Files | Role |
| --- | --- | --- |
| `v2/` | 109 | Engine entry and plumbing: orchestrator, post-round trigger, insight types and upsert, mining, prediction, learning, calibration, shot analysis |
| `v3/` | 228 | Canonical engine: generators, composite insights, counterfactuals, genome, goals, intent, LLM composition, chat, qualifying, ranking, visibility |

## Retirement plan for v2 imports

Nothing here is scheduled. This is the order that keeps the live path working.

1. **Freeze.** No new `v2/` imports in new files. Review enforces it; an ESLint
   restriction can follow once the list below is short enough to allowlist.
2. **Move the shared shapes.** `v2/insights/types.ts` (29 importers) and
   `v2/insights/upsert.ts` (7) are the bulk. Move them to `v3/insights/` and
   leave a one-line re-export in v2 until the last importer is updated.
3. **Move the entry point.** Port `v2/post-round-trigger.ts`,
   `v2/trigger-insights-bridge.ts` and the orchestrator to v3, then repoint
   `actions/round-submit.ts`, `actions/insights-coachhelm.ts` and the
   `coachhelm-roster-sweep`, `coachhelm-safety-net` and `jobs/consume` routes.
4. **Move the analytics helpers** the actions import directly:
   `shot-analysis/*`, `stats/*`, `trends`, `simulation`, `prediction/*`,
   `learning/*`, `reasoning/confidence-calibrator`, `analytics/*`.
5. **Delete `v2/`** when `git grep "coachhelm/v2"` returns only v2's own files.

## Remaining v2 importers

Production files outside `v2/` (tests excluded), 55 in all (40 outside `v3/`,
15 inside it), by area, with the v2 modules each one imports. Regenerate with:

    git grep -nE "coachhelm/v2" -- src ':!src/lib/coachhelm/v2' ':!*__tests__*' ':!*.test.*' ':!src/test'

**API routes and crons**

- `src/app/api/coachhelm/v3/chat/stream/route.ts`: gate
- `src/app/api/cron/coachhelm-calibration/route.ts`: reasoning/confidence-calibrator
- `src/app/api/cron/coachhelm-insight-lifecycle/route.ts`: analytics/effectiveness-writer, analytics/prediction-performance-writer, insights/types
- `src/app/api/cron/coachhelm-roster-sweep/route.ts`: trigger-insights-bridge
- `src/app/api/cron/coachhelm-safety-net/route.ts`: post-round-trigger
- `src/app/api/cron/coachhelm-validation/route.ts`: learning/outcome-validator
- `src/app/api/golf/rounds/generate-review/route.ts`: v2 index
- `src/app/api/jobs/consume/route.ts`: post-round-trigger

**Golf server actions**

- `src/app/golf/actions/alerts.ts`: v2 index
- `src/app/golf/actions/coachhelm-analytics.ts`: analytics/prediction-performance-writer, learning/outcome-validator
- `src/app/golf/actions/coachhelm-data.ts`: shot-analysis, simulation, stats, trends
- `src/app/golf/actions/insight-delivery-ranking.ts`: insights/types
- `src/app/golf/actions/insight-delivery.ts`: insights/types
- `src/app/golf/actions/insights-coachhelm.ts`: dashboard-error-classifier, insights/gate-context, insights/to-insight-input, insights/upsert, trigger-insights-bridge, types, v2 index
- `src/app/golf/actions/insights-feed.ts`: insights/to-insight-input, insights/upsert, types, v2 index
- `src/app/golf/actions/insights-player-analysis.ts`: prediction/trajectory-forecaster, types, v2 index
- `src/app/golf/actions/insights-shared.ts`: types
- `src/app/golf/actions/pattern-management.ts`: types
- `src/app/golf/actions/player-feedback.ts`: learning/behavior-learner, types
- `src/app/golf/actions/round-review-system.ts`: v2 index
- `src/app/golf/actions/round-submit.ts`: post-round-trigger
- `src/app/golf/actions/stats-intelligence.ts`: stats

**Pages, components, hooks and other lib code**

- `src/app/golf/(dashboard)/dashboard/players/[playerId]/game/sections/loadApproachLadder.tsx`: shot-analysis/shot-level-sg, shot-analysis/stats-cache-baseline, shot-analysis/yardage-curves
- `src/app/vizlab/VizLabClient.tsx`: insights/types
- `src/clubhouse/data/coachhelm-classify.ts`, `coachhelm-dive-shape.ts`, `coachhelm-map.ts`, `src/clubhouse/preview/fixtures-coachhelm-views.ts`, `fixtures-coachhelm.ts`: insights/types
- `src/clubhouse/data/coachhelm.ts`: gate
- `src/hooks/coachhelm/useRoundReviewV2.ts`: types
- `src/lib/notifications/insight-notifier.ts`: insights/types
- `src/components/fairway/pages/coachhelm/signals/patternToInsightVocabulary.ts`, `src/components/fairway/pages/scouting/scouting-model.ts`, `src/components/golf/coachhelm/insights/DiagnosisPanel.tsx`, `EvidencePanel.tsx`, `format-value.ts`, `src/components/golf/coachhelm/triage/SignalDossier.tsx`: insights/types (and insights/tour-only, insights/standing-injection for scouting-model and EvidencePanel)
- `src/components/golf/coachhelm/player/CompositeRatingCard.tsx`: stats/percentiles
- `src/components/golf/coachhelm/player/ShotAnalysisCard.tsx`: shot-analysis/format

**Inside `v3/` (the reverse dependency, 15 files)**

- `v3/brief/assemble.ts`, `v3/composite/types.ts`, `v3/engine/generator-base.ts`, `v3/engine/types.ts`, `v3/generators/approach-miss.ts`, `v3/themes/*` (assemble, shot-drivers, taxonomy, trend, types): insights/types
- `v3/composite/rules/closing-hole-fatigue.ts`, `v3/composite/rules/front-9-starter.ts`, `v3/composite/synthesis.ts`, `v3/insights/upsert-v3.ts`, `v3/llm/claim-validator.ts`: insights/upsert (some also insights/types)

Step 2 above (moving `insights/types` and `insights/upsert`) clears every v3
row and most of the rest.
