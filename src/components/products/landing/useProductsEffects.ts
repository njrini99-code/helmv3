'use client';

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { markAllAnimReady, unmarkAllAnimReady } from '@/lib/motion/anim-gate';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- scroll reveal ------------------------------------------------------
    const reveals = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    // The first-paint gate (lib/motion/anim-gate.ts) is hiding every one of
    // these right now, which is what stops the server's settled markup from
    // being painted and then snatched back. Release them below, the moment this
    // hook has written its own hidden state — never before, or they flash.
    let io: IntersectionObserver | undefined;
    if (!reduce && typeof IntersectionObserver === 'function') {
      // TWO PASSES, AND THE ORDER IS THE WHOLE POINT.
      //
      // Writing `opacity: 0` and the `transition` in the SAME pass does not
      // hide anything — Chrome resolves a transition against the AFTER-change
      // style, so it sees a transition-property it is willing to animate and
      // fades the element from 1 to 0 over .68s. The reveal blocks were
      // therefore visible for most of a second and then dissolved, which is
      // most of the "loads weird" report and is why the first-paint gate alone
      // did not fix this page: the gate hid them correctly, and handing over to
      // this hook re-exposed an element that was still mid-fade-out.
      //
      // So: hide with transitions explicitly OFF, force ONE style flush for the
      // whole batch so that hidden state becomes the before-change style, and
      // only then attach the transitions. They can now only ever run on the way
      // IN, which is the only direction that was ever wanted.
      reveals.forEach((el) => {
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.transform = `translateY(${compact ? 14 : 20}px)`;
      });
      void root.offsetHeight; // flush: commit the hidden state before transitions exist
      reveals.forEach((el) => {
        el.style.transition =
          `opacity ${compact ? '.52s' : '.68s'} cubic-bezier(.16,1,.3,1), transform ${compact ? '.52s' : '.68s'} cubic-bezier(.16,1,.3,1)`;
        const authoredDelay = Number(el.getAttribute('data-reveal-delay') ?? 0);
        const delay = compact ? Math.min(Math.round(authoredDelay * 0.3), 80) : authoredDelay;
        if (delay) el.style.transitionDelay = `${delay}ms`;
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
        compact
          ? { threshold: 0.04, rootMargin: '0px 0px 10% 0px' }
          : { threshold: 0.1, rootMargin: '0px 0px -2% 0px' },
      );
      reveals.forEach((el) => io?.observe(el));
    }
    // Every reveal now carries its own inline `opacity: 0` (or, under reduced
    // motion, was never hidden at all), so the CSS gate has nothing left to do
    // for them. Handing over here — after the prep loop, in the same synchronous
    // pass — means there is no frame in which a reveal is neither gated nor
    // owned.
    markAllAnimReady(reveals);

    // --- effects (count / spark / stagger / bar) ---------------------------
    const fx = Array.from(root.querySelectorAll<HTMLElement>('[data-fx]'));
    const done = new WeakSet<HTMLElement>();

    // Count-up frames must stop on unmount — an unguarded rAF chain keeps
    // running (writing to detached nodes) after navigation away mid-animation.
    let disposed = false;
    const rafIds = new Set<number>();

    const countUp = (el: HTMLElement) => {
      const to = parseInt(el.getAttribute('data-to') ?? '0', 10) || 0;
      const dur = 1400;
      const start = performance.now();
      const ease = (t: number) => 1 - Math.pow(1 - t, 3);
      const step = (now: number) => {
        if (disposed) return;
        const p = Math.min(1, (now - start) / dur);
        el.textContent = String(Math.round(ease(p) * to));
        if (p < 1) rafIds.add(requestAnimationFrame(step));
      };
      rafIds.add(requestAnimationFrame(step));
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
        // Same two-pass hide as the reveals above — one pass would fade these
        // rows out from full opacity instead of hiding them. See that comment.
        const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-si]'));
        rows.forEach((r) => {
          r.style.transition = 'none';
          r.style.opacity = '0';
          r.style.transform = 'translateY(6px)';
        });
        void el.offsetHeight;
        rows.forEach((r) => {
          r.style.transition = 'opacity .5s ease, transform .5s cubic-bezier(.16,1,.3,1)';
        });
      }
      if (kind === 'bar') el.style.width = '0';
      // Markup ships the REAL final number (progressive enhancement — no-JS
      // readers must see it); JS zeroes it here so the in-view count-up still
      // starts from 0.
      if (kind === 'count') el.textContent = '0';
    });

    let onScroll: (() => void) | undefined;
    if (!reduce) {
      const runFx = () => {
        const vh = window.innerHeight || 800;
        fx.forEach((el) => {
          if (done.has(el)) return;
          const r = el.getBoundingClientRect();
          if (r.top > vh * (compact ? 0.98 : 0.92) || r.bottom < 0) return;
          done.add(el);
          const kind = el.getAttribute('data-fx');
          if (kind === 'count') countUp(el);
          if (kind === 'spark') {
            el.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(.16,1,.3,1) .2s';
            el.style.strokeDashoffset = '0';
          }
          if (kind === 'stagger') {
            el.querySelectorAll<HTMLElement>('[data-si]').forEach((r, i) => {
              r.style.transitionDelay = `${compact ? 40 + i * 55 : 100 + i * 90}ms`;
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
      disposed = true;
      rafIds.forEach((id) => cancelAnimationFrame(id));
      io?.disconnect();
      if (onScroll) window.removeEventListener('scroll', onScroll);
      // Re-gate. This effect also re-runs on a `compact` change (a resize
      // across 767px), and without this the reveals would be left released but
      // un-prepped for one paint. See unmarkAnimReady.
      unmarkAllAnimReady(reveals);
    };
  }, [rootRef, compact]);
}
