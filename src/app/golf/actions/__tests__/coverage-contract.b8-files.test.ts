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
 * (intelligence_dashboard, 13 exports), coachhelm-analytics.ts
 * (coachhelm_analytics), coaching-philosophy.ts
 * (coaching_intelligence_settings, 2 exports).
 *
 * RED before the B8-FILES retrofit (32 unwrapped exports); GREEN after.
 *
 * 2026-09-10: player-effectiveness.ts (coachhelm_analytics, 1 export) was
 * deleted as unreferenced dead code (its own header comment already flagged
 * it "NOT WIRED... no caller anywhere") and dropped from this list and from
 * feature-registry.ts's `coachhelm_analytics` manifest.
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
        'src/app/golf/actions/coaching-philosophy.ts',
      ]),
    ).not.toThrow();
  });
});
