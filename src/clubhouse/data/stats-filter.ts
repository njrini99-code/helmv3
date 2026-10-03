import { roundTypeFromDb } from '@/lib/golf/round-type-utils';
import { isUuid } from '@/lib/utils/uuid';

/*
 * The Stats round filter, shared by the team page and the player profile (desktop and phone).
 *
 * Pure (no server-only, no React) so the server parses the address and selects rounds with the very
 * functions the sheet uses to list what can be picked. The state lives in the URL:
 *
 *   window=last10|season|qualifiers   the existing switch (last10 is the default and is left out)
 *   type=tournament,qualifier,practice
 *   holes=9|all                        nine-hole rounds only, or both lengths (eighteen is the default and left out)
 *   from=YYYY-MM-DD&to=YYYY-MM-DD      a custom range; it replaces the window's time
 *   course=<name>                      repeated, exact course names
 *   only=<id,id>  or  skip=<id,id>     "Only these" / "Exclude these" rounds
 *
 * Order of selection: type, holes, course and time first, then the picks, then the last-10 cut. So "Last 10"
 * is the ten newest MATCHING rounds (per player on the team page), "Only these" is exactly the picked
 * rounds among the matching ones (no cut), and "Exclude these" removes them before the cut.
 *
 * Time: Season and Qualifiers are this season (from `seasonStart`); Last 10 is not bounded by the season (Q-122, the legacy
 * app's rule: a player's ten newest rounds, whenever they were played), only by how far back the loader reads (`lastTenFloor`).
 */

export type ChWindow = 'last10' | 'season' | 'qualifiers';

export function parseWindow(v: string | undefined): ChWindow {
  return v === 'season' || v === 'qualifiers' ? v : 'last10';
}

export const ROUND_KINDS = ['tournament', 'qualifier', 'practice'] as const;
export type ChRoundKind = (typeof ROUND_KINDS)[number];

/** The control's words for each kind (the database says "qualifier"). */
export const KIND_LABEL: Record<ChRoundKind, string> = { tournament: 'Tournament', qualifier: 'Qualifying', practice: 'Practice' };
const KIND_WORDS: Record<ChRoundKind, string> = { tournament: 'tournaments', qualifier: 'qualifying rounds', practice: 'practice rounds' };

/** A round's kind, whatever its case: a legacy "qualifying" reads as qualifier, an unknown type as practice (as the Rounds table does), no type as null. */
export function roundKind(roundType: string | null | undefined): ChRoundKind | null {
  const t = roundType?.trim().toLowerCase();
  return t ? roundTypeFromDb(t) : null;
}

/** Which round lengths count: eighteen holes (the default), nine, or both (per-round figures are then per 18, a nine-hole round counting as half). */
export type ChHoles = '18' | '9' | 'all';

/** The fields the filter reads; the server maps a round to this, the sheet lists these. */
export interface ChFilterRow {
  id: string;
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  kind: ChRoundKind | null;
  course: string | null;
  /** 9 or 18 (an unrecorded length is 18). */
  holes: number;
}

export interface ChPick {
  mode: 'only' | 'skip';
  ids: string[];
}

export interface ChFilter {
  window: ChWindow;
  /** Empty is all kinds. Never all three (that is the same as none). */
  types: ChRoundKind[];
  holes: ChHoles;
  from: string | null;
  to: string | null;
  courses: string[];
  pick: ChPick | null;
}

export const PICK_MAX = 100;
export const COURSES_MAX = 20;
const COURSE_NAME_MAX = 120;

export function filterFor(window: ChWindow = 'last10'): ChFilter {
  return { window, types: [], holes: '18', from: null, to: null, courses: [], pick: null };
}

/** True when a filter beyond the window's own three choices is on (the chips row, the count line and the empty state read this). */
export function isFiltered(f: ChFilter): boolean {
  return f.types.length > 0 || f.holes !== '18' || f.from != null || f.to != null || f.courses.length > 0 || f.pick != null;
}

/** Filters cleared; the window stays. */
export function clearFilters(f: ChFilter): ChFilter {
  return filterFor(f.window);
}

/** A YYYY-MM-DD that is a real calendar day, or null. */
export function isoDay(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  const y = d.getUTCFullYear();
  return y >= 2000 && y <= 2100 ? v : null;
}

