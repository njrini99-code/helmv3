// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toCourseHistory, type ChCourseListRow } from '../data/course-page-shape';

/**
 * GAP-S-10: the course page's parts are sections. One that throws is named in place (CH-11291) and the rest of the page
 * stays; two that throw are said once under the hero (CH-1210), each keeping its title.
 */
const broken = vi.hoisted(() => ({ plays: false, rounds: false }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../screens/rounds/HowItPlays', async (importOriginal) => {
  const real = await importOriginal<typeof import('../screens/rounds/HowItPlays')>();
  return {
    ...real,
    HowItPlays: (p: Parameters<typeof real.HowItPlays>[0]) => {
      if (broken.plays) throw new Error('plays broke');
      return real.HowItPlays(p);
    },
  };
});
vi.mock('../screens/rounds/RoundsHere', async (importOriginal) => {
  const real = await importOriginal<typeof import('../screens/rounds/RoundsHere')>();
  return {
    ...real,
    RoundsHere: (p: Parameters<typeof real.RoundsHere>[0]) => {
      if (broken.rounds) throw new Error('rounds broke');
      return real.RoundsHere(p);
    },
  };
});

const { CoursePage } = await import('../screens/rounds/CoursePage');

const row = (id: string, total: number, date: string): ChCourseListRow => ({
  id, course_id: '0b3c6a1e-1111-4222-8333-944455556666', course_name: 'Finley GC', course_city: null, course_state: null, tee_id: null, tees_played: 'Blue', round_date: date, round_type: null,
  holes_played: 18, total_score: total, score_to_par: total - 72, front_nine: 36, back_nine: total - 36, total_putts: 31, total_gir: null, total_gir_possible: null, total_fairways_hit: null, total_fairways: null, notes: null,
});
const history = () => {
  const res = toCourseHistory({ rawKey: '0b3c6a1e-1111-4222-8333-944455556666', list: [row('a', 76, '2026-10-03'), row('b', 70, '2026-03-14')], holes: new Map(), library: { name: 'Finley', city: 'Chapel Hill', state: 'NC' }, coachNote: null, window: 'all', seasonStart: '2026-08-01', who: null });
  if (res.kind !== 'ok') throw new Error('fixture');
  return res.data;
};

beforeEach(() => {
  broken.plays = false;
  broken.rounds = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the course page’s sections (GAP-S-10)', () => {
  it('a part that throws is named in place, and the rest of the page stays', () => {
    broken.plays = true;
    const { container, getAllByRole } = render(<CoursePage history={history()} playerName={null} playerId={null} initialHole={null} />);
    expect(container.querySelector('[data-ch-code="CH-11291"]')!.textContent).toContain('How it plays couldn’t be shown');
    expect(getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Finley']);
    expect(container.textContent).toContain('Your rounds here');
  });

  it('two parts that throw are said once under the hero (CH-1210)', () => {
    broken.plays = true;
    broken.rounds = true;
    const { container } = render(<CoursePage history={history()} playerName={null} playerId={null} initialHole={null} />);
    expect(container.querySelectorAll('[data-ch-code="CH-1210"]')).toHaveLength(1);
  });
});
