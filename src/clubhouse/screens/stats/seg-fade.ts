'use client';

import { useEffect, type RefObject } from 'react';

/** Marks the window switch's segments as having more to scroll to, so the fade only shows when it means something (MOB-STATS-3). */
export function useSegFade(ctl: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const seg = ctl.current?.querySelector<HTMLElement>('.ch-seg');
    if (!seg) return;
    const mark = () => {
      if (seg.scrollWidth - seg.clientWidth - seg.scrollLeft > 1) seg.dataset.more = '';
      else delete seg.dataset.more;
    };
    mark();
    seg.addEventListener('scroll', mark, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(mark);
    ro?.observe(seg);
    return () => {
      seg.removeEventListener('scroll', mark);
      ro?.disconnect();
    };
  }, [ctl]);
}
