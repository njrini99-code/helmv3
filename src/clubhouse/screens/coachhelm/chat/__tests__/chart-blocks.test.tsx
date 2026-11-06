import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MissPattern, PuttProfile, SeasonCompare } from '../visual/blocks';

afterEach(() => cleanup());

/** FID-ASK-16: each chart keeps the comparison the answer leans on. */
describe('Ask chart blocks', () => {
  it('miss pattern draws a dot per direction with a distance, none for a direction with no shots', () => {
    const { container } = render(<MissPattern block={{ type: 'miss_pattern', total: 9, no_direction: 0, inside_15: 1, inside_25: 3, wedges: [{ direction: 'short', count: 6, avg_left_ft: 30 }, { direction: 'right', count: 3, avg_left_ft: 15 }, { direction: 'long', count: 0, avg_left_ft: null }] }} />);
    expect(container.querySelectorAll('circle.dot')).toHaveLength(2);
  });
  it('putt profile puts a tick at the season rate, and none without one', () => {
    const { container } = render(<PuttProfile block={{ type: 'putt_profile', buckets: [{ id: 'a', label: '3 to 6 ft', attempts: 20, made: 15, rate: 75, season_rate: 68 }, { id: 'b', label: '6 to 10 ft', attempts: 4, made: 1, rate: 25 }] }} />);
    const ticks = container.querySelectorAll<HTMLElement>('.tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.style.left).toBe('68%');
  });
  it('season compare draws this season against last season’s band, and no band with one season', () => {
    const band = { mean: 1, lo: 0, hi: 2, n: 8 };
    const both = render(<SeasonCompare block={{ type: 'season_compare', metric: 'x', this_season: { ...band, mean: 0.4, lo: 0.2, hi: 0.6 }, last_season: band, method: 'm' }} />);
    expect(both.container.querySelector('svg .band')).toBeTruthy();
    expect(both.container.querySelector('svg .now')).toBeTruthy();
    both.unmount();
    const one = render(<SeasonCompare block={{ type: 'season_compare', metric: 'x', this_season: band, last_season: null, method: 'm' }} />);
    expect(one.container.querySelector('svg')).toBeNull();
  });
});
