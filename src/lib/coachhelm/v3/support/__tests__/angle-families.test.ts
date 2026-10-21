/**
 * Slice 1c: the six Slice 5a insight-angle families in the support pass.
 * Synthetic rows shaped like the angle generators' evidence (`familyDetail`,
 * `detail.gap_input`, the arm counts each generator writes); no real player
 * data.
 */
import { describe, expect, it } from 'vitest';
import {
  ANGLE_FAMILIES,
  familyDetail,
  type AngleFamilyId,
  type AngleGapInput,
} from '@/lib/coachhelm/v3/generators/insight-angles/angle-data';
import { FAMILY_FLOORS } from '@/lib/coachhelm/v3/engine/read-floor-table';
import { buildCandidate } from '../candidate';
import { evaluatePlayerRun, harmonicN, type SupportRow } from '../evaluate';
import { FAMILY_IDS, familyFor, MIN_ARM } from '../families';
import { keptShare } from '../shrink';

interface RowSpec {
  yourValue: number;
  comparisonValue: number;
  comparisonSource: 'team_avg' | 'pga_baseline' | 'your_baseline';
  sampleN: number;
  roundsN: number;
  strokes: number;
  gap: AngleGapInput | null;
  detail?: Record<string, unknown>;
}

function angleRow(family: AngleFamilyId, spec: RowSpec, over: Record<string, unknown> = {}): SupportRow {
  const def = ANGLE_FAMILIES[family];
  return {
    id: family,
    insight_type: def.insight_type,
    evidence: {
      metric: def.metric,
      polarity: spec.gap?.polarity ?? 'lower_better',
      your_value: spec.yourValue,
      comparison_value: spec.comparisonValue,
      comparison_source: spec.comparisonSource,
      sample_n: spec.sampleN,
      rounds_n: spec.roundsN,
      strokes_impact: spec.strokes,
      strokes_impact_method: def.impact,
      ...(def.impact === 'rough_estimate' ? { estimated: true } : {}),
      detail: { ...familyDetail(family), gap_input: spec.gap, ...spec.detail },
      ...over,
    },
  };
}

