'use client';

import { useLayoutEffect, useRef } from 'react';
import { useChReducedMotion } from '../lib/reduced-motion';

/**
 * The sidebar's selected plate as one object that glides (owner, 2026-10-07: "super duper premium" motion; CH-1613).
 * The lit row is the one being opened (`LinkPending`'s `.ch-lp`, the first frame of a tap) or else the current page;
 * the plate moves to it on the transform at the base duration, so a tap reads as the plate travelling down the frame
 * rather than one row switching off and another on. Until this has measured, and wherever script never runs, each
 * row draws its own plate as before (`.ch-nav--plate` hands the drawing over). Reduced motion and Animations off jump.
 */
export function NavPlate() {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useChReducedMotion();

  useLayoutEffect(() => {
    const plate = ref.current;
    const nav = plate?.parentElement;
    if (!plate || !nav) return;
    let placed = false;
    const lit = () => nav.querySelector<HTMLElement>('.ch-navitem:has(.ch-lp)') ?? nav.querySelector<HTMLElement>('.ch-navitem[aria-current="page"]');
    const place = (glide: boolean) => {
      const row = lit();
      if (!row) {
        plate.style.opacity = '0';
        return;
      }
      const n = nav.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      // The first placement and any resize land without travelling; only a change of row glides.
      plate.style.transition = glide && placed && !reduced ? '' : 'none';
      plate.style.width = `${r.width}px`;
      plate.style.height = `${r.height}px`;
      plate.style.transform = `translate3d(${r.left - n.left}px, ${r.top - n.top}px, 0)`;
      plate.style.opacity = '1';
      if (!placed) {
        placed = true;
        nav.classList.add('ch-nav--plate');
      }
    };
    place(false);
    const mo = new MutationObserver(() => place(true));
    mo.observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current'] });
    const ro = new ResizeObserver(() => place(false));
    ro.observe(nav);
    return () => {
      mo.disconnect();
      ro.disconnect();
      nav.classList.remove('ch-nav--plate');
    };
  }, [reduced]);

  return <span ref={ref} className="ch-nav__plate" aria-hidden="true" />;
}
