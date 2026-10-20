'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';
import { CH_SCROLL_DUR } from './motion';
import { useChReducedMotion } from './reduced-motion';

/**
 * Smooth scrolling for the desktop canvas (owner, 2026-10-06: "use smooth scroll all around"). Safari on the Mac moves a
 * mouse wheel in raw steps; Lenis eases the canvas (#ch-canvas, the desktop scroller) between them. It drives the
 * canvas's native scrollTop, so the sticky top bar, scroll restoration and overscroll containment keep working.
 *
 * Off on a phone layout or a touch pointer (iOS momentum is already smooth and must stay native), and off with
 * reduced motion or Settings > Animations off (CH-1608: every Clubhouse movement is instant then). A nested scroller
 * inside the canvas (a list, a panel), a dialog and a menu are left to useSmoothWheelEverywhere, below. A Mac trackpad
 * scrolls natively too (owner-approved 2026-10-08, CH-1621): its momentum is already smooth, so only a notched wheel
 * eases.
 */
let current: Lenis | null = null;

/** The canvas's smooth scroller while one runs, else null: for a jump that has to land at once (a route change). */
export function canvasLenis(): Lenis | null {
  return current;
}

/** Scroll the canvas to `top` at once, stopping any easing in flight (route changes, Back restoring a place). */
export function canvasScrollNow(top: number): void {
  if (current) current.scrollTo(top, { immediate: true, force: true });
  else document.getElementById('ch-canvas')?.scrollTo({ top, behavior: 'instant' });
}

/** Scroll an element into view, eased unless motion is off. Goes through the canvas scroller when one runs. */
export function chScrollIntoView(el: Element | null | undefined, reduced: boolean, block: ScrollLogicalPosition = 'start'): void {
  if (!el) return;
  if (current && !reduced && document.getElementById('ch-canvas')?.contains(el)) {
    current.scrollTo(el as HTMLElement, { offset: block === 'start' ? -72 : 0 });
    return;
  }
  el.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block });
}

/** Scroll a page back to its top: eased in place, instant when motion is off. */
export function chScrollToTop(reduced: boolean): void {
  if (current && !reduced) current.scrollTo(0);
  else document.getElementById('ch-canvas')?.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
  window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
}

const DESK = '(min-width: 821px) and (pointer: fine)';

/** A pause longer than this between wheel events starts a new gesture. */
const GESTURE_GAP_MS = 120;

/**
 * Whether a wheel gesture on a Mac comes from a trackpad (CH-1621). A trackpad, like a Magic Mouse, sends whole-pixel
 * deltas that already carry the system's momentum, often with a sideways part; easing them again only makes the page
 * lag the fingers. A notched wheel sends accelerated line steps, which arrive as fractional pixels and never sideways
 * (the data in w3c/uievents#337). The first event decides for the whole gesture, so a stray value mid-scroll never
 * hands it between the two. Off the Mac every wheel eases, as before.
 */
export function chTrackpadGesture(): (event: WheelEvent) => boolean {
  const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || navigator.userAgent);
  let lastAt = -Infinity;
  let trackpad = false;
  return (event) => {
    if (!mac) return false;
    const now = event.timeStamp || performance.now();
    if (now - lastAt > GESTURE_GAP_MS) trackpad = event.deltaMode === 0 && (event.deltaX !== 0 || Number.isInteger(event.deltaY));
    lastAt = now;
    return trackpad;
  };
}

/**
 * Whether a wheel over `node` belongs to a scroller inside the canvas rather than to the canvas: one that scrolls up and
 * down. A box that only scrolls sideways (a wide table) is not one, though its computed overflow-y is `auto` too: the
 * tables on Stats and Rounds covered most of those pages, so a wheel over them scrolled the canvas with no easing.
 */
