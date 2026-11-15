'use client';

import { useEffect, useLayoutEffect, useRef, useState, ViewTransition, type ReactNode, type RefObject } from 'react';
import { CH_DUR, CH_EASE } from '../lib/motion';
import { useChPress } from '../lib/press';
import { useChMotionMode, useChReducedMotion } from '../lib/reduced-motion';
import { markAppRunning, RouteScope } from '../lib/session-state';
import { chReturning } from '../lib/pop-mark';
import { canvasScrollNow } from '../lib/smooth-scroll';
// Registers the Back that iOS animated itself, which turns off the crossfade for that one Back (CH-1908, shell.css).
import '../lib/ua-pop';
// Knows which way a navigation moves (push, pop, a swap, or the crossfade) as the tap or the Back happens.
import { chNavCrossfades, chNavShown } from '../lib/nav-motion';
import { useRouteSwipe } from './use-route-swipe';

/**
 * The page frame. Each page mounts fresh on navigation (keyed by route) and is shown as soon as it is ready: the
 * staggered first-paint reveal is retired (owner 2026-10-01, audit F01). Resets the canvas scroll so a new page never
 * opens halfway down (CH-1904), and mounts the press.
 *
 * Which navigations animate, and how (production audit 2026-11-15, S4.1, S4.4, S4.8, S4.9):
 * - A desktop page change crossfades (owner decision 3, A10): React's `<ViewTransition>` keyed by route makes the old
 *   page and the new one an exit/enter pair, and `.ch-page` (shell.css) fades them, 120ms out and 180ms in together; the
 *   sidebar and top bar are anchored and never move. Under the OS Reduce Motion setting a phone page change crossfades
 *   the same way over 180ms (owner decision 2, OQ-15).
 * - A section switch (the tab bar, a sidebar item) and every phone navigation with motion on swap at once, with no view
 *   transition at all: the boundary keeps its key, so React starts no document transition and snapshots nothing. A
 *   phone drill-in pushes and Back pops on the live page instead (lib/nav-motion.ts, use-route-swipe.ts).
 * - Settings › Animations off renders without a boundary: the page swaps at once.
 * A page that arrives after its route skeleton fades in over it (useSkeletonReveal, CH-1619); a skeleton marked
 * data-ch-arrive="crossfade" crossfades with it on the quick beat instead (READ-S4). The skeleton itself is whole in its
 * first frame, except onto a crossfade, where it waits out the hold.
 */
/** Where each page was scrolled, by route and team, for Back and Forward (this tab only). */
const scrolled = new Map<string, { canvas: number; win: number }>();

/** A route's loading skeleton, as each route's loading.tsx draws it (base.css fades it in by the same mark). */
const ROUTE_SKELETON = "main[aria-busy='true'][aria-label^='Loading']";
/** Set once the first frame of this document has hydrated: a frame mounted after it came by navigation. */
let frameHydrated = false;

/** How long a crossfade onto a route skeleton keeps the old page up (--ch-dur-vt-hold, tokens.css; S4.4: 150ms, none on a swap). */
export const CH_VT_HOLD_MS = 150;
/** When a held navigation's crossfade is over: the hold, then the old page's fade (--ch-dur-vt-out, 120ms), with a frame to spare. */
const VT_DONE_MS = CH_VT_HOLD_MS + 180;
const HOLD = 'data-ch-vt-hold';

/** A copy of a skeleton that has left, in the place of the page taking over, fading out over it. It is nothing but pixels: not read, not hit. */
function fadeOutGhost(skeleton: Element, page: HTMLElement, duration: number, easing: string): void {
  const ghost = skeleton.cloneNode(true) as HTMLElement;
  // Off the route skeleton's mark, or base.css would fade it in and RouteFrame would take it for one.
  ghost.removeAttribute('aria-busy');
  ghost.removeAttribute('aria-label');
  ghost.removeAttribute('data-ch-arrive');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Object.assign(ghost.style, { position: 'absolute', left: `${page.offsetLeft}px`, top: `${page.offsetTop}px`, width: `${page.offsetWidth}px`, margin: '0', pointerEvents: 'none' });
  page.parentElement?.append(ghost);
  const fade = ghost.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration, easing, fill: 'forwards' });
  if (!fade) return ghost.remove();
  fade.onfinish = () => ghost.remove();
  fade.oncancel = () => ghost.remove();
  fade.pause();
  requestAnimationFrame(() => fade.play());
}

