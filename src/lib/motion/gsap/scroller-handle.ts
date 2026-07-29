'use client';

/**
 * ============================================================================
 * scroller-handle — a one-slot registry for the page's active scroll owner
 * ----------------------------------------------------------------------------
 * `MarketingScrollProvider` creates Lenis and, while it lives, Lenis OWNS the
 * scroll position. Any chrome that needs to MOVE the page must go through that
 * owner rather than racing it with a bare `window.scrollTo` — the provider's own
 * module doc spells out why two things writing the same scroll position is the
 * classic failure mode here.
 *
 * This lives in its own module, and types the scroller STRUCTURALLY instead of
 * importing Lenis, for one concrete reason: `LandingHeader` is shared by every
 * marketing page, but only `/` and `/products` mount the provider. Importing
 * the provider from the header just to reach the instance would pull Lenis and
 * GSAP into the bundles of `/about` and `/pricing`, which deliberately still run
 * the lighter legacy `motion.tsx` system and have no use for either.
 *
 * `undefined` is a normal, expected value — reduced motion never instantiates
 * Lenis at all — so every caller must have a native fallback.
 * ========================================================================== */

export interface MarketingScroller {
  scrollTo: (
    target: number | string | HTMLElement,
    options?: Record<string, unknown>,
  ) => void;
  /**
   * Pause / resume scroll handling.
   *
   * Optional because this interface is deliberately STRUCTURAL — it describes
   * the slice of Lenis the marketing chrome uses, not Lenis itself. The real
   * instance registered by `MarketingScrollProvider` always has both (the
   * provider calls `lenis.stop()` in its own teardown), so `?.` here is type
   * hygiene rather than a runtime doubt.
   *
   * Anything locking scroll MUST call `stop()` and not merely set
   * `overflow: hidden`. Lenis drives the page with programmatic `scrollTo`,
   * which `overflow: hidden` does not block — measured on production
   * 2026-07-29: with the document element locked, a wheel gesture still moved
   * the page from scrollY 2200 to 2499.
   */
  stop?: () => void;
  start?: () => void;
}

let active: MarketingScroller | undefined;

/** Called by MarketingScrollProvider on create (instance) and teardown (undefined). */
export function setMarketingScroller(scroller: MarketingScroller | undefined): void {
  active = scroller;
}

/** The live smooth-scroll driver, or undefined when the page scrolls natively. */
export function getMarketingScroller(): MarketingScroller | undefined {
  return active;
}
