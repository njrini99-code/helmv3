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

import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from './register';

export interface MarketingScrollProviderProps {
  /** Smooth-scroll same-page hash links through Lenis (Products has anchors). */
  anchors?: boolean;
}

/** The element a `#hash` points at, or null. Shared by the click handler and
 *  the on-load deep-link jump so both resolve targets identically. */
function hashTarget(hash: string): HTMLElement | null {
  if (!hash || hash === '#') return null;
  return document.getElementById(decodeURIComponent(hash.replace(/^#/, '')));
}

/** Matches the click handler's Lenis offset so a deep link and an in-page
 *  click settle a section at the same place under the fixed header. */
const ANCHOR_OFFSET = -80;

export function MarketingScrollProvider({ anchors = false }: MarketingScrollProviderProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Reduced motion: no Lenis at all. Scenes still mount (they render their
    // settled end state), scrolling is native, nothing is interpolated.
    if (prefersReducedMotion) {
      // Same deep-link correction as the Lenis path below, natively: the
      // browser's own hash jump fires before these scenes mount, and
      // `refresh()` inserts pin spacers that move the target afterwards.
      const nativeRefreshId = requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        hashTarget(window.location.hash)?.scrollIntoView();
      });
      const onNativeHashChange = () => hashTarget(window.location.hash)?.scrollIntoView();
      window.addEventListener('hashchange', onNativeHashChange);
      return () => {
        cancelAnimationFrame(nativeRefreshId);
        window.removeEventListener('hashchange', onNativeHashChange);
      };
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
    let onHashChange: (() => void) | undefined;
    if (anchors) {
      onAnchorClick = (e: MouseEvent) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const link = (e.target as HTMLElement | null)?.closest('a[href^="#"]') as HTMLAnchorElement | null;
        if (!link) return;
        const raw = link.getAttribute('href');
        if (!raw || raw === '#') return;
        const el = hashTarget(raw);
        if (!el) return;
        e.preventDefault();
        lenis.scrollTo(el, { offset: ANCHOR_OFFSET });
      };
      document.addEventListener('click', onAnchorClick);

      // Back/forward between anchors, and any hash set by something other
      // than an in-page click, still route through Lenis — otherwise the
      // browser's native jump fights the interpolated position.
      onHashChange = () => {
        const el = hashTarget(window.location.hash);
        if (el) lenis.scrollTo(el, { offset: ANCHOR_OFFSET });
      };
      window.addEventListener('hashchange', onHashChange);
    }

    // Scenes are registered by child components; once they have all mounted the
    // pin spacing needs one recompute. A rAF is enough — layout is settled by
    // the next frame and this avoids a resize-observer feedback loop.
    const refreshId = requestAnimationFrame(() => {
      ScrollTrigger.refresh();

      // Deep links (`/products#stats`, `/#golfhelm`) landed at the top of the
      // page: the browser's native hash jump runs before these scenes hydrate,
      // and the `refresh()` above then inserts pin spacers that move the target
      // again. Lenis, constructed above, has meanwhile taken ownership of the
      // scroll position and never learns about the hash. Re-issue the jump here
      // — after refresh, so the target's final offset is the one we scroll to.
      // `immediate` keeps a deep link feeling like a page load rather than a
      // multi-second auto-scroll from the hero.
      const el = hashTarget(window.location.hash);
      if (el) lenis.scrollTo(el, { offset: ANCHOR_OFFSET, immediate: true });
    });

    return () => {
      cancelAnimationFrame(refreshId);
      if (onAnchorClick) document.removeEventListener('click', onAnchorClick);
      if (onHashChange) window.removeEventListener('hashchange', onHashChange);
      lenis.off('scroll', ScrollTrigger.update);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33); // restore GSAP's documented default
      lenis.destroy();
    };
  }, [anchors]);

  return null;
}
