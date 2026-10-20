import { describe, expect, it } from 'vitest';
import { hasHoleScores, holeCoverage, holeRounds, isScoreCountable, isTotalOnlyCountable } from '../data/round-scope';
import { lastTenFloor, LAST_TEN_MONTHS } from '../data/season';
import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';

/**
 * Q-123: which rounds a Clubhouse figure counts. A round posted as a total only (no nines, no holes) is a score and nothing else;
 * the shared rule (lib/golf/round-countable.ts) is untouched, so everything else that reads it behaves as before.
 */

const hole = (over: Partial<CountableRoundInput> = {}): CountableRoundInput => ({
  status: 'completed',
  is_test: false,
  holes_played: 18,
  total_score: 72,
  front_nine: 36,
  back_nine: 36,
  total_putts: 30,
  ...over,
});
/** Cole's qualifier of 26 September: 18 holes, a total of 70, no nines, no putts. */
const total = (over: Partial<CountableRoundInput> = {}): CountableRoundInput => hole({ total_score: 70, front_nine: null, back_nine: null, total_putts: null, ...over });

describe('Q-123 · the total-only round', () => {
  it('counts for scores: an 18-hole completed real round with a plausible total and no nines', () => {
    expect(isTotalOnlyCountable(total())).toBe(true);
    expect(isScoreCountable(total())).toBe(true);
    // The shared rule still refuses it: it is not loosened for anyone else.
    expect(isCountableRound(total())).toBe(false);
  });

  it('a fully scored round counts as before, and is not a total-only one', () => {
    expect(isScoreCountable(hole())).toBe(true);
    expect(isCountableRound(hole())).toBe(true);
    expect(isTotalOnlyCountable(hole())).toBe(false);
  });

  it('keeps every other exclusion: test rounds, rounds in progress, implausible totals, no total, sg too high', () => {
    expect(isScoreCountable(total({ is_test: true }))).toBe(false);
    expect(isScoreCountable(total({ status: 'in_progress' }))).toBe(false);
    // Sep 17's 37 over 18 holes is the stroke floor's case.
    expect(isScoreCountable(total({ total_score: 37 }))).toBe(false);
    expect(isScoreCountable(total({ total_score: null }))).toBe(false);
    expect(isScoreCountable(total({ strokes_gained_total: 20 }))).toBe(false);
    expect(isScoreCountable(total({ holes_played: 12 }))).toBe(false);
  });

  it('a nine-hole total stays out (the rule names 18-hole totals), and so does a round with only one nine recorded', () => {
    expect(isScoreCountable(total({ holes_played: 9, total_score: 38 }))).toBe(false);
    expect(isScoreCountable(hole({ front_nine: 36, back_nine: null }))).toBe(false);
    expect(isScoreCountable(hole({ front_nine: null, back_nine: 36 }))).toBe(false);
    // A real nine-hole round (its one nine recorded) is countable, as it always was.
    expect(isScoreCountable(hole({ holes_played: 9, total_score: 38, front_nine: 38, back_nine: null, total_putts: 16 }))).toBe(true);
  });

  it('the hole-level figures read the rounds that are not marked total-only; an unmarked round has its holes', () => {
    const rounds = [{ id: 'a' }, { id: 'b', total_only: true as const }, { id: 'c' }];
    expect(rounds.map((r) => hasHoleScores(r))).toEqual([true, false, true]);
    expect(holeRounds(rounds).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('says how many rounds the hole stats cover, only when that is fewer than the window', () => {
    expect(holeCoverage(3, 5)).toBe('Hole stats from 3 of 5 rounds');
    expect(holeCoverage(8, 10)).toBe('Hole stats from 8 of 10 rounds');
    expect(holeCoverage(0, 1)).toBe('Hole stats from 0 of 1 round');
    expect(holeCoverage(5, 5)).toBeNull();
    expect(holeCoverage(0, 0)).toBeNull();
  });
});

describe('Q-122 · how far back Last 10 reads', () => {
  it('is twelve months before today, and never later than the season start', () => {
    expect(LAST_TEN_MONTHS).toBe(12);
    expect(lastTenFloor(new Date('2026-09-30T12:00:00Z'))).toBe('2025-09-30');
    expect(lastTenFloor(new Date('2026-01-15T00:00:00Z'))).toBe('2025-01-15');
    // The season starts on 1 August: on the last day of the season it is 364 days back, still inside the year.
    expect(lastTenFloor(new Date('2027-07-31T12:00:00Z')) <= '2026-08-01').toBe(true);
    expect(lastTenFloor(new Date('2026-08-01T12:00:00Z')) <= '2026-08-01').toBe(true);
  });
});
