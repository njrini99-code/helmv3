import { describe, expect, it } from 'vitest';
import { computeMondayBrief } from '../brief';

// DF-P-10: the brief's week is dated on the team's clock. 05:00 UTC on Monday 19 October is still Sunday evening in
// Los Angeles, so that team's week runs Sunday 11 to Saturday 17 and Sunday 18 is today, not last week.
const NOW = new Date('2026-10-19T05:00:00Z');
const roster = [{ id: 'p0', name: 'Player 0' }];
const rounds = [
  { player_id: 'p0', day: '2026-10-11' },
  { player_id: 'p0', day: '2026-10-14' },
  { player_id: 'p0', day: '2026-10-18' },
];
const brief = (tz?: string) => computeMondayBrief({ teamId: 't', roster, reads: [], rounds, teamPattern: null, withEnoughRounds: 1, now: NOW, tz });

describe('computeMondayBrief on the team clock', () => {
  it('dates the week and counts last week’s rounds in the team’s zone', () => {
    const b = brief('America/Los_Angeles');
    expect(b.week_start).toBe('2026-10-11');
    expect(b.week_end).toBe('2026-10-18');
    expect(b.rounds_last_week).toBe(2);
  });

  it('keeps UTC dates when no zone is given', () => {
    const b = brief();
    expect(b.week_start).toBe('2026-10-12');
    expect(b.week_end).toBe('2026-10-19');
    expect(b.rounds_last_week).toBe(2);
  });
});
