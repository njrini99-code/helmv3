import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import {
  basisWords,
  candidates,
  clearFilters,
  cutsToLast10,
  dayLabel,
  earlierCount,
  effectiveWindow,
  filterChips,
  filterFor,
  filterSummary,
  hasPrevious,
  isFiltered,
  isoDay,
  matchesFilter,
  parseFilter,
  parseHoles,
  per18,
  previousRounds,
  rangeLabel,
  roundKind,
  sameFilter,
  selectRounds,
  statsHref,
  withCourses,
  withHoles,
  withPick,
  withRange,
  withTypes,
  withWindow,
  wholeRounds,
  HOLES_ADJ,
  PER_18_NOTE,
  PICK_MAX,
  type ChFilter,
  type ChFilterRow,
} from '../data/stats-filter';

/** Stats round filter: the address, the order rounds are selected in, and the words for the chips. */

const SEASON = '2026-08-01';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Rows newest first: r1 is the newest. `kinds` cycles; dates step back a day each. */
function rows(n: number, kinds: Array<ChFilterRow['kind']> = ['tournament'], course = 'Pine Hollow', holes = 18): ChFilterRow[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 29 - i, 12));
    return { id: uuid(i + 1), date: d.toISOString().slice(0, 10), kind: kinds[i % kinds.length] ?? null, course, holes };
  });
}
const pick = (f: ChFilter, xs: ChFilterRow[]) => selectRounds(xs, f, SEASON, (r) => r);
const ids = (xs: ChFilterRow[]) => xs.map((r) => r.id);

describe('stats filter · the address', () => {
  it('has no filter by default and leaves defaults out of the address', () => {
    expect(parseFilter({})).toEqual(filterFor('last10'));
    expect(isFiltered(filterFor('last10'))).toBe(false);
    expect(statsHref('/golf/dashboard/stats', filterFor('last10'))).toBe('/golf/dashboard/stats');
    expect(statsHref('/golf/dashboard/stats', filterFor('season'), { player: 'p1', tab: 'rounds' })).toBe('/golf/dashboard/stats?player=p1&tab=rounds&window=season');
  });

  it('reads the window, both qualifier spellings, and drops a type that is not a kind', () => {
    expect(parseFilter({ window: 'qualifiers' }).window).toBe('qualifiers');
    expect(parseFilter({ window: 'nonsense' }).window).toBe('last10');
    expect(parseFilter({ type: 'qualifying,practice,bogus' }).types).toEqual(['qualifier', 'practice']);
    // Every kind chosen is the same as none.
    expect(parseFilter({ type: 'practice,tournament,qualifier' }).types).toEqual([]);
    // Kinds come back in the control's order, whatever order they were written in.
    expect(parseFilter({ type: 'practice,tournament' }).types).toEqual(['tournament', 'practice']);
  });

  it('keeps only real calendar days and puts a reversed range the right way round', () => {
    expect(isoDay('2026-09-01')).toBe('2026-09-01');
    expect(isoDay('2026-02-30')).toBeNull();
    expect(isoDay('2026-13-01')).toBeNull();
    expect(isoDay('9/1/2026')).toBeNull();
    expect(isoDay('1999-01-01')).toBeNull();
    expect(parseFilter({ from: '2026-09-29', to: '2026-09-01' })).toMatchObject({ from: '2026-09-01', to: '2026-09-29' });
    expect(parseFilter({ from: 'nope', to: '2026-09-01' })).toMatchObject({ from: null, to: '2026-09-01' });
  });

  it('takes repeated course names exactly, trimmed, unique and capped', () => {
    expect(parseFilter({ course: ['Pine Hollow', ' Pine Hollow ', 'Oak Ridge, North', ''] }).courses).toEqual(['Pine Hollow', 'Oak Ridge, North']);
    expect(parseFilter({ course: 'x'.repeat(300) }).courses[0]).toHaveLength(120);
    expect(parseFilter({ course: Array.from({ length: 40 }, (_, i) => `c${i}`) }).courses).toHaveLength(20);
  });

  it('keeps only round ids shaped like ids, and "only" wins over "skip"', () => {
    expect(parseFilter({ only: `${uuid(1)},not-an-id,${uuid(2)},${uuid(1)}` }).pick).toEqual({ mode: 'only', ids: [uuid(1), uuid(2)] });
    expect(parseFilter({ skip: `${uuid(3)}` }).pick).toEqual({ mode: 'skip', ids: [uuid(3)] });
    expect(parseFilter({ only: uuid(1), skip: uuid(2) }).pick).toEqual({ mode: 'only', ids: [uuid(1)] });
    expect(parseFilter({ only: "1'; drop table golf_rounds;--" }).pick).toBeNull();
    const many = Array.from({ length: PICK_MAX + 25 }, (_, i) => uuid(i + 1)).join(',');
    expect(parseFilter({ only: many }).pick?.ids).toHaveLength(PICK_MAX);
  });

  it('round-trips through the address, course names with commas included', () => {
    const f: ChFilter = {
      window: 'season',
      types: ['tournament', 'qualifier'],
      holes: 'all',
      from: '2026-09-01',
      to: '2026-09-29',
      courses: ['Oak Ridge, North', 'Pine Hollow'],
      pick: { mode: 'skip', ids: [uuid(4), uuid(5)] },
    };
    const href = statsHref('/golf/dashboard/stats', f, { player: uuid(9) });
    const back = parseFilter(Object.fromEntries([...new URL(href, 'https://x.test').searchParams].reduce<Map<string, string | string[]>>((m, [k, v]) => {
      const cur = m.get(k);
      m.set(k, cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v]);
      return m;
    }, new Map())));
    expect(back).toEqual(f);
    expect(sameFilter(back, f)).toBe(true);
  });

  it('every kind of filter counts as one, a pick included (the chips row, the count line and the empty state read this)', () => {
    expect(isFiltered(filterFor('season'))).toBe(false);
    expect(isFiltered(withTypes(filterFor(), ['practice']))).toBe(true);
    expect(isFiltered(withCourses(filterFor(), ['Pine Hollow']))).toBe(true);
    expect(isFiltered(withRange(filterFor(), '2026-09-01', null))).toBe(true);
    expect(isFiltered(withRange(filterFor(), null, '2026-09-01'))).toBe(true);
    expect(isFiltered(withPick(filterFor(), { mode: 'skip', ids: [uuid(1)] }))).toBe(true);
    expect(isFiltered(withPick(filterFor(), { mode: 'only', ids: [uuid(1)] }))).toBe(true);
  });

  it('clears the filters and keeps the window', () => {
    const f = withCourses(withTypes(filterFor('season'), ['practice']), ['Pine Hollow']);
    expect(isFiltered(f)).toBe(true);
    expect(clearFilters(f)).toEqual(filterFor('season'));
  });
});

