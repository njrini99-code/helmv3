import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The course page and the review's record chips read a player's other rounds. Both read the stored `total_score`, which drifts by one
 * on about 5% of rounds (round-total.ts); the library row for the same round shows front plus back. The two loaders now normalise the
 * list at the read, so a headline figure and the chips can never disagree with the row beside them (audit 2026-10-31, shell finding 7).
 */

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadCourseHistory } from '../data/course-history';
import { loadReviewHistory } from '../data/round-history';

afterEach(() => {
  tables.current = {};
});

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  course_id: null,
  course_name: 'Finley GC',
  course_city: null,
  course_state: null,
  tee_id: null,
  tees_played: 'Blue',
  round_date: '2026-09-01',
  round_type: 'practice',
  holes_played: 18,
  total_score: 72,
  score_to_par: 0,
  front_nine: 36,
  back_nine: 36,
  total_putts: 30,
  total_gir: 9,
  total_gir_possible: 18,
  total_fairways_hit: 8,
  total_fairways: 14,
  notes: null,
  ...over,
});

describe('the course page reads canonical totals', () => {
  it('a stored total that drifted by one shows as front plus back, with the to-par shifted with it', async () => {
    // Stored 73 and +1, but the nines say 72 (the library row says 72): the headline must say 72 and even par.
    tables.current = {
      golf_rounds: { data: [row('a', { total_score: 73, score_to_par: 1 })] },
      golf_holes: { data: [] },
    };
    const res = await loadCourseHistory('n-finley%20gc', { role: 'player', playerId: 'p1' }, { window: 'all' });
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.data.hero.figure).toMatchObject({ kind: 'last', value: 72 });
    const best = res.data.figures.find((f) => f.label === 'Only round' || f.label === 'Best');
    expect(best).toMatchObject({ value: '72', toPar: 0 });
    expect(res.data.rounds[0]).toMatchObject({ score: 72 });
  });
});

describe('the review’s record chips compare canonical totals', () => {
  it('another round whose stored total drifted high is not beaten by a round that is only second lowest', async () => {
    // This round is 73. A's stored total says 74, but its nines say 72, so it is lower: this is not a career low.
    tables.current = {
      golf_rounds: {
        data: [
          row('a', { total_score: 74, round_date: '2026-09-02' }),
          row('b', { total_score: 80, front_nine: 40, back_nine: 40, round_date: '2026-09-03' }),
        ],
      },
    };
    const round = { id: 'r', course_id: null, course_name: 'Finley GC', tees_played: 'Blue', tee_id: null, round_date: '2026-09-10', holes_played: 18, total_score: 73, front_nine: 36, back_nine: 37, total_putts: 30 };
    const history = await loadReviewHistory({ playerId: 'p1', coachTeamId: null, zoneTeamId: null, round });
    expect(history).not.toBeNull();
    expect(history!.records.map((m) => m.id)).not.toContain('career-low');
  });

  it('control: with the other rounds really higher, the same round is a career low', async () => {
    tables.current = {
      golf_rounds: {
        data: [
          row('a', { total_score: 76, front_nine: 38, back_nine: 38, round_date: '2026-09-02' }),
          row('b', { total_score: 80, front_nine: 40, back_nine: 40, round_date: '2026-09-03' }),
        ],
      },
    };
    const round = { id: 'r', course_id: null, course_name: 'Finley GC', tees_played: 'Blue', tee_id: null, round_date: '2026-09-10', holes_played: 18, total_score: 73, front_nine: 36, back_nine: 37, total_putts: 30 };
    const history = await loadReviewHistory({ playerId: 'p1', coachTeamId: null, zoneTeamId: null, round });
    expect(history!.records.map((m) => m.id)).toContain('career-low');
  });
});
