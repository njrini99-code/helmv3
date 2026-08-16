import { describe, it, expect } from 'vitest';
import { PuttSlopeBiasGenerator, selectDownhillPenaltyCut, bandForSlopePenalty } from '../putt-slope-bias';
import type { PuttSlopeBiasAggregate, PuttSlopeRow } from '../putt-slope-bias';

const gen = new PuttSlopeBiasGenerator('49ffe06d-9b22-4f2f-8c69-f56badbbde6b');

function agg(overrides: Partial<PuttSlopeBiasAggregate>): PuttSlopeBiasAggregate {
  return {
    sampleN: 12, playerValue: 0, rounds_played: 12,
    band: '0-3 ft', downhill_pct: 55, level_pct: 96, gap_pp: 41, downhill_n: 13, level_n: 13,
    ...overrides,
  };
}

function row(slope: string, distFt: number, made: boolean): PuttSlopeRow {
  return { putt_slope: slope, dist_ft: distFt, made };
}

// composeContent is only ever called by BaseGenerator.run() with a real,
// significant cut — aggregate() returns null (no row written) for every
// non-qualifying case (see the aggregate()-level tests below and the "no
// insight" design-choice comment in putt-slope-bias.ts). These tests cover
// the one shape composeContent ever receives in production.
describe('PuttSlopeBiasGenerator.composeContent — quality contracts', () => {
  it('emits a band-scoped downhill claim citing the sample and the gap', () => {
    const c = gen.composeContent(agg({}));
    expect(c.content).toContain('0-3 ft');
    expect(c.content).toContain('55%');
    expect(c.content).toContain('96%');
    expect(c.content).toContain('41');
    expect(c.content).toContain('n=13 downhill / 13 level');
    expect(c.content.toLowerCase()).toMatch(/ladder drill|dying the ball/);
    expect(c.priority).toBe('medium');
    expect(c.signature).toBe('putt_slope_bias:0-3 ft');
  });

  it('frames the pace-control mechanism as a hypothesis, not a stated fact', () => {
    const c = gen.composeContent(agg({}));
    expect(c.content.toLowerCase()).toMatch(/consistent with/);
    // Never asserts the mechanism as settled ("this is X"), and title stays
    // scoped to the measured claim (the penalty), not the inferred cause.
    expect(c.title.toLowerCase()).not.toContain('pace-control');
  });

  it('never invents a nonzero strokes_impact (no counterfactual model exists for this comparison)', () => {
    const c = gen.composeContent(agg({ band: '4-6 ft', downhill_pct: 40, level_pct: 65, gap_pp: 25, downhill_n: 20, level_n: 18 }));
    expect(c.evidence.strokes_impact).toBe(0);
  });

  it('always compares against LEVEL putts, never uphill or severe', () => {
    const c = gen.composeContent(agg({ downhill_pct: 50, level_pct: 90, gap_pp: 40, downhill_n: 10, level_n: 10 }));
    expect(c.content.toLowerCase()).not.toContain('uphill');
    expect(c.content.toLowerCase()).not.toContain('severe');
    expect(c.evidence.comparison_label?.toLowerCase()).toContain('level');
  });

  it('does not use filler coaching language', () => {
    const c = gen.composeContent(agg({ band: '4-6 ft', downhill_pct: 45, level_pct: 68, gap_pp: 23, downhill_n: 15, level_n: 14 }));
    expect(c.content.toLowerCase()).not.toContain('monitor this');
    expect(c.content.toLowerCase()).not.toContain('discuss with your coach');
  });
});

describe('bandForSlopePenalty', () => {
  it('buckets 0-3 ft and 4-6 ft, excludes 7 ft+', () => {
    expect(bandForSlopePenalty(0)).toBe('0-3 ft');
    expect(bandForSlopePenalty(3.9)).toBe('0-3 ft');
    expect(bandForSlopePenalty(4)).toBe('4-6 ft');
    expect(bandForSlopePenalty(6.9)).toBe('4-6 ft');
    expect(bandForSlopePenalty(7)).toBeNull();
    expect(bandForSlopePenalty(10)).toBeNull();
  });
});

