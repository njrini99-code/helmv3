'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * The panel owns one history entry (QUICK-CHAT.md MQ-1-9), kept the way the shell keeps a pushed phone screen's
 * (`usePhoneStackHistory`, CH-1906): a same-URL entry pushed when it opens, so the browser's Back, the iOS edge swipe
 * and Android's back close the panel instead of leaving the page. One listener for the life of the session, state in
 * refs: nothing here depends on which render a Back arrives in. Closing from the UI takes the entry back off quietly;
 * `forget` leaves it for a destination that replaces it (Open in Ask, a receipt's Open).
 */
export function usePanelHistory(open: boolean, onBack: () => void): { forget: () => boolean } {
  /** The id of the entry this panel pushed and still has on the stack, or null. */
  const mine = useRef<number | null>(null);
  /** Pops this hook asked for itself: each is taken off without closing anything. */
  const ignore = useRef(0);
  const back = useRef(onBack);
  useEffect(() => {
    back.current = onBack;
  });
  useEffect(() => {
    if (open && mine.current === null) {
      mine.current = Date.now();
      window.history.pushState({ chQc: mine.current }, '');
    } else if (!open && mine.current !== null) {
      const top = (window.history.state as { chQc?: number } | null)?.chQc === mine.current;
      mine.current = null;
      // Only its own entry is taken off: after a route change the top of the stack is the new page's.
      if (top) {
        ignore.current += 1;
        window.history.back();
      }
    }
  }, [open]);
  useEffect(() => {
    const onPop = () => {
      if (ignore.current > 0) {
        ignore.current -= 1;
        return;
      }
      if (mine.current === null) return;
      // Its entry is still on the stack (a traversal further up it): nothing of the panel's was popped.
      if ((window.history.state as { chQc?: number } | null)?.chQc === mine.current) return;
      mine.current = null;
      back.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  /** The app is going somewhere: the destination takes the entry's place. True when the entry is the top of the stack. */
  const forget = useCallback(() => {
    const top = mine.current !== null && (window.history.state as { chQc?: number } | null)?.chQc === mine.current;
    mine.current = null;
    return top;
  }, []);
  return { forget };
}
