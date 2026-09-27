// @vitest-environment jsdom
/**
 * PuttingBenchmarkSheet (DASH-12): the trigger opens a sheet with one row per
 * benchmarked band, each carrying its sample size, and a header that names
 * the round count and date window.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PuttingBenchmarkSheet, puttingBenchmarkWindowLabel } from '../PuttingBenchmarkSheet';
import type { LeakBucket } from '@/app/golf/actions/stats-leak-maps-types';

function bucket(bucket_id: string, label: string, team_value: number | null, sample_n: number): LeakBucket {
  return { metric_id: null, bucket_id, label, team_value, pga_value: null, div1_value: null, sample_n };
}

const BUCKETS: LeakBucket[] = [
  bucket('0_3', '0-3 ft', 99, 60),
  bucket('3_5', '3-5 ft', 92, 25),
  bucket('5_10', '5-10 ft', 40, 30),
  bucket('10_15', '10-15 ft', 30, 4),
];

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
  it('opens a sheet with the benchmarked bands, sample sizes and window', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Compare with Tour and D1' }));
    const content = sheetContent() as HTMLElement;
    expect(content).toBeInTheDocument();

    expect(within(content).getByText('12 completed rounds · Mar 3, 2025 to Sep 20, 2026')).toBeInTheDocument();
    const rows = within(content).getAllByRole('listitem');
    // 0-3 ft has no standard, so five rows, not six.
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveAccessibleName('3-5 ft: 92% on 25 putts, Tour 91%, D1 88%. At or above Tour.');
    expect(rows[1]).toHaveAccessibleName('5-10 ft: 40% on 30 putts, Tour 62%, D1 50%. Below D1.');
    expect(rows[2]).toHaveAccessibleName('10-15 ft: 30% on 4 putts, Tour 36%, D1 25%. Under 10 putts.');
    expect(rows[4]).toHaveAccessibleName('25+ ft: no putts, Tour 6%, D1 4%. No putts yet.');
  });

  it('labels the LPGA reference for women', async () => {
    const user = userEvent.setup();
    render(<PuttingBenchmarkSheet buckets={BUCKETS} roundsIncluded={4} tour="lpga" window={null} />);
    await user.click(screen.getByRole('button', { name: 'Compare with LPGA and D1' }));
    const content = sheetContent() as HTMLElement;
    expect(within(content).getAllByRole('listitem')[0]).toHaveAccessibleName(
      '3-5 ft: 92% on 25 putts, LPGA 86%, D1 80%. At or above LPGA.',
    );
  });

  it('keeps the label neutral when the tour is unknown', async () => {
    const user = userEvent.setup();
    render(<PuttingBenchmarkSheet buckets={BUCKETS} roundsIncluded={4} tour={null} window={null} />);
    await user.click(screen.getByRole('button', { name: 'Compare with Tour and D1' }));
    const content = sheetContent() as HTMLElement;
    expect(within(content).getByText(/PGA Tour or LPGA by your team/)).toBeInTheDocument();
  });
});
