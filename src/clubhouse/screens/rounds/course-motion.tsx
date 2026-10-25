'use client';

import { animate, m, useMotionValue, type MotionValue } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { chSpring, chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';

/**
 * P-7 section 5.1 (M2, M3, M6, M12): the course page's small fades and its one height ease. Never on first paint, and
 * instant under reduced motion and Animations off (`reduced`, from useChReducedMotion).
 */

/**
 * An opacity that dips to 0 and returns to 1 over the quick beat whenever `key` changes (never on mount). A change
 * mid-fade restarts from the opacity it has reached, not from a snap. With `scope`, a change of key that arrives with a
 * change of scope is not faded here (another fade, the hole panel's, already covers it).
 */
export function useFadeOnChange(key: string | number, reduced: boolean, scope?: string | number): MotionValue<number> {
  const o = useMotionValue(1);
  const last = useRef({ key, scope });
  useLayoutEffect(() => {
    const was = last.current;
    last.current = { key, scope };
    if (was.key === key) return undefined;
    if (reduced) {
      o.set(1);
      return undefined;
    }
    if (was.scope !== scope) {
      o.set(1);
      return undefined;
    }
    if (o.get() >= 1) o.set(0);
    const run = animate(o, 1, chTween('quick'));
    return () => run.stop();
  }, [key, scope, reduced, o]);
  return o;
}

/** A figure that takes its new value with a quick fade, not a roll (M6). */
export function FadeNum({ text, className, scope }: { text: string; className?: string; scope?: string | number }) {
  const reduced = useChReducedMotion();
  const o = useFadeOnChange(text, reduced, scope);
  return (
    <m.span className={className} style={{ opacity: o }}>
      {text}
    </m.span>
  );
}

/**
 * M12: a block's height eases when what it holds changes size on `key` (a note's "Show all"), on the smooth spring.
 * A line clamp can't animate, so the change lands at once and the frame is pinned at the old height, clipped, then
 * eased to the new one and let go to `auto`. A change mid-ease starts from where the frame is. The resting height is
 * kept by a ResizeObserver (no reads on render).
 */
export function useExpandHeight(key: string | number | boolean): RefObject<HTMLDivElement | null> {
  const reduced = useChReducedMotion();
  const frame = useRef<HTMLDivElement | null>(null);
  const rest = useRef<number | null>(null);
  const shown = useRef(key);
  useEffect(() => {
    const el = frame.current;
    if (!el) return undefined;
    rest.current = el.offsetHeight;
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (!el.style.height) rest.current = el.offsetHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (shown.current === key) return undefined;
    shown.current = key;
    const el = frame.current;
    if (!el || reduced) return undefined;
    const from = el.style.height ? el.getBoundingClientRect().height : rest.current;
    el.style.height = '';
    const to = el.offsetHeight;
    if (from == null || Math.abs(to - from) < 1) return undefined;
    el.style.overflow = 'clip';
    el.style.height = `${from}px`;
    const run = animate(el, { height: `${to}px` }, chSpring('smooth'));
    const done = () => {
      el.style.height = '';
      el.style.overflow = '';
      rest.current = el.offsetHeight;
    };
    let live = true;
    run.then(() => live && done());
    return () => {
      live = false;
      run.stop();
    };
  }, [key, reduced]);
  return frame;
}
