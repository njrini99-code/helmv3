'use client';

import { useEffect, useState } from 'react';

/**
 * The list's filter and search, kept in its address (?filter=&q=) so a reload, a Back from a qualifier and the browser's own Back all
 * land on the list as it was left, and its scroll position, kept for the return (owner rule 8). The address is the state: the list
 * reads it when it mounts, so it survives the list's own remount, and rewrites it (replace, never push) as the filter or the search
 * changes. sessionStorage only carries what the address cannot: which list a qualifier's Back returns to, and where it was scrolled.
 * Every read and write is guarded: storage can be absent or full, and the page works without it.
 */

export type ListFilter = 'all' | 'active' | 'concluded';
export interface ListState {
  filter: ListFilter;
  q: string;
}

export const LIST_HREF = '/golf/dashboard/qualifiers';
const LIST_KEY = 'ch.qf.list';
const SCROLL_KEY = 'ch.qf.scroll';
const RETURN_KEY = 'ch.qf.return';
/** A list address this page wrote: the team's list or a player's own, with or without a query, and nothing else. */
const LIST_ADDRESS = /^\/golf\/dashboard\/(qualifiers|my-qualifiers)(\?[^#]*)?$/;

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** The filter and the search an address carries. Anything else is the default: all, nothing typed. */
export function parseListQuery(get: (name: string) => string | null): ListState {
  const filter = get('filter');
  return { filter: filter === 'active' || filter === 'concluded' ? filter : 'all', q: get('q') ?? '' };
}

/** The address of a list with this state. The defaults are left out, and so is nothing else: the preview's own query stays. */
export function listAddress(pathname: string, search: string, state: ListState): string {
  const params = new URLSearchParams(search);
  if (state.filter === 'all') params.delete('filter');
  else params.set('filter', state.filter);
  if (state.q) params.set('q', state.q);
  else params.delete('q');
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Where the list was last left: its address, with the filter and the search. */
export function rememberList(address: string): void {
  try {
    store()?.setItem(LIST_KEY, address);
  } catch {
    // Not kept: Back goes to the plain list.
  }
}

/** The list a qualifier's Back returns to, as it was left; the plain list when there is none. */
export function lastListHref(): string {
  try {
    const address = store()?.getItem(LIST_KEY) ?? null;
    return address && LIST_ADDRESS.test(address) ? address : LIST_HREF;
  } catch {
    return LIST_HREF;
  }
}

/** Where the list was scrolled when it was left for a qualifier, for the address it was at. */
export function rememberScroll(address: string, top: number): void {
  try {
    store()?.setItem(SCROLL_KEY, JSON.stringify({ address, top }));
  } catch {
    // Not kept: the list opens at the top.
  }
}

/** The list is about to be opened as a return (Back from a qualifier), so it restores its scroll rather than opening at the top. */
export function markReturn(): void {
  try {
    store()?.setItem(RETURN_KEY, '1');
  } catch {
    // Not kept: the list opens at the top.
  }
}

/** The scroll to restore for this address, if the list is being opened as a return and was left there; otherwise null. Reads only. */
export function returnScroll(address: string): number | null {
  try {
    if (store()?.getItem(RETURN_KEY) !== '1') return null;
    const kept = JSON.parse(store()?.getItem(SCROLL_KEY) ?? 'null') as { address?: unknown; top?: unknown } | null;
    return kept && kept.address === address && typeof kept.top === 'number' && kept.top > 0 ? kept.top : null;
  } catch {
    return null;
  }
}

/** The return has been honoured (or there was nothing to restore): the next visit to the list opens at the top again. */
export function clearReturn(): void {
  try {
    store()?.removeItem(RETURN_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The page's scroll container: the Clubhouse canvas, or the window outside the frame. */
export function scrollCanvasTo(top: number): void {
  const canvas = document.getElementById('ch-canvas');
  if (canvas) canvas.scrollTo({ top });
  else window.scrollTo({ top });
}
export function canvasScrollTop(): number {
  return document.getElementById('ch-canvas')?.scrollTop ?? window.scrollY;
}

/**
 * For a screen with a Back to the list: where Back goes (the list as it was left, with its filter and search, read after mount so
 * the first paint is the server's), and the mark that tells the list it is being returned to. The browser's own Back from the screen
 * is a return too.
 */
export function useBackToList(): { href: string; markReturn: () => void } {
  const [href, setHref] = useState(LIST_HREF);
  useEffect(() => {
    setHref(lastListHref());
    window.addEventListener('popstate', markReturn);
    return () => window.removeEventListener('popstate', markReturn);
  }, []);
  return { href, markReturn };
}
