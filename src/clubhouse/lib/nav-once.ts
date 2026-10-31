'use client';

import { useCallback, useEffect, useRef } from 'react';

/** How long a link stays "on its way" if the address never changes (a refused or slow navigation). */
const HOLD_MS = 1000;

let inFlight: { key: string; at: number } | null = null;

function onClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const el = e.target instanceof Element ? e.target : null;
  if (!el?.closest("[data-ui='clubhouse']")) return;
  const a = el.closest<HTMLAnchorElement>('a[href]');
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  const key = url.pathname + url.search;
  const now = performance.now();
  if (inFlight && inFlight.key === key && now - inFlight.at < HOLD_MS) {
    e.preventDefault();
    return;
  }
  inFlight = { key, at: now };
}

/**
 * One navigation per intent (F-0026): a second activation of the link already on its way is dropped, so a quick double
 * tap doesn't push the same page twice and Back takes one press. Window capture, so it runs before the navigation
 * classifier (lib/nav-motion.ts, document capture) and Next's Link, which both skip a click whose default is prevented.
 * A new address (`pathname` + `search`) lets the next tap through.
 */
/**
 * The same guard for a navigation in code (a segment's `router.push`), per component: a second push of the same
 * address within the hold is dropped (F-0026). Returns the push to call.
 */
export function usePushOnce<R>(router: { push: (href: string, options?: { scroll?: boolean }) => R }) {
  const last = useRef<{ key: string; at: number } | null>(null);
  return useCallback(
    // The push's own result goes back, so a transition that awaits it (Stats' busy mark) still does.
    (href: string, options?: { scroll?: boolean }): R | undefined => {
      const url = new URL(href, location.href);
      const key = url.pathname + url.search;
      const now = performance.now();
      if (last.current && last.current.key === key && now - last.current.at < HOLD_MS) return undefined;
      last.current = { key, at: now };
      return router.push(href, options);
    },
    [router],
  );
}

export function useNavOnce(pathname: string, search: string): void {
  useEffect(() => {
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);
  useEffect(() => {
    inFlight = null;
  }, [pathname, search]);
}
