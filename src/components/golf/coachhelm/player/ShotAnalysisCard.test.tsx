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

describe('ShotAnalysisCard — Key Weaknesses excludes net-positive contexts (Package 11)', () => {
  it('does not render a positive-avgSG context under "Key Weaknesses"', () => {
    render(
      <ShotAnalysisCard
        weaknesses={[
          // A strong player: every ranked context clears the sample bar and
          // is still net-positive. None of these are a real weakness.
          { context: 'a', lie: 'green', distanceRange: '0-3', avgSG: 0.2, shotCount: 40 },
          { context: 'b', lie: 'fairway', distanceRange: '150-175', avgSG: 0.05, shotCount: 30 },
        ]}
      />,
    );

    expect(screen.queryByText('Key Weaknesses')).toBeInTheDocument();
    expect(screen.queryByText(/shots$/)).toBeNull();
    expect(screen.getByText(/at or above par/i)).toBeInTheDocument();
  });

  it('keeps a genuinely negative context and drops a positive one from the same list', () => {
    render(
      <ShotAnalysisCard
        weaknesses={[
          { context: 'weak', lie: 'green', distanceRange: '0-3', avgSG: -0.4, shotCount: 50 },
          { context: 'strength', lie: 'fairway', distanceRange: '150-175', avgSG: 0.3, shotCount: 50 },
        ]}
      />,
    );

    expect(screen.getByText('50 shots')).toBeInTheDocument();
    expect(screen.getAllByText(/shots$/)).toHaveLength(1);
    expect(screen.getByText('-0.40')).toBeInTheDocument();
  });
});

describe('ShotAnalysisCard — teamScrambleRate scale (Package 11 follow-up)', () => {
  it('scales a 0-1 teamScrambleRate fraction to a percent, same as the player scrambleRate', () => {
    const { container } = render(<ShotAnalysisCard scrambleRate={0.55} teamScrambleRate={0.62} />);

    // Player rate: 55% (rendered twice — the badge circle and the caption).
    expect(screen.getAllByText('55%').length).toBeGreaterThan(0);
    // Team avg: 62%, not the unscaled "0.62%".
    expect(container.textContent).toContain('team avg: 62%');
    expect(container.textContent).not.toContain('team avg: 0.62%');
  });

  it('passes an already-scaled (>1) teamScrambleRate through unchanged', () => {
    const { container } = render(<ShotAnalysisCard scrambleRate={0.55} teamScrambleRate={62} />);

    expect(container.textContent).toContain('team avg: 62%');
  });
});