function normalizeTypes(types: readonly string[]): ChRoundKind[] {
  const set = new Set(types.map((t) => (t === 'qualifying' ? 'qualifier' : t)));
  const out = ROUND_KINDS.filter((k) => set.has(k));
  return out.length === ROUND_KINDS.length ? [] : out;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export function parseHoles(v: string | undefined): ChHoles {
  return v === '9' || v === 'all' ? v : '18';
}

export type ChFilterQuery = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const list = (v: string | string[] | undefined): string[] =>
  (one(v) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * The filter from the address. Anything unusable is dropped, never trusted: a type that is not a kind, a date that is not a
 * calendar day, a round id that is not shaped like one (the loader still checks ids against the rounds it read).
 */
export function parseFilter(q: ChFilterQuery): ChFilter {
  let from = isoDay(one(q.from));
  let to = isoDay(one(q.to));
  if (from && to && from > to) [from, to] = [to, from];
  const courses = uniq(many(q.course).map((c) => c.trim().slice(0, COURSE_NAME_MAX)).filter(Boolean)).slice(0, COURSES_MAX);
  const only = uniq(list(q.only).filter(isUuid)).slice(0, PICK_MAX);
  const skip = uniq(list(q.skip).filter(isUuid)).slice(0, PICK_MAX);
  return {
    window: parseWindow(one(q.window)),
    types: normalizeTypes(list(q.type)),
    holes: parseHoles(one(q.holes)),
    from,
    to,
    courses,
    pick: only.length ? { mode: 'only', ids: only } : skip.length ? { mode: 'skip', ids: skip } : null,
  };
}

/** The address for a filter, with the page's own player and tab. Defaults are left out. */
export function statsHref(base: string, f: ChFilter, extra: { player?: string | null; tab?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (extra.player) q.set('player', extra.player);
  if (extra.tab) q.set('tab', extra.tab);
  if (f.window !== 'last10') q.set('window', f.window);
  if (f.types.length) q.set('type', f.types.join(','));
  if (f.holes !== '18') q.set('holes', f.holes);
  if (f.from) q.set('from', f.from);
  if (f.to) q.set('to', f.to);
  for (const c of f.courses) q.append('course', c);
  if (f.pick) q.set(f.pick.mode, f.pick.ids.join(','));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Choosing a window: its time replaces any custom range, and Qualifiers is itself a kind, so it clears the kinds. */
export function withWindow(f: ChFilter, window: ChWindow): ChFilter {
  return { ...f, window, from: null, to: null, types: window === 'qualifiers' ? [] : f.types };
}

/** Choosing kinds while on Qualifiers moves to Season (the window and the kind would otherwise contradict). */
export function withTypes(f: ChFilter, types: readonly ChRoundKind[]): ChFilter {
  const t = normalizeTypes(types);
  return { ...f, types: t, window: f.window === 'qualifiers' && t.length ? 'season' : f.window };
}

export function withHoles(f: ChFilter, holes: ChHoles): ChFilter {
  return { ...f, holes };
}

export function withRange(f: ChFilter, from: string | null, to: string | null): ChFilter {
  let a = isoDay(from);
  let b = isoDay(to);
  if (a && b && a > b) [a, b] = [b, a];
  return { ...f, from: a, to: b };
}

export function withCourses(f: ChFilter, courses: readonly string[]): ChFilter {
  return { ...f, courses: uniq(courses.map((c) => c.trim()).filter(Boolean)).slice(0, COURSES_MAX) };
}

export function withPick(f: ChFilter, pick: ChPick | null): ChFilter {
  const ids = pick ? uniq(pick.ids).slice(0, PICK_MAX) : [];
  return { ...f, pick: pick && ids.length ? { mode: pick.mode, ids } : null };
}

export function sameFilter(a: ChFilter, b: ChFilter): boolean {
  return statsHref('', a) === statsHref('', b);
}

/** The change is the window switch alone (a filter change says so differently while loading or offline). */
export function isWindowChange(from: ChFilter, to: ChFilter): boolean {
  return to.window !== from.window && sameFilter(withWindow(from, to.window), to);
}

/** A custom range is on: it is the time, and the window's own cut does not apply. */
export function hasRange(f: ChFilter): boolean {
  return f.from != null || f.to != null;
}

/** The window's "newest ten" cut applies (no custom range replacing it). */
export function cutsToLast10(f: ChFilter): boolean {
  return f.window === 'last10' && !hasRange(f);
}

/** There is an earlier ten to set this one against: only the newest-ten cut has one, and "Only these" has none. */
export function hasPrevious(f: ChFilter): boolean {
  return cutsToLast10(f) && f.pick?.mode !== 'only';
}

/** What the change-against-previous logic should treat the filter as: last10 only when a previous ten exists. */
export function effectiveWindow(f: ChFilter): ChWindow {
  return hasPrevious(f) ? 'last10' : f.window === 'last10' ? 'season' : f.window;
}

/**
 * Does a round match the filter's type, course and time (not yet the picks or the cut)? `seasonStart` bounds Season and Qualifiers;
 * Last 10 reaches back across seasons and a custom range is its own time (Q-122).
 */
export function matchesFilter(row: ChFilterRow, f: ChFilter, seasonStart: string): boolean {
  if (f.types.length && (!row.kind || !f.types.includes(row.kind))) return false;
  if (f.holes !== 'all' && row.holes !== Number(f.holes)) return false;
  if (f.courses.length && (!row.course || !f.courses.includes(row.course))) return false;
  if (hasRange(f)) {
    if (f.from && row.date < f.from) return false;
    if (f.to && row.date > f.to) return false;
    return true;
  }
  if (f.window === 'last10') return true;
  if (row.date < seasonStart) return false;
  return f.window !== 'qualifiers' || row.kind === 'qualifier';
}

/** The rounds that match, minus the excluded ones: what "last 10" cuts and what the picks choose among. */
export function candidates<T>(rows: T[], f: ChFilter, seasonStart: string, toRow: (t: T) => ChFilterRow): T[] {
  const skip = f.pick?.mode === 'skip' ? new Set(f.pick.ids) : null;
  return rows.filter((t) => {
    const r = toRow(t);
    return matchesFilter(r, f, seasonStart) && !skip?.has(r.id);
  });
}

/** The filter's rounds, newest first in and out: type, course and time, the picks, then the newest-ten cut. */
export function selectRounds<T>(rows: T[], f: ChFilter, seasonStart: string, toRow: (t: T) => ChFilterRow): T[] {
  const list = candidates(rows, f, seasonStart, toRow);
  if (f.pick?.mode === 'only') {
    const ids = new Set(f.pick.ids);
    return list.filter((t) => ids.has(toRow(t).id));
  }
  return cutsToLast10(f) ? list.slice(0, 10) : list;
}

/** The rounds in whole rounds: a nine-hole round is half (the floors count these, not the rows). */
export function wholeRounds<T>(rows: T[], toRow: (t: T) => ChFilterRow): number {
  return rows.reduce((a, t) => a + toRow(t).holes / 18, 0);
}

/**
 * Would choosing Both show a 9-hole round in this window (its time, type and course)? It is the test for the "9-hole rounds are here"
 * hint, and it keeps a team whose only rounds this season are 9-hole ones out of the first-run page (D-71 counts rounds of either length).
 */
export function nineRoundsInWindow(f: ChFilter, options: { rounds: ChFilterRow[]; seasonStart: string }): boolean {
  return candidates(options.rounds, withHoles(f, 'all'), options.seasonStart, (r) => r).some((r) => r.holes === 9);
}

/** The ten matching rounds before the newest ten, for "vs. previous 10" (across seasons, as the newest ten are); null with no previous window or fewer than three whole rounds. */
export function previousRounds<T>(rows: T[], f: ChFilter, seasonStart: string, toRow: (t: T) => ChFilterRow): T[] | null {
  if (!hasPrevious(f)) return null;
  const prev = candidates(rows, f, seasonStart, toRow).slice(10, 20);
  return wholeRounds(prev, toRow) >= 3 ? prev : null;
}

/** How many matching rounds come before the newest ten (the "no earlier rounds" wording). */
export function earlierCount<T>(rows: T[], f: ChFilter, seasonStart: string, toRow: (t: T) => ChFilterRow): number {
  return hasPrevious(f) ? Math.max(0, candidates(rows, f, seasonStart, toRow).length - 10) : 0;
}

// ---- words: the chips and the count line ----

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 1", or "Sep 1, 2025" when the year is not the current one. */
export function dayLabel(iso: string, withYear: boolean): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}

/** "Sep 1 to Sep 29", "from Sep 1" or "through Sep 29"; years appear when the range is not wholly in the current year. */
export function rangeLabel(from: string | null, to: string | null, year: number): string {
  const y = String(year);
  const withYear = !!((from && !from.startsWith(y)) || (to && !to.startsWith(y)));
  if (from && to) return `${dayLabel(from, withYear)} to ${dayLabel(to, withYear)}`;
  if (from) return `from ${dayLabel(from, withYear)}`;
  return `through ${dayLabel(to as string, withYear)}`;
}

const WINDOW_PART: Record<ChWindow, string> = { last10: 'last 10', season: 'this season', qualifiers: 'qualifying, this season' };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const HOLES_WORDS: Record<ChHoles, string> = { '18': '18-hole rounds', '9': '9-hole rounds', all: '18- and 9-hole rounds' };
/** The rounds' length in a clause ("18-hole", "9-hole", "18- and 9-hole"), for a heading. */
export const HOLES_ADJ: Record<ChHoles, string> = { '18': '18-hole', '9': '9-hole', all: '18- and 9-hole' };
/** Said under the figures whenever nine-hole rounds are in: how a nine-hole round counts. */
export const PER_18_NOTE = 'Per-round figures are per 18 holes: a 9-hole round counts as half a round.';

/** What the filter selects, in words and without the count: ["tournaments", "Sep 1 to Sep 29"]. */
function filterParts(f: ChFilter, year: number): string[] {
  const parts: string[] = [];
  if (f.types.length) parts.push(f.types.map((k) => KIND_WORDS[k]).join(' and '));
  if (f.holes !== '18') parts.push(HOLES_WORDS[f.holes]);
  if (f.courses.length) parts.push(f.courses.length === 1 ? `at ${f.courses[0]}` : `at ${f.courses.length} courses`);
  parts.push(hasRange(f) ? rangeLabel(f.from, f.to, year) : WINDOW_PART[f.window]);
  if (f.pick?.mode === 'skip') parts.push(`without ${plural(f.pick.ids.length, 'round', 'rounds')}`);
  return parts;
}

/** The count line: "12 rounds: tournaments, Sep 1 to Sep 29". */
export function filterSummary(f: ChFilter, count: number, year = new Date().getUTCFullYear()): string {
  if (f.pick?.mode === 'only') return `${count} picked ${count === 1 ? 'round' : 'rounds'}`;
  return `${plural(count, 'round', 'rounds')}: ${filterParts(f, year).join(', ')}`;
}

const BASIS: Record<ChWindow, string> = { last10: 'Last 10 rounds', season: 'This season', qualifiers: 'Qualifier rounds' };

/** The noun phrase under a figure that says which rounds it counts: the window's own label, or what the filter selects ("Tournaments, Sep 1 to Sep 29"). */
export function basisWords(f: ChFilter, year = new Date().getUTCFullYear()): string {
  if (!isFiltered(f)) return BASIS[f.window];
  if (f.pick?.mode === 'only') return 'Picked rounds';
  const s = filterParts(f, year).join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface ChFilterChip {
  key: string;
  label: string;
  /** The filter with just this piece taken off. */
  next: ChFilter;
}

/** One removable chip per active filter; the window is the switch's, not a chip. */
export function filterChips(f: ChFilter, year = new Date().getUTCFullYear()): ChFilterChip[] {
  const chips: ChFilterChip[] = [];
  for (const k of f.types) chips.push({ key: `type:${k}`, label: KIND_LABEL[k], next: withTypes(f, f.types.filter((x) => x !== k)) });
  if (f.holes !== '18') chips.push({ key: 'holes', label: f.holes === '9' ? '9 holes' : '18 and 9 holes', next: withHoles(f, '18') });
  for (const c of f.courses) chips.push({ key: `course:${c}`, label: c, next: withCourses(f, f.courses.filter((x) => x !== c)) });
  if (hasRange(f)) chips.push({ key: 'range', label: rangeLabel(f.from, f.to, year), next: withRange(f, null, null) });
  if (f.pick) {
    const n = f.pick.ids.length;
    chips.push({ key: 'pick', label: `${f.pick.mode === 'only' ? 'Only' : 'Without'} ${plural(n, 'round', 'rounds')}`, next: withPick(f, null) });
  }
  return chips;
}

// ---- what the sheet can list ----

/** One round in the sheet's pick list (every loaded round of the page, of either length, newest first). */
export interface ChPickRound extends ChFilterRow {
  score: number;
  /** The player's name on the team page; null on a profile. */
  player: string | null;
}

export interface ChFilterOptions {
  /** The newest `PICK_LIST_MAX` rounds the page has loaded. */
  rounds: ChPickRound[];
  /** How many rounds the page has loaded (more than `rounds` when the list is cut). */
  total: number;
  courses: Array<{ name: string; count: number }>;
  /** The first day of the season: Season and Qualifiers start here (Last 10 reaches back past it, and so does a range). */
  seasonStart: string;
}

export const PICK_LIST_MAX = 200;

/** A count of whole rounds in words: "3", "2.5". */
export function roundsWord(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** A figure of a round, shown per 18 holes (a nine-hole score doubled). */
export function per18(value: number, holes: number | null): number {
  return (value * 18) / (holes ?? 18);
}
