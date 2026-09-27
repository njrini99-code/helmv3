// @vitest-environment jsdom
/**
 * ============================================================================
 * #970/#972 — ShotAnalysisCard resilience gauge + Key Weaknesses sample guard
 * ----------------------------------------------------------------------------
 *   1. Resilience is a number with its meaning in words, no gauge (DD-01).
 *   2. A 5-6 shot weakness band must not outrank a robustly-sampled one just
 *      because its small-sample average happens to look worse.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShotAnalysisCard } from './ShotAnalysisCard';

describe('ShotAnalysisCard — resilience readout (DD-01, NUM-30)', () => {
  it('prints resilience as a number with its meaning, and no gauge', () => {
    const { container } = render(<ShotAnalysisCard resilience={0.6} />);
    const block = container.querySelector('[data-slot="deep-dive-resilience"]');
    expect(block?.textContent).toContain('0.6');
    expect(block?.textContent).toContain('One bad shot tends to lead to another');
    expect(container.querySelector('svg path[opacity="0.16"]')).toBeNull();
  });
});

describe('ShotAnalysisCard — distance ladder (DD-01)', () => {
  it('renders approach bands as a ladder and names a dead zone in words', () => {
    const { container } = render(
      <ShotAnalysisCard
        yardageCurve={{
          buckets: [
            { rangeStart: 100, rangeEnd: 125, avgSG: 0.1, shotCount: 20, greenHitRate: 0.6 },
            { rangeStart: 150, rangeEnd: 175, avgSG: -0.3, shotCount: 18, greenHitRate: 0.4 },
          ],
        }}
        deadZones={[{ rangeStart: 150, rangeEnd: 175, deficit: 0.3, shotCount: 18 }]}
      />,
    );
    const ladder = container.querySelector('[data-slot="distance-ladder"]');
    expect(ladder?.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('Dead zone')).toBeInTheDocument();
    expect(ladder?.textContent).toMatch(/Tee shots and putts are left out/);
    expect(container.querySelector('.bg-fw-danger-bg')).toBeNull();
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
  it('does not render a positive-avgSG context under "Key weaknesses"', () => {
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

    expect(screen.queryByText('Key weaknesses')).toBeInTheDocument();
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
    // SG through formatMetric: 2 dp with a true minus (display-registry §5.2).
    expect(screen.getByText('−0.40')).toBeInTheDocument();
  });
});

describe('ShotAnalysisCard — scramble window and null safety (NUM-20, FP-06)', () => {
  it('names the 90-day window next to the deep-dive scramble rate', () => {
    const { container } = render(<ShotAnalysisCard scrambleRate={0.55} />);
    const block = container.querySelector('[data-slot="deep-dive-scramble"]');
    expect(block?.textContent).toContain('Last 90 days');
  });

  it('prints no scramble rate when the engine reports no attempts (null), never 0%', () => {
    const { container } = render(
      <ShotAnalysisCard shotData={{ scrambleRate: { scrambleRate: null, totalScrambleAttempts: 0 }, resilience: 1.2 }} />,
    );
    expect(container.querySelector('[data-slot="deep-dive-scramble"]')).toBeNull();
    expect(container.textContent).not.toContain('0%');
  });
});

describe('ShotAnalysisCard — teamScrambleRate scale (Package 11 follow-up)', () => {
  it('scales a 0-1 teamScrambleRate fraction to a percent, same as the player scrambleRate', () => {
    const { container } = render(<ShotAnalysisCard scrambleRate={0.55} teamScrambleRate={0.62} />);

    // Player rate: 55%, printed once (the duplicate badge was removed, DD-01).
    expect(screen.getAllByText('55%')).toHaveLength(1);
    // Team avg: 62%, not the unscaled "0.62%".
    expect(container.textContent).toContain('team avg: 62%');
    expect(container.textContent).not.toContain('team avg: 0.62%');
  });

  it('passes an already-scaled (>1) teamScrambleRate through unchanged', () => {
    const { container } = render(<ShotAnalysisCard scrambleRate={0.55} teamScrambleRate={62} />);

    expect(container.textContent).toContain('team avg: 62%');
  });
});
