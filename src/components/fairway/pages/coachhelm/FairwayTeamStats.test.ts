import { describe, it, expect } from 'vitest';
import {
  teamAvg,
  teamMeanFor,
  applyFormat,
  formatCounts,
  rankPlayers,
  buildTeamStatsCsv,
  computeMetricLeaders,
} from './FairwayTeamStats';
import type { TeamPlayerStats } from '@/app/golf/(dashboard)/dashboard/stats/team/page';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<TeamPlayerStats> = {}): TeamPlayerStats {
  return {
    id: 'p1',
    first_name: 'Test',
    last_name: 'Player',
    avatar_url: null,
    graduation_year: null,
    handicap: null,
    rounds_played: 0,
    scoring_average: null,
    best_round: null,
    worst_round: null,
    fairway_pct: null,
    gir_pct: null,
    putts_per_round: null,
    birdies_per_round: null,
    scoring_trend: null,
    rounds_played_18: 0,
    rounds_played_9: 0,
    scoring_average_18: null,
    scoring_average_9: null,
    best_round_18: null,
    best_round_9: null,
    ...overrides,
  };
}

function makeStanding(
  playerId: string,
  metric: MetricId,
  playerValue: number,
): PlayerStanding {
  return {
    player_id: playerId,
    metric_id: metric,
    player_value: playerValue,
    team_avg: null,
    team_n: 0,
    team_pct: null,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value: 0,
    pga_delta: playerValue,
    computed_at: '2026-06-09T00:00:00Z',
  };
}

function standingMap(
  entries: ReadonlyArray<{ playerId: string; metric: MetricId; value: number }>,
): Map<string, Map<MetricId, PlayerStanding>> {
  const byPlayer = new Map<string, Map<MetricId, PlayerStanding>>();
  for (const { playerId, metric, value } of entries) {
    const map = byPlayer.get(playerId) ?? new Map<MetricId, PlayerStanding>();
    map.set(metric, makeStanding(playerId, metric, value));
    byPlayer.set(playerId, map);
  }
  return byPlayer;
}

// ── teamAvg ───────────────────────────────────────────────────────────────────

describe('teamAvg', () => {
  it('weights by rounds_played by default', () => {
    // 40-round starter at 70.0 vs 2-round walk-on at 80.0 — the starter wins.
    const players = [
      makePlayer({ id: 'starter', scoring_average: 70, rounds_played: 40 }),
      makePlayer({ id: 'walkon', scoring_average: 80, rounds_played: 2 }),
    ];
    const result = teamAvg(players, (p) => p.scoring_average);
    expect(result).toBeCloseTo((70 * 40 + 80 * 2) / 42, 10);
    expect(result).not.toBeCloseTo(75, 1); // not the unweighted mean
  });

  it('weights percentage stats by rounds_played (Σ ÷ Σ proxy)', () => {
    const players = [
      makePlayer({ id: 'a', gir_pct: 60, rounds_played: 30 }),
      makePlayer({ id: 'b', gir_pct: 30, rounds_played: 10 }),
    ];
    expect(teamAvg(players, (p) => p.gir_pct)).toBeCloseTo(
      (60 * 30 + 30 * 10) / 40,
      10,
    );
  });

  it('skips players that do not carry the metric', () => {
    const players = [
      makePlayer({ id: 'a', fairway_pct: 50, rounds_played: 10 }),
      makePlayer({ id: 'b', fairway_pct: null, rounds_played: 100 }),
    ];
    expect(teamAvg(players, (p) => p.fairway_pct)).toBeCloseTo(50, 10);
  });

  it('returns null when no player carries the metric', () => {
    expect(teamAvg([], (p) => p.gir_pct)).toBeNull();
    expect(
      teamAvg([makePlayer({ gir_pct: null, rounds_played: 5 })], (p) => p.gir_pct),
    ).toBeNull();
  });

  it('falls back to the unweighted mean when no carrier has rounds', () => {
    const players = [
      makePlayer({ id: 'a', handicap: 2, rounds_played: 0 }),
      makePlayer({ id: 'b', handicap: 6, rounds_played: 0 }),
    ];
    expect(teamAvg(players, (p) => p.handicap)).toBeCloseTo(4, 10);
  });

  it('supports an explicit weigh override (equal-weight handicap)', () => {
    const players = [
      makePlayer({ id: 'a', handicap: 0, rounds_played: 40 }),
      makePlayer({ id: 'b', handicap: 10, rounds_played: 2 }),
    ];
    // Handicap is a player attribute — every player weighs equally.
    expect(teamAvg(players, (p) => p.handicap, () => 1)).toBeCloseTo(5, 10);
  });
});

