// @vitest-environment jsdom
/**
 * ============================================================================
 * ReviewBreakdown — render contract (round-review.v2.md R6)
 * ----------------------------------------------------------------------------
 * Mirrors `RoundStatReport.test.tsx`'s honest-empty-state pattern: every one
 * of the six numbered rows renders nothing but its own empty line when its
 * source data is absent, and the whole component still renders its bare-band
 * container (the caller, `FilmstripReview`'s `showBreakdown`, is what omits
 * the section entirely — that composition is out of scope for this file).
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReviewBreakdown, hasDrivingDotData, hasApproachHeatData } from '../ReviewBreakdown';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { calculateStatsFromShots } from '@/lib/utils/golf-stats-calculator-shots';

// `useRoundPutts` fetches independently of everything else this component
// renders — a chainable no-op mock resolves it to an empty array rather than
// hanging the test on a real network call.
vi.mock('@/lib/supabase/client', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    then: (resolve: (v: { data: never[]; error: null }) => void) => resolve({ data: [], error: null }),
  };
  return { createClient: () => ({ from: () => chain }) };
});

function emptyStats(): GolfStats {
  return calculateStatsFromShots([], [], []);
}

const NO_ROWS = {
  roundId: 'r1',
  frontBack: [
    { label: 'Front 9', score: 0, putts: 0, gir: '0/0', fairways: '—' },
    { label: 'Back 9', score: 0, putts: 0, gir: '0/0', fairways: '—' },
  ],
  frontBackDiverging: [],
  drivingDots: [],
  roundStats: null,
  puttingRamp: { cols: ['0-5 ft', '5-15 ft'], cells: [{ value: '—', band: 0 as const }, { value: '—', band: 0 as const }] },
  momentum: [],
  drivingPenaltyLines: [],
  shortGameRows: [],
};

describe('ReviewBreakdown', () => {
  it('renders all six numbered rows, in playing order', () => {
    render(<ReviewBreakdown {...NO_ROWS} />);
    const headings = Array.from(document.querySelectorAll('[data-slot="review-breakdown-row"] h3')).map((h) =>
      h.textContent?.replace(/^\d+/, '').trim(),
    );
    expect(headings).toEqual(['Off the tee', 'Approach', 'Front / back', 'Short game', 'Putting', 'Momentum']);
  });

  it('says each row has no data instead of rendering an empty shell, when every source is absent', () => {
    render(<ReviewBreakdown {...NO_ROWS} />);
    expect(screen.getByText('No fairway data for this round.')).toBeInTheDocument();
    expect(screen.getByText('No approach data for this round.')).toBeInTheDocument();
    expect(screen.getByText('No front/back split for this round.')).toBeInTheDocument();
    expect(screen.getByText('No short-game attempts for this round.')).toBeInTheDocument();
    expect(screen.getByText('No putting data for this round.')).toBeInTheDocument();
    expect(screen.getByText('No momentum data for this round.')).toBeInTheDocument();
    // None of the honest-empty rows render an instrument.
    expect(document.querySelector('[data-slot="driving-dot-strip"]')).toBeNull();
    expect(document.querySelector('[data-slot="ramp-matrix"]')).toBeNull();
    expect(document.querySelector('[data-slot="diverging-bars"]')).toBeNull();
    expect(document.querySelector('[data-slot="ticker-strip"]')).toBeNull();
  });

  it('renders the Off the tee row once at least one hole has a real fairway signal', () => {
    render(
      <ReviewBreakdown
        {...NO_ROWS}
        drivingDots={[
          { n: 1, fairwayHit: true, missSide: null },
          { n: 2, fairwayHit: null, missSide: null },
        ]}
      />,
    );
    expect(document.querySelector('[data-slot="driving-dot-strip"]')).not.toBeNull();
    expect(screen.queryByText('No fairway data for this round.')).toBeNull();
  });

  it('does NOT treat an all-par-3 (all-null) driving strip as real signal', () => {
    expect(
      hasDrivingDotData([
        { n: 1, fairwayHit: null, missSide: null },
        { n: 2, fairwayHit: null, missSide: null },
      ]),
    ).toBe(false);
  });

  it('renders the Approach row once roundStats carries at least one real percentage', () => {
    const stats: GolfStats = { ...emptyStats(), girPctPar4: 50 };
    render(<ReviewBreakdown {...NO_ROWS} roundStats={stats} />);
    expect(document.querySelectorAll('[data-slot="ramp-matrix"]')).toHaveLength(2);
    expect(screen.queryByText('No approach data for this round.')).toBeNull();
  });

  it('treats a roundStats object with no relevant percentages as absent', () => {
    expect(hasApproachHeatData(emptyStats())).toBe(false);
    expect(hasApproachHeatData(null)).toBe(false);
  });

  it('renders the Front/back row and its per-half caption line when there is a real split', () => {
    render(
      <ReviewBreakdown
        {...NO_ROWS}
        frontBack={[
          { label: 'Front 9', score: 39, putts: 15, gir: '2/4', fairways: '1/4' },
          { label: 'Back 9', score: 40, putts: 16, gir: '3/4', fairways: '2/4' },
        ]}
        frontBackDiverging={[
          { label: 'Front 9', delta: 3, display: '+3' },
          { label: 'Back 9', delta: 4, display: '+4' },
        ]}
      />,
    );
    expect(document.querySelector('[data-slot="diverging-bars"]')).not.toBeNull();
    expect(
      screen.getByText('Front 9: 39 (+3) · 15 putts · 2/4 GIR · 1/4 fairways'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Back 9: 40 (+4) · 16 putts · 3/4 GIR · 2/4 fairways'),
    ).toBeInTheDocument();
  });

  it('renders the Momentum row from an existing TickerStrip series', () => {
    render(<ReviewBreakdown {...NO_ROWS} momentum={[{ label: '1', heightPct: 50, emphasis: false }]} />);
    expect(document.querySelector('[data-slot="ticker-strip"]')).not.toBeNull();
  });

  it('renders the Short game row from existing RailBars rows', () => {
    render(<ReviewBreakdown {...NO_ROWS} shortGameRows={[{ label: 'Scramble', pct: 60, value: '3/5' }]} />);
    expect(screen.getByText('Scramble')).toBeInTheDocument();
  });
});
