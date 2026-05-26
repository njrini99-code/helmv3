/**
 * W35 — pure-logic tests for the causality layer.
 *
 * computeAttribution hits Supabase, so the integration is covered by
 * the prod-smoke after deploy. nextWeight (the Bayesian EMA) is pure
 * and the most critical correctness target: a sign flip here ranks
 * insights backwards across every team. Lock it down.
 */

import { describe, it, expect } from 'vitest';
import { nextWeight } from '@/lib/coachhelm/v3/causality/attribute';

describe('nextWeight (EMA over signed lifts)', () => {
  it('returns unchanged when lift is null (no signal)', () => {
    const prev = { weight: 1.2, sample_n: 4 };
    expect(nextWeight(prev, null)).toEqual(prev);
  });

  it('moves toward 1.5 when lift is positive (insight worked)', () => {
    const prev = { weight: 1.0, sample_n: 0 };
    const next = nextWeight(prev, 0.5);
    expect(next.weight).toBeGreaterThan(1.0);
    expect(next.sample_n).toBe(1);
  });

  it('moves toward 0.5 when lift is negative (insight didn\'t help)', () => {
    const prev = { weight: 1.0, sample_n: 0 };
    const next = nextWeight(prev, -0.3);
    expect(next.weight).toBeLessThan(1.0);
    expect(next.sample_n).toBe(1);
  });

  it('clamps at upper bound 2.0 after many positive signals', () => {
    let w = { weight: 1.0, sample_n: 0 };
    for (let i = 0; i < 50; i++) w = nextWeight(w, 1.0);
    expect(w.weight).toBeLessThanOrEqual(2.0);
    expect(w.weight).toBeGreaterThan(1.4);
  });

  it('clamps at lower bound 0.25 after many negative signals', () => {
    let w = { weight: 1.0, sample_n: 0 };
    for (let i = 0; i < 50; i++) w = nextWeight(w, -1.0);
    expect(w.weight).toBeGreaterThanOrEqual(0.25);
    expect(w.weight).toBeLessThan(0.7);
  });

  it('alpha shrinks with sample_n (later updates change weight less)', () => {
    const early = nextWeight({ weight: 1.0, sample_n: 0 }, 1.0);
    const late = nextWeight({ weight: 1.0, sample_n: 100 }, 1.0);
    const earlyDelta = Math.abs(early.weight - 1.0);
    const lateDelta = Math.abs(late.weight - 1.0);
    expect(lateDelta).toBeLessThan(earlyDelta);
  });

  it('ignores non-finite lift values defensively', () => {
    const prev = { weight: 1.0, sample_n: 5 };
    expect(nextWeight(prev, Number.NaN)).toEqual(prev);
    expect(nextWeight(prev, Number.POSITIVE_INFINITY)).toEqual(prev);
  });
});
