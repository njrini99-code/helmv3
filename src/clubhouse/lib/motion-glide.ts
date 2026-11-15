'use client';

import { cubicBezier } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CH_DUR_MS, CH_EASE_IOS, CH_EASE_IOS_CSS } from './motion';
import { chMotionModeNow, useChReducedMotion } from './reduced-motion';

/** What a chart draws, as numbers in its own units (a bar's width in %, a point's y in the viewBox); null is a mark that isn't drawn. */
export type ChGlideGeometry = ReadonlyArray<number | null>;

/** A window change glides the marks, the line and the mean over the marks beat (360ms) on the iOS curve (MOTION-AND-VISUAL 3.7). */
export const CH_GLIDE_MS = CH_DUR_MS.marks;
const ease = cubicBezier(...CH_EASE_IOS);

const sameShape = (a: ChGlideGeometry, b: ChGlideGeometry) => a.length === b.length && a.every((v, i) => (v == null) === (b[i] == null));
const keyOf = (g: ChGlideGeometry) => g.map((v) => (v == null ? '-' : Math.round(v * 1000))).join(',');

/**
 * Bars and lines glide to new values (owner decision 1, 2026-10-24, OQ-16 / B9): when a chart's figures change (a new
 * window), what it draws moves from where it was to where it now belongs. Never on first paint, which returns `target` and
 * schedules nothing; never for a re-render that draws the same thing (a hover, a pin). The caller passes the drawn geometry,
 * not the data, since the scale moves with the window: tweening values against the new scale would draw a wrong path in
 * flight. Digits, readouts and labels take the new figure at once (digits do not roll). A mark that comes or goes (the
 * shape changes, or `identity` does: another set of rows) snaps, as does everything under reduced motion or Animations off.
 */
export function useGlide(target: ChGlideGeometry, identity = ''): ChGlideGeometry {
  const reduced = useChReducedMotion();
  const key = `${identity}|${keyOf(target)}`;
  const [shown, setShown] = useState<{ key: string; identity: string; at: ChGlideGeometry }>({ key, identity, at: target });
  // What is on screen this frame: where an interrupted glide starts its next one.
  const now = useRef<ChGlideGeometry>(target);
  const last = useRef({ key, identity });

  useEffect(() => {
    if (key === last.current.key) {
      // The same figures, run again (Reduce Motion turned on mid-glide): settle where they belong.
      if (now.current !== target && keyOf(now.current) !== keyOf(target)) {
        now.current = target;
        setShown({ key, identity, at: target });
      }
      return;
    }
    const from = now.current;
    const snap = reduced || identity !== last.current.identity || !sameShape(from, target);
    last.current = { key, identity };
    if (snap) {
      now.current = target;
      setShown({ key, identity, at: target });
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const step = (ts: number) => {
      t0 ??= ts;
      const p = Math.min(1, (ts - t0) / CH_GLIDE_MS);
      const e = ease(p);
      now.current = p >= 1 ? target : target.map((v, i) => (v == null ? null : from[i]! + (v - from[i]!) * e));
      setShown({ key, identity, at: now.current });
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // `target` is read through `key`, which spells it out; a new array with the same figures is no change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);

  // The render that brings a change draws the old geometry (the glide's first frame), unless it would snap anyway.
  if (shown.key === key) return shown.at;
  return reduced || identity !== shown.identity || !sameShape(shown.at, target) ? target : shown.at;
}

/** The sessionStorage key that says a screen's bar charts have had their first view in this session. */
export const firstViewKey = (screen: string) => `ch:first-view:${screen}`;
/** When each screen's first view was decided in this tab (-Infinity: it had been seen already). */
const decided = new Map<string, number>();

/**
 * Whether bars mounting on `screen` now are its first view in this session, and records that it has been viewed. Charts that
 * mount within the marks beat of the first one (the same page arriving) share its answer; any later mount is a revisit.
 */
function firstView(screen: string, now: number): boolean {
  const since = decided.get(screen);
  if (since !== undefined) return now - since < CH_DUR_MS.marks;
  let seen = false;
  try {
    seen = sessionStorage.getItem(firstViewKey(screen)) !== null;
    sessionStorage.setItem(firstViewKey(screen), '1');
  } catch {
    // Storage blocked (a private window, a preview): this tab's memory decides alone.
  }
  decided.set(screen, seen ? -Infinity : now);
  return !seen;
}

/** Test seam: forget what this tab decided (sessionStorage is the tests' to clear). */
export function resetFirstViews(): void {
  decided.clear();
}

const noSubscribe = () => () => {};

/**
 * A bar chart's first view in a session (MOTION-AND-VISUAL 3.7): its bars grow from the origin the chart gives them (the par
 * line, a zero) over the marks beat (360ms) on the iOS curve, once per screen per session. Never on a revisit, never for a
 * line chart (lines don't draw in: don't use this there), never under Reduce Motion or Animations off, and never over a page
 * the server drew (hydration), whose bars were already on screen at full length.
 *
 * Put the returned ref on the chart's root and mark each bar `data-ch-grow="<transform-origin>"`: `left` for a bar that
 * grows rightward from its left edge, `right` for one growing leftward, `bottom` for a column standing on its baseline, or
 * the par line's place for an SVG mark (`0 62px`). `axis` is the direction the bars run. Transform and opacity only: a bar is
 * laid out at its full length at once and scaled from its origin, so nothing is laid out per frame. Decided once, at mount.
 */
export function useFirstViewGrow<T extends Element = HTMLElement>(screen: string, axis: 'x' | 'y' = 'y'): (el: T | null) => void {
  // True only while React hydrates server HTML (the server snapshot), false for a chart mounted on the client.
  const hydrating = useSyncExternalStore(noSubscribe, () => false, () => true);
  const atMount = useRef(hydrating);
  const node = useRef<T | null>(null);
  useLayoutEffect(() => {
    const grows = firstView(screen, performance.now());
    const root = node.current;
    if (!grows || atMount.current || !root || chMotionModeNow() !== 'full') return;
    const from = axis === 'x' ? 'scaleX(0)' : 'scaleY(0)';
    const runs: Animation[] = [];
    for (const bar of root.querySelectorAll<HTMLElement | SVGElement>('[data-ch-grow]')) {
      if (typeof bar.animate !== 'function') continue;
      const origin = bar.getAttribute('data-ch-grow') || (axis === 'x' ? 'left' : 'bottom');
      runs.push(bar.animate([{ transform: from, transformOrigin: origin }, { transform: 'none', transformOrigin: origin }], { duration: CH_DUR_MS.marks, easing: CH_EASE_IOS_CSS }));
    }
    return () => runs.forEach((a) => a.cancel());
    // Decided once, at mount: a later change of window glides (useGlide), it never grows again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useCallback((el: T | null) => {
    node.current = el;
  }, []);
}
