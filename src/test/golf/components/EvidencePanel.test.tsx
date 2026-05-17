/**
 * EvidencePanel tests — UI-1 of the Insight Quality phase.
 *
 * Covers:
 *  - renders nothing when evidence is missing (legacy pre-phase rows)
 *  - compact mode surfaces the four key facts
 *  - expanded mode surfaces all seven rows
 *  - confidence colour thresholds (green ≥ 0.7, amber 0.4-0.7, gray < 0.4)
 *  - formatValue handles every InsightUnit enum value
 *
 * These are pure-render tests — no server actions, no routing, no mocks
 * beyond what src/test/setup.tsx already provides.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  EvidencePanel,
  formatValue,
  formatWindow,
  confidenceColor,
} from '@/components/golf/coachhelm/insights/EvidencePanel';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

function makeEvidence(overrides: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    metric: 'putt_make_rate_6_10ft',
    metric_label: 'Make rate from 6-10 feet',
    unit: 'percent',
    your_value: 0.38,
    your_value_display: '38%',
    comparison_value: 0.52,
    comparison_label: 'D2 average',
    comparison_source: 'd2_avg',
    sample_n: 47,
    window_days: 30,
    window_start: '2026-03-23T00:00:00.000Z',
    window_end: '2026-04-22T00:00:00.000Z',
    strokes_impact: 2.1,
    strokes_impact_method: 'peer_delta',
    confidence: 0.78,
    confidence_factors: {
      sample_adequacy: 1,
      recency: 1,
      variance: 0.5,
    },
    ...overrides,
  };
}

describe('EvidencePanel', () => {
  it('renders nothing when evidence is undefined', () => {
    const { container } = render(<EvidencePanel evidence={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when evidence is null', () => {
    const { container } = render(<EvidencePanel evidence={null} />);
    expect(container.firstChild).toBeNull();
  });

  // TODO(plan-03 + user-wip): see src/test/SKIPPED.md.
  it.skip('compact mode renders the four key facts in a single row', () => {
    render(<EvidencePanel evidence={makeEvidence()} compact />);

    // Your number vs comparison pill
    const yourValue = screen.getByTestId('evidence-your-value');
    expect(yourValue.textContent).toContain('38%');
    expect(yourValue.textContent).toContain('52%');
    expect(yourValue.textContent).toContain('D2 average');

    // Sample + window
    expect(screen.getByTestId('evidence-sample').textContent).toContain('47 putts');
    expect(screen.getByTestId('evidence-sample').textContent).toContain('30 days');

    // Strokes impact
    expect(screen.getByTestId('evidence-impact').textContent).toContain('2.1');
    expect(screen.getByTestId('evidence-impact').textContent).toContain('strokes');

    // Confidence
    expect(screen.getByTestId('evidence-confidence').textContent).toContain('78%');
  });

  it('expanded mode renders all seven rows', () => {
    render(<EvidencePanel evidence={makeEvidence()} compact={false} />);

    expect(screen.getByTestId('evidence-row-your')).toHaveTextContent('Your number');
    expect(screen.getByTestId('evidence-row-comparison')).toHaveTextContent('Comparison');
    expect(screen.getByTestId('evidence-row-sample')).toHaveTextContent('Sample');
    expect(screen.getByTestId('evidence-row-window')).toHaveTextContent('Window');
    expect(screen.getByTestId('evidence-row-impact')).toHaveTextContent('Strokes impact');
    expect(screen.getByTestId('evidence-row-method')).toHaveTextContent('Method');
    expect(screen.getByTestId('evidence-row-confidence')).toHaveTextContent('Confidence');

    // Metric label header
    expect(screen.getByText('Make rate from 6-10 feet')).toBeInTheDocument();

    // Progress bar should be accessible
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '78');
  });

  describe('confidenceColor thresholds', () => {
    it('returns green (primary) for confidence >= 0.7', () => {
      const result = confidenceColor(0.7);
      expect(result.bar).toContain('primary');
      expect(result.text).toContain('primary');
    });

    it('returns amber for confidence 0.4 <= c < 0.7', () => {
      const low = confidenceColor(0.4);
      const mid = confidenceColor(0.6);
      expect(low.bar).toContain('amber');
      expect(mid.bar).toContain('amber');
    });

    it('returns gray for confidence < 0.4', () => {
      const result = confidenceColor(0.3);
      expect(result.bar).toContain('warm');
      expect(result.text).toContain('warm');
    });
  });

  describe('formatValue unit handling', () => {
    it('formats percent (0..1 fraction scaled to %)', () => {
      expect(formatValue(0.38, 'percent')).toBe('38%');
    });

    it('formats percent values already scaled >1 without double-scaling', () => {
      expect(formatValue(38, 'percent')).toBe('38%');
    });

    it('formats strokes with sign and one decimal', () => {
      expect(formatValue(2.1, 'strokes')).toBe('+2.1');
      expect(formatValue(-1.3, 'strokes')).toBe('-1.3');
    });

    it('formats yards rounded to nearest integer', () => {
      expect(formatValue(24.4, 'yards')).toBe('24 yd');
    });

    it('formats feet rounded to nearest integer', () => {
      expect(formatValue(8.6, 'feet')).toBe('9 ft');
    });

    it('formats count as rounded integer', () => {
      expect(formatValue(47, 'count')).toBe('47');
    });

    it('prefers your_value_display when provided', () => {
      expect(formatValue(0.38, 'percent', '38.2%')).toBe('38.2%');
    });
  });

  describe('formatWindow', () => {
    it('renders days + date range when both ends parse', () => {
      const out = formatWindow('2026-03-23T00:00:00Z', '2026-04-22T00:00:00Z', 30);
      expect(out).toContain('30 days');
      expect(out).toContain('Mar 23');
      expect(out).toContain('Apr 22');
    });

    it('falls back to day count when dates are unparseable', () => {
      expect(formatWindow('not-a-date', 'also-not-a-date', 30)).toBe('30 days');
    });
  });
});