describe('stats filter · choosing', () => {
  it('Qualifiers is a kind: choosing it clears the kinds, and choosing a kind leaves it for Season', () => {
    expect(withWindow(withTypes(filterFor('last10'), ['practice']), 'qualifiers')).toMatchObject({ window: 'qualifiers', types: [] });
    expect(withTypes(filterFor('qualifiers'), ['tournament'])).toMatchObject({ window: 'season', types: ['tournament'] });
    // Choosing no kind on Qualifiers stays there.
    expect(withTypes(filterFor('qualifiers'), [])).toMatchObject({ window: 'qualifiers' });
  });

  it('a window replaces a custom range, and a range replaces the window', () => {
    const r = withRange(filterFor('season'), '2026-09-01', '2026-09-29');
    expect(r).toMatchObject({ window: 'season', from: '2026-09-01', to: '2026-09-29' });
    expect(withWindow(r, 'last10')).toMatchObject({ window: 'last10', from: null, to: null });
    expect(withRange(filterFor(), '2026-09-29', '2026-09-01')).toMatchObject({ from: '2026-09-01', to: '2026-09-29' });
  });

  it('a pick with no rounds is no pick', () => {
    expect(withPick(filterFor(), { mode: 'only', ids: [] }).pick).toBeNull();
    expect(withPick(filterFor(), { mode: 'skip', ids: [uuid(1), uuid(1)] }).pick).toEqual({ mode: 'skip', ids: [uuid(1)] });
  });
});

