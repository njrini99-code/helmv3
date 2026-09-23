// @vitest-environment jsdom
/**
 * PuttHeatmap component-render test (Package 11).
 *
 * Only `distance_feet` (radius) and `made`/`miss_direction` are measured
 * per-putt data. A dot's angular position around the hole is illustrative
 * for a make or an unlogged miss direction — never a measurement — so the
 * rendered surface must carry an on-screen disclosure, the same honesty
 * contract `HoleShotPath`'s footer already applies to its own stylized axis.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PuttHeatmap } from './index';
import type { PuttRecord } from './types';

const putts: PuttRecord[] = [
  { distance_feet: 3, made: true },
  { distance_feet: 5, made: false, miss_direction: 'left' },
  { distance_feet: 8, made: true },
  { distance_feet: 12, made: false, miss_direction: 'right' },
  { distance_feet: 20, made: false, miss_direction: null },
];

describe('PuttHeatmap — position-is-illustrative disclosure', () => {
  it('renders the disclosure caption once there is enough data to plot', () => {
    render(<PuttHeatmap putts={putts} />);
    expect(
      screen.getByText(/Position around the hole is illustrative except where a miss direction was logged\./i),
    ).toBeInTheDocument();
  });

  it('does not render the disclosure in the insufficient-data state (nothing is plotted)', () => {
    render(<PuttHeatmap putts={putts.slice(0, 2)} />);
    expect(
      screen.queryByText(/Position around the hole is illustrative/i),
    ).toBeNull();
    expect(screen.getByText('Not enough putts yet')).toBeInTheDocument();
  });
});
