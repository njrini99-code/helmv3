import { describe, it, expect } from 'vitest';
import {
  dominantAxis,
  approachAxisDriver,
} from '@/lib/coachhelm/v3/engine/diagnosis';

describe('dominantAxis', () => {
  it('returns the axis whose share clears the threshold, with its real share', () => {
    // 7 short, 3 long, 0 neutral → short share 70% (≥ 0.55 default).
    const res = dominantAxis({ negative: 7, positive: 3, neutral: 0 }, 0.55);
    expect(res).not.toBeNull();
    expect(res!.axis).toBe('negative');
    expect(res!.share).toBeCloseTo(0.7, 2);
    expect(res!.n).toBe(10);
  });

  it('returns null when no axis dominates (balanced distribution)', () => {
    // 5 / 5 → neither side clears 0.55.
    expect(dominantAxis({ negative: 5, positive: 5, neutral: 0 }, 0.55)).toBeNull();
  });

  it('ignores the neutral bucket when computing the directional share', () => {
    // 6 short, 2 long, 12 neutral → directional total 8, short share 75%.
    const res = dominantAxis({ negative: 6, positive: 2, neutral: 12 }, 0.55);
    expect(res!.axis).toBe('negative');
    expect(res!.share).toBeCloseTo(0.75, 2);
    expect(res!.n).toBe(8);
  });

  it('returns null when the directional total is below the min sample', () => {
    expect(dominantAxis({ negative: 2, positive: 0, neutral: 0 }, 0.55, 5)).toBeNull();
  });

  it('returns null on an exact tie even when the threshold is below 0.5', () => {
    // 5/5 with a Phase-C-style low threshold (0.4): both poles clear 0.4, so the
    // tie-break must be symmetric (strictly-greater) and yield no dominant axis,
    // not spuriously resolve to 'negative' by ordering.
    expect(dominantAxis({ negative: 5, positive: 5, neutral: 0 }, 0.4)).toBeNull();
  });

  it('reports the dominant pole when it clears a sub-0.5 threshold and leads', () => {
    // 6/4 at threshold 0.4: negative share 0.6 clears 0.4 and strictly leads.
    const res = dominantAxis({ negative: 6, positive: 4, neutral: 0 }, 0.4);
    expect(res!.axis).toBe('negative');
    expect(res!.share).toBeCloseTo(0.6, 2);
    // ...and the positive pole wins symmetrically when it leads.
    const flipped = dominantAxis({ negative: 4, positive: 6, neutral: 0 }, 0.4);
    expect(flipped!.axis).toBe('positive');
    expect(flipped!.share).toBeCloseTo(0.6, 2);
  });
});

describe('approachAxisDriver', () => {
  it('SHORT → club-up / commit to a full number', () => {
    const d = approachAxisDriver('short', 0.7, 78);
    // Quality contract: names the share, the WHY, and a SPECIFIC action.
    expect(d).toContain('70%');
    expect(d).toContain('SHORT');
    expect(d.toLowerCase()).toContain('club up');
    expect(d.toLowerCase()).toContain('full number');
  });

  it('LONG → club down / take spin off it', () => {
    const d = approachAxisDriver('long', 0.62, 40);
    expect(d).toContain('LONG');
    expect(d.toLowerCase()).toContain('club down');
  });

  it('LEFT/RIGHT → start-line / face-control action, not a distance fix', () => {
    const left = approachAxisDriver('left', 0.6, 30);
    expect(left).toContain('LEFT');
    expect(left.toLowerCase()).toContain('start line');
    expect(left.toLowerCase()).not.toContain('club up');
  });
});
