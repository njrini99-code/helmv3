import type { ChTourCompareSearch, ChTourDeskSearch, ChTourDeskTab, ChTourHistorySearch } from '../screens/tournaments/types';

/** The Tournaments routes' URL state (plan 4.3), parsed from the page's searchParams. Pure. */
export type Search = Record<string, string | string[] | undefined>;

const DESK_TABS: readonly ChTourDeskTab[] = ['overview', 'live', 'counted', 'holes', 'compare', 'review'];

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export function deskSearchOf(search: Search): ChTourDeskSearch {
  const tab = one(search.tab);
  const round = Number(one(search.round));
  const view = one(search.view);
  const holes = one(search.holes);
  return {
    tab: DESK_TABS.find((t) => t === tab) ?? 'overview',
    round: Number.isInteger(round) && round >= 1 && round <= 6 ? round : 'all',
    view: view === 'players' ? 'players' : 'team',
    holes: holes === 'scores' || holes === 'counting' ? holes : 'to-par',
  };
}

export function historySearchOf(search: Search): ChTourHistorySearch {
  return { mode: one(search.mode) === 'matched' ? 'matched' : 'actual', adjust: one(search.adjust) === 'field' ? 'field' : 'raw' };
}

export function compareSearchOf(search: Search): ChTourCompareSearch {
  const bench = one(search.bench);
  const split = Number(one(search.split));
  return {
    a: one(search.a),
    b: one(search.b),
    m: one(search.m),
    bench: bench === 'team' || bench === 'field' || bench === 'd1' || bench === 'top25' ? bench : null,
    split: Number.isFinite(split) && split > 0 && split < 100 ? split : null,
  };
}

