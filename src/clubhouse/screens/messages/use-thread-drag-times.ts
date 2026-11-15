'use client';

import { useEffect, type RefObject } from 'react';
import { chSpringCurve } from '../../lib/motion';
import { readTypeK } from '../../lib/type-k';

/** The drag's stop at the default Text Size; it scales with k (SETTLED-4NOV 9). */
export const TIMES_DRAG_PX = 58;
const FOLLOW = 0.6;
const AXIS_SLOP = 10;
const BACK_SWIPE_EDGE = 24;

/** Where the thread sits for a finger `dx` to the left: 60% of the drag, stopping at `max`. A rightward drag does nothing. */
export function dragOffset(dx: number, max: number): number {
  return Math.max(-max, Math.min(0, dx * FOLLOW));
}

/** The list's sideways offset as it is drawn right now, mid-settle included (0 when it has none or it can't be read). */
function liveX(l: HTMLElement): number {
  const x = Number(/^matrix\(([^)]+)\)$/.exec(getComputedStyle(l).transform)?.[1]?.split(',')[4]);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Drag for times (M-MSG-05, phone): a leftward pan on the thread moves every bubble and reveals each message's time, and it settles
 * back on release, starting from where it is if grabbed again. Vertical wins after 10px, so native scroll keeps it. The left 24px
 * stays the back swipe. Reduced: it follows the finger and returns at once. Writes `transform` directly, so no render per move.
 */
export function useThreadDragTimes(scroller: RefObject<HTMLElement | null>, enabled: boolean, reduced: boolean, k?: number): void {
  useEffect(() => {
    const el = scroller.current;
    if (!enabled || !el) return;
    const max = TIMES_DRAG_PX * (k ?? readTypeK(el));
    let start: { x: number; y: number; from: number } | null = null;
    let locked = false;
    let current = 0;
    const list = () => el.querySelector<HTMLElement>('.ch-ms-msgs');
    const paint = (x: number) => {
      current = x;
      const l = list();
      if (!l) return;
      l.style.transform = x ? `translateX(${x}px)` : '';
      // The times sit just past the row's edge and would peek through the page gutter at rest, so they show only while moved.
      if (x) l.setAttribute('data-ch-times', '');
    };
    const hideTimes = (l: HTMLElement | null) => l?.removeAttribute('data-ch-times');
    let settling: Animation | null = null;
    /** Back to rest from where it is. The times hide once it has landed, unless it was grabbed again on the way. */
    const settle = () => {
      const from = current;
      if (!from) return;
      const l = list();
      paint(0);
      if (reduced || !l?.animate) {
        hideTimes(l);
        return;
      }
      const curve = chSpringCurve('settle');
      const a = l.animate([{ transform: `translateX(${from}px)` }, { transform: 'none' }], { duration: curve.ms, easing: curve.linear });
      settling = a;
      a.onfinish = () => {
        if (settling === a) settling = null;
        if (!current) hideTimes(l);
      };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.clientX < BACK_SWIPE_EDGE) return;
      if ((e.target as Element | null)?.closest('button, a, input, textarea, [role="button"]')) return;
      const l = list();
      // Grabbed on its way back: it carries on from where it is, so the live offset is read before the settle is dropped.
      const live = l && settling ? liveX(l) : current;
      settling = null;
      l?.getAnimations().forEach((a) => a.cancel());
      if (live !== current) paint(live);
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
          // A scroll or a rightward pan is not this gesture; a thread caught on its way back still finishes the trip.
          start = null;
          settle();
          return;
        }
        locked = true;
      }
      paint(dragOffset(dx + start.from / FOLLOW, max));
    };
    const up = () => {
      if (!start) return;
      start = null;
      settle();
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
      hideTimes(list());
    };
  }, [scroller, enabled, reduced, k]);
}
