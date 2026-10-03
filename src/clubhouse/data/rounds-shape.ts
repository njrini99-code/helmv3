import { isScoreCountable } from './round-scope';
import { withCanonicalRoundTotal } from '@/lib/golf/round-total';

/**
 * The Rounds library's data shapes and the pure steps that build them, kept
 * apart from the server loader (data/rounds.ts) so the preview and tests use
 * the same code the page does.
 */

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export type ChRoundType = 'practice' | 'tournament' | 'qualifier';

export interface ChLibraryRound {
  id: string;
  /** yyyy-mm-dd, a calendar date. */
  date: string;
  course: string;
  /** "Blue tees"; null when the round has none recorded. */
  tee: string | null;
  /** A tee colour the name spells out ("Men's Blue" is blue); null draws no swatch. */
  teeColor: ChTeeColor | null;
  type: ChRoundType | null;
  holes: number;
  score: number;
  toPar: number | null;
  out: number | null;
  inn: number | null;
  fairways: { hit: number; of: number } | null;
  greens: { hit: number; of: number } | null;
  putts: number | null;
  /** Counts toward the score figures (isScoreCountable: every hole scored, or an 18-hole total posted without its holes, Q-123). */
  countable: boolean;
}

export interface ChUnfinishedRound {
  id: string;
  course: string;
  tee: string | null;
  teeColor: ChTeeColor | null;
  type: ChRoundType | null;
  holes: number;
  /** yyyy-mm-dd the round was set up for. */
  date: string;
  /** Score and par for each hole with a durable score, by hole number. */
  played: Array<{ n: number; score: number; par: number | null }>;
  /** Strokes against par over the scored holes; null without pars. */
  toParThru: number | null;
  /** The next hole to play, or null when every hole has a score. */
  nextHole: number | null;
  /** Every hole already has a score: the round only needs submitting (legacy R8). */
  readyToSubmit: boolean;
  /**
   * The holes read failed: `played`, `toParThru` and the strip say nothing about the holes (they are not "none scored"), and the
   * card says the scores didn't load. `nextHole` is then the round's saved current hole.
   */
  holesError?: boolean;
  /** Every hole is scored but the posted rounds didn't load, so "already submitted" can't be judged: Submit is not offered on this card. */
  submitUnchecked?: boolean;
}

export interface ChRoundsSeason {
  /** 18-hole countable rounds since 1 August. */
  rounds: number;
  avg: number | null;
  toPar: number | null;
  best: { score: number; toPar: number | null; course: string; date: string } | null;
  putts: number | null;
  /** Greens in regulation, percent of greens played. */
  girPct: number | null;
  /** Greens hit per 18. */
  girPer18: number | null;
  /** Oldest to newest, at most RIBBON_MAX. */
  ribbon: Array<{ id: string; date: string; score: number; toPar: number; type: ChRoundType | null }>;
}

export interface ChRoundsLibrary {
  todayIso: string;
  /**
   * `unscored`: completed rounds with no score at all (no total and no nines), which the list can't draw. They never counted in a
   * figure (no total is never countable), and the page says how many are left out instead of hiding them. Absent when none.
   */
  rounds: { list: ChLibraryRound[]; error: boolean; unscored?: number };
  season: ChRoundsSeason;
  unfinished: { list: ChUnfinishedRound[]; error: boolean };
}

export type ChTeeColor = 'black' | 'blue' | 'white' | 'gold' | 'red' | 'green' | 'silver';

/** Rounds in the season ribbon: enough to read a trend, few enough to read each bar. */
export const RIBBON_MAX = 20;

const TEE_WORDS: ReadonlyArray<[RegExp, ChTeeColor]> = [
  [/\bblack\b/i, 'black'],
  [/\bblue\b/i, 'blue'],
  [/\bwhite\b/i, 'white'],
  [/\bgold\b|\byellow\b/i, 'gold'],
  [/\bred\b/i, 'red'],
  [/\bgreen\b/i, 'green'],
  [/\bsilver\b/i, 'silver'],
];

/** The swatch a tee name spells out, or null ("Championship" names no colour). */
export function teeColorFor(name: string | null): ChTeeColor | null {
  if (!name) return null;
  for (const [re, c] of TEE_WORDS) if (re.test(name)) return c;
  return null;
}

/** "Blue tees", "Qualifying Tees" (already says tees), or null. */
export function teeLabel(name: string | null): string | null {
  const n = name?.trim();
  if (!n) return null;
  return /\btees?\b/i.test(n) ? n : `${n} tees`;
}

export function roundType(t: string | null): ChRoundType | null {
  return t === 'practice' || t === 'tournament' || t === 'qualifier' ? t : null;
}

export const courseName = (name: string | null) => name?.trim() || 'Course not recorded';

export type ChRoundListRow = {
  id: string;
  course_name: string | null;
  tees_played: string | null;
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  front_nine: number | null;
  back_nine: number | null;
  holes_played: number | null;
  total_putts: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
};

export function toLibraryRound(raw: ChRoundListRow): ChLibraryRound | null {
  const r = withCanonicalRoundTotal(raw);
  if (r.total_score == null) return null;
  const holes = r.holes_played ?? 18;
  return {
    id: r.id,
    date: r.round_date.slice(0, 10),
    course: courseName(r.course_name),
    tee: teeLabel(r.tees_played),
    teeColor: teeColorFor(r.tees_played),
    type: roundType(r.round_type),
    holes,
    score: r.total_score,
    toPar: r.score_to_par,
    out: r.front_nine,
    inn: holes === 18 ? r.back_nine : null,
    fairways: r.total_fairways ? { hit: r.total_fairways_hit ?? 0, of: r.total_fairways } : null,
    greens: r.total_gir_possible ? { hit: r.total_gir ?? 0, of: r.total_gir_possible } : null,
    putts: r.total_putts,
    countable: isScoreCountable(r),
  };
}

/** The season figures from the listed rounds: countable (a total-only round included, Q-123: a score), 18 holes, since `since`. */
export function seasonFrom(list: ChLibraryRound[], since: string): ChRoundsSeason {
  const s = list.filter((r) => r.countable && r.holes === 18 && r.date >= since);
  const nums = (pick: (r: ChLibraryRound) => number | null) => s.map(pick).filter((v): v is number => v != null);
  const withPar = s.filter((r): r is ChLibraryRound & { toPar: number } => r.toPar != null);
  const best = withPar.length ? withPar.reduce((m, r) => (r.toPar < m.toPar || (r.toPar === m.toPar && r.score < m.score) ? r : m)) : s.length ? s.reduce((m, r) => (r.score < m.score ? r : m)) : null;
  const greens = s.filter((r) => r.greens);
  const hit = greens.reduce((a, r) => a + (r.greens?.hit ?? 0), 0);
  const of = greens.reduce((a, r) => a + (r.greens?.of ?? 0), 0);
  return {
    rounds: s.length,
    avg: mean(s.map((r) => r.score)),
    toPar: mean(nums((r) => r.toPar)),
    best: best ? { score: best.score, toPar: best.toPar, course: best.course, date: best.date } : null,
    putts: mean(nums((r) => r.putts)),
    girPct: of ? (hit / of) * 100 : null,
    girPer18: of ? (hit / of) * 18 : null,
    ribbon: withPar
      .slice(0, RIBBON_MAX)
      .reverse()
      .map((r) => ({ id: r.id, date: r.date, score: r.score, toPar: r.toPar, type: r.type })),
  };
}
