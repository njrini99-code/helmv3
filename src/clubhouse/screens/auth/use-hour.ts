'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';
import { formatLastHere, formatWelcomeDate } from '../../data/welcome-shape';
import { hourOfMinutes } from './scene-sky';

/**
 * The viewer's own clock, for the sky and the greeting.
 *
 * A server has its own hour and zone, so anything it drew from the clock would
 * disagree with the viewer after hydration (React #418, audit HYD-08). The
 * server snapshot is therefore `null`: the server markup and the hydration
 * pass draw the neutral state, and the viewer's real time lands right after.
 *
 * It is one external store, read every 30 seconds and again when the tab
 * becomes visible (timers are throttled in the background), and the snapshot
 * is whole minutes since midnight, so a tick inside the same minute does not
 * re-render anything.
 */
const TICK_MS = 30_000;

/**
 * A clock that is held still: the dev preview and the tests use it to show the
 * course at a chosen time of day. The real screens never mount it.
 */
export const FixedClock = createContext<Date | null>(null);

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const minuteOfDay = (): number => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

const notify = () => listeners.forEach((l) => l());
const onVisible = () => {
  if (document.visibilityState === 'visible') notify();
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = setInterval(notify, TICK_MS);
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

/** Minutes since local midnight, or null on the server and during hydration. */
export function useMinuteOfDay(): number | null {
  const fixed = useContext(FixedClock);
  const live = useSyncExternalStore(subscribe, minuteOfDay, () => null);
  return fixed ? fixed.getHours() * 60 + fixed.getMinutes() : live;
}

/** The current moment for a label: the held clock when there is one. */
function useNowSnapshot(): () => Date {
  const fixed = useContext(FixedClock);
  return () => fixed ?? new Date();
}

/** The local decimal hour (8:30 is 8.5), or null on the server and during hydration. */
export function useLocalHour(): number | null {
  const minutes = useMinuteOfDay();
  return minutes === null ? null : hourOfMinutes(minutes);
}

/** Today's date in the viewer's locale and zone ("Tuesday, October 14"), or null on the server and during hydration. */
export function useLocalDateLabel(): string | null {
  const now = useNowSnapshot();
  return useSyncExternalStore(subscribe, () => formatWelcomeDate(now()), () => null);
}

/** When the person was last here, worded against their own clock ("Sunday at 9:12 pm"), or null (no record, the server, hydration). */
export function useLastHereLabel(lastSeenAt: string | null): string | null {
  const now = useNowSnapshot();
  return useSyncExternalStore(subscribe, () => (lastSeenAt ? formatLastHere(lastSeenAt, now()) : null), () => null);
}
