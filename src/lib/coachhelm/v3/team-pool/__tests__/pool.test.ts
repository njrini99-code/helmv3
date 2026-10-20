import { describe, expect, it } from 'vitest';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import {
  TEAM_POOL_FAMILIES,
  computeTeamPool,
  familyForRead,
  poolWindowFor,
  puttBandOf,
  tallyRound,
  withTeamComparison,
  type PoolHole,
  type PoolPlayer,
  type PoolRound,
  type TeamPool,
} from '../pool';

// Synthetic fixtures only: ids and numbers are made up.

const hole = (over: Partial<PoolHole> = {}): PoolHole => ({
  par: 4,
  score: 4,
  putts: 2,
  penalty_strokes: 0,
  gir: true,
  sand_save: null,
  up_and_down: null,
  ...over,
});

let seq = 0;
/** A countable 18-hole round (front + back nine, plausible total). */
function round(date: string, over: Partial<PoolRound> = {}): PoolRound {
  seq += 1;
  return {
    id: `r${seq}`,
    round_date: date,
    is_test: false,
    holes_played: 18,
    total_score: 72,
    front_nine: 36,
    back_nine: 36,
    total_putts: 36,
    holes: Array.from({ length: 18 }, () => hole()),
    // 10 putts from 4 ft a round, 7 made.
    putts: [
      ...Array.from({ length: 7 }, () => ({ feet: 4, made: true })),
      ...Array.from({ length: 3 }, () => ({ feet: 4, made: false })),
    ],
    approaches: [
      { band: '125_175ft', green_hit: true },
      { band: '125_175ft', green_hit: false },
    ],
    ...over,
  };
}

function player(id: string, n: number, over: Partial<PoolRound> = {}): PoolPlayer {
  return { player_id: id, rounds: Array.from({ length: n }, (_, i) => round(`2026-09-${String(10 + i).padStart(2, '0')}`, over)) };
}

const WINDOW = { start: '2026-09-01', end: '2026-10-15' };

/** The player plus `k` teammates with `rounds` rounds each. */
function team(k: number, rounds = 4, playerOver: Partial<PoolRound> = {}): PoolPlayer[] {
  return [player('me', 5, playerOver), ...Array.from({ length: k }, (_, i) => player(`t${i}`, rounds))];
}

