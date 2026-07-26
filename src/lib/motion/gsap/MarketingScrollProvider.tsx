'use client';

/**
 * ============================================================================
 * MarketingScrollProvider — ONE scroll loop for / and /products
 * ----------------------------------------------------------------------------
 * Lenis drives smooth scrolling; GSAP's ticker drives Lenis; ScrollTrigger is
 * told to read scroll position FROM Lenis. That is the whole integration, and
 * getting it wrong in either direction is the classic failure mode:
 *
 *   • Lenis on its own `requestAnimationFrame` loop + GSAP on its ticker =
 *     TWO loops racing each other. Scrubbed timelines judder because they
 *     sample a scroll position that was written by a different frame.
 *   • ScrollTrigger reading `window.scrollY` while Lenis owns the scroll =
 *     triggers fire against the raw wheel position rather than the smoothed
 *     one, so pins detach from the content they pin.
 *
 * So: `gsap.ticker.add` runs Lenis (ticker time is seconds, Lenis wants ms),
 * `lenis.on('scroll', ScrollTrigger.update)` feeds it forward, and
 * `lagSmoothing(0)` stops GSAP from swallowing frames after a long task —
 * without it, returning to a background tab jumps the scrub.
 *
 * WHY THIS IS NOT `useSmoothScroll`. The existing shared hook
 * (src/hooks/useSmoothScroll.ts) is mounted by the GOLF DASHBOARD via
 * SmoothScrollMount, and by /privacy and /terms. Rewiring it to GSAP's ticker
 * would hand every dashboard route a GSAP-driven RAF for no reason, and would
 * couple app scrolling to a marketing-only dependency. This provider is
 * additive and marketing-only; the shared hook is untouched.
 *
 * REDUCED MOTION: Lenis is not instantiated at all — native scrolling, which is
 * both the accessible behaviour and what the brief requires ("Disable Lenis").
 * ScrollTrigger still works; individual scenes render their end state.
 *
 * TOUCH: `syncTouch` stays OFF. Hijacking touch scrolling on a phone to run it
 * through a JS interpolator is the single most common way a "premium" scroll
 * experience becomes unusable — native momentum is already smooth on iOS.
 * Lenis here smooths the WHEEL only; ScrollTrigger still drives every scene on
 * touch, reading native scroll.
 * ========================================================================== */

import { useEffect, useLayoutEffect } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from './register';

export interface MarketingScrollProviderProps {
  /** Smooth-scroll same-page hash links through Lenis (Products has anchors). */
  anchors?: boolean;
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function MarketingScrollProvider({ anchors = false }: MarketingScrollProviderProps) {
  // Next's automatic scroll hand-off can preserve the previous document
  // position when both routes share sticky marketing chrome. That made a click
  // from low on `/` render `/products` at the same ~7,000px offset, which read
  // as a dead link and also initialized every product scene against the wrong
  // part of the page. Reset before paint; real hash routes still own their
  // target and are deliberately left alone.
  useIsoLayoutEffect(() => {
    if (typeof window === 'undefined' || window.location.hash) return;

    // Browsers may apply their saved position *after* React's layout effects
    // during a reload. Manual restoration plus two paint-boundary resets keeps
    // a direct `/products` load at its masthead instead of snapping back to the
    // previous page-bottom position a frame later.
    window.history.scrollRestoration = 'manual';
    const reset = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    reset();
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      reset();
      secondFrame = requestAnimationFrame(reset);
    });
    window.addEventListener('pageshow', reset);

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.removeEventListener('pageshow', reset);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scrollDriver: { current?: Lenis } = {};

    // Reset as soon as an ordinary cross-page marketing link is activated,
    // before Next swaps the route. This prevents the outgoing Lenis target from
    // repainting the old scroll position during the transition. Hash links stay
    // on the anchor path below, and modified/new-tab clicks keep native browser
    // behaviour.
    const onRouteClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

      const destination = new URL(link.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        destination.origin !== current.origin ||
        destination.hash ||
        (destination.pathname === current.pathname && destination.search === current.search)
      ) {
        return;
      }

      scrollDriver.current?.stop();
      scrollDriver.current?.scrollTo(0, { immediate: true, force: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    };
    document.addEventListener('click', onRouteClick, true);

    // Reduced motion: no Lenis at all. Scenes still mount (they render their
    // settled end state), scrolling is native, nothing is interpolated.
    if (prefersReducedMotion) {
      ScrollTrigger.refresh();
      return () => document.removeEventListener('click', onRouteClick, true);
    }

    const lenis = new Lenis({
      // Matches the shared hook's feel so /privacy, /about and the marketing
      // pages scroll identically — an expo-out in the same family as the house
      // curve, rather than a second, competing scroll personality.
      duration: 0.72,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      // See the module doc: never interpolate touch.
      syncTouch: false,
      touchMultiplier: 1,
      prevent: (node: HTMLElement) => {
        if (node.closest('[data-lenis-prevent]')) return true;
        // Modals and popovers own their own scroll container.
        return !!node.closest('[role="dialog"], [data-radix-popper-content-wrapper]');
      },
    });
    scrollDriver.current = lenis;

    // 1. Lenis publishes scroll → ScrollTrigger recomputes. Without this,
    //    ScrollTrigger samples window.scrollY on its own schedule and drifts
    //    from the interpolated position Lenis is actually painting.
    lenis.on('scroll', ScrollTrigger.update);

    // 2. GSAP's ticker drives Lenis — ONE loop, not two. Ticker time arrives in
    //    seconds; Lenis.raf expects milliseconds.
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);

    // 3. GSAP's lag smoothing drops "catch-up" frames after a long task, which
    //    on a scrubbed timeline reads as the animation teleporting. Off.
    gsap.ticker.lagSmoothing(0);

    // Anchor links routed through Lenis so in-page jumps inherit the same
    // interpolation instead of fighting it with native smooth scroll.
    let onAnchorClick: ((e: MouseEvent) => void) | undefined;
    if (anchors) {
      onAnchorClick = (e: MouseEvent) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const link = (e.target as HTMLElement | null)?.closest('a[href^="#"]') as HTMLAnchorElement | null;
        if (!link) return;
        const raw = link.getAttribute('href');
        if (!raw || raw === '#') return;
        const el = document.getElementById(decodeURIComponent(raw.slice(1)));
        if (!el) return;
        e.preventDefault();
        lenis.scrollTo(el, { offset: -80 });
      };
      document.addEventListener('click', onAnchorClick);
    }

    // Scenes are registered by child components; once they have all mounted the
    // pin spacing needs one recompute. A rAF is enough — layout is settled by
    // the next frame and this avoids a resize-observer feedback loop.
    const refreshId = requestAnimationFrame(() => ScrollTrigger.refresh());

    return () => {
      cancelAnimationFrame(refreshId);
      document.removeEventListener('click', onRouteClick, true);
      if (onAnchorClick) document.removeEventListener('click', onAnchorClick);
      lenis.off('scroll', ScrollTrigger.update);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33); // restore GSAP's documented default
      lenis.stop();
      lenis.destroy();
      scrollDriver.current = undefined;
    };
  }, [anchors]);

  return null;
}
