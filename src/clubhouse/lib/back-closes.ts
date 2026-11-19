'use client';

import { useCallback, useEffect, useRef } from 'react';

/** How long a pick waits for the entry's own Back to land before it runs anyway. */
const SETTLE_MS = 400;

/**
 * Back closes the overlay first (audit 2026-11-18, P2: Back with a menu open left the page). While `open`, the overlay
 * owns one same-address history entry, as quick chat's panel does (`shell/quick-chat/use-panel-history.ts`) and a pushed
 * phone screen does (CH-1906): the browser's Back and the iOS edge swipe pop that entry, and `onBack` closes the overlay
 * with the page left where it was. Closed any other way (Escape, an outside tap, a scroll), the entry is taken back off
 * quietly. Two ways out keep the stack honest when the overlay is left for somewhere else:
 *
 * - `replaces()`: true while the entry is the top of the stack, so a link picked from the overlay replaces it rather
 *   than leaving a duplicate of this page under the next one; call `forget()` as it is followed.
 * - `release(run)`: an action picked from the overlay waits for the entry's Back to land before it runs, so a navigation
 *   it starts (Calendar's Practice hours pushes from its action) is never undone by that Back arriving after it.
 * - Unmounted while open (an action removed the overlay with its row): the entry it still owns comes off.
 *
 * State lives in refs and one listener, so nothing depends on which render a Back arrives in.
 */
export function useBackCloses(open: boolean, onBack: () => void): { replaces: () => boolean; forget: () => void; release: (run: () => void) => void } {
  /** The id of the entry this overlay pushed and still has on the stack, or null. */
  const mine = useRef<number | null>(null);
  /** Pops this hook asked for itself, each with what runs once it lands. */
  const own = useRef<Array<() => void>>([]);
  const back = useRef(onBack);
  /** Mounted: an unmount that owned the top entry takes it off. */
  const alive = useRef(false);
  useEffect(() => {
    back.current = onBack;
  });
  const top = () => mine.current !== null && (window.history.state as { chOverlay?: number } | null)?.chOverlay === mine.current;
  const takeOff = useCallback((then: () => void = () => {}) => {
    const onTop = top();
    mine.current = null;
    if (!onTop) return then();
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      // Run by the timer: it leaves the queue, so a later Back of the person's own is not taken for it.
      own.current = own.current.filter((f) => f !== once);
      then();
    };
    own.current.push(once);
    window.setTimeout(once, SETTLE_MS);
    window.history.back();
  }, []);
  useEffect(() => {
    if (open && mine.current === null) {
      mine.current = Date.now();
      // As quick chat's entry: Next's patched pushState carries its own entry data onto it.
      window.history.pushState({ chOverlay: mine.current }, '');
    } else if (!open && mine.current !== null) takeOff();
  }, [open, takeOff]);
  useEffect(() => {
    const onPop = () => {
      const then = own.current.shift();
      if (then) return then();
      if (mine.current === null) return;
      // Its entry is still on the stack (a traversal further up it): nothing of the overlay's was popped.
      if ((window.history.state as { chOverlay?: number } | null)?.chOverlay === mine.current) return;
      mine.current = null;
      back.current();
    };
    window.addEventListener('popstate', onPop);
    alive.current = true;
    return () => {
      window.removeEventListener('popstate', onPop);
      alive.current = false;
      // Unmounted while it still owned the top entry (an action that removed the overlay with its row, the practice
      // builder's Delete): the entry comes off, or the next Back would do nothing. Checked a task later, so a remount
      // (StrictMode) that kept the entry keeps it.
      const id = mine.current;
      if (id === null) return;
      window.setTimeout(() => {
        if (alive.current) return;
        if ((window.history.state as { chOverlay?: number } | null)?.chOverlay === id) window.history.back();
      }, 0);
    };
  }, []);
  return {
    replaces: useCallback(() => top(), []),
    forget: useCallback(() => {
      mine.current = null;
    }, []),
    release: takeOff,
  };
}
