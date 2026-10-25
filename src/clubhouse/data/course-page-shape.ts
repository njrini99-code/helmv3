import { courseKeyString, groupCourseRounds, parseCourseKey, resolveCourseKey } from './course-key';
import { averageArc, holeStats, playsCompared, stretches, type ChHolePlay, type ChHoleStats, type ChStretch } from './course-history-shape';
import { holeCoverage, isScoreCountable, recordedPutts } from './round-scope';
import { toLibraryRound, type ChLibraryRound } from './rounds-shape';
import { formatFixed, formatToPar } from '../lib/format';
import type { ChPlayHole } from './stats-extra';

/*
 * P-7: one player's history at one course (the course page), from their light list of rounds, the holes of the rounds
 * here and the last round's coach note. Every figure honours its floor (4.1.3). Pure: no Supabase, no React.
 */

/** The light list the course page reads (8.5.1 a). */
export interface ChCourseListRow {
  id: string;
  course_id: string | null;
  course_name: string | null;
  course_city: string | null;
  course_state: string | null;
  tee_id: string | null;
  tees_played: string | null;
  round_date: string;
  round_type: string | null;
  holes_played: number | null;
  total_score: number | null;
  score_to_par: number | null;
  front_nine: number | null;
  back_nine: number | null;
  total_putts: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  notes: string | null;
}

export type ChCourseWindow = 'all' | 'season';

export interface ChCourseHero {
  /** "Your history · 6 rounds" (or the coach's "Lena's history · 6 rounds"). */
  kicker: string;
  place: string | null;
  figure: { kind: 'average'; value: number; toPar: number | null; early: number | null } | { kind: 'last'; value: number; date: string; nine: boolean };
}

export interface ChCourseFigure {
  label: string;
  value: string | null;
  sub: string;
  /** The review this figure is from, when it is one round's. */
  roundId?: string;
  toPar?: number | null;
}

export interface ChCourseHole {
  n: number;
  par: number | null;
  /** The newest play's yardage; null when no play has one. */
  yards: number | null;
  stats: ChHoleStats;
  /** Each play of the hole here, newest first: the round, its date and the score. */
  plays: Array<{ roundId: string; date: string; score: number; par: number }>;
}

export interface ChCourseHistory {
  key: string;
  name: string;
  /** The library course, when the group has one (Start a round here). */
  courseId: string | null;
  window: ChCourseWindow;
  hero: ChCourseHero;
  figures: ChCourseFigure[];
  lastTime: { id: string; line: string; note: string | null; coachNote: string | null } | null;
  rounds: ChLibraryRound[];
  /** Eighteen holes in number order; empty when no round here has hole scores. */
  holes: ChCourseHole[];
  /** "Hole stats from 3 of 5 rounds"; null when every round has its holes. */
  coverage: string | null;
  stretch: { worst: ChStretch | null; best: ChStretch | null };
  compared: ReturnType<typeof playsCompared>;
  arc: ReturnType<typeof averageArc>;
  /** The holes failed to load: the hole sections say so, the rest stands. */
  holesError: boolean;
  /** Rounds with hole scores in the window. */
  holeRounds: number;
  /** The All time / This season choice, when the season holds two rounds with holes and differs from all time; else null. */
  windows: { all: number; season: number } | null;
}

