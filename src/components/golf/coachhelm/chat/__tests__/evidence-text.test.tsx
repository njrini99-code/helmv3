import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Measurement } from '@/lib/coachhelm/v3/chat/provenance';
import { AssistantProse } from '../AssistantProse';
import { ComparisonTable, formatValue } from '../EvidenceVisuals';

function m(entity: string, metric_id: string, metric_label: string, value: number, over: Partial<Measurement> = {}): Measurement {
  return {
    metric_id,
    metric_label,
    unit: 'score',
    value,
    entity: { kind: 'player', id: entity, label: entity },
    window_start: '2026-09-01',
    window_end: '2026-09-26',
    sample_size: 8,
    sample_unit: 'rounds',
    as_of: '2026-09-27T00:00:00.000Z',
    coverage: 'complete',
    coverage_note: null,
    source: 'rounds',
    method: 'test',
    denominator: null,
    benchmark: null,
    direction: 'lower_better',
    ...over,
  };
}

describe('formatValue', () => {
  it('signs a to-par score and writes even as E', () => {
    const toPar = { metric_id: 'scoring_average_vs_par', metric_label: 'Scoring average to par' };
    expect(formatValue(3.1, 'score', toPar)).toBe('+3.1');
    expect(formatValue(-0.4, 'score', toPar)).toBe('−0.4');
    expect(formatValue(0, 'score', toPar)).toBe('E');
    expect(formatValue(72.6, 'score')).toBe('72.6');
  });

  it('uses a typographic minus for negative strokes gained', () => {
    expect(formatValue(-4.21, 'strokes')).toBe('−4.21');
    expect(formatValue(0.46, 'strokes')).toBe('+0.46');
  });
});

describe('AssistantProse', () => {
  it('draws a markdown pipe table as a table, not raw pipes', () => {
    render(
      <AssistantProse text={'Team SG:\n\n| Player | SG Total | Rounds |\n|---|---|---|\n| Tyler Hayes | -4.21 | 6 |\n| Ava Lin | 0.46 | 8 |'} />,
    );
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Player', 'SG Total', 'Rounds']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.queryByText(/\|---/)).toBeNull();
  });
});

describe('ComparisonTable', () => {
  it('turns a team into rows and marks the best value in each column', () => {
    const players = ['Ava', 'Ben', 'Cal', 'Dee', 'Eli'];
    const ms = players.flatMap((p, i) => [
      m(p, 'scoring_average', 'Scoring average', 72 + i),
      m(p, 'gir_pct', 'Greens in regulation', 50 + i, { unit: 'percent', direction: 'higher_better' }),
    ]);
    render(<ComparisonTable measurements={ms} />);
    expect(screen.getAllByRole('rowheader').map((r) => r.textContent)).toEqual(players.map((p) => `${p}8 rounds`));
    const best = screen.getAllByText('(best)');
    expect(best).toHaveLength(2);
    expect(best[0]!.parentElement?.textContent).toContain('72');
    expect(best[1]!.parentElement?.textContent).toContain('54%');
  });

  it('keeps each figure\'s sample in the team table when samples differ', () => {
    const players = ['Ava', 'Ben', 'Cal', 'Dee'];
    const ms = players.flatMap((p, i) => [
      m(p, 'scoring_average', 'Scoring average', 72 + i, { sample_size: 10 + i }),
      m(p, 'putt_make_pct', 'Putts made', 40 + i, { unit: 'percent', direction: 'higher_better', sample_size: 60 + i, sample_unit: 'attempts' }),
    ]);
    render(<ComparisonTable measurements={ms} />);
    expect(screen.getByText('10 rounds')).toBeTruthy();
    expect(screen.getByText('63 attempts')).toBeTruthy();
  });
});
