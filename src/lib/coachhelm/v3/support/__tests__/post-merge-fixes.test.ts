/**
 * Slice 1b: the post-merge review findings on the support pass and the
 * ladder. Synthetic rows shaped like the v3 generators' evidence; no real
 * player data.
 */
import { describe, expect, it } from 'vitest';
import { FAMILY_FLOORS } from '@/lib/coachhelm/v3/engine/read-floor-table';
import { buildCandidate, framingOf, leaveOneOutMean } from '../candidate';
import { evaluatePlayerRun, harmonicN, type SupportRow } from '../evaluate';
import { familyFor, MIN_ARM } from '../families';
import { keptShare } from '../shrink';

function putt(id: string, over: Record<string, unknown> = {}): SupportRow {
  return {
    id,
    insight_type: 'putt_distance',
    evidence: {
      metric: 'putts_made_3_5ft_pct',
      unit: 'percent',
      polarity: 'higher_better',
      your_value: 60,
      sample_n: 80,
      comparison_value: 96,
      comparison_source: 'pga_baseline',
      strokes_impact: 0.8,
      strokes_impact_method: 'peer_delta',
      detail: { band_attempts: 80, rounds_played: 10 },
      standing: { team_avg: 80, team_n: 8 },
      ...over,
    },
  };
}

function pressure(over: Record<string, unknown> = {}, detail: Record<string, unknown> = {}): SupportRow {
  return {
    id: 'pg',
    insight_type: 'pressure_gap',
    evidence: {
      metric: 'practice_tournament_delta',
      unit: 'strokes',
      your_value: 1.6,
      sample_n: 24,
      comparison_value: 0.8,
      comparison_source: 'pga_baseline',
      strokes_impact: 0,
      strokes_impact_method: 'peer_delta',
      detail: { practice_rounds: 12, competitive_rounds: 12, gap_se: 0.3, ...detail },
      standing: { team_avg: 0.6, team_n: 8 },
      ...over,
    },
  };
}

function slope(nA: number, nB: number): SupportRow {
  return {
    id: 'sl',
    insight_type: 'putt_bias',
    evidence: {
      metric: 'putt_slope_downhill_penalty_pct',
      polarity: 'lower_better',
      your_value: 30,
      comparison_value: 0,
      sample_n: nA + nB,
      strokes_impact: 0.4,
      strokes_impact_method: 'peer_delta',
      rounds_n: 8,
      detail: { downhill_n: nA, level_n: nB, downhill_pct: 40, level_pct: 70 },
    },
  };
}

describe('blocker 1: the tested direction is the row claim, and a data-picked side pays for it in BH', () => {
  it('tests a weakness row for worse and feeds BH the two-sided p', () => {
    const p = evaluatePlayerRun([putt('w')]).rows[0]!.patch.support;
    expect(p.direction).toBe('weakness');
    expect(p.direction_basis).toBe('data');
    expect(p.p_bh!).toBeCloseTo(Math.min(1, 2 * p.p_one_sided!), 5);
  });

  it('tests a strength row for better and feeds BH the two-sided p', () => {
    // 92% against a Tour line of 80: the generator frames it a strength.
    const row = putt('s', { your_value: 92, comparison_value: 80, standing: { team_avg: 75, team_n: 8 } });
    expect(buildCandidate(row).direction).toBe('strength');
    const p = evaluatePlayerRun([row]).rows[0]!.patch.support;
    expect(p.direction).toBe('strength');
    expect(p.gap!).toBeLessThan(0);
    expect(p.p_one_sided!).toBeLessThan(0.01);
    expect(p.p_bh!).toBeCloseTo(Math.min(1, 2 * p.p_one_sided!), 5);
  });

  it('keeps a strength row a strength test even when the team line says worse (no flip to the side the data favour)', () => {
    // Better than the Tour line the row was framed on, worse than the team.
    const row = putt('s2', { your_value: 85, comparison_value: 80, standing: { team_avg: 90, team_n: 8 } });
    const p = evaluatePlayerRun([row]).rows[0]!.patch;
    expect(p.support.direction).toBe('strength');
    expect(p.support.p_one_sided!).toBeGreaterThan(0.5);
    expect(p.ladder).toBe('not_enough_yet');
  });

  it('declares the weakness side of a within-player contrast and feeds BH its one-sided p', () => {
    const p = evaluatePlayerRun([slope(30, 30)]).rows[0]!.patch.support;
    expect(p.direction).toBe('weakness');
    expect(p.direction_basis).toBe('declared');
    expect(p.p_bh).toBe(p.p_one_sided);
  });

  it('tests a pressure strength (at or under 0) as a strength', () => {
    const c = buildCandidate(pressure({ your_value: -0.4 }));
    expect(c.direction).toBe('strength');
    expect(c.directionBasis).toBe('data');
  });
});

