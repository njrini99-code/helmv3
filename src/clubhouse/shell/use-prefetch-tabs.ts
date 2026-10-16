'use client';

import { useRouter } from 'next/navigation';
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';
import { useEffect, useRef } from 'react';

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
 * When each tab's page was last fetched whole, as far as this tab knows; `null` once a refresh has dropped it. A fetch
 * Next answered from what it already held does not move the time, so a page is never taken for newer than it is: the
 * error goes the other way (a save's revalidate drops the pages unseen here), which costs one refresh more than needed.
 */
const fetchedAt = new Map<string, number | null>();

/** Whether the page shown on arrival, held from an earlier fetch, should be brought up to date in place. */
export function needsRefresh(at: number | null | undefined, now: number): boolean {
  if (at == null) return false;
  const age = now - at;
  // Past what Next holds, the arrival fetched the page itself: it is new.
  return age > CH_TAB_FRESH_MS && age <= CH_TAB_HELD_MS;
}

type Router = ReturnType<typeof useRouter>;

function fetchAhead(router: Router, href: string, now: number): void {
  const at = fetchedAt.get(href);
  // Not held (never fetched, dropped by a refresh, or past Next's hold): this call fetches it now.
  if (at == null || now - at > CH_TAB_HELD_MS) fetchedAt.set(href, now);
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

/**
 * Fetches the phone tabs' pages whole ahead of a tap, so a switch to one shows the page at once instead of its route
 * skeleton and then the page (native-feel audit 2026-10-08, P0-2). A default prefetch stops at a dynamic route's loading
 * boundary, and since the app-wide 30s dynamic router cache was removed (it made Fairway, Baseball and Lift Lab serve
 * stale pages, #2189) every switch drew the skeleton, then the page 360–580ms later (WebKit, local production build,
 * 2026-10-16). A full prefetch is held by Next for its static stale time and only for these pages: nothing else changes.
 *
 * Shown and then brought up to date: a page held for more than 30s is shown at once and refreshed in place once it has
 * painted (`router.refresh()`, no skeleton), so what settles on screen is never more than 30s old, the 10-08 contract.
 * A refresh drops every page Next held, so the other tabs are fetched again when the thread is idle. The tabs are asked
 * for once the document's first page has painted and after every arrival; Next fetches only what it no longer holds.
 * The last two other sections left (Roster, Settings, …) are kept the same way, so going back to one is instant too
 * (`sections` lists them all; only the ones visited are fetched). Not as the
 * strip opens: with a real network that fetch raced the tap and the page was asked for twice (WebKit, 700ms latency:
 * skeleton at 944ms, page at 1711ms). Skipped with Data Saver on or offline. Next prefetches only in production builds.
 */
export function usePrefetchTabs(hrefs: readonly string[], current: string, sections: readonly string[] = []): void {
  const router = useRouter();
  const key = hrefs.join('|');
  const sectionKey = sections.join('|');
  const first = useRef(true);
  const left = useRef(current);
  useEffect(() => {
    const arrival = !first.current;
    first.current = false;
    // A section that is not a tab, just left: kept whole too, so coming back to it is a revisit, not a skeleton.
    const was = left.current;
    left.current = current;
    if (arrival && was !== current && !key.split('|').includes(was) && sectionKey.split('|').includes(was)) rememberVisit(was);
    if (!prefetchAllowed(typeof navigator === 'undefined' ? undefined : navigator)) return;
    const fetchOthers = () => {
      for (const href of [...key.split('|'), ...visited]) if (href && href !== current) fetchAhead(router, href, Date.now());
    };
    let cancel = () => {};
    if (arrival && needsRefresh(fetchedAt.get(current), Date.now())) {
      // Once the held page has painted: bring it up to date in place, then fetch the others again behind the refresh,
      // which drops every page Next held (this one included: it is fetched again once it is left).
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          router.refresh();
          for (const href of fetchedAt.keys()) fetchedAt.set(href, null);
          const later = window.setTimeout(() => {
            cancel = whenIdle(fetchOthers);
          }, 1000);
          cancel = () => window.clearTimeout(later);
        });
      });
      cancel = () => cancelAnimationFrame(frame);
    } else if (!arrival) {
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
  for (const gone of visited.splice(CH_VISITED_KEPT)) fetchedAt.delete(gone);
}

/** Tests only: forget what was fetched. */
export function resetPrefetchTabsForTests(): void {
  fetchedAt.clear();
  visited.length = 0;
}
