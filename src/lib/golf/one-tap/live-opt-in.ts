'use client';

import { useCallback, useEffect, useState } from 'react';

/** Meridian Live pilot opt-in (owner ask, 2026-09-17: "a toggle in the app;
 * it shouldn't touch production; only Peek'n Peak"). The release flag makes an
 * Upper round *eligible*; the player turns Live on for the round on their own
 * phone. Device-local and keyed by round, so a team-mate who tries it once is
 * not opted in for their next round, while a reload mid-round keeps the
 * choice. Nothing here knows the course: `useOneTapLiveRoundState` only asks
 * for rounds `productCourseIdForRound` has already resolved to the Upper. */
export const LIVE_OPT_IN_PREFIX = 'golfhelm-one-tap-opt-in:';
export type LiveOptIn = 'on' | 'off';
export interface OptInStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

function defaultStorage(): OptInStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
/** The choice on record for the round; null when the player has not chosen. */
export function readLiveOptIn(roundId: string | null, storage: OptInStorage | null = defaultStorage()): LiveOptIn | null {
  if (!roundId || !storage) return null;
  try {
    const raw = storage.getItem(LIVE_OPT_IN_PREFIX + roundId);
    return raw === 'on' || raw === 'off' ? raw : null;
  } catch { return null; }
}
export function writeLiveOptIn(roundId: string, choice: LiveOptIn, storage: OptInStorage | null = defaultStorage()): void {
  try { storage?.setItem(LIVE_OPT_IN_PREFIX + roundId, choice); } catch { /* private mode: the choice lasts the page */ }
}
/** The round's opt-in as state: the status row turns it on, the ••• menu off,
 * and both go through the one setter so the tracker re-resolves at once. */
export function useLiveOptIn(roundId: string | null, storage: OptInStorage | null = defaultStorage()): [LiveOptIn | null, (choice: LiveOptIn) => void] {
  const [choice, setChoice] = useState<LiveOptIn | null>(() => readLiveOptIn(roundId, storage));
  // A round id that arrives after mount (a new round saving) brings its own record.
  useEffect(() => { setChoice(readLiveOptIn(roundId, storage)); }, [roundId, storage]);
  const choose = useCallback((next: LiveOptIn) => {
    setChoice(next);
    if (roundId) writeLiveOptIn(roundId, next, storage);
  }, [roundId, storage]);
  return [choice, choose];
}
