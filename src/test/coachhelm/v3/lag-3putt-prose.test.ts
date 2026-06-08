import { describe, it, expect } from 'vitest';
import lag from '@/lib/coachhelm/v3/composite/rules/lag-distance-3putt';
import type { EvidenceInsight } from '@/lib/coachhelm/v3/composite/types';

function putt(sig: string, makePct: number, teamPct: number): EvidenceInsight {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidence: any = {
    metric: 'putt_distance', your_value: makePct, sample_n: 12, window_days: 30,
    standing: { metric_id: 'putt_distance', player_value: makePct, team_avg: 0, team_n: 5,
      team_pct: teamPct, pga_value: 0, pga_delta: null, computed_at: '2026-05-25T00:00:00Z' },
  };
  return { id: `i-${sig}`, insight_type: 'putt_distance', category: 'putt_distance',
    signature: sig, player_id: 'p', evidence, engine_version: 'v3', created_at: '2026-05-25T00:00:00Z' };
}

describe('lag_distance_3putt prose names the 3-putt rate, not the confusing make-%', () => {
  const insights = [
    putt('v3:putt_distance:25_plus_ft', 8, 30),
    putt('v3:putt_distance:3_5ft', 75, 30),
  ];
  const m = lag.detect(insights)!;
  const c = lag.compose(m);

  it('does NOT print the broken "X% conversion isn\'t the problem" sentence', () => {
    expect(c.content).not.toMatch(/conversion isn't the problem/);
  });
  it('displays an explicit expected 3-putt rate derived from both make-%s', () => {
    expect(c.content).toContain('23%');
    expect(c.content.toLowerCase()).toContain('3-putt');
    expect(Number(m.signals.three_putt_rate)).toBeCloseTo(0.23, 2);
  });
  it('still cites the 3-5 ft leak and prescribes a lag drill', () => {
    expect(c.content).toContain('75%');
    expect(c.content.toLowerCase()).toContain('lag');
    expect(c.content).toMatch(/3-foot circle|leave-distance/i);
  });
  it('your_value carries the 3-putt rate as a percent (not the lag make-%)', () => {
    expect(c.evidence.your_value).toBe(23);
    expect(c.evidence.metric_label).toMatch(/3-putt/i);
  });
});
