'use client';

import { useRouter } from 'next/navigation';
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';
import { useContext, useEffect, useRef } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { fullPrefetchAllowed } from '../lib/prefetch-guard';
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

export function fetchAhead(router: Router, href: string, now: number): void {
  // CoachHelm records what it returns as shown: never fetched ahead (CH-R1, lib/prefetch-guard.ts).
  if (!fullPrefetchAllowed(href)) return;
  // Not held (never fetched, dropped by a refresh, or past Next's hold): this call fetches it now.
  if (!held(fetchedAt.get(href), shownAt.get(href), now)) fetchedAt.set(href, now);
  router.prefetch?.(href, { kind: PrefetchKind.FULL });
}

/** When the main thread is idle (iOS Safari has no requestIdleCallback, so a short timeout), cancellable. */
export function whenIdle(run: () => void, timeout = 2000): () => void {
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
 * Fetches the main sections' pages whole ahead of a tap, so a switch to one shows the page at once instead of its route
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
 * The last two other sections left (Roster, Settings, …) are kept the same way, so going back to one is instant too.
 * The rest of `sections` (the pages the strip reaches that are not tabs: Roster, Settings, Recruiting, …) are fetched
 * last, by an idle sweep (`sweepSections`) so the first visit to one shows the page, not a skeleton first (native-feel
 * audit 2026-10-08, P0-2; L10, 2026-10-19). Not as the
 * strip opens: with a real network that fetch raced the tap and the page was asked for twice (WebKit, 700ms latency:
 * skeleton at 944ms, page at 1711ms). Skipped with Data Saver on or offline.
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
    const sectionList = sectionKey ? sectionKey.split('|') : [];
    let stopSweep = () => {};
    const fetchOthers = () => {
      for (const href of [...tabs, ...visited]) if (href !== current) fetchAhead(router, href, Date.now());
      // After the tabs and the sections kept: the others, when idle, two at a time.
      stopSweep = sweepSections(router, () => sweepQueue(sectionList, tabs, current, Date.now()));
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
    return () => {
      cancel();
      stopSweep();
    };
  }, [key, sectionKey, current, router]);
}

/** How many sections one batch of the idle sweep asks for, and how long the sweep rests between batches. */
export const CH_SWEEP_AT_ONCE = 2;
export const CH_SWEEP_GAP_MS = 1500;
/**
 * A section asked for by the sweep is not asked for again for this long, whatever happened to it. A refresh (every tab
 * revisit after 30s) drops every page Next held; without this each of them would render all of the sections again.
 */
export const CH_SWEEP_AGAIN_MS = 120_000;
const sweptAt = new Map<string, number>();

/**
 * The sections the sweep has still to ask for, in the strip's order: not a tab, not the page on screen, not one kept as a
 * visit (those were just asked for), not held by Next, and not asked for within the last `CH_SWEEP_AGAIN_MS`.
 */
export function sweepQueue(sections: readonly string[], tabs: readonly string[], current: string, now: number): string[] {
  return sections.filter((href) => {
    if (tabs.includes(href) || href === current || visited.includes(href)) return false;
    if (held(fetchedAt.get(href), shownAt.get(href), now)) return false;
    const asked = sweptAt.get(href);
    return asked === undefined || now - asked > CH_SWEEP_AGAIN_MS;
  });
}

/**
 * Asks for the queue's sections whole, `CH_SWEEP_AT_ONCE` at a time. Each batch waits for the thread to be idle, and the
 * next for the gap after it, so a phone is never fetching everything at once; Data Saver or going offline stops it. The
 * queue is read afresh for every batch (a page visited meanwhile is no longer waiting). Returns what stops it.
 */
