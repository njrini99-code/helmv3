import { pluralWord } from '../../lib/plural';
import type { ChPlayerProfile } from '../../data/stats-player';
import { isFiltered, basisWords, type ChFilter } from '../../data/stats-filter';
import { changeTone as changeInk, formatFixed, formatSigned } from '../../lib/format';
import { deltaTone, halvesChange, mean } from '../../lib/stats-signal';
import { trendRounds } from './round-trend';
import type { StatsPlayerDetailId } from './detail-route';

/**
 * The phone Stats redesign's figures, pure (stats-home 03). One source per figure: a glance tile, a part card and a detail hero all
 * read `data.stats`, so they never disagree (08 criterion 87). Tour text exists only for a key `bench` holds (criterion 88).
 */
export type ShsTone = 'gain' | 'loss' | 'flat';

/** "Last 10 rounds", "This season", "Qualifiers"; a filter says its own words. */
export function windowLabel(f: ChFilter): string {
  if (isFiltered(f)) return basisWords(f);
  if (f.span === 'all') return 'All time';
  if (f.window === 'last10') return `Last ${f.last} rounds`;
  return f.window === 'season' ? 'This season' : 'Qualifiers';
}

export function windowShort(f: ChFilter): string {
  if (isFiltered(f)) return 'Filtered';
  if (f.span === 'all') return 'All time';
  if (f.window === 'last10') return `Last ${f.last}`;
  return f.window === 'season' ? 'Season' : 'Qualifiers';
}

/** One string per window and filter: a change of it is a window change, and nothing else is. */
export const filterKey = (f: ChFilter): string => JSON.stringify(f);

/** A strokes gained value's tone: flat inside ±0.05, and flat throughout under three rounds (criterion 21, 91). */
export const sgTone = (v: number | null | undefined, ready = true): ShsTone => {
  const ink = ready ? changeInk(v, false) : '';
  return ink === 'is-gain' ? 'gain' : ink === 'is-loss' ? 'loss' : 'flat';
};

/** A change's tone, grey until it clears its error (`deltaTone`). */
export function changeTone(delta: number | null | undefined, se: number | null | undefined, lowerIsBetter: boolean): ShsTone {
  const t = deltaTone(delta, se, lowerIsBetter);
  return t === 'is-gain' ? 'gain' : t === 'is-loss' ? 'loss' : 'flat';
}

/** Strokes gained is ready from three rounds with shots. */
export const sgReady = (data: Pick<ChPlayerProfile, 'win'>): boolean => data.win.sgPerRound != null;

export const SG_WAIT = 'Strokes gained shows from 3 rounds';

const pct = (v: number | null | undefined): string | null => (v == null || Number.isNaN(v) ? null : `${Math.round(v)}`);

export interface ShsKeyFigure {
  value: string | null;
  unit: string;
  /** "Greens in regulation". */
  label: string;
  /** "Tour 66%", only with a loaded standard. */
  tour: string | null;
  /** 0 to 100 on the bench rail, and the Tour's place on it; null with no Tour value. */
  rail: { you: number; tour: number; tone: ShsTone } | null;
}

/** The figure each part leads with, its summary card and its hero both. */
export function keyFigure(data: ChPlayerProfile, part: 'tee' | 'approach' | 'short' | 'putting'): ShsKeyFigure {
  const s = data.stats;
  if (part === 'tee') return { value: pct(s?.fairwayPercentage), unit: '%', label: 'Fairways hit', tour: null, rail: null };
  if (part === 'approach') {
    const you = s?.girPercentage ?? null;
    const tour = data.bench.gir_pct ?? null;
    return {
      value: pct(you),
      unit: '%',
      label: 'Greens in regulation',
      tour: tour == null ? null : `Tour ${Math.round(tour)}%`,
      rail: you == null || tour == null ? null : { you: Math.max(0, Math.min(100, you)), tour, tone: you >= tour ? 'gain' : 'loss' },
    };
  }
  if (part === 'short') return { value: pct(s?.scramblingPercentage), unit: '%', label: 'Scrambling', tour: null, rail: null };
  return { value: s?.puttsPerRound == null ? null : formatFixed(s.puttsPerRound), unit: '', label: 'Putts / round', tour: null, rail: null };
}

export interface ShsGlance {
  label: string;
  go: StatsPlayerDetailId;
  value: string | null;
  unit: string;
  meta: string;
}

