import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EvidencePanel } from '@/components/golf/coachhelm/insights/EvidencePanel';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

/** Slice 7a: the Fairway evidence panel says the team pool line when the row carries one (written only with the flag on). */

function makeEvidence(overrides: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    metric: 'putts_made_5_10ft_pct',
    metric_label: 'Putts Made 5-10 ft',
    unit: 'percent',
    your_value: 38,
    your_value_display: '38%',
    comparison_value: 62.2,
    comparison_label: 'PGA Tour make % avg',
    comparison_source: 'pga_baseline',
    sample_n: 47,
    window_days: 30,
    window_start: '2026-09-01',
    window_end: '2026-10-01',
    strokes_impact: 0.8,
    strokes_impact_method: 'sg_baseline',
    confidence: 0.78,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
    ...overrides,
  };
}

const team: Partial<InsightEvidence> = {
  comparison: {
    primary: { source: 'team_pool', label: 'Team pool', value: 72, n: 240, unit: 'percent', n_unit: 'putts', n_noun: 'putts', players: 6 },
    lines: [],
  },
};

describe('EvidencePanel: the team pool line', () => {
  it('compact: says the team line with the sample', () => {
    render(<EvidencePanel evidence={makeEvidence(team)} />);
    expect(screen.getByTestId('evidence-team-pool').textContent).toBe('Team pool 72% (240 putts)');
  });

  it('expanded: the Comparison row says the team line instead of the flat comparison', () => {
    render(<EvidencePanel evidence={makeEvidence(team)} compact={false} />);
    const row = screen.getByTestId('evidence-row-comparison').textContent ?? '';
    expect(row).toContain('Team pool 72% (240 putts)');
    expect(row).not.toContain('PGA Tour');
  });

  it('without the team line (the flag off) nothing changes', () => {
    const { container: a } = render(<EvidencePanel evidence={makeEvidence()} compact={false} />);
    expect(screen.queryByTestId('evidence-team-pool')).toBeNull();
    expect(screen.getByTestId('evidence-row-comparison').textContent).toContain('PGA Tour');
    const { container: b } = render(<EvidencePanel evidence={makeEvidence()} />);
    expect(a.innerHTML).not.toContain('Team pool');
    expect(b.innerHTML).not.toContain('Team pool');
  });
});
