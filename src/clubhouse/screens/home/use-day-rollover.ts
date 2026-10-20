'use client';

import { useEffect, useRef } from 'react';
import type { ChHomeClock } from '../../data/home';
import { useRefresh } from '../../lib/use-refresh';

/** YYYY-MM-DD for an instant in a zone (the loader's `ymd`). */
export function dayIn(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** The device's zone: the fallback when the page carries no team clock (fixtures, previews). */
export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Milliseconds from `now` to the next midnight in `tz`. On a daylight-saving day it can be an hour out; the check it schedules reads the real date, and schedules again if the day has not turned. */
export function msToNextMidnight(now: Date, tz: string): number {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now)) p[x.type] = x.value;
  const elapsed = ((Number(p.hour) * 60 + Number(p.minute)) * 60 + Number(p.second)) * 1000 + now.getMilliseconds();
  return Math.max(1000, 86_400_000 - elapsed);
}

/** A check just after midnight, so a device clock a moment ahead of the server's does not read the old day again. */
const AFTER_MIDNIGHT_MS = 5_000;
/** When a refresh still carries the old day (the server's clock a little behind), ask again after this long, a few times at most. */
const RETRY_MS = 60_000;
const MAX_TRIES = 3;

/**
 * Home's "today" (the date line, the greeting, the week strip's today, Today's rows, the day card, "Tomorrow") is read on
 * the server, on the team's clock. A page left open past midnight kept the day it loaded. This compares the team-local
 * date now with the date the page was read on, in the same zone (the team's; the device's only when the page carries no
 * clock), and when the day has turned it reads the page again (`router.refresh`): at the team's next midnight, and when
 * the page comes back into view (visibilitychange, focus, pageshow), since a phone suspends timers in the background.
 * A frozen clock (preview, tests) never rolls.
 */
export function useHomeDayRollover(clock: ChHomeClock | undefined, frozen: boolean): void {
  const { refresh } = useRefresh();
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  const tz = clock?.tz;
  const loadedDay = clock?.day;

  useEffect(() => {
    if (frozen) return;
    const zone = tz ?? deviceZone();
    let baseline = loadedDay ?? dayIn(new Date(), zone);
    let tries = 0;
    let midnight: number | undefined;
    let retry: number | undefined;

    const check = () => {
      if (retry !== undefined || tries >= MAX_TRIES) return;
      const day = dayIn(new Date(), zone);
      if (day <= baseline) return;
      tries += 1;
      refreshRef.current();
      // Without a team clock the refreshed page carries none either: trust the refresh for the new day.
      if (!loadedDay) {
        baseline = day;
        return;
      }
      // With one, the refreshed page brings its own day and this effect starts again; if it still carries the old day, ask again.
      retry = window.setTimeout(() => {
        retry = undefined;
        check();
      }, RETRY_MS);
    };
    const schedule = () => {
      midnight = window.setTimeout(() => {
        check();
        schedule();
      }, msToNextMidnight(new Date(), zone) + AFTER_MIDNIGHT_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    // A page restored from the back-forward cache, or read just before midnight, can already be a day behind.
    check();
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    return () => {
      window.clearTimeout(midnight);
      window.clearTimeout(retry);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
    };
  }, [tz, loadedDay, frozen]);
}
