import { describe, expect, it } from 'vitest';
import { compareLeaderRows } from '../../screens/home/model';
import { leaderPlaces } from '../../screens/home/Leaderboard';
import { roundsForSpan, type ChRound } from '../season';
import { loadSince, practiceCut, roundsInFilter } from '../stats-common';
import {
  clearFilters,
  cutsToLastN,
  effectiveWindow,
  filterFor,
  hasPrevious,
  isAllTime,
  parseFilter,
  statsHref,
  windowBasis,
  withScope,
  withSpan,
} from '../stats-filter';
import { ALL_TIME_START, parseSpan, spanFloorsLeaderboard, spanKeepsPractice, spanKeepsTotalOnly, spanSince, spanStart, spanWords } from '../span';

/** "This season | All time" (data/span.ts): the window logic, in the address, the filter and the round selection. */

const SEASON_START = '2026-08-01';

describe('parseSpan', () => {
  it('only "all" leaves the season, whatever else the address says', () => {
    expect(parseSpan('all')).toBe('all');
    expect(parseSpan(['all', 'season'])).toBe('all');
    for (const v of [undefined, null, '', 'season', 'ALL', '7d', 'x']) expect(parseSpan(v)).toBe('season');
    expect(parseSpan(['season', 'all'])).toBe('season');
  });
});

describe('the span’s rules', () => {
  it('the season keeps the rules the screens always had', () => {
    expect(spanStart(undefined, SEASON_START)).toBe(SEASON_START);
    expect(spanStart('season', SEASON_START)).toBe(SEASON_START);
    expect(spanSince('season', '2025-11-01')).toBe('2025-11-01');
    expect(spanSince(undefined, undefined)).toBeUndefined();
    expect(spanKeepsPractice('season')).toBe(false);
    expect(spanFloorsLeaderboard('season')).toBe(true);
    expect(spanKeepsTotalOnly('season')).toBe(true);
    expect(spanWords('season')).toMatch(/This season/);
  });
  it('All time is Fairway’s: no date, practice in, no floor, no total-only round', () => {
    expect(spanStart('all', SEASON_START)).toBe(ALL_TIME_START);
    expect(ALL_TIME_START < '2000-01-01').toBe(true);
    // Null is "no bound" to the loader; undefined would be its default (the season).
    expect(spanSince('all', '2025-11-01')).toBeNull();
    expect(spanKeepsPractice('all')).toBe(true);
    expect(spanFloorsLeaderboard('all')).toBe(false);
    expect(spanKeepsTotalOnly('all')).toBe(false);
    expect(spanWords('all')).toMatch(/All time/);
  });
});

describe('the span in the Stats address and filter', () => {
  it('no param is the season and builds the filter it always built', () => {
    expect(parseFilter({})).toEqual(filterFor());
    expect('span' in parseFilter({ window: 'season' })).toBe(false);
    expect('span' in parseFilter({ range: 'season' })).toBe(false);
    expect(statsHref('/golf/dashboard/stats', filterFor('season'))).toBe('/golf/dashboard/stats?window=season');
  });
  it('?range=all is All time, and writes itself back', () => {
    const f = parseFilter({ window: 'season', range: 'all' });
    expect(f.span).toBe('all');
    expect(isAllTime(f)).toBe(true);
    const href = statsHref('/golf/dashboard/stats', f, { player: 'p1', tab: 'game' });
    expect(href).toBe('/golf/dashboard/stats?player=p1&tab=game&window=season&range=all');
    expect(parseFilter(Object.fromEntries(new URL(href, 'https://x.test').searchParams))).toEqual(f);
  });
  it('a window or filter change keeps All time; clearing the filters keeps it; choosing the season removes it', () => {
    const all = withSpan(filterFor('last10'), 'all');
    expect(withScope(all, 'last20').span).toBe('all');
    expect(withScope(all, 'season').span).toBe('all');
    expect(clearFilters({ ...all, holes: '9' }).span).toBe('all');
    expect(statsHref('/s', withScope(all, 'qualifiers'))).toContain('range=all');
    const back = withSpan(all, 'season');
    expect('span' in back).toBe(false);
    expect(back).toEqual(filterFor('last10'));
  });
  it('labels say the window shown', () => {
    expect(windowBasis(withSpan(filterFor('last10'), 'all'))).toBe('All time');
    expect(windowBasis(filterFor('season'))).toBe('This season');
    expect(windowBasis(filterFor('last10'))).toBe('Last 10 rounds');
  });
});

const round = (id: string, date: string, type: string | null, over: Partial<ChRound> = {}): ChRound =>
  ({ id, player_id: 'p1', round_date: date, round_type: type, total_score: 75, holes_played: 18, front_nine: 37, back_nine: 38, ...over }) as ChRound;

