'use client';

import { useEffect, useRef } from 'react';

/**
 * The profile as a history entry, as `usePhoneStackHistory` makes it, with a guard: a Back while `blocked()` says the Coach's note is
 * unsaved keeps the profile up and puts the entry back (classes-roster-home 05 S-ROSTER.profile.note-dirty). phone-chrome.tsx does not
 * change for this; only the lane's flagged profile calls it.
 */
export function useGuardedPhoneHistory(open: boolean, onPop: () => void, blocked: () => boolean): void {
  const pushed = useRef(false);
  const ignore = useRef(0);
  const popRef = useRef(onPop);
  const blockedRef = useRef(blocked);
  useEffect(() => {
    popRef.current = onPop;
    blockedRef.current = blocked;
  });
  useEffect(() => {
    if (open && !pushed.current) {
      window.history.pushState({ chPhone: 1 }, '');
      pushed.current = true;
    } else if (!open && pushed.current) {
      ignore.current += 1;
      pushed.current = false;
      window.history.go(-1);
    }
  }, [open]);
  useEffect(() => {
    const on = () => {
      if (ignore.current > 0) {
        ignore.current -= 1;
        return;
      }
      if (!pushed.current) return;
      const state = window.history.state as { chPhone?: unknown } | null;
      if (typeof state?.chPhone === 'number' && state.chPhone >= 1) return;
      if (blockedRef.current()) {
        window.history.pushState({ chPhone: 1 }, '');
        return;
      }
      pushed.current = false;
      popRef.current();
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
}
