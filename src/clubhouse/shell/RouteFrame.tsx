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
 * so this runs on every in-app route change and on nothing else. Under the OS Reduce Motion setting it still runs, as a
 * plain 180ms crossfade in opacity (owner decision 2, 2026-10-24, OQ-15; shell.css); Settings › Animations off renders
 * without it: the page swaps at once. CH-1601.
 * A Back that iOS already played with its own edge swipe swaps at once too, rather than fade a second time (CH-1908).
 * A section switch (the tab bar, a sidebar item) swaps at once as well, with the same hold onto a skeleton (mot-03:
 * lib/nav-motion.ts marks it `data-ch-tab`, shell.css drops the keyframes).
 * A page that arrives after its route skeleton fades in over it (useSkeletonReveal, CH-1619).
 * On a phone a drill-in pushes and Back pops instead of crossfading (lib/nav-motion.ts, shell.css); the top bar and tab
 * bar are their own view-transition groups and never fade or move.
 */
/** Where each page was scrolled, by route and team, for Back and Forward (this tab only). */
const scrolled = new Map<string, { canvas: number; win: number }>();

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
    const hold = chNavKind() === 'fade' && typeof document.startViewTransition === 'function' && !chReturning();
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
    <div key={mode === 'off' ? routeKey : undefined} ref={frame} id="ch-content" tabIndex={-1} className="ch-frame-route">
      <RouteScope value={routeKey}>{children}</RouteScope>
    </div>
  );
  if (mode === 'off') return page;
  return (
    <ViewTransition key={routeKey} name="ch-page" enter="ch-page" exit="ch-page" share="ch-page" update="none" default="none">
      {page}
    </ViewTransition>
  );
}
