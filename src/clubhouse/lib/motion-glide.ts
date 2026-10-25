'use client';

import { cubicBezier } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { CH_DUR, CH_EASE } from './motion';
import { useChReducedMotion } from './reduced-motion';

/** What a chart draws, as numbers in its own units (a bar's width in %, a point's y in the viewBox); null is a mark that isn't drawn. */
export type ChGlideGeometry = ReadonlyArray<number | null>;

/** A value change glides over the base beat (260ms) on the ease-out curve. */
export const CH_GLIDE_MS = CH_DUR.base * 1000;
const ease = cubicBezier(...CH_EASE);

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
