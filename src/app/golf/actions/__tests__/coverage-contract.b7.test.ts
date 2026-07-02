import { describe, it, expect } from 'vitest';
import { assertAreaFullyWrapped } from '@/lib/admin/__tests__/coverage-contract.shared';

/**
 * W15 Batch 7 (coachhelm engine) — coverage-contract gate.
 *
 * Features: coachhelm_ai_engine, alerts_system, patterns_dashboard.
 * Files fully wrapped this batch: insight-delivery.ts, player-fingerprint.ts,
 * alerts.ts, pattern-management.ts.
 *
 * insights.ts spans THREE batches (B7/B8/B9 — plan
 * docs/superpowers/plans/helm-bridge/waves/w15-total-coverage.md "Batch
 * notes"), so this contract asserts ONLY B7's 16 default-tagged
 * `coachhelm_ai_engine` exports and excludes the 10 exports owned by later
 * batches (7 insights_management overrides + generateRoundReview
 * [round_review_ai, B9] + getPlayerFocusAreas [my_development, B9] +
 * getPlayerCoachHelmDashboard [player_coachhelm_dashboard, B9]) until their
 * owning batch lands. Task 16 flips on the repo-wide tripwire that locks the
 * whole file.
 *
 * RED before the Batch 7 retrofit (lists every unwrapped B7 export); GREEN
 * after.
 */
const INSIGHTS_TS_NON_B7_EXPORTS = [
  // insights_management (B8)
  'acknowledgeInsight',
  'dismissInsight',
  'reactivateInsight',
  'resolveInsight',
  'rateInsight',
  'acknowledgeComposedInsight',
  'dismissComposedInsight',
  // round_review_ai (B9)
  'generateRoundReview',
  // my_development (B9)
  'getPlayerFocusAreas',
  // player_coachhelm_dashboard (B9)
  'getPlayerCoachHelmDashboard',
];

describe('coverage-contract — B7 coachhelm engine (coachhelm_ai_engine, alerts_system, patterns_dashboard)', () => {
  it('every B7 export is wrapped with withAdminObserved({ feature: <its registry key> })', () => {
    expect(() =>
      assertAreaFullyWrapped(
        [
          'src/app/golf/actions/insight-delivery.ts',
          'src/app/golf/actions/player-fingerprint.ts',
          'src/app/golf/actions/alerts.ts',
          'src/app/golf/actions/pattern-management.ts',
          'src/app/golf/actions/insights.ts',
        ],
        { exclude: { 'src/app/golf/actions/insights.ts': INSIGHTS_TS_NON_B7_EXPORTS } },
      ),
    ).not.toThrow();
  });
});