export function chScrollsVertically(node: HTMLElement): boolean {
  return /(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight;
}

/** Mount once, in the Clubhouse frame. */
export function useCanvasSmoothScroll(): void {
  const reduced = useChReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const desk = window.matchMedia(DESK);
    let lenis: Lenis | null = null;
    let raf = 0;
    let height = 0;

    const start = () => {
      const wrapper = document.getElementById('ch-canvas');
      if (!wrapper || lenis) return;
      const fromTrackpad = chTrackpadGesture();
      lenis = new Lenis({
        wrapper,
        content: wrapper,
        duration: CH_SCROLL_DUR,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        syncTouch: false,
        wheelMultiplier: 1,
        // A trackpad scrolls natively (CH-1621): Lenis lets the event through untouched, and a glide a wheel started
        // stops where it is, so the fingers take over from the page's place rather than fight the easing.
        virtualScroll: ({ event }) => {
          if (!(event instanceof WheelEvent)) return true;
          // A sideways wheel (shift and a wheel) is a wide table's: native, as the canvas never scrolls sideways.
          if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return false;
          if (!fromTrackpad(event)) return true;
          if (lenis?.isScrolling === 'smooth') lenis.scrollTo(lenis.actualScroll, { immediate: true, force: true });
          return false;
        },
        prevent: (node) => {
          if (node.closest('[data-lenis-prevent], dialog, [role="dialog"], [role="menu"], [role="listbox"]')) return true;
          return node !== wrapper && chScrollsVertically(node);
        },
      });
      current = lenis;
      const loop = (time: number) => {
        // The canvas grows as a page streams in or a route changes; the scroll limit follows it.
        if (wrapper.scrollHeight !== height) {
          height = wrapper.scrollHeight;
          lenis?.resize();
        }
        lenis?.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      lenis?.destroy();
      lenis = null;
      current = null;
      height = 0;
    };
    const sync = () => (desk.matches ? start() : stop());
    sync();
    desk.addEventListener('change', sync);
    return () => {
      desk.removeEventListener('change', sync);
      stop();
    };
  }, [reduced]);
}

/** How much of the way to its target a glide covers each 60th of a second (Lenis's own default feel, 0.1, a touch quicker). */
const GLIDE_LERP = 0.14;

/** A wheel's movement in pixels, whatever unit the browser sent it in. */
function wheelPixels(event: WheelEvent, page: number): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * page;
  return event.deltaY;
}

/**
 * The box a wheel at `node` scrolls, going `dir` (1 down, -1 up): the nearest one up the tree that scrolls up and down
 * and has room left that way, else the document. Null where the wheel must go nowhere: a box that has run out of room
 * and contains its overscroll (a modal's body, a sheet) or a dialog's edge, so the page behind never moves.
 */
export function chWheelScroller(node: Element | null, dir: number): HTMLElement | null {
  for (let el = node instanceof HTMLElement ? node : (node?.parentElement ?? null); el && el !== document.body; el = el.parentElement) {
    if (chScrollsVertically(el)) {
      const room = dir > 0 ? el.scrollHeight - el.clientHeight - el.scrollTop > 0.5 : el.scrollTop > 0.5;
      if (room) return el;
      if (/contain|none/.test(getComputedStyle(el).overscrollBehaviorY)) return null;
    }
    if (el.tagName === 'DIALOG' || el.getAttribute('role') === 'dialog') return null;
  }
  const doc = document.scrollingElement as HTMLElement | null;
  if (!doc || doc.scrollHeight <= doc.clientHeight) return null;
  return (dir > 0 ? doc.scrollHeight - doc.clientHeight - doc.scrollTop > 0.5 : doc.scrollTop > 0.5) ? doc : null;
}

/**
 * Smooth wheel scrolling on every page and in every box that scrolls (owner, 2026-10-16: "smooth scroll on literally
 * every page and subpage"): a list, a pane, a modal's body, a sheet, the document of a page outside the frame. The
 * canvas keeps its Lenis (and a panel with its own keeps that); a wheel either of them took arrives here already
 * handled. Everything else is eased in place toward where the wheel sent it, on its own native scrollTop. The same
 * rules as the canvas: desktop with a fine pointer, a notched wheel (a trackpad stays native, CH-1621), never sideways
 * or a pinch, and off with reduced motion or Animations off. Mounted by the frame and the sign-in screens; one listener
 * however many mount it.
 */
let wheelMounts = 0;
let detachWheel: (() => void) | null = null;

