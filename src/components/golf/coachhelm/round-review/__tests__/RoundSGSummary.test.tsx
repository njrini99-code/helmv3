// @vitest-environment jsdom
/**
 * ============================================================================
 * RoundSGSummary — pure helpers + honest-empty / live render coverage
 * ----------------------------------------------------------------------------
 * `framer-motion`'s `useReducedMotion` is mocked to `true` for every test in
 * this file so `AnimatedNumber` renders its final value synchronously (no
 * 0 → value mount-roll to await) — the same pattern
 * `src/components/ui/__tests__/animated-number.test.tsx` uses for its
 * "reduced motion" cases. Nothing else in this component's tree
 * (`InstrumentPanel`/`InstrumentCluster`/`Readout`/`StrokesGainedTornado`)
 * imports `framer-motion`, so mocking it whole-file is safe.
 *
 * `@number-flow/react` is globally mocked in `src/test/setup.tsx` to render
 * `{prefix}{value}{suffix}` as a plain span with NO Intl formatting applied
 * — so assertions below pick values whose raw `Math.abs(...)` JS string form
 * already matches the intended 2-decimal display (e.g. `1.9`, `1.42`) rather
 * than relying on the (un-mocked-here) `format` prop.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('framer-motion', () => ({ useReducedMotion: () => true }));

import {
  RoundSGSummary,
  buildSGCategoryData,
  buildSGTakeaway,
  sgTourLabel,
  type RoundSGCategoryInputs,
} from '../RoundSGSummary';
import type { SGCategory } from '@/components/fairway';

function categoryInputs(overrides: Partial<RoundSGCategoryInputs> = {}): RoundSGCategoryInputs {
  return {
    strokesGainedTee: null,
    strokesGainedApproach: null,
    strokesGainedAroundGreen: null,
    strokesGainedPutting: null,
    ...overrides,
  };
}

describe('buildSGCategoryData', () => {
  it('returns all four categories, in tee/approach/around-green/putting order, when every column is populated', () => {
    const data = buildSGCategoryData(
      categoryInputs({
        strokesGainedTee: -1.8,
        strokesGainedApproach: 0.4,
        strokesGainedAroundGreen: -0.1,
        strokesGainedPutting: 1.9,
      }),
    );
    expect(data).toEqual<SGCategory[]>([
      { label: 'Off the Tee', value: -1.8 },
      { label: 'Approach', value: 0.4 },
      { label: 'Around the Green', value: -0.1 },
      { label: 'Putting', value: 1.9 },
    ]);
  });

  it('filters out null categories independently — never fabricates a 0 for an uncomputed column', () => {
    const data = buildSGCategoryData(
      categoryInputs({ strokesGainedTee: -1.8, strokesGainedPutting: 1.9 }),
    );
    expect(data).toEqual<SGCategory[]>([
      { label: 'Off the Tee', value: -1.8 },
      { label: 'Putting', value: 1.9 },
    ]);
  });

  it('returns an empty array when every category is null', () => {
    expect(buildSGCategoryData(categoryInputs())).toEqual([]);
  });
});

describe('sgTourLabel', () => {
  it('defaults to PGA Tour when isWomens is omitted/false', () => {
    expect(sgTourLabel()).toBe('PGA Tour');
    expect(sgTourLabel(false)).toBe('PGA Tour');
  });

  it('reads LPGA Tour when isWomens is true', () => {
    expect(sgTourLabel(true)).toBe('LPGA Tour');
  });
});

describe('buildSGTakeaway', () => {
  it('returns null when there are no categories to compare', () => {
    expect(buildSGTakeaway([])).toBeNull();
  });

  it('names best (most gained) and worst (most lost) by value, lowercased, signed', () => {
    const data: SGCategory[] = [
      { label: 'Off the Tee', value: -1.8 },
      { label: 'Approach', value: 0.4 },
      { label: 'Around the Green', value: -0.1 },
      { label: 'Putting', value: 1.9 },
    ];
    expect(buildSGTakeaway(data)).toBe(
      'Best: putting +1.90 · Worst: off the tee −1.80',
    );
  });

  it('collapses to a single-category sentence when only one category is available', () => {
    expect(buildSGTakeaway([{ label: 'Putting', value: 1.9 }])).toBe(
      'Putting is +1.90 vs the baseline this round.',
    );
  });

  it('collapses to a flat-statement sentence when every category is exactly tied (never claims a fake Best/Worst split)', () => {
    const data: SGCategory[] = [
      { label: 'Off the Tee', value: 0 },
      { label: 'Approach', value: 0 },
    ];
    expect(buildSGTakeaway(data)).toBe('Off the Tee is 0.00 vs the baseline this round.');
  });
});

describe('RoundSGSummary — honest-empty state', () => {
  it('renders the awaiting gauge (never a fabricated 0) when total and every category are null', () => {
    render(
      <RoundSGSummary
        strokesGainedTotal={null}
        strokesGainedTee={null}
        strokesGainedApproach={null}
        strokesGainedAroundGreen={null}
        strokesGainedPutting={null}
      />,
    );
    expect(screen.getByText('Not computed for this round')).toBeInTheDocument();
    expect(screen.queryByText('0.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/vs the .* baseline/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Strokes Gained isn't computed for this round yet."),
    ).toBeInTheDocument();
  });
});

describe('RoundSGSummary — live state', () => {
  const liveProps = {
    strokesGainedTotal: 0.4,
    strokesGainedTee: -1.8,
    strokesGainedApproach: 0.4,
    strokesGainedAroundGreen: -0.1,
    strokesGainedPutting: 1.9,
  };

  it('renders the signed hero total, the PGA Tour baseline caption by default, and the takeaway line', () => {
    render(<RoundSGSummary {...liveProps} />);
    expect(screen.getByText('sg')).toBeInTheDocument();
    // Mocked NumberFlow renders `{prefix}{value}{suffix}` verbatim (no Intl
    // formatting) — "+0.4" is heroSign ('+') + Math.abs(0.4).
    expect(screen.getByText('+0.4')).toBeInTheDocument();
    expect(screen.getByText(/vs the PGA Tour baseline used for this round/)).toBeInTheDocument();
    expect(
      screen.getByText('Best: putting +1.90 · Worst: off the tee −1.80'),
    ).toBeInTheDocument();
  });

  it('swaps the baseline caption to LPGA Tour when isWomens is true', () => {
    render(<RoundSGSummary {...liveProps} isWomens />);
    expect(screen.getByText(/vs the LPGA Tour baseline used for this round/)).toBeInTheDocument();
  });

  it('colors a positive total with the gain token and a negative total with the loss token', () => {
    const { container: gainContainer } = render(
      <RoundSGSummary {...liveProps} strokesGainedTotal={2.1} />,
    );
    expect(gainContainer.querySelector('span.text-fw-success')).not.toBeNull();
    expect(gainContainer.querySelector('span.text-fw-warning')).toBeNull();

    const { container: lossContainer } = render(
      <RoundSGSummary {...liveProps} strokesGainedTotal={-2.1} />,
    );
    expect(lossContainer.querySelector('span.text-fw-warning')).not.toBeNull();
    expect(lossContainer.querySelector('span.text-fw-success')).toBeNull();
  });

  it('exposes the category breakdown via the tornado chart\'s accessible table fallback', () => {
    render(<RoundSGSummary {...liveProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Off the Tee')).toBeInTheDocument();
    expect(within(table).getByText('−1.80')).toBeInTheDocument();
    expect(within(table).getByText('Putting')).toBeInTheDocument();
    expect(within(table).getByText('+1.90')).toBeInTheDocument();
  });

  it('labels the whole panel as an accessible group for the Round Strokes Gained summary', () => {
    render(<RoundSGSummary {...liveProps} />);
    expect(screen.getByRole('group', { name: 'Round Strokes Gained summary' })).toBeInTheDocument();
  });
});
