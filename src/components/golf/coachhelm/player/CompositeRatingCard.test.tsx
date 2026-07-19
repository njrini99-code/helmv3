// @vitest-environment jsdom
/**
 * ============================================================================
 * #970/#973 — CompositeRatingCard gauge + midpoint-default honesty
 * ----------------------------------------------------------------------------
 *   1. The rebuilt Dial gauge always renders a visible track (never a
 *      floating broken arc) regardless of value — pinned via the shared
 *      Dial primitive rather than a bespoke SVG.
 *   2. When every category lands on the exact computeCategoryRatings({})
 *      midpoint-default signature (all 50), the card must show an honest
 *      insufficient-data panel instead of plotting fake-looking bars.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompositeRatingCard } from './CompositeRatingCard';

describe('CompositeRatingCard — gauge honesty (#970)', () => {
  it('always renders a visible gauge track, even at a low value', () => {
    const { container } = render(
      <CompositeRatingCard composite={12} categories={{ teeGame: 30, approach: 20, shortGame: 10, putting: 15, scoring: 22 }} />,
    );
    // Dial's track path always renders with a non-zero opacity — never omitted.
    const trackPath = container.querySelector('path[opacity="0.16"]');
    expect(trackPath).not.toBeNull();
  });
});

describe('CompositeRatingCard — midpoint-default detection (#973)', () => {
  it('shows an honest insufficient-data panel when every category is exactly the 50 midpoint default', () => {
    render(
      <CompositeRatingCard
        composite={62}
        categories={{ teeGame: 50, approach: 50, shortGame: 50, putting: 50, scoring: 50 }}
      />,
    );
    expect(screen.getByText(/category breakdown warming up/i)).toBeInTheDocument();
    // The bars themselves must not render alongside the honest panel.
    expect(screen.queryByText('Tee Game')).not.toBeInTheDocument();
  });

  it('renders real category bars when values are genuinely differentiated', () => {
    render(
      <CompositeRatingCard
        composite={62}
        categories={{ teeGame: 71, approach: 44, shortGame: 58, putting: 33, scoring: 60 }}
      />,
    );
    expect(screen.queryByText(/category breakdown warming up/i)).not.toBeInTheDocument();
    expect(screen.getByText('Tee Game')).toBeInTheDocument();
    expect(screen.getByText('Approach')).toBeInTheDocument();
  });

  it('shows an honest empty state when there is no composite or category data at all', () => {
    render(<CompositeRatingCard />);
    expect(screen.getByText(/game strength warming up/i)).toBeInTheDocument();
  });
});
