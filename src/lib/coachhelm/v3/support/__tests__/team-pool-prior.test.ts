import { describe, expect, it } from 'vitest';
import { buildCandidate, teamPoolLineOf } from '../candidate';
import { evaluatePlayerRun, type SupportRow } from '../evaluate';

// Slice 7a: with coachhelm_team_pool_v1 on, a row carrying a team pool line
// (evidence.comparison.primary) is tested against the pool with its exact
// pooled count and shrinks toward it; off, or without the line, Slice 1b's
// leave-one-out team mean stands. Synthetic rows only.

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
      standing: { team_avg: 80, team_n: 8, player_value: 60 },
      ...(withPool
        ? { comparison: { primary: TEAM_POOL_LINE, lines: [TEAM_POOL_LINE] } }
        : {}),
    },
  };
}

function penalty(withPool: boolean): SupportRow {
  // 212 rounds named, but some were nine holes: 180 rounds' worth of holes.
  const line = { ...TEAM_POOL_LINE, value: 0.6, n: 212, unit: 'count', n_unit: 'rounds', n_noun: 'rounds', exposure_rounds: 180 };
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

describe('team pool benchmark and prior (Slice 7a on Slice 1b)', () => {
  it('reads the team pool line only when it is a usable team_pool primary', () => {
    expect(teamPoolLineOf({ comparison: { primary: TEAM_POOL_LINE } })).toEqual({ value: 72, n: 240, players: 6, exposureRounds: null });
    expect(teamPoolLineOf({})).toBeNull();
    expect(teamPoolLineOf({ comparison: { primary: { ...TEAM_POOL_LINE, source: 'tour' } } })).toBeNull();
    expect(teamPoolLineOf({ comparison: { primary: { ...TEAM_POOL_LINE, n: 0 } } })).toBeNull();
    expect(teamPoolLineOf({ comparison: { primary: { ...TEAM_POOL_LINE, value: null } } })).toBeNull();
    // A Slice 5a angle's own team_pool primary (a teammates' median, n = players) is not a pool.
    expect(
      teamPoolLineOf({ comparison: { primary: { source: 'team_pool', label: "Teammates' median", value: 62, n: 6 } } }),
    ).toBeNull();
    expect(teamPoolLineOf({ comparison: { primary: { ...TEAM_POOL_LINE, players: undefined } } })).toBeNull();
  });

  it('tests against the pool with its exact pooled count and shrinks toward it (flag on)', () => {
    const c = buildCandidate(puttDistance(true), { teamPool: true });
    expect(c.benchmark).toEqual({ source: 'team', value: 72, basis: 'team_pool', pool_n: 6, pooled_n: 240 });
    // The pooled putts, not 1b's "each teammate putted as often as you" (80 × 7).
    expect(c.gapInput).toMatchObject({ kind: 'proportion', k: 48, n: 80, benchmark: 0.72, benchmarkN: 240 });
    expect(c.prior).toEqual({ source: 'team_pool', value: 72 });

    const patch = evaluatePlayerRun([puttDistance(true)], { teamPool: true }).rows[0]!.patch;
    expect(patch.shrink).toMatchObject({ prior_source: 'team_pool', prior_value: 72 });
    expect(patch.support.benchmark).toEqual({ source: 'team', value: 72 });
    expect(patch.support.benchmark_basis).toBe('team_pool');
    expect(patch.support.benchmark_variance).toBe(true);
  });

  it('is exactly Slice 1b with the flag off, even with a pool on the row', () => {
    const on = evaluatePlayerRun([puttDistance(true)]).rows[0]!.patch;
    const plain = evaluatePlayerRun([puttDistance(false)]).rows[0]!.patch;
    expect(on).toEqual(plain);
    expect(on.support.benchmark_basis).toBe('team_loo');
    expect(on.shrink).toMatchObject({ prior_source: 'team' });
    expect(buildCandidate(puttDistance(true)).gapInput).toMatchObject({ benchmarkN: 80 * 7 });
  });

  it('falls back to Slice 1b when the row has no pool line', () => {
    const on = evaluatePlayerRun([puttDistance(false)], { teamPool: true }).rows[0]!.patch;
    const off = evaluatePlayerRun([puttDistance(false)]).rows[0]!.patch;
    expect(on).toEqual(off);
    expect(on.support.benchmark_basis).toBe('team_loo');
  });

  it("uses the pool's exposure (holes / 18), not the rounds it names, for a per-round rate", () => {
    const c = buildCandidate(penalty(true), { teamPool: true });
    expect(c.prior).toEqual({ source: 'team_pool', value: 0.6 });
    expect(c.benchmark).toMatchObject({ basis: 'team_pool', value: 0.6, pooled_n: 180 });
    expect(c.gapInput).toMatchObject({ kind: 'rate_per_round', benchmark: 0.6, benchmarkRounds: 180 });
    expect(buildCandidate(penalty(true))).toEqual(buildCandidate(penalty(false)));
  });

  it('a per-round pool line without its exposure is the prior only, never the benchmark', () => {
    const row = penalty(true);
    const ev = row.evidence as { comparison: { primary: Record<string, unknown> } };
    const { exposure_rounds: _drop, ...noExposure } = ev.comparison.primary;
    void _drop;
    const bare = { ...row, evidence: { ...ev, comparison: { primary: noExposure, lines: [noExposure] } } };
    const c = buildCandidate(bare, { teamPool: true });
    expect(c.prior).toEqual({ source: 'team_pool', value: 0.6 });
    expect(c.benchmark?.basis).not.toBe('team_pool');
    expect(c.gapInput).not.toMatchObject({ benchmarkRounds: 212 });
  });

  it('applies to gated rows too, so BH sees the same tests', () => {
    const run = evaluatePlayerRun([puttDistance(true)], { teamPool: true, gated: [penalty(true)] });
    const off = evaluatePlayerRun([puttDistance(true)], { gated: [penalty(true)] });
    expect(run.rows[0]!.patch.support.m_basis).toMatchObject({ m_gated: 1 });
    expect(run.rows[0]!.patch.support.p_bh).not.toEqual(off.rows[0]!.patch.support.p_bh);
  });
});