describe('which rounds a filter reads on All time', () => {
  // Newest first, as the loader returns them.
  const rounds = [
    round('r1', '2026-10-10', 'tournament'),
    round('r2', '2026-09-01', 'qualifier'),
    round('r3', '2026-07-31', 'tournament'),
    round('r4', '2025-04-02', 'tournament'),
    round('r5', '2024-03-01', 'qualifier'),
    ...Array.from({ length: 12 }, (_, i) => round(`o${i}`, `2023-0${(i % 9) + 1}-10`, 'tournament')),
  ];
  const season = filterFor('season');
  const all = withSpan(season, 'all');

  it('the season window stops at 1 August; All time does not', () => {
    expect(roundsInFilter(rounds, season, SEASON_START).map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(roundsInFilter(rounds, all, SEASON_START)).toHaveLength(rounds.length);
  });
  it('whatever window the address names, All time has none: Last 10 is not a cut and Qualifiers is not a kind', () => {
    const last10 = withSpan(filterFor('last10'), 'all');
    expect(cutsToLastN(last10)).toBe(false);
    expect(hasPrevious(last10)).toBe(false);
    expect(effectiveWindow(last10)).toBe('season');
    expect(roundsInFilter(rounds, last10, SEASON_START)).toHaveLength(rounds.length);
    expect(roundsInFilter(rounds, withSpan(filterFor('qualifiers'), 'all'), SEASON_START)).toHaveLength(rounds.length);
    // …while the default Last 10 is still the newest ten.
    expect(roundsInFilter(rounds, filterFor('last10'), SEASON_START)).toHaveLength(10);
  });
  it('a type, length or course the filter names still applies', () => {
    expect(roundsInFilter(rounds, { ...all, types: ['qualifier'] }, SEASON_START).map((r) => r.id)).toEqual(['r2', 'r5']);
    expect(roundsInFilter([round('n', '2026-10-01', 'tournament', { holes_played: 9 }), ...rounds], all, SEASON_START)).toHaveLength(rounds.length);
  });
  it('a custom date range is still its own time', () => {
    expect(roundsInFilter(rounds, { ...all, from: '2026-09-01', to: '2026-10-31' }, SEASON_START).map((r) => r.id)).toEqual(['r1', 'r2']);
  });
  it('the read has no floor, and practice is not cut', () => {
    expect(loadSince(all, SEASON_START)).toBeNull();
    expect(loadSince(withSpan(filterFor('last10'), 'all'))).toBeNull();
    expect(loadSince(season, SEASON_START)).toBe(SEASON_START);
    expect(loadSince(filterFor('last10'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(practiceCut(season)).toBe(true);
    expect(practiceCut(all)).toBe(false);
    expect(practiceCut({ ...season, types: ['tournament'] })).toBe(false);
  });
});

describe('roundsForSpan', () => {
  const rows = [
    round('t', '2026-10-01', 'tournament'),
    round('p', '2026-10-02', 'practice'),
    round('u', '2026-10-03', null),
    round('x', '2026-10-04', 'qualifier', { total_only: true }),
    round('y', '2026-10-05', 'practice', { total_only: true }),
  ];
  it('the season leaves practice out and counts a total-only round (Q-123)', () => {
    expect(roundsForSpan(rows).map((r) => r.id)).toEqual(['t', 'u', 'x']);
    expect(roundsForSpan(rows, 'season').map((r) => r.id)).toEqual(['t', 'u', 'x']);
  });
  it('All time is Fairway’s: practice in, no round posted as a total only', () => {
    expect(roundsForSpan(rows, 'all').map((r) => r.id)).toEqual(['t', 'p', 'u']);
  });
});

describe('the leaderboard’s floor', () => {
  const row = (name: string, avg: number, rounds: number, status = 'steady') => ({ name, avg, rounds, status });
  const rows = () => [row('Early', 70.1, 2, 'early'), row('Steady', 76, 20), row('Mid', 74.84, 29)];
  it('the season puts a short sample last whatever its average', () => {
    expect(rows().sort((a, b) => compareLeaderRows(a, b, spanFloorsLeaderboard('season'))).map((r) => r.name)).toEqual(['Mid', 'Steady', 'Early']);
    expect(rows().sort(compareLeaderRows).map((r) => r.name)).toEqual(['Mid', 'Steady', 'Early']);
  });
  it('All time ranks on the average at one decimal, then more rounds, with no floor (Fairway’s Top performers)', () => {
    expect(rows().sort((a, b) => compareLeaderRows(a, b, spanFloorsLeaderboard('all'))).map((r) => r.name)).toEqual(['Early', 'Mid', 'Steady']);
    // 74.84 and 74.76 both print 74.8: the one with more rounds first.
    expect([row('B', 74.76, 19), row('A', 74.84, 29)].sort((a, b) => compareLeaderRows(a, b, false)).map((r) => r.name)).toEqual(['A', 'B']);
  });
  it('a place is given to a short sample on All time, and withheld in the season', () => {
    const two = [{ avg: 70.1, status: 'early' as const }, { avg: 76, status: 'steady' as const }];
    expect(leaderPlaces(two).map((p) => p.label)).toEqual(['—', '1']);
    expect(leaderPlaces(two, false).map((p) => p.label)).toEqual(['1', '2']);
  });
});
