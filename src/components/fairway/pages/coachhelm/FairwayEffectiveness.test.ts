/**
 * ============================================================================
 * FairwayEffectiveness — accuracy-headline gate regression guard
 * ----------------------------------------------------------------------------
 * Bug: the PRIMARY accuracy headline ("ACCURACY 100% ▲+8%") gated on
 * `GAUGE_MIN_RESOLVED` (2), a much looser threshold than the calibration side
 * panel's own stated requirement ("Still calibrating — needs 5 resolved
 * predictions…"). A near-empty sample (e.g. 2-for-2, or genuinely 0/1
 * resolved once any rounding/staleness in the upstream rollup is in play)
 * could render an authoritative percentage a coach has no way to distrust.
 *
 * Fix: the headline now gates on the SAME threshold as the side panel
 * (`BUCKET_MIN_RESOLVED` = 5). This locks that the two thresholds cannot
 * drift apart again.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { isAccuracyHeadlineLive } from './FairwayEffectiveness';

describe('isAccuracyHeadlineLive', () => {
  it('is NOT live at zero resolved predictions', () => {
    expect(isAccuracyHeadlineLive(0)).toBe(false);
  });

  it('is NOT live below the 5-resolved threshold (the old 2-resolved gate is gone)', () => {
    expect(isAccuracyHeadlineLive(1)).toBe(false);
    expect(isAccuracyHeadlineLive(2)).toBe(false);
    expect(isAccuracyHeadlineLive(3)).toBe(false);
    expect(isAccuracyHeadlineLive(4)).toBe(false);
  });

  it('is live at exactly 5 resolved predictions — matching the calibration panel\'s own stated "needs 5" copy', () => {
    expect(isAccuracyHeadlineLive(5)).toBe(true);
  });

  it('stays live well above the threshold', () => {
    expect(isAccuracyHeadlineLive(50)).toBe(true);
  });
});
