import { courseKeyString, groupCourseRounds, parseCourseKey, resolveCourseKey } from './course-key';
import { formatDateOnly, formatDateOnlyShort } from '@/lib/golf/date-only';
import { averageArc, holeStats, nineOf, ownHoleSd, playsCompared, stretches, type ChCardHole, type ChHolePlay, type ChHoleStats, type ChStretch } from './course-history-shape';
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

/** "Oct 3", from yyyy-mm-dd: a calendar date, formatted pinned to UTC so no zone moves it a day (`lib/golf/date-only.ts`). */
export const shortDate = (d: string) => formatDateOnlyShort(d);
/** "Sep 2025". */
const monthYear = (d: string) => formatDateOnly(d, { month: 'short', year: 'numeric' });
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
/** "1.4 a round over your usual": a stretch is measured against the player's own average, so it says so. */
const againstUsual = (v: number, usual: string) => `${formatFixed(Math.abs(v), 1)} a round ${v > 0 ? 'over' : 'under'} ${usual}`;

/** "Finley plays 1.6 shots harder for you than your other courses.", the rows under it, each past its floor (4.1.3). */
function howItPlays(input: {
  name: string;
  who: string | null;
  here: readonly number[];
  elsewhere: readonly number[];
  fullCards: ReadonlyArray<readonly ChPlayHole[]>;
  withHoles: ReadonlyArray<readonly ChPlayHole[]>;
  /** Every round with hole scores, unplaced nines included: a par 3's average needs no hole number. */
  parHoles: ReadonlyArray<readonly ChPlayHole[]>;
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
        : c.words === 'unclear'
          ? `No clear difference yet between ${input.name} and ${yours} other courses.`
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
    const hs = input.parHoles.flatMap((h) => h.filter((x) => x.par === par && x.score != null));
    if (hs.length >= 6) rows.push({ label: `Par ${par}s`, value: perHole(mean(hs.map((x) => (x.score as number) - par))) });
  }
  const usual = `${yours} usual`;
  if (input.stretch.worst) rows.push({ label: 'Most to gain', value: `${stretchWords(input.stretch.worst.from)} · ${againstUsual(input.stretch.worst.avg, usual)}`, hole: input.stretch.worst.from });
  if (input.stretch.best) rows.push({ label: 'Best stretch', value: `${stretchWords(input.stretch.best.from)} · ${againstUsual(input.stretch.best.avg, usual)}`, hole: input.stretch.best.from });
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
  /** The tee cards of the nine-hole rounds here, by tee id (`golf_course_tee_holes`), to place each nine (`nineOf`). */
  teeCards?: ReadonlyMap<string, ReadonlyMap<number, ChCardHole>>;
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

  // Hole figures: rounds with hole scores only. A nine-hole round is stored as holes 1 to 9 whichever nine it was, so it
  // counts in hole figures only when `nineOf` places it on its tee card or the player's own 18-hole card here (a back
  // nine renumbered 10 to 18). An unplaced nine still counts in the score figures and the par 3/4/5 averages.
  const read = input.holes;
  const withAnyHoles = read ? all.filter((r) => (read.get(r.id) ?? []).some((h) => h.score != null)) : [];
  const ownCard = new Map<number, ChCardHole>();
  for (const r of withAnyHoles) {
    if ((r.holes_played ?? 18) !== 18) continue;
    for (const h of read!.get(r.id)!) if (!ownCard.has(h.n)) ownCard.set(h.n, { par: h.par, yards: h.yards ?? null });
  }
  const placed = new Map<string, readonly ChPlayHole[]>();
  for (const r of withAnyHoles) {
    const hs = read!.get(r.id)!;
    if (r.holes_played !== 9) {
      placed.set(r.id, hs);
      continue;
    }
    const card = (r.tee_id ? input.teeCards?.get(r.tee_id) : undefined) ?? (ownCard.size === 18 ? ownCard : null);
    const side = nineOf(hs, card);
    if (side) placed.set(r.id, side === 'back' ? hs.map((h) => ({ ...h, n: h.n + 9 })) : hs);
  }
  const holesById: ReadonlyMap<string, readonly ChPlayHole[]> | null = read ? placed : null;
  const withHoles = withAnyHoles.filter((r) => placed.has(r.id));
  const unplacedNines = withAnyHoles.length - withHoles.length;
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
  // The player's own spread of a hole here, from these plays (the sourced fallback until it has 30 degrees of freedom).
  const holeSd = ownHoleSd([...plays.values()]);
  const holes: ChCourseHole[] = withHoles.length
    ? Array.from({ length: 18 }, (_, i) => {
        const p = plays.get(i + 1) ?? [];
        return { n: i + 1, par: pars.get(i + 1) ?? null, yards: yards.get(i + 1) ?? null, stats: holeStats(p, holeSd), plays: p.map((x) => ({ roundId: x.roundId, date: x.date, score: x.score, par: x.par })) };
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
      coverage: holesById
        ? unplacedNines
          ? `${holeCoverage(withHoles.length, all.length) ?? `Hole stats from ${plural(withHoles.length, 'round')}`} · ${plural(unplacedNines, 'nine-hole round')} left out: which nine wasn’t recorded`
          : holeCoverage(withHoles.length, all.length)
        : null,
      stretch: stretches(fullCards),
      compared: playsCompared(here, elsewhere),
      arc: averageArc(fullCards),
      holesError: holesById == null,
      holeRounds: withHoles.length,
      howItPlays: howItPlays({ name, who: input.who, here, elsewhere, fullCards, withHoles: withHoles.map((r) => holesById!.get(r.id)!), parHoles: withAnyHoles.map((r) => read!.get(r.id)!), scored, stretch: stretches(fullCards) }),
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

/**
 * P-7 6.4: the coach's Message draft, from figures that passed their floors, the first that applies: the costly stretch,
 * then how the course plays, then a plain ask. Only the player's own figures go in. Nothing is sent from the page.
 */
export function coachDraft(h: Pick<ChCourseHistory, 'name' | 'stretch' | 'compared'>): string {
  const lead = `I was looking at your rounds at ${h.name}.`;
  const w = h.stretch.worst;
  if (w) return `${lead} Holes ${w.from} to ${w.from + 2} have cost you about ${formatFixed(w.avg, 1)} a round over your usual there. Want to go through them at practice?`;
  const c = h.compared;
  if (!('needs' in c) && (c.words === 'harder' || c.words === 'easier')) {
    return `${lead} It’s played about ${formatFixed(Math.abs(c.diff), 1)} shots ${c.words} for you than your other courses. Want to talk through a plan for it?`;
  }
  return `${lead} Want to go through them together?`;
}