describe('blocker 2: one m basis for every entry point', () => {
  const written = putt('a', { your_value: 66 });
  const gatedOut = putt('b', { your_value: 55, metric: 'putts_made_6_9ft_pct' });

  it('gives the same q through a gated and an ungated caller', () => {
    const ungated = evaluatePlayerRun([written, gatedOut]);
    const gated = evaluatePlayerRun([written], { gated: [gatedOut] });
    const qUngated = ungated.rows.find((r) => r.id === 'a')!.patch.support.q_adj;
    const qGated = gated.rows[0]!.patch.support.q_adj;
    expect(qGated).toBe(qUngated);
    expect(gated.summary.tests_in_run).toBe(ungated.summary.tests_in_run);
    // The gated row is evaluated, never returned for a write.
    expect(gated.rows.map((r) => r.id)).toEqual(['a']);
    expect(gated.rows[0]!.patch.support.m_basis).toEqual({ m: 2, m_recorded: 1, m_gated: 1, m_refused: 0 });
  });

  it('counts refused writes at p = 1', () => {
    const alone = evaluatePlayerRun([written]).rows[0]!.patch.support;
    const withRefused = evaluatePlayerRun([written], { refused: 3 });
    const s = withRefused.rows[0]!.patch.support;
    expect(s.tests_in_run).toBe(4);
    expect(s.m_basis).toEqual({ m: 4, m_recorded: 1, m_gated: 0, m_refused: 3 });
    expect(s.q_adj!).toBeCloseTo(Math.min(1, alone.q_adj! * 4), 5);
    expect(withRefused.summary).toMatchObject({ candidates: 4, m_recorded: 1, m_gated: 0, m_refused: 3 });
  });
});

describe('finding 3: rows that claim nothing are never tested', () => {
  const balanced: SupportRow = {
    id: 'bal',
    insight_type: 'putt_bias',
    evidence: {
      metric: 'putt_miss_bias_left_pct',
      your_value: 60,
      comparison_value: 66,
      comparison_source: 'your_baseline',
      sample_n: 80,
      strokes_impact: 0,
      strokes_impact_method: 'peer_delta',
      detail: { testable_cells: 2, rounds_played: 9, ltr_n: 40, rtl_n: 40 },
    },
  };
  const teeShape = {
    metric: 'sg_off_the_tee',
    polarity: 'higher_better',
    your_value: 40,
    comparison_value: 70,
    comparison_source: 'your_baseline',
    sample_n: 60,
    rounds_n: 8,
    strokes_impact_method: 'rough_estimate',
    detail: { driver_n: 60, non_driver_n: 30, driver_fairway_hits: 24, non_driver_fairway_hits: 21 },
  };
  const teeSharp: SupportRow = { id: 'sharp', insight_type: 'tee_strategy', evidence: { ...teeShape, strokes_impact: 0 } };
  const teeLaggy: SupportRow = { id: 'laggy', insight_type: 'tee_strategy', evidence: { ...teeShape, strokes_impact: 0.6 } };

  it.each([
    ['putt_bias balanced', balanced],
    ['tee_strategy sharp or inconclusive', teeSharp],
    ['pressure gap inside the normal band', pressure({ your_value: 0.3 })],
  ])('%s is Not enough yet with no_claim, never a hypothesis', (_label, row) => {
    const p = evaluatePlayerRun([row]).rows[0]!.patch;
    expect(p.support).toMatchObject({ testable: false, untestable_reason: 'no_claim' });
    expect(p.ladder).toBe('not_enough_yet');
    expect(p.ladder_reasons).toContain('untestable:no_claim');
  });

  it('still tests the laggy tee row as a weakness', () => {
    expect(framingOf(teeLaggy.evidence as Record<string, unknown>, familyFor('tee_strategy', ''))).toBe('leak');
    const p = evaluatePlayerRun([teeLaggy]).rows[0]!.patch.support;
    expect(p).toMatchObject({ testable: true, direction: 'weakness', direction_basis: 'declared' });
  });
});

