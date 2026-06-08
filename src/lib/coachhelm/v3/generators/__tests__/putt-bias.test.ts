import { describe, it, expect } from 'vitest';
import { PuttBiasGenerator, selectWeakestCut } from '../putt-bias';
import type { PuttBiasAggregate, PuttRow } from '../putt-bias';

const gen = new PuttBiasGenerator('49ffe06d-9b22-4f2f-8c69-f56badbbde6b');

function aggBase(): PuttBiasAggregate {
  return {
    sampleN: 12, playerValue: 0, rounds_played: 12,
    significant: false, weakest_direction: null, band: null, slope: null,
    weak_pct: null, strong_pct: null, gap_pp: 0, weak_n: 0, strong_n: 0,
  };
}

describe('PuttBiasGenerator.composeContent — quality contracts', () => {
  it('NEVER claims a green-reading bias when the gap is not significant', () => {
    const c = gen.composeContent({ ...aggBase(), significant: false });
    expect(c.content.toLowerCase()).not.toContain('green-reading');
    expect(c.content.toLowerCase()).not.toContain('bias');
    expect(c.priority).toBe('low');
    expect(c.evidence.strokes_impact).toBe(0);
  });

  it('emits a band-and-slope-scoped directional claim only when significant', () => {
    const c = gen.composeContent({
      ...aggBase(), significant: true, weakest_direction: 'left', band: '11-20 ft',
      slope: 'downhill', weak_pct: 14, strong_pct: 30, gap_pp: 16, weak_n: 22, strong_n: 19,
    });
    expect(c.content).toContain('11-20 ft');
    expect(c.content).toContain('left-to-right');
    expect(c.content).toContain('16');
    expect(c.content.toLowerCase()).toContain('downhill');
    expect(c.content).toMatch(/play(ing)? more break|read more break|start.*higher/i);
    expect(c.priority).toBe('medium');
  });

  it('uses the COMPUTED weakest direction for the metric id (no constructor mismatch)', () => {
    const c = gen.composeContent({
      ...aggBase(), significant: true, weakest_direction: 'right', band: '7-10 ft',
      slope: 'level', weak_pct: 12, strong_pct: 30, gap_pp: 18, weak_n: 20, strong_n: 20,
    });
    expect(c.evidence.metric).toBe('putt_miss_bias_right_pct');
  });

  it('never references straight putts as the comparison baseline', () => {
    const c = gen.composeContent({
      ...aggBase(), significant: true, weakest_direction: 'left', band: '4-6 ft',
      slope: 'uphill', weak_pct: 30, strong_pct: 50, gap_pp: 20, weak_n: 18, strong_n: 16,
    });
    expect(c.content.toLowerCase()).not.toContain('straight');
    expect(c.evidence.comparison_label?.toLowerCase()).not.toContain('straight');
  });
});

function row(break_: string, slope: string, distFt: number, made: boolean): PuttRow {
  return { putt_break: break_, putt_slope: slope, dist_ft: distFt, made };
}

describe('selectWeakestCut — band + slope control', () => {
  it('returns null when no (band,slope) cut has 15/side', () => {
    const rows = [
      ...Array(10).fill(0).map(() => row('left_to_right', 'level', 15, false)),
      ...Array(10).fill(0).map(() => row('right_to_left', 'level', 15, true)),
    ];
    expect(selectWeakestCut(rows)).toBeNull();
  });

  it('mirrors the real Nick data: even L-vs-R → no significant cut', () => {
    const rows = [
      ...Array(3).fill(0).map(() => row('left_to_right', 'level', 15, true)),
      ...Array(19).fill(0).map(() => row('left_to_right', 'level', 15, false)),
      ...Array(4).fill(0).map(() => row('right_to_left', 'level', 15, true)),
      ...Array(18).fill(0).map(() => row('right_to_left', 'level', 15, false)),
    ];
    expect(selectWeakestCut(rows)).toBeNull();
  });

  it('selects a significant cut and reports the weaker break direction', () => {
    // CORRECTED (plan's 6/20-vs-3/25 → p≈0.13, NOT sig). 7-10 ft level:
    // LtR 50% (20/40), RtL 20% (8/40) → 30pp, z≈2.8, p≈0.005 → significant.
    const rows = [
      ...Array(20).fill(0).map(() => row('left_to_right', 'level', 8, true)),
      ...Array(20).fill(0).map(() => row('left_to_right', 'level', 8, false)),
      ...Array(8).fill(0).map(() => row('right_to_left', 'level', 8, true)),
      ...Array(32).fill(0).map(() => row('right_to_left', 'level', 8, false)),
    ];
    const cut = selectWeakestCut(rows);
    expect(cut).not.toBeNull();
    expect(cut!.weakest_direction).toBe('right'); // right_to_left is the weaker side
    expect(cut!.band).toBe('7-10 ft');
    expect(cut!.slope).toBe('level');
    expect(cut!.gap_pp).toBeGreaterThanOrEqual(12);
  });
});
