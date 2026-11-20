'use client';

import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';
import { CH_SWIPE } from '../lib/motion';
import { backSwipeBlockedAt, CH_EDGE_ENTRY_SETTLE_MS, claimWebSwipe, createEdgeSwipe, edgeSwipeAllowed, findScreenBack, hasChevronBack, swipeFinish, type EdgeFrame, type EdgeRelease } from './edge-swipe';
import { CH_UNDERLAY_SHIFT, handUnderlayTiming, placeUnderlay, slideUnderlay, underlayParts } from './phone-chrome';

/**
 * What a pushed screen shares with its swipe: whether its exit is being run by the hand (`holding`: the screen leaves on
 * its own spring and stays mounted until it has gone), how to tell React the exit is over (`done`), and whether the
 * screen is still present (a Back that was refused, an unsaved-changes prompt, leaves it so).
 */
export interface EdgeExitHold {
  holding: boolean;
  done: () => void;
  present: boolean;
}

/** The share of the screen's width that the screen beneath it (another pushed screen) draws back, as PhoneScreen does. */
const COVERED_SHIFT = CH_UNDERLAY_SHIFT;

/**
 * The iPhone's edge swipe back for a pushed screen (docs/clubhouse/phone/shell-gestures.md). A finger that lands within
 * the left 20px and travels right follows the screen (CSS `translate`, which composes with the transform its push and
 * pop use), and the page beneath it draws back with it (the same parallax the pop uses). Let go past half the width, or
 * flicked, and the screen leaves from where it is while its Back runs; sooner and it goes home. Either way it finishes
 * over 520 ms times the share of the way still to go, with a 35% floor, on the iOS curve, and the page beneath rides the
 * same timing (MOTION-AND-VISUAL 3.3, `swipeFinish`). A first travel that is vertical belongs to the scroll for the rest
 * of the touch. No haptic marks the commit mark or the release, as on iOS (3.3, 3.10). Under Reduce Motion, and with
 * Animations off, the interactive swipe is off and the bar's Back stays (3.11; this replaces F-0018's reduced drag), though
 * the screen still holds the app's native swipe so it cannot drag the whole app back instead.
 *
 * It does not run beside a native gesture (edge-swipe.ts `nativeSwipeIsOff`), during a round, or with a sheet or dialog
 * open, and it needs the screen's own Back to run (a form's "Cancel" is not one). In the iOS app, a screen with a chevron
 * Back asks the shell for the swipe while it is the top screen (`claimWebSwipe`): the shell's own WKWebView swipe, which
 * drags the whole app with the page, is off until it lets go.
 */
