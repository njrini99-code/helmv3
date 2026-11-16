import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { summarizePlayer, type ChRound } from '../../data/season';
import { CrhLine } from '../CrhLine';

afterEach(cleanup);

/** The roster profile's scoring line (stats and charts audit 2026-11-15, CH-11): rounds sit by their dates, not their index. */
const xs = (c: HTMLElement) => [...(c.querySelector('.ch-crh-line__ln')!.getAttribute('d') ?? '').matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]));

describe('CrhLine · rounds by date (CH-11)', () => {
  it('three rounds in a week then a month off draw the month wider than the week', () => {
    const { container } = render(<CrhLine data={[74, 72, 75, 73]} dates={['2026-09-01', '2026-09-03', '2026-09-05', '2026-10-05']} label="trend" />);
    const x = xs(container);
    expect(x).toHaveLength(4);
    expect(x[3]! - x[2]!).toBeGreaterThan(3 * (x[1]! - x[0]!));
  });

  it('with no dates, or a count that does not match, the rounds stay evenly spaced', () => {
    for (const dates of [undefined, ['2026-09-01']]) {
      const { container } = render(<CrhLine data={[74, 72, 75]} dates={dates} label="trend" />);
      const x = xs(container);
      expect(x[1]! - x[0]!).toBeCloseTo(x[2]! - x[1]!, 0);
      cleanup();
    }
  });

  it('the season summary carries each trend score’s date, oldest first', () => {
    const round = (id: string, date: string, score: number) => ({ id, round_date: date, total_score: score, score_to_par: score - 72, holes_played: 18 }) as unknown as ChRound;
    const s = summarizePlayer([round('b', '2026-09-10', 74), round('a', '2026-09-02', 72)]);
    expect(s.trend).toEqual([72, 74]);
    expect(s.trendDates).toEqual(['2026-09-02', '2026-09-10']);
  });
});