const SPECS: Record<AngleFamilyId, RowSpec> = {
  // 22 three-putts on 200 putted holes (11%) vs a 5% team rate.
  three_putt_chain: {
    yourValue: 2,
    comparisonValue: 0.9,
    comparisonSource: 'team_avg',
    sampleN: 200,
    roundsN: 12,
    strokes: 0.6,
    gap: { kind: 'proportion', k: 22, n: 200, benchmark: 0.05, polarity: 'lower_better' },
  },
  // Bad-day gap 9 strokes (bootstrap SE 1) vs the teammates' median 5.
  bad_day_floor: {
    yourValue: 9,
    comparisonValue: 5,
    comparisonSource: 'team_avg',
    sampleN: 30,
    roundsN: 30,
    strokes: 0.8,
    gap: { kind: 'mean', value: 9, se: 1, df: 29, benchmark: 5, polarity: 'lower_better' },
  },
  // 0.4 strokes per rough approach beyond the lie, against the Tour's 0.
  lie_rough_execution: {
    yourValue: 0.4,
    comparisonValue: 0,
    comparisonSource: 'pga_baseline',
    sampleN: 60,
    roundsN: 10,
    strokes: 1,
    gap: { kind: 'mean', value: 0.4, se: 0.1, df: 49, benchmark: 0, polarity: 'lower_better' },
    detail: { rough_shots: 60, fairway_shots: 50 },
  },
  // 54 of 120 fairways (45%) vs the teammates' 65%.
  lie_fairway_exposure: {
    yourValue: 45,
    comparisonValue: 65,
    comparisonSource: 'team_avg',
    sampleN: 120,
    roundsN: 10,
    strokes: 0.5,
    gap: { kind: 'proportion', k: 54, n: 120, benchmark: 0.65, polarity: 'higher_better' },
  },
  // A left miss costs 0.8 a hole vs 0.2 for a right miss, 30 costed each.
  tee_miss_cost: {
    yourValue: 0.8,
    comparisonValue: 0.2,
    comparisonSource: 'your_baseline',
    sampleN: 60,
    roundsN: 10,
    strokes: 0.6,
    gap: { kind: 'mean', value: 0.8, se: 0.15, df: 50, benchmark: 0.2, polarity: 'lower_better' },
    detail: { worse_side: 'left', better_side: 'right', sides: { left: { costed: 30 }, right: { costed: 30 } } },
  },
  // A short miss costs 0.9 to finish vs 0.3 for a long miss, 40 and 20 costed.
  approach_miss_compass: {
    yourValue: 0.9,
    comparisonValue: 0.3,
    comparisonSource: 'your_baseline',
    sampleN: 60,
    roundsN: 10,
    strokes: 0.7,
    gap: { kind: 'mean', value: 0.9, se: 0.15, df: 40, benchmark: 0.3, polarity: 'lower_better' },
    detail: { worse_side: 'short', better_side: 'long', sides: { short: { costed: 40 }, long: { costed: 20 } } },
  },
  // Slice 5b. SG per par-3 tee shot −0.30 vs the team pool's −0.10.
  par3_tee: {
    yourValue: -0.3,
    comparisonValue: -0.1,
    comparisonSource: 'team_avg',
    sampleN: 60,
    roundsN: 15,
    strokes: 0.8,
    gap: { kind: 'mean', value: -0.3, se: 0.05, df: 80, benchmark: -0.1, polarity: 'higher_better' },
  },
  // SG per approach in each band, 0.2 behind the team pool.
  approach_sg_50_125: {
    yourValue: -0.25,
    comparisonValue: -0.05,
    comparisonSource: 'team_avg',
    sampleN: 60,
    roundsN: 15,
    strokes: 0.8,
    gap: { kind: 'mean', value: -0.25, se: 0.05, df: 80, benchmark: -0.05, polarity: 'higher_better' },
  },
  approach_sg_125_175: {
    yourValue: -0.35,
    comparisonValue: -0.15,
    comparisonSource: 'team_avg',
    sampleN: 60,
    roundsN: 15,
    strokes: 0.8,
    gap: { kind: 'mean', value: -0.35, se: 0.05, df: 80, benchmark: -0.15, polarity: 'higher_better' },
  },
  approach_sg_175_plus: {
    yourValue: -0.45,
    comparisonValue: -0.25,
    comparisonSource: 'team_avg',
    sampleN: 60,
    roundsN: 15,
    strokes: 0.8,
    gap: { kind: 'mean', value: -0.45, se: 0.05, df: 80, benchmark: -0.25, polarity: 'higher_better' },
  },
  // 20 of 60 lag putts inside 5 ft vs the team pool's 65% (a rough estimate).
  lag_leave: {
    yourValue: 33.3,
    comparisonValue: 65,
    comparisonSource: 'team_avg',
    sampleN: 60,
    roundsN: 12,
    strokes: 0.4,
    gap: { kind: 'proportion', k: 20, n: 60, benchmark: 0.65, polarity: 'higher_better' },
  },
  // 30 of 40 side-tagged breaking-putt misses low vs an even split; unsized.
  under_reading: {
    yourValue: 75,
    comparisonValue: 50,
    comparisonSource: 'your_baseline',
    sampleN: 40,
    roundsN: 10,
    strokes: 0,
    gap: { kind: 'proportion', k: 30, n: 40, benchmark: 0.5, polarity: 'lower_better' },
  },
};

const IDS = Object.keys(ANGLE_FAMILIES) as AngleFamilyId[];

function evaluateOne(row: SupportRow) {
  const out = evaluatePlayerRun([row]);
  return out.rows[0]!.patch;
}

