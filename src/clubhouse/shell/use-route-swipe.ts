'use client';

import { CH_PHONE_QUERY } from '@/clubhouse/lib/phone-query';
import { useEffect } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';
import { haptic } from '../lib/haptics';
import { chHandPop, chPushTiming, chTapTiming, cssNum, chShownPath, chUnderLook, grabPush, underFor, underVeil, type ChUnder } from '../lib/nav-motion';
import { CH_EDGE_ZONE_PX, claimWebSwipe, createEdgeSwipe, edgeSwipeAllowed, findScreenBack, overlayIsOpen, type EdgeFrame, type EdgeRelease } from './edge-swipe';

const PHONE = CH_PHONE_QUERY;
/** How long a committed swipe waits for the page it uncovered to arrive before it lets the copy go anyway. */
const ARRIVE_MS = 2500;
/** Set while the pop presses the bar's Back itself, so its own click is not taken for a tap. */
let pressing = false;

/** The bar's own Back for the page showing: the swipe presses it, so every refusal and prompt still applies. */
function routeBack(): HTMLButtonElement | null {
  const bar = document.querySelector('.ch-topbar');
  return bar ? findScreenBack(bar) : null;
}

/**
 * The edge swipe back for a pushed route page (C1, rows 2 and 89; docs/clubhouse/phone/shell-gestures.md). The rules are
 * the pushed screen's (edge-swipe.ts): a finger landing within the left 20px that first travels right drags the page,
 * the copy of the page beneath draws back with it, past half the width or a flick (0.7 px/ms) lets it go and the bar's own Back
 * runs, and anything else springs home. It also takes a push still sliding in, where it stands (`grabPush`): there is
 * no wait for the push to settle. The bars never move; only the page and the copy beneath it do.
 *
 * A tap on the bar's Back pops the same way (S4.1, MOT-13), at the tap's pace: 520ms on the iOS curve. Neither takes a
 * copy of the page that leaves: the live page slides off, and Back is pressed once it is off, so the page the router
 * brings back takes the place of the copy beneath in one commit. A push still sliding in reverses from where it stands.
 *
 * It listens on the document, because a finger at the edge while the page is part way in lands on the copy, not the
 * page. It only runs where a copy of the page beneath exists (the page was pushed in this tab), with no pushed screen
 * up (PhoneScreen runs its own), on a phone, with motion on, and where `edgeSwipeAllowed` says the native swipe is not
 * already doing it. In the iOS app the page asks the shell for the swipe while it can be swiped back (`claimWebSwipe`);
 * an older shell ignores the ask and keeps its own.
 */
