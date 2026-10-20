'use client';

import { useLayoutEffect, type RefObject } from 'react';

/** How long a search hit stays marked once the thread has come to it. */
export const FOUND_FOR_MS = 2400;
/** A hit whose thread hasn't shown it by then is given up on, and the thread goes back to its end. */
const GIVE_UP_AFTER_MS = 4000;

/**
 * A search hit's message, brought into view (P007, as Fairway's search does: open the thread, then go to the match).
 * While `target` is set the thread's end-anchor is paused (useThreadAnchor `paused`), so neither its settle hold nor the
 * messages loading under the jump pull the reader back to the end. Once the message is in the thread it is scrolled to
 * the middle of the view (at once with reduced motion) and `onDone(id)` marks it; a hit outside the loaded history
 * hands the thread back to its end (`onDone(null)`, then `toEnd`).
 */
export function useFocusMessage(
  scroller: RefObject<HTMLElement | null>,
  {
    target,
    loading,
    count,
    reduced,
    onDone,
    toEnd,
  }: {
    target: string | null;
    loading: boolean;
    count: number;
    reduced: boolean;
    onDone: (id: string | null) => void;
    toEnd: () => void;
  },
) {
  useLayoutEffect(() => {
    if (!target) return;
    const el = scroller.current?.querySelector<HTMLElement>(`[id="ch-ms-message-${target}"]`) ?? null;
    if (el) {
      el.scrollIntoView?.({ block: 'center', behavior: reduced ? 'instant' : 'smooth' });
      onDone(target);
      return;
    }
    const giveUp = () => {
      onDone(null);
      toEnd();
    };
    // Still loading, or not started yet (a thread just opened reads as empty and idle for a render): wait for the
    // messages, but never hold the thread off its end for good.
    if (loading || !count) {
      const t = window.setTimeout(giveUp, GIVE_UP_AFTER_MS);
      return () => window.clearTimeout(t);
    }
    giveUp();
    return undefined;
    // The callbacks change with every render of the thread; the jump is keyed on the target and the loaded messages.
  }, [target, loading, count, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
}
