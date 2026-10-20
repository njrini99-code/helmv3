import { describe, expect, it } from 'vitest';
import { detectStandingShifts, meanTeamPctByPlayer } from './percentile-shift';

describe('standing percentile shift (audit row 53)', () => {
  it('averages team_pct per player and ignores nulls', () => {
    const m = meanTeamPctByPlayer([
      { player_id: 'a', team_pct: 40 },
      { player_id: 'a', team_pct: 60 },
      { player_id: 'a', team_pct: null },
      { player_id: 'b', team_pct: null },
    ]);
    expect(m.get('a')).toBe(50);
    expect(m.has('b')).toBe(false);
  });

  it('flags only moves of at least the threshold, with direction', () => {
    const before = new Map([['a', 50], ['b', 50], ['c', 50]]);
    const after = new Map([['a', 62], ['b', 45], ['c', 38], ['d', 90]]);
    expect(detectStandingShifts(before, after)).toEqual([
      { player_id: 'a', direction: 'up', before: 50, after: 62 },
      { player_id: 'c', direction: 'down', before: 50, after: 38 },
    ]);
  });
});

import { isWeeklyDigestDay, playersWithWeeklyActivity } from './percentile-shift';

describe('weekly digest trigger (audit row 53)', () => {
  it('fires on Mondays UTC only', () => {
    expect(isWeeklyDigestDay(new Date('2026-09-28T06:00:00Z'))).toBe(true);
    expect(isWeeklyDigestDay(new Date('2026-09-29T06:00:00Z'))).toBe(false);
  });
  it('dedupes players and drops nulls', () => {
    expect(playersWithWeeklyActivity([{ player_id: 'a' }, { player_id: 'a' }, { player_id: null }, { player_id: 'b' }])).toEqual(['a', 'b']);
  });
});
