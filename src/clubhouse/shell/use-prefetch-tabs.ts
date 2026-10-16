'use client';

import { useRouter } from 'next/navigation';
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';
import { useEffect, useRef } from 'react';
import { chReturning } from '../lib/pop-mark';

/** Whether the device asked to save data or is offline: then nothing is fetched ahead of a tap. */
export function prefetchAllowed(nav: Navigator | undefined): boolean {
  if (!nav) return false;
  if (nav.onLine === false) return false;
  return (nav as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData !== true;
}

/** How old a page shown from what was fetched ahead may be before it is brought up to date in place (P0-2, 2026-10-08). */
export const CH_TAB_FRESH_MS = 30_000;
/** How long Next keeps a full prefetch: `staleTimes.static`, left at Next's default (300s). */
export const CH_TAB_HELD_MS = 300_000;

/**
 * When the data Next holds for each page was fetched, as far as this tab knows; `null` once a refresh has dropped it. A
 * fetch Next answered from what it already held does not move the time, so a page is never taken for newer than it is:
 * the error goes the other way (a save's revalidate drops the pages unseen here), which costs one refresh more than
 * needed. Never forgotten: a page left off the list may still be held.
 */
const fetchedAt = new Map<string, number | null>();
/**
 * When each page was last shown. Next keeps what a navigation showed (its back/forward cache) and answers a full
 * prefetch from it for 300s from then, without asking the server, so a page shown after it was fetched is held longer
 * than its fetch alone says (next 16.3, segment-cache/cache.js). A refresh empties that cache.
 */
const shownAt = new Map<string, number>();

/** Whether Next still holds the page: a full prefetch of it, or what it showed of it, from the last 300s. */
export function held(at: number | null | undefined, shown: number | undefined, now: number): boolean {
  if (at == null) return false;
  return now - Math.max(at, shown ?? at) <= CH_TAB_HELD_MS;
}

/** Whether the page shown on arrival, held from an earlier fetch, should be brought up to date in place. */
export function needsRefresh(at: number | null | undefined, shown: number | undefined, now: number): boolean {
  // Not held: the arrival fetched the page itself, and it is new.
  return held(at, shown, now) && now - (at as number) > CH_TAB_FRESH_MS;
}

type Router = ReturnType<typeof useRouter>;

function fetchAhead(router: Router, href: string, now: number): void {
  // Not held (never fetched, dropped by a refresh, or past Next's hold): this call fetches it now.
  if (!held(fetchedAt.get(href), shownAt.get(href), now)) fetchedAt.set(href, now);
  router.prefetch?.(href, { kind: PrefetchKind.FULL });
}

/** When the main thread is idle (iOS Safari has no requestIdleCallback, so a short timeout), cancellable. */
function whenIdle(run: () => void, timeout = 2000): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 400);
  return () => window.clearTimeout(id);
}

/** Whether the document's first page is still to be seen: a hook mounted after it (a remount) did not load the page. */
let documentPage = true;

/**
 * Fetches the phone tabs' pages whole ahead of a tap, so a switch to one shows the page at once instead of its route
 * skeleton and then the page (native-feel audit 2026-10-08, P0-2). A default prefetch stops at a dynamic route's loading
 * boundary, and since the app-wide 30s dynamic router cache was removed (it made Fairway, Baseball and Lift Lab serve
 * stale pages, #2189) every switch drew the skeleton, then the page 360–580ms later (WebKit, local production build,
 * 2026-10-16). A full prefetch is held by Next for its static stale time and only for these pages: nothing else changes.
 *
 * Shown and then brought up to date: a page held for more than 30s is shown at once and refreshed in place once it has
 * painted (`router.refresh()`, no skeleton), so what settles on screen is never more than 30s old, the 10-08 contract.
 * A held page reached from outside the strip's sections (Save for later lands on the rounds library from the round, and
 * its save does not revalidate) is refreshed whatever its age: what changed there is not in what was held. Not on a
 * Back, which returns to the page as it was left. A refresh drops every page Next held, so the other tabs are fetched
 * again when the thread is idle; a tap during the refresh wins, as Next drops a refresh a navigation overtakes (WebKit,
 * 700ms latency, a second tap 200–900ms after the first: 3 of 3 ended on it). The tabs are asked for once the document's
 * first page has painted and after every arrival; Next fetches only what it no longer holds.
 * The last two other sections left (Roster, Settings, …) are kept the same way, so going back to one is instant too
 * (`sections` lists them all; only the ones visited are fetched). Not as the
 * strip opens: with a real network that fetch raced the tap and the page was asked for twice (WebKit, 700ms latency:
 * skeleton at 944ms, page at 1711ms). Skipped with Data Saver on or offline, and off the phone (empty lists).
 * Next prefetches only in production builds.
 */