/**
 * A crossfade onto a route skeleton (native-feel audit 2026-10-08, P0-2 and P0-3). While the page crossfade runs,
 * `data-ch-vt-hold` on <html> keeps the old page up and the skeleton hidden for CH_VT_HOLD_MS (shell.css, base.css), so
 * a load that finishes sooner goes straight from the old page to the new one, with no skeleton and no blank frame. The
 * page arriving takes the attribute off, which ends the old page's fade where it stands. A swap, a push and a pop show
 * the skeleton at once, whole (S4.4).
 *
 * The page that takes a skeleton's place fades in over the press beat (CH-1619, owner-approved 2026-10-08) only once the
 * skeleton has been on screen and the crossfade is over: never two fades at once. Opacity only. It never runs on the
 * first paint of a server-rendered page, on a refresh or an update inside the page, or with reduced motion or
 * Animations off.
 */
function useSkeletonReveal(frame: RefObject<HTMLDivElement | null>, routeKey: string, armed: boolean, crossfade: boolean): void {
  useLayoutEffect(() => {
    const el = frame.current;
    if (!armed || !el?.querySelector(ROUTE_SKELETON)) return;
    const root = document.documentElement;
    const since = performance.now();
    // Set in the commit the view transition is capturing, so its keyframes see it. Only onto a crossfade: a swap has no
    // old page to hold up, and a hold there was a blank beat before the skeleton.
    // Not on a Back: React commits a Back synchronously, without a view transition to hold the old page in.
    const hold = crossfade && typeof document.startViewTransition === 'function' && !chReturning();
    if (hold) root.setAttribute(HOLD, '');
    const release = () => root.removeAttribute(HOLD);
    const lapse = hold ? window.setTimeout(release, VT_DONE_MS + 500) : 0;
    let skeleton = el.querySelector(ROUTE_SKELETON);
    const watch = new MutationObserver((records) => {
      // Still loading, or a deeper route's skeleton took the first one's place. Once the first has had its turn on
      // screen, the deeper one is there at once: it mounted under the hold mark too, and waited the hold again at
      // opacity 0, a blank between two skeletons (WebKit, a section switch on a slow network, 2026-10-15).
      const now = el.querySelector(ROUTE_SKELETON);
      if (now) {
        if (now !== skeleton && performance.now() - since >= VT_DONE_MS && now instanceof HTMLElement) now.style.animation = 'none';
        skeleton = now;
        return;
      }
      watch.disconnect();
      release();
      // Arrived before the skeleton showed, or while the crossfade still runs: the page is simply there.
      if (performance.now() - since < VT_DONE_MS) return;
      const arrived = records
        .flatMap((r) => Array.from(r.addedNodes))
        .filter((n): n is HTMLElement => n instanceof HTMLElement && n.isConnected);
      // A skeleton that asks for it (data-ch-arrive="crossfade", READ-S4) stays up and fades as the page does, on the quick beat, once its own fade in has finished. Opacity only, so it never moves anything.
      const crossfade = skeleton instanceof HTMLElement && skeleton.dataset.chArrive === 'crossfade';
      const duration = (crossfade ? CH_DUR.quick : CH_DUR.press) * 1000;
      const easing = `cubic-bezier(${CH_EASE.join(', ')})`;
      const tops = arrived.filter((n) => !arrived.some((o) => o !== n && o.contains(n)));
      for (const n of tops) {
        const fade = n.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
        // Held at its first frame until the page has painted: a big page can keep the thread busy past the whole fade,
        // and a fade timed from the swap would then be over before anyone saw it.
        fade?.pause();
        requestAnimationFrame(() => fade?.play());
      }
      // One skeleton left, so one copy, however many nodes took its place.
      if (crossfade && skeleton && tops[0] && performance.now() - since >= VT_DONE_MS + CH_DUR.base * 1000) fadeOutGhost(skeleton, tops[0], duration, easing);
    });
    watch.observe(el, { childList: true, subtree: true });
    return () => {
      watch.disconnect();
      window.clearTimeout(lapse);
      release();
    };
  }, [frame, routeKey, armed, crossfade]);
}

/**
 * Scrolls back to a saved place and holds it while the page settles, for up to 1.5 s or until the person scrolls. It
 * used to stop the first frame it got there, and the page arriving after (a skeleton swapped for content, shorter for a
 * frame) clamped it back to the top (audit A-31).
 */
