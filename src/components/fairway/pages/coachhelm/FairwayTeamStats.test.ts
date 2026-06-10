import { describe, it, expect } from 'vitest';
import { teamAvg, teamMeanFor } from './FairwayTeamStats';
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