describe('angle families: matched by metric, settings from ANGLE_FAMILIES', () => {
  it('each angle maps to its own family, with the registry floors, κ and cap', () => {
    for (const id of IDS) {
      const a = ANGLE_FAMILIES[id];
      const f = familyFor(a.insight_type, a.metric);
      expect(f.family, id).toBe(id);
      expect(f.angle).toBe(id);
      expect(f.shape).toBe(a.gap_kind);
      expect(f.nUnit).toBe(a.sample_unit);
      expect(f.floor).toBe(a.floor);
      expect(f.roundFloor).toBe(Math.max(3, a.round_floor));
      expect(f.kappa).toBe(a.kappa.value);
      expect(f.cap).toBe(a.cap);
      expect(f.allowStrength).toBe(false);
      // Floors come from the angle registry, not the 0b table.
      expect(f.floorsKey).toBe(`angle:${id}`);
      expect(FAMILY_FLOORS[`angle:${id}`]).toBeUndefined();
      for (const arm of f.arms ?? []) expect(arm.min).toBe(Math.max(MIN_ARM, a.per_side_floor ?? 0));
      expect(FAMILY_IDS).toContain(id);
    }
  });

  it('the two tee angles are told apart by metric, not by their shared insight type', () => {
    expect(familyFor('tee', 'tee_fairway_rough_exposure').family).toBe('lie_fairway_exposure');
    expect(familyFor('tee', 'tee_miss_next_shot_cost').family).toBe('tee_miss_cost');
    expect(familyFor('tee', 'some_other_tee_metric').family).toBe('unknown');
  });

  it('a non-angle row with an angle insight type keeps its old family', () => {
    expect(familyFor('putting', 'putts_made_3_5ft_pct').family).toBe('putt_distance');
    expect(familyFor('approach', 'approach_proximity_50_125ft').family).toBe('approach_green_hit');
    expect(familyFor('short_game', 'scrambling_pct_sand').family).toBe('sand_save');
    expect(familyFor('scoring', 'big_number_rate').family).toBe('big_number');
    // And the old metric-first match still wins for slope rows.
    expect(familyFor('putt_bias', 'putt_slope_downhill_penalty_pct').family).toBe('putt_slope');
  });
});

describe('angle families: testable from detail.gap_input', () => {
  it.each(IDS)('%s is testable on the weak side it claims', (id) => {
    const c = buildCandidate(angleRow(id, SPECS[id]));
    expect(c.family).toBe(id);
    expect(c.untestableReason).toBeNull();
    expect(c.gapInput).toEqual(SPECS[id].gap);
    expect(c.direction).toBe('weakness');
    // Rough execution counts both arms (60 rough + 50 fairway); its
    // `sample_n` is the rough arm alone.
    expect(c.n).toBe(id === 'lie_rough_execution' ? 110 : SPECS[id].sampleN);
    expect(c.roundsN).toBe(SPECS[id].roundsN);
    const patch = evaluateOne(angleRow(id, SPECS[id]));
    expect(patch.support.testable).toBe(true);
    expect(patch.support.direction).toBe('weakness');
    expect(patch.support.gap).toBeGreaterThan(0);
    expect(patch.support.floor).toBe(ANGLE_FAMILIES[id].floor);
    expect(patch.ladder).not.toBe('not_enough_yet');
  });

  it('declared direction for one-sided angles; data-picked side (two-sided p to BH) for the two compasses', () => {
    for (const id of IDS) {
      const s = evaluateOne(angleRow(id, SPECS[id])).support;
      const picked = id === 'tee_miss_cost' || id === 'approach_miss_compass';
      expect(s.direction_basis, id).toBe(picked ? 'data' : 'declared');
      if (picked) expect(s.p_bh).toBeCloseTo(Math.min(1, 2 * s.p_one_sided!), 5);
      else expect(s.p_bh).toBe(s.p_one_sided);
    }
  });

  it('benchmarks: the gap input names the value, the comparison source labels it', () => {
    const tp = evaluateOne(angleRow('three_putt_chain', SPECS.three_putt_chain)).support;
    expect(tp.benchmark).toEqual({ source: 'team', value: 5 });
    expect(tp.gap).toBeCloseTo(6, 4); // 11% − 5%, in points
    const tee = evaluateOne(angleRow('tee_miss_cost', SPECS.tee_miss_cost)).support;
    expect(tee.benchmark).toEqual({ source: 'self', value: 0.2 });
    expect(tee.benchmark_basis).toBe('self');
    const rough = evaluateOne(angleRow('lie_rough_execution', SPECS.lie_rough_execution)).support;
    expect(rough.benchmark).toEqual({ source: 'tour', value: 0 });
  });

  it('a row that claims the better side (no angle writes one) is no_claim, never tested as a weakness', () => {
    const c = buildCandidate(angleRow('tee_miss_cost', { ...SPECS.tee_miss_cost, yourValue: 0.1 }));
    expect(c.gapInput).toBeNull();
    expect(c.untestableReason).toBe('no_claim');
  });

  it('a missing or malformed gap input is untestable as no_gap_input', () => {
    expect(buildCandidate(angleRow('bad_day_floor', { ...SPECS.bad_day_floor, gap: null })).untestableReason).toBe('no_gap_input');
    const wrongKind = { kind: 'proportion', k: 5, n: 30, benchmark: 0.2, polarity: 'lower_better' } as const;
    expect(buildCandidate(angleRow('bad_day_floor', { ...SPECS.bad_day_floor, gap: wrongKind })).untestableReason).toBe('no_gap_input');
    const zeroSe = { kind: 'mean', value: 9, se: 0, df: 29, benchmark: 5, polarity: 'lower_better' } as const;
    expect(buildCandidate(angleRow('bad_day_floor', { ...SPECS.bad_day_floor, gap: zeroSe })).untestableReason).toBe('no_gap_input');
  });
});

