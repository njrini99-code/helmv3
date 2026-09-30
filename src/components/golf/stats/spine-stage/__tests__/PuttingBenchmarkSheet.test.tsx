// @vitest-environment jsdom
/**
 * PuttingBenchmarkSheet (DASH-12): the trigger opens a sheet with one row per
 * benchmarked band, each carrying its sample size, and a header that names
 * the round count and date window.
 *
 * Owner decision Q-93: the comparison is the Tour only (PGA Tour for men's
 * teams, LPGA Tour for women's teams). There is no college or division column,
 * verdict or footnote.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PuttingBenchmarkSheet, puttingBenchmarkWindowLabel } from '../PuttingBenchmarkSheet';
import type { LeakBucket } from '@/app/golf/actions/stats-leak-maps-types';

// The other slice removes `div1_value` from LeakBucket; fixtures carry none.
function bucket(bucket_id: string, label: string, team_value: number | null, sample_n: number): LeakBucket {
  return { metric_id: null, bucket_id, label, team_value, pga_value: null, sample_n } as LeakBucket;
}

const BUCKETS: LeakBucket[] = [
  bucket('0_3', '0-3 ft', 99, 60),
  bucket('3_5', '3-5 ft', 92, 25),
  bucket('5_10', '5-10 ft', 40, 30),
  bucket('10_15', '10-15 ft', 30, 4),
];

const NOT_DIVISION = /\bD[123]\b|division|college|NCAA|Shot Scope/i;
/** `PGA Tour` that is not the tail of `LPGA Tour`. */
const MENS_TOUR_LABEL = /(?<!L)PGA Tour/;

function sheetContent() {
  return document.body.querySelector('[data-vaul-drawer]');
}

describe('puttingBenchmarkWindowLabel', () => {
  it('names the rounds and the window', () => {
    expect(puttingBenchmarkWindowLabel(12, { from: '2025-03-03', to: '2026-09-20' })).toBe(
      '12 completed rounds · Mar 3, 2025 to Sep 20, 2026',
    );
  });

  it('collapses a single-day window and falls back to the count alone', () => {
    expect(puttingBenchmarkWindowLabel(1, { from: '2026-09-20', to: '2026-09-20' })).toBe(
      '1 completed round · Sep 20, 2026',
    );
    expect(puttingBenchmarkWindowLabel(3, null)).toBe('3 completed rounds');
  });
});

describe('PuttingBenchmarkSheet', () => {
  it("opens a Tour-only sheet for a men's team: bands, sample sizes, window", async () => {
    const user = userEvent.setup();
    render(
      <PuttingBenchmarkSheet
        buckets={BUCKETS}
        roundsIncluded={12}
        tour="pga"
        window={{ from: '2025-03-03', to: '2026-09-20' }}
      />,
    );
    expect(sheetContent()).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Compare with PGA Tour' }));
    const content = sheetContent() as HTMLElement;
    expect(content).toBeInTheDocument();

    expect(within(content).getByText('12 completed rounds · Mar 3, 2025 to Sep 20, 2026')).toBeInTheDocument();
    const rows = within(content).getAllByRole('listitem');
    // 0-3 ft has no standard, so five rows, not six.
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveAccessibleName('3-5 ft: 92% on 25 putts, PGA Tour 91%. At or above PGA Tour.');
    expect(rows[1]).toHaveAccessibleName('5-10 ft: 40% on 30 putts, PGA Tour 62%. 22 pts below PGA Tour.');
    expect(rows[2]).toHaveAccessibleName('10-15 ft: 30% on 4 putts, PGA Tour 36%. Under 10 putts.');
    expect(rows[4]).toHaveAccessibleName('25+ ft: no putts, PGA Tour 6%. No putts yet.');

    // One Tour column, no division column, no division verdicts.
    expect(content.textContent).toContain('ShotLink');
    expect(content.textContent).not.toMatch(NOT_DIVISION);
  });

  it("labels the LPGA Tour for a women's team and never says PGA Tour", async () => {
    const user = userEvent.setup();
    render(<PuttingBenchmarkSheet buckets={BUCKETS} roundsIncluded={4} tour="lpga" window={null} />);
    expect(screen.getByRole('button', { name: 'Compare with LPGA Tour' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Compare with LPGA Tour' }));
    const content = sheetContent() as HTMLElement;
    const rows = within(content).getAllByRole('listitem');
    expect(rows[0]).toHaveAccessibleName('3-5 ft: 92% on 25 putts, LPGA Tour 86%. At or above LPGA Tour.');
    expect(rows[1]).toHaveAccessibleName('5-10 ft: 40% on 30 putts, LPGA Tour 55%. 15 pts below LPGA Tour.');
    expect(content.textContent).toContain('LPGA ShotLink');
    expect(content.textContent).not.toMatch(MENS_TOUR_LABEL);
    expect(content.textContent).not.toMatch(NOT_DIVISION);
    expect(document.body.textContent).not.toMatch(MENS_TOUR_LABEL);
  });

  it('keeps the label neutral when the tour is unknown', async () => {
    const user = userEvent.setup();
    render(<PuttingBenchmarkSheet buckets={BUCKETS} roundsIncluded={4} tour={null} window={null} />);
    await user.click(screen.getByRole('button', { name: 'Compare with the Tour' }));
    const content = sheetContent() as HTMLElement;
    expect(within(content).getByText(/for your team’s tour/)).toBeInTheDocument();
    expect(content.textContent).not.toMatch(NOT_DIVISION);
    expect(content.textContent).not.toMatch(MENS_TOUR_LABEL);
  });
});