describe('computeTeamPool', () => {
  it('pools teammates attempts (not their median) and reports the count and contributors', () => {
    const out = computeTeamPool({ players: team(4), playerId: 'me', family: 'putt_make:3_5ft', window: WINDOW });
    expect(out.kind).toBe('pool');
    const pool = (out as { pool: TeamPool }).pool;
    // 4 teammates × 4 rounds × 10 putts = 160 putts, 112 made.
    expect(pool.n).toBe(160);
    expect(pool.value).toBe(70);
    expect(pool.players).toBe(4);
    expect(pool.unit).toBe('percent');
    expect(pool.n_noun).toBe('putts');
  });

  it("never pools the player's own attempts", () => {
    // The player makes everything; the teammates' 70% must be untouched by it.
    const players = team(4, 4, { putts: Array.from({ length: 50 }, () => ({ feet: 4, made: true })) });
    const out = computeTeamPool({ players, playerId: 'me', family: 'putt_make:3_5ft', window: WINDOW });
    expect(out.kind === 'pool' && out.pool.value).toBe(70);
    expect(out.kind === 'pool' && out.pool.n).toBe(160);
  });

  it('privacy: under 5 rostered players with a countable round, there is no team line', () => {
    // 4 players with rounds in all (the player + 3 teammates).
    const out = computeTeamPool({ players: team(3, 10), playerId: 'me', family: 'putt_make:3_5ft', window: WINDOW });
    expect(out).toEqual({ kind: 'none', reason: 'privacy_roster' });
  });

  it('floor: needs 4 teammates with at least 3 countable rounds', () => {
    // 5 with rounds, but only 3 teammates have 3+; one has 2.
    const players = [...team(3, 4), player('t-thin', 2)];
    const out = computeTeamPool({ players, playerId: 'me', family: 'putt_make:3_5ft', window: WINDOW });
    expect(out).toEqual({ kind: 'none', reason: 'teammate_floor' });
  });

  it('a teammate with fewer than 3 rounds does not contribute attempts', () => {
    const players = [...team(4, 4), player('t-thin', 2, { putts: Array.from({ length: 40 }, () => ({ feet: 4, made: false })) })];
    const out = computeTeamPool({ players, playerId: 'me', family: 'putt_make:3_5ft', window: WINDOW });
    expect(out.kind === 'pool' && out.pool.n).toBe(160);
    expect(out.kind === 'pool' && out.pool.players).toBe(4);
  });

  it('test rounds are excluded (and so are uncountable ones)', () => {
    // Each teammate has 2 real rounds plus 2 test rounds and 2 nine-hole-missing rounds:
    // nobody reaches 3 countable rounds.
    const players: PoolPlayer[] = [
      player('me', 5),
      ...Array.from({ length: 4 }, (_, i) => ({
        player_id: `t${i}`,
        rounds: [
          round('2026-09-10'),
          round('2026-09-11'),
          round('2026-09-12', { is_test: true }),
          round('2026-09-13', { is_test: true }),
          round('2026-09-14', { back_nine: null }),
        ],
      })),
    ];
    const out = computeTeamPool({ players, playerId: 'me', family: 'putt_make:3_5ft', window: WINDOW });
    expect(out).toEqual({ kind: 'none', reason: 'teammate_floor' });
  });

  it('rounds outside the window do not count', () => {
    const out = computeTeamPool({
      players: team(4),
      playerId: 'me',
      family: 'putt_make:3_5ft',
      window: { start: '2026-10-01', end: '2026-10-15' },
    });
    expect(out).toEqual({ kind: 'none', reason: 'privacy_roster' });
  });

  it('needs 4 teammates with attempts in the family itself', () => {
    // Only two teammates ever had a bunker hole.
    const players = team(4);
    for (const t of players.slice(1, 3)) {
      t.rounds = t.rounds.map((r) => ({ ...r, holes: r.holes.map((h, i) => (i < 10 ? { ...h, sand_save: i % 2 === 0 } : h)) }));
    }
    const out = computeTeamPool({ players, playerId: 'me', family: 'sand_save', window: WINDOW });
    expect(out).toEqual({ kind: 'none', reason: 'family_players' });
  });

  it('under 100 pooled attempts there is no line', () => {
    // 4 teammates × 3 rounds × 2 approaches from 125-175 = 24 attempts.
    const out = computeTeamPool({ players: team(4, 3), playerId: 'me', family: 'approach_green_hit:125_175ft', window: WINDOW });
    expect(out).toEqual({ kind: 'none', reason: 'pooled_attempts' });
  });

  it('penalties per round: per 18 holes, counted in rounds, with no attempt floor', () => {
    const players = team(4, 3, {});
    for (const t of players.slice(1)) {
      t.rounds = t.rounds.map((r) => ({ ...r, holes: r.holes.map((h, i) => (i === 0 ? { ...h, penalty_strokes: 1 } : h)) }));
    }
    const out = computeTeamPool({ players, playerId: 'me', family: 'penalty_rate', window: WINDOW });
    expect(out.kind).toBe('pool');
    const pool = (out as { pool: TeamPool }).pool;
    expect(pool.value).toBe(1);
    expect(pool.n).toBe(12);
    expect(pool.n_unit).toBe('rounds');
  });

  it('par scoring: mean strokes per par-N hole', () => {
    const players = team(4);
    for (const t of players.slice(1)) {
      t.rounds = t.rounds.map((r) => ({ ...r, holes: r.holes.map((h, i) => (i < 4 ? { ...h, par: 3, score: i % 2 === 0 ? 3 : 4 } : h)) }));
    }
    const out = computeTeamPool({ players, playerId: 'me', family: 'par_scoring:3', window: WINDOW });
    // 4 × 4 rounds × 4 par 3s = 64 holes < 100.
    expect(out).toEqual({ kind: 'none', reason: 'pooled_attempts' });
    const four = computeTeamPool({ players, playerId: 'me', family: 'par_scoring:4', window: WINDOW });
    expect(four.kind === 'pool' && four.pool).toMatchObject({ value: 4, n: 224, unit: 'strokes' });
  });

  it('every family computes on the fixture without throwing', () => {
    for (const family of TEAM_POOL_FAMILIES) {
      expect(() => computeTeamPool({ players: team(6, 6), playerId: 'me', family, window: WINDOW })).not.toThrow();
    }
  });
});

