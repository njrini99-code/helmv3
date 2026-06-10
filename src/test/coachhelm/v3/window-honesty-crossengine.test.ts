import { describe, it, expect } from 'vitest';
import { PuttDistanceGenerator } from '@/lib/coachhelm/v3/generators/putt-distance';
import { ParTypeGenerator } from '@/lib/coachhelm/v3/generators/par-type';
import { ScramblingGenerator } from '@/lib/coachhelm/v3/generators/scrambling';
import { ATTEMPT_FLOOR } from '@/lib/coachhelm/v3/engine/window-honesty';

const PID = 'p-xe';

describe('Phase E cross-engine — cache-backed engines carry the true span, never a literal 90', () => {
  it('putt-distance composes a span-derived window (54), not 90', () => {
    const c = new PuttDistanceGenerator(PID, '10_15ft').composeContent({
      sampleN: 40, playerValue: 35, bucket: '10_15ft', rawValue: 0.35,
      rounds_played: 20, cohort_gender: 'mens', attempts: 40, spanDays: 54,
  last_round_date: '2026-05-25',
    });
    expect(c.evidence.window_days).toBe(54);
  });

  it('par-type composes a span-derived window (54), not 90', () => {
    const c = new ParTypeGenerator(PID, 4).composeContent({
      sampleN: 80, playerValue: 4.2, par: 4, rounds_played: 20,
      birdie_rate: 5, par_rate: 60, bogey_rate: 28, double_plus_rate: 7,
      holes_scored: 80, holes_per_round: 10, spanDays: 54,
  last_round_date: '2026-05-25',
    });
    expect(c.evidence.window_days).toBe(54);
  });
});

describe('Phase E cross-engine — shot-source engines genuinely window 90d (honest, stays 90)', () => {
  it('scrambling keeps window_days 90 (loadSandShots genuinely windows 90d)', () => {
    const c = new ScramblingGenerator(PID, 'sand').composeContent({
      last_round_date: '2026-05-25',
      sampleN: 20, playerValue: 45, lie: 'sand', attempts: 20, rounds_played: 20,
      reached_green_n: 15, failed_escape_n: 5, avg_leave_feet: 14,
      two_putt_after_reach_n: 10, failure_mode: 'mixed',
      cohort_gender: 'mens', attempts_per_round: 1,
    });
    expect(c.evidence.window_days).toBe(90);
  });
});

describe('Phase E — ATTEMPT_FLOOR is the single shared floor', () => {
  it('is a small positive integer the bands trust', () => {
    expect(Number.isInteger(ATTEMPT_FLOOR)).toBe(true);
    expect(ATTEMPT_FLOOR).toBeGreaterThanOrEqual(5);
    expect(ATTEMPT_FLOOR).toBeLessThanOrEqual(12);
  });
});
