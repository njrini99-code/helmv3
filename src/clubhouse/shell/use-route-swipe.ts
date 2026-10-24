'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';
import { haptic } from '../lib/haptics';
import { chHandPop, chPushTiming, chShownPath, chUnderLook, grabPush, pageLayer, underFor, type ChUnder } from '../lib/nav-motion';
import { CH_EDGE_ZONE_PX, claimWebSwipe, createEdgeSwipe, edgeSwipeAllowed, findScreenBack, overlayIsOpen, type EdgeFrame, type EdgeRelease } from './edge-swipe';

const PHONE = '(max-width: 820px)';
/** How long a committed swipe waits for the page it uncovered to arrive before it lets the copy go anyway. */
const ARRIVE_MS = 2500;

/** The bar's own Back for the page showing: the swipe presses it, so every refusal and prompt still applies. */
function routeBack(): HTMLButtonElement | null {
  const bar = document.querySelector('.ch-topbar');
  return bar ? findScreenBack(bar) : null;
}

/** `brightness(x)` eased toward none as the page beneath comes home; any other dim holds until halfway. */
function dimAt(dim: string, drawnBack: number): string {
  const m = /brightness\(\s*([\d.]+)\s*\)/.exec(dim);
  if (m) return `brightness(${(1 - (1 - Number(m[1])) * drawnBack).toFixed(4)})`;
  return drawnBack > 0.5 ? dim : 'none';
}