describe('angle families: rungs and caps', () => {
  it('three-putt chain vs the team pool reaches its Observed cap; vs the Tour alone it stays with the coach', () => {
    const team = evaluateOne(angleRow('three_putt_chain', SPECS.three_putt_chain));
    expect(team.ladder).toBe('observed');
    const tour = evaluateOne(angleRow('three_putt_chain', { ...SPECS.three_putt_chain, comparisonSource: 'pga_baseline' }));
    expect(tour.ladder).toBe('working_hypothesis');
    expect(tour.ladder_reasons).toContain('tour_benchmark_only');
  });

  it('rough-estimate families never read above Likely', () => {
    for (const id of ['bad_day_floor', 'lie_fairway_exposure', 'tee_miss_cost'] as const) {
      const p = evaluateOne(angleRow(id, SPECS[id]));
      expect(p.ladder, id).toBe('likely');
      expect(p.what_ladder, id).toBe('likely');
    }
    // Even with the row's own cap and `estimated` flag lost, impact_kind holds it.
    const row = angleRow('tee_miss_cost', SPECS.tee_miss_cost, { estimated: false });
    (row.evidence as { detail: Record<string, unknown> }).detail.ladder_cap = 'seen_repeatedly';
    const c = buildCandidate(row);
    expect(c.cap).toBe('likely');
    expect(c.capReasons).not.toContain('estimated_value');
  });

  it('a row stamped with a lower cap than the family is held to it', () => {
    const row = angleRow('approach_miss_compass', SPECS.approach_miss_compass);
    (row.evidence as { detail: Record<string, unknown> }).detail.ladder_cap = 'likely';
    const c = buildCandidate(row);
    expect(c.cap).toBe('likely');
    expect(c.capReasons).toContain('row_ladder_cap');
  });

  it('lie rough execution is measured against the Tour SG baseline, so it stays a working hypothesis', () => {
    const p = evaluateOne(angleRow('lie_rough_execution', SPECS.lie_rough_execution));
    expect(p.ladder).toBe('working_hypothesis');
    expect(p.ladder_reasons).toContain('tour_benchmark_only');
  });

  it('approach-miss compass (measured, self contrast) reaches Observed', () => {
    expect(evaluateOne(angleRow('approach_miss_compass', SPECS.approach_miss_compass)).ladder).toBe('observed');
  });
});