describe('selectDownhillPenaltyCut — distance-band-controlled downhill vs level', () => {
  it('emits when a player has a real downhill penalty in 0-3 ft (n>=8/side, real data shape)', () => {
    // 0-3 ft: level 12/13 made (92.3%), downhill 6/13 made (46.2%) — a real,
    // matched-distance pace-control gap at production's measured n>=8 floor.
    const rows = [
      ...Array(12).fill(0).map(() => row('level', 2, true)),
      ...Array(1).fill(0).map(() => row('level', 2, false)),
      ...Array(6).fill(0).map(() => row('downhill', 2, true)),
      ...Array(7).fill(0).map(() => row('downhill', 2, false)),
    ];
    const cut = selectDownhillPenaltyCut(rows);
    expect(cut).not.toBeNull();
    expect(cut!.band).toBe('0-3 ft');
    expect(cut!.gap_pp).toBeGreaterThan(12);
    expect(cut!.downhill_pct).toBeLessThan(cut!.level_pct);
  });

  it('REGRESSION (the confound): pooling across bands fakes a big gap, but within-band there is none', () => {
    // Mirrors the real bug: level putts skew to the easy 0-3 ft band (n=40,
    // high make%), downhill putts skew to the harder 4-6 ft band (n=40,
    // lower make%) — a mix-shift artifact, not a slope effect. WITHIN each
    // band the make% is IDENTICAL for level vs downhill (no real gap).
    const rows: PuttSlopeRow[] = [
      // 0-3 ft: level heavily represented (40, 90% make), downhill sparse but
      // still >=8 (10, 90% make) — SAME rate, no real gap.
      ...Array(36).fill(0).map(() => row('level', 2, true)),
      ...Array(4).fill(0).map(() => row('level', 2, false)),
      ...Array(9).fill(0).map(() => row('downhill', 2, true)),
      ...Array(1).fill(0).map(() => row('downhill', 2, false)),
      // 4-6 ft: downhill heavily represented (40, 30% make), level sparse but
      // still >=8 (10, 30% make) — SAME rate, no real gap.
      ...Array(3).fill(0).map(() => row('level', 5, true)),
      ...Array(7).fill(0).map(() => row('level', 5, false)),
      ...Array(12).fill(0).map(() => row('downhill', 5, true)),
      ...Array(28).fill(0).map(() => row('downhill', 5, false)),
    ];

    // Sanity: pooling WITHOUT band control would fake a huge gap (78% vs 42%,
    // a 36-point "penalty" that is pure mix-shift). This is exactly the bug
    // this generator must not reproduce.
    const pooledLevel = rows.filter((r) => r.putt_slope === 'level');
    const pooledDownhill = rows.filter((r) => r.putt_slope === 'downhill');
    const pooledLevelPct =
      (pooledLevel.filter((r) => r.made).length / pooledLevel.length) * 100;
    const pooledDownhillPct =
      (pooledDownhill.filter((r) => r.made).length / pooledDownhill.length) * 100;
    expect(pooledLevelPct - pooledDownhillPct).toBeGreaterThan(30); // the fake gap exists

    // The real, distance-band-controlled selector must reject it.
    expect(selectDownhillPenaltyCut(rows)).toBeNull();
  });

  it('returns null below the n>=8/side minimum', () => {
    const rows = [
      ...Array(5).fill(0).map(() => row('level', 2, true)),
      ...Array(5).fill(0).map(() => row('downhill', 2, false)),
    ];
    expect(selectDownhillPenaltyCut(rows)).toBeNull();
  });

  it('never emits for 7-10 ft — no signal there by design', () => {
    // Even a huge, lopsided gap at 7-10 ft must not surface: the band is
    // outside bandForSlopePenalty's range, so these rows are excluded
    // entirely rather than banded.
    const rows = [
      ...Array(30).fill(0).map(() => row('level', 8, true)),
      ...Array(30).fill(0).map(() => row('downhill', 8, false)),
    ];
    expect(selectDownhillPenaltyCut(rows)).toBeNull();
  });

  it('the z-test gate rejects a small-but-noisy gap even above the n minimum', () => {
    // 0-3 ft: level 5/9 (55.6%) vs downhill 4/9 (44.4%) — an 11.1pp gap,
    // below the 12pp effect floor, at n=9/side (above the 8 minimum).
    const rows = [
      ...Array(5).fill(0).map(() => row('level', 2, true)),
      ...Array(4).fill(0).map(() => row('level', 2, false)),
      ...Array(4).fill(0).map(() => row('downhill', 2, true)),
      ...Array(5).fill(0).map(() => row('downhill', 2, false)),
    ];
    expect(selectDownhillPenaltyCut(rows)).toBeNull();
  });

  it('never emits when downhill is actually the STRONGER side (backwards gap)', () => {
    // A clearly significant gap in the wrong direction (downhill 86.7% vs
    // level 46.7%, n=15/side) must not be reframed as a "downhill penalty".
    const rows = [
      ...Array(13).fill(0).map(() => row('downhill', 2, true)),
      ...Array(2).fill(0).map(() => row('downhill', 2, false)),
      ...Array(7).fill(0).map(() => row('level', 2, true)),
      ...Array(8).fill(0).map(() => row('level', 2, false)),
    ];
    expect(selectDownhillPenaltyCut(rows)).toBeNull();
  });

  it('picks the single strongest qualifying band when both qualify', () => {
    // 0-3 ft: level 12/13 (92.3%) vs downhill 6/13 (46.2%) — ~46pp gap, both qualify.
    // 4-6 ft: level 20/25 (80%) vs downhill 12/25 (48%) — ~32pp gap, both qualify too.
    // The stronger cut (0-3 ft, ~46pp > ~32pp) must be the one returned.
    const rows = [
      ...Array(12).fill(0).map(() => row('level', 2, true)),
      ...Array(1).fill(0).map(() => row('level', 2, false)),
      ...Array(6).fill(0).map(() => row('downhill', 2, true)),
      ...Array(7).fill(0).map(() => row('downhill', 2, false)),
      ...Array(20).fill(0).map(() => row('level', 5, true)),
      ...Array(5).fill(0).map(() => row('level', 5, false)),
      ...Array(12).fill(0).map(() => row('downhill', 5, true)),
      ...Array(13).fill(0).map(() => row('downhill', 5, false)),
    ];
    const cut = selectDownhillPenaltyCut(rows);
    expect(cut).not.toBeNull();
    expect(cut!.band).toBe('0-3 ft');
  });
});