/**
 * The edge swipe back for a pushed route page (C1, rows 2 and 89; docs/clubhouse/phone/shell-gestures.md). The rules are
 * the pushed screen's (edge-swipe.ts): a finger landing within the left 20px that first travels right drags the page,
 * the copy of the page beneath draws back with it, past 35% of the width or a flick lets it go and the bar's own Back
 * runs, and anything else springs home. It also takes a push still sliding in, where it stands (`grabPush`): there is
 * no wait for the push to settle. The bars never move; only the page and the copy beneath it do.
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
    let live = false;
    let width = 0;
    let offset = 0;
    /** What is still moving after a release; the cleanup ends it. */
    let ending: (() => void) | null = null;
    const look = chUnderLook();

    const place = (f: Pick<EdgeFrame, 'offset' | 'progress'>) => {
      offset = f.offset;
      if (page) page.style.translate = `${f.offset.toFixed(2)}px 0`;
      if (entry) {
        entry.layer.style.transform = `translateX(calc(${look.parallax} * ${(1 - f.progress).toFixed(4)}))`;
        entry.layer.style.filter = dimAt(look.dim, 1 - f.progress);
      }
    };
    /** The page and the copy beneath, ready to move: the copy in the document under the page, the page above it. */
    const lift = () => {
      if (!page || !entry) return;
      page.setAttribute('data-ch-pushing', '');
      page.style.transition = 'none';
      if (!entry.layer.isConnected) {
        entry.layer.style.transform = `translateX(${look.parallax})`;
        entry.layer.style.filter = look.dim;
        document.body.appendChild(entry.layer);
      }
    };
    /** Everything back at rest: the page in place, the copy out of the document (kept for the next swipe). */
    const rest = () => {
      if (page) {
        page.removeAttribute('data-ch-pushing');
        page.style.translate = '';
        page.style.transition = '';
      }
      if (entry) {
        entry.pinned = false;
        entry.layer.style.transform = '';
        entry.layer.style.filter = '';
        entry.layer.remove();
      }
      machine = null;
      entry = null;
      page = null;
      grabbed = false;
      live = false;
    };

    const springHome = (r: Pick<EdgeRelease, 'offset' | 'speed'>) => {
      const p = page;
      const u = entry;
      if (!p || !u || r.offset < 0.5 || typeof p.animate !== 'function') return rest();
      const { curve, timing } = chPushTiming({ velocity: (-r.speed * 1000) / r.offset, rest: 0.5 / r.offset, hold: true });
      p.style.translate = '';
      const anims = [
        p.animate([{ translate: `${r.offset.toFixed(2)}px 0` }, { translate: '0px 0' }], timing),
        u.layer.animate([{ transform: u.layer.style.transform || 'none', filter: u.layer.style.filter || 'none' }, { transform: `translateX(${look.parallax})`, filter: look.dim }], { ...timing, fill: 'forwards' }),
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

    const commit = (r: EdgeRelease) => {
      const p = page;
      const u = entry;
      const back = routeBack();
      if (!p || !u || !back || typeof p.animate !== 'function') return springHome(r);
      const overlay = pageLayer('ch-frame-popping');
      if (!overlay) return springHome(r);
      overlay.style.left = '0px';
      document.body.appendChild(overlay);
      p.style.translate = '';
      p.removeAttribute('data-ch-pushing');
      const travel = Math.max(1, width - r.offset);
      const { curve, timing } = chPushTiming({ velocity: Math.max(0, r.speed) * (1000 / travel), rest: 0.5 / travel, hold: true });
      const anims = [
        overlay.animate([{ transform: `translateX(${r.offset.toFixed(2)}px)` }, { transform: `translateX(${width}px)` }], { ...timing, fill: 'forwards' }),
        u.layer.animate([{ transform: u.layer.style.transform || 'none', filter: u.layer.style.filter || 'none' }, { transform: 'none', filter: 'none' }], { ...timing, fill: 'forwards' }),
      ];
      machine = null;
      let arrived = false;
      let slid = false;
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
        overlay.remove();
        rest();
      };
      // The copy of the page beneath stays until that page is really there, so no frame shows the page that left.
      const maybeDone = () => {
        if (slid && arrived) finish();
      };
      u.onArrive = () => {
        arrived = true;
        maybeDone();
      };
      const timer = window.setTimeout(() => {
        slid = true;
        overlay.remove();
        maybeDone();
      }, curve.ms + 80);
      const wait = window.setTimeout(finish, curve.ms + ARRIVE_MS);
      anims[0]?.finished.then(() => {
        slid = true;
        overlay.remove();
        maybeDone();
      }, () => {});
      ending = finish;
      const before = chShownPath();
      chHandPop();
      back.click();
      // A Back that was refused (a prompt opened instead) brings the page home again.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (done || arrived || chShownPath() !== before || !overlayIsOpen()) return;
          done = true;
          ending = null;
          window.clearTimeout(timer);
          window.clearTimeout(wait);
          for (const a of anims) a.cancel();
          overlay.remove();
          u.onArrive = undefined;
          p.setAttribute('data-ch-pushing', '');
          place({ offset: r.offset, progress: r.offset / width });
          springHome({ offset: r.offset, speed: 0 });
        });
      });
    };

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
      if (grabbed) lift();
      const m = createEdgeSwipe(width, offset);
      if (!m.start(t.clientX, t.clientY, e.timeStamp)) {
        if (grabbed) springHome({ offset, speed: 0 });
        else rest();
        return;
      }
      machine = m;
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
          if (grabbed) springHome({ offset, speed: 0 });
          else rest();
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      if (move.crossed) haptic('select');
      if (!live) {
        live = true;
        lift();
      }
      place(move.frame);
    };
    const onEnd = (e: TouchEvent) => {
      if (!machine) return;
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
      if (!machine) return;
      machine.cancel();
      rest();
    };

    document.addEventListener('touchstart', onStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onMove, { passive: false, capture: true });
    document.addEventListener('touchend', onEnd, { capture: true });
    document.addEventListener('touchcancel', abort, { capture: true });
    return () => {
      document.removeEventListener('touchstart', onStart, { capture: true });
      document.removeEventListener('touchmove', onMove, { capture: true });
      document.removeEventListener('touchend', onEnd, { capture: true });
      document.removeEventListener('touchcancel', abort, { capture: true });
      ending?.();
      abort();
    };
  }, [on]);
}
