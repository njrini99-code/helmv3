'use client';

import { animate, m, useMotionValue, type MotionValue } from 'motion/react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';

/**
 * P-7 section 5.1 (M2, M3, M6, M12): the course page's small fades; nothing on it animates a height. Never on first paint, and
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
 * M12, revised (production audit 2026-11-15, MOT-15): a block whose content changes size on `swap` (a note's "Show all")
 * takes its new height at once, and its content fades back in over the quick beat. Height is never animated: a height
 * ease lays the page out again on every frame. Never on first paint; instant under reduced motion and Animations off.
 */
export function SwapFade({ swap, className, children }: { swap: string | number | boolean; className?: string; children: ReactNode }) {
  const reduced = useChReducedMotion();
  const o = useFadeOnChange(String(swap), reduced);
  return (
    <m.div className={className} style={{ opacity: o }}>
      {children}
    </m.div>
  );
}
