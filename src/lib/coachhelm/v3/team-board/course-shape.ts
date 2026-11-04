import { isCountableRound } from '@/lib/golf/round-countable';

/**
 * The Course tab's scoring history (CT0; AC-COURSE-10), pure: the season's countable rounds in, no new query. Round-weighted; a week's point is
 * the mean of that week's rounds; last 4 weeks is the last 28 days and null under 6 weeks; courses group by `course_id`, else `course_name`, and
 * are named by the newest name so two spellings of one course make one row (W-TEAM-17).
 */
export interface CourseRoundInput {
  id?: string;
  player_id: string;
  round_date: string;
  course_id?: string | null;
  course_name?: string | null;
  score_to_par?: number | null;
  round_type?: string | null;
  [key: string]: unknown;
}

export interface CourseHistoryPlayer {
  id: string;
  rounds: number;
  value: number;
  /** The player's own season mean, for the dumbbell. */
  season: number;
}

export interface CourseHistoryRow {
  id: string;
  name: string;
  rounds: number;
  value: number;
  /** Newest round here, YYYY-MM-DD. */
  last: string;
  players: CourseHistoryPlayer[];
}

export interface CourseHistory {
  season: number | null;
  rounds: number;
  last4: number | null;
  weeks: Array<{ start: string; value: number; n: number }>;
  courses: CourseHistoryRow[];
}

const mean = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const DAY = 86_400_000;
/** The Monday on or before a calendar day, worked in UTC so a date never moves with the viewer's zone (CP-TEAM-16). */
function mondayOf(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  const dow = new Date(t).getUTCDay();
  return new Date(t - ((dow + 6) % 7) * DAY).toISOString().slice(0, 10);
}

export function toCourseHistory(rounds: readonly CourseRoundInput[], rosterIds: readonly string[], today: string): CourseHistory {
  const roster = new Set(rosterIds);
  const scored = rounds.filter((r): r is CourseRoundInput & { score_to_par: number } => roster.has(r.player_id) && r.score_to_par != null && isCountableRound(r as never));
  const season = mean(scored.map((r) => r.score_to_par));

  const byWeek = new Map<string, number[]>();
  for (const r of scored) {
    const k = mondayOf(r.round_date);
    byWeek.set(k, [...(byWeek.get(k) ?? []), r.score_to_par]);
  }
  const weeks = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([start, xs]) => ({ start, value: mean(xs) as number, n: xs.length }));

  const floor = Date.parse(`${today}T00:00:00Z`) - 28 * DAY;
  const last4 = weeks.length < 6 ? null : mean(scored.filter((r) => Date.parse(`${r.round_date}T00:00:00Z`) > floor).map((r) => r.score_to_par));

  const seasonOf = new Map<string, number>();
  const perPlayer = new Map<string, number[]>();
  for (const r of scored) perPlayer.set(r.player_id, [...(perPlayer.get(r.player_id) ?? []), r.score_to_par]);
  for (const [id, xs] of perPlayer) seasonOf.set(id, mean(xs) as number);

  const groups = new Map<string, Array<CourseRoundInput & { score_to_par: number }>>();
  for (const r of scored) {
    const k = r.course_id ?? (r.course_name ? `name:${r.course_name.trim().toLowerCase()}` : null);
    if (k) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const courses = [...groups.entries()]
    .map(([id, list]) => {
      const newest = [...list].sort((a, b) => b.round_date.localeCompare(a.round_date));
      const players = new Map<string, number[]>();
      for (const r of list) players.set(r.player_id, [...(players.get(r.player_id) ?? []), r.score_to_par]);
      return {
        id,
        name: newest.find((r) => r.course_name?.trim())?.course_name?.trim() ?? 'Course',
        rounds: list.length,
        value: mean(list.map((r) => r.score_to_par)) as number,
        last: newest[0]!.round_date,
        players: [...players.entries()]
          .map(([pid, xs]) => ({ id: pid, rounds: xs.length, value: mean(xs) as number, season: seasonOf.get(pid) as number }))
          .sort((a, b) => a.value - a.season - (b.value - b.season)),
      };
    })
    .sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name));
  return { season, rounds: scored.length, last4, weeks, courses };
}