function attachWheel(): () => void {
  const desk = window.matchMedia(DESK);
  const fromTrackpad = chTrackpadGesture();
  const glides = new WeakMap<HTMLElement, { pos: number; to: number; raf: number; last: number }>();
  const glide = (el: HTMLElement, dy: number) => {
    let g = glides.get(el);
    if (!g) {
      g = { pos: el.scrollTop, to: el.scrollTop, raf: 0, last: 0 };
      glides.set(el, g);
    }
    // At rest, something else may have moved it (a key, a drag, a jump): start from where it is.
    if (!g.raf) g.pos = g.to = el.scrollTop;
    g.to = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, g.to + dy));
    if (g.raf) return;
    const run = g;
    run.last = performance.now();
    const step = (now: number) => {
      const k = 1 - Math.pow(1 - GLIDE_LERP, Math.min(64, now - run.last) / (1000 / 60));
      run.last = now;
      run.pos += (run.to - run.pos) * k;
      const done = Math.abs(run.to - run.pos) < 0.5;
      if (done) run.pos = run.to;
      el.scrollTo({ top: run.pos, behavior: 'instant' });
      run.raf = done ? 0 : requestAnimationFrame(step);
    };
    run.raf = requestAnimationFrame(step);
  };
  const onWheel = (event: WheelEvent) => {
    if (event.defaultPrevented || event.ctrlKey || !desk.matches) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || fromTrackpad(event)) return;
    const dy = wheelPixels(event, window.innerHeight);
    if (!dy) return;
    const el = chWheelScroller(event.target instanceof Element ? event.target : null, Math.sign(dy));
    if (!el) return;
    // A box with a Lenis of its own that let this wheel through (a nested scroller inside it) is left to the browser.
    if (el.classList.contains('lenis')) {
      if (el.id === 'ch-canvas' && current) {
        event.preventDefault();
        current.scrollTo(current.targetScroll + dy);
      }
      return;
    }
    event.preventDefault();
    glide(el, dy);
  };
  window.addEventListener('wheel', onWheel, { passive: false });
  return () => window.removeEventListener('wheel', onWheel);
}

/** Mount where a Clubhouse screen roots (the frame, the sign-in screens). */
export function useSmoothWheelEverywhere(): void {
  const reduced = useChReducedMotion();
  useEffect(() => {
    if (reduced) return;
    wheelMounts += 1;
    if (wheelMounts === 1) detachWheel = attachWheel();
    return () => {
      wheelMounts -= 1;
      if (wheelMounts === 0) {
        detachWheel?.();
        detachWheel = null;
      }
    };
  }, [reduced]);
}

/**
 * A panel that scrolls on its own (the Calendar's details column) eases like the canvas does: the same duration and
 * curve, a trackpad left native, and a nested scroller or open menu left alone. Pass the panel's ref.
 */
export function usePanelSmoothScroll(ref: { current: HTMLElement | null }, { duration = CH_SCROLL_DUR }: { duration?: number } = {}): void {
  const reduced = useChReducedMotion();
  useEffect(() => {
    const wrapper = ref.current;
    if (reduced || !wrapper) return;
    const desk = window.matchMedia(DESK);
    let lenis: Lenis | null = null;
    let raf = 0;
    let height = 0;
    const start = () => {
      if (lenis) return;
      const fromTrackpad = chTrackpadGesture();
      lenis = new Lenis({
        wrapper,
        content: wrapper,
        duration,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        syncTouch: false,
        wheelMultiplier: 1,
        virtualScroll: ({ event }) => {
          if (!(event instanceof WheelEvent) || !fromTrackpad(event)) return true;
          if (lenis?.isScrolling === 'smooth') lenis.scrollTo(lenis.actualScroll, { immediate: true, force: true });
          return false;
        },
        prevent: (node) => node !== wrapper && !!node.closest('[data-lenis-prevent], dialog, [role="dialog"], [role="menu"], [role="listbox"]'),
      });
      const loop = (time: number) => {
        // Another panel (a class, an event) swaps in under the same wrapper: the limit follows its height.
        if (wrapper.scrollHeight !== height) {
          height = wrapper.scrollHeight;
          lenis?.resize();
        }
        lenis?.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      lenis?.destroy();
      lenis = null;
      height = 0;
    };
    const sync = () => (desk.matches ? start() : stop());
    sync();
    desk.addEventListener('change', sync);
    return () => {
      desk.removeEventListener('change', sync);
      stop();
    };
  }, [ref, reduced, duration]);
}
