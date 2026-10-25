// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { coachDraft, toCourseHistory, type ChCourseListRow } from '../../../data/course-page-shape';
import { CoursePage } from '../CoursePage';

afterEach(cleanup);

describe('the coach’s view of a course (P-7 4.4, 6.4)', () => {
  it('drafts the message from the first figure that passed its floor, else a plain ask', () => {
    const base = { name: 'Finley', compared: { needs: 'here' as const }, stretch: { worst: null, best: null } };
    expect(coachDraft({ ...base, stretch: { worst: { from: 13, avg: 2.14, se: 0.5 }, best: null } })).toBe(
      'I was looking at your rounds at Finley. Holes 13 to 15 have cost you about 2.1 shots a round there. Want to go through them at practice?',
    );
    expect(coachDraft({ ...base, compared: { diff: 1.6, se: 1, words: 'harder' } })).toBe(
      'I was looking at your rounds at Finley. It’s played about 1.6 shots harder for you than your other courses. Want to talk through a plan for it?',
    );
    expect(coachDraft({ ...base, compared: { diff: 0.2, se: 1, words: 'same' } })).toBe('I was looking at your rounds at Finley. Want to go through them together?');
  });

  it('gives the coach Message Lena in place of Start a round here, prefilled and never sent', () => {
    const row: ChCourseListRow = {
      id: 'a', course_id: '0b3c6a1e-1111-4222-8333-944455556666', course_name: 'Finley', course_city: null, course_state: null, tee_id: null, tees_played: null, round_date: '2026-10-03', round_type: null,
      holes_played: 18, total_score: 74, score_to_par: 2, front_nine: 37, back_nine: 37, total_putts: null, total_gir: null, total_gir_possible: null, total_fairways_hit: null, total_fairways: null, notes: null,
    };
    const res = toCourseHistory({ rawKey: row.course_id!, list: [row], holes: new Map(), library: null, coachNote: null, window: 'all', seasonStart: '2026-08-01', who: 'Lena' });
    if (res.kind !== 'ok') throw new Error('fixture');
    const { getByRole, queryByRole } = render(<CoursePage history={res.data} playerName="Lena" playerId="p1" initialHole={null} />);
    const msg = getByRole('link', { name: 'Message Lena' });
    expect(msg.getAttribute('href')).toMatch(/^\/golf\/dashboard\/messages\?prefill=/);
    expect(queryByRole('link', { name: 'Start a round here' })).toBeNull();
  });
});
