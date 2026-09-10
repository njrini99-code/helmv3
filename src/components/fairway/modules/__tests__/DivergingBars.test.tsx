/**
 * ============================================================================
 * DivergingBars — labelWidth / goodDirection / referenceTick additions
 * (roster.v2.md, 2026-09-10)
 * ----------------------------------------------------------------------------
 * The three new props are additive: `FairwayRoundsLibrary.tsx`'s existing
 * `<DivergingBars rows={spreadRows} max={max} />` call passes none of them,
 * so its rendered output must stay byte-identical (first two cases here).
 * The rest cover the new behavior each prop adds.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { DivergingBars } from '../DivergingBars';
import type { DivergingRow } from '../types';

/** Find the fill span for a given row label — the rail's third span
 *  (`rounded-full` + `inset-y-0`), distinct from the fixed zero marker
 *  (`w-[2px]`) and the reference tick (`w-[1.5px]`). */
function fillFor(container: HTMLElement, label: string): Element | null {
  const labelSpan = Array.from(container.querySelectorAll('span')).find(
    (el) => el.textContent === label && !el.className.includes('sr-only'),
  );
  const row = labelSpan?.parentElement;
  const rail = row?.querySelectorAll('span')[1]; // rail wrapper (2nd child of the row grid)
  return (
    Array.from(rail?.querySelectorAll('span') ?? []).find(
      (el) => el.className.includes('inset-y-0') && el.className.includes('rounded-full') && !el.className.includes('-top-0.5'),
    ) ?? null
  );
}

describe('DivergingBars — default behavior unchanged (no new props passed)', () => {
  it('renders a positive delta on the right in fw-warning', () => {
    const rows: DivergingRow[] = [{ label: 'Over', delta: 1.5, display: '+1.50' }];
    const { container } = render(<DivergingBars rows={rows} max={2} />);
    const fill = fillFor(container, 'Over');
    expect(fill).not.toBeNull();
    expect(fill!.className).toContain('left-1/2');
    expect(fill!.className).toContain('bg-fw-warning');
  });

  it('renders a negative delta on the left in accent-500, with the default 40px label column', () => {
    const rows: DivergingRow[] = [{ label: 'Under', delta: -1.5, display: '-1.50' }];
    const { container } = render(<DivergingBars rows={rows} max={2} />);
    const fill = fillFor(container, 'Under');
    expect(fill).not.toBeNull();
    expect(fill!.className).toContain('right-1/2');
    expect(fill!.className).toContain('bg-accent-500');

    const rowGrid = container.querySelector('[style*="grid-template-columns"]') as HTMLElement;
    expect(rowGrid.style.gridTemplateColumns).toBe('40px 1fr 42px');
  });
});

describe('DivergingBars — labelWidth', () => {
  it('applies a custom label column width', () => {
    const rows: DivergingRow[] = [{ label: 'Bennett', delta: -0.5, display: '-0.50' }];
    const { container } = render(<DivergingBars rows={rows} max={2} labelWidth={96} />);
    const rowGrid = container.querySelector('[style*="grid-template-columns"]') as HTMLElement;
    expect(rowGrid.style.gridTemplateColumns).toBe('96px 1fr 42px');
  });
});

describe('DivergingBars — goodDirection flips color only, never geometry or the printed value', () => {
  it('colors a positive delta accent (good) and keeps it on the right when goodDirection="higher"', () => {
    const rows: DivergingRow[] = [{ label: 'Player', delta: 1.2, display: '+1.20' }];
    const { container, getByText } = render(
      <DivergingBars rows={rows} max={2} goodDirection="higher" />,
    );
    const fill = fillFor(container, 'Player');
    expect(fill!.className).toContain('left-1/2'); // geometry unchanged
    expect(fill!.className).toContain('bg-accent-500'); // color flipped
    expect(getByText('+1.20')).toBeInTheDocument(); // display never inverted
  });

  it('colors a negative delta warning (bad) and keeps it on the left when goodDirection="higher"', () => {
    const rows: DivergingRow[] = [{ label: 'Player', delta: -1.2, display: '-1.20' }];
    const { container } = render(<DivergingBars rows={rows} max={2} goodDirection="higher" />);
    const fill = fillFor(container, 'Player');
    expect(fill!.className).toContain('right-1/2'); // geometry unchanged
    expect(fill!.className).toContain('bg-fw-warning'); // color flipped
  });
});

describe('DivergingBars — referenceTick', () => {
  it('draws one extra tick on every row at the reference value\'s position', () => {
    const rows: DivergingRow[] = [
      { label: 'A', delta: -1, display: '-1.00' },
      { label: 'B', delta: 1, display: '+1.00' },
    ];
    const { container } = render(
      <DivergingBars rows={rows} max={2} referenceTick={{ value: -0.5 }} />,
    );
    const ticks = container.querySelectorAll('[style*="left: -25%"]');
    // -0.5 / 2 * 50 = -12.5; position = 50 + -12.5 = 37.5% — one per row.
    expect(container.querySelectorAll('.bg-text-tertiary').length).toBe(rows.length);
    expect(ticks.length).toBe(0); // sanity: -25% is not the computed position
    const computed = Array.from(container.querySelectorAll('.bg-text-tertiary')) as HTMLElement[];
    computed.forEach((el) => expect(el.style.left).toBe('37.5%'));
  });

  it('announces a labeled reference tick once for assistive tech, not once per row', () => {
    const rows: DivergingRow[] = [
      { label: 'A', delta: -1, display: '-1.00' },
      { label: 'B', delta: 1, display: '+1.00' },
    ];
    const { getAllByText } = render(
      <DivergingBars rows={rows} max={2} referenceTick={{ value: 0.3, label: 'Team average' }} />,
    );
    expect(getAllByText('Team average: 0.3')).toHaveLength(1);
  });

  it('omits the tick entirely when no referenceTick is passed', () => {
    const rows: DivergingRow[] = [{ label: 'A', delta: -1, display: '-1.00' }];
    const { container } = render(<DivergingBars rows={rows} max={2} />);
    expect(container.querySelectorAll('.bg-text-tertiary').length).toBe(0);
  });
});

describe('DivergingBars — row keys tolerate a shared label', () => {
  it('renders two rows sharing the same label without collapsing them', () => {
    const rows: DivergingRow[] = [
      { label: 'Lee', delta: -1, display: '-1.00' },
      { label: 'Lee', delta: 1, display: '+1.00' },
    ];
    const { getAllByText } = render(<DivergingBars rows={rows} max={2} />);
    expect(getAllByText('Lee')).toHaveLength(2);
    expect(getAllByText('-1.00')).toHaveLength(1);
    expect(getAllByText('+1.00')).toHaveLength(1);
  });
});
