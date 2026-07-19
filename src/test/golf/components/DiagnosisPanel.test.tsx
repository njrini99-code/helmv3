/**
 * DiagnosisPanel tests (audit W4 — diagnosis-deadcode).
 *
 * DiagnosisPanel previously shipped an `onSeeEvidence` drill-through that
 * opened a `DiagnosisSheet` detail screen. Grepping the whole repo found
 * zero production callers ever wired that trigger — its only caller was the
 * dev-only `/vizlab` harness (which 404s in production). `DiagnosisSheet` was
 * deleted as dead code and the now-unreachable `onSeeEvidence` prop + its
 * "See full breakdown" button were removed from `DiagnosisPanel`.
 *
 * These are pure-render tests guarding:
 *  - the reasoning spine still renders (symptom, root cause, drivers, Rx)
 *  - the causality chip reads correctly for both measured + hypothesis rows
 *  - `maxDrivers` truncation shows an honest "+N more driver(s)" note that
 *    does NOT claim a "full breakdown" screen exists to see them
 *  - no "See full breakdown" affordance ever renders (regression guard
 *    against silently reintroducing a dead drill-through)
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiagnosisPanel } from '@/components/golf/coachhelm/insights/DiagnosisPanel';
import type { Diagnosis } from '@/lib/coachhelm/v2/insights/types';

function makeDiagnosis(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    symptom: 'You 3-putt from outside 15 feet more than twice as often as Tour.',
    root_cause: 'Lag distance control is the leak.',
    causality_level: 'inferred_hypothesis',
    drivers: [
      { metric: 'putts_made_10_15ft_pct', value: 0.21, unit: 'percent', sample_n: 42, source: 'golf_shots · last 12 rounds' },
      { metric: 'putts_made_15_25ft_pct', value: 0.09, unit: 'percent', sample_n: 31, source: 'golf_shots · last 12 rounds' },
    ],
    recommended_action: 'Run a 30-foot lag ladder before working the make.',
    confidence_reason: '12 rounds, 42 putts — enough to flag, not yet proven.',
    ...overrides,
  };
}

describe('DiagnosisPanel', () => {
  it('renders the reasoning spine: symptom, root cause, drivers, recommended action', () => {
    render(<DiagnosisPanel diagnosis={makeDiagnosis()} category="putting" />);

    expect(screen.getByText(/3-putt from outside 15 feet/)).toBeTruthy();
    expect(screen.getByText(/Lag distance control is the leak/)).toBeTruthy();
    expect(screen.getByText(/Run a 30-foot lag ladder/)).toBeTruthy();
    // eyebrow includes the category
    expect(screen.getByText(/Root cause/)).toBeTruthy();
    expect(screen.getByText(/putting/)).toBeTruthy();
  });

  it('marks an inferred_hypothesis diagnosis as a Hypothesis, not a fact', () => {
    render(<DiagnosisPanel diagnosis={makeDiagnosis({ causality_level: 'inferred_hypothesis' })} />);
    expect(screen.getByText('Hypothesis')).toBeTruthy();
    expect(screen.getByText(/Likely because/)).toBeTruthy();
  });

  it('marks an observed_sequence diagnosis as Measured', () => {
    render(<DiagnosisPanel diagnosis={makeDiagnosis({ causality_level: 'observed_sequence' })} />);
    expect(screen.getByText('Measured')).toBeTruthy();
    expect(screen.getByText(/Caused by/)).toBeTruthy();
  });

  it('truncates drivers to maxDrivers with an honest count, no dangling "full breakdown" claim', () => {
    render(<DiagnosisPanel diagnosis={makeDiagnosis()} maxDrivers={1} />);
    expect(screen.getByText('+1 more driver')).toBeTruthy();
    expect(screen.queryByText(/full breakdown/i)).toBeNull();
  });

  it('never renders a "See full breakdown" drill-through (DiagnosisSheet was deleted as dead code)', () => {
    render(<DiagnosisPanel diagnosis={makeDiagnosis()} maxDrivers={1} />);
    expect(screen.queryByRole('button', { name: /see full breakdown/i })).toBeNull();
  });

  it('shows the trust badge only when a trust status is passed', () => {
    const { rerender } = render(<DiagnosisPanel diagnosis={makeDiagnosis()} />);
    expect(screen.queryByText('Promising')).toBeNull();

    rerender(<DiagnosisPanel diagnosis={makeDiagnosis()} trust="promising" />);
    expect(screen.getByText('Promising')).toBeTruthy();
  });
});