function restoreScroll(to: { canvas: number; win: number }): () => void {
  const canvas = document.getElementById('ch-canvas');
  const until = Date.now() + 1500;
  let frame = 0;
  let done = false;
  const stop = () => {
    done = true;
    cancelAnimationFrame(frame);
    for (const type of USER_SCROLL) window.removeEventListener(type, stop, true);
  };
  const USER_SCROLL = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
  for (const type of USER_SCROLL) window.addEventListener(type, stop, { capture: true, passive: true });
  const step = () => {
    if (done) return;
    const there = (!canvas || Math.abs(canvas.scrollTop - to.canvas) < 2) && Math.abs(window.scrollY - to.win) < 2;
    if (!there) {
      canvasScrollNow(to.canvas);
      window.scrollTo({ top: to.win, behavior: 'instant' });
    }
    if (Date.now() < until) frame = requestAnimationFrame(step);
    else stop();
  };
  step();
  return stop;
}

/**
 * `scrollKey` names the screen for scroll memory when the address's query picks the screen (Stats' `?player=`: the team
 * page and a player's are one route). Back from a player returned the team page to its top (Simulator, 2026-10-14).
 * Defaults to `routeKey`; it never remounts the route.
 */
export function RouteFrame({ routeKey, scrollKey = routeKey, children }: { routeKey: string; scrollKey?: string; children: ReactNode }) {
  const reduced = useChReducedMotion();
  const mode = useChMotionMode();
  useChPress(!reduced);
  const first = useRef(true);
  const frame = useRef<HTMLDivElement>(null);
  // The page the document loaded on paints from the server; a page reached by navigating (to this frame or to a
  // frame mounted after the first one hydrated) may wait on its skeleton.
  const [loadedKey] = useState(routeKey);
  const [cameByNavigation] = useState(() => frameHydrated);
  const [navigated, setNavigated] = useState(false);
  if (!navigated && routeKey !== loadedKey) setNavigated(true);
  // The view-transition boundary's key moves to the new route only for a crossfade: kept, the boundary is an update
  // (update="none"), so React starts no document view transition and the browser snapshots nothing (S4.8, MOT-01).
  // Decided once per route change, as the navigation commits, from what the tap or the Back said it was.
  const [motion, setMotion] = useState({ route: routeKey, boundary: routeKey, crossfade: false });
  if (motion.route !== routeKey) {
    const crossfade = chNavCrossfades();
    setMotion({ route: routeKey, boundary: crossfade ? routeKey : motion.boundary, crossfade });
  }
  useLayoutEffect(() => chNavShown(routeKey.split('\u0000')[0] ?? routeKey, routeKey), [routeKey]);
  // A pushed page can be dragged back from the left edge, a push in flight included (C1, use-route-swipe.ts).
  useRouteSwipe(mode === 'full', routeKey);
  useSkeletonReveal(frame, routeKey, (cameByNavigation || navigated) && !reduced, motion.crossfade);
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
  // A layout effect, so the old page stops recording in the commit that swaps it out: as a passive effect it kept
  // listening for a frame, heard the canvas clamp to the incoming skeleton's height and saved that (0 on desktop,
  // short on the phone) as where the page was left (audit A-31: Stats → player → Back restored 0/30 desktop).
  useLayoutEffect(() => {
    const canvas = document.getElementById('ch-canvas');
    const record = () => scrolled.set(scrollKey, { canvas: canvas?.scrollTop ?? 0, win: window.scrollY });
    canvas?.addEventListener('scroll', record, { passive: true });
    window.addEventListener('scroll', record, { passive: true });
    let cancel: (() => void) | undefined;
    if (first.current) first.current = false;
    else {
      const saved = scrolled.get(scrollKey);
      if (saved && chReturning()) cancel = restoreScroll(saved);
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
  }, [scrollKey]);

  const page = (
    <div key={routeKey} ref={frame} id="ch-content" tabIndex={-1} className="ch-frame-route">
      <RouteScope value={routeKey}>{children}</RouteScope>
    </div>
  );
  if (mode === 'off') return page;
  return (
    <ViewTransition key={motion.boundary} name="ch-page" enter="ch-page" exit="ch-page" share="ch-page" update="none" default="none">
      {page}
    </ViewTransition>
  );
}
