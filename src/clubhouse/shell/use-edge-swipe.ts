'use client';

import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';
import { haptic } from '../lib/haptics';
import { chSpringCurve } from '../lib/motion';
import { CH_EDGE_ENTRY_SETTLE_MS, CH_EDGE_ZONE_PX, claimWebSwipe, createEdgeSwipe, edgeSwipeAllowed, findScreenBack, hasChevronBack, type EdgeFrame, type EdgeRelease } from './edge-swipe';
import { CH_UNDERLAY_SHIFT, handUnderlaySpring, placeUnderlay, slideUnderlay, underlayParts } from './phone-chrome';

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
 * pop use), and the page beneath it draws back with it (the same parallax the pop uses). Let go past 35% of the width, or
 * flicked, and the screen leaves on the smooth spring from where it is, at the speed it had, while its Back runs; sooner
 * and it springs back. A first travel that is vertical belongs to the scroll for the rest of the touch. The selection
 * haptic ticks as the commit mark is crossed. With reduced motion the screen does not follow: the touch is read the
 * same way and a commit simply pops it.
 *
 * It does not run beside a native gesture (edge-swipe.ts `nativeSwipeIsOff`), during a round, or with a sheet or dialog
 * open, and it needs the screen's own Back to run (a form's "Cancel" is not one). In the iOS app, a screen with a chevron
 * Back asks the shell for the swipe while it is the top screen (`claimWebSwipe`): the shell's own WKWebView swipe, which
 * drags the whole app with the page, is off until it lets go.
 */
export function useEdgeSwipeBack(screen: RefObject<HTMLElement | null>, { enabled, reduced, exit }: { enabled: boolean; reduced: boolean; exit: MutableRefObject<EdgeExitHold> }): void {
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);
  useEffect(() => {
    const el = screen.current;
    if (!enabled || !el || !hasChevronBack(el)) return;
    return claimWebSwipe();
  }, [screen, enabled]);
  useEffect(() => {
    const el = screen.current;
    if (!enabled || !el) return;
    const inApp = isNativeApp();
    let machine: ReturnType<typeof createEdgeSwipe> | null = null;
    /** What the swipe is moving besides the screen: the page's parts, or the screen under this one. */
    let page: HTMLElement[] = [];
    let covered: HTMLElement[] = [];
    let width = 0;
    let settling: (() => void) | null = null;
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
    const stop = () => {
      machine = null;
      live = false;
    };
    /** The system took the touch (iOS's own swipe, a call): every part goes back where it was, at once. */
    const abort = () => {
      if (!machine) return;
      const dragged = machine.phase === 'dragging';
      machine.cancel();
      stop();
      if (!dragged || reduced) return;
      clear(el, ...covered);
      if (page.length) placeUnderlay(page, 1);
    };
    const springBack = (r: EdgeRelease) => {
      if (r.offset < 0.5) {
        clear(el, ...covered);
        if (page.length) placeUnderlay(page, 1);
        return;
      }
      // Toward rest from wherever it is, at the speed it was moving (progress per second), cut within half a pixel.
      const curve = chSpringCurve('smooth', { velocity: (-r.speed * 1000) / r.offset, rest: 0.5 / r.offset, hold: true });
      const spring = { velocity: (-r.speed * 1000) / r.offset, rest: 0.5 / r.offset, hold: true };
      const moved = [el, ...covered];
      for (const n of moved) {
        n.style.transition = `translate ${curve.ms}ms ${curve.linear}`;
        n.style.translate = '';
      }
      // The page returns to drawn back on the same spring.
      const parts = page;
      const running = parts.length ? slideUnderlay(parts, 1, [], spring) : [];
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
        springBack(r);
        return;
      }
      if (reduced) {
        back.click();
        return;
      }
      const travel = Math.max(1, width - r.offset);
      // Progress of the distance left, per second: the finger's speed carried into the spring.
      const spring = { velocity: Math.max(0, r.speed) * (1000 / travel), rest: 0.5 / travel, hold: true };
      const curve = chSpringCurve('smooth', spring);
      handUnderlaySpring(spring);
      exit.current.holding = true;
      el.style.transition = `translate ${curve.ms}ms ${curve.linear}`;
      el.style.translate = `${width}px 0`;
      // The screen beneath comes home as the one above leaves. Its own pop carries its transform home on the plain smooth
      // spring, so the translate it was given follows the same one (no throw in it): the two add up to one movement
      // toward rest, never a step back.
      const plain = chSpringCurve('smooth');
      for (const c of covered) {
        c.style.transition = `translate ${plain.ms}ms ${plain.linear}`;
        c.style.translate = '0px 0';
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
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
      back.click();
      // A Back that was refused (unsaved changes, a prompt) leaves the screen where it is: bring it home again.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (done || !exit.current.present) return;
          done = true;
          window.clearTimeout(timer);
          el.removeEventListener('transitionend', onEnd);
          exit.current.holding = false;
          const shown = parseFloat(getComputedStyle(el).translate) || 0;
          springBack({ outcome: 'cancel', offset: Math.min(width, Math.max(0, shown)), speed: 0 });
        }),
      );
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (machine || settling || !t || e.touches.length !== 1 || t.clientX > CH_EDGE_ZONE_PX) return;
      if (exit.current.holding || !exit.current.present || performance.now() - mountedAt.current < CH_EDGE_ENTRY_SETTLE_MS) return;
      if (!edgeSwipeAllowed({ inApp }) || !findScreenBack(el)) return;
      width = el.getBoundingClientRect().width || window.innerWidth;
      const m = createEdgeSwipe(width);
      if (!m.start(t.clientX, t.clientY, e.timeStamp)) return;
      machine = m;
    };
    const onMove = (e: TouchEvent) => {
      if (!machine) return;
      const t = e.touches[0];
      if (!t || e.touches.length !== 1) {
        abort();
        return;
      }
      const move = machine.move(t.clientX, t.clientY, e.timeStamp);
      if (!move.claim || !move.frame) return;
      // Ours: the page does not scroll with it. (iOS lets a touch be claimed only before it has started panning.)
      if (e.cancelable) e.preventDefault();
      if (move.crossed) haptic('select');
      if (reduced) {
        live = true;
        return;
      }
      if (!live) {
        live = true;
        covered = Array.from(document.querySelectorAll<HTMLElement>('.ch-pscreen[data-ch-covered]')).filter((c) => c !== el);
        // With a screen beneath this one the page is behind it both: only the one beneath moves.
        page = covered.length ? [] : underlayParts();
        for (const n of [el, ...covered]) {
          n.style.transition = 'none';
          n.style.willChange = 'transform';
        }
      }
      place(move.frame);
    };
    const onEnd = (e: TouchEvent) => {
      if (!machine) return;
      const release = machine.end(e.timeStamp);
      stop();
      if (!release) return;
      if (reduced) {
        if (release.outcome === 'commit') findScreenBack(el)?.click();
        return;
      }
      if (release.outcome === 'commit') commit(release);
      else springBack(release);
    };
    const onCancel = () => abort();

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onCancel);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
      abort();
      settling?.();
    };
  }, [screen, enabled, reduced, exit]);
}
