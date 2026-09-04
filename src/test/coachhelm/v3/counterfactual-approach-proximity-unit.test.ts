/**
 * Wave B / B1 regression — approach-proximity counterfactual target unit bug.
 *
 * `approach_proximity_50_125ft` / `125_175ft` / `175_plus_ft` are registered
 * `lower_better` in FEET (metrics/registry.ts). Before this fix,
 * `computeCounterfactual`'s target-priority chain fell back to
 * `cohortAnchor(metric_id, cohort_gender)` whenever the real per-metric
 * cohort was unusable — and `cohort-baselines.ts` stored these 3 metric IDs
 * as a green-hit PERCENT (mens 80/65/50, womens 70/56/42), not feet. That
 * percent value was used directly as the feet target, corrupting the gap.
 *
 * This test proves the target is now `pga_value` (feet), never the removed
 * percent-scale anchor, by picking `player_value` just above the old anchor
 * and `pga_value` (100 ft) safely above every anchor (max 80). With the
 * correct feet target the player is always still short of pga_value → no
 * gap → suppressed 'no_gap'. Under the old bug, target was the anchor
 * (<= 80), so player_value = anchor + 5 produced a small POSITIVE gap →
 * suppress_reason 'below_threshold' instead — a different, wrong reason.
 */
import { describe, it, expect } from 'vitest';
import { computeCounterfactual } from '@/lib/coachhelm/v3/counterfactual/compute';

const CASES: Array<{
  metric_id: 'approach_proximity_50_125ft' | 'approach_proximity_125_175ft' | 'approach_proximity_175_plus_ft';
  gender: 'mens' | 'womens';
  oldAnchor: number; // the removed percent-scale value for this metric/gender
}> = [
  { metric_id: 'approach_proximity_50_125ft',    gender: 'mens',   oldAnchor: 80 },
  { metric_id: 'approach_proximity_50_125ft',    gender: 'womens', oldAnchor: 70 },
  { metric_id: 'approach_proximity_125_175ft',   gender: 'mens',   oldAnchor: 65 },
  { metric_id: 'approach_proximity_125_175ft',   gender: 'womens', oldAnchor: 56 },
  { metric_id: 'approach_proximity_175_plus_ft', gender: 'mens',   oldAnchor: 50 },
  { metric_id: 'approach_proximity_175_plus_ft', gender: 'womens', oldAnchor: 42 },
];

describe('computeCounterfactual — approach_proximity_* target is unit-correct (feet), not the removed percent anchor', () => {
  for (const { metric_id, gender, oldAnchor } of CASES) {
    it(`${metric_id} (${gender}): target resolves to pga_value (feet), not the ${oldAnchor} percent anchor`, () => {
      const r = computeCounterfactual({
        metric_id,
        direction: 'lower_better',
        // Just above the removed percent anchor — would produce a small
        // POSITIVE gap if the buggy percent-as-feet target were still live.
        player_value: oldAnchor + 5,
        // Safely above every removed anchor (max 80) — a real, unit-correct
        // feet target. With this as the target, player_value is always
        // still short of it, so there is no gap to close.
        pga_value: 100,
        cohort_value: null,
        cohort_gender: gender,
        player_30d_scoring_avg: 75,
      });

      expect(r.suppressed).toBe(true);
      expect(r.suppress_reason).toBe('no_gap');
    });
  }
});
