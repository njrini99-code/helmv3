'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — useHoleSwipe (owner decision D-HOLESWIPE)
 * ----------------------------------------------------------------------------
 * Swipe left/right on the hole content to move to the next/previous hole,
 * with a selection tick on commit.
 *
 *   • 20pt edge guard: a gesture that STARTS within 20px of either screen edge
 *     is left alone — that strip belongs to the OS back gesture.
 *   • Plain pointer events, not framer `drag`: the dashboard runs LazyMotion
 *     with `domAnimation`, under which `drag` silently does nothing.
 *   • Touch/pen only. A mouse drag selects text on desktop; the header's
 *     Prev/Next and the hole strip already serve pointer users.
 *   • Axis lock: the first 10px decide. Vertical wins ties (the page scrolls),
 *     so a slightly diagonal scroll never flips the hole.
 *   • Never starts on a text field, select, slider or anything marked
 *     `data-no-swipe`.
 *   • The content follows the finger (rubber-banded where there is no hole to
 *     go to), written straight to the element's transform — no re-render per
 *     frame. Reduced motion: no follow, the swipe still works.
 *   • A committed swipe swallows the click the lifted finger would otherwise
 *     deliver to whatever button it ended on.
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Width of the reserved OS back-gesture strip on each side, in CSS px (= pt). */
export const HOLE_SWIPE_EDGE_GUARD_PX = 20;
/** Horizontal travel that commits a hole change. */
export const HOLE_SWIPE_COMMIT_PX = 64;
/** A quick flick commits with less travel. */
const FLICK_MIN_PX = 28;
const FLICK_VELOCITY = 0.45; // px per ms
const AXIS_LOCK_PX = 10;

const NO_SWIPE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [role="slider"], [data-no-swipe]';

export interface HoleSwipeOptions {
  /** Can the player move to the previous / next hole right now? */
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Off while a modal owns the screen, or when there is nowhere to go. */
  enabled?: boolean;
  reduceMotion?: boolean;
}

type Gesture = {
  id: number;
  startX: number;
  startY: number;
  startT: number;
  dx: number;
  axis: 'x' | 'y' | null;
};

/**
 * Pure decision for a finished gesture — exported for unit tests.
 * Returns which way to move, or null.
 */
export function decideHoleSwipe(
  dx: number,
  elapsedMs: number,
  canPrev: boolean,
  canNext: boolean,
): 'prev' | 'next' | null {
  const distance = Math.abs(dx);
  const velocity = elapsedMs > 0 ? distance / elapsedMs : 0;
  const committed = distance >= HOLE_SWIPE_COMMIT_PX || (distance >= FLICK_MIN_PX && velocity >= FLICK_VELOCITY);
  if (!committed) return null;
  if (dx < 0) return canNext ? 'next' : null;
  return canPrev ? 'prev' : null;
}

/** Is this start point inside the reserved edge strip? */
export function isInEdgeGuard(x: number, viewportWidth: number): boolean {
  return x < HOLE_SWIPE_EDGE_GUARD_PX || x > viewportWidth - HOLE_SWIPE_EDGE_GUARD_PX;
}

export function useHoleSwipe<T extends HTMLElement>({
  canPrev, canNext, onPrev, onNext, enabled = true, reduceMotion = false,
}: HoleSwipeOptions) {
  // A callback ref (element in state) so the listeners bind whenever the
  // element mounts — including after an early-return render without it.
  const [node, setNode] = useState<T | null>(null);
  const gesture = useRef<Gesture | null>(null);
  // Latest options for the native listeners, without re-binding them.
  const opts = useRef({ canPrev, canNext, onPrev, onNext, enabled, reduceMotion });
  useEffect(() => {
    opts.current = { canPrev, canNext, onPrev, onNext, enabled, reduceMotion };
  });

  const setOffset = useCallback((px: number, animate: boolean) => {
    const el = node;
    if (!el) return;
    el.style.transition = animate ? 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
    el.style.transform = px === 0 ? '' : `translate3d(${px}px, 0, 0)`;
  }, [node]);

  useEffect(() => {
    const el = node;
    if (!el) return;

    const swallowNextClick = () => {
      const stop = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
      };
      window.addEventListener('click', stop, { capture: true, once: true });
      // If no click follows (the finger lifted off any target), drop the trap.
      window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
    };

    const onDown = (e: PointerEvent) => {
      const o = opts.current;
      if (!o.enabled || e.pointerType === 'mouse' || !e.isPrimary) return;
      if (isInEdgeGuard(e.clientX, window.innerWidth)) return;
      const target = e.target as Element | null;
      if (target?.closest(NO_SWIPE_SELECTOR)) return;
      gesture.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, startT: e.timeStamp, dx: 0, axis: null };
    };

    const onMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (g.axis === null) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
        g.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
        if (g.axis === 'y') {
          gesture.current = null;
          return;
        }
      }
      g.dx = dx;
      const o = opts.current;
      if (o.reduceMotion) return;
      const allowed = dx < 0 ? o.canNext : o.canPrev;
      // Follow the finger; rubber-band hard where there is no hole to go to.
      setOffset(allowed ? dx * 0.9 : dx * 0.2, false);
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.id) return;
      gesture.current = null;
      if (g.axis !== 'x') return;
      setOffset(0, !opts.current.reduceMotion);
      if (cancelled) return;
      const o = opts.current;
      const move = decideHoleSwipe(g.dx, e.timeStamp - g.startT, o.canPrev, o.canNext);
      // Any horizontal swipe owns its lift: never also click what it ended on.
      swallowNextClick();
      if (move === 'next') o.onNext();
      else if (move === 'prev') o.onPrev();
    };

    const onUp = (e: PointerEvent) => finish(e, false);
    const onCancel = (e: PointerEvent) => finish(e, true);

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [node, setOffset]);

  return setNode;
}
