'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Scroll-driven effects for the Products landing, ported 1:1 from the Claude
 * Design handoff's `componentDidMount`:
 *   - `[data-reveal]` (+ `data-reveal-delay`) — fade/rise in on first intersect.
 *   - `[data-fx="count"]` (+ `data-to`) — count-up when scrolled into view.
 *   - `[data-fx="spark"]`   — draw an SVG polyline via stroke-dashoffset.
 *   - `[data-fx="stagger"]` (children `[data-si]`) — staggered fade/rise.
 *   - `[data-fx="bar"]` (+ `data-w`) — animate a progress bar to its width.
 *
 * Progressive-enhancement contract: markup renders fully visible; JS hides then
 * reveals. Under `prefers-reduced-motion`, every element is snapped to its final
 * state and no scroll listeners are attached. `.scan` / `.pulse` ambient loops
 * are CSS-only (see products-landing.module.css) and are disabled by the same
 * media query, so they aren't touched here.
 */
export function useProductsEffects(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- scroll reveal ------------------------------------------------------
    const reveals = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    let io: IntersectionObserver | undefined;
    if (!reduce && typeof IntersectionObserver === 'function') {
      reveals.forEach((el) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition =
          'opacity .8s cubic-bezier(.16,1,.3,1), transform .8s cubic-bezier(.16,1,.3,1)';
        const d = el.getAttribute('data-reveal-delay');
        if (d) el.style.transitionDelay = `${d}ms`;
      });
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const el = entry.target as HTMLElement;
              el.style.opacity = '1';
              el.style.transform = 'none';
              io?.unobserve(el);
            }
          });
        },
        { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
      );
      reveals.forEach((el) => io?.observe(el));
    }

    // --- effects (count / spark / stagger / bar) ---------------------------
    const fx = Array.from(root.querySelectorAll<HTMLElement>('[data-fx]'));
    const done = new WeakSet<HTMLElement>();

    const countUp = (el: HTMLElement) => {
      const to = parseInt(el.getAttribute('data-to') ?? '0', 10) || 0;
      const dur = 1400;
      const start = performance.now();
      const ease = (t: number) => 1 - Math.pow(1 - t, 3);
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        el.textContent = String(Math.round(ease(p) * to));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    fx.forEach((el) => {
      const kind = el.getAttribute('data-fx');
      if (reduce) {
        if (kind === 'count') el.textContent = el.getAttribute('data-to') ?? el.textContent;
        if (kind === 'spark') el.style.strokeDashoffset = '0';
        if (kind === 'bar') el.style.width = el.getAttribute('data-w') ?? '100%';
        if (kind === 'stagger') {
          el.querySelectorAll<HTMLElement>('[data-si]').forEach((r) => {
            r.style.opacity = '1';
            r.style.transform = 'none';
          });
        }
        done.add(el);
        return;
      }
      if (kind === 'spark') {
        let len = 200;
        try {
          len = (el as unknown as SVGGeometryElement).getTotalLength();
        } catch {
          /* jsdom / unsupported — keep fallback length */
        }
        el.style.strokeDasharray = String(len);
        el.style.strokeDashoffset = String(len);
      }
      if (kind === 'stagger') {
        el.querySelectorAll<HTMLElement>('[data-si]').forEach((r) => {
          r.style.opacity = '0';
          r.style.transform = 'translateY(6px)';
          r.style.transition = 'opacity .5s ease, transform .5s cubic-bezier(.16,1,.3,1)';
        });
      }
      if (kind === 'bar') el.style.width = '0';
    });

    let onScroll: (() => void) | undefined;
    if (!reduce) {
      const runFx = () => {
        const vh = window.innerHeight || 800;
        fx.forEach((el) => {
          if (done.has(el)) return;
          const r = el.getBoundingClientRect();
          if (r.top > vh * 0.9 || r.bottom < 0) return;
          done.add(el);
          const kind = el.getAttribute('data-fx');
          if (kind === 'count') countUp(el);
          if (kind === 'spark') {
            el.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(.16,1,.3,1) .2s';
            el.style.strokeDashoffset = '0';
          }
          if (kind === 'stagger') {
            el.querySelectorAll<HTMLElement>('[data-si]').forEach((r, i) => {
              r.style.transitionDelay = `${120 + i * 110}ms`;
              r.style.opacity = '1';
              r.style.transform = 'none';
            });
          }
          if (kind === 'bar') {
            el.style.transition = 'width 1.3s cubic-bezier(.16,1,.3,1) .15s';
            el.style.width = el.getAttribute('data-w') ?? '100%';
          }
        });
      };
      onScroll = runFx;
      runFx();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    return () => {
      io?.disconnect();
      if (onScroll) window.removeEventListener('scroll', onScroll);
    };
  }, [rootRef]);
}
