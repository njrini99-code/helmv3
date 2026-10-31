import { normalizeName } from '@/lib/golf/course-library';
import { courseKeyString, groupCourseRounds } from './course-key';
import { isScoreCountable } from './round-scope';

/*
 * P-7 4.6: the player's history at each course, small enough to show beside a course picked in round setup ("Your history
 * here · 6 rounds", "Average 74.2 · Best 70 · Last time 76 on Oct 3", their last note). Grouped as the course page groups
 * (`groupCourseRounds`), so the numbers agree with it. Pure.
 */

export interface ChGlanceRow {
  id: string;
  course_id: string | null;
  course_name: string | null;
  round_date: string;
  holes_played: number | null;
  total_score: number | null;
  front_nine: number | null;
  back_nine: number | null;
  total_putts: number | null;
  notes: string | null;
}

export interface ChCourseGlance {
  key: string;
  rounds: number;
  /** The 18-hole average, from two rounds; null under. */
  average: number | null;
  best: number | null;
  last: { score: number; date: string; note: string | null } | null;
}

/** Every course the player has countable rounds at, by course key. `list` is newest first. */
export function courseGlances(list: readonly ChGlanceRow[]): Record<string, ChCourseGlance> {
  const out: Record<string, ChCourseGlance> = {};
  for (const [key, g] of groupCourseRounds(list)) {
    const scored = g.rounds.filter((r) => r.total_score != null && isScoreCountable(r));
    if (!scored.length) continue;
    const eighteens = scored.filter((r) => (r.holes_played ?? 18) === 18).map((r) => r.total_score as number);
    const last = scored[0]!;
    out[key] = {
      key,
      rounds: scored.length,
      average: eighteens.length >= 2 ? eighteens.reduce((a, v) => a + v, 0) / eighteens.length : null,
      best: eighteens.length ? Math.min(...eighteens) : null,
      last: { score: last.total_score as number, date: last.round_date.slice(0, 10), note: last.notes?.trim() || null },
    };
  }
  return out;
}

/** The glance for a course picked in setup: by its library id, else by its name (a name that maps to one id is under the id). */
export function glanceFor(glances: Record<string, ChCourseGlance>, pick: { courseId: string | null; courseName: string }): ChCourseGlance | null {
  if (pick.courseId && glances[pick.courseId.toLowerCase()]) return glances[pick.courseId.toLowerCase()]!;
  const n = normalizeName(pick.courseName);
  if (!n) return null;
  return glances[courseKeyString({ kind: 'name', normalized: n })] ?? null;
}
