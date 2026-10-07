'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

type Placement = { left: number; top: number; maxHeight: number };

/** Keep an absolute popover beside its positioned anchor and inside the viewport. */
export function usePopoverFit(ref: RefObject<HTMLElement | null>, open = true) {
  const [placement, setPlacement] = useState<Placement>();
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const panel = ref.current;
    const place = () => {
      const anchor = panel.offsetParent;
      if (!(anchor instanceof HTMLElement)) return;
      const r = anchor.getBoundingClientRect();
      const width = panel.getBoundingClientRect().width;
      const height = panel.scrollHeight;
      const viewport = window.visualViewport;
      const bottom = Math.min(window.innerHeight, viewport ? viewport.offsetTop + viewport.height : window.innerHeight);
      const above = Math.max(0, r.top - 16);
      const below = Math.max(0, bottom - r.bottom - 16);
      const up = height > below && above > below;
      const maxHeight = up ? above : below;
      setPlacement({
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) - r.left,
        top: up ? -Math.min(height, maxHeight) - 8 : r.height + 8,
        maxHeight,
      });
    };
    place();
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panel.contains(event.target)) return;
      place();
    };
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, ref]);
  return placement;
}
