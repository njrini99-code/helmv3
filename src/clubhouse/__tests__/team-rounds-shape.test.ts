import { describe, expect, it } from 'vitest';
import { groupTeamRounds } from '../screens/rounds/TeamRounds';
import { teamSeasonFrom, toTeamRounds, type ChTeamRoundRow } from '../data/team-rounds-shape';

/** A round's total is its nines (the canonical total), so `score` sets the back nine against a 36 front. */
const row = (over: Partial<ChTeamRoundRow> & Pick<ChTeamRoundRow, 'id' | 'player_id' | 'round_date'>): ChTeamRoundRow =>
  ({
    course_name: 'Finley GC',
    tees_played: 'Blue',
    round_type: 'practice',
    total_score: 72,
    score_to_par: 0,
    front_nine: 36,
    back_nine: 36,
    holes_played: 18,
    total_putts: 30,
    total_fairways_hit: 8,
    total_fairways: 14,
    total_gir: 12,
    total_gir_possible: 18,
    ...over,
  }) as ChTeamRoundRow;

const names = new Map([
  ['a', 'Ada Park'],
  ['b', 'Ben Ortiz'],
]);

describe('toTeamRounds', () => {
  it('CH-11322 lists newest first, names the player on each round, and counts rounds with no score instead of dropping them silently', () => {
    const { list, unscored } = toTeamRounds(
      [
        row({ id: 'r1', player_id: 'a', round_date: '2026-09-01' }),
        row({ id: 'r2', player_id: 'b', round_date: '2026-10-02', total_score: 70, score_to_par: -2, back_nine: 34 }),
        row({ id: 'r3', player_id: 'a', round_date: '2026-10-03', total_score: null, score_to_par: null, front_nine: null, back_nine: null }),
      ],
      names,
    );
    expect(list.map((r) => [r.id, r.player])).toEqual([
      ['r2', 'Ben Ortiz'],
      ['r1', 'Ada Park'],
    ]);
    expect(unscored).toBe(1);
  });

  it('shows "Unnamed player" for a round whose player the roster read did not return', () => {
    const { list } = toTeamRounds([row({ id: 'r1', player_id: 'zzz', round_date: '2026-09-01' })], names);
    expect(list[0]?.player).toBe('Unnamed player');
  });
});

describe('teamSeasonFrom', () => {
  const rounds = toTeamRounds(
    [
      row({ id: 'r1', player_id: 'a', round_date: '2026-07-20', total_score: 80, score_to_par: 8, back_nine: 44 }),
      row({ id: 'r2', player_id: 'a', round_date: '2026-08-10', total_score: 74, score_to_par: 2, back_nine: 38 }),
      row({ id: 'r3', player_id: 'b', round_date: '2026-09-10', total_score: 70, score_to_par: -2, back_nine: 34 }),
      row({ id: 'r4', player_id: 'b', round_date: '2026-09-20', total_score: 71, score_to_par: -1, back_nine: 35 }),
      row({ id: 'r5', player_id: 'b', round_date: '2026-09-25', total_score: 40, score_to_par: 4, holes_played: 9, front_nine: 40, back_nine: null }),
    ],
    names,
  ).list;

  it('CH-11319 counts the season from 1 August, 18-hole rounds only, with the player count, average, under-par rounds and the low round', () => {
    const s = teamSeasonFrom(rounds, '2026-08-01');
    expect(s.rounds).toBe(3);
    expect(s.players).toBe(2);
    expect(s.avg).toBeCloseTo((74 + 70 + 71) / 3, 6);
    expect(s.underPar).toBe(2);
    expect(s.best).toMatchObject({ score: 70, toPar: -2, player: 'Ben Ortiz' });
  });

  it('is empty, not NaN, when nothing is in the season', () => {
    const s = teamSeasonFrom(rounds, '2027-08-01');
    expect(s).toMatchObject({ rounds: 0, players: 0, avg: null, underPar: 0, best: null });
  });

  it('falls back to the lowest gross score for the low round when no round has a score to par', () => {
    const noPar = toTeamRounds(
      [
        row({ id: 'n1', player_id: 'a', round_date: '2026-09-01', total_score: 75, score_to_par: null, back_nine: 39 }),
        row({ id: 'n2', player_id: 'b', round_date: '2026-09-02', total_score: 71, score_to_par: null, back_nine: 35 }),
      ],
      names,
    ).list;
    const s = teamSeasonFrom(noPar, '2026-08-01');
    expect(s.best).toMatchObject({ score: 71, toPar: null, player: 'Ben Ortiz' });
  });
});

describe('groupTeamRounds by player', () => {
  it('keeps two players who share a display name in separate groups', () => {
    const twins = toTeamRounds(
      [
        row({ id: 't1', player_id: 'a', round_date: '2026-09-01' }),
        row({ id: 't2', player_id: 'c', round_date: '2026-09-02' }),
      ],
      new Map([
        ['a', 'Sam Lee'],
        ['c', 'Sam Lee'],
      ]),
    ).list;
    const groups = groupTeamRounds(twins, 'player', '', 'all');
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.title)).toEqual(['Sam Lee', 'Sam Lee']);
    expect(groups.map((g) => g.rounds.length)).toEqual([1, 1]);
  });
});