// ── teamMeanFor (SG hero) ─────────────────────────────────────────────────────

describe('teamMeanFor', () => {
  it('weights per-player standing values by rounds_played', () => {
    const standings = standingMap([
      { playerId: 'starter', metric: 'sg_putting', value: 0.5 },
      { playerId: 'walkon', metric: 'sg_putting', value: -2.0 },
    ]);
    const rounds = new Map([
      ['starter', 40],
      ['walkon', 2],
    ]);
    const result = teamMeanFor('sg_putting', standings, rounds);
    expect(result).toBeCloseTo((0.5 * 40 + -2.0 * 2) / 42, 10);
    expect(result).not.toBeCloseTo(-0.75, 2); // not the unweighted mean
  });

  it('returns null when no player carries the metric (honest-empty)', () => {
    const standings = standingMap([
      { playerId: 'a', metric: 'sg_putting', value: 0.1 },
    ]);
    expect(teamMeanFor('sg_approach', standings, new Map([['a', 10]]))).toBeNull();
    expect(teamMeanFor('sg_total', new Map(), new Map())).toBeNull();
  });

  it('falls back to the unweighted mean when no carrier has a round count', () => {
    const standings = standingMap([
      { playerId: 'a', metric: 'sg_total', value: -1 },
      { playerId: 'b', metric: 'sg_total', value: -3 },
    ]);
    // Neither player appears in the rounds lookup.
    expect(teamMeanFor('sg_total', standings, new Map())).toBeCloseTo(-2, 10);
  });

  it('treats players missing from the rounds lookup as zero-weight when others have rounds', () => {
    const standings = standingMap([
      { playerId: 'a', metric: 'sg_ott', value: 1.0 },
      { playerId: 'ghost', metric: 'sg_ott', value: -9.0 },
    ]);
    expect(teamMeanFor('sg_ott', standings, new Map([['a', 12]]))).toBeCloseTo(1.0, 10);
  });
});

// ── applyFormat (P131) ─────────────────────────────────────────────────────────

describe('applyFormat', () => {
  const base = makePlayer({
    rounds_played: 10,
    scoring_average: 75,
    best_round: 70,
    rounds_played_18: 6,
    scoring_average_18: 74,
    best_round_18: 68,
    rounds_played_9: 4,
    scoring_average_9: 38,
    best_round_9: 35,
    // metrics WITHOUT a per-format split must survive untouched.
    fairway_pct: 55,
    gir_pct: 60,
    putts_per_round: 31,
    handicap: 2,
  });

  it("'all' returns the player untouched", () => {
    expect(applyFormat(base, 'all')).toEqual(base);
  });

  it("'18' swaps rounds / scoring avg / best to the 18-hole columns", () => {
    const out = applyFormat(base, '18');
    expect(out.rounds_played).toBe(6);
    expect(out.scoring_average).toBe(74);
    expect(out.best_round).toBe(68);
  });

  it("'9' swaps rounds / scoring avg / best to the 9-hole columns", () => {
    const out = applyFormat(base, '9');
    expect(out.rounds_played).toBe(4);
    expect(out.scoring_average).toBe(38);
    expect(out.best_round).toBe(35);
  });

  it('never fabricates non-format-split metrics for a format', () => {
    const out = applyFormat(base, '18');
    expect(out.fairway_pct).toBe(55);
    expect(out.gir_pct).toBe(60);
    expect(out.putts_per_round).toBe(31);
    expect(out.handicap).toBe(2);
  });

  it('carries null format columns through honestly (no fake 0)', () => {
    const noNine = makePlayer({ rounds_played_9: 0, scoring_average_9: null, best_round_9: null });
    const out = applyFormat(noNine, '9');
    expect(out.rounds_played).toBe(0);
    expect(out.scoring_average).toBeNull();
    expect(out.best_round).toBeNull();
  });
});

// ── formatCounts (P131) ─────────────────────────────────────────────────────────

