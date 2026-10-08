'use client';

import { useEffect, useLayoutEffect, useRef, useState, ViewTransition, type ReactNode, type RefObject } from 'react';
import { CH_DUR, CH_EASE } from '../lib/motion';
import { useChPress } from '../lib/press';
import { useChReducedMotion } from '../lib/reduced-motion';
import { markAppRunning, RouteScope } from '../lib/session-state';
import { canvasScrollNow } from '../lib/smooth-scroll';
// Registers the Back that iOS animated itself, which turns off the crossfade for that one Back (CH-1908, shell.css).
import '../lib/ua-pop';
// Sets which way a phone navigation moves (push, pop or the crossfade) as the tap or the Back happens.
import { chNavKind, chNavShown } from '../lib/nav-motion';

/**
 * The page frame. Each page mounts fresh on navigation (keyed by route) and is shown as soon as it is ready: the
 * staggered first-paint reveal is retired (owner 2026-10-01, audit F01), so the crossfade below is the only entrance.
 * Resets the canvas scroll so a new page never opens halfway down (CH-1904), and mounts the press.
 *
 * A navigation crossfades the page (owner 2026-10-01: a quick crossfade, never a slide): React's `<ViewTransition>`
 * keyed by route makes the old page and the new one an exit/enter pair, and `.ch-page`
 * (shell.css) fades them; the sidebar, top bar and tab bar are anchored and never move. Navigations are transitions,
 * so this runs on every in-app route change and on nothing else. Reduced motion and Settings › Animations off render without it: the page swaps at once. CH-1601.
 * A Back that iOS already played with its own edge swipe swaps at once too, rather than fade a second time (CH-1908).
 * A page that arrives after its route skeleton fades in over it (useSkeletonReveal, CH-1619).
 * On a phone a drill-in pushes and Back pops instead of crossfading (lib/nav-motion.ts, shell.css); the top bar and tab
 * bar are their own view-transition groups and never fade or move.
 */
/** Where each page was scrolled, by route and team, for Back and Forward (this tab only). */
const scrolled = new Map<string, { canvas: number; win: number }>();
/** Set by a Back or Forward (popstate); a navigation that starts within this long of one is a return. */
const RETURN_WINDOW_MS = 1500;
let poppedAt = 0;
if (typeof window !== 'undefined') window.addEventListener('popstate', () => (poppedAt = Date.now()));

/** A route's loading skeleton, as each route's loading.tsx draws it (base.css fades it in by the same mark). */
const ROUTE_SKELETON = "main[aria-busy='true'][aria-label^='Loading']";
/** Set once the first frame of this document has hydrated: a frame mounted after it came by navigation. */
let frameHydrated = false;

/** How long a navigation onto a route skeleton keeps the old page up (--ch-dur-vt-hold, tokens.css). */
export const CH_VT_HOLD_MS = 300;
/** When a held navigation's crossfade is over: the hold, then the old page's fade (--ch-dur-vt-out). It also outlasts a push (462ms). */
const VT_DONE_MS = CH_VT_HOLD_MS + 180;
const HOLD = 'data-ch-vt-hold';

/**
 * A navigation onto a route skeleton (native-feel audit 2026-10-08, P0-2 and P0-3). While the page crossfade runs,
 * `data-ch-vt-hold` on <html> keeps the old page up and the skeleton hidden for CH_VT_HOLD_MS (shell.css, base.css), so
 * a load that finishes sooner goes straight from the old page to the new one, with no skeleton and no blank frame. The
 * page arriving takes the attribute off, which ends the old page's fade where it stands. A push or a pop shows its
 * skeleton at once, as it slides.
 *
 * The page that takes a skeleton's place fades in over the press beat (CH-1619, owner-approved 2026-10-08) only once the
 * skeleton has been on screen and the crossfade is over: never two fades at once. Opacity only. It never runs on the
 * first paint of a server-rendered page, on a refresh or an update inside the page, or with reduced motion or
 * Animations off.
 */