export function useEdgeSwipeBack(screen: RefObject<HTMLElement | null>, { enabled, reduced, exit, ready = true }: { enabled: boolean; reduced: boolean; exit: MutableRefObject<EdgeExitHold>; /** POP-02: the screen's content (and its Back) has rendered. */ ready?: boolean }): void {
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);
  useEffect(() => {
    const el = screen.current;
    if (!enabled || !ready || !el || !hasChevronBack(el)) return;
    return claimWebSwipe();
  }, [screen, enabled, ready]);
  useEffect(() => {
    const el = screen.current;
    if (!enabled || reduced || !el) return;
    const inApp = isNativeApp();
    let machine: ReturnType<typeof createEdgeSwipe> | null = null;
    /** What the swipe is moving besides the screen: the page's parts, or the screen under this one. */
    let page: HTMLElement[] = [];
    let covered: HTMLElement[] = [];
    let width = 0;
    let settling: (() => void) | null = null;
    /** A committed swipe's hand-over, until the screen has gone: the cleanup runs it, so no timer outlives the screen. */
    let committing: (() => void) | null = null;
    let frame = 0;
    let live = false;

    const clear = (...els: HTMLElement[]) => {
      for (const n of els) {
        n.style.transition = '';
        n.style.translate = '';
        n.style.willChange = '';
      }
    };
    /** Puts the screens and the page where a frame says. */
    const place = (frame: EdgeFrame) => {
      el.style.translate = `${frame.offset}px 0`;
      if (page.length) placeUnderlay(page, 1 - frame.progress);
      for (const c of covered) c.style.translate = `${(COVERED_SHIFT * frame.offset).toFixed(2)}px 0`;
    };
    // The one listener that can hold up a scroll (it may preventDefault) is on only while a touch that landed at the edge
    // is being read (S4.6, MOT-02), so every other touch on the screen scrolls without waiting on script. The cost: WebKit
    // settles at touchstart whether a touch's moves can be cancelled (PullToRefresh.tsx), so on iOS this swipe's moves are
    // not cancellable and a claimed swipe cannot hold the screen's scroll still. Owed: a real-iPhone check of how far a
    // swipe with vertical drift scrolls the screen (#2544).
    const MOVE = { passive: false } as const;
    /** M2: the touch being read landed in the content, so its moves are read passively and never cancelled. */
    let fromContent = false;
    const disarm = () => el.removeEventListener('touchmove', onMove);
    /** The screens a touch at the edge may move are composited from the moment it lands, not on its first move (MOT-03). */
    const lift = () => {
      for (const n of [el, ...covered]) n.style.willChange = 'transform';
    };
    const unlift = () => {
      for (const n of [el, ...covered]) n.style.willChange = '';
    };
    const stop = () => {
      machine = null;
      live = false;
      disarm();
    };
    /** The system took the touch (iOS's own swipe, a call): every part goes back where it was, at once. */
    const abort = () => {
      if (!machine) return;
      const dragged = machine.phase === 'dragging';
      machine.cancel();
      stop();
      if (!dragged) {
        unlift();
        return;
      }
      clear(el, ...covered);
      if (page.length) placeUnderlay(page, 1);
    };
    /** Home from wherever it was let go: the way home is the share of the width it had come. */
    const goHome = (r: Pick<EdgeRelease, 'offset'>) => {
      if (r.offset < 0.5) {
        clear(el, ...covered);
        if (page.length) placeUnderlay(page, 1);
        return;
      }
      const curve = swipeFinish(r.offset / Math.max(1, width));
      const moved = [el, ...covered];
      for (const n of moved) {
        n.style.transition = `translate ${curve.ms}ms ${curve.easing}`;
        n.style.translate = '';
      }
      // The page returns to drawn back on the same timing.
      const parts = page;
      const running = parts.length ? slideUnderlay(parts, 1, [], { ms: curve.ms, easing: curve.easing }) : [];
      const settle = () => {
        window.clearTimeout(timer);
        el.removeEventListener('transitionend', onEnd);
        clear(...moved);
        for (const a of running) a.cancel?.();
        if (parts.length) placeUnderlay(parts, 1);
        settling = null;
      };
      const onEnd = (e: TransitionEvent) => {
        if (e.target === el && e.propertyName === 'translate') settle();
      };
      const timer = window.setTimeout(settle, curve.ms + 80);
      el.addEventListener('transitionend', onEnd);
      settling = settle;
    };
    const commit = (r: EdgeRelease) => {
      const back = findScreenBack(el);
      if (!back) {
        goHome(r);
        return;
      }
      // What is left of the width, from where the finger let go: the page beneath takes the same timing.
      const curve = swipeFinish(1 - r.offset / Math.max(1, width));
      handUnderlayTiming({ ms: curve.ms, easing: curve.easing });
      exit.current.holding = true;
      el.style.transition = `translate ${curve.ms}ms ${curve.easing}`;
      el.style.translate = `${width}px 0`;
      // The screen beneath comes home as the one above leaves: its own pop carries its transform home, and the translate
      // the swipe gave it goes on the same finish, so both move toward rest and neither steps back.
      for (const c of covered) {
        c.style.transition = `translate ${curve.ms}ms ${curve.easing}`;
        c.style.translate = '0px 0';
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        committing = null;
        window.clearTimeout(timer);
        el.removeEventListener('transitionend', onEnd);
        exit.current.holding = false;
        exit.current.done();
        clear(...covered);
      };
      const onEnd = (e: TransitionEvent) => {
        if (e.target === el && e.propertyName === 'translate') finish();
      };
      const timer = window.setTimeout(finish, curve.ms + 80);
      el.addEventListener('transitionend', onEnd);
      committing = finish;
      back.click();
      // A Back that was refused (unsaved changes, a prompt) leaves the screen where it is: bring it home again.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (done || !exit.current.present) return;
          done = true;
          committing = null;
          window.clearTimeout(timer);
          el.removeEventListener('transitionend', onEnd);
          exit.current.holding = false;
          const shown = parseFloat(getComputedStyle(el).translate) || 0;
          goHome({ offset: Math.min(width, Math.max(0, shown)) });
        });
      });
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (machine || settling || !t || e.touches.length !== 1) return;
      // M2: a pushed screen swipes back from anywhere on it, not only from the edge, unless the finger landed on something
      // that reads a sideways drag itself.
      const anywhere = t.clientX > CH_SWIPE.edge;
      fromContent = anywhere;
      if (anywhere && backSwipeBlockedAt(e.target, el)) return;
      if (exit.current.holding || !exit.current.present || performance.now() - mountedAt.current < CH_EDGE_ENTRY_SETTLE_MS) return;
      if (!edgeSwipeAllowed({ inApp }) || !findScreenBack(el)) return;
      width = el.getBoundingClientRect().width || window.innerWidth;
      const m = createEdgeSwipe(width, 0, { anywhere });
      if (!m.start(t.clientX, t.clientY, e.timeStamp)) return;
      machine = m;
      covered = Array.from(document.querySelectorAll<HTMLElement>('.ch-pscreen[data-ch-covered]')).filter((c) => c !== el);
      // A touch in the content is mostly a scroll or a tap: the screen is promoted only once the swipe claims it.
      if (!anywhere) lift();
      // A content touch (M2) reads its moves passively, so it can never hold up a scroll (MOT-02): a touch at the edge is
      // the one that may cancel its moves.
      el.addEventListener('touchmove', onMove, anywhere ? { passive: true } : MOVE);
    };
    const onMove = (e: TouchEvent) => {
      if (!machine) return;
      const t = e.touches[0];
      if (!t || e.touches.length !== 1) {
        abort();
        return;
      }
      const move = machine.move(t.clientX, t.clientY, e.timeStamp);
      if (!move.claim || !move.frame) {
        // The touch turned out to be a scroll: it is the scroll's for the rest of the touch, with nothing held up.
        if (machine.phase === 'refused') {
          stop();
          unlift();
        }
        return;
      }
      // Ours: where the browser lets a move be cancelled, the page does not scroll with it (not on iOS: see MOVE above).
      if (e.cancelable && !fromContent) e.preventDefault();
      if (!live) {
        live = true;
        lift();
        // With a screen beneath this one the page is behind it both: only the one beneath moves.
        page = covered.length ? [] : underlayParts();
        for (const n of [el, ...covered]) n.style.transition = 'none';
      }
      place(move.frame);
    };
    const onEnd = (e: TouchEvent) => {
      if (!machine) return;
      const release = machine.end(e.timeStamp);
      stop();
      if (!release) {
        unlift();
        return;
      }
      if (release.outcome === 'commit') commit(release);
      else goHome(release);
    };
    const onCancel = () => abort();

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onCancel);
    return () => {
      el.removeEventListener('touchstart', onStart);
      disarm();
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
      abort();
      settling?.();
      cancelAnimationFrame(frame);
      committing?.();
    };
  }, [screen, enabled, reduced, exit]);
}
