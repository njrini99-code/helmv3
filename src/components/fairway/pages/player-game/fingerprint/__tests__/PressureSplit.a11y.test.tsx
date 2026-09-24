/**
 * A11Y-06: the pressure split has a text alternative. The dot track is
 * decorative; the row labels, samples and values are readable text.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SectionData } from '@/app/golf/actions/player-fingerprint-types';
import { PressureSplit } from '../instruments';

const section: SectionData = {
  key: 'pressure',
  category: 'Pressure',
  sparse: false,
  insights: [],
  chart_data: null,
  metrics: [
    { label: 'Practice avg', value: '+2.0', comparison: '6 rd', tone: 'neutral' },
    { label: 'Tournament avg', value: '+4.5', comparison: '4 rd', tone: 'neutral' },
    { label: 'Pressure gap', value: '+2.5', comparison: 'Tightens up', tone: 'bad' },
  ],
};

describe('PressureSplit text alternative (A11Y-06)', () => {
  it('exposes a named list whose rows read label, sample and value', () => {
    render(<PressureSplit section={section} />);
    const list = screen.getByRole('list', { name: /practice and competition/i });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toMatch(/Practice.*6 rounds.*\+2\.0/);
    expect(items[1]?.textContent).toMatch(/Competition.*4 rounds.*\+4\.5/);
    expect(screen.getByText(/strokes to par in competition/).textContent).toContain('tightens up');
  });
});
