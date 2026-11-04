'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { arrivalDetail, detailFromHash, hashOf, isDetailHash, summaryUrl, type StatsDetailId, type StatsScreen } from './detail-route';

/** What decides an arrival: `ready` opens it; `failed` holds it until a retry lands; `empty` lands on the summary, except Goals (no rounds read). */
export type StatsArrivalState = 'ready' | 'failed' | 'empty';

const scrollKey = () => `ch-stats-scroll:${window.location.pathname}${window.location.search}`;

function readScroll(): { summary: number; detail: number } | null {
  try {
    const raw = window.sessionStorage.getItem(scrollKey());
    return raw ? (JSON.parse(raw) as { summary: number; detail: number }) : null;
  } catch {
    return null;
  }
}

/**
 * One pushed detail over a phone Stats summary, on the house's history contract (a sibling of `usePhoneStackHistory`, which pushes
 * the same URL with no hash): open pushes `{ chPhone: 1 }` with the detail's hash, close is `history.back()`, and `popstate` reads the
 * hash. So SectionStrip's retap (`history.go(-level)`) and PhoneScreen's edge swipe work unchanged, and a hash change asks nothing of the server.
 *
 * An arrival with a target replaces the entry with the summary's address, then pushes the detail, so one Back reaches the summary. An
 * entry that already carries `{ chPhone: 1 }` is a Back onto a detail (from the round page) or a refresh: the detail opens with no new entry.
 */
export function useStatsDetail({ screen, tab, state = 'ready' }: { screen: StatsScreen; tab?: string; state?: StatsArrivalState }) {
  const [detail, setDetail] = useState<StatsDetailId | null>(null);
  /** The opener's detail when focus should return to its card on the pop. */
  const lastOpen = useRef<StatsDetailId | null>(null);
  const closing = useRef(false);
  const arrived = useRef(false);
  const detailScroll = useRef<HTMLElement | null>(null);
  /** Scroll to put back on a back-forward arrival; null otherwise. */
  const [restoreTo, setRestoreTo] = useState<{ summary: number; detail: number } | null>(null);

  const arrive = useCallback(() => {
    const hash = window.location.hash;
    const entry = window.history.state as { chPhone?: unknown } | null;
    const named = detailFromHash(hash, screen);
    if (entry?.chPhone === 1 && named) {
      // Back onto a detail (or a refresh of one): no replace and push, or the history doubles.
      arrived.current = true;
      lastOpen.current = named;
      setDetail(named);
      setRestoreTo(readScroll());
      return;
    }
    const target = arrivalDetail({ tab, hash }, screen);
    if (!target) {
      arrived.current = true;
      if (isDetailHash(hash)) window.history.replaceState(window.history.state, '', summaryUrl(window.location));
      return;
    }
    if (state === 'failed') return; // Held: the hash stays, and a Try again that lands opens it.
    arrived.current = true;
    window.history.replaceState(window.history.state, '', summaryUrl(window.location));
    if (state === 'empty' && target !== 'goals') return;
    window.history.pushState({ chPhone: 1 }, '', `#${hashOf(target)}`);
    lastOpen.current = target;
    setDetail(target);
  }, [screen, tab, state]);

  // Before the first paint: a deep link shows its detail in place, never a slide over a page nobody saw.
  useLayoutEffect(() => {
    if (!arrived.current) arrive();
  }, [arrive]);

  useEffect(() => {
    const onPop = () => {
      closing.current = false;
      setDetail(detailFromHash(window.location.hash, screen));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [screen]);

  /** Push a detail. A second tap while one is open does nothing (the summary is inert by then, and this holds for a double tap inside one frame). */
  const open = useCallback(
    (id: StatsDetailId) => {
      if (detail) return;
      window.history.pushState({ chPhone: 1 }, '', `#${hashOf(id)}`);
      lastOpen.current = id;
      setDetail(id);
    },
    [detail],
  );

  /** Pop: the hash goes, and `popstate` closes the detail. */
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    window.history.back();
  }, []);

  /** Open a part from the Strokes gained detail: it replaces the page, so Back still reaches the summary, and focus lands on that part's card. */
  const replace = useCallback((id: StatsDetailId) => {
    window.history.replaceState(window.history.state, '', `#${hashOf(id)}`);
    lastOpen.current = id;
    setDetail(id);
  }, []);

  // Escape pops; a sheet over the detail takes it first (the sheet's own handler), and a scrub ends itself (07 interrupt 10).
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('dialog[open], [role="dialog"]')) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, close]);

  // Back on the summary, focus returns to the card that opened the detail (for a part reached by Open a part, to that part's card).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (detail) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const id = lastOpen.current;
    const frame = requestAnimationFrame(() => {
      if (id) document.querySelector<HTMLElement>(`[data-go="${id}"]`)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [detail]);

  /** A link is leaving an open detail (a round, a player): keep both scroll positions for the way back (`sessionStorage`, this tab only). */
  const saveScroll = useCallback(() => {
    try {
      window.sessionStorage.setItem(scrollKey(), JSON.stringify({ summary: window.scrollY, detail: detailScroll.current?.scrollTop ?? 0 }));
    } catch {
      /* Private browsing: the detail simply opens at its top. */
    }
  }, []);

  return { detail, open, close, replace, saveScroll, detailScroll, restoreTo };
}
