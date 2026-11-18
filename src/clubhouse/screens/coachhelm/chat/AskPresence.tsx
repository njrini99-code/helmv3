'use client';

import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { useChReducedMotion } from '../../../lib/reduced-motion';

/** Wait only for this surface's finite exit, never a child's shimmer. Reopening cancels the old completion. */
export function useAskPresence(open: boolean, surface: RefObject<HTMLElement | null>) {
  const reduced = useChReducedMotion();
  const [retained, setRetained] = useState(open);
  useLayoutEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }
    const running = reduced ? [] : (surface.current?.getAnimations?.() ?? []).filter((a) => a.effect?.getTiming().iterations !== Infinity);
    if (!running.length) {
      setRetained(false);
      return;
    }
    let current = true;
    void Promise.allSettled(running.map((a) => a.finished)).then(() => {
      if (current) setRetained(false);
    });
    return () => { current = false; };
  }, [open, reduced, surface]);
  return { present: open || retained, leaving: !open && retained };
}

/** The last open contents stay inert while leaving; a pick must not empty its own exit. */
export function AskPresence({ open, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { open: boolean; children: ReactNode }) {
  const surface = useRef<HTMLDivElement>(null);
  const last = useRef(children);
  if (open) last.current = children;
  const { present, leaving } = useAskPresence(open, surface);
  if (!present) return null;
  return <div {...props} ref={surface} className={`${className ?? ''} ch-aki-presence${leaving ? ' is-leaving' : ''}`} inert={leaving || undefined} aria-hidden={leaving || undefined}>{open ? children : last.current}</div>;
}