function useSkeletonReveal(frame: RefObject<HTMLDivElement | null>, routeKey: string, armed: boolean): void {
  useLayoutEffect(() => {
    const el = frame.current;
    if (!armed || !el?.querySelector(ROUTE_SKELETON)) return;
    const root = document.documentElement;
    const since = performance.now();
    // Set in the commit the view transition is capturing, so its keyframes see it.
    // Not on a Back: React commits a Back synchronously, without a view transition to hold the old page in.
    const hold = chNavKind() === 'fade' && typeof document.startViewTransition === 'function' && Date.now() - poppedAt >= RETURN_WINDOW_MS;
    if (hold) root.setAttribute(HOLD, '');
    const release = () => root.removeAttribute(HOLD);
    const lapse = hold ? window.setTimeout(release, VT_DONE_MS + 500) : 0;
    const watch = new MutationObserver((records) => {
      // Still loading, or a deeper route's skeleton took the first one's place.
      if (el.querySelector(ROUTE_SKELETON)) return;
      watch.disconnect();
      release();
      // Arrived before the skeleton showed, or while the crossfade still runs: the page is simply there.
      if (performance.now() - since < VT_DONE_MS) return;
      const arrived = records
        .flatMap((r) => Array.from(r.addedNodes))
        .filter((n): n is HTMLElement => n instanceof HTMLElement && n.isConnected);
      for (const n of arrived) {
        if (arrived.some((o) => o !== n && o.contains(n))) continue;
        const fade = n.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: CH_DUR.press * 1000, easing: `cubic-bezier(${CH_EASE.join(', ')})` });
        // Held at its first frame until the page has painted: a big page can keep the thread busy past the whole fade,
        // and a fade timed from the swap would then be over before anyone saw it.
        fade?.pause();
        requestAnimationFrame(() => fade?.play());
      }
    });
    watch.observe(el, { childList: true, subtree: true });
    return () => {
      watch.disconnect();
      window.clearTimeout(lapse);
      release();
    };
  }, [frame, routeKey, armed]);
}

/** Scrolls back to a saved place once the page is tall enough to hold it, or gives up after a second. */
function restoreScroll(to: { canvas: number; win: number }): () => void {
  const canvas = document.getElementById('ch-canvas');
  const until = Date.now() + 1000;
  let frame = 0;
  const step = () => {
    canvasScrollNow(to.canvas);
    window.scrollTo({ top: to.win, behavior: 'instant' });
    const there = (!canvas || Math.abs(canvas.scrollTop - to.canvas) < 2) && Math.abs(window.scrollY - to.win) < 2;
    if (!there && Date.now() < until) frame = requestAnimationFrame(step);
  };
  step();
  return () => cancelAnimationFrame(frame);
}

export function RouteFrame({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const reduced = useChReducedMotion();
  useChPress(!reduced);
  const first = useRef(true);
  const frame = useRef<HTMLDivElement>(null);
  // The page the document loaded on paints from the server; a page reached by navigating (to this frame or to a
  // frame mounted after the first one hydrated) may wait on its skeleton.
  const [loadedKey] = useState(routeKey);
  const [cameByNavigation] = useState(() => frameHydrated);
  const [navigated, setNavigated] = useState(false);
  if (!navigated && routeKey !== loadedKey) setNavigated(true);
  useLayoutEffect(() => chNavShown(routeKey.split('\u0000')[0] ?? routeKey), [routeKey]);
  useSkeletonReveal(frame, routeKey, (cameByNavigation || navigated) && !reduced);
  useEffect(() => {
    markAppRunning();
    frameHydrated = true;
  }, []);
  // iOS WebKit paints :active on a touch only where a touch listener is registered. The press (useChPress) is off with
  // reduced motion, so a row's pressed tint (--ch-ledger-row-press, CH-1606) gets its own listener, whatever the motion.
  useEffect(() => {
    const touch = () => {};
    document.addEventListener('touchstart', touch, { passive: true });
    return () => document.removeEventListener('touchstart', touch);
  }, []);
  // A new page opens at the top (CH-1904); Back or Forward returns to where that page was left (PAGE_PERFORMANCE.md
  // rule 1). Positions are recorded as the coach scrolls, so leaving never has to read a page already swapped out.
  useEffect(() => {
    const canvas = document.getElementById('ch-canvas');
    const record = () => scrolled.set(routeKey, { canvas: canvas?.scrollTop ?? 0, win: window.scrollY });
    canvas?.addEventListener('scroll', record, { passive: true });
    window.addEventListener('scroll', record, { passive: true });
    let cancel: (() => void) | undefined;
    if (first.current) first.current = false;
    else {
      const saved = scrolled.get(routeKey);
      if (saved && Date.now() - poppedAt < RETURN_WINDOW_MS) cancel = restoreScroll(saved);
      else {
        canvasScrollNow(0);
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    }
    return () => {
      cancel?.();
      canvas?.removeEventListener('scroll', record);
      window.removeEventListener('scroll', record);
    };
  }, [routeKey]);

  const page = (
    <div key={reduced ? routeKey : undefined} ref={frame} id="ch-content" tabIndex={-1} className="ch-frame-route">
      <RouteScope value={routeKey}>{children}</RouteScope>
    </div>
  );
  if (reduced) return page;
  return (
    <ViewTransition key={routeKey} name="ch-page" enter="ch-page" exit="ch-page" share="ch-page" update="none" default="none">
      {page}
    </ViewTransition>
  );
}
