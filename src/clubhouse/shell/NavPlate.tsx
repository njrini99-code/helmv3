'use client';

import { useLayoutEffect, useRef } from 'react';
import { chSpringCurve } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';

/**
 * The sidebar's selected plate as one object that glides (owner, 2026-10-07: "super duper premium" motion; CH-1613).
 * The lit row is the one being opened (`LinkPending`'s `.ch-lp`, the first frame of a tap) or else the current page;
 * the plate travels to it on the smooth spring (base, no bounce), so a tap reads as the plate moving down the frame
 * rather than one row switching off and another on. A second tap mid-glide sends it on from where it is at the speed
 * it is going; toward a row too near to stop at from that speed it starts slower, so it never passes the row (the
 * spring is sampled into Web Animations keyframes, so it needs no animation library in the shell).
 * Until this has measured, and wherever script never runs, each row draws its own plate as before (`.ch-nav--plate`
 * hands the drawing over). Reduced motion and Animations off jump.
 */
export function NavPlate() {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useChReducedMotion();

  useLayoutEffect(() => {
    const plate = ref.current;
    const nav = plate?.parentElement;
    if (!plate || !nav) return;
    let placed = false;
    let rest = { x: 0, y: 0 };
    let glide: { anim: Animation; from: number; to: number; at: number; ms: number; ease: (p: number) => number } | null = null;
    const lit = () => nav.querySelector<HTMLElement>('.ch-navitem:has(.ch-lp)') ?? nav.querySelector<HTMLElement>('.ch-navitem[aria-current="page"]');
    /** Where a glide has the plate now, and its speed in px per ms. */
    const travelling = (): { y: number; v: number } => {
      if (!glide) return { y: rest.y, v: 0 };
      const p = (performance.now() - glide.at) / glide.ms;
      if (p >= 1) return { y: glide.to, v: 0 };
      const span = glide.to - glide.from;
      const slope = (glide.ease(Math.min(1, p + 0.005)) - glide.ease(Math.max(0, p - 0.005))) / 0.01;
      return { y: glide.from + span * glide.ease(Math.max(0, p)), v: (span * slope) / glide.ms };
    };
    const place = (travel: boolean) => {
      const row = lit();
      if (!row) {
        plate.style.opacity = '0';
        return;
      }
      const n = nav.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      const to = { x: r.left - n.left, y: r.top - n.top };
      const at = (y: number) => `translate3d(${to.x}px, ${y}px, 0)`;
      const now = travelling();
      const previous = glide;
      glide = null;
      // The first placement and any resize land without travelling; only a change of row glides.
      if (travel && placed && !reduced && typeof plate.animate === 'function' && Math.abs(to.y - now.y) >= 0.5) {
        const span = to.y - now.y;
        const curve = chSpringCurve('smooth', { velocity: (now.v * 1000) / span, rest: 0.5 / Math.abs(span), hold: true });
        const steps = Math.max(8, Math.round(curve.ms / 16));
        const frames = Array.from({ length: steps + 1 }, (_, i) => ({ transform: at(now.y + span * curve.ease(i / steps)) }));
        glide = { anim: plate.animate(frames, { duration: curve.ms, easing: 'linear' }), from: now.y, to: to.y, at: performance.now(), ms: curve.ms, ease: curve.ease };
      }
      previous?.anim.cancel();
      plate.style.width = `${r.width}px`;
      plate.style.height = `${r.height}px`;
      plate.style.transform = at(to.y);
      plate.style.opacity = '1';
      rest = to;
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
      glide?.anim.cancel();
      nav.classList.remove('ch-nav--plate');
    };
  }, [reduced]);

  return <span ref={ref} className="ch-nav__plate" aria-hidden="true" />;
}