export function useRouteSwipe(on: boolean, routeKey: string): void {
  // Hold the app's swipe for the web one while this page can be swiped back.
  useEffect(() => {
    if (!on || !underFor()) return;
    return claimWebSwipe();
  }, [on, routeKey]);

  useEffect(() => {
    if (!on) return;
    const inApp = isNativeApp();
    let machine: ReturnType<typeof createEdgeSwipe> | null = null;
    let entry: ChUnder | null = null;
    let page: HTMLElement | null = null;
    let grabbed = false;
    let lifted = false;
    let width = 0;
    let offset = 0;
    /** What is still moving after a release; the cleanup ends it. */
    let ending: (() => void) | null = null;
    const look = chUnderLook();

    const place = (f: Pick<EdgeFrame, 'offset' | 'progress'>) => {
      offset = f.offset;
      if (page) page.style.translate = `${cssNum(f.offset)}px 0`;
      if (entry) {
        entry.layer.style.transform = `translateX(calc(${look.parallax} * ${cssNum(1 - f.progress, 4)}))`;
        underVeil(entry.layer).style.opacity = cssNum(1 - f.progress, 4);
      }
    };
    /** The page and the copy beneath, ready to move: the copy in the document under the page, the page above it. */
    const lift = () => {
      if (!page || !entry) return;
      lifted = true;
      page.setAttribute('data-ch-pushing', '');
      page.style.transition = 'none';
      if (!entry.layer.isConnected) {
        entry.layer.style.transform = `translateX(${look.parallax})`;
        underVeil(entry.layer).style.opacity = '1';
        document.body.appendChild(entry.layer);
      }
    };
    /** Everything back at rest: the page in place, the copy out of the document (kept for the next swipe). */
    const rest = () => {
      if (page) {
        page.removeAttribute('data-ch-pushing');
        page.style.translate = '';
        page.style.transition = '';
        page.style.willChange = '';
      }
      if (entry) {
        entry.pinned = false;
        entry.layer.style.transform = '';
        underVeil(entry.layer).style.opacity = '';
        entry.layer.remove();
      }
      machine = null;
      entry = null;
      page = null;
      grabbed = false;
      lifted = false;
    };

    const springHome = (r: Pick<EdgeRelease, 'offset' | 'speed'>) => {
      const p = page;
      const u = entry;
      if (!p || !u || r.offset < 0.5 || typeof p.animate !== 'function') return rest();
      const { curve, timing } = chPushTiming({ velocity: (-r.speed * 1000) / r.offset, rest: 0.5 / r.offset, hold: true });
      p.style.translate = '';
      const anims = [
        p.animate([{ translate: `${cssNum(r.offset)}px 0` }, { translate: '0px 0' }], timing),
        u.layer.animate([{ transform: u.layer.style.transform || 'none' }, { transform: `translateX(${look.parallax})` }], { ...timing, fill: 'forwards' }),
        underVeil(u.layer).animate([{ opacity: underVeil(u.layer).style.opacity || '0' }, { opacity: 1 }], { ...timing, fill: 'forwards' }),
      ];
      machine = null;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        ending = null;
        window.clearTimeout(timer);
        for (const a of anims) a.cancel();
        rest();
      };
      const timer = window.setTimeout(finish, curve.ms + 80);
      anims[0]?.finished.then(finish, () => {});
      ending = finish;
    };

    /**
     * The pop's finish, after a swipe let go past its mark or a tap on the bar's Back: the live page slides off to the
     * right edge over the copy beneath, which comes back from the parallax mark as its dim lifts. Back is pressed once the
     * page is off; the copy stays until the page it shows is really there, so no frame shows the page that left. A Back
     * that is refused (a prompt opens instead) brings the page home again.
     */
    const popOff = (back: HTMLButtonElement, from: number, timing: KeyframeAnimationOptions, ms: number) => {
      const p = page;
      const u = entry;
      if (!p || !u) return rest();
      p.style.translate = '';
      const anims = [
        p.animate([{ transform: `translateX(${cssNum(from)}px)` }, { transform: `translateX(${cssNum(width)}px)` }], { ...timing, fill: 'forwards' }),
        u.layer.animate([{ transform: u.layer.style.transform || 'none' }, { transform: 'none' }], { ...timing, fill: 'forwards' }),
        underVeil(u.layer).animate([{ opacity: underVeil(u.layer).style.opacity || '1' }, { opacity: 0 }], { ...timing, fill: 'forwards' }),
      ];
      machine = null;
      let pressed = false;
      let frame = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        ending = null;
        window.clearTimeout(timer);
        window.clearTimeout(wait);
        cancelAnimationFrame(frame);
        for (const a of anims) a.cancel();
        u.onArrive = undefined;
        rest();
      };
      u.onArrive = finish;
      const press = () => {
        if (pressed || done) return;
        pressed = true;
        const before = chShownPath();
        chHandPop();
        pressing = true;
        try {
          back.click();
        } finally {
          pressing = false;
        }
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            if (done || chShownPath() !== before || !overlayIsOpen()) return;
            done = true;
            ending = null;
            window.clearTimeout(wait);
            for (const a of anims) a.cancel();
            u.onArrive = undefined;
            place({ offset: width, progress: 1 });
            springHome({ offset: width, speed: 0 });
          });
        });
      };
      // A slide whose frames were starved still presses Back.
      const timer = window.setTimeout(press, ms + 80);
      const wait = window.setTimeout(finish, ms + ARRIVE_MS);
      anims[0]?.finished.then(press, () => {});
      ending = finish;
    };

    const commit = (r: EdgeRelease) => {
      const back = routeBack();
      if (!page || !entry || !back || typeof page.animate !== 'function') return springHome(r);
      const travel = Math.max(1, width - r.offset);
      const { curve, timing } = chPushTiming({ velocity: Math.max(0, r.speed) * (1000 / travel), rest: 0.5 / travel, hold: true });
      popOff(back, r.offset, timing, curve.ms);
    };

    /** A tap on the bar's Back while the page beneath is kept: the same pop, on the tap's 520ms iOS curve. */
    const onBackTap = (e: MouseEvent) => {
      if (pressing || machine || ending || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const back = routeBack();
      const target = e.target instanceof Element ? e.target.closest('.ch-pbar__back') : null;
      if (!back || target !== back) return;
      if (!window.matchMedia?.(PHONE).matches || document.querySelector('.ch-pscreen')) return;
      const el = document.getElementById('ch-content');
      if (!el || typeof el.animate !== 'function') return;
      const taken = grabPush();
      const u = taken?.entry ?? underFor();
      if (!u) return;
      e.preventDefault();
      e.stopPropagation();
      page = el;
      entry = u;
      u.pinned = true;
      grabbed = !!taken;
      width = el.getBoundingClientRect().width || window.innerWidth;
      offset = taken?.offset ?? 0;
      lift();
      place({ offset, progress: offset / width });
      const { curve, timing } = chTapTiming();
      popOff(back, offset, timing, curve.ms);
    };

    // The one listener that can hold up a scroll (it may preventDefault) is on only while a touch that landed at the edge is
    // being read, so every other touch on the page scrolls without waiting on script.
    const MOVE = { passive: false, capture: true } as const;
    const disarm = () => document.removeEventListener('touchmove', onMove, MOVE);
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (machine || ending || !t || e.touches.length !== 1 || t.clientX > CH_EDGE_ZONE_PX) return;
      if (!window.matchMedia?.(PHONE).matches || document.querySelector('.ch-pscreen')) return;
      if (!edgeSwipeAllowed({ inApp }) || !routeBack()) return;
      const el = document.getElementById('ch-content');
      if (!el) return;
      const taken = grabPush();
      const u = taken?.entry ?? underFor();
      if (!u) return;
      page = el;
      entry = u;
      u.pinned = true;
      grabbed = !!taken;
      width = el.getBoundingClientRect().width || window.innerWidth;
      offset = taken?.offset ?? 0;
      // The page is promoted before the finger moves (MOT-03), so the first move only sets a transform. The copy beneath
      // joins the document on the first move that claims the touch: a tap on the bar's Back lands in this zone too, and
      // laying the copy out for every such tap would cost the tap a frame.
      if (grabbed) lift();
      else el.style.willChange = 'transform';
      const m = createEdgeSwipe(width, offset);
      if (!m.start(t.clientX, t.clientY, e.timeStamp)) {
        if (grabbed) springHome({ offset, speed: 0 });
        else rest();
        return;
      }
      machine = m;
      document.addEventListener('touchmove', onMove, MOVE);
    };
    const onMove = (e: TouchEvent) => {
      if (!machine) return;
      const t = e.touches[0];
      if (!t || e.touches.length !== 1) return abort();
      const move = machine.move(t.clientX, t.clientY, e.timeStamp);
      if (!move.claim || !move.frame) {
        // The touch turned out to be a scroll: a push it held carries on home.
        if (machine.phase === 'refused') {
          machine = null;
          disarm();
          if (grabbed) springHome({ offset, speed: 0 });
          else rest();
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      if (move.crossed) haptic('select');
      if (!lifted) lift();
      place(move.frame);
    };
    const onEnd = (e: TouchEvent) => {
      if (!machine) return;
      disarm();
      const release = machine.end(e.timeStamp);
      if (!release) {
        machine = null;
        if (grabbed) springHome({ offset, speed: 0 });
        else rest();
        return;
      }
      if (release.outcome === 'commit') commit(release);
      else springHome(release);
    };
    /** The system took the touch: everything back where it rests, at once. */
    const abort = () => {
      disarm();
      if (!machine) return;
      machine.cancel();
      rest();
    };

    document.addEventListener('touchstart', onStart, { passive: true, capture: true });
    document.addEventListener('touchend', onEnd, { capture: true });
    document.addEventListener('touchcancel', abort, { capture: true });
    document.addEventListener('click', onBackTap, { capture: true });
    return () => {
      document.removeEventListener('touchstart', onStart, { capture: true });
      document.removeEventListener('click', onBackTap, { capture: true });
      disarm();
      document.removeEventListener('touchend', onEnd, { capture: true });
      document.removeEventListener('touchcancel', abort, { capture: true });
      ending?.();
      abort();
    };
  }, [on]);
}
