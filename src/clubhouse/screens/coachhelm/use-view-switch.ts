'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react';
import { fetchAhead, prefetchAllowed, whenIdle } from '../../shell/use-prefetch-tabs';

/**
 * A switch between views of the CoachHelm page (Board, Ask, Standing, Deep dive), each its own address. The same
 * pattern as Stats' window switch (F-55): the tap takes effect on the control at once (`shown`: the view being loaded, not the one
 * still on screen), the page stays as it is, marked busy (`pending`: the owner sets `aria-busy`, and coachhelm.css dims what is
 * changing), and the new view replaces it in one swap when the server has it. Nothing blanks and no skeleton is drawn for a
 * switch (the route's Suspense is not keyed by view, so React keeps the revealed view until the next one is ready).
 *
 * `active` is the view the server last drew. Choosing the one already shown does nothing; choosing the one on screen while
 * another is loading sends the page back to it.
 *
 * The other `views` are fetched whole once the page is idle, as the phone's tabs are (use-prefetch-tabs): a default prefetch
 * stops at the route's loading boundary, so every switch waited on the server for the whole page (owner, desktop Safari,
 * 2026-10-16). Skipped with Data Saver on or offline; Next prefetches only in production builds.
 *
 * `enter`: the view that lands from a switch settles in instead of snapping (owner, desktop, 2026-10-29: "the transition in the
 * CoachHelm tabs and subtabs is not good"). The view it replaces was dimming (coachhelm.css) from the tap on, so the new one starts at
 * the opacity the old had reached and rises to full over the quick beat: one continuous cross-fade, never a dip and never a blank.
 * It is the attributes for the owner's `<main>` (`data-ch-enter` and the starting opacity), or nothing: on a hard load, on a page
 * reached from anywhere else, and after a switch that ended without a new view (a tap back to the one on screen). Reduced motion
 * and Animations off zero the beat, so the view swaps at once.
 */
export function useViewSwitch<V extends string>(active: V, hrefOf: (view: V) => string, views: readonly V[] = []) {
  const router = useRouter();
  const others = views.filter((v) => v !== active).map(hrefOf).join('|');
  useEffect(() => {
    if (!others || !prefetchAllowed(typeof navigator === 'undefined' ? undefined : navigator)) return;
    return whenIdle(() => {
      for (const href of others.split('|')) fetchAhead(router, href, Date.now());
    });
  }, [others, router]);
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<V | null>(null);
  // The server answered with a new view (this owner is replaced, so this is the same-view answer), or the navigation ended
  // without one: either way the tap is no longer waiting, and the control goes back to the view that is on screen.
  useEffect(() => {
    if (!pending) setTarget(null);
  }, [pending, active]);
  const shown = target ?? active;
  const go = (view: V) => {
    if (view === shown) return;
    setTarget(view);
    const href = hrefOf(view);
    // A tap back to the view on screen ends the switch here: nothing new will land, so nothing is to settle in. A second tap
    // while the first is loading keeps the first tap's time, which is when the page began to dim.
    inFlight = view === active ? null : { href, at: inFlight && pending ? inFlight.at : now() };
    start(() => router.push(href));
  };
  const enter = useEnter(hrefOf(active));
  // The switch ended and this owner is still the one on screen (the server answered with the same view, or the push was given
  // up): a view that lands replaces this owner in the same commit, so it never gets here. Nothing is landing, so a later page
  // must not take the settle meant for it.
  const waited = useRef(false);
  useEffect(() => {
    if (pending) waited.current = true;
    else if (waited.current) {
      waited.current = false;
      inFlight = null;
    }
  }, [pending]);
  return { shown, pending, go, enter };
}

/** The switch the tap started: where it goes and when the tap was, for the view that lands (one at a time, as the tabs are). */
let inFlight: { href: string; at: number } | null = null;
const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

/** How long a switch may take and still count as the one that lands; past it the view arrives as any other page does. */
const ENTER_WINDOW_MS = 10_000;
/** The dim's own beat and its depth (coachhelm.css: --ch-dur-quick to 0.55 on the v2 ease-out, a quint). */
const DIM_MS = 180;
const DIM_TO = 0.55;

/** The opacity the dimming view had reached `ms` after the tap: where the view that replaces it starts. */
export function dimmedAt(ms: number): number {
  const x = Math.min(1, Math.max(0, ms / DIM_MS));
  return 1 - (1 - DIM_TO) * (1 - (1 - x) ** 5);
}

export type ChViewEnter = { 'data-ch-enter': ''; style: CSSProperties } | Record<string, never>;

/**
 * The settle for a view that has just mounted from a switch to `href`, read once when it mounts (so a hard load, whose server and
 * client renders both find no switch, hydrates as it was drawn), and dropped after the beat so a part of the page that is drawn
 * again later does not settle a second time.
 */
function useEnter(href: string): ChViewEnter {
  const [from] = useState(() => (inFlight && inFlight.href === href && now() - inFlight.at < ENTER_WINDOW_MS ? dimmedAt(now() - inFlight.at) : null));
  const [on, setOn] = useState(from !== null);
  useEffect(() => {
    if (from === null) return;
    if (inFlight?.href === href) inFlight = null;
    const t = window.setTimeout(() => setOn(false), DIM_MS + 120);
    return () => window.clearTimeout(t);
  }, [from, href]);
  return on && from !== null ? { 'data-ch-enter': '', style: { '--ch-enter-from': String(Math.round(from * 1000) / 1000) } as CSSProperties } : {};
}

/** For tests: forget a switch in flight. */
export function resetViewSwitchForTests() {
  inFlight = null;
}
