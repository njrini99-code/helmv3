/**
 * Two Genome dimensions were fixed on 2026-08-17, and 40 of the 48 genomes on
 * active rosters were computed BEFORE that. Those stored values were produced
 * by formulas we now know were wrong.
 *
 *   #1500  miss_side_bias read a 2-value side off an 8-value compass. 58% of
 *          the side-carrying signal was discarded, and the surviving subsample
 *          pointed the WRONG WAY for players who cleared the floor — a coach
 *          reading "misses left" had them working the opposite fault.
 *   #1499  scrambling_rate was a proximity proxy, not scrambling. It rated
 *          players "Wizard" whose real scrambling was below 40%.
 *
 * Measured against production 2026-08-18, over genomes on ACTIVE rosters:
 *
 *     genomes shown                                    48
 *     computed before the fix                          40
 *     ...still displaying a scrambling_rate value       8
 *     ...still displaying a miss_side_bias value        2
 *
 * Ten wrong values are on a coach's screen right now, and they can never be
 * corrected by a recompute: those players have no completed round inside the
 * 90-day window, so every dimension refuses and the row is left as-is. Waiting
 * for the nightly cron is not a fix — it is what has already happened 40 times.
 *
 * A stale value and a value from a known-wrong formula are different things.
 * "Last refreshed Jul 7" is honest about the first and silent about the second.
 * So the read path retires the value: the dimension reports as uncomputed
 * rather than presenting a number the engine would no longer produce.
 */
import { describe, it, expect } from 'vitest';
import {
  retireOutdatedDimensions,
  DIMENSION_FORMULA_EPOCH,
} from '@/lib/coachhelm/v3/genome/dimension-validity';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';

const BEFORE = '2026-07-07T02:00:00.000Z';
const AFTER = '2026-08-18T02:00:00.000Z';

function vec(): GenomeVector {
  return {
    miss_side_bias: { value: -0.33, confidence: 0.4, label: 'Left bias' },
    scrambling_rate: { value: 0.62, confidence: 0.7, label: 'Wizard' },
    scoring_trend: { value: 1.2, confidence: 0.8, label: 'Improving' },
    par3_proficiency: { value: 0.5, confidence: 0.6 },
  };
}

describe('retireOutdatedDimensions', () => {
  it('retires a dimension whose formula changed after the genome was computed', () => {
    const out = retireOutdatedDimensions(vec(), BEFORE);

    expect(out.miss_side_bias).toEqual({ value: null, confidence: null });
    expect(out.scrambling_rate).toEqual({ value: null, confidence: null });
  });

  it('drops the stale LABEL too — "Wizard" is the wrong claim, not just the number', () => {
    const out = retireOutdatedDimensions(vec(), BEFORE);
    expect(out.scrambling_rate!.label).toBeUndefined();
    expect(out.miss_side_bias!.label).toBeUndefined();
  });

  it('leaves dimensions whose formula never changed alone', () => {
    const out = retireOutdatedDimensions(vec(), BEFORE);
    expect(out.scoring_trend).toEqual({ value: 1.2, confidence: 0.8, label: 'Improving' });
    expect(out.par3_proficiency).toEqual({ value: 0.5, confidence: 0.6 });
  });

  it('leaves everything alone once the genome is newer than the fix', () => {
    expect(retireOutdatedDimensions(vec(), AFTER)).toEqual(vec());
  });

  it('retires on an unparseable or missing computed_at rather than trusting it', () => {
    // An unknown provenance cannot be shown to be post-fix, and the safe
    // direction is to under-claim.
    for (const stamp of [null, undefined, 'not a date']) {
      const out = retireOutdatedDimensions(vec(), stamp);
      expect(out.scrambling_rate!.value).toBeNull();
      expect(out.scoring_trend!.value).toBe(1.2);
    }
  });

  it('does not mutate the vector it was given', () => {
    const original = vec();
    retireOutdatedDimensions(original, BEFORE);
    expect(original.scrambling_rate!.value).toBe(0.62);
  });

  it('tolerates a vector missing the affected dimensions entirely', () => {
    const out = retireOutdatedDimensions({ scoring_trend: { value: 1, confidence: 1 } }, BEFORE);
    expect(out).toEqual({ scoring_trend: { value: 1, confidence: 1 } });
  });

  it('pins the two epochs to the day the formulas actually changed', () => {
    expect(DIMENSION_FORMULA_EPOCH.miss_side_bias).toBe('2026-08-17');
    expect(DIMENSION_FORMULA_EPOCH.scrambling_rate).toBe('2026-08-17');
  });
});
