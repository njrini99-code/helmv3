import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { CourseCard } from '../CourseCard';

afterEach(cleanup);

/** The course card's weekly line (stats and charts audit 2026-11-15, CH-11): weeks sit by their dates, and the key says which way is better. */
const draw = (weeks: Array<{ start: string; value: number; n: number }>) => {
  const data = { ...PREVIEW_TEAM_BOARD, course: { ...PREVIEW_TEAM_BOARD.course, history: { season: 2, rounds: 12, last4: 2, weeks, courses: [] } } } as typeof PREVIEW_TEAM_BOARD;
  const { container } = render(<CourseCard data={data} onRead={() => {}} onCourse={() => {}} />);
  return container;
};

describe('course card trend · weeks by date (CH-11)', () => {
  it('a month with no rounds draws a month of width, not one step', () => {
    const c = draw([
      { start: '2026-09-07', value: 2, n: 4 },
      { start: '2026-09-14', value: 3, n: 4 },
      { start: '2026-10-19', value: 1, n: 4 },
    ]);
    const xs = [...c.querySelectorAll('svg.trend circle.d')].map((d) => Number(d.getAttribute('cx')));
    expect(xs).toHaveLength(3);
    // One week against five.
    expect((xs[2]! - xs[1]!) / (xs[1]! - xs[0]!)).toBeCloseTo(5, 5);
  });

  it('says in the key, not only to a screen reader, that higher is better', () => {
    const c = draw([
      { start: '2026-09-07', value: 2, n: 4 },
      { start: '2026-09-14', value: 3, n: 4 },
    ]);
    expect(c.querySelector('.tkey')!.textContent).toContain('Higher is better');
  });
});
