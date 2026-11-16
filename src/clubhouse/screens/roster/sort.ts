'use client';

import { createSortedRowModel, rowSortingFeature, tableFeatures, useTable, type ColumnDef, type SortFn, type SortingState } from '@tanstack/react-table';
import { useMemo } from 'react';
import type { ChRosterPlayer } from '../../data/roster';
import { isEarlyRead, roundsPlayed } from './format';

export type PhoneSort = 'avg' | 'sg' | 'name';
/** Every order the Roster offers: the phone's three, and the desktop table's handicap and rounds (B10.5). */
export type RosterSort = PhoneSort | 'hcp' | 'rounds';

/**
 * The phone Roster's order (P003, CH-3701), on TanStack Table's sorting model, headless: the list keeps its own rows.
 * One column per Sort by option, each always ascending in its own sense, with its rule written out here rather than
 * left to a built-in: Avg lowest first, SG highest first, Name by last name (D-59), an early read (under three counting
 * rounds) after every ranked player, and a missing average or strokes gained last under either direction. Ties keep the order the loader gave (TanStack falls back to the row index).
 */
const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() });
type F = typeof features;

const lastName = (n: string) => n.split(' ').slice(-1)[0] ?? n;
/** Ascending, with missing values last. */
const nullsLast = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b);
/**
 * A player's figure for a ranked order, or null under the early floor (format.ts, ROSTER_EARLY_FLOOR): the leader cards
 * count only players with three counting rounds, so the list ranks by the same rule and puts an early read after every
 * ranked player, with the missing figures (prod audit 2026-11-15, ROSTER-02: a player with one round at 72.0 topped the
 * Avg list while the Lowest average card named someone at 77.5).
 */
const ranked = (p: ChRosterPlayer, v: number | null) => (isEarlyRead(p) ? null : v);
/** Ascending on the ranked figure; early reads next, by their own figure; then players with no figure. */
const rankedFirst = (a: ChRosterPlayer, b: ChRosterPlayer, va: number | null, vb: number | null) => {
  const ra = ranked(a, va);
  const rb = ranked(b, vb);
  if (ra != null || rb != null) return nullsLast(ra, rb);
  return nullsLast(va, vb);
};

/**
 * The one rule per order, for the phone list and the desktop table alike: each reads best first. Avg and handicap lowest
 * first, strokes gained and rounds highest first, Name by last name; a missing figure last.
 */
const COMPARE: Record<RosterSort, (a: ChRosterPlayer, b: ChRosterPlayer) => number> = {
  avg: (a, b) => rankedFirst(a, b, a.avg, b.avg),
  sg: (a, b) => rankedFirst(a, b, a.sgPerRound == null ? null : -a.sgPerRound, b.sgPerRound == null ? null : -b.sgPerRound),
  hcp: (a, b) => nullsLast(a.handicap, b.handicap),
  rounds: (a, b) => roundsPlayed(b) - roundsPlayed(a),
  name: (a, b) => lastName(a.name).localeCompare(lastName(b.name)),
};

/** Which way an order runs, for a header's `aria-sort`. */
export const ROSTER_SORT_DIRECTION: Record<RosterSort, 'ascending' | 'descending'> = { avg: 'ascending', sg: 'descending', hcp: 'ascending', rounds: 'descending', name: 'ascending' };

/** `list` in `sort` order (a copy); ties keep their order. */
export function sortRoster(list: readonly ChRosterPlayer[], sort: RosterSort): ChRosterPlayer[] {
  return [...list].sort(COMPARE[sort]);
}

const byAvg: SortFn<F, ChRosterPlayer> = (a, b) => COMPARE.avg(a.original, b.original);
const bySg: SortFn<F, ChRosterPlayer> = (a, b) => COMPARE.sg(a.original, b.original);
const byName: SortFn<F, ChRosterPlayer> = (a, b) => COMPARE.name(a.original, b.original);

const columns: Array<ColumnDef<F, ChRosterPlayer>> = [
  { id: 'avg', accessorFn: (p) => p.avg, sortFn: byAvg, sortUndefined: false },
  { id: 'sg', accessorFn: (p) => p.sgPerRound, sortFn: bySg, sortUndefined: false },
  { id: 'name', accessorFn: (p) => p.name, sortFn: byName, sortUndefined: false },
];

const getRowId = (p: ChRosterPlayer) => p.id;

/** The sorting state a Sort by option stands for: its one column, never descending (each rule already reads best first). */
export function rosterSorting(sort: PhoneSort): SortingState {
  return [{ id: sort, desc: false }];
}

/** The players in `sort` order, split into active and inactive, each keeping that order. */
export function useRosterSort(players: ChRosterPlayer[], sort: PhoneSort): { active: ChRosterPlayer[]; inactive: ChRosterPlayer[] } {
  const sorting = useMemo(() => rosterSorting(sort), [sort]);
  const table = useTable<F, ChRosterPlayer>({
    features,
    data: players,
    columns,
    state: { sorting },
    getRowId,
  });
  const rows = table.getRowModel().rows;
  return useMemo(() => {
    const ordered = rows.map((r) => r.original);
    return { active: ordered.filter((p) => p.status === 'active'), inactive: ordered.filter((p) => p.status === 'inactive') };
  }, [rows]);
}
