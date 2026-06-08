import { describe, it, expect } from 'vitest';
import {
  lifetimeSpanDays,
  attemptGate,
  ATTEMPT_FLOOR,
} from '@/lib/coachhelm/v3/engine/window-honesty';

describe('lifetimeSpanDays', () => {
  it('returns the inclusive day span between first and last round date', () => {
    // 2026-04-08 → 2026-05-31 is 53 days apart, +1 inclusive = 54.
    expect(lifetimeSpanDays('2026-04-08', '2026-05-31')).toBe(54);
  });

  it('a single-day history is span 1, never 0', () => {
    expect(lifetimeSpanDays('2026-05-31', '2026-05-31')).toBe(1);
  });

  it('returns null when either date is missing or unparseable (caller must fall back)', () => {
    expect(lifetimeSpanDays(null, '2026-05-31')).toBeNull();
    expect(lifetimeSpanDays('2026-05-31', null)).toBeNull();
    expect(lifetimeSpanDays('nope', '2026-05-31')).toBeNull();
  });
});

describe('attemptGate', () => {
  it('suppresses a band below the attempt floor', () => {
    const g = attemptGate(ATTEMPT_FLOOR - 1);
    expect(g.report).toBe(false);
    expect(g.disclosure).toBe('');
  });

  it('reports a band at/above the floor and discloses the sample size', () => {
    const g = attemptGate(31);
    expect(g.report).toBe(true);
    expect(g.disclosure).toBe(' (31 attempts)');
  });

  it('uses the singular "attempt" for exactly one (defensive — floor normally blocks this)', () => {
    expect(attemptGate(1, { floor: 1 }).disclosure).toBe(' (1 attempt)');
  });

  it('an explicit override floor is honored', () => {
    expect(attemptGate(8, { floor: 10 }).report).toBe(false);
    expect(attemptGate(12, { floor: 10 }).report).toBe(true);
  });
});
