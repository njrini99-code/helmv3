import { describe, expect, it } from 'vitest';
import { toCourseHistory, type CourseRoundInput } from '../course-shape';

const round = (player_id: string, round_date: string, score_to_par: number | null, course: { id?: string | null; name?: string | null } = {}, over: Partial<CourseRoundInput> = {}): CourseRoundInput => ({ player_id, round_date, score_to_par, course_id: course.id ?? null, course_name: course.name ?? null, holes_played: 18, total_score: 75, front_nine: 38, back_nine: 37, ...over });

/** Six weeks back from 2026-11-02, a round each Monday. */
const SIX_WEEKS = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'];
const TODAY = '2026-11-02';

/** Coachhelm-team AC-COURSE-10 to 12: round weighted, the last 28 days, grouped by course id then name. */
describe('toCourseHistory', () => {
  it('season is round weighted, not a mean of weeks', () => {
    const r = toCourseHistory([round('a', SIX_WEEKS[0]!, 2), round('a', SIX_WEEKS[0]!, 2), round('a', SIX_WEEKS[0]!, 2), round('b', SIX_WEEKS[1]!, 6)], ['a', 'b'], TODAY);
    expect(r.season).toBe(3);
  });

  it('a week’s point is the mean of that week’s rounds', () => {
    const r = toCourseHistory([round('a', '2026-10-05', 2), round('b', '2026-10-07', 4), round('a', '2026-10-13', 7)], ['a', 'b'], TODAY);
    expect(r.weeks.map((w) => [w.value, w.n])).toEqual([
      [3, 2],
      [7, 1],
    ]);
  });

  it('last 4 weeks is null under six weeks of play', () => {
    const r = toCourseHistory(SIX_WEEKS.slice(0, 5).map((d) => round('a', d, 3)), ['a'], TODAY);
    expect(r.last4).toBeNull();
  });

  it('with six weeks, last 4 weeks is the last 28 days', () => {
    const r = toCourseHistory(SIX_WEEKS.map((d, i) => round('a', d, i < 2 ? 10 : 2)), ['a'], TODAY);
    expect(r.last4).toBe(2);
    expect(r.season).toBeCloseTo((10 * 2 + 2 * 4) / 6, 5);
  });

  it('courses group by id, then by name ignoring case', () => {
    const r = toCourseHistory(
      [round('a', '2026-10-05', 2, { id: 'oak', name: 'Oak Hollow' }), round('a', '2026-10-06', 4, { id: 'oak', name: 'Oak Hollow GC' }), round('a', '2026-10-07', 8, { name: 'Hilltop' }), round('a', '2026-10-08', 6, { name: ' hilltop ' })],
      ['a'],
      TODAY,
    );
    expect(r.courses.map((c) => [c.rounds, c.value]).sort()).toEqual([
      [2, 3],
      [2, 7],
    ]);
  });

  it('a round with no course still counts toward the season, and draws no course row', () => {
    const r = toCourseHistory([round('a', '2026-10-05', 2)], ['a'], TODAY);
    expect(r.season).toBe(2);
    expect(r.courses).toEqual([]);
  });

  it('only the roster, and only rounds with a score', () => {
    const r = toCourseHistory([round('a', '2026-10-05', 2), round('gone', '2026-10-05', 40), round('a', '2026-10-06', null)], ['a'], TODAY);
    expect(r.season).toBe(2);
    expect(r.weeks[0]!.n).toBe(1);
  });

  it('a test round does not count', () => {
    const r = toCourseHistory([round('a', '2026-10-05', 2), round('a', '2026-10-06', 30, {}, { is_test: true })], ['a'], TODAY);
    expect(r.season).toBe(2);
  });

  it('nothing at all is empty, not a thrown error', () => {
    const r = toCourseHistory([], ['a'], TODAY);
    expect(r.season).toBeNull();
    expect(r.last4).toBeNull();
    expect(r.weeks).toEqual([]);
    expect(r.courses).toEqual([]);
  });
});