export function usePrefetchTabs(hrefs: readonly string[], current: string, sections: readonly string[] = []): void {
  const router = useRouter();
  const key = hrefs.join('|');
  const sectionKey = sections.join('|');
  const left = useRef(current);
  useEffect(() => {
    const tabs = key ? key.split('|') : [];
    const strip = new Set([...tabs, ...(sectionKey ? sectionKey.split('|') : [])]);
    const now = Date.now();
    const first = documentPage;
    documentPage = false;
    const was = left.current;
    left.current = current;
    const arrival = !first && was !== current;
    // A section that is not a tab, just left: kept whole too, so coming back to it is a revisit, not a skeleton.
    if (arrival && !tabs.includes(was) && strip.has(was)) rememberVisit(was);
    let refresh = false;
    if (strip.has(current) && (first || arrival)) {
      const at = fetchedAt.get(current);
      const shown = shownAt.get(current);
      const returning = arrival && chReturning();
      refresh = arrival && (needsRefresh(at, shown, now) || (held(at, shown, now) && !strip.has(was) && !returning));
      // Shown from what Next held: the data is as old as its fetch. Otherwise the page was fetched for this arrival (or
      // is the document's own), except on a Back to a page shown before, which Next restores as it was, however old.
      if (!held(at, shown, now) && !(returning && shown !== undefined)) fetchedAt.set(current, now);
      shownAt.set(current, now);
    }
    if (!tabs.length || !prefetchAllowed(typeof navigator === 'undefined' ? undefined : navigator)) return;
    const fetchOthers = () => {
      for (const href of [...tabs, ...visited]) if (href !== current) fetchAhead(router, href, Date.now());
    };
    let cancel = () => {};
    if (refresh) {
      // Once the held page has painted: bring it up to date in place, then fetch the others again behind the refresh,
      // which drops every page Next held and empties its back/forward cache.
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          router.refresh();
          const at = Date.now();
          for (const href of fetchedAt.keys()) fetchedAt.set(href, null);
          shownAt.clear();
          fetchedAt.set(current, at);
          shownAt.set(current, at);
          const later = window.setTimeout(() => {
            cancel = whenIdle(fetchOthers);
          }, 1000);
          cancel = () => window.clearTimeout(later);
        });
      });
      cancel = () => cancelAnimationFrame(frame);
    } else if (first) {
      // The document's first page: as soon as it has painted, not at the first idle moment, which on a phone came a
      // second or more later and left a tap in that second to the skeleton.
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(fetchOthers);
      });
      cancel = () => cancelAnimationFrame(frame);
    } else {
      cancel = whenIdle(fetchOthers);
    }
    return () => cancel();
  }, [key, sectionKey, current, router]);
}

/** The sections other than the tabs that were visited last, newest first, kept whole like the tabs. */
const visited: string[] = [];
/** How many: each costs a full page render when it is fetched again (after a refresh or a save). */
export const CH_VISITED_KEPT = 2;
function rememberVisit(href: string): void {
  const at = visited.indexOf(href);
  if (at >= 0) visited.splice(at, 1);
  visited.unshift(href);
  visited.splice(CH_VISITED_KEPT);
}

/** Tests only: forget what was fetched. */
export function resetPrefetchTabsForTests(): void {
  fetchedAt.clear();
  shownAt.clear();
  visited.length = 0;
  documentPage = true;
}
