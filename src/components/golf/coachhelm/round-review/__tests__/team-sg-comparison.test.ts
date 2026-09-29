import { describe, expect, it } from 'vitest';
import { computeTeamSgComparison, type TeamSgRoundRow } from '../team-sg-comparison';

const row = (id: string, sg: number | null, over: Partial<TeamSgRoundRow> = {}): TeamSgRoundRow => ({
  id,
  strokes_gained_total: sg,
  holes_played: 18,
  total_score: 76,
  front_nine: 38,
  back_nine: 38,
  total_putts: 31,
  ...over,
});

describe('computeTeamSgComparison (audit row 46)', () => {
  it('returns null below the minimum round count', () => {
    const rows = [row('a', -2), row('b', -3), row('c', -4), row('d', -5)];
    expect(computeTeamSgComparison(rows, 'x', -1)).toBeNull();
  });

  it('averages the team and reports this round against it', () => {
    const rows = [row('a', -2), row('b', -4), row('c', -6), row('d', -8), row('e', -10)];
    const r = computeTeamSgComparison(rows, 'x', -3);
    expect(r).not.toBeNull();
    expect(r!.teamMean).toBeCloseTo(-6);
    expect(r!.rounds).toBe(5);
    expect(r!.vsTeam).toBeCloseTo(3);
  });

  it('excludes the current round, rounds without SG, and non-countable rounds', () => {
    const rows = [
      row('x', 5),
      row('a', -2),
      row('b', null),
      row('c', -4, { holes_played: 18, total_score: 20, front_nine: 10, back_nine: 10 }),
      row('d', -6),
      row('e', -8),
      row('f', -10),
      row('g', -12),
    ];
    const r = computeTeamSgComparison(rows, 'x', null);
    expect(r!.rounds).toBe(5);
    expect(r!.teamMean).toBeCloseTo(-7.6);
    expect(r!.vsTeam).toBeNull();
  });
});
