// @vitest-environment jsdom
/**
 * Audit row 42: the miss-side readout states its denominator — the misses
 * that have a recorded direction — instead of a bare "N% of misses".
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PuttHeatmap } from './index';
import type { PuttRecord } from './types';

const putts: PuttRecord[] = [
  { distance_feet: 3, made: true },
  { distance_feet: 5, made: false, miss_direction: 'left' },
  { distance_feet: 6, made: false, miss_direction: 'left' },
  { distance_feet: 8, made: true },
  { distance_feet: 12, made: false, miss_direction: 'right' },
  { distance_feet: 20, made: false, miss_direction: null },
];

describe('PuttHeatmap — miss-side readout', () => {
  it('states the share over misses with a direction and names that n', () => {
    render(<PuttHeatmap putts={putts} />);
    // 2 of the 3 directed misses went left (the undirected miss is excluded).
    expect(screen.getByText(/67% of 3 misses with a direction/)).toBeInTheDocument();
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/67% of 3 misses with a direction/);
  });
});
