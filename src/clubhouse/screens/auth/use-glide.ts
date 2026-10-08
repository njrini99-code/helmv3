'use client';

import { useCallback, useMemo, useRef, type RefObject } from 'react';
import { CH_DUR, CH_EASE } from '../../lib/motion';

export interface Glider {
  ref: RefObject<HTMLElement | null>;
  /** Measured against this glider, so a glide inside a gliding parent (the centred form and its button) composes with it. */
  within?: RefObject<HTMLElement | null>;
}

const EASE = `cubic-bezier(${CH_EASE.join(', ')})`;
const ID = 'ch-au-glide';

/**
 * Layout position only: offsets ignore transforms and the panel's scroll. Summed up the offsetParent chain because a
 * glider with a transform running becomes its children's offsetParent in WebKit, which changes what offsetTop is
 * measured from mid-glide.
 */
function layoutTop(el: HTMLElement): number {
  let t = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) t += e.offsetTop;
  return t;
}

/** Null for a glider that is not drawn (the phone's forgot link on the desktop). */
function topOf(g: Glider): number | null {
  const el = g.ref.current;
  if (!el || !el.offsetParent) return null;
  const parent = g.within?.current;
  return layoutTop(el) - (parent ? layoutTop(parent) : 0);
}

/** Where a glide still running has the element (its translateY), so a second change starts from there, not from rest. */
function inFlight(el: HTMLElement): number {
  const running = el.getAnimations?.().find((a) => a.id === ID);
  if (!running) return 0;
  const m = /matrix(?:3d)?\(([^)]+)\)/.exec(getComputedStyle(el).transform);
  running.cancel();
  const v = (m?.[1] ?? '').split(',').map(Number);
  return (v.length === 16 ? v[13] : v[5]) || 0;
}

/**
 * CH-15608: a refusal appearing or changing under the fields moves what is below it (and, on the desktop, recentres the
 * form). Height is never animated: the layout changes at once and each glider is drawn where it was, then slides home
 * on transform over the base beat (FLIP). `capture` before the change, `play` once it has committed. Reduced motion and
 * Animations off, and browsers without the Web Animations API, simply take the new layout.
 */
export function useGlide(reduced: boolean, gliders: readonly Glider[]) {
  const first = useRef<(number | null)[] | null>(null);
  const capture = useCallback(() => {
    first.current = gliders.map(topOf);
  }, [gliders]);
  const play = useCallback(() => {
    const was = first.current;
    first.current = null;
    if (!was || reduced) return;
    // Every new position is read before any glide starts, so no measurement sees another glider's transform.
    const now = gliders.map(topOf);
    gliders.forEach((g, i) => {
      const el = g.ref.current;
      const before = was[i];
      const after = now[i];
      if (!el || before == null || after == null || typeof el.animate !== 'function') return;
      const dy = before - after + inFlight(el);
      if (Math.abs(dy) < 0.5) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: CH_DUR.base * 1000, easing: EASE, id: ID });
    });
  }, [gliders, reduced]);
  return useMemo(() => ({ capture, play }), [capture, play]);
}
