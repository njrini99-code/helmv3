import { describe, it, expect } from 'vitest';
import {
  dominantAxis,
  approachAxisDriver,
  approachAxisReading,
  axisReadingToText,
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

describe('approachAxisReading — observation / check / action (repair plan Package 2)', () => {
  // Assertive cause phrasings the old driver sentences used. Naming a cause
  // inside a list of unknowns ("comes from under-clubbing, a headwind, …") is
  // enumeration, not assertion, and is allowed.
  const MECHANICAL_CAUSE = /the driver is|not aim|not a distance fix|club up and commit|club down and take spin|decelerat|face-control pattern/i;

  it('SHORT → states the measured share, hands the cause to the coach as a check, recommends', () => {
    const r = approachAxisReading('short', 0.7, 78);
    expect(r.observation).toBe('70% of the 78 misses with a distance read finished SHORT.');
    // The check names what the record does not contain — never a cause.
    expect(r.check).toMatch(/does not say why/i);
    expect(r.check).toMatch(/check the club and target/i);
    expect(r.action).toMatch(/^Recommended:/);
    for (const field of [r.observation, r.check, r.action]) {
      expect(field).not.toMatch(MECHANICAL_CAUSE);
    }
  });

  it('LONG → same structure, long-side alternatives named as unknowns', () => {
    const r = approachAxisReading('long', 0.62, 40);
    expect(r.observation).toContain('62% of the 40 misses with a distance read finished LONG.');
    expect(r.check).toMatch(/over-clubbing, a helping wind, a back-pin target/);
    expect(r.check).not.toMatch(/^You/);
  });

  it('LEFT/RIGHT → line-read wording, no distance or mechanics claim', () => {
    const left = approachAxisReading('left', 0.6, 30);
    expect(left.observation).toBe('60% of the 30 misses with a line read finished LEFT.');
    expect(left.check).toMatch(/start line, face control, wind, slope, or aiming away/);
    expect(left.action).toContain('left misses');
    const right = approachAxisReading('right', 0.6, 30);
    expect(right.action).toContain('right misses');
  });

  it('text fallback is the three fields in order, and approachAxisDriver returns exactly that', () => {
    const r = approachAxisReading('short', 0.7, 78);
    const text = axisReadingToText(r);
    expect(text).toBe(`${r.observation} ${r.check} ${r.action}`);
    expect(approachAxisDriver('short', 0.7, 78)).toBe(text);
  });

  it('fixture: identical short-miss data under different intentions/conditions reads identically — the observation is the same, no diagnosis is asserted', () => {
    // Plan checklist: "identical short-miss data occurs under different known
    // intentions/conditions; the observation may be the same, the diagnosis
    // cannot be asserted without context." The engine has no intent, wind,
    // or target record, so the reading must be a function of the tally alone
    // and must not pick a cause the coach would have to un-teach.
    const scenarios = [
      { label: 'calm day, pin in the middle, full shots', share: 0.73, n: 22 },
      { label: 'two-club headwind all afternoon', share: 0.73, n: 22 },
      { label: 'front pins, player aiming at the front edge on purpose', share: 0.73, n: 22 },
      { label: 'par-5 lay-ups logged as approaches', share: 0.73, n: 22 },
    ];
    const readings = scenarios.map((sc) => approachAxisReading('short', sc.share, sc.n));
    for (const r of readings) {
      expect(r).toEqual(readings[0]);
      expect(r.observation).toBe('73% of the 22 misses with a distance read finished SHORT.');
      expect(r.check).toMatch(/headwind|front-edge|lay-up/);
      expect(axisReadingToText(r)).not.toMatch(MECHANICAL_CAUSE);
    }
  });
});