describe('stats filter · which rounds', () => {
  it('reads both qualifier spellings and no type as no kind', () => {
    expect(roundKind('qualifying')).toBe('qualifier');
    expect(roundKind('qualifier')).toBe('qualifier');
    expect(roundKind('tournament')).toBe('tournament');
    expect(roundKind('Qualifier')).toBe('qualifier');
    expect(roundKind(' TOURNAMENT ')).toBe('tournament');
    expect(roundKind('casual')).toBe('practice');
    expect(roundKind(null)).toBeNull();
    expect(roundKind('')).toBeNull();
  });

  it('cuts the newest ten AFTER the type: Last 10 is the ten newest matching rounds', () => {
    // Twenty-four rounds, tournaments and practice alternating, newest first.
    const xs = rows(24, ['practice', 'tournament']);
    const f = withTypes(filterFor('last10'), ['tournament']);
    const got = pick(f, xs);
    expect(got).toHaveLength(10);
    expect(got.every((r) => r.kind === 'tournament')).toBe(true);
    // The newest tournament is r2; the tenth is r20. A cut made before the type would give five.
    expect(ids(got)[0]).toBe(uuid(2));
    expect(ids(got)[9]).toBe(uuid(20));
  });

  it('puts the season as the start of Season and Qualifiers, but Last 10 and a custom range reach past it', () => {
    const xs: ChFilterRow[] = [
      { id: uuid(1), date: '2026-09-20', kind: 'tournament', course: 'A', holes: 18 },
      { id: uuid(2), date: '2026-08-01', kind: 'tournament', course: 'A', holes: 18 },
      { id: uuid(3), date: '2026-07-31', kind: 'tournament', course: 'A', holes: 18 },
      { id: uuid(4), date: '2026-04-10', kind: 'practice', course: 'A', holes: 18 },
    ];
    expect(ids(pick(filterFor('season'), xs))).toEqual([uuid(1), uuid(2)]);
    // Q-122: Last 10 is the ten newest rounds in any season (the legacy app's rule), not this season's ten.
    expect(ids(pick(filterFor('last10'), xs))).toEqual([uuid(1), uuid(2), uuid(3), uuid(4)]);
    expect(ids(pick(withRange(filterFor(), '2026-04-01', '2026-07-31'), xs))).toEqual([uuid(3), uuid(4)]);
    // An open start reads everything up to the end; an open end, everything from the start (both ends are inclusive).
    expect(ids(pick(withRange(filterFor(), null, '2026-08-01'), xs))).toEqual([uuid(2), uuid(3), uuid(4)]);
    expect(ids(pick(withRange(filterFor(), '2026-08-01', null), xs))).toEqual([uuid(1), uuid(2)]);
  });

  it('a custom range is the time: the newest-ten cut does not apply', () => {
    const xs = rows(25, ['tournament']);
    expect(pick(withRange(filterFor('last10'), '2026-09-01', '2026-09-29'), xs)).toHaveLength(25);
    expect(cutsToLast10(withRange(filterFor('last10'), '2026-09-01', null))).toBe(false);
    expect(cutsToLast10(filterFor('last10'))).toBe(true);
    expect(cutsToLast10(filterFor('season'))).toBe(false);
  });

  it('the Qualifiers window is the qualifying rounds; a contradicting kind in the address leaves nothing', () => {
    const xs = rows(6, ['qualifier', 'tournament', 'practice']);
    expect(pick(filterFor('qualifiers'), xs).map((r) => r.kind)).toEqual(['qualifier', 'qualifier']);
    expect(pick({ ...filterFor('qualifiers'), types: ['tournament'] }, xs)).toEqual([]);
  });

  it('matches on the exact course and never a round with no course', () => {
    const xs = [...rows(2, ['tournament'], 'Pine Hollow'), { id: uuid(9), date: '2026-09-01', kind: 'tournament' as const, course: null, holes: 18 }];
    const f = withCourses(filterFor('season'), ['Pine Hollow']);
    expect(pick(f, xs)).toHaveLength(2);
    expect(matchesFilter(xs[2]!, f, SEASON)).toBe(false);
    expect(matchesFilter({ ...xs[0]!, course: 'pine hollow' }, f, SEASON)).toBe(false);
  });

  it('"Only these" is exactly the picked rounds among the matching ones: no cut, no stranger, no round that fails another filter', () => {
    const xs = rows(30, ['practice', 'tournament']);
    const twelve = xs.filter((_, i) => i % 2 === 1).slice(0, 12); // twelve tournaments, more than the newest-ten cut
    const f = withPick(withTypes(filterFor('last10'), ['tournament']), { mode: 'only', ids: [...ids(twelve), uuid(1), uuid(999)] });
    // uuid(1) is a practice round (fails the type); uuid(999) is not loaded at all.
    expect(ids(pick(f, xs))).toEqual(ids(twelve));
  });

  it('"Exclude these" removes rounds before the cut, so the next round moves up into the ten', () => {
    const xs = rows(14, ['tournament']);
    const f = withPick(filterFor('last10'), { mode: 'skip', ids: [uuid(1), uuid(2)] });
    const got = pick(f, xs);
    expect(got).toHaveLength(10);
    expect(ids(got)[0]).toBe(uuid(3));
    expect(ids(got)[9]).toBe(uuid(12));
    expect(candidates(xs, f, SEASON, (r) => r)).toHaveLength(12);
  });
});

