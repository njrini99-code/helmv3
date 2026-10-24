'use client';

import { useEffect, useSyncExternalStore } from 'react';

/** A key a screen adds while it is open, as the shortcuts sheet lists it. */
export interface ChPageKey {
  label: string;
  keys: readonly string[];
}

interface ChPageKeys {
  page: string;
  keys: readonly ChPageKey[];
}

/**
 * B11: the shortcuts sheet is page-aware. A screen registers the keys it handles while it is mounted, and the sheet
 * lists them under "On {page}". One page at a time: the last screen to register wins, and it clears only its own.
 * Pass a stable `keys` array (a module constant), or the sheet re-renders on every render of the screen.
 */
let current: ChPageKeys | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function usePageKeys(page: string, keys: readonly ChPageKey[] | null) {
  useEffect(() => {
    if (!keys?.length) return;
    const mine: ChPageKeys = { page, keys };
    current = mine;
    emit();
    return () => {
      if (current !== mine) return;
      current = null;
      emit();
    };
  }, [page, keys]);
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

/** The open screen's keys, or null when it registered none. */
export function usePageKeysNow(): ChPageKeys | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