describe('formatCounts', () => {
  it('sums each format across the roster', () => {
    const players = [
      makePlayer({ rounds_played: 10, rounds_played_18: 6, rounds_played_9: 4 }),
      makePlayer({ rounds_played: 5, rounds_played_18: 2, rounds_played_9: 3 }),
    ];
    expect(formatCounts(players)).toEqual({ all: 15, h18: 8, h9: 7 });
  });

  it('is all-zero for an empty roster', () => {
    expect(formatCounts([])).toEqual({ all: 0, h18: 0, h9: 0 });
  });
});

// ── rankPlayers (P132) ──────────────────────────────────────────────────────────

describe('rankPlayers', () => {
  const noComposite = () => null;

  it('ranks scoring average ascending (best/lowest first)', () => {
    const players = [
      makePlayer({ id: 'hi', scoring_average: 78 }),
      makePlayer({ id: 'lo', scoring_average: 71 }),
      makePlayer({ id: 'mid', scoring_average: 74 }),
    ];
    expect(rankPlayers(players, 'scoring_average', noComposite).map((p) => p.id)).toEqual([
      'lo',
      'mid',
      'hi',
    ]);
  });

  it('ranks fairway% descending (best/highest first)', () => {
    const players = [
      makePlayer({ id: 'a', fairway_pct: 40 }),
      makePlayer({ id: 'b', fairway_pct: 70 }),
    ];
    expect(rankPlayers(players, 'fairway_pct', noComposite).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('ranks scoring_trend ascending (most negative = improving = first)', () => {
    const players = [
      makePlayer({ id: 'declining', scoring_trend: 1.2 }),
      makePlayer({ id: 'improving', scoring_trend: -1.5 }),
      makePlayer({ id: 'steady', scoring_trend: 0.1 }),
    ];
    expect(rankPlayers(players, 'scoring_trend', noComposite).map((p) => p.id)).toEqual([
      'improving',
      'steady',
      'declining',
    ]);
  });

  it('ranks composite descending via the lookup', () => {
    const players = [makePlayer({ id: 'a' }), makePlayer({ id: 'b' }), makePlayer({ id: 'c' })];
    const composite = (id: string) => ({ a: 50, b: 90, c: 70 })[id] ?? null;
    expect(rankPlayers(players, 'composite', composite).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('sinks nulls to the bottom regardless of direction', () => {
    const players = [
      makePlayer({ id: 'has', scoring_average: 75 }),
      makePlayer({ id: 'none', scoring_average: null }),
      makePlayer({ id: 'better', scoring_average: 70 }),
    ];
    const ranked = rankPlayers(players, 'scoring_average', noComposite).map((p) => p.id);
    expect(ranked).toEqual(['better', 'has', 'none']);
  });

  it('ranks by name (last, first) alphabetically', () => {
    const players = [
      makePlayer({ id: 'z', first_name: 'Aaron', last_name: 'Zimmer' }),
      makePlayer({ id: 'a', first_name: 'Zoe', last_name: 'Adams' }),
    ];
    expect(rankPlayers(players, 'name', noComposite).map((p) => p.id)).toEqual(['a', 'z']);
  });

  it('does not mutate the input array', () => {
    const players = [
      makePlayer({ id: 'hi', scoring_average: 78 }),
      makePlayer({ id: 'lo', scoring_average: 71 }),
    ];
    const before = players.map((p) => p.id);
    rankPlayers(players, 'scoring_average', noComposite);
    expect(players.map((p) => p.id)).toEqual(before);
  });
});

// ── computeMetricLeaders (W6 — green-tick leader treatment) ─────────────────────

describe('computeMetricLeaders', () => {
  it('picks the lower scoring average / putts / best round as the leader', () => {
    const players = [
      makePlayer({ id: 'a', scoring_average: 78, putts_per_round: 32, best_round: 74 }),
      makePlayer({ id: 'b', scoring_average: 71, putts_per_round: 29, best_round: 68 }),
    ];
    const leaders = computeMetricLeaders(players);
    expect([...leaders.scoring_average]).toEqual(['b']);
    expect([...leaders.putts_per_round]).toEqual(['b']);
    expect([...leaders.best_round]).toEqual(['b']);
  });

  it('picks the higher fairway% / gir% as the leader', () => {
    const players = [
      makePlayer({ id: 'a', fairway_pct: 40, gir_pct: 35 }),
      makePlayer({ id: 'b', fairway_pct: 70, gir_pct: 60 }),
    ];
    const leaders = computeMetricLeaders(players);
    expect([...leaders.fairway_pct]).toEqual(['b']);
    expect([...leaders.gir_pct]).toEqual(['b']);
  });

  it('crowns every tied player (never arbitrarily picks one)', () => {
    const players = [
      makePlayer({ id: 'a', scoring_average: 72 }),
      makePlayer({ id: 'b', scoring_average: 72 }),
      makePlayer({ id: 'c', scoring_average: 80 }),
    ];
    const leaders = computeMetricLeaders(players);
    expect(new Set(leaders.scoring_average)).toEqual(new Set(['a', 'b']));
  });

  it('requires >= 2 comparable values — a solo carrier never "leads"', () => {
    const players = [
      makePlayer({ id: 'a', scoring_average: 72, fairway_pct: null }),
      makePlayer({ id: 'b', scoring_average: null, fairway_pct: null }),
    ];
    const leaders = computeMetricLeaders(players);
    expect(leaders.scoring_average.size).toBe(0);
    expect(leaders.fairway_pct.size).toBe(0);
  });

  it('is honestly empty on an empty roster', () => {
    const leaders = computeMetricLeaders([]);
    expect(leaders.scoring_average.size).toBe(0);
    expect(leaders.putts_per_round.size).toBe(0);
    expect(leaders.fairway_pct.size).toBe(0);
    expect(leaders.gir_pct.size).toBe(0);
    expect(leaders.best_round.size).toBe(0);
  });

  it('skips players missing the metric when comparing', () => {
    const players = [
      makePlayer({ id: 'a', best_round: 70 }),
      makePlayer({ id: 'b', best_round: null }),
      makePlayer({ id: 'c', best_round: 65 }),
    ];
    expect([...computeMetricLeaders(players).best_round]).toEqual(['c']);
  });
});

// ── buildTeamStatsCsv (P141) ────────────────────────────────────────────────────

describe('buildTeamStatsCsv', () => {
  const composite = (id: string) => ({ p1: 64 })[id] ?? null;

  it('emits a header, one row per player, and a team-average row', () => {
    const players = [
      makePlayer({
        id: 'p1',
        first_name: 'Jordan',
        last_name: 'Lee',
        graduation_year: 2027,
        rounds_played: 10,
        scoring_average: 74.4,
        best_round: 69,
        handicap: -1.2,
        fairway_pct: 55.5,
        gir_pct: 61.1,
        putts_per_round: 30.2,
        scoring_trend: -0.8,
      }),
    ];
    const csv = buildTeamStatsCsv(players, 'all', composite);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3); // header + 1 player + team average
    expect(lines[0]).toBe(
      'Player,Class,Rounds,Scoring Avg,Best,Handicap,FW%,GIR%,Putts,Composite,Trend',
    );
    expect(lines[1]).toContain('Jordan Lee');
    expect(lines[1]).toContain('Class of 2027');
    expect(lines[1]).toContain('74.4');
    expect(lines[1]).toContain('64'); // composite
    expect(lines[1]).toContain('+1.2'); // plus-handicap sign convention
    expect(lines[2]!.startsWith('Team average,')).toBe(true);
  });

  it('uses the selected format for the player rows', () => {
    const players = [
      makePlayer({
        id: 'p1',
        rounds_played: 10,
        rounds_played_18: 6,
        scoring_average_18: 73.0,
        best_round_18: 68,
      }),
    ];
    const csv18 = buildTeamStatsCsv(players, '18', () => null);
    const row18 = csv18.split('\r\n')[1]!.split(',');
    // Rounds (index 2) reflects the 18-hole count, scoring avg (3) the 18 figure.
    expect(row18[2]).toBe('6');
    expect(row18[3]).toBe('73.0');
  });

  it('writes empty cells (never a fake 0) for missing readings', () => {
    const players = [
      makePlayer({ id: 'p1', scoring_average: null, fairway_pct: null, putts_per_round: null }),
    ];
    const cells = buildTeamStatsCsv(players, 'all', () => null).split('\r\n')[1]!.split(',');
    expect(cells[3]).toBe(''); // scoring avg
    expect(cells[6]).toBe(''); // FW%
    expect(cells[8]).toBe(''); // putts
    expect(cells[9]).toBe(''); // composite (none)
  });

  it('quotes/escapes cells that contain commas or quotes', () => {
    const players = [makePlayer({ id: 'p1', first_name: 'Bob', last_name: 'Smith, Jr.' })];
    const csv = buildTeamStatsCsv(players, 'all', () => null);
    expect(csv.split('\r\n')[1]).toContain('"Bob Smith, Jr."');
  });
});