describe('stats filter · the previous ten', () => {
  it('is the ten matching rounds before the newest ten, taken from the same filtered list', () => {
    const xs = rows(40, ['practice', 'tournament']);
    const f = withTypes(filterFor('last10'), ['tournament']);
    const prev = previousRounds(xs, f, SEASON, (r) => r);
    expect(prev).toHaveLength(10);
    expect(prev!.every((r) => r.kind === 'tournament')).toBe(true);
    // The newest ten tournaments end at r20; the previous ten start at r22.
    expect(ids(prev!)[0]).toBe(uuid(22));
  });

  it('Q-122: reaches back across seasons, as the newest ten does; Season stays inside this season', () => {
    // 24 rounds, newest first: the newest 4 are this season (Sep 17-20), the other 20 are the season before (Jun 9-28).
    const xs: ChFilterRow[] = Array.from({ length: 24 }, (_, i) => ({
      id: uuid(i + 1),
      date: i < 4 ? `2026-09-${20 - i}` : `2026-06-${28 - (i - 4)}`,
      kind: 'tournament' as const,
      course: 'A',
      holes: 18,
    }));
    const last10 = filterFor('last10');
    expect(ids(pick(last10, xs))).toEqual(Array.from({ length: 10 }, (_, i) => uuid(i + 1)));
    expect(ids(previousRounds(xs, last10, SEASON, (r) => r)!)).toEqual(Array.from({ length: 10 }, (_, i) => uuid(i + 11)));
    expect(earlierCount(xs, last10, SEASON, (r) => r)).toBe(14);
    // Season is this season only, and has no previous ten.
    expect(ids(pick(filterFor('season'), xs))).toEqual([uuid(1), uuid(2), uuid(3), uuid(4)]);
    expect(previousRounds(xs, filterFor('season'), SEASON, (r) => r)).toBeNull();
  });

  it('needs three rounds, and a range, picked rounds or another window has none', () => {
    expect(previousRounds(rows(12), filterFor('last10'), SEASON, (r) => r)).toBeNull();
    expect(previousRounds(rows(13), filterFor('last10'), SEASON, (r) => r)).toHaveLength(3);
    expect(previousRounds(rows(30), filterFor('season'), SEASON, (r) => r)).toBeNull();
    expect(previousRounds(rows(30), withRange(filterFor('last10'), '2026-08-01', '2026-09-29'), SEASON, (r) => r)).toBeNull();
    expect(previousRounds(rows(30), withPick(filterFor('last10'), { mode: 'only', ids: [uuid(1)] }), SEASON, (r) => r)).toBeNull();
    // Excluding rounds leaves a previous window made of what is left: 16 rounds less 2 excluded is 14, so 4 come before the newest ten.
    const skip = withPick(filterFor('last10'), { mode: 'skip', ids: [uuid(1), uuid(2)] });
    expect(previousRounds(rows(16), skip, SEASON, (r) => r)).toHaveLength(4);
    expect(previousRounds(rows(14), skip, SEASON, (r) => r)).toBeNull();
  });

  it('counts the earlier rounds from the filtered list, and only where there is a previous window', () => {
    const xs = rows(30, ['practice', 'tournament']);
    expect(earlierCount(xs, withTypes(filterFor('last10'), ['tournament']), SEASON, (r) => r)).toBe(5);
    expect(earlierCount(xs, filterFor('last10'), SEASON, (r) => r)).toBe(20);
    expect(earlierCount(xs, filterFor('season'), SEASON, (r) => r)).toBe(0);
    expect(hasPrevious(withRange(filterFor('last10'), '2026-09-01', null))).toBe(false);
  });

  it('reads as last10 only when a previous ten exists', () => {
    expect(effectiveWindow(filterFor('last10'))).toBe('last10');
    expect(effectiveWindow(withRange(filterFor('last10'), '2026-09-01', null))).toBe('season');
    expect(effectiveWindow(withPick(filterFor('last10'), { mode: 'only', ids: [uuid(1)] }))).toBe('season');
    expect(effectiveWindow(filterFor('qualifiers'))).toBe('qualifiers');
    expect(effectiveWindow(filterFor('season'))).toBe('season');
  });
});

