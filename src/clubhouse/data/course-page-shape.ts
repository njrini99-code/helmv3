import { courseKeyString, groupCourseRounds, parseCourseKey, resolveCourseKey } from './course-key';
import { averageArc, holeStats, playsCompared, stretches, type ChHolePlay, type ChHoleStats, type ChStretch } from './course-history-shape';
import { holeCoverage, isScoreCountable, recordedPutts } from './round-scope';
import { toLibraryRound, type ChLibraryRound } from './rounds-shape';
import { formatFixed, formatSigned, formatToPar } from '../lib/format';
import type { ChPlayHole } from './stats-extra';
import type { ChCompareCard } from './compare-rounds';

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
  /** P-7 4.2.5: how the course plays for the player, in one sentence and the rows past their floors. */
  howItPlays: { sentence: string; sample: string | null; rows: Array<{ label: string; value: string; hole?: number }> };
  /** P-7 4.2.7: the 18-hole rounds here with every hole, which can be compared; keyed by round id. */
  cards: Record<string, ChCompareCard>;
  /** P-7 4.2.6: the overlays on the average arc: the best and the last full round here, as running to par. */
  arcLines: { best: { cum: number[]; score: number } | null; last: { cum: number[]; score: number } | null };
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

const isFull = (h: readonly ChPlayHole[] | undefined): boolean => !!h && h.length === 18 && h.every((x) => x.score != null);
const mean = (xs: readonly number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
/** An average to par at one decimal: "+3.0", "−0.4", or "E" when it rounds to level. */
export const avgToPar = (v: number) => (Math.abs(v) < 0.05 ? 'E' : formatSigned(v, 1));
const perRound = (v: number) => `${avgToPar(v)} a round`;
const perHole = (v: number) => `${avgToPar(v)} a hole`;
const stretchWords = (from: number) => `Holes ${from} to ${from + 2}`;

/** "Finley plays 1.6 shots harder for you than your other courses.", the rows under it, each past its floor (4.1.3). */
function howItPlays(input: {
  name: string;
  who: string | null;
  here: readonly number[];
  elsewhere: readonly number[];
  fullCards: ReadonlyArray<readonly ChPlayHole[]>;
  withHoles: ReadonlyArray<readonly ChPlayHole[]>;
  scored: readonly ChCourseListRow[];
  stretch: ReturnType<typeof stretches>;
}): ChCourseHistory['howItPlays'] {
  const c = playsCompared(input.here, input.elsewhere);
  const you = input.who ?? 'you';
  const yours = input.who ? `${input.who}’s` : 'your';
  const sentence =
    'needs' in c
      ? c.needs === 'here'
        ? 'Needs 3 rounds here to compare.'
        : 'Needs 3 rounds at other courses to compare.'
      : c.words === 'same'
        ? `${input.name} plays about the same for ${you} as ${yours} other courses.`
        : `${input.name} plays ${formatFixed(Math.abs(c.diff), 1)} shots ${c.words} for ${you} than ${yours} other courses.`;
  const sample =
    input.here.length && input.elsewhere.length
      ? `${avgToPar(mean(input.here))} here · ${avgToPar(mean(input.elsewhere))} elsewhere · ${plural(input.here.length, 'round')} here, ${input.elsewhere.length} elsewhere`
      : null;
  const rows: ChCourseHistory['howItPlays']['rows'] = [];
  const nineCards = input.withHoles.filter((h) => h.length === 18 && h.every((x) => x.score != null));
  if (nineCards.length >= 2) {
    const nine = (lo: number, hi: number) => mean(nineCards.map((h) => h.filter((x) => x.n >= lo && x.n <= hi).reduce((a, x) => a + (x.score as number) - x.par, 0)));
    rows.push({ label: 'Front nine', value: perRound(nine(1, 9)) }, { label: 'Back nine', value: perRound(nine(10, 18)) });
  }
  for (const par of [3, 4, 5]) {
    const hs = input.withHoles.flatMap((h) => h.filter((x) => x.par === par && x.score != null));
    if (hs.length >= 6) rows.push({ label: `Par ${par}s`, value: perHole(mean(hs.map((x) => (x.score as number) - par))) });
  }
  if (input.stretch.worst) rows.push({ label: 'Most to gain', value: `${stretchWords(input.stretch.worst.from)} · ${perRound(input.stretch.worst.avg)}`, hole: input.stretch.worst.from });
  if (input.stretch.best) rows.push({ label: 'Best stretch', value: `${stretchWords(input.stretch.best.from)} · ${perRound(input.stretch.best.avg)}`, hole: input.stretch.best.from });
  const of = (type: string) => input.scored.filter((r) => r.round_type === type && (r.holes_played ?? 18) === 18 && r.total_score != null).map((r) => r.total_score as number);
  const q = of('qualifier');
  const pr = of('practice');
  if (q.length >= 3 && pr.length >= 3) rows.push({ label: 'Qualifiers here', value: `${formatFixed(mean(q), 1)} · practice ${formatFixed(mean(pr), 1)}` });
  return { sentence, sample, rows };
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
      howItPlays: howItPlays({ name, who: input.who, here, elsewhere, fullCards, withHoles: withHoles.map((r) => holesById!.get(r.id)!), scored, stretch: stretches(fullCards) }),
      cards: Object.fromEntries(
        withHoles
          .filter((r) => (r.holes_played ?? 18) === 18 && r.total_score != null && isFull(holesById!.get(r.id)))
          .map((r) => {
            const hs = [...holesById!.get(r.id)!].sort((a, b) => a.n - b.n);
            return [r.id, { id: r.id, date: r.round_date.slice(0, 10), score: r.total_score as number, scores: hs.map((h) => h.score as number), pars: hs.map((h) => h.par) }];
          }),
      ),
      arcLines: (() => {
        const full = withHoles.filter((r) => (r.holes_played ?? 18) === 18 && isFull(holesById!.get(r.id)));
        const cumOf = (r: ChCourseListRow) => {
          let c = 0;
          return [...holesById!.get(r.id)!].sort((a, b) => a.n - b.n).map((h) => (c += (h.score as number) - h.par));
        };
        const bestRow = full.filter((r) => r.total_score != null).reduce<ChCourseListRow | null>((a, r) => (!a || (r.total_score as number) < (a.total_score as number) ? r : a), null);
        const lastRow = full[0] ?? null;
        return {
          best: bestRow && full.length >= 2 ? { cum: cumOf(bestRow), score: bestRow.total_score as number } : null,
          last: lastRow && full.length >= 2 ? { cum: cumOf(lastRow), score: (lastRow.total_score as number) ?? 0 } : null,
        };
      })(),
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
