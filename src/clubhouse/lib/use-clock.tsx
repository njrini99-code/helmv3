'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CH_CLOCK_COOKIE, parseChClock, type ChClock } from './clock-cookie';
import { restyleClock } from './clock-format';

/** The other tabs of this browser hear a change through this key (a cookie change raises no event). */
const CLOCK_STORAGE_KEY = 'ch_clock';

interface ClockValue {
  clock: ChClock;
  setClock: (next: ChClock) => void;
}

/** Outside a provider (a test, a preview frame) times read in 12 hours, as the app always has. */
const Clock = createContext<ClockValue>({ clock: '12', setClock: () => {} });

/**
 * The device's clock for every time on the screen. `clock` is the server's reading of the cookie, so a 24-hour device's
 * first frame is already in 24 hours and no time flips after hydration. A change in Settings is state here: every time
 * that reads `useChClock` redraws at once, with no request, and the cookie keeps it for the next load.
 */
export function ChClockProvider({ clock, children }: { clock: ChClock; children: ReactNode }) {
  const [current, setCurrent] = useState(clock);
  const setClock = useCallback((next: ChClock) => {
    setCurrent(next);
    document.cookie = `${CH_CLOCK_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    try {
      window.localStorage.setItem(CLOCK_STORAGE_KEY, next);
    } catch {
      // Private mode or full storage: this tab and the cookie still have it.
    }
  }, []);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CLOCK_STORAGE_KEY) setCurrent(parseChClock(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const value = useMemo(() => ({ clock: current, setClock }), [current, setClock]);
  return createElement(Clock.Provider, { value }, children);
}

/** The clock this device reads times in, and the way to change it (Settings). */
export function useChClockPref(): ClockValue {
  return useContext(Clock);
}

/** "12" or "24": for a component that draws a time from minutes or hours (`clockFromHour`, `formatTime`). */
export function useChClock(): ChClock {
  return useContext(Clock).clock;
}

/** Rewrites the clock times in a server-written 12-hour label for this device's clock. The same function every render, so it is safe in a dependency list. */
export function useChClockText(): (text: string) => string {
  const { clock } = useContext(Clock);
  return useCallback((text: string) => restyleClock(text, clock), [clock]);
}
