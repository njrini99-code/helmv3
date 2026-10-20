// @vitest-environment jsdom
/**
 * The Fairways-hit readout rounds the unrounded rate it now receives
 * (withExactHeadlineRates). NumberFlow formats with Intl, whose default keeps
 * three decimals, so without its own format the readout would print "61.458".
 * The shared setup mock ignores `format`; this file swaps in one that applies
 * it the way NumberFlow does.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@number-flow/react', () => ({
  default: ({ value, format, className }: { value: number; format?: Intl.NumberFormatOptions; className?: string }) => (
    <span className={className}>{new Intl.NumberFormat('en-US', format).format(value)}</span>
  ),
}));

import { StageRouter } from '@/components/fairway/modules';
import { DrivingDrill } from '../DrivingDrill';
import { withExactHeadlineRates } from '../buildStatsViewModel';
import { calculateStatsFromShots } from '@/lib/utils/golf-stats-calculator-shots';

describe('DrivingDrill — Fairways hit readout', () => {
  it('rounds the exact rate once', () => {
    const stats = withExactHeadlineRates({
      ...calculateStatsFromShots([], [], []),
      fairwaysHit: 59,
      fairwayOpportunities: 96,
      fairwayPercentage: 61.5,
    });
    render(
      <StageRouter
        param="area"
        homeKey="driving"
        views={[{ key: 'driving', node: <DrivingDrill detailedStats={stats} sprayData={null} /> }]}
      />,
    );
    const values = Array.from(document.querySelectorAll('[data-slot="readout-value"]')).map((el) => el.textContent);
    expect(values).toContain('61.5%');
    expect(values.some((v) => v?.includes('61.458'))).toBe(false);
  });
});
