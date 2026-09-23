import { describe, it, expect } from 'vitest';
import { assertAreaFullyWrapped } from '@/lib/admin/__tests__/coverage-contract.shared';

/**
 * W15 Batches 8+9 (coachhelm coach surfaces + player/reviews/development) —
 * coverage-contract gate for `insights.ts`.
 *
 * insights.ts spans THREE batches (B7/B8/B9 — plan
 * docs/superpowers/plans/helm-bridge/waves/w15-total-coverage.md "Batch
 * notes"). B7 (git eb4395f52) wrapped the 16 default-tagged
 * `coachhelm_ai_engine` exports (see coverage-contract.b7.test.ts, which
 * excludes exactly the exports below). This is the FINAL slice: it wraps
 * the remaining exports —
 *   insights_management (5): acknowledgeInsight, dismissInsight,
 *     reactivateInsight, resolveInsight, rateInsight
 *   round_review_ai (1): generateRoundReview
 *   my_development (1): getPlayerFocusAreas
 *   player_coachhelm_dashboard (1): getPlayerCoachHelmDashboard
 *
 * (`acknowledgeComposedInsight`/`dismissComposedInsight` were removed
 * 2026-09-22 as confirmed-dead code — zero live callers — rather than
 * wrapped; the file's total export count dropped accordingly.)
 *
 * — so the WHOLE file is covered. NO exclude list: B7 + this batch =
 * complete, which is exactly what this test asserts.
 *
 * RED before this batch's retrofit (lists the unwrapped exports above,
 * mirroring coverage-contract.b7.test.ts's exclude list); GREEN after.
 */
describe('coverage-contract — insights.ts (B8/B9 remainder, whole-file assertion)', () => {
  it('every export in insights.ts is wrapped with withAdminObserved({ feature: <its registry key> })', () => {
    expect(() =>
      assertAreaFullyWrapped(['src/app/golf/actions/insights.ts']),
    ).not.toThrow();
  });
});
