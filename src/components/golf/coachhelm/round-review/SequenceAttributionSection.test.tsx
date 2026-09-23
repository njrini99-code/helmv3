/**
 * A4 slice 3b — `SequenceAttributionSection` rendering + sign-convention
 * tests.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SequenceAttributionSection, describeObservedGain } from './SequenceAttributionSection';
import type { MetricResult } from '@/lib/coachhelm/v3/metrics/types';
import type { AnalysisScope } from '@/lib/coachhelm/v3/context/types';

const SCOPE: AnalysisScope = {
  player_id: 'player-1',
  window_start: '2025-09-23',
  window_end: '2026-09-23',
  analysis_cutoff: '2026-09-23T00:00:00.000Z',
};

function makeRow(overrides: Partial<MetricResult> & { metricId: string }): MetricResult {
  return {
    scope: SCOPE,
    dimensions: {},
    unit: 'strokes',
    value: null,
    numerator: null,
    denominator: 0,
    eligibleCount: 0,
    observedCount: 0,
    distinctRounds: 0,
    status: 'invalid',
    exclusions: {},
    ...overrides,
  };
}

describe('describeObservedGain — sign convention (pins the flip)', () => {
  it('positive value renders "+" and "gained" with the success tone', () => {
    const { text, toneClass } = describeObservedGain(0.4);
    expect(text).toContain('+0.40');
    expect(text).toContain('gained');
    expect(text).not.toContain('lost');
    expect(toneClass).toBe('text-fw-success-ink');
  });

  it('negative value renders "−" and "lost" with the warning tone', () => {
    const { text, toneClass } = describeObservedGain(-0.4);
    expect(text).toContain('−0.40');
    expect(text).toContain('lost');
    expect(text).not.toContain('gained');
    expect(toneClass).toBe('text-fw-warning-ink');
  });

  it('a value that rounds to zero reads as "even", carries no stray sign', () => {
    const { text, toneClass } = describeObservedGain(0.001);
    expect(text).not.toMatch(/[+−]0\.00/);
    expect(text).toContain('even');
    expect(toneClass).toBe('text-text-primary');
  });

  it('never uses "saved" — the wording guard (#2023) forbids "saved" near "strokes"/"str/rd"', () => {
    expect(describeObservedGain(0.4).text.toLowerCase()).not.toContain('sav');
    expect(describeObservedGain(-0.4).text.toLowerCase()).not.toContain('sav');
  });
});

describe('SequenceAttributionSection — rendering', () => {
  it('results === null: renders nothing (flag off / unauthorized / failed read)', () => {
    const { container } = render(<SequenceAttributionSection results={null} windowLabel="Last 12 months" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a zero-row results array renders nothing', () => {
    const { container } = render(<SequenceAttributionSection results={[]} windowLabel="Last 12 months" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('supported rows show their signed value; insufficient rows show "Not enough holes yet" and no number', () => {
    const results: MetricResult[] = [
      makeRow({
        metricId: 'sequence_event_strokes_gained',
        dimensions: { event_kind: 'tee_to_next' },
        status: 'supported',
        value: 0.42,
        denominator: 14,
      }),
      makeRow({
        metricId: 'sequence_event_strokes_gained',
        dimensions: { event_kind: 'penalty' },
        status: 'insufficient',
        value: -0.1, // still carries a computed value — must not be shown
        denominator: 2,
      }),
      makeRow({
        metricId: 'sequence_event_strokes_gained',
        dimensions: { event_kind: 'other' },
        status: 'invalid',
        value: null,
        denominator: 0,
      }),
      // Excluded from the findings list entirely — a count, not a finding.
      makeRow({ metricId: 'sequence_hole_coverage', dimensions: {}, status: 'supported', value: 12 }),
    ];

    render(<SequenceAttributionSection results={results} windowLabel="Last 12 months" />);

    const rows = screen.getAllByTestId('sequence-attribution-row');
    expect(rows).toHaveLength(3);

    const supportedRow = screen.getByText('Tee shot').closest('li')!;
    expect(supportedRow).toHaveAttribute('data-status', 'supported');
    expect(supportedRow.textContent).toContain('+0.42');
    expect(supportedRow.textContent).toContain('gained');
    expect(supportedRow.textContent).not.toContain('Not enough holes yet');

    const insufficientRow = screen.getByText('Penalty').closest('li')!;
    expect(insufficientRow).toHaveAttribute('data-status', 'insufficient');
    expect(insufficientRow.textContent).toContain('Not enough holes yet');
    expect(insufficientRow.textContent).not.toContain('0.1');

    const invalidRow = screen.getByText('Other').closest('li')!;
    expect(invalidRow).toHaveAttribute('data-status', 'insufficient');
    expect(invalidRow.textContent).toContain('Not enough holes yet');

    // sequence_hole_coverage is excluded from the findings list entirely —
    // already proven by `rows` above having exactly 3 entries (4 input rows
    // minus the coverage row), not 4.
  });

  it('renders the window label as the panel header', () => {
    const results: MetricResult[] = [
      makeRow({
        metricId: 'sequence_event_strokes_gained',
        dimensions: { event_kind: 'first_putt_to_next_putt' },
        status: 'supported',
        value: 0.1,
        denominator: 10,
      }),
    ];

    render(<SequenceAttributionSection results={results} windowLabel="Last 12 months (Sep 2025–Sep 2026)" />);

    expect(screen.getByText('Last 12 months (Sep 2025–Sep 2026)')).toBeTruthy();
  });
});
