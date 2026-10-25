import { averageArc, COMPARE_MIN_ROUNDS } from './course-history-shape';
import { groupCourseRounds } from './course-key';
import { recordMarks, sameTees, type ChMarkRound, type ChRecordMark } from './record-marks';
import { isScoreCountable } from './round-scope';
import { baseline, baselineWords, type ChPlayHole } from './stats-extra';

/*
 * P-7: what a round's review says about it against the player's other rounds (the review's stage 3): the usual for the
 * four round figures, the record chips, the course it belongs to, each hole's "here before" and the two ghosts that can be
 * drawn over the arc. Measured against the CURRENT history (owner call 3). Pure: no Supabase, no React.
 */

/** The light list of the player's completed, non-test rounds, as `round-history.ts` reads it. */
export interface ChHistoryRoundRow {
  id: string;
  course_id: string | null;
  course_name: string | null;
  tees_played: string | null;
  tee_id: string | null;
  round_date: string;
  holes_played: number | null;
  total_score: number | null;
  front_nine: number | null;
  back_nine: number | null;
  total_putts: number | null;
}

/** The round under review, in the same terms. */
export type ChHistoryRound = ChHistoryRoundRow;

export type ChUsualWords = ReturnType<typeof baselineWords>;

export interface ChReviewHistory {
  /** The course this round belongs to and how many countable rounds the player has there, this one included; null with no course. */
  course: { key: string; name: string; rounds: number } | null;
  records: ChRecordMark[];
  /** The player's usual for the four round figures; null for a nine-hole round (its usual would mix the two). */
  usual: ChUsualWords | null;
  /** Earlier plays of each hole at this course, from two: average strokes to par and how many. Keyed by hole number. */
  hereBefore: Record<number, { avg: number; n: number }>;
  ghosts: {
    /** Average running score to par after each hole at this course, other 18-hole rounds with every hole, from three. */
    average: number[] | null;
    /** The lowest other 18-hole round here from the same tees with every hole. */
    best: { cum: number[]; score: number; date: string } | null;
  };
}

/** The usual reads the last this-many countable 18-hole rounds with hole scores before this one, at any course. */
export const USUAL_WINDOW = 20;
/** "Here before" shows from two earlier plays of the hole. */
export const HERE_BEFORE_MIN = 2;

const countable = (r: ChHistoryRoundRow) => isScoreCountable({ holes_played: r.holes_played, total_score: r.total_score, front_nine: r.front_nine, back_nine: r.back_nine, total_putts: r.total_putts });
const before = (a: { round_date: string; id: string }, b: { round_date: string; id: string }) =>
  a.round_date.slice(0, 10) < b.round_date.slice(0, 10) || (a.round_date.slice(0, 10) === b.round_date.slice(0, 10) && a.id < b.id);
/** Every hole of an 18-hole round scored. */
const complete = (holes: readonly ChPlayHole[] | undefined): holes is ChPlayHole[] => !!holes && holes.length === 18 && holes.every((h) => h.score != null);

const mark = (r: ChHistoryRoundRow, group: string | null): ChMarkRound => ({
  id: r.id,
  date: r.round_date.slice(0, 10),
  holesPlayed: r.holes_played ?? 18,
  total: r.total_score,
  front: r.front_nine,
  back: r.back_nine,
  putts: r.total_putts,
  courseGroup: group,
});

