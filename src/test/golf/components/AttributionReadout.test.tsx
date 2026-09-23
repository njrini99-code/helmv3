/**
 * A9 slice 3: `AttributionReadout` — the presentational component,
 * decoupled from data-fetching (its own test, not this file's job, is
 * `src/test/golf/actions/insight-attribution.test.ts`). Verifies it
 * renders nothing for a null prop (flag off / unauthenticated / failed
 * read, all collapsed by the server action) and renders the right chip for
 * each real, non-null state.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttributionReadout } from '@/components/golf/coachhelm/insight-card/AttributionReadout';
import type { AttributionReadout as AttributionReadoutModel } from '@/lib/coachhelm/v3/effectiveness/attribution-view-model';

describe('AttributionReadout', () => {
  it('renders nothing for a null readout (flag off, unauthenticated, or a failed read)', () => {
    const { container } = render(<AttributionReadout readout={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a quiet "not attributed yet" note for the missing state', () => {
    render(<AttributionReadout readout={{ state: 'missing' }} />);
    const badge = screen.getByTestId('attribution-readout');
    expect(badge).toHaveAttribute('data-state', 'missing');
    expect(badge.textContent).toContain('Not attributed yet');
  });

  it('renders sample sizes for the insufficient state', () => {
    const readout: AttributionReadoutModel = {
      state: 'insufficient',
      sampleSize: { before: 1, after: 2 },
      method: { label: 'observed_change', description: 'Observed change on comparable shots', isClean: true },
    };
    render(<AttributionReadout readout={readout} />);
    const badge = screen.getByTestId('attribution-readout');
    expect(badge).toHaveAttribute('data-state', 'insufficient');
    expect(badge.textContent).toContain('Not enough rounds yet');
    expect(badge.textContent).toContain('1 before');
    expect(badge.textContent).toContain('2 after');
  });

  it('renders the clean-method result with its hedged description, never "improved"/"proven"/"caused"', () => {
    const readout: AttributionReadoutModel = {
      state: 'result',
      insightId: 'i1',
      targetMetricId: 'sg_total',
      delta: 1.4,
      sampleSize: { before: 5, after: 6 },
      method: { label: 'observed_change', description: 'Observed change on comparable shots', isClean: true },
    };
    render(<AttributionReadout readout={readout} />);
    const badge = screen.getByTestId('attribution-readout');
    expect(badge).toHaveAttribute('data-state', 'result');
    expect(badge).toHaveAttribute('data-method', 'observed_change');
    expect(badge.textContent).toContain('Observed change on comparable shots');
    expect(badge.textContent?.toLowerCase()).not.toMatch(/\bimproved\b|\bproven\b|\bcaused\b/);
  });

  it('renders the limited-method result distinctly (limited ≠ clean)', () => {
    const readout: AttributionReadoutModel = {
      state: 'result',
      insightId: 'i1',
      targetMetricId: 'sg_total',
      delta: 1.4,
      sampleSize: { before: 5, after: 6 },
      method: {
        label: 'observed_change_limited',
        description: "Observed change — another change happened in the same window, so it can't be isolated",
        isClean: false,
      },
    };
    render(<AttributionReadout readout={readout} />);
    const badge = screen.getByTestId('attribution-readout');
    expect(badge).toHaveAttribute('data-method', 'observed_change_limited');
    expect(badge.textContent).toContain("can't be isolated");
  });
});
