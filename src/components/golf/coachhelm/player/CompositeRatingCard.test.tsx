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
import { computeFormFromCountableRounds } from '@/lib/golf/form-score';

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
    // OD-02 rename: the card is Form now (was "Game strength warming up").
    expect(screen.getByText(/form warming up/i)).toBeInTheDocument();
  });
});

describe('CompositeRatingCard — Form (OD-02)', () => {
  it('labels an early read and explains the formula on tap', () => {
    const form = computeFormFromCountableRounds([
      { score_to_par: 4, holes_played: 18 },
      { score_to_par: 6, holes_played: 18 },
    ]);
    render(<CompositeRatingCard composite={form.score ?? undefined} form={form} categories={{ teeGame: 71, approach: 44, shortGame: 58, putting: 33, scoring: 60 }} />);
    expect(screen.getByText('Early read')).toBeInTheDocument();
    const summary = screen.getByText('How Form works');
    expect(summary.tagName).toBe('SUMMARY');
    expect(screen.getByText(/\+5\.0 over 2 rounds/)).toBeInTheDocument();
  });

  it('reads Form from profileData and shows no early-read label once settled', () => {
    const form = computeFormFromCountableRounds(Array.from({ length: 5 }, () => ({ score_to_par: 0, holes_played: 18 })));
    render(<CompositeRatingCard profileData={{ composite: form.score, form, categories: { teeGame: 71, approach: 44, shortGame: 58, putting: 33, scoring: 60 } }} />);
    expect(screen.queryByText('Early read')).not.toBeInTheDocument();
    expect(screen.getAllByText('Form').length).toBeGreaterThan(0);
  });
});