describe('finding 4: support floors come from the shared table', () => {
  it('takes pressure and tee floors from FAMILY_FLOORS, arms included', () => {
    const pg = familyFor('pressure_gap', 'practice_tournament_delta');
    expect(pg.floor).toBe(FAMILY_FLOORS.pressure_gap!.say_n);
    expect(pg.roundFloor).toBe(FAMILY_FLOORS.pressure_gap!.min_rounds);
    expect(pg.arms).toEqual([
      { key: 'practice_rounds', min: 6 },
      { key: 'competitive_rounds', min: 6 },
    ]);
    const tee = familyFor('tee_strategy', '');
    expect(tee.arms).toEqual([
      { key: 'driver_n', min: FAMILY_FLOORS.tee_strategy!.say_n },
      { key: 'non_driver_n', min: FAMILY_FLOORS.tee_strategy!.arms!.min_each },
    ]);
    for (const f of [pg, tee, familyFor('putt_bias', 'putt_slope_downhill_penalty_pct')]) {
      for (const a of f.arms ?? []) expect(a.min).toBeGreaterThanOrEqual(MIN_ARM);
    }
  });

  it('holds a pressure read with one thin arm at Not enough yet', () => {
    const p = evaluatePlayerRun([pressure({}, { practice_rounds: 4, competitive_rounds: 20 })]).rows[0]!.patch;
    expect(p.ladder).toBe('not_enough_yet');
    expect(p.ladder_reasons).toContain('below_arm_floor');
  });

  it('puts a read held only by an arm on Watching, with the short arm', () => {
    // 24 rounds clear the 12-round floor; 4 practice rounds miss the 6 per arm.
    const run = evaluatePlayerRun([pressure({}, { practice_rounds: 4, competitive_rounds: 20 })]);
    expect(run.rows[0]!.patch.ladder_reasons[0]).toBe('below_arm_floor');
    expect(run.summary.watching).toEqual([
      {
        family: 'pressure_gap',
        unit: 'rounds',
        have_n: 24,
        need_n: 12,
        rounds_have: 24,
        rounds_need: 12,
        arms: [{ key: 'practice_rounds', have: 4, need: 6 }],
      },
    ]);
  });
});

describe('finding 5: the team benchmark leaves the player out and carries its own variance', () => {
  it('computes the leave-one-out mean', () => {
    expect(leaveOneOutMean(80, 8, 60)).toBeCloseTo((640 - 60) / 7, 10);
    expect(leaveOneOutMean(80, 1, 60)).toBeNull();
    expect(leaveOneOutMean(80, 8, null)).toBeNull();
  });

  it('tests against the teammates and widens the range by their sample', () => {
    const loo = putt('l', { standing: { team_avg: 80, team_n: 8, player_value: 60 } });
    const c = buildCandidate(loo);
    expect(c.benchmark).toMatchObject({ source: 'team', basis: 'team_loo', pool_n: 7 });
    expect(c.benchmark!.value).toBeCloseTo(580 / 7, 6);
    expect(c.gapInput).toMatchObject({ kind: 'proportion', benchmarkN: 80 * 7 });
    expect(c.prior).toEqual({ source: 'team', value: c.benchmark!.value });

    const s = evaluatePlayerRun([loo]).rows[0]!.patch.support;
    expect(s.benchmark_basis).toBe('team_loo');
    expect(s.benchmark_variance).toBe(true);
    expect(s.test).toBe('pooled_z');

    // Same gap against an exact benchmark: a narrower range.
    const exact = evaluatePlayerRun([putt('e', { standing: { team_avg: 580 / 7, team_n: 8 } })]).rows[0]!.patch.support;
    expect(exact.benchmark_variance).toBe(false);
    expect(s.range_hi! - s.range_lo!).toBeGreaterThan(exact.range_hi! - exact.range_lo!);
  });

  it('falls back to the stored team average, and says so, when the inputs are missing', () => {
    const s = evaluatePlayerRun([putt('f')]).rows[0]!.patch.support;
    expect(s.benchmark_basis).toBe('team_incl_player');
    expect(s.benchmark_variance).toBe(false);
  });

  it('adds the benchmark variance to a per-round mean', () => {
    const withPlayer = buildCandidate(pressure({ standing: { team_avg: 0.6, team_n: 8, player_value: 1.6 } }));
    expect(withPlayer.gapInput).toMatchObject({ kind: 'mean', benchmarkSe: 0.3 / Math.sqrt(7) });
  });
});

describe('finding 6: shrink labelling and the harmonic n of a contrast', () => {
  it('labels a Tour prior as the Tour, never the team', () => {
    const s = evaluatePlayerRun([putt('t', { standing: null })]).rows[0]!.patch.shrink;
    expect(s?.prior_source).toBe('tour');
  });

  it('shrinks a two-proportion contrast by the harmonic n', () => {
    expect(harmonicN(60, 20)).toBe(30);
    const p = evaluatePlayerRun([slope(60, 20)]).rows[0]!.patch;
    expect(p.shrink!.kept_share).toBeCloseTo(keptShare(30, p.shrink!.kappa), 4);
  });
});

describe('finding 9: every stamped row says which pass stamped it', () => {
  it('stamps run_at and run_id when the pass gives them', () => {
    const s = evaluatePlayerRun([putt('r'), slope(30, 30)], { runAt: '2026-10-20T12:00:00.000Z', runId: 'run-1' });
    for (const r of s.rows) {
      expect(r.patch.support.run_at).toBe('2026-10-20T12:00:00.000Z');
      expect(r.patch.support.run_id).toBe('run-1');
    }
  });

  it('leaves them out when not given', () => {
    const s = evaluatePlayerRun([putt('r')]).rows[0]!.patch.support;
    expect(s).not.toHaveProperty('run_at');
    expect(s).not.toHaveProperty('run_id');
  });
});
