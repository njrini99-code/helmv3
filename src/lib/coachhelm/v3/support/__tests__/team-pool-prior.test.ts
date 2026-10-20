import { describe, expect, it } from 'vitest';
import { buildCandidate, teamPoolPriorOf } from '../candidate';
import { evaluatePlayerRun, type SupportRow } from '../evaluate';

// Slice 7a: with coachhelm_team_pool_v1 on, the shrink prior is the team
// pool the row carries (evidence.comparison.primary), else Slice 1's prior.
// Synthetic rows only.

const TEAM_POOL_LINE = {
  source: 'team_pool',
  label: 'Team pool',
  value: 72,
  n: 240,
  unit: 'percent',
  n_unit: 'attempts',
  n_noun: 'putts',
  players: 6,
};

function puttDistance(withPool: boolean): SupportRow {
  return {
    id: 'pd',
    insight_type: 'putt_distance',
    evidence: {
      metric: 'putts_made_3_5ft_pct',
      unit: 'percent',
      your_value: 60,
      sample_n: 80,
      comparison_value: 96,
      comparison_source: 'pga_baseline',
      strokes_impact: 0.8,
      strokes_impact_method: 'peer_delta',
      detail: { band_attempts: 80, rounds_played: 10 },
      standing: { team_avg: 80, team_n: 8 },
      ...(withPool
        ? { comparison: { primary: TEAM_POOL_LINE, lines: [TEAM_POOL_LINE] } }
        : {}),
    },
  };
}

function penalty(withPool: boolean): SupportRow {
  const line = { ...TEAM_POOL_LINE, value: 0.6, n: 212, unit: 'count', n_unit: 'rounds', n_noun: 'rounds' };
  return {
    id: 'pen',
    insight_type: 'course_management',
    evidence: {
      metric: 'penalty_rate_per_round',
      unit: 'count',
      your_value: 1.5,
      sample_n: 10,
      comparison_value: 0.3,
      comparison_source: 'pga_baseline',
      strokes_impact: 0.6,
      detail: { rounds_played: 10, penalties: 15 },
      standing: { team_avg: 0.9, team_n: 9 },
      ...(withPool ? { comparison: { primary: line, lines: [line] } } : {}),
    },
  };
}

describe('team pool as the shrink prior (Slice 7a)', () => {
  it('reads the team pool line only when it is a usable team_pool primary', () => {
    expect(teamPoolPriorOf({ comparison: { primary: TEAM_POOL_LINE } })).toEqual({ source: 'team_pool', value: 72 });
    expect(teamPoolPriorOf({})).toBeNull();
    expect(teamPoolPriorOf({ comparison: { primary: { ...TEAM_POOL_LINE, source: 'tour' } } })).toBeNull();
    expect(teamPoolPriorOf({ comparison: { primary: { ...TEAM_POOL_LINE, n: 0 } } })).toBeNull();
    expect(teamPoolPriorOf({ comparison: { primary: { ...TEAM_POOL_LINE, value: null } } })).toBeNull();
  });

  it('shrinks toward the team pool with the option on', () => {
    const pd = evaluatePlayerRun([puttDistance(true)], { teamPoolPrior: true }).rows[0].patch;
    expect(pd.shrink).toMatchObject({ prior_source: 'team_pool', prior_value: 72 });
    // The gap test still runs against Slice 1's benchmark: only the prior moved.
    expect(pd.support.benchmark).toMatchObject({ source: 'team', value: 80 });
  });

  it('keeps Slice 1 prior when the option is off, even with a pool on the row', () => {
    const on = evaluatePlayerRun([puttDistance(true)]).rows[0].patch;
    const plain = evaluatePlayerRun([puttDistance(false)]).rows[0].patch;
    expect(on.shrink).toMatchObject({ prior_source: 'team', prior_value: 80 });
    expect(on).toEqual(plain);
  });

  it('falls back to Slice 1 prior when the row has no pool line', () => {
    const pd = evaluatePlayerRun([puttDistance(false)], { teamPoolPrior: true }).rows[0].patch;
    const off = evaluatePlayerRun([puttDistance(false)]).rows[0].patch;
    expect(pd).toEqual(off);
    expect(pd.shrink).toMatchObject({ prior_source: 'team', prior_value: 80 });
  });

  it('uses the per-round pool for a rate read', () => {
    const c = buildCandidate(penalty(true), { teamPoolPrior: true });
    expect(c.prior).toEqual({ source: 'team_pool', value: 0.6 });
    expect(buildCandidate(penalty(true)).prior).toEqual(buildCandidate(penalty(false)).prior);
  });
});
