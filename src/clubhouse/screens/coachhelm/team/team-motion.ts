'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { CH_FADE_MS, chSpringCurve } from '../../../lib/motion';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useChSessionState } from '../../../lib/session-state';

const EASE = 'cubic-bezier(.22,1,.36,1)';

/**
 * M-TEAM-01 to 04: the ball flies the path once a session, the line drawing under it, each station arriving as the ball reaches it. Skipped under
 * Reduce Motion and on any later paint or refresh (CP-TEAM-10). Runs on the first paint with data, after fonts plus 250ms.
 */
export function useFlyIn(svg: RefObject<SVGSVGElement | null>, ready: boolean): void {
  const reduced = useChReducedMotion();
  const [flown, setFlown] = useChSessionState('htb-flown', false);
  const once = useRef(false);
  useLayoutEffect(() => {
    const root = svg.current;
    // The media query too: this first layout effect still holds the hook's server value, so Reduce Motion would fly once.
    if (!root || !ready || flown || reduced || once.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    once.current = true;
    const path = root.querySelector<SVGPathElement>('.flight');
    const ball = root.querySelector<SVGCircleElement>('.ball');
    const stations = Array.from(root.querySelectorAll<SVGGElement>('.stn'));
    if (!path || !ball) return;
    const len = path.getTotalLength();
    const fractions = stations.map((s) => {
      const c = s.querySelector<SVGCircleElement>('.core');
      if (!c) return 1;
      const x = Number(c.getAttribute('cx'));
      const y = Number(c.getAttribute('cy'));
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i <= 200; i++) {
        const p = path.getPointAtLength((len * i) / 200);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) {
          bd = d;
          best = i / 200;
        }
      }
      return best;
    });
    for (const s of stations) s.classList.add('pre');
    path.style.strokeDasharray = String(len);
    path.style.strokeDashoffset = String(len);
    let frame = 0;
    let cancelled = false;
    const quad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const start = () => {
      if (cancelled) return;
      ball.setAttribute('opacity', '1');
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / 1900);
        const e = quad(t);
        const p = path.getPointAtLength(len * e);
        ball.setAttribute('cx', String(p.x));
        ball.setAttribute('cy', String(p.y));
        path.style.strokeDashoffset = String(len * (1 - e));
        stations.forEach((s, i) => {
          if (e >= (fractions[i] ?? 1) - 0.02) s.classList.remove('pre');
        });
        if (t < 1) frame = requestAnimationFrame(step);
        else {
          ball.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 300, fill: 'forwards' });
          setFlown(true);
        }
      };
      frame = requestAnimationFrame(step);
    };
    const wait = window.setTimeout(() => void (document.fonts?.ready ?? Promise.resolve()).then(start), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(wait);
      cancelAnimationFrame(frame);
      for (const s of stations) s.classList.remove('pre');
      // Interrupted (a remount, Strict Mode's rerun): the line never stays undrawn, and the rerun may fly.
      path.style.removeProperty('stroke-dasharray');
      path.style.removeProperty('stroke-dashoffset');
      once.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the first paint with data
  }, [ready]);
}

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
      if (Math.abs(dy) > 0.5) row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 520, easing: c.linear });
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
      else el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key alone
  }, [key]);
}

/** M-TEAM-13 to 15: the trend draws once as the Course card comes in; Show more never restarts it (M-TEAM-17). */
export function useTrendDraw(root: RefObject<HTMLElement | null>): void {
  const reduced = useChReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const c = chSpringCurve('smooth');
    root.current?.querySelectorAll<SVGSVGElement>('.trend').forEach((svg) => {
      const line = svg.querySelector<SVGPathElement>('.ln');
      if (line) {
        const len = line.getTotalLength() || 600;
        line.animate([{ strokeDasharray: `${len}`, strokeDashoffset: `${len}` }, { strokeDasharray: `${len}`, strokeDashoffset: '0' }], { duration: 900, easing: 'cubic-bezier(.3,.7,.2,1)' });
      }
      svg.querySelectorAll<SVGCircleElement>('.d').forEach((dot, i) => dot.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 120 + i * 55, easing: c.linear, fill: 'backwards' }));
      svg.querySelectorAll<SVGTextElement>('.lv, .avl').forEach((t) => t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 760, fill: 'backwards' }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the card comes in
  }, []);
}
