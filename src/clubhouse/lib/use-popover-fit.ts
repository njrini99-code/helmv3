'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';
import { overlayView, placeOverlay, watchOverlayView } from './overlay-place';

type Placement = { left: number; top: number; maxHeight: number };

/** Keep an absolute popover beside its positioned anchor and inside the viewport, on the shared placement (lib/overlay-place.ts). */
export function usePopoverFit(ref: RefObject<HTMLElement | null>, open = true) {
  const [placement, setPlacement] = useState<Placement>();
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const panel = ref.current;
    const place = () => {
      const anchor = panel.offsetParent;
      if (!(anchor instanceof HTMLElement)) return;
      const r = anchor.getBoundingClientRect();
      const p = placeOverlay(r, { width: panel.getBoundingClientRect().width, height: panel.scrollHeight }, overlayView(), { gap: 8, edge: 8 });
      // Relative to its positioned anchor (the panel is absolute inside it).
      setPlacement({ left: p.left - r.left, top: p.top - r.top, maxHeight: p.maxHeight });
    };
    place();
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panel.contains(event.target)) return;
      place();
    };
    const unwatch = watchOverlayView(place);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      unwatch();
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, ref]);
  return placement;
}
