// @vitest-environment jsdom
/**
 * ============================================================================
 * RoundStatReport — render contract
 * ----------------------------------------------------------------------------
 * `buildRoundStatReport.test.ts` proves the MODEL is honest. This proves the
 * screen is, because the requirement the owner set is a visual one: a tile
 * with no sample must be legibly different from a tile with a real number,
 * and the sample size must sit next to the figure. A model that carries a
 * correct `n` and a view that never paints it satisfies neither.
 * ========================================================================== */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { calculateStatsFromShots, type GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { RoundStatReport } from '../RoundStatReport';

function statsWithSignal(): GolfStats {
  const base = calculateStatsFromShots([], [], []);
  return {
    ...base,
    roundsPlayed: 1,
    roundsPlayed18: 1,
    holesPlayed: 18,
    scoringAverage: 74,
    avgScoreToPar: 2,
    totalBirdies: 2,
    totalPars: 12,
    fairwaysHit: 9,
    fairwayOpportunities: 14,
    fairwayPercentage: 64.29,
    girTotal: 11,
    girOpportunities: 18,
    girPercentage: 61.11,
    totalPutts: 38,
    puttsPerHole: 2.11,
    puttMakeCount0_3: 20,
    puttMakePct0_3: 85,
    // The short game has to have SOME signal for its grid to render at all —
    // a category with nothing measurable collapses to one line by design. The
    // real Pebble Beach round scrambled seven times and never found a bunker,
    // which is exactly the shape that puts an unsampled tile beside sampled
    // siblings.
    scrambleAttempts: 7,
    scramblesMade: 3,
    scramblingPercentage: 42.86,
    sandSaveAttempts: 0,
    sandSavePercentage: null,
  };
}

function tileFor(label: string): HTMLElement {
  const tiles = document.querySelectorAll<HTMLElement>('[data-slot="round-report-metric"]');
  for (const tile of tiles) {
    // The label renders inside the Readout; match the tile that contains it.
    if (tile.textContent?.includes(label)) return tile;
  }
  throw new Error(`no metric tile containing "${label}"`);
}

describe('RoundStatReport', () => {
  it('renders nothing at all when there are no stats to render', () => {
    const { container } = render(<RoundStatReport stats={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says a scorecard-only round has no shot detail instead of showing zeros', () => {
    render(<RoundStatReport stats={calculateStatsFromShots([], [], [])} />);
    expect(screen.getByText(/no shot detail for this round/i)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="round-report-metric"]')).toHaveLength(0);
  });

  it('lays the categories out as numbered sections in playing order', () => {
    render(<RoundStatReport stats={statsWithSignal()} />);
    const headings = Array.from(
      document.querySelectorAll<HTMLElement>('[data-slot="round-report-section"] h3'),
    ).map((h) => h.textContent?.replace(/^\d+/, '').trim());
    expect(headings).toEqual(['Scoring', 'Off the tee', 'Approach', 'Short game', 'Putting']);
  });

  it('prints the category denominator in the section header', () => {
    render(<RoundStatReport stats={statsWithSignal()} />);
    const putting = document.querySelector<HTMLElement>('[data-section="putting"]');
    expect(putting).not.toBeNull();
    expect(within(putting!).getByText('38 putts · 18 holes')).toBeInTheDocument();
  });

  it('paints a sampled tile and an unsampled tile differently', () => {
    render(<RoundStatReport stats={statsWithSignal()} />);

    const sampled = tileFor('Make 0-3ft');
    const unsampled = tileFor('Sand saves');

    // The invariant, stated as directly as a test can state it: these two must
    // not be mistakable for one another.
    expect(sampled.dataset.state).toBe('live');
    expect(unsampled.dataset.state).toBe('awaiting');
    expect(sampled.className).not.toBe(unsampled.className);
    expect(unsampled.className).toContain('border-dashed');
    expect(sampled.className).not.toContain('border-dashed');
  });

  it('puts the sample size next to the figure it belongs to', () => {
    render(<RoundStatReport stats={statsWithSignal()} />);
    expect(within(tileFor('Make 0-3ft')).getByText('n=20 putts')).toBeInTheDocument();
    expect(within(tileFor('Fairways hit')).getByText('9 of 14 fairways')).toBeInTheDocument();
  });

  it('names the count on an empty tile rather than showing a zero', () => {
    render(<RoundStatReport stats={statsWithSignal()} />);
    const sand = tileFor('Sand saves');
    expect(within(sand).getByText(/no bunker shots/i)).toBeInTheDocument();
    expect(sand.textContent).not.toMatch(/\b0%/);
  });

  it('outranks the section headers with the document title', () => {
    render(<RoundStatReport stats={statsWithSignal()} title="Round stats" subtitle="Pebble Beach" />);
    const h2 = screen.getByRole('heading', { level: 2, name: 'Round stats' });
    // text-h4 does not exist in the Fairway scale; a header written that way
    // renders at body size and the hierarchy silently disappears.
    expect(h2.className).toContain('text-h2');
    for (const h3 of document.querySelectorAll('[data-slot="round-report-section"] h3 span:last-child')) {
      expect(h3.className).toContain('text-h3');
    }
  });

  it('renders the break matrix with a per-cell n when breaks were recorded', () => {
    const base = statsWithSignal();
    render(
      <RoundStatReport
        stats={{
          ...base,
          puttingByBreak: {
            ...base.puttingByBreak,
            straight: {
              ...base.puttingByBreak.straight,
              totalPutts: 5,
              overallMakePct: 60,
              count0_3: 5,
              makePct0_3: 60,
            },
          },
        }}
      />,
    );
    const matrix = document.querySelector<HTMLElement>('[data-slot="round-report-break-matrix"]');
    expect(matrix).not.toBeNull();
    // Scoped to the table: 60% deliberately appears twice — once in the cell,
    // once in the per-break summary row beneath it.
    const table = within(matrix!).getByRole('table');
    expect(within(table).getByText('60%')).toBeInTheDocument();
    expect(within(table).getByText('n=5')).toBeInTheDocument();
    expect(within(matrix!).getByText('(n=5)')).toBeInTheDocument();
  });

  it('omits the break matrix entirely when no putt carried a break', () => {
    render(<RoundStatReport stats={statsWithSignal()} />);
    expect(document.querySelector('[data-slot="round-report-break-matrix"]')).toBeNull();
  });
});
