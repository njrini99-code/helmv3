// @vitest-environment jsdom
/**
 * ============================================================================
 * CategoryInsightStrip — render tests
 * ----------------------------------------------------------------------------
 * Covers the honest-empty-state contract (never a tall empty box), the
 * insight-row cap, the leak/strength chip sign, and the inline trend +
 * delta chip wiring. Renders real framer-motion (no mock needed — mirrors
 * the sibling Ribbon.test.tsx in this same charts/spine-stage family).
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CategoryInsightStrip } from '../CategoryInsightStrip';

describe('CategoryInsightStrip', () => {
  it('renders nothing when there are no insights and no usable series (honest empty state)', () => {
    const { container } = render(<CategoryInsightStrip insights={[]} series={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the series has fewer than 2 finite points', () => {
    const { container } = render(<CategoryInsightStrip insights={[]} series={[42]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the eyebrow + insight rows when insights exist, even with no series', () => {
    render(
      <CategoryInsightStrip
        insights={[{ title: 'Misses left on approach', strokeImpact: -0.9, recommendation: 'Aim right.' }]}
      />,
    );
    expect(screen.getByText('What CoachHelm sees')).toBeInTheDocument();
    expect(screen.getByText('Misses left on approach')).toBeInTheDocument();
    expect(screen.getByText(/Aim right\./)).toBeInTheDocument();
  });

  it('renders the trend sparkline + delta chip when only a series exists (no insights)', () => {
    const { container } = render(
      <CategoryInsightStrip
        series={[55, 58, 63]}
        delta={{ text: '+8%', direction: 'up', good: true }}
        trendLabel="Fairways hit"
      />,
    );
    expect(container.querySelector('[data-slot="sparkline"]')).not.toBeNull();
    expect(screen.getByText('+8%')).toBeInTheDocument();
  });

  it('caps insight rows at `max` (default 2)', () => {
    render(
      <CategoryInsightStrip
        insights={[
          { title: 'First read', strokeImpact: -0.9 },
          { title: 'Second read', strokeImpact: -0.6 },
          { title: 'Third read (should be dropped)', strokeImpact: -0.3 },
        ]}
      />,
    );
    expect(screen.getByText('First read')).toBeInTheDocument();
    expect(screen.getByText('Second read')).toBeInTheDocument();
    expect(screen.queryByText('Third read (should be dropped)')).not.toBeInTheDocument();
  });

  it('honors a custom max', () => {
    render(
      <CategoryInsightStrip
        max={1}
        insights={[
          { title: 'First read', strokeImpact: -0.9 },
          { title: 'Second read (dropped)', strokeImpact: -0.6 },
        ]}
      />,
    );
    expect(screen.getByText('First read')).toBeInTheDocument();
    expect(screen.queryByText('Second read (dropped)')).not.toBeInTheDocument();
  });

  it('renders a leak (negative) strokeImpact with a minus-signed magnitude', () => {
    render(<CategoryInsightStrip insights={[{ title: 'A leak', strokeImpact: -1.2 }]} />);
    expect(screen.getByText('−1.2')).toBeInTheDocument();
  });

  it('renders a strength (positive) strokeImpact with a plus-signed magnitude', () => {
    render(<CategoryInsightStrip insights={[{ title: 'A strength', strokeImpact: 0.8 }]} />);
    expect(screen.getByText('+0.8')).toBeInTheDocument();
  });

  it('omits the recommendation line when none is given', () => {
    const { container } = render(
      <CategoryInsightStrip insights={[{ title: 'No fix yet', strokeImpact: -0.4 }]} />,
    );
    expect(container.querySelector('[data-slot="category-insight-row"]')?.textContent).not.toMatch(/Fix ·/);
  });

  it('does not render a trend chip when no delta is supplied even with a valid series', () => {
    const { container } = render(<CategoryInsightStrip series={[1, 2, 3]} />);
    expect(container.querySelector('[data-slot="sparkline"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="trend-chip"]')).toBeNull();
  });

  it('filters non-finite values out of the series before deciding whether it has enough points', () => {
    const { container } = render(<CategoryInsightStrip series={[1, Number.NaN]} />);
    // Only one finite point survives — same as "no usable series".
    expect(container.firstChild).toBeNull();
  });
});
