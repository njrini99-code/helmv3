import { describe, it, expect } from 'vitest';
import { assertAreaFullyWrapped } from '@/lib/admin/__tests__/coverage-contract.shared';

/**
 * W15 Batch 9 (coachhelm player + reviews + development — file split, Task
 * 14 minus insights.ts) — coverage-contract gate.
 *
 * Features: player_coachhelm_dashboard, round_review_ai,
 * development_plans_coach, my_development, drills_practice_rx,
 * coachhelm_v3_goals.
 *
 * Files fully wrapped this batch (all 14 are wholly owned by B9 — none of
 * them are one of the six multi-feature files, so no `exclude` list is
 * needed): player-feedback.ts, insight-celebration.ts, round-reviews.ts,
 * round-review-system.ts, round-recap.ts, v3/llm.ts, development.ts,
 * drills.ts, v3/practice-rx.ts, v3/team-practice-rx.ts, v3/goals.ts,
 * v3/goal-progress.ts, v3/focus-area-progress.ts, v3/intent.ts.
 *
 * `insights.ts` ALSO contributes to three of these six features
 * (round_review_ai:`generateRoundReview`, my_development:`getPlayerFocusAreas`,
 * player_coachhelm_dashboard:`getPlayerCoachHelmDashboard`) but is explicitly
 * OUT OF SCOPE for this batch (owned by the serial insights.ts chain) —
 * intentionally not included in the file list below.
 *
 * RED before the Batch 9 retrofit (61 unwrapped exports across these 14
 * files); GREEN after.
 */
describe('coverage-contract — B9 coachhelm player + reviews + development (player_coachhelm_dashboard, round_review_ai, development_plans_coach, my_development, drills_practice_rx, coachhelm_v3_goals)', () => {
  it('every B9 export is wrapped with withAdminObserved({ feature: <its registry key> })', () => {
    expect(() =>
      assertAreaFullyWrapped([
        'src/app/golf/actions/player-feedback.ts',
        'src/app/golf/actions/insight-celebration.ts',
        'src/app/golf/actions/round-reviews.ts',
        'src/app/golf/actions/round-review-system.ts',
        'src/app/golf/actions/round-recap.ts',
        'src/app/golf/actions/v3/llm.ts',
        'src/app/golf/actions/development.ts',
        'src/app/golf/actions/drills.ts',
        'src/app/golf/actions/v3/practice-rx.ts',
        'src/app/golf/actions/v3/team-practice-rx.ts',
        'src/app/golf/actions/v3/goals.ts',
        'src/app/golf/actions/v3/goal-progress.ts',
        'src/app/golf/actions/v3/focus-area-progress.ts',
        'src/app/golf/actions/v3/intent.ts',
      ]),
    ).not.toThrow();
  });
});
