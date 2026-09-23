import { describe, expect, it, vi } from 'vitest';
import type { DiagnosisHole } from '@/lib/coachhelm/v3/engine/hole-diagnosis';

/**
 * Addendum §6.3 — the course-hole identity defect. `CourseMgmtGenerator`
 * ranked "worst holes" in a Map keyed by `hole_number` across every course the
 * player had played, so hole 7 at course A and hole 7 at course B merged into
 * one "hole 7". The fixture below is the plan's two-course same-hole-number
 * case plus a round logged without a course_id.
 */

const holes: DiagnosisHole[] = [];
function addPlays(course_id: string | null, course_name: string | null, hole_number: number, overs: number[]) {
  overs.forEach((over, i) => {
    holes.push({
      round_id: `${course_id ?? 'nocourse'}-r${i}`,
      course_id,
      course_name,
      hole_number,
      par: 4,
      score: 4 + over,
      putts: 2,
      penalty_strokes: 0,
      gir: over <= 0,
      up_and_down: false,
    });
  });
}
// Course A hole 7: +1 every play (3 plays) — the real worst hole.
addPlays('course-A', 'Pine Valley', 7, [1, 1, 1]);
// Course B hole 7: par every play (3 plays). Merged by hole number the two
// would read as "+0.5 over 6 plays" and hide course A's pattern.
addPlays('course-B', 'Old Town', 7, [0, 0, 0]);
// Course B hole 3: +0.67 (3 plays) — a genuine second entry.
addPlays('course-B', 'Old Town', 3, [1, 1, 0]);
// Rounds without a course on file: hole 7 was +2 each time. They cannot join a
// specific-hole ranking (no identity) and must be counted, not fabricated
// from a course name.
addPlays(null, 'Somewhere Muni', 7, [2, 2, 2, 2]);

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      const ret = () => chain;
      chain.select = ret;
      chain.eq = ret;
      chain.maybeSingle = () =>
        Promise.resolve({
          data: {
            rounds_played: 13,
            penalty_strokes_per_round: 0.4,
            eagles: 0, birdies: 10, pars: 120, bogeys: 60, double_bogeys: 20, triple_plus: 4,
            first_round_date: '2026-03-01',
            last_round_date: '2026-09-01',
          },
          error: null,
        });
      return chain;
    },
  }),
}));
vi.mock('@/lib/coachhelm/v3/engine/hole-diagnosis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/engine/hole-diagnosis')>();
  return { ...actual, loadCompletedHoles: vi.fn(async () => holes) };
});
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({
  loadStandingForMetric: vi.fn(async () => null),
}));
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({
  loadPlayerCohort: vi.fn(async () => ({ gender: 'mens', level: null })),
}));

const { CourseMgmtGenerator } = await import('@/lib/coachhelm/v3/generators/course-mgmt');

describe('CourseMgmtGenerator worst holes — (course_id, hole_number) identity', () => {
  it('does not merge hole 7 across courses, and leaves course-less rounds out with a count', async () => {
    const g = new CourseMgmtGenerator('p-1', 'big_number');
    const agg = await g.aggregate();
    expect(agg).not.toBeNull();
    expect(agg!.worst_holes).toEqual([
      { course_id: 'course-A', course_name: 'Pine Valley', hole_number: 7, avg_to_par: 1, n: 3 },
      { course_id: 'course-B', course_name: 'Old Town', hole_number: 3, avg_to_par: 2 / 3, n: 3 },
    ]);
    // The four course-less plays (the worst scores in the set) are excluded,
    // not attributed to a course by name; the coverage gap is stated in
    // rounds (four rounds here, one hole each).
    expect(agg!.worst_holes_excluded_rounds).toBe(4);
    expect(agg!.worst_holes.some((w) => w.course_name === 'Somewhere Muni')).toBe(false);

    const c = g.composeContent(agg!);
    expect(c.content).toContain('hole 7 at Pine Valley (+1.0/play over 3 plays)');
    expect(c.content).toContain('hole 3 at Old Town (+0.7/play over 3 plays)');
    expect(c.content).toContain('4 rounds without a course on file are not in this ranking');
  });

  it('the proximate-cause split still counts every hole, course or not', async () => {
    const g = new CourseMgmtGenerator('p-1', 'big_number');
    const agg = await g.aggregate();
    // Only the four course-less +2 plays are double-or-worse; none has a
    // penalty / 3-putt / missed-GIR-no-scramble marker beyond the missed green.
    expect(agg!.cause_missed_gir_pct).toBe(100);
  });
});
