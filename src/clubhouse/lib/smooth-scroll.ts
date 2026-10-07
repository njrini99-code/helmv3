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
 * inside the canvas (a list, a table, a panel), a dialog and a menu keep their own native scroll.
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
      lenis = new Lenis({
        wrapper,
        content: wrapper,
        duration: CH_SCROLL_DUR,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        syncTouch: false,
        wheelMultiplier: 1,
        prevent: (node) => {
          if (node.closest('[data-lenis-prevent], dialog, [role="dialog"], [role="menu"], [role="listbox"]')) return true;
          if (node === wrapper) return false;
          const s = getComputedStyle(node);
          return /(auto|scroll)/.test(s.overflowY + s.overflowX) && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth);
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
