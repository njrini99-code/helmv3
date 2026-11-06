'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { CH_FADE_MS, chSpringCurve, CH_DUR, CH_SWEEP_MS } from '../../../lib/motion';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useChSessionState } from '../../../lib/session-state';

const EASE = 'cubic-bezier(.22,1,.36,1)';

/** M-TEAM-08: rows reorder by FLIP on the smooth spring, the bars scaling on the same elements through their CSS transition. */
export function useRowFlip(root: RefObject<HTMLElement | null>, key: string): void {
  const reduced = useChReducedMotion();
  const tops = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const before = tops.current;
    const now = new Map<string, number>();
    el.querySelectorAll<HTMLElement>('.br[data-p]').forEach((row) => now.set(row.dataset.p!, row.getBoundingClientRect().top));
    tops.current = now;
    if (reduced || !before.size) return;
    const c = chSpringCurve('smooth');
    el.querySelectorAll<HTMLElement>('.br[data-p]').forEach((row) => {
      const was = before.get(row.dataset.p!);
      const dy = was == null ? 0 : was - now.get(row.dataset.p!)!;
      if (Math.abs(dy) > 0.5) row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: CH_DUR.reveal * 1000, easing: c.linear });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the station change alone
  }, [key]);
}

/** M-TEAM-10, 12, 16: content rises 6pt and fades over 300ms; a fade alone under Reduce Motion. Not on first paint. */
export function useContentIn(root: RefObject<HTMLElement | null>, key: string, selector: string): void {
  const reduced = useChReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    root.current?.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      if (reduced) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CH_FADE_MS, easing: 'linear' });
      else el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: CH_DUR.release * 1000, easing: EASE });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key alone
  }, [key]);
}