describe('tallyRound', () => {
  it('uses the stats-cache putt band edges (3 < ft <= 5, clamp 0..120)', () => {
    expect(puttBandOf(3)).toBeNull();
    expect(puttBandOf(3.1)).toBe('3_5ft');
    expect(puttBandOf(5)).toBe('3_5ft');
    expect(puttBandOf(25)).toBe('15_25ft');
    expect(puttBandOf(400)).toBe('25_plus_ft');
  });

  it('three-putts per putted hole, scrambling only on missed greens with the flag', () => {
    const r = {
      holes: [
        hole({ putts: 3 }),
        hole({ putts: 2 }),
        hole({ putts: null }),
        hole({ gir: false, up_and_down: true }),
        hole({ gir: false, up_and_down: null }),
        hole({ gir: true, up_and_down: true }),
      ],
      putts: [],
      approaches: [],
    };
    expect(tallyRound(r, 'three_putt')).toEqual({ num: 1, den: 5 });
    expect(tallyRound(r, 'scrambling')).toEqual({ num: 1, den: 1 });
    expect(tallyRound(r, 'gir')).toEqual({ num: 4, den: 6 });
  });
});

describe('familyForRead', () => {
  it('maps by insight type and metric, never a putt-bias row onto a make rate', () => {
    expect(familyForRead('putt_distance', 'putts_made_5_10ft_pct')).toBe('putt_make:5_10ft');
    expect(familyForRead('putt_bias', 'putts_made_3_5ft_pct')).toBeNull();
    expect(familyForRead('approach_miss', 'approach_proximity_175_plus_ft')).toBe('approach_green_hit:175_plus_ft');
    expect(familyForRead('scrambling', 'scrambling_pct_sand')).toBe('sand_save');
    expect(familyForRead('par_scoring', 'scoring_par_5')).toBe('par_scoring:5');
    expect(familyForRead('course_management', 'penalty_rate_per_round')).toBe('penalty_rate');
    expect(familyForRead('course_management', 'big_number_rate')).toBeNull();
    expect(familyForRead('tee_strategy', 'sg_ott')).toBeNull();
  });
});

describe('poolWindowFor', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  it('uses the stamped bounds, else window_days back from the end, else from the beginning', () => {
    expect(poolWindowFor({ window_start: '2026-08-01', window_end: '2026-10-10', window_days: 70 }, now)).toEqual({ start: '2026-08-01', end: '2026-10-10' });
    expect(poolWindowFor({ window_start: '', window_end: '2026-10-10', window_days: 10 }, now)).toEqual({ start: '2026-09-30', end: '2026-10-10' });
    expect(poolWindowFor({ window_start: '', window_end: '', window_days: 0, window_basis: 'lifetime' }, now)).toEqual({ start: null, end: '2026-10-20' });
  });
});

describe('withTeamComparison', () => {
  const pool: TeamPool = {
    family: 'putt_make:3_5ft',
    value: 72,
    n: 240,
    n_unit: 'putts',
    n_noun: 'putts',
    unit: 'percent',
    players: 6,
    window_start: null,
    window_end: '2026-10-15',
  };
  const evidence = {
    metric: 'putts_made_3_5ft_pct',
    unit: 'percent',
    your_value: 61,
    comparison_value: 90.5,
    comparison_label: 'PGA Tour make % avg',
    comparison_source: 'pga_baseline',
  } as unknown as InsightEvidence;

  it('makes the team line primary, keeps the Tour as a further line, and leaves the flat fields alone', () => {
    const out = withTeamComparison(evidence, pool);
    expect(out.comparison?.primary).toMatchObject({ source: 'team_pool', label: 'Team pool', value: 72, n: 240, unit: 'percent', players: 6 });
    expect(out.comparison?.lines.map((l) => l.source)).toEqual(['team_pool', 'tour']);
    expect(out.comparison?.lines[1]).toMatchObject({ value: 90.5, label: 'PGA Tour make % avg', n: null });
    expect(out.comparison_value).toBe(90.5);
    expect(out.comparison_source).toBe('pga_baseline');
  });

  it('adds no Tour line when the flat comparison is not a Tour anchor (par scoring)', () => {
    const out = withTeamComparison({ ...evidence, comparison_source: 'absolute_target', comparison_value: 4 } as InsightEvidence, pool);
    expect(out.comparison?.lines.map((l) => l.source)).toEqual(['team_pool']);
  });

  it('the stored line names no teammate', () => {
    const json = JSON.stringify(withTeamComparison(evidence, pool).comparison);
    expect(json).not.toMatch(/player_id|t\d|name/);
  });
});