export type ChCourseShapeResult = { kind: 'ok'; data: ChCourseHistory } | { kind: 'redirect'; key: string } | { kind: 'notFound' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
/** "Oct 3", from yyyy-mm-dd. */
export const shortDate = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const monthYear = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const signed = (v: number | null | undefined) => (v == null ? null : formatToPar(v));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const countable = (r: ChCourseListRow) => isScoreCountable(r);
const TYPE_WORD: Record<string, string> = { practice: 'Practice', tournament: 'Tournament', qualifier: 'Qualifier' };

/** "Blue tees", or "Blue tees (5) · White (1)" when there are two or more. */
function teesLine(rows: readonly ChCourseListRow[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const t = r.tees_played?.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  if (sorted.length === 1) return `${sorted[0]![0]} tees`;
  return sorted.map(([t, n], i) => (i === 0 ? `${t} tees (${n})` : `${t} (${n})`)).join(' · ');
}

export function toCourseHistory(input: {
  rawKey: string;
  list: readonly ChCourseListRow[];
  /** Holes of the group's rounds, by round id; null when the holes read failed. */
  holes: ReadonlyMap<string, readonly ChPlayHole[]> | null;
  library: { name: string; city: string | null; state: string | null } | null;
  coachNote: string | null;
  window: ChCourseWindow;
  seasonStart: string;
  /** The coach's player's first name; null for the player's own page. */
  who: string | null;
}): ChCourseShapeResult {
  const key = parseCourseKey(input.rawKey);
  if (!key) return { kind: 'notFound' };
  const groups = groupCourseRounds(input.list);
  const resolved = resolveCourseKey(key, groups, input.library?.name ?? null);
  if (resolved.redirectTo) return { kind: 'redirect', key: resolved.redirectTo };
  const group = resolved.group ? groups.get(resolved.group) : null;
  if (!group) return { kind: 'notFound' };

  const all = group.rounds.filter((r) => input.window === 'all' || r.round_date.slice(0, 10) >= input.seasonStart);
  const name = input.library?.name?.trim() || group.name;
  const scored = all.filter(countable);
  const eighteens = scored.filter((r) => (r.holes_played ?? 18) === 18 && r.total_score != null);
  const nines = scored.filter((r) => r.holes_played === 9);
  const whose = input.who ? `${input.who}’s` : 'Your';
  const newest = all[0] ?? null;

  const city = input.library ? [input.library.city, input.library.state] : [newest?.course_city ?? null, newest?.course_state ?? null];
  const place = [city.filter(Boolean).join(', ') || null, teesLine(all)].filter(Boolean).join(' · ') || null;

  const avg = eighteens.length ? eighteens.reduce((a, r) => a + (r.total_score as number), 0) / eighteens.length : null;
  const toPars = eighteens.map((r) => r.score_to_par).filter((v): v is number => v != null);
  const lastScored = scored.find((r) => r.total_score != null) ?? null;
  let figure: ChCourseHero['figure'];
  if (avg != null && eighteens.length >= 2) {
    figure = { kind: 'average', value: avg, toPar: toPars.length === eighteens.length ? toPars.reduce((a, v) => a + v, 0) / toPars.length : null, early: eighteens.length < 5 ? eighteens.length : null };
  } else if (lastScored) {
    figure = { kind: 'last', value: lastScored.total_score as number, date: lastScored.round_date.slice(0, 10), nine: lastScored.holes_played === 9 };
  } else {
    return { kind: 'notFound' };
  }

  const figures: ChCourseFigure[] = [];
  const sameHoles = (lastScored?.holes_played ?? 18) === 9 ? nines : eighteens;
  const best = sameHoles.reduce<ChCourseListRow | null>((a, r) => (!a || (r.total_score as number) < (a.total_score as number) ? r : a), null);
  if (best) {
    figures.push({ label: sameHoles.length === 1 ? 'Only round' : 'Best', value: String(best.total_score), sub: [shortDate(best.round_date.slice(0, 10)), signed(best.score_to_par)].filter(Boolean).join(' · '), roundId: best.id, toPar: best.score_to_par });
  }
  if (lastScored) {
    figures.push({ label: 'Last time', value: String(lastScored.total_score), sub: [shortDate(lastScored.round_date.slice(0, 10)), signed(lastScored.score_to_par)].filter(Boolean).join(' · '), roundId: lastScored.id, toPar: lastScored.score_to_par });
  }
  const oldest = all[all.length - 1];
  figures.push({
    label: 'Rounds',
    value: String(eighteens.length || scored.length),
    sub: [oldest ? `Since ${monthYear(oldest.round_date.slice(0, 10))}` : null, nines.length && eighteens.length ? `plus ${plural(nines.length, 'nine')}` : null].filter(Boolean).join(' · '),
  });
  const putts = eighteens.map((r) => recordedPutts(r.total_putts)).filter((v): v is number => v != null);
  figures.push(putts.length >= 2 ? { label: 'Putts', value: formatFixed(putts.reduce((a, v) => a + v, 0) / putts.length, 1), sub: `a round · ${plural(putts.length, 'round')}` } : { label: 'Putts', value: null, sub: 'Putts not recorded' });

  const lastRow = newest;
  const lastTime =
    lastRow && (lastRow.notes?.trim() || input.coachNote?.trim())
      ? {
          id: lastRow.id,
          line: [shortDate(lastRow.round_date.slice(0, 10)), lastRow.total_score != null ? String(lastRow.total_score) : null, lastRow.tees_played?.trim() ? `${lastRow.tees_played.trim()} tees` : null, TYPE_WORD[toLibraryRound(lastRow)?.type ?? 'none'] ?? null]
            .filter(Boolean)
            .join(' · '),
          note: lastRow.notes?.trim() || null,
          coachNote: input.coachNote?.trim() || null,
        }
      : null;

  const rounds = all.map(toLibraryRound).filter((r): r is ChLibraryRound => !!r);

  // Hole figures: rounds with hole scores only.
  const holesById = input.holes;
  const withHoles = holesById ? all.filter((r) => (holesById.get(r.id) ?? []).some((h) => h.score != null)) : [];
  const plays = new Map<number, ChHolePlay[]>();
  const pars = new Map<number, number>();
  const yards = new Map<number, number>();
  // Newest first (the list's order), so the first par and yardage seen are the newest card's.
  for (const r of withHoles) {
    for (const h of holesById!.get(r.id) ?? []) {
      if (!pars.has(h.n)) pars.set(h.n, h.par);
      if (h.yards != null && !yards.has(h.n)) yards.set(h.n, h.yards);
      if (h.score == null) continue;
      const arr = plays.get(h.n) ?? [];
      arr.push({ score: h.score, par: h.par, putts: h.putts, gir: h.gir, fairway: h.fairway, roundId: r.id, date: r.round_date.slice(0, 10) });
      plays.set(h.n, arr);
    }
  }
  const holes: ChCourseHole[] = withHoles.length
    ? Array.from({ length: 18 }, (_, i) => {
        const p = plays.get(i + 1) ?? [];
        return { n: i + 1, par: pars.get(i + 1) ?? null, yards: yards.get(i + 1) ?? null, stats: holeStats(p), plays: p.map((x) => ({ roundId: x.roundId, date: x.date, score: x.score, par: x.par })) };
      })
    : [];
  const fullCards = withHoles.filter((r) => (r.holes_played ?? 18) === 18).map((r) => holesById!.get(r.id)!);
  const here = eighteens.map((r) => r.score_to_par).filter((v): v is number => v != null);
  const elsewhere = input.list
    .filter((r) => !group.rounds.includes(r) && countable(r) && (r.holes_played ?? 18) === 18 && r.score_to_par != null)
    .filter((r) => input.window === 'all' || r.round_date.slice(0, 10) >= input.seasonStart)
    .map((r) => r.score_to_par as number);

  return {
    kind: 'ok',
    data: {
      key: courseKeyString(group.key),
      name,
      courseId: group.key.kind === 'id' ? group.key.id : null,
      window: input.window,
      hero: { kicker: `${whose} history · ${plural(scored.length, 'round')}`, place, figure },
      figures,
      lastTime,
      rounds,
      holes,
      coverage: holesById ? holeCoverage(withHoles.length, all.length) : null,
      stretch: stretches(fullCards),
      compared: playsCompared(here, elsewhere),
      arc: averageArc(fullCards),
      holesError: holesById == null,
      holeRounds: withHoles.length,
      windows: (() => {
        if (!holesById) return null;
        const has = (r: ChCourseListRow) => (holesById.get(r.id) ?? []).some((h) => h.score != null);
        const allN = group.rounds.filter(has).length;
        const seasonN = group.rounds.filter((r) => r.round_date.slice(0, 10) >= input.seasonStart && has(r)).length;
        return seasonN >= 2 && seasonN !== allN ? { all: allN, season: seasonN } : null;
      })(),
    },
  };
}