export function toReviewHistory(input: {
  round: ChHistoryRound;
  /** The player's other completed, non-test rounds (this one may be among them; it is never compared with itself). */
  list: readonly ChHistoryRoundRow[];
  /** Holes for the rounds that were read (the usual's and the course's). */
  holes: ReadonlyMap<string, readonly ChPlayHole[]>;
  seasonStart: string;
}): ChReviewHistory {
  const { round, holes, seasonStart } = input;
  const others = input.list.filter((r) => r.id !== round.id);
  const all = [round, ...others];
  const groups = groupCourseRounds(all);
  let groupKey: string | null = null;
  for (const [k, g] of groups) if (g.rounds.some((r) => r.id === round.id)) groupKey = k;
  const group = groupKey ? groups.get(groupKey)! : null;
  const groupOf = new Map<string, string>();
  for (const [k, g] of groups) for (const r of g.rounds) groupOf.set(r.id, k);

  const name = group ? group.name || round.course_name?.trim() || null : null;
  const course = group && groupKey && name ? { key: groupKey, name, rounds: group.rounds.filter(countable).length } : null;

  const records = countable(round)
    ? recordMarks(
        mark(round, groupKey),
        others.filter(countable).map((r) => mark(r, groupOf.get(r.id) ?? null)),
        { seasonStart, courseName: name },
      )
    : [];

  // The usual: the last 20 countable 18-hole rounds with every hole, before this one.
  const usualRounds = others
    .filter((r) => (r.holes_played ?? 18) === 18 && countable(r) && before(r, round) && complete(holes.get(r.id)))
    .sort((a, b) => (before(a, b) ? 1 : -1))
    .slice(0, USUAL_WINDOW);
  const words = baselineWords(
    baseline(
      usualRounds.map((r) => holes.get(r.id)!),
      // A posted round keeps no start hole (submit clears draft_data), so play order is hole order.
      usualRounds.map(() => null),
    ),
  );
  // A nine-hole round keeps only the big-numbers usual, worded per round ("usually 1.4 a round"), never halved (P-7 4.5.3).
  const usual = (round.holes_played ?? 18) === 18 ? words : { bounce: null, ppg: null, closing: null, big: words.big };

  // Here before: earlier plays of each hole at this course.
  const hereBefore: ChReviewHistory['hereBefore'] = {};
  const courseOthers = group ? group.rounds.filter((r) => r.id !== round.id) : [];
  const sums = new Map<number, { sum: number; n: number }>();
  // 18-hole rounds only, either side: a posted nine keeps no record of which nine it was (stored 1 to 9), so its holes
  // can't be matched by number (P-7 4.1.2).
  const eighteen = (round.holes_played ?? 18) === 18;
  for (const r of eighteen ? courseOthers : []) {
    if (!before(r, round) || (r.holes_played ?? 18) !== 18) continue;
    for (const h of holes.get(r.id) ?? []) {
      if (h.score == null) continue;
      const s = sums.get(h.n) ?? { sum: 0, n: 0 };
      s.sum += h.score - h.par;
      s.n++;
      sums.set(h.n, s);
    }
  }
  for (const [n, s] of sums) if (s.n >= HERE_BEFORE_MIN) hereBefore[n] = { avg: s.sum / s.n, n: s.n };

  // Ghosts: only for an 18-hole round, from other 18-hole rounds here with every hole.
  const fullHere = (round.holes_played ?? 18) === 18 ? courseOthers.filter((r) => (r.holes_played ?? 18) === 18 && complete(holes.get(r.id))) : [];
  const arc = fullHere.length >= COMPARE_MIN_ROUNDS ? averageArc(fullHere.map((r) => holes.get(r.id)!)) : null;
  const sameTee = fullHere.filter((r) => r.total_score != null && sameTees({ teeId: r.tee_id, tees: r.tees_played }, { teeId: round.tee_id, tees: round.tees_played }));
  const bestRow = sameTee.reduce<ChHistoryRoundRow | null>((a, r) => (!a || (r.total_score as number) < (a.total_score as number) ? r : a), null);
  const best = bestRow
    ? {
        cum: (() => {
          let c = 0;
          return [...holes.get(bestRow.id)!].sort((a, b) => a.n - b.n).map((h) => (c += (h.score as number) - h.par));
        })(),
        score: bestRow.total_score as number,
        date: bestRow.round_date.slice(0, 10),
      }
    : null;

  return { course, records, usual, hereBefore, ghosts: { average: arc?.mean ?? null, best } };
}

/** The ids whose holes the history needs: the usual's candidates (newest first) and the course's other rounds. */
export function historyHoleIds(round: ChHistoryRound, list: readonly ChHistoryRoundRow[]): string[] {
  const others = list.filter((r) => r.id !== round.id);
  const usual = others
    .filter((r) => (r.holes_played ?? 18) === 18 && countable(r) && before(r, round))
    .sort((a, b) => (before(a, b) ? 1 : -1))
    // A few spare in case some of the newest have a gap in their card.
    .slice(0, USUAL_WINDOW + 10)
    .map((r) => r.id);
  const groups = groupCourseRounds([round, ...others]);
  const here: string[] = [];
  for (const g of groups.values()) if (g.rounds.some((r) => r.id === round.id)) for (const r of g.rounds) if (r.id !== round.id) here.push(r.id);
  return [...new Set([...usual, ...here])];
}
