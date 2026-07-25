'use client';

/**
 * ============================================================================
 * Fairway · app-shell · LargeTitleContext — the per-route title registry
 * ----------------------------------------------------------------------------
 * Lets a page tell the shell what to call the view it is rendering, so
 * `FairwayTopBar` can name the current destination in its mobile header.
 *
 * `registeredTitle` changes only on NAVIGATION (a page mounts/unmounts
 * `FairwayLargeTitle`) — the same cadence at which `pathname` already
 * re-renders the shell — so this provider never becomes a per-frame render
 * source. Pages that register nothing leave it `null` and the bar falls back
 * to the shell's own `pageTitle`/breadcrumb copy.
 *
 * HISTORY (2026-07-25): this file used to own an `IntersectionObserver` and a
 * `condensed` boolean implementing the iOS "large title scrolls up into the
 * nav bar" hand-off — the page's location name lived in CONTENT and only
 * cross-faded into the bar once you scrolled past it. That inverted Apple's
 * actual idiom, which keeps the compact bar title permanently resident and
 * animates only the LARGE in-content title (HIG, Navigation Bars: the large
 * title "transitions to a standard title as people begin scrolling …
 * reminding them of their current location"). Here the two were not even the
 * same string — the dashboard's in-content `h1` is a greeting ("Good
 * afternoon, Cole") while the bar faded in "Dashboard" — so at scroll 0
 * nothing on screen named the destination at all.
 *
 * `FairwayTopBar` now shows the title unconditionally at `<md`, so nothing
 * condenses and there is nothing left to observe. The observer, the
 * `condensed` flag, the static `FairwayHeaderSentinel`, the
 * `FairwayContentAnchor` + `registerTitleNode` + `data-fw-title-anchor`
 * node-resolution apparatus, and the `env(safe-area-inset-top)` probe its
 * `rootMargin` math needed were all deleted with it. What remains is the part
 * that still earns its keep: the registration channel itself.
 * ========================================================================== */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface LargeTitleContextValue {
  /**
   * The current page's own title, registered by `FairwayLargeTitle` on
   * mount/update and CLEARED on unmount — `null` on any route that hasn't
   * adopted the primitive, so the bar falls back to the shell's
   * `pageTitle`/breadcrumb copy instead ("zero page edits" contract) rather
   * than showing a stale title left behind by whichever route rendered last.
   */
  registeredTitle: string | null;
  /** Called by `FairwayLargeTitle` to register/clear the page's title. */
  setRegisteredTitle: (title: string | null) => void;
}

const noop = () => {};

/** Outside a `FairwayLargeTitleProvider` (isolated stories/tests, or an
 *  immersive route that never mounts `AppShell`) — degrades to "no registered
 *  title", never throws. */
const DEFAULT_VALUE: LargeTitleContextValue = {
  registeredTitle: null,
  setRegisteredTitle: noop,
};

// Exported (mirrors `FairwaySidebar`'s `SidebarCollapseContext` precedent) so
// tests/isolated stories can supply an arbitrary value directly via
// `<LargeTitleContext.Provider value={...}>`.
export const LargeTitleContext = createContext<LargeTitleContextValue>(DEFAULT_VALUE);

/** Consumed by `FairwayTopBar` (`registeredTitle`) and `FairwayLargeTitle`
 *  (`setRegisteredTitle`). */
export function useLargeTitle(): LargeTitleContextValue {
  return useContext(LargeTitleContext);
}

export interface FairwayLargeTitleProviderProps {
  children: ReactNode;
}

export function FairwayLargeTitleProvider({ children }: FairwayLargeTitleProviderProps) {
  const [registeredTitle, setRegisteredTitle] = useState<string | null>(null);

  // `setRegisteredTitle` is a stable `useState` setter, so this memo only
  // re-computes when a page actually registers a different title — i.e. on
  // navigation, never on scroll or on an unrelated shell re-render.
  const value = useMemo<LargeTitleContextValue>(
    () => ({ registeredTitle, setRegisteredTitle }),
    [registeredTitle],
  );

  return <LargeTitleContext.Provider value={value}>{children}</LargeTitleContext.Provider>;
}
