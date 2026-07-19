// @vitest-environment jsdom
/**
 * ============================================================================
 * #971 — FairwayTrendBrain honesty regressions
 * ----------------------------------------------------------------------------
 *   1. A streak's raw `magnitude` (streak-detector.ts) is a CUMULATIVE
 *      deviation across the streak, not per-round. The card must display a
 *      per-round average, clamped to a plausible ceiling — never the raw sum.
 *   2. The headline verdict must never assert a declining/improving read that
 *      an ongoing, opposite-tone streak directly contradicts in the same
 *      render.
 *   3. No em dashes in the card's copy.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  FairwayTrendBrain,
  perRoundStreakMagnitude,
  reconcileVerdict,
} from './FairwayTrendBrain';

const baseTrends = {
  metric: 'scoring_average',
  signal: 'strong_declining',
  description: 'Trend read',
  windows: [
    { name: 'slow' as const, direction: 'declining' as const, magnitude: 1.2, confidence: 0.8 },
    { name: 'medium' as const, direction: 'declining' as const, magnitude: 0.9, confidence: 0.6 },
    { name: 'fast' as const, direction: 'declining' as const, magnitude: 0.5, confidence: 0.4 },
  ],
};

describe('perRoundStreakMagnitude — cumulative → per-round', () => {
  it('averages the cumulative magnitude over the streak length', () => {
    // The exact shape of the reported bug: a 4-round streak summing to 23.5.
    expect(perRoundStreakMagnitude(23.5, 4)).toBeCloseTo(5.875, 3);
  });

  it('clamps an implausible per-round figure to the plausibility ceiling', () => {
    expect(perRoundStreakMagnitude(500, 1)).toBe(12);
  });

  it('falls back to the raw magnitude when length is 0 (never divides by zero)', () => {
    expect(perRoundStreakMagnitude(6, 0)).toBe(6);
  });
});

describe('reconcileVerdict — headline never contradicts an ongoing streak', () => {
  it('downgrades a declining verdict to mixed when an ongoing HOT streak is present', () => {
    const verdict = reconcileVerdict(
      { line: 'Your scoring is sliding', tone: 'bad' },
      [{ type: 'hot' }],
    );
    expect(verdict.tone).toBe('neutral');
    expect(verdict.line).toMatch(/mixed/i);
  });

  it('downgrades an improving verdict to mixed when an ongoing COLD streak is present', () => {
    const verdict = reconcileVerdict(
      { line: 'Your scoring is genuinely trending up', tone: 'good' },
      [{ type: 'cold' }],
    );
    expect(verdict.tone).toBe('neutral');
  });

  it('leaves a verdict unchanged when there is no contradicting streak', () => {
    const verdict = reconcileVerdict(
      { line: 'Your scoring is sliding', tone: 'bad' },
      [{ type: 'cold' }],
    );
    expect(verdict.line).toBe('Your scoring is sliding');
    expect(verdict.tone).toBe('bad');
  });

  it('leaves a verdict unchanged with no ongoing streaks at all', () => {
    const verdict = reconcileVerdict({ line: 'Your scoring is sliding', tone: 'bad' }, []);
    expect(verdict.tone).toBe('bad');
  });
});

describe('FairwayTrendBrain — rendered honesty', () => {
  it('never shows a declining headline alongside a positive ongoing hot-streak footer', () => {
    render(
      <FairwayTrendBrain
        trends={baseTrends}
        streaks={[{ type: 'hot', length: 4, magnitude: 23.5, isOngoing: true }]}
      />,
    );

    // The raw "sliding" declining headline must NOT appear...
    expect(screen.queryByText('Your scoring is sliding')).not.toBeInTheDocument();
    // ...it reconciles to the honest mixed read instead.
    expect(screen.getByText(/mixed signals/i)).toBeInTheDocument();
    // The streak line shows a plausible per-round figure (23.5 / 4 = 5.9),
    // never the raw cumulative 23.5.
    expect(screen.getByText(/5\.9 strokes\/round/i)).toBeInTheDocument();
    expect(screen.queryByText(/23\.5 strokes/i)).not.toBeInTheDocument();
  });

  it('renders no em dashes anywhere in its copy', () => {
    const { container } = render(
      <FairwayTrendBrain
        trends={baseTrends}
        streaks={[{ type: 'cold', length: 2, magnitude: 3, isOngoing: true }]}
        volatility={{ current: 4.2, historical: 2.1, isElevated: true }}
      />,
    );
    expect(container.textContent).not.toContain('—');
  });

  it('stacks each window row into label+confidence / direction+note lines (no 3-column collision)', () => {
    const { container } = render(<FairwayTrendBrain trends={baseTrends} />);
    // WindowRow now renders two stacked rows per window instead of one
    // 3-column flex row — assert the stacked wrapper class is present.
    const rows = container.querySelectorAll('.space-y-1');
    expect(rows.length).toBeGreaterThan(0);
  });
});
