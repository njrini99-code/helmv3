// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChLibraryRound } from '../../../data/rounds-shape';
import type { ChRoundReview } from '../../../data/round-review-shape';
import { phonePushedTop, isRebuilt } from '../../../shell/nav';
import { CourseLink } from '../CourseLink';
import { groupRounds } from '../RoundsLibrary';

afterEach(cleanup);

const lib = (id: string, course: string, courseId: string | null = null): ChLibraryRound => ({
  id, date: '2026-09-01', course, tee: null, teeColor: null, type: null, holes: 18, score: 72, toPar: 0, out: null, inn: null, fairways: null, greens: null, putts: null, countable: true, courseId, courseRaw: course,
});

describe('the course page entry points (P-7 E1 to E3)', () => {
  it('groups the library by course as the course page does, and links each course', () => {
    const groups = groupRounds([lib('a', 'Finley GC'), lib('b', 'finley gc'), lib('c', 'Marsh')], 'course', '');
    expect(groups.map((g) => [g.key, g.rounds.length, g.href])).toEqual([
      ['Finley GC', 2, '/golf/dashboard/rounds/course/n-finley%20gc'],
      ['Marsh', 1, '/golf/dashboard/rounds/course/n-marsh'],
    ]);
  });

  const review = (rounds: number, over: Partial<ChRoundReview> = {}) =>
    ({ id: 'r1', playerId: 'p1', playerName: 'Lena Park', history: { course: { key: 'n-finley%20gc', name: 'Finley', rounds }, records: [], usual: null, hereBefore: {}, ghosts: { average: null, best: null } }, ...over }) as ChRoundReview;

  it('links the review to the history, says a first round, and names the player for a coach', () => {
    const one = render(<CourseLink review={review(6)} coach={false} />);
    const a = one.getByRole('link');
    expect(a.textContent).toBe('Your history at Finley · 6 rounds');
    expect(a.getAttribute('href')).toBe('/golf/dashboard/rounds/course/n-finley%20gc');
    cleanup();
    expect(render(<CourseLink review={review(1)} coach={false} />).container.textContent).toBe('First round at Finley');
    cleanup();
    const c = render(<CourseLink review={review(6)} coach />).getByRole('link');
    expect(c.textContent).toBe('Lena’s history at Finley · 6 rounds');
    expect(c.getAttribute('href')).toBe('/golf/dashboard/rounds/course/n-finley%20gc?player=p1');
    cleanup();
    expect(render(<CourseLink review={review(6, { history: null })} coach={false} />).container.innerHTML).toBe('');
  });

  it('is a rebuilt page that pushes in with a Back to where it came from', () => {
    expect(isRebuilt('/golf/dashboard/rounds/course/n-finley%20gc', 'player')).toBe(true);
    expect(isRebuilt('/golf/dashboard/rounds/course/0b3c6a1e-1111-4222-8333-944455556666', 'coach')).toBe(true);
    expect(phonePushedTop('/golf/dashboard/rounds/course/n-marsh', 'player')).toEqual({ back: 'Rounds', title: 'Course' });
    expect(phonePushedTop('/golf/dashboard/rounds/course/n-marsh', 'coach')).toEqual({ back: 'Round', title: 'Course' });
  });
});