describe('stats filter · the words', () => {
  it('says how many rounds and what they are', () => {
    const f = withRange(withTypes(filterFor('last10'), ['tournament']), '2026-09-01', '2026-09-29');
    expect(filterSummary(f, 12, 2026)).toBe('12 rounds: tournaments, Sep 1 to Sep 29');
    expect(filterSummary(withTypes(filterFor('season'), ['tournament', 'qualifier']), 1, 2026)).toBe('1 round: tournaments and qualifying rounds, this season');
    expect(filterSummary(withTypes(filterFor('last10'), ['practice']), 7, 2026)).toBe('7 rounds: practice rounds, last 10');
    expect(filterSummary(withCourses(filterFor('season'), ['Pine Hollow']), 4, 2026)).toBe('4 rounds: at Pine Hollow, this season');
    expect(filterSummary(withCourses(filterFor('season'), ['A', 'B']), 4, 2026)).toBe('4 rounds: at 2 courses, this season');
    expect(filterSummary(withPick(filterFor('last10'), { mode: 'skip', ids: [uuid(1), uuid(2)] }), 8, 2026)).toBe('8 rounds: last 10, without 2 rounds');
    expect(filterSummary(withPick(filterFor('last10'), { mode: 'only', ids: [uuid(1)] }), 1, 2026)).toBe('1 picked round');
    expect(filterSummary(withPick(filterFor('last10'), { mode: 'only', ids: [uuid(1), uuid(2)] }), 0, 2026)).toBe('0 picked rounds');
  });

  it('writes a range with its year when it is not wholly this year', () => {
    expect(dayLabel('2026-09-01', false)).toBe('Sep 1');
    expect(rangeLabel('2026-09-01', '2026-09-29', 2026)).toBe('Sep 1 to Sep 29');
    expect(rangeLabel('2025-12-15', '2026-01-05', 2026)).toBe('Dec 15, 2025 to Jan 5, 2026');
    expect(rangeLabel('2026-09-01', null, 2026)).toBe('from Sep 1');
    expect(rangeLabel(null, '2026-09-29', 2026)).toBe('through Sep 29');
    expect(rangeLabel('2025-03-01', '2025-03-31', 2026)).toBe('Mar 1, 2025 to Mar 31, 2025');
  });

  it('has one removable chip for each filter, and removing one takes off only that one', () => {
    const f: ChFilter = {
      window: 'season',
      types: ['tournament', 'practice'],
      holes: '9',
      from: '2026-09-01',
      to: '2026-09-29',
      courses: ['Pine Hollow'],
      pick: { mode: 'skip', ids: [uuid(1), uuid(2), uuid(3)] },
    };
    const chips = filterChips(f, 2026);
    expect(chips.map((c) => c.label)).toEqual(['Tournament', 'Practice', '9 holes', 'Pine Hollow', 'Sep 1 to Sep 29', 'Without 3 rounds']);
    const without = (key: string) => chips.find((c) => c.key === key)!.next;
    expect(without('type:tournament')).toEqual({ ...f, types: ['practice'] });
    expect(without('holes')).toEqual({ ...f, holes: '18' });
    expect(without('course:Pine Hollow')).toEqual({ ...f, courses: [] });
    expect(without('range')).toEqual({ ...f, from: null, to: null });
    expect(without('pick')).toEqual({ ...f, pick: null });
    // The window is the switch's, never a chip; no filter, no chips.
    expect(filterChips(filterFor('season'))).toEqual([]);
  });
});

