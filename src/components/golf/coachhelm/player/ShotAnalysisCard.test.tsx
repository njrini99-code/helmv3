// @vitest-environment jsdom
/**
 * ============================================================================
 * #970/#972 — ShotAnalysisCard resilience gauge + Key Weaknesses sample guard
 * ----------------------------------------------------------------------------
 *   1. The rebuilt Resilience Dial always shows a visible track (never a
 *      floating broken arc), replacing the bespoke inline SVG ring.
 *   2. A 5-6 shot weakness band must not outrank a robustly-sampled one just
 *      because its small-sample average happens to look worse.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShotAnalysisCard } from './ShotAnalysisCard';

describe('ShotAnalysisCard — resilience gauge honesty (#970)', () => {
  it('always renders a visible gauge track for the Resilience dial', () => {
    const { container } = render(<ShotAnalysisCard resilience={0.6} />);
    const trackPath = container.querySelector('path[opacity="0.16"]');
    expect(trackPath).not.toBeNull();
  });
});

describe('ShotAnalysisCard — Key Weaknesses minimum-sample guard (#972)', () => {
  it('ranks a robustly-sampled band ahead of a thin-sample band even when the thin band looks worse', () => {
    render(
      <ShotAnalysisCard
        weaknesses={[
          // Thin sample (6 shots) with a dramatic-looking average SG — must
          // not outrank the 172-shot signal below it.
          { context: 'thin', lie: 'fairway', distanceRange: '190-220', avgSG: -1.9, shotCount: 6 },
          { context: 'robust', lie: 'green', distanceRange: '0-3', avgSG: -0.4, shotCount: 172 },
        ]}
      />,
    );

    const cards = screen.getAllByText(/shots$/);
    // The robustly-sampled 172-shot row renders before the thin 6-shot row.
    expect(cards[0]).toHaveTextContent('172 shots');
    expect(screen.getByText(/small sample/i)).toBeInTheDocument();
  });

  it('keeps original ordering among bands on the same side of the sample threshold', () => {
    render(
      <ShotAnalysisCard
        weaknesses={[
          { context: 'a', lie: 'green', distanceRange: '0-3', avgSG: -0.5, shotCount: 40 },
          { context: 'b', lie: 'fairway', distanceRange: '150-175', avgSG: -0.3, shotCount: 30 },
        ]}
      />,
    );
    const cards = screen.getAllByText(/shots$/);
    expect(cards[0]).toHaveTextContent('40 shots');
    expect(cards[1]).toHaveTextContent('30 shots');
  });
});
