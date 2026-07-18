/**
 * ============================================================================
 * ActionItemsPanel — header-count / render coherence (W1 audit)
 * ----------------------------------------------------------------------------
 * Regression coverage for the count-contradiction finding: the "Action Items"
 * header badge showed the FULL `items.length` while the list below it only
 * ever rendered `items.slice(0, 6)` — on any team with more than 6 open items
 * the header (and the hero's "N items are waiting on you", which sources the
 * SAME `enhancedData.actionItems` array in coach-signal.ts) disagreed with
 * what the coach could actually see. The fix renders the full list so the
 * badge always describes exactly what's on screen.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { ActionItemsPanel } from './FairwayCoachDashboard';
import type { ActionItem } from '@/app/golf/actions/dashboard-data';

function makeItems(count: number): ActionItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    type: 'task' as const,
    title: `Task ${i}`,
    date: '2026-07-01',
  }));
}

describe('ActionItemsPanel — count/render coherence', () => {
  it('renders every item the header badge counts (9 items → 9 rows, not slice(0, 6))', () => {
    render(<ActionItemsPanel items={makeItems(9)} />);

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(9);
    // The header badge must equal the number of rows actually rendered.
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('matches header count to render count for a small list too (no off-by-default assumptions)', () => {
    render(<ActionItemsPanel items={makeItems(3)} />);

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows the honest empty state (no badge) when there are no action items', () => {
    render(<ActionItemsPanel items={[]} />);

    expect(screen.getByText('All caught up')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
