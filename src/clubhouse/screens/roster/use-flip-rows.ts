'use client';

import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { CH_EASE, CH_FADE_MS } from '../../lib/motion';
import { useChMotionMode } from '../../lib/reduced-motion';

const EASE = `cubic-bezier(${CH_EASE.join(', ')})`;
/** classes-roster-home 07 M-CRH-27. */
const FLIP_MS = 360;

/**
 * The sort reorder (07 M-CRH-27): `capture()` reads each row's place on screen as the sort is chosen, so a second sort mid-flight
 * starts from where the rows are, and after the commit each moved row slides from there on the ease, all together. Reduced motion: the
 * list crossfades over `CH_FADE_MS`, nothing travels. Animations off: nothing. A refresh never captures, so it never moves a row.
 */
export function useFlipRows(list: RefObject<HTMLElement | null>, order: string) {
  const mode = useChMotionMode();
  const first = useRef<Map<string, number> | null>(null);
  const rows = () => Array.from(list.current?.querySelectorAll<HTMLElement>('[data-flip]') ?? []);
  const capture = useCallback(() => {
    const at = new Map<string, number>();
    for (const el of rows()) at.set(el.dataset.flip!, el.getBoundingClientRect().top);
    first.current = at;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rows` reads the ref
  }, []);
  useLayoutEffect(() => {
    const from = first.current;
    first.current = null;
    if (!from || mode === 'off') return;
    if (mode === 'fade') {
      list.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: CH_FADE_MS, easing: EASE });
      return;
    }
    for (const el of rows()) {
      for (const a of el.getAnimations?.() ?? []) a.cancel();
      const was = from.get(el.dataset.flip!);
      if (was == null) continue;
      const dy = was - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      el.animate?.([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: FLIP_MS, easing: EASE });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the order changes; `rows` reads the ref
  }, [order]);
  return capture;
}
