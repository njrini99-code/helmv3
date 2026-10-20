'use client';

import { useEffect, useRef, useState } from 'react';
import { PUSH_NAVIGATE_EVENT } from '@/lib/utils/push-registration';

/**
 * A link to the screen already open, naming a different item (a notification's `?conversation=` on Messages,
 * `?event=` on Calendar). The route is keyed by its pathname (RouteFrame), so a push to the same pathname re-renders the
 * screen with the new query rather than mounting it, and the screens read an item from the address once, on mount:
 * the bell closed and nothing opened. Fairway's bell pushes the same address and opens it, so here the frame mounts the
 * screen again once the new address has arrived (or at once, when the link is the address already shown).
 *
 * Only links that name something through a query are re-mounted, and only from the places that open a stored link: the
 * bell, a universal link (DeepLinks) and a tapped push. A screen's own address changes (a calendar week, a tab) never
 * come through here, so they keep their state.
 */

/** The event the frame listens for: its detail is the href about to be opened. */
export const CH_RELINK_EVENT = 'ch:relink';

/** `pathname?query`, the query in URLSearchParams order, so two spellings of one address compare equal. */
export function addressKey(pathname: string, search: string): string {
  const path = pathname.replace(/\/$/, '') || '/';
  const q = new URLSearchParams(search).toString();
  return q ? `${path}?${q}` : path;
}

/**
 * What opening `href` from `pathname` needs: `now` when it is the address already shown (no navigation will arrive),
 * `arrival` when the same screen is about to get a new query, `null` when the route changes anyway or the link names
 * nothing (the screen mounts, or has nothing to open).
 */
export function relinkFor(href: string, pathname: string, search: string): { when: 'now' | 'arrival'; key: string } | null {
  let url: URL;
  try {
    url = new URL(href, 'https://clubhouse.invalid');
  } catch {
    return null;
  }
  const target = addressKey(url.pathname, url.search);
  const samePath = (url.pathname.replace(/\/$/, '') || '/') === (pathname.replace(/\/$/, '') || '/');
  if (!samePath || !url.search || url.search === '?') return null;
  return { when: target === addressKey(pathname, search) ? 'now' : 'arrival', key: target };
}

/** Called just before a stored link is pushed. Nothing listens outside the Clubhouse frame, so it is harmless there. */
export function armRelink(href: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>(CH_RELINK_EVENT, { detail: href }));
}

/**
 * The frame's half: a count that goes up when the open screen is to be mounted again, for RouteFrame's key. A link
 * armed for its arrival waits for that address (the new query and the page drawn for it come in the same commit); one
 * for the address already shown counts at once. A tapped push (`helm:push-navigate`, pushed by CapacitorProvider) is
 * armed here too. A wait the address never reaches is dropped when the screen changes.
 */
export function useRelinkEpoch(pathname: string, search: string): number {
  const [state, setState] = useState<{ want: string | null; epoch: number }>({ want: null, epoch: 0 });
  const here = addressKey(pathname, search);
  const at = useRef({ pathname, search });
  at.current = { pathname, search };
  if (state.want !== null) {
    if (state.want === here) setState({ want: null, epoch: state.epoch + 1 });
    else if (!state.want.startsWith(`${addressKey(pathname, '')}?`)) setState({ want: null, epoch: state.epoch });
  }
  useEffect(() => {
    const arm = (href: unknown) => {
      if (typeof href !== 'string') return;
      const r = relinkFor(href, at.current.pathname, at.current.search);
      if (!r) return;
      setState((s) => (r.when === 'now' ? { want: null, epoch: s.epoch + 1 } : { want: r.key, epoch: s.epoch }));
    };
    const onRelink = (e: Event) => arm((e as CustomEvent<unknown>).detail);
    const onPush = (e: Event) => {
      const url = (e as CustomEvent<{ url?: unknown }>).detail?.url;
      arm(url);
    };
    window.addEventListener(CH_RELINK_EVENT, onRelink);
    window.addEventListener(PUSH_NAVIGATE_EVENT, onPush);
    return () => {
      window.removeEventListener(CH_RELINK_EVENT, onRelink);
      window.removeEventListener(PUSH_NAVIGATE_EVENT, onPush);
    };
  }, []);
  return state.epoch;
}
