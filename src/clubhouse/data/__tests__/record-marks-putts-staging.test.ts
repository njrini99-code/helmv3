import { describe, expect, it } from 'vitest';
import { historyTeam } from '../round-history';
import { toReviewHistory, type ChHistoryRoundRow } from '../round-history-shape';

/**
 * Owner's preview, 11 Nov 2026: a coach of two teams opened a 37-putt round posted for team A and read "Ties fewest putts this
 * season · 37". The review's history was the coach's own team's rounds (team B: 37, 38, 39 putts), not the round's team's 17.
 * Staging's figures, ids and names replaced.
 */
const row = (i: number, team: 'A' | 'B', d: string, t: number, f: number, b: number, p: number | null): ChHistoryRoundRow & { team: string } => ({
  id: `r${String(i).padStart(2, '0')}`, team, course_id: `c${i % 5}`, course_name: `Course ${i % 5}`, tees_played: null, tee_id: null, round_date: d, holes_played: 18, total_score: t, front_nine: f, back_nine: b, total_putts: p,
});
const rounds = [
  row(0, 'A', '2026-10-21', 73, 38, 35, 30), row(1, 'A', '2026-10-21', 74, 36, 38, 37), row(2, 'A', '2026-10-21', 77, 37, 40, 37), row(3, 'A', '2026-10-06', 82, 44, 38, 31),
  row(4, 'A', '2026-09-30', 75, 36, 39, 30), row(5, 'A', '2026-09-29', 68, 31, 37, 31), row(6, 'A', '2026-09-15', 77, 37, 40, 30), row(7, 'A', '2026-09-13', 87, 47, 40, 31),
  row(8, 'A', '2026-09-06', 82, 41, 41, 36), row(9, 'A', '2026-08-27', 81, 41, 40, 34), row(10, 'A', '2026-08-26', 77, 38, 39, 31), row(11, 'A', '2026-08-25', 76, 40, 36, 31),
  row(12, 'B', '2026-08-02', 69, 35, 34, 37), row(13, 'B', '2026-08-02', 70, 35, 35, 38), row(14, 'B', '2026-08-02', 71, 36, 35, 39),
  row(15, 'B', '2026-09-25', 71, 36, 35, null), row(16, 'B', '2026-09-26', 70, 35, 35, null),
];
const reviewed = rounds[1]!;
const historyFor = (team: string | null) => toReviewHistory({ round: reviewed, list: rounds.filter((r) => team === null || r.team === team), holes: new Map(), seasonStart: '2026-08-01' });
const labels = (team: string | null) => historyFor(team).records.map((m) => m.label);

describe('the review compares a round with its own team’s rounds', () => {
  it('reproduces the bug: against the other team’s rounds, 37 putts "ties the fewest"', () => {
    expect(labels('B')).toContain('Ties fewest putts this season · 37');
  });

  it('against its own team’s rounds, 37 putts is not a record', () => {
    expect(labels('A').join(' | ')).not.toMatch(/putts/i);
  });

  it('a coach’s history team is the reviewed round’s team, then the coach’s; a player’s is none', () => {
    expect(historyTeam({ role: 'coach', teamId: 'B' }, 'A')).toBe('A');
    expect(historyTeam({ role: 'coach', teamId: 'B' }, null)).toBe('B');
    expect(historyTeam({ role: 'player', teamId: 'B' }, 'A')).toBeNull();
  });
});
