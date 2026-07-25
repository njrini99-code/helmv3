import { describe, expect, it } from 'vitest';
import { shouldShowInsight } from './insight-scorer';
import { effectiveConfidenceThreshold } from '@/lib/coachhelm/constants';

/**
 * Regression guard for a bug found 2026-07-25: `analyzePlayer`'s composed-
 * insight filter called `shouldShowInsight(score)` with no threshold, so every
 * insight was judged against the module default (0.3) no matter what the coach
 * had set Alert Sensitivity to. The coach's threshold was computed and passed
 * in via `philosophyGate` — it simply never reached the filter.
 *
 * These assert the CONTRACT the fix relies on: that the threshold argument is
 * honoured, and that the three sensitivity presets actually separate.
 */
describe('shouldShowInsight honours an explicit threshold', () => {
  const score = (finalScore: number) => ({
    baseScore: finalScore,
    feedbackAdjustment: 0,
    finalScore,
    shouldShow: true,
  });

  it('defaults to 0.3 when no threshold is supplied', () => {
    expect(shouldShowInsight(score(0.31))).toBe(true);
    expect(shouldShowInsight(score(0.29))).toBe(false);
  });

  it('uses the supplied threshold instead of the default', () => {
    // The exact case that was broken: a 0.5-confidence insight passes the
    // module default but must NOT pass a Conservative coach's 0.70 floor.
    expect(shouldShowInsight(score(0.5))).toBe(true);
    expect(shouldShowInsight(score(0.5), 0.7)).toBe(false);
  });

  it('separates the three sensitivity presets', () => {
    const aggressive = effectiveConfidenceThreshold({
      alertSensitivity: 'aggressive',
      minInsightConfidence: 0.3,
    });
    const balanced = effectiveConfidenceThreshold({
      alertSensitivity: 'balanced',
      minInsightConfidence: 0.3,
    });
    const conservative = effectiveConfidenceThreshold({
      alertSensitivity: 'conservative',
      minInsightConfidence: 0.3,
    });

    expect(aggressive).toBeLessThan(balanced);
    expect(balanced).toBeLessThan(conservative);

    // A mid-confidence insight must be admitted by Aggressive, rejected by
    // Conservative. If this ever collapses to one answer, sensitivity is inert
    // again and the bug is back.
    const midInsight = score(0.5);
    expect(shouldShowInsight(midInsight, aggressive)).toBe(true);
    expect(shouldShowInsight(midInsight, conservative)).toBe(false);
  });

  it('an undefined threshold falls back to the default rather than admitting everything', () => {
    // The fix passes `options.philosophyGate?.confidenceThreshold`, which is
    // undefined when no gate is supplied. That must land on the default, NOT
    // on 0 — otherwise a caller without a gate would surface every insight.
    expect(shouldShowInsight(score(0.1), undefined)).toBe(false);
  });
});