export function sweepSections(router: Router, queue: () => string[]): () => void {
  let cancel = () => {};
  const batch = () => {
    cancel = whenIdle(() => {
      if (!prefetchAllowed(typeof navigator === 'undefined' ? undefined : navigator)) return;
      const now = Date.now();
      const next = queue().slice(0, CH_SWEEP_AT_ONCE);
      if (!next.length) return;
      for (const href of next) {
        sweptAt.set(href, now);
        fetchAhead(router, href, now);
      }
      const later = window.setTimeout(batch, CH_SWEEP_GAP_MS);
      cancel = () => window.clearTimeout(later);
    });
  };
  batch();
  return () => cancel();
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

/**
 * A write that changes what the section pages show (a round submitted, discarded, or its type changed): forget what was
 * fetched ahead and shown, so the next tab tap fetches the page again instead of serving one held from before the write
 * for up to 300s (A21). Next's own copies go with the server's revalidate or the caller's refresh.
 */
export function invalidatePrefetchTabs(): void {
  fetchedAt.clear();
  shownAt.clear();
}

/** Whether Next still holds `href` from a fetch ahead or a visit in the last 300s, as far as this tab knows. */
export function heldPage(href: string, now: number): boolean {
  return held(fetchedAt.get(href), shownAt.get(href), now);
}

/**
 * A row's push target, fetched whole the moment a finger lands on the row (A13), so the page it opens is there by the time
 * the tap ends instead of its skeleton. Not again within the fresh window (Next answers from what it holds), nor when the
 * device saves data or is offline. One full prefetch per press.
 */
export function prefetchOnPress(router: Router, href: string, now: number): void {
  if (!prefetchAllowed(typeof navigator === 'undefined' ? undefined : navigator)) return;
  const at = fetchedAt.get(href);
  if (at != null && heldPage(href, now) && now - at <= CH_TAB_FRESH_MS) return;
  fetchAhead(router, href, now);
}

/**
 * `onPointerDown` for a row link that pushes `href`: fetches the page ahead as the press starts (A13). The row is also
 * marked `data-ch-ahead`, so the first few on screen are fetched while the page is idle (useIdleRowsAhead, row 13).
 */
export function usePressPrefetch(): (href: string | null | undefined) => { onPointerDown?: () => void; 'data-ch-ahead'?: string } {
  // The context, not useRouter, which throws outside the app router (a preview harness, a test rendering one row): there
  // the press fetches nothing. The mark never depends on it, so a row reads the same wherever it renders.
  const router = useContext(AppRouterContext) as Router | null;
  return (href) => {
    if (!href) return {};
    return router ? { onPointerDown: () => prefetchOnPress(router, href, Date.now()), 'data-ch-ahead': href } : { 'data-ch-ahead': href };
  };
}

/** How many of a page's push rows on screen are fetched ahead while it is idle. */
export const CH_ROWS_AHEAD = 3;
/** How many idle looks a page gets for its rows (a list that streams in after its skeleton is not there at the first). */
const ROWS_AHEAD_LOOKS = 3;

/**
 * The first few push rows on screen (those `usePressPrefetch` marks), fetched whole once a page has settled and the
 * thread is idle (A13 extension, row 13), so the row a reader is about to open is likely there already instead of its
 * skeleton. Once per page: the top `CH_ROWS_AHEAD` rows that are on screen, in reading order; a scroll later leaves the
 * rest to the press. The press's guards hold: nothing on Data Saver or offline, nothing Next holds fresh (`held`, and a
 * held page past `CH_TAB_FRESH_MS` is fetched again, as `needsRefresh` would bring it up to date), never CoachHelm
 * (CH-R1). Mounted once by the shell.
 */
export function useIdleRowsAhead(pathname: string): void {
  const router = useContext(AppRouterContext) as Router | null;
  useEffect(() => {
    if (!router || typeof IntersectionObserver === 'undefined') return;
    let io: IntersectionObserver | null = null;
    let looks = 0;
    let cancel = () => {};
    const look = () => {
      cancel = whenIdle(() => {
        if (!prefetchAllowed(typeof navigator === 'undefined' ? undefined : navigator)) return;
        const rows = [...document.querySelectorAll<HTMLElement>('[data-ch-ahead]')];
        if (!rows.length) {
          if (++looks < ROWS_AHEAD_LOOKS) look();
          return;
        }
        io = new IntersectionObserver((entries) => {
          io?.disconnect();
          const seen = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
            .map((e) => e.target.getAttribute('data-ch-ahead'))
            .filter((href, i, all): href is string => !!href && all.indexOf(href) === i)
            .slice(0, CH_ROWS_AHEAD);
          const now = Date.now();
          for (const href of seen) prefetchOnPress(router, href, now);
        });
        for (const row of rows) io.observe(row);
      });
    };
    look();
    return () => {
      cancel();
      io?.disconnect();
    };
  }, [pathname, router]);
}

/**
 * Pages the reader is likely to open next (the Stats windows either side of the one shown, row 15), fetched whole once
 * the page has settled and the thread is idle, so the switch shows them at once instead of dimming the figures while it
 * loads. The same guards as a press: nothing on Data Saver or offline, nothing Next holds fresh, never CoachHelm (CH-R1).
 * Pass none while a change is in flight; outside the app router it does nothing.
 */
export function useIdleFetchAhead(hrefs: readonly string[]): void {
  const router = useContext(AppRouterContext) as Router | null;
  const key = hrefs.join('|');
  useEffect(() => {
    if (!key || !router) return;
    return whenIdle(() => {
      const now = Date.now();
      for (const href of key.split('|')) prefetchOnPress(router, href, now);
    });
  }, [key, router]);
}

/** Tests only: forget what was fetched. */
export function resetPrefetchTabsForTests(): void {
  fetchedAt.clear();
  shownAt.clear();
  sweptAt.clear();
  visited.length = 0;
  documentPage = true;
}