describe('angle families: floors hold a read back', () => {
  it.each(IDS)('%s below its sample floor is Not enough yet', (id) => {
    const floor = ANGLE_FAMILIES[id].floor;
    const spec = SPECS[id];
    const gap =
      spec.gap?.kind === 'proportion'
        ? { ...spec.gap, n: floor - 1, k: Math.min(spec.gap.k, floor - 1) }
        : spec.gap;
    // Rough execution's n is its two arms together (11 rough + 8 fairway = 19).
    const detail = id === 'lie_rough_execution' ? { rough_shots: floor - 9, fairway_shots: 8 } : spec.detail;
    const p = evaluateOne(angleRow(id, { ...spec, sampleN: floor - 1, gap, detail }));
    expect(p.ladder).toBe('not_enough_yet');
    expect(p.ladder_reasons).toContain('below_attempt_floor');
  });

  it.each(IDS)('%s below its round floor is Not enough yet', (id) => {
    const p = evaluateOne(angleRow(id, { ...SPECS[id], roundsN: Math.max(3, ANGLE_FAMILIES[id].round_floor) - 1 }));
    expect(p.ladder).toBe('not_enough_yet');
    expect(p.ladder_reasons).toContain('below_round_floor');
  });

  it('two-arm angles hold each side to its per-side floor', () => {
    const rough = angleRow('lie_rough_execution', {
      ...SPECS.lie_rough_execution,
      detail: { rough_shots: 60, fairway_shots: 7 },
    });
    expect(evaluateOne(rough).ladder_reasons).toContain('below_arm_floor');

    const tee = angleRow('tee_miss_cost', {
      ...SPECS.tee_miss_cost,
      detail: { worse_side: 'left', better_side: 'right', sides: { left: { costed: 49 }, right: { costed: 11 } } },
    });
    const out = evaluatePlayerRun([tee]);
    expect(out.rows[0]!.patch.ladder_reasons).toContain('below_arm_floor');
    expect(out.summary.watching[0]!.arms).toEqual([{ key: 'better_side_costed', have: 11, need: 12 }]);

    // A side the row does not name has no count, so it fails its floor.
    const unnamed = angleRow('approach_miss_compass', { ...SPECS.approach_miss_compass, detail: { sides: {} } });
    expect(evaluateOne(unnamed).ladder_reasons).toContain('below_arm_floor');
  });
});

describe('lie rough execution: n is rough + fairway approaches (Codex P2 on #2242)', () => {
  it('20 rough + 20 fairway is n = 40, so it clears the 2 × floor sample gate', () => {
    const row = angleRow('lie_rough_execution', {
      ...SPECS.lie_rough_execution,
      // toLieAggregate writes rough approaches only as sample_n.
      sampleN: 20,
      detail: { rough_shots: 20, fairway_shots: 20 },
    });
    expect(buildCandidate(row).n).toBe(40);
    const p = evaluateOne(row);
    expect(p.support.n).toBe(40);
    expect(p.support.clear).toBe(true);
    expect(p.ladder_reasons).not.toContain('below_clear_n');
    // The contrast shrinks by the arms' harmonic n, like the two compasses.
    expect(p.shrink!.kept_share).toBeCloseTo(keptShare(harmonicN(20, 20), 20), 4);
  });

  it('a missing arm count leaves n at 0, never the one-arm sample_n', () => {
    const row = angleRow('lie_rough_execution', { ...SPECS.lie_rough_execution, detail: { rough_shots: 60 } });
    expect(buildCandidate(row).n).toBe(0);
    expect(evaluateOne(row).ladder).toBe('not_enough_yet');
  });
});

describe('angle families: shrinkage', () => {
  it('a self contrast shrinks toward the other side by the arms’ harmonic n', () => {
    const p = evaluateOne(angleRow('approach_miss_compass', SPECS.approach_miss_compass));
    const nH = harmonicN(40, 20);
    const share = keptShare(nH, ANGLE_FAMILIES.approach_miss_compass.kappa.value);
    expect(p.shrink!.kept_share).toBeCloseTo(share, 4);
    expect(p.shrink!.prior_source).toBe('self');
    expect(p.shrink!.gap).toBeCloseTo(0.6 * share, 4);
  });

  it('a one-sample angle shrinks toward its benchmark by n', () => {
    const p = evaluateOne(angleRow('three_putt_chain', SPECS.three_putt_chain));
    expect(p.shrink!.kept_share).toBeCloseTo(keptShare(200, 90), 4);
    expect(p.shrink!.prior_value).toBe(5);
  });
});