/** The six tiles, in the page's order, and what each opens (criterion 69). */
export function glanceTiles(data: ChPlayerProfile): ShsGlance[] {
  const s = data.stats;
  const gir = keyFigure(data, 'approach');
  return [
    { label: 'Greens', go: 'approach', value: gir.value, unit: '%', meta: gir.tour ?? 'Greens hit' },
    { label: 'Fairways', go: 'tee', value: pct(s?.fairwayPercentage), unit: '%', meta: 'Par 4s and 5s' },
    { label: 'Scrambling', go: 'short', value: pct(s?.scramblingPercentage), unit: '%', meta: 'Up and down' },
    { label: 'Putts', go: 'putting', value: s?.puttsPerRound == null ? null : formatFixed(s.puttsPerRound), unit: '', meta: 'a round' },
    { label: 'Birdies', go: 'scoring', value: s?.birdiesPerRound == null ? null : formatFixed(s.birdiesPerRound), unit: '', meta: 'a round' },
    { label: 'Bogeys', go: 'scoring', value: s?.bogeysPerRound == null ? null : formatFixed(s.bogeysPerRound), unit: '', meta: 'a round' },
  ];
}

/** The comparison uses "the N before" only for Last 5 and Last 10; every other window compares its own halves and says so (criterion 90). */
export function hasPrevious(data: Pick<ChPlayerProfile, 'filter' | 'extra'>): boolean {
  return data.filter.window === 'last10' && !isFiltered(data.filter) && (data.filter.last === 5 || data.filter.last === 10) && data.extra.compare != null;
}

export interface ShsChange {
  /** The chip's figure ("4.3 lower"), or null with nothing to say. */
  chip: string | null;
  tone: ShsTone;
  direction: 'down' | 'up' | 'flat';
  /** "than the 10 before", "newest 5 vs first 5", or "3 rounds so far. A change shows from 4." */
  words: string;
}

/**
 * A scoring change as the chip tells it, by the one rule Home and the Islands hero use (`deltaTone`, `deltaWords`): an arrow and "lower than"
 * only once the change clears its standard error; under it the signed number, no arrow, and "No clear change" (owner's preview, 11 Nov 2026,
 * W27: Home said "−0.8 No clear change vs previous 10" while Stats said "↓ 0.8 lower than the 10 before" for the same figure).
 * `than` follows a clear change ("than the 10 before"); `vs` follows "No clear change" ("vs previous 10").
 */
export function scoreChangeChip(delta: number, se: number | null | undefined, lowerIsBetter: boolean, words: { than: string; vs: string }, digits = 1): ShsChange {
  const tone = changeTone(delta, se, lowerIsBetter);
  if (tone === 'flat') return { chip: formatSigned(delta, digits), tone, direction: 'flat', words: `No clear change ${words.vs}` };
  return { chip: `${formatFixed(Math.abs(delta), digits)} ${delta < 0 ? 'lower' : 'higher'}`, tone, direction: delta < 0 ? 'down' : 'up', words: words.than };
}

function scores(data: ChPlayerProfile): number[] {
  return trendRounds(data.rounds, 'score')
    .map((r) => r.value)
    .filter((v): v is number => v != null);
}

/** The scoring average's change, for the feature card and the Scoring hero. */
export function scoringChange(data: ChPlayerProfile): ShsChange {
  const list = scores(data);
  if (list.length < 4) return { chip: null, tone: 'flat', direction: 'flat', words: `${list.length} ${pluralWord(list.length, 'round', 'rounds')} so far. A change shows from 4.` };
  if (hasPrevious(data)) {
    const row = data.extra.compare!.rows.find((r) => r.lowerIsBetter && /scor/i.test(r.label));
    if (row?.last != null && row.previous != null) {
      const n = data.extra.compare!.previousRounds;
      return scoreChangeChip(row.last - row.previous, row.se, true, { than: `than the ${n} before`, vs: `vs previous ${n}` });
    }
  }
  const halves = halvesChange(list, 'score');
  const half = Math.floor(list.length / 2);
  if (!halves) return { chip: null, tone: 'flat', direction: 'flat', words: '' };
  return scoreChangeChip(halves.delta, halves.se, true, { than: `newest ${half} vs first ${half}`, vs: `· newest ${half} vs first ${half}` });
}

export interface ShsCompareBar {
  /** The one measure both bars show ("Putts per round"), named above them. */
  measure: string;
  label: string;
  value: number;
  /** Width, 0 to 100: 30% plus 70% of the scaled value (04 "What changed"). */
  width: number;
  tone: ShsTone | 'was';
  /** '%' when the bars compare a rate (the sentence named fairways, greens...). */
  unit?: string;
}

