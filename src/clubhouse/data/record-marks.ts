import { seasonStartOfDay } from '../lib/season-start';
import { recordedPutts } from './round-scope';

/*
 * P-7: the record a round sets, as up to two chips under its course name in the review ("Season low", "Best at Finley").
 * Measured against the player's CURRENT history (owner call 3): a later, lower round takes the chip away. Pure.
 */

/** One round as the marks compare it. The caller passes only countable rounds for the same player. */
export interface ChMarkRound {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  holesPlayed: number;
  total: number | null;
  front: number | null;
  back: number | null;
  putts: number | null;
  /** The course group key (`course-key.ts`), or null for a round with no course. */
  courseGroup: string | null;
}

export type ChRecordMarkId = 'career-low' | 'season-low' | 'course-best' | 'season-2nd' | 'season-putts' | 'season-back' | 'season-front';

export interface ChRecordMark {
  id: ChRecordMarkId;
  label: string;
  /** Filled for a career or season low, half for a course best, hollow for the rest. */
  tier: 'filled' | 'half' | 'hollow';
  tie: boolean;
}

const MIN_SET = 3;
const MIN_SECOND = 5;
const MAX_MARKS = 2;

type Pick = (r: ChMarkRound) => number | null;

/** Where `value` stands among the others: its rank (1 = lowest) and whether another round shares it. */
function standing(value: number, others: readonly number[]): { rank: number; tie: boolean } {
  return { rank: 1 + others.filter((x) => x < value).length, tie: others.includes(value) };
}

/**
 * The marks this round holds, at most two, in precedence order: career low, season low (never with career low), best at
 * the course, 2nd best this season, then fewest putts and the best nines this season. Each needs a set of at least three
 * comparable rounds (the same hole count), counting this one; 2nd best needs five. A round's season is its own date's
 * (`seasonStartOfDay`); the season marks show only when that is the season turning now (`opts.seasonStart`, from the
 * team's zone). The best nines compare 18-hole rounds only, so a nine-hole round never holds a nine record.
 */
export function recordMarks(
  round: ChMarkRound,
  history: readonly ChMarkRound[],
  opts: { seasonStart: string; courseName: string | null },
): ChRecordMark[] {
  const peers = history.filter((r) => r.id !== round.id && r.holesPlayed === round.holesPlayed);
  const own = seasonStartOfDay(round.date);
  const season = peers.filter((r) => seasonStartOfDay(r.date) === own);
  const inSeason = own === opts.seasonStart;
  const marks: ChRecordMark[] = [];

  const lowest = (set: readonly ChMarkRound[], pick: Pick): { tie: boolean } | null => {
    const v = pick(round);
    if (v == null) return null;
    const others = set.map(pick).filter((x): x is number => x != null);
    if (others.length + 1 < MIN_SET) return null;
    const s = standing(v, others);
    return s.rank === 1 ? { tie: s.tie } : null;
  };
  const add = (id: ChRecordMarkId, label: string, tier: ChRecordMark['tier'], hit: { tie: boolean } | null) => {
    if (!hit || marks.length >= MAX_MARKS) return;
    marks.push({ id, tier, tie: hit.tie, label: hit.tie ? `Ties ${label.charAt(0).toLowerCase()}${label.slice(1)}` : label });
  };
  const total: Pick = (r) => r.total;

  const career = lowest(peers, total);
  add('career-low', 'Career low', 'filled', career);
  if (!career && inSeason) add('season-low', 'Season low', 'filled', lowest(season, total));
  if (round.courseGroup && opts.courseName) {
    add('course-best', `Best at ${opts.courseName}`, 'half', lowest(peers.filter((r) => r.courseGroup === round.courseGroup), total));
  }
  if (inSeason && round.total != null) {
    const others = season.map(total).filter((x): x is number => x != null);
    if (others.length + 1 >= MIN_SECOND) {
      const s = standing(round.total, others);
      if (s.rank === 2) add('season-2nd', '2nd best this season', 'hollow', { tie: s.tie });
    }
  }
  if (inSeason) {
    const putts: Pick = (r) => recordedPutts(r.putts);
    const p = putts(round);
    add('season-putts', `Fewest putts this season · ${p}`, 'hollow', lowest(season, putts));
    if (round.holesPlayed === 18) {
      add('season-back', `Best back nine this season · ${round.back}`, 'hollow', lowest(season, (r) => r.back));
      add('season-front', `Best front nine this season · ${round.front}`, 'hollow', lowest(season, (r) => r.front));
    }
  }
  return marks;
}

/**
 * Whether two rounds were played from the same tees, so one can be drawn over the other: the same `tee_id`, or, when either
 * has none, the same `tees_played` name (trimmed, any case).
 */
export function sameTees(a: { teeId: string | null; tees: string | null }, b: { teeId: string | null; tees: string | null }): boolean {
  if (a.teeId && b.teeId) return a.teeId === b.teeId;
  const n = (s: string | null) => (s ?? '').trim().toLowerCase();
  return n(a.tees) !== '' && n(a.tees) === n(b.tees);
}
