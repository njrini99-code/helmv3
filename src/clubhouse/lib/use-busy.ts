'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CH_BUSY, CH_DUR_MS, CH_EASE_OUT } from './motion';
import { chMotionModeNow } from './reduced-motion';

/**
 * Loading (MOTION-AND-VISUAL 3.9), the one path every Clubhouse wait goes through:
 *   1. A request starts. Nothing new is drawn for `CH_BUSY.delay` (150 ms): what was there stays, or nothing.
 *   2. If it has not resolved, the static skeleton (or a refetch's dim) shows.
 *   3. Once shown it holds at least `CH_BUSY.min` (300 ms), so it never flashes.
 *   4. The content crossfades in over the quick beat (180 ms), opacity only (`useBusyReveal`).
 * Most requests finish inside the first 150 ms, so most people never see a skeleton at all.
 *
 * `idle`: the request runs and nothing new shows yet (keep what was there, or draw nothing). `skeleton`: draw the
 * skeleton, or dim what is changing. `ready`: draw the content. A request that starts again while the skeleton holds keeps
 * it up, with no second wait, and the hold still counts from when the skeleton first showed.
 *
 * Route skeletons (each route's `loading.tsx`) are painted from the server before this hook could run, so their blocks wait
 * the same 150 ms in CSS (`--ch-dur-busy-delay`, shell.css `ch-busy-wait`); their frame (the bar, the title, the strip) is
 * in the first frame (production audit 2026-11-15, S4.4). The wait is not motion: Reduce Motion and Animations off keep it.
 */
export type ChBusyPhase = 'idle' | 'skeleton' | 'ready';

export function useBusy(pending: boolean, { delay = CH_BUSY.delay, min = CH_BUSY.min }: { delay?: number; min?: number } = {}): ChBusyPhase {
  const [phase, setPhase] = useState<ChBusyPhase>(pending ? 'idle' : 'ready');
  // When the skeleton went up, while it is up; null once the content has taken its place.
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    if (pending) {
      if (shownAt.current !== null) setPhase('skeleton');
      else {
        setPhase('idle');
        timer = window.setTimeout(() => {
          shownAt.current = Date.now();
          setPhase('skeleton');
        }, delay);
      }
    } else if (shownAt.current === null) setPhase('ready');
    else {
      const ready = () => {
        shownAt.current = null;
        setPhase('ready');
      };
      const left = min - (Date.now() - shownAt.current);
      if (left > 0) timer = window.setTimeout(ready, left);
      else ready();
    }
    return () => window.clearTimeout(timer);
  }, [pending, delay, min]);
  return phase;
}

/**
 * Step 4: the content that takes a shown skeleton's place fades in over the quick beat, opacity only, on the compositor
 * (a Web Animation, so no keyframe is added). Content that lands before the skeleton showed is simply there. Reduce Motion
 * keeps the fade (3.11: it is already the 180 ms fade); Animations off swaps at once. Put the ref on the element that holds
 * the content.
 */
export function useBusyReveal<T extends HTMLElement = HTMLElement>(phase: ChBusyPhase): (el: T | null) => void {
  const node = useRef<T | null>(null);
  const was = useRef(phase);
  useLayoutEffect(() => {
    const from = was.current;
    was.current = phase;
    if (from !== 'skeleton' || phase !== 'ready') return;
    const el = node.current;
    if (!el?.animate || chMotionModeNow() === 'off') return;
    const fade = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CH_DUR_MS.quick, easing: `cubic-bezier(${CH_EASE_OUT.join(', ')})` });
    // Held at its first frame until the content has painted, so a busy frame cannot use the fade up unseen.
    fade.pause();
    const frame = requestAnimationFrame(() => fade.play());
    // A new request before the fade has run (or the content leaving): the content stands at full opacity, never held at 0.
    return () => {
      cancelAnimationFrame(frame);
      fade.cancel();
    };
  }, [phase]);
  return useCallback((el: T | null) => {
    node.current = el;
  }, []);
}