/** The two bars under What changed, with a real pair only; none under four rounds (criterion CP-126). */
export function changeBars(data: ChPlayerProfile, subject?: string): ShsCompareBar[] {
  const list = scores(data);
  if (list.length < 4) return [];
  const pair = (measure: string, nowLabel: string, now: number, wasLabel: string, was: number, tone: ShsTone, unit = ''): ShsCompareBar[] => {
    // A rate's bars share a 0 floor; a score's start 6 strokes under the lower one, so a stroke still reads.
    const lo = unit === '%' ? 0 : Math.min(now, was) - 6;
    const hi = Math.max(now, was);
    const width = (v: number) => 30 + (70 * (v - lo)) / (hi - lo || 1);
    return [
      { measure, label: nowLabel, value: now, width: width(now), tone, unit },
      { measure, label: wasLabel, value: was, width: width(was), tone: 'was', unit },
    ];
  };
  if (hasPrevious(data)) {
    const c = data.extra.compare!;
    // The bars show what the sentence above them names (its largest change), and scoring when it names nothing.
    const named = subject ? c.rows.find((r) => r.label === subject) : undefined;
    const row = named ?? c.rows.find((r) => r.lowerIsBetter && /scor/i.test(r.label));
    if (row?.last != null && row.previous != null) return pair(row.label, `Last ${c.lastRounds}`, row.last, `${c.previousRounds} before`, row.previous, changeTone(row.last - row.previous, row.se, row.lowerIsBetter), row.unit ?? '');
  }
  const half = Math.floor(list.length / 2);
  const first = mean(list.slice(0, half));
  const newest = mean(list.slice(list.length - half));
  const halves = halvesChange(list, 'score');
  if (first == null || newest == null) return [];
  return pair('Scoring avg', `Newest ${half}`, newest, `First ${half}`, first, changeTone(halves?.delta, halves?.se, true));
}

/** "Strongest: Off the tee. Biggest leak: Approach, 1.2 a round." */
export function strongestAndLeak(rows: ReadonlyArray<{ label: string; value: number | null }>): { strongest: string; leak: { label: string; value: number } | null } | null {
  const known = rows.filter((r): r is { label: string; value: number } => r.value != null);
  if (!known.length) return null;
  const best = known.reduce((a, b) => (b.value > a.value ? b : a));
  const losing = known.filter((r) => r.value < -0.05).sort((a, b) => a.value - b.value);
  return { strongest: best.label, leak: losing[0] ?? null };
}

/** Rail and bar geometry for a diverging row: the bar's left and width in percent, from the centre zero. */
export function divergeBar(value: number, scale: number): { left: number; width: number } {
  const half = Math.min(1, Math.abs(value) / scale) * 50;
  return { left: value >= 0 ? 50 : 50 - half, width: half };
}

/** Where a value sits on a rail centred on zero. */
export const divergeAt = (value: number, scale: number): number => 50 + Math.max(-1, Math.min(1, value / scale)) * 50;

/** The page's monotone curve, so a line never overshoots a round's own figure. */
export function monoPath(pts: ReadonlyArray<readonly [number, number]>): string {
  const n = pts.length;
  if (n < 2) return '';
  if (n === 2) return `M${pts[0]![0]},${pts[0]![1]}L${pts[1]![0]},${pts[1]![1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  const t: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1]![0] - pts[i]![0];
    m[i] = dx[i]! === 0 ? 0 : (pts[i + 1]![1] - pts[i]![1]) / dx[i]!;
  }
  t[0] = m[0]!;
  t[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i]! / m[i]!;
    const b = t[i + 1]! / m[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i]!;
      t[i + 1] = k * b * m[i]!;
    }
  }
  let d = `M${formatFixed(pts[0]![0], 1)},${formatFixed(pts[0]![1], 1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3;
    d += `C${formatFixed((pts[i]![0] + h), 1)},${formatFixed((pts[i]![1] + t[i]! * h), 1)} ${formatFixed((pts[i + 1]![0] - h), 1)},${formatFixed((pts[i + 1]![1] - t[i + 1]! * h), 1)} ${formatFixed(pts[i + 1]![0], 1)},${formatFixed(pts[i + 1]![1], 1)}`;
  }
  return d;
}

/** Straight segments through the points: a chart of round days draws no value between two days that never happened (W26). */
export function straightPath(pts: ReadonlyArray<readonly [number, number]>): string {
  return pts.length < 2 ? '' : pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('');
}

/**
 * Which round days the team's line joins (W26, owner's preview, 11 Nov 2026: the line's low point was one player's single 87,
 * drawn as the team's worst day). A day one player posted on is a hollow dot off the line; the line joins the days two or more
 * posted on, unless fewer than two such days exist, when it joins them all. A day with no count is read as a team day.
 */
export function teamLineDays(days: ReadonlyArray<{ n?: number }>): { line: number[]; one: Set<number> } {
  const one = new Set(days.flatMap((d, i) => (d.n === 1 ? [i] : [])));
  const team = days.flatMap((_, i) => (one.has(i) ? [] : [i]));
  return team.length >= 2 ? { line: team, one } : { line: days.map((_, i) => i), one: new Set() };
}
