import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Studio } from '../studio';
import { MissPattern, SeasonCompare } from '../visual/blocks';

afterEach(() => cleanup());

/** FID-ASK-16: each chart keeps the comparison the answer leans on. */
describe('Ask chart blocks', () => {
  it('miss pattern draws a dot per direction with a distance, none for a direction with no shots', () => {
    const { container } = render(<MissPattern block={{ type: 'miss_pattern', total: 9, no_direction: 0, inside_15: 1, inside_25: 3, wedges: [{ direction: 'short', count: 6, avg_left_ft: 30 }, { direction: 'right', count: 3, avg_left_ft: 15 }, { direction: 'long', count: 0, avg_left_ft: null }] }} />);
    expect(container.querySelectorAll('circle.ch-aks-miss__dot')).toHaveLength(2);
    // The commonest direction is the one in the loss ink, and the four sides are named at the ring.
    expect(container.querySelectorAll('.ch-aks-miss__wedge.is-most')).toHaveLength(1);
    expect([...container.querySelectorAll('.ch-aks-miss__side text')].map((t) => t.textContent)).toEqual(['Long', 'Short', 'Left', 'Right']);
  });
  it('putt profile says the season rate in words under the figure, and nothing without one; no track, no tick', () => {
    const { container } = render(<Studio part={{ kind: 'distance_profile', data: { form: 'putts', putts: { type: 'putt_profile', buckets: [{ id: 'a', label: '3 to 6 ft', attempts: 20, made: 15, rate: 75, season_rate: 68 }, { id: 'b', label: '6 to 10 ft', attempts: 4, made: 1, rate: 25 }] } } }} size="compact" />);
    const rows = [...container.querySelectorAll('.ch-aks-dist__row')];
    expect(rows.map((r) => [r.querySelector('.ch-aks-dist__band')?.textContent, r.querySelector('.ch-aks-dist__val')?.textContent, r.querySelector('.ch-aks-rank__of')?.textContent?.trim()])).toEqual([
      ['3 to 6 ft', '75%', '20 putts'],
      ['6 to 10 ft', '25%', '4 putts'],
    ]);
    expect(rows.map((r) => r.querySelector('.ch-aks-dist__refs')?.textContent ?? null)).toEqual(['Season 68%', null]);
    expect(container.querySelector('.tick, [class*="track"]')).toBeNull();
  });
  it('season compare draws each season’s range on one shared scale, and no scale with one season', () => {
    const band = { mean: 1, lo: 0, hi: 2, n: 8 };
    const both = render(<SeasonCompare block={{ type: 'season_compare', metric: 'x', this_season: { ...band, mean: 0.4, lo: 0.2, hi: 0.6 }, last_season: band, method: 'm' }} />);
    const scales = [...both.container.querySelectorAll('svg.ch-aks-season__scale')];
    expect(scales).toHaveLength(2);
    // One scale for both: this season's narrower range sits inside last season's on the same x.
    const span = (svg: Element) => [Number(svg.querySelector('.ch-aks-season__range')!.getAttribute('x1')), Number(svg.querySelector('.ch-aks-season__range')!.getAttribute('x2'))] as const;
    const [now, last] = [span(scales[0]!), span(scales[1]!)];
    expect(now[0]).toBeGreaterThan(last[0]);
    expect(now[1]).toBeLessThan(last[1]);
    expect([...both.container.querySelectorAll('.ch-aks-season__val')].map((v) => v.textContent)).toEqual(['+0.4', '+1.0']);
    expect(both.container.querySelector('[class*="band"], [class*="track"]')).toBeNull();
    both.unmount();
    const one = render(<SeasonCompare block={{ type: 'season_compare', metric: 'x', this_season: band, last_season: null, method: 'm' }} />);
    expect(one.container.querySelector('svg')).toBeNull();
  });
});
