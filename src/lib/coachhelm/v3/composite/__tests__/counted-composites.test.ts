/**
 * Slice 5b: C6 and C8 read the counted angle rows when
 * `coachhelm_insight_angles_v1` is on (`ctx.counted_families`), and no
 * composite is urgent by construction. Off, both rules are unchanged.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => false) }));

import lagDistance3Putt from '../rules/lag-distance-3putt';
import shortApproachGap from '../rules/short-approach-proximity-gap';
import { COMPOSITE_RULES } from '../registry';
import { compositeRulePriority } from '../synthesis';
import type { CompositeContext, EvidenceInsight } from '../types';

const ON: CompositeContext = { hole_scores: [], short_game_shots: [], counted_families: true };
const OFF: CompositeContext = { hole_scores: [], short_game_shots: [] };

function row(id: string, insight_type: string, evidence: Record<string, unknown>, signature = id): EvidenceInsight {
  return {
    id,
    insight_type,
    category: 'putting',
    signature,
    player_id: 'p',
    engine_version: 'v3',
    created_at: '2026-10-20T00:00:00Z',
    evidence: {
      metric_label: '',
      unit: 'count',
      your_value_display: '',
      comparison_label: '',
      comparison_source: 'team_avg',
      sample_n: 100,
      window_days: 60,
      window_start: '2026-08-01',
      window_end: '2026-09-30',
      strokes_impact: 0,
      strokes_impact_method: 'peer_delta',
      confidence: 0.7,
      confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
      ...evidence,
    } as EvidenceInsight['evidence'],
  };
}

const threePutt = row('tp', 'putting', {
  metric: 'three_putts_per_18',
  your_value: 1.4,
  comparison_value: 0.6,
  comparison_label: "Teammates' median (6 players)",
  sample_n: 144,
  strokes_impact: 0.8,
});
const lag = row('lag', 'putting', {
  metric: 'lag_leave_inside_5ft_pct',
  your_value: 52,
  your_value_display: '17 of 33 (52%)',
  comparison_value: 68,
  sample_n: 33,
  window_days: 70,
});
const approach = row('ap', 'approach', {
  metric: 'approach_sg_per_shot_50_125',
  your_value: -0.3,
  comparison_value: -0.22,
  comparison_label: "Teammates' pooled approaches (400 from 6 players)",
  sample_n: 40,
  strokes_impact: 0.4,
  strokes_impact_method: 'sg_baseline',
  detail: { drivers: { green_pct: 70, proximity_ft: 24 }, team_drivers: { green_pct: 76, proximity_ft: 21 } },
});
const scramble = row('sc', 'scrambling', { metric: 'scrambling_pct_sand', your_value: 30, sample_n: 20, standing: { team_pct: 20 } });

describe('C4 flyer lie is gone', () => {
  it('is not in the registry', () => {
    expect(COMPOSITE_RULES.map((r) => r.id)).not.toContain('flyer_lie_over_the_green');
    expect(COMPOSITE_RULES).toHaveLength(8);
  });
});

describe('C6 lag → 3-putt on the counted rows', () => {
  it('fires on the two counted rows, prints counts, and is not estimated', () => {
    const m = lagDistance3Putt.detect([threePutt, lag], ON)!;
    expect(m.source_insight_ids).toEqual(['tp', 'lag']);
    const c = lagDistance3Putt.compose(m);
    expect(c.evidence.metric).toBe('three_putt_lag_chain');
    expect(c.evidence.estimated).toBe(false);
    expect(c.evidence.comparison_value).toBe(0.6);
    expect(c.evidence.strokes_impact).toBe(0.8);
    expect(c.evidence.window_days).toBe(70);
    expect(c.content).toContain('17 of 33 (52%)');
    expect(c.content).not.toMatch(/Tour ~3%|an estimated/);
  });

  it('needs both counted rows, the lag below the team and the 3-putts above the benchmark', () => {
    expect(lagDistance3Putt.detect([threePutt], ON)).toBeNull();
    expect(lagDistance3Putt.detect([threePutt, { ...lag, evidence: { ...lag.evidence, your_value: 70 } }], ON)).toBeNull();
  });

  it('ignores the old weak-standing rows while the flag is on', () => {
    const weakLag = row('wl', 'putt_distance', { metric: 'putts_made_15_25ft_pct', your_value: 10, sample_n: 30, standing: { team_pct: 10, pga_value: 0 } }, 'putt_distance:15_25ft');
    const weakShort = row('ws', 'putt_distance', { metric: 'putts_made_3_5ft_pct', your_value: 80, sample_n: 30, standing: { team_pct: 10, pga_value: 0 } }, 'putt_distance:3_5ft');
    expect(lagDistance3Putt.detect([weakLag, weakShort], ON)).toBeNull();
    // Off: exactly the old rule (estimated, Tour ~3%).
    const off = lagDistance3Putt.detect([weakLag, weakShort], OFF)!;
    expect(lagDistance3Putt.compose(off).evidence.estimated).toBe(true);
  });
});

describe('C8 short approach + scrambling on SG per approach', () => {
  it('fires on the counted SG row vs the team pool, with no Tour-class target', () => {
    const m = shortApproachGap.detect([approach, scramble], ON)!;
    const c = shortApproachGap.compose(m);
    expect(c.evidence.metric).toBe('short_approach_sg_scramble_chain');
    expect(c.evidence.comparison_source).toBe('team_avg');
    expect(c.evidence.comparison_value).toBe(-0.22);
    expect(c.evidence.strokes_impact_method).toBe('sg_baseline');
    expect(c.content).toContain('0.08 strokes per approach');
    expect(c.content).toContain('70% of the time (team 76%)');
    expect(c.content).not.toMatch(/22 ft|Dial-in/);
  });

  it('does not fire when the player is level with the team, or off the flag on the SG row', () => {
    expect(shortApproachGap.detect([{ ...approach, evidence: { ...approach.evidence, your_value: -0.1 } }, scramble], ON)).toBeNull();
    expect(shortApproachGap.detect([approach, scramble], OFF)).toBeNull();
  });
});

describe('no composite is urgent by construction (flag on)', () => {
  it('urgent becomes high with the flag on, unchanged off', () => {
    expect(compositeRulePriority('urgent', true)).toBe('high');
    expect(compositeRulePriority('high', true)).toBe('high');
    expect(compositeRulePriority('urgent', false)).toBe('urgent');
  });
});
