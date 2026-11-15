import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChRound } from '../../../data/season';
import { perRoundSeries } from '../../../data/stats-figures';
import { RoundLine } from '../detail';

/**
 * Stats detail's round lines (stats and charts audit 2026-11-15): the dashed "avg" is the window's own figure, a pooled rate, not a mean
 * of each round's percentage (CH-12), and rounds sit by their dates (CH-11).
 */
afterEach(cleanup);

const round = (id: string, date: string, holes: number, gir: number, girOf: number): ChRound =>
  ({
    id,
    round_date: date,
    holes_played: holes,
    total_score: holes === 9 ? 38 : 74,
    total_gir: gir,
    total_gir_possible: girOf,
    total_fairways_hit: null,
    total_fairways: null,
    total_putts: null,
    hole_scores: Array.from({ length: holes }, () => 4),
    is_complete: true,
  }) as unknown as ChRound;

describe('RoundLine · the dashed average is the headline’s (CH-12)', () => {
  it('greens 2 of 9 and 12 of 18 read “avg 52%” (pooled), not 44% (mean of percentages)', () => {
    const series = perRoundSeries([round('a', '2026-10-01', 9, 2, 9), round('b', '2026-10-08', 18, 12, 18)]);
    expect(series.gir.map((p) => p.value)).toEqual([22.2, 66.7]);
    expect(series.avg!.gir).toBeCloseTo(51.9, 1);
    const { container } = render(<RoundLine points={series.gir} unit="%" digits={0} label="Greens in regulation by round" avg={series.avg!.gir} />);
    const avg = [...container.querySelectorAll('text')].find((t) => t.textContent!.startsWith('avg'));
    expect(avg!.textContent).toBe('avg 52%');
  });

  it('rounds on the 1st, 2nd and 30th sit by their dates', () => {
    const { container } = render(
      <RoundLine
        points={[
          { label: 'Oct 1', value: 70, at: '2026-10-01' },
          { label: 'Oct 2', value: 72, at: '2026-10-02' },
          { label: 'Oct 30', value: 71, at: '2026-10-30' },
        ]}
        label="Score by round"
        lowerIsBetter
      />,
    );
    const xs = [...container.querySelectorAll('circle')].map((c) => Number(c.getAttribute('cx')));
    expect(xs[1]! - xs[0]!).toBeLessThan(0.5 * (xs[2]! - xs[1]!));
  });
});
