// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { toCourseHistory, type ChCourseListRow } from '../../../data/course-page-shape';
import { CoursePage } from '../CoursePage';

afterEach(cleanup);

const row = (id: string, total: number, date: string, over: Partial<ChCourseListRow> = {}): ChCourseListRow => ({
  id, course_id: '0b3c6a1e-1111-4222-8333-944455556666', course_name: 'Finley GC', course_city: null, course_state: null, tee_id: null, tees_played: 'Blue', round_date: date, round_type: null,
  holes_played: 18, total_score: total, score_to_par: total - 72, front_nine: 36, back_nine: total - 36, total_putts: 31, total_gir: null, total_gir_possible: null, total_fairways_hit: null, total_fairways: null, notes: null, ...over,
});

const history = () => {
  const res = toCourseHistory({
    rawKey: '0b3c6a1e-1111-4222-8333-944455556666',
    list: [row('a', 76, '2026-10-03', { notes: 'Commit on the 7 tee' }), row('b', 70, '2026-03-14')],
    holes: new Map(),
    library: { name: 'Finley', city: 'Chapel Hill', state: 'NC' },
    coachNote: null,
    window: 'all',
    seasonStart: '2026-08-01',
    who: null,
  });
  if (res.kind !== 'ok') throw new Error('fixture');
  return res.data;
};

describe('CoursePage (P-7 4.2)', () => {
  it('has the one h1, the figures linking to their rounds and the start button for the player', () => {
    const { getAllByRole, getByRole, container } = render(<CoursePage history={history()} playerName={null} playerId={null} initialHole={null} />);
    expect(getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Finley']);
    expect(container.querySelector('.ch-ch-hero__k')!.textContent).toBe('Your history · 2 rounds');
    expect(getByRole('link', { name: 'Best: 70, Mar 14 · −2. Open the round' }).getAttribute('href')).toBe('/golf/dashboard/rounds/b');
    expect(getByRole('link', { name: 'Start a round here' }).getAttribute('href')).toBe('/golf/dashboard/rounds/new?course=0b3c6a1e-1111-4222-8333-944455556666');
    expect(getByRole('heading', { name: 'Last time here' })).toBeTruthy();
    expect(container.textContent).toContain('Commit on the 7 tee');
  });

  it('a coach sees the player named and no start button', () => {
    const { queryByRole, getByRole } = render(<CoursePage history={history()} playerName="Lena" playerId="p1" initialHole={null} />);
    expect(queryByRole('link', { name: 'Start a round here' })).toBeNull();
    expect(getByRole('heading', { name: 'Lena’s rounds here' })).toBeTruthy();
  });
});
