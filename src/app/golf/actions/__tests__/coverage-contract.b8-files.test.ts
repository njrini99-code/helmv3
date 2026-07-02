import { describe, it, expect } from 'vitest';
import { assertAreaFullyWrapped } from '@/lib/admin/__tests__/coverage-contract.shared';

/**
 * W15 Batch 8 (coachhelm coach surfaces) — coverage-contract gate.
 *
 * Unit: B8-FILES (Task 13 minus insights.ts). insights.ts's lifecycle
 * exports (acknowledgeInsight, dismissInsight, reactivateInsight,
 * resolveInsight, rateInsight, acknowledgeComposedInsight,
 * dismissComposedInsight → insights_management) are a SEPARATE serial unit
 * and are NOT asserted here.
 *
 * Features: insights_management, intelligence_dashboard, coachhelm_analytics,
 * coaching_intelligence_settings.
 * Files fully wrapped this batch: insight-management.ts + insight-evidence.ts
 * (insights_management, 11 exports), intelligence-dashboard.ts +
 * team-category-insights.ts + coachhelm-data.ts + causal-relationships.ts
 * (intelligence_dashboard, 13 exports), coachhelm-analytics.ts +
 * player-effectiveness.ts (coachhelm_analytics, 6 exports),
 * coaching-philosophy.ts (coaching_intelligence_settings, 2 exports).
 * 32 exports total (B8's full 39 minus insights.ts's 7 lifecycle fns).
 *
 * RED before the B8-FILES retrofit (32 unwrapped exports); GREEN after.
 */
describe('coverage-contract — B8-FILES coachhelm coach surfaces (insights_management, intelligence_dashboard, coachhelm_analytics, coaching_intelligence_settings; insights.ts deferred)', () => {
  it('every B8-FILES export is wrapped with withAdminObserved({ feature: <its registry key> })', () => {
    expect(() =>
      assertAreaFullyWrapped([
        'src/app/golf/actions/insight-management.ts',
        'src/app/golf/actions/insight-evidence.ts',
        'src/app/golf/actions/intelligence-dashboard.ts',
        'src/app/golf/actions/team-category-insights.ts',
        'src/app/golf/actions/coachhelm-data.ts',
        'src/app/golf/actions/causal-relationships.ts',
        'src/app/golf/actions/coachhelm-analytics.ts',
        'src/app/golf/actions/player-effectiveness.ts',
        'src/app/golf/actions/coaching-philosophy.ts',
      ]),
    ).not.toThrow();
  });
});