/** Rounds newest first with the given positions (0 is the newest) played over nine holes. */
const nines = (xs: ChFilterRow[], at: number[]): ChFilterRow[] => xs.map((r, i) => (at.includes(i) ? { ...r, holes: 9 } : r));
const allNine = (n: number): ChFilterRow[] => nines(rows(n), Array.from({ length: n }, (_, i) => i));

describe('stats filter · holes', () => {
  it('is 18 holes unless the address says otherwise, and leaves 18 out of the address', () => {
    expect(filterFor('last10').holes).toBe('18');
    expect(parseHoles(undefined)).toBe('18');
    expect(parseHoles('9')).toBe('9');
    expect(parseHoles('all')).toBe('all');
    // Anything else is the default, never a length that does not exist.
    expect(parseHoles('27')).toBe('18');
    expect(parseHoles('ALL')).toBe('18');
    expect(parseFilter({ holes: '9' }).holes).toBe('9');
    expect(parseFilter({ holes: ['all', '9'] }).holes).toBe('all');
    expect(parseFilter({ holes: 'nonsense' }).holes).toBe('18');
    expect(statsHref('/golf/dashboard/stats', filterFor('last10'))).toBe('/golf/dashboard/stats');
    expect(statsHref('/golf/dashboard/stats', withHoles(filterFor('last10'), '18'))).toBe('/golf/dashboard/stats');
    expect(statsHref('/golf/dashboard/stats', withHoles(filterFor('last10'), '9'))).toBe('/golf/dashboard/stats?holes=9');
    expect(statsHref('/golf/dashboard/stats', withHoles(filterFor('season'), 'all'), { player: 'p1' })).toBe('/golf/dashboard/stats?player=p1&window=season&holes=all');
  });

  it('is a filter as soon as it is not 18, and clearing puts it back', () => {
    expect(isFiltered(withHoles(filterFor('season'), '18'))).toBe(false);
    expect(isFiltered(withHoles(filterFor('season'), '9'))).toBe(true);
    expect(isFiltered(withHoles(filterFor('season'), 'all'))).toBe(true);
    expect(clearFilters(withHoles(filterFor('season'), '9'))).toEqual(filterFor('season'));
    expect(sameFilter(withHoles(filterFor(), '9'), filterFor())).toBe(false);
    // Choosing a window keeps the holes, and choosing the holes keeps the window.
    expect(withWindow(withHoles(filterFor('last10'), '9'), 'season')).toMatchObject({ window: 'season', holes: '9' });
    expect(withHoles(filterFor('qualifiers'), 'all').window).toBe('qualifiers');
  });

  it('18 holes leaves nine-hole rounds out, 9 holes leaves the long ones out, Both keeps both', () => {
    const xs = nines(rows(6), [1, 4]);
    expect(ids(pick(filterFor('season'), xs))).toEqual([uuid(1), uuid(3), uuid(4), uuid(6)]);
    expect(ids(pick(withHoles(filterFor('season'), '9'), xs))).toEqual([uuid(2), uuid(5)]);
    expect(ids(pick(withHoles(filterFor('season'), 'all'), xs))).toHaveLength(6);
    expect(matchesFilter({ ...xs[0]!, holes: 9 }, withHoles(filterFor('season'), '18'), SEASON)).toBe(false);
    expect(matchesFilter({ ...xs[0]!, holes: 18 }, withHoles(filterFor('season'), '9'), SEASON)).toBe(false);
  });

  it('cuts the newest ten AFTER the length: 18 holes is the ten newest long rounds, Both is the ten newest of either length', () => {
    // Every other round is nine holes, so the ten newest long rounds reach back to r19.
    const xs = nines(rows(24), Array.from({ length: 12 }, (_, i) => i * 2 + 1));
    const long = pick(filterFor('last10'), xs);
    expect(long).toHaveLength(10);
    expect(long.every((r) => r.holes === 18)).toBe(true);
    expect(ids(long)[9]).toBe(uuid(19));
    const both = pick(withHoles(filterFor('last10'), 'all'), xs);
    expect(ids(both)).toEqual(Array.from({ length: 10 }, (_, i) => uuid(i + 1)));
    expect(both.filter((r) => r.holes === 9)).toHaveLength(5);
    const short = pick(withHoles(filterFor('last10'), '9'), xs);
    expect(short).toHaveLength(10);
    expect(short.every((r) => r.holes === 9)).toBe(true);
  });

  it('holds with the other filters: a pick still has to match the length', () => {
    const xs = nines(rows(6), [1]);
    const only = withPick(filterFor('season'), { mode: 'only', ids: [uuid(1), uuid(2)] });
    // r2 is a nine-hole round, so on 18 holes it is not there to pick.
    expect(ids(pick(only, xs))).toEqual([uuid(1)]);
    expect(ids(pick(withHoles(only, 'all'), xs))).toEqual([uuid(1), uuid(2)]);
    expect(ids(pick(withHoles(withPick(filterFor('season'), { mode: 'skip', ids: [uuid(1)] }), '9'), xs))).toEqual([uuid(2)]);
  });

  it('counts whole rounds: a nine-hole round is half, and the floors read that', () => {
    const xs = nines(rows(6), [0, 1, 2]);
    expect(wholeRounds(xs, (r) => r)).toBe(4.5);
    expect(wholeRounds([], (r) => r)).toBe(0);
    expect(per18(38, 9)).toBe(76);
    expect(per18(76, 18)).toBe(76);
    expect(per18(76, null)).toBe(76);
  });

  it('the previous ten needs three WHOLE rounds: four nine-hole rounds before the newest ten are two, six are three', () => {
    const short = withHoles(filterFor('last10'), '9');
    expect(previousRounds(allNine(14), short, SEASON, (r) => r)).toBeNull();
    expect(previousRounds(allNine(16), short, SEASON, (r) => r)).toHaveLength(6);
    // Under Both the same rule: four short rounds are two whole rounds (not enough), two long and two short are three.
    const both = withHoles(filterFor('last10'), 'all');
    expect(previousRounds(nines(rows(14), [10, 11, 12, 13]), both, SEASON, (r) => r)).toBeNull();
    expect(previousRounds(nines(rows(14), [12, 13]), both, SEASON, (r) => r)).toHaveLength(4);
    expect(previousRounds(nines(rows(13), [10, 11]), both, SEASON, (r) => r)).toBeNull();
    // Two and a half whole rounds is still short; three long ones are enough.
    expect(previousRounds(nines(rows(13), [10]), both, SEASON, (r) => r)).toBeNull();
    expect(previousRounds(rows(13), both, SEASON, (r) => r)).toHaveLength(3);
  });

  it('counts the earlier rounds by rows of the chosen length', () => {
    const xs = nines(rows(30), Array.from({ length: 10 }, (_, i) => i * 3));
    expect(earlierCount(xs, filterFor('last10'), SEASON, (r) => r)).toBe(10);
    expect(earlierCount(xs, withHoles(filterFor('last10'), '9'), SEASON, (r) => r)).toBe(0);
    expect(earlierCount(xs, withHoles(filterFor('last10'), 'all'), SEASON, (r) => r)).toBe(20);
  });

  it('says which round lengths the figures read, in the count line, the basis and the chip', () => {
    expect(filterSummary(withHoles(filterFor('season'), '9'), 5, 2026)).toBe('5 rounds: 9-hole rounds, this season');
    expect(filterSummary(withHoles(filterFor('last10'), 'all'), 10, 2026)).toBe('10 rounds: 18- and 9-hole rounds, last 10');
    expect(filterSummary(withHoles(withTypes(filterFor('season'), ['tournament']), '9'), 2, 2026)).toBe('2 rounds: tournaments, 9-hole rounds, this season');
    expect(basisWords(filterFor('last10'), 2026)).toBe('Last 10 rounds');
    expect(basisWords(withHoles(filterFor('last10'), '9'), 2026)).toBe('9-hole rounds, last 10');
    expect(basisWords(withHoles(filterFor('season'), 'all'), 2026)).toBe('18- and 9-hole rounds, this season');
    expect(HOLES_ADJ).toEqual({ '18': '18-hole', '9': '9-hole', all: '18- and 9-hole' });
    expect(PER_18_NOTE).toMatch(/per 18 holes/);
    expect(PER_18_NOTE).toMatch(/half a round/);
    const chips = filterChips(withHoles(filterFor('season'), 'all'), 2026);
    expect(chips.map((c) => [c.key, c.label])).toEqual([['holes', '18 and 9 holes']]);
    expect(chips[0]!.next).toEqual(filterFor('season'));
  });
});
