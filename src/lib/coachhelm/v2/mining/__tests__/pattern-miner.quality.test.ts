import { describe, it, expect } from 'vitest';
import {
  COMPOUND_CONDITION_SPECS,
  WINDOW_DAYS,
  cappedConfidence,
  computeConvictionSafe,
} from '../pattern-miner';

const SCORE_COMPONENT_FIELDS = new Set([
  'total_gir', 'putts', 'total_putts', 'total_fairways_hit', 'score_to_par',
]);

describe('pattern miner — no tautological rules', () => {
  it('has no compound rule conditioning on a score component', () => {
    for (const spec of COMPOUND_CONDITION_SPECS) {
      for (const cond of spec.conditions) {
        expect(SCORE_COMPONENT_FIELDS.has(cond.field)).toBe(false);
      }
    }
  });
  it('still exposes at least one context-based compound rule (rust × tournament)', () => {
    const fields = COMPOUND_CONDITION_SPECS.flatMap((s) => s.conditions.map((c) => c.field));
    expect(fields).toContain('days_since_last');
    expect(fields).toContain('round_type');
  });
  it('windows round loading to 90 days', () => {
    expect(WINDOW_DAYS).toBe(90);
  });
});

describe('pattern miner — calibrated confidence on small samples', () => {
  it('never returns confidence 1.00 below 8 observations', () => {
    expect(cappedConfidence(1, 3)).toBeLessThan(1);
    expect(cappedConfidence(1, 7)).toBeLessThan(1);
  });
  it('passes confidence through unchanged at 8+ observations', () => {
    expect(cappedConfidence(0.9, 8)).toBeCloseTo(0.9, 5);
    expect(cappedConfidence(1, 20)).toBe(1);
  });
  it('shrinks more aggressively the smaller the sample', () => {
    expect(cappedConfidence(1, 3)).toBeLessThan(cappedConfidence(1, 6));
  });
  it('conviction from a capped confidence is finite (no Infinity sentinel) on small n', () => {
    const cc = cappedConfidence(1, 3);
    const conv = computeConvictionSafe(cc, 0.3);
    expect(Number.isFinite(conv as number)).toBe(true);
  });
});
