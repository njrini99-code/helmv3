'use client';

import { useEffect, type RefObject } from 'react';
import { chSpringCurve } from '../../lib/motion';

/** The drag's stop at the default Text Size; it scales with k (SETTLED-4NOV 9). */
export const TIMES_DRAG_PX = 58;
const FOLLOW = 0.6;
const AXIS_SLOP = 10;
const BACK_SWIPE_EDGE = 24;

/** Where the thread sits for a finger `dx` to the left: 60% of the drag, stopping at `max`. A rightward drag does nothing. */
export function dragOffset(dx: number, max: number): number {
  return Math.max(-max, Math.min(0, dx * FOLLOW));
}

/**
 * Drag for times (M-MSG-05, phone): a leftward pan on the thread moves every bubble and reveals each message's time, and it settles
 * back on release, starting from where it is if grabbed again. Vertical wins after 10px, so native scroll keeps it. The left 24px
 * stays the back swipe. Reduced: it follows the finger and returns at once. Writes `transform` directly, so no render per move.
 */
export function useThreadDragTimes(scroller: RefObject<HTMLElement | null>, enabled: boolean, reduced: boolean, k = 1): void {
  useEffect(() => {
    const el = scroller.current;
    if (!enabled || !el) return;
    const max = TIMES_DRAG_PX * k;
    let start: { x: number; y: number; from: number } | null = null;
    let locked = false;
    let current = 0;
    const list = () => el.querySelector<HTMLElement>('.ch-ms-msgs');
    const paint = (x: number) => {
      current = x;
      const l = list();
      if (l) l.style.transform = x ? `translateX(${x}px)` : '';
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.clientX < BACK_SWIPE_EDGE) return;
      if ((e.target as Element | null)?.closest('button, a, input, textarea, [role="button"]')) return;
      const l = list();
      l?.getAnimations().forEach((a) => a.cancel());
      start = { x: e.clientX, y: e.clientY, from: current };
      locked = false;
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!locked) {
        if (Math.hypot(dx, dy) < AXIS_SLOP) return;
        if (Math.abs(dy) >= Math.abs(dx) || dx > 0) {
          start = null;
          return;
        }
        locked = true;
      }
      paint(dragOffset(dx + start.from / FOLLOW, max));
    };
    const up = () => {
      if (!start) return;
      const from = current;
      start = null;
      if (!from) return;
      const l = list();
      paint(0);
      if (reduced || !l?.animate) return;
      const curve = chSpringCurve('settle');
      l.animate([{ transform: `translateX(${from}px)` }, { transform: 'none' }], { duration: curve.ms, easing: curve.linear });
    };
    el.addEventListener('pointerdown', down, { passive: true });
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      paint(0);
    };
  }, [scroller, enabled, reduced, k]);
}
