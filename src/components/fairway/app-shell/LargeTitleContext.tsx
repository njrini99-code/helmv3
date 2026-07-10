'use client';

/**
 * ============================================================================
 * Fairway · app-shell · LargeTitleContext (M1, ADDITIVE — condensing-header)
 * ----------------------------------------------------------------------------
 * Powers the single condensing chrome unit (docs/MOBILE_DOCTRINE.md rules 2/7):
 * the page's own large title lives in CONTENT at rest and cross-fades into the
 * sticky top bar's center once it scrolls under it — the iOS large-title idiom.
 *
 * Split into two independently-reactive pieces so a SCROLL toggle never
 * re-renders `AppShell`/`FairwaySidebar` (perf packet [shell-render-hygiene]):
 *
 *   • `condensed`       — flips on every scroll-cross. Lives ONLY inside
 *     `FairwayLargeTitleProvider`'s own state; a re-render here only affects
 *     the Provider + its context consumers (`FairwayTopBar`), never its
 *     parent (`AppShell`), because `AppShell` never calls this state — it
 *     only renders `<FairwayLargeTitleProvider>` as JSX.
 *   • `registeredTitle` — changes only on NAVIGATION (a page mounts/unmounts
 *     `FairwayLargeTitle`), same cadence as `pathname` already re-rendering
 *     the shell today.
 *
 * The sole `IntersectionObserver` lives here (not a scroll listener — zero
 * main-thread work per scroll frame, the core anti-jank requirement).
 *
 * DEFECT FIX (2026-07-10): the observer does NOT watch a static 1px sentinel
 * planted at the top of the content flow. That sentinel's resting position
 * (right where the sticky bar + sub-nav end) is IDENTICAL to the shrunk
 * root's boundary the `rootMargin` math below produces — the two cancel out,
 * so `condensed` used to flip after ~1-2px of scroll instead of once the
 * page's actual large title had scrolled away, leaving both titles on screen
 * at once for most of the scroll range. The observer now watches whatever
 * `FairwayContentAnchor` (in `AppShell.tsx`) registers via
 * `registerTitleNode` — the page's OWN first rendered element (its real
 * masthead/title, whatever it is), so the trigger tracks the title's true
 * measured height on every route, adopted or not, client or server-rendered.
 * The static sentinel (`FairwayHeaderSentinel`) is kept ONLY as the fallback
 * target for the brief window before a title node registers (or a route
 * with genuinely empty content).
 * ========================================================================== */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/lib/utils';

export interface LargeTitleContextValue {
  /** True once the header sentinel has scrolled under the sticky bar (+ the
   *  sub-nav strip, when one is stacked below it). Always `false` at `md:+`
   *  (the provider disconnects its observer there — desktop never condenses). */
  condensed: boolean;
  /**
   * The current page's own large title, registered by `FairwayLargeTitle` on
   * mount/update and CLEARED on unmount — `null` on any route that hasn't
   * adopted the primitive, so the bar falls back to the shell's
   * `pageTitle`/breadcrumb copy instead (condensing-header §5's "zero page
   * edits" contract) rather than showing a stale title left behind by
   * whichever route rendered last.
   */
  registeredTitle: string | null;
  /** Called by `FairwayLargeTitle` to register/clear the in-content title. */
  setRegisteredTitle: (title: string | null) => void;
  /** Attach point for `FairwayHeaderSentinel` — a single ref instance shared
   *  between the observer (below) and whichever component renders the div.
   *  Only ever OBSERVED as a fallback — see `registerTitleNode`. */
  sentinelRef: RefObject<HTMLDivElement | null>;
  /**
   * Called by `FairwayContentAnchor` with the page's real first-rendered
   * element (its masthead/title, whatever component renders it) on mount,
   * on every DOM child swap it detects, and with `null` on unmount. THIS is
   * what the observer actually watches once set — the static `sentinelRef`
   * div is only observed while this is `null`. Registering the real node
   * (measured layout) instead of a synthetic marker is the fix for the
   * "condense fires after ~1px" defect: the trigger now tracks the title's
   * true height on every route, including server-rendered mastheads that
   * can never call `useLargeTitle()` themselves.
   */
  registerTitleNode: (node: HTMLElement | null) => void;
}

const noop = () => {};

/** Outside a `FairwayLargeTitleProvider` (isolated stories/tests, or an
 *  immersive route that never mounts `AppShell`) — degrades to "never
 *  condenses, no title", never throws. */
const DEFAULT_VALUE: LargeTitleContextValue = {
  condensed: false,
  registeredTitle: null,
  setRegisteredTitle: noop,
  sentinelRef: { current: null },
  registerTitleNode: noop,
};

// Exported (mirrors `FairwaySidebar`'s `SidebarCollapseContext` precedent) so
// tests/isolated stories can supply an arbitrary value directly via
// `<LargeTitleContext.Provider value={...}>` without driving a real
// `IntersectionObserver`.
export const LargeTitleContext = createContext<LargeTitleContextValue>(DEFAULT_VALUE);

/** Consumed by `FairwayTopBar` (`condensed` + `registeredTitle`) and
 *  `FairwayLargeTitle` (`setRegisteredTitle`). */
export function useLargeTitle(): LargeTitleContextValue {
  return useContext(LargeTitleContext);
}

/** condensing-header §3 rhythm: "sub-nav 44px min-tap rows" — the additional
 *  offset the observer's shrunk root needs when a hub sub-nav strip is
 *  stacked directly under the bar (both sticky, so together they occlude
 *  64px + safe-area-inset-top + this). */
const SUB_NAV_OFFSET_PX = 44;

/** The bar's own fixed height (§4: "the bar height never changes — fixed
 *  64px"). Safe-area-inset-top is the only per-device variable, and
 *  IntersectionObserver's `rootMargin` accepts only resolved px/% lengths
 *  (no `calc()`/`env()`), so it's resolved once via `measureSafeAreaTop`
 *  below rather than hand-computed. */
const BAR_HEIGHT_PX = 64;

/**
 * Resolves `env(safe-area-inset-top)` to a real pixel number. `rootMargin`
 * can't take a `calc()`/`env()` expression directly, so this applies the
 * inset to a real, resolvable CSS property (`height`) on a throwaway offscreen
 * probe element and reads back `getComputedStyle`'s resolved px value — the
 * standard technique for reading env() from JS. Returns 0 on non-notched
 * devices/desktop and in any environment without a real layout engine (SSR,
 * jsdom under test).
 */
function measureSafeAreaInsetTop(): number {
  if (typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.top = '0';
  probe.style.left = '0';
  probe.style.width = '0';
  probe.style.height = 'env(safe-area-inset-top, 0px)';
  probe.style.pointerEvents = 'none';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const resolved = parseFloat(getComputedStyle(probe).height);
  document.body.removeChild(probe);
  return Number.isFinite(resolved) ? resolved : 0;
}

export interface FairwayLargeTitleProviderProps {
  children: ReactNode;
  /** Gates the `IntersectionObserver` — pass `!isDesktop` (mirrors AppShell's
   *  own `useMediaQuery('(min-width: 768px)')` gate). `md:+` never condenses:
   *  the desktop masthead/breadcrumb trail never scrolls under the bar. */
  enabled: boolean;
  /** Whether a hub sub-nav strip is stacked directly under the bar in THIS
   *  render — adds `SUB_NAV_OFFSET_PX` to the observer's shrunk root so
   *  condense fires once both have scrolled past, not just the bar alone. */
  hasSubNav?: boolean;
}

export function FairwayLargeTitleProvider({ children, enabled, hasSubNav = false }: FairwayLargeTitleProviderProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [condensed, setCondensed] = useState(false);
  const [registeredTitle, setRegisteredTitle] = useState<string | null>(null);
  // The real DOM node `FairwayContentAnchor` found as the page's first
  // rendered element — a genuinely new node identity on every navigation (or
  // `null` between unmount/mount), so this reliably re-triggers the effect
  // below even when two consecutive routes share the exact same title text.
  const [titleNode, setTitleNode] = useState<HTMLElement | null>(null);

  const registerTitleNode = useCallback((node: HTMLElement | null) => {
    setTitleNode(node);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setCondensed(false);
      return;
    }
    // Prefer the real, measured title node; fall back to the static sentinel
    // only while nothing has registered one yet (see the module doc's
    // DEFECT FIX note above).
    const target = titleNode ?? sentinelRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const offsetPx = BAR_HEIGHT_PX + measureSafeAreaInsetTop() + (hasSubNav ? SUB_NAV_OFFSET_PX : 0);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setCondensed(!entry.isIntersecting);
      },
      { root: null, threshold: 0, rootMargin: `-${offsetPx}px 0px 0px 0px` },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, hasSubNav, titleNode]);

  const value = useMemo<LargeTitleContextValue>(
    () => ({ condensed, registeredTitle, setRegisteredTitle, sentinelRef, registerTitleNode }),
    [condensed, registeredTitle, registerTitleNode],
  );

  return <LargeTitleContext.Provider value={value}>{children}</LargeTitleContext.Provider>;
}

export interface FairwayHeaderSentinelProps {
  className?: string;
}

/**
 * A zero-height probe placed by `AppShell` at the very top of the content
 * flow — above `{children}`, below the sticky chrome unit. `aria-hidden`
 * (it carries no content, purely a scroll-position marker).
 */
export function FairwayHeaderSentinel({ className }: FairwayHeaderSentinelProps) {
  const { sentinelRef } = useLargeTitle();
  return (
    <div
      ref={sentinelRef}
      aria-hidden
      data-slot="fw-large-title-sentinel"
      className={cn('h-px w-full', className)}
    />
  );
}

export interface FairwayContentAnchorProps {
  children: ReactNode;
}

/**
 * DEFECT FIX (2026-07-10): wraps `{children}` immediately inside `AppShell`'s
 * content column — placed INSIDE `RouteTransition` (not around it), so its
 * own wrapper div's `firstElementChild` is always the page's real first
 * rendered element (its masthead/title, whatever component renders it),
 * regardless of whether `disableRouteTransition` is set. Registers that node
 * with the provider via `registerTitleNode` so the condense observer tracks
 * the title's TRUE measured height instead of a hand-picked constant — this
 * works uniformly for `FairwayLargeTitle`, `LargeTitleHeader`, baseball's
 * server-rendered `SectionMasthead` (which can never call `useLargeTitle()`
 * itself), or a route that hasn't adopted any large-title primitive at all.
 *
 * `className="contents"` (an existing repo idiom — see `Combobox.tsx`,
 * `EvidencePanel.tsx`) keeps this wrapper OUT of the box model entirely: it
 * exists only so `firstElementChild` has something to query, never as a
 * layout node, so it cannot introduce a stray margin/padding/BFC quirk.
 *
 * A `MutationObserver` (not a mount-only effect) re-syncs the registered
 * node whenever the wrapper's direct children are replaced. `RouteTransition`
 * remounts a fresh keyed node per navigation (which alone would re-run a
 * mount-only effect too), but `disableRouteTransition` routes swap children
 * on a PERSISTENT wrapper instance with no remount — the observer is what
 * makes both cases, plus async (Suspense) content arriving after the initial
 * mount, work correctly without relying on remount timing.
 */
/** A first child taller than this fraction of the viewport is a page BODY
 *  wrapper, not a masthead — observing it would defer condense until the
 *  user reaches the bottom of the whole page (the 2026-07-10 re-verify
 *  defect). 320px floor keeps short viewports from rejecting a legitimate
 *  tall editorial masthead. */
const TITLE_NODE_MAX_VIEWPORT_FRACTION = 0.4;

function isTitleSizedNode(node: HTMLElement): boolean {
  if (typeof window === 'undefined') return true;
  const height = node.getBoundingClientRect().height;
  // jsdom / pre-layout nodes report 0 — treat as title-sized rather than
  // rejecting a node we cannot actually measure.
  if (!height) return true;
  return height <= Math.max(window.innerHeight * TITLE_NODE_MAX_VIEWPORT_FRACTION, 320);
}

export function FairwayContentAnchor({ children }: FairwayContentAnchorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { registerTitleNode } = useLargeTitle();

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Three-tier resolution (re-verify fix, 2026-07-10): every real page in
    // this repo returns ONE wrapper div containing masthead AND body as
    // nested (not sibling) content, so `firstElementChild` alone observes the
    // whole page and condense never fires. Prefer the explicit marker the
    // masthead primitives stamp (`data-fw-title-anchor`); fall back to the
    // first child only when it is plausibly a masthead (thin); otherwise
    // register nothing so the provider falls back to the static sentinel —
    // early condense beats never-condense for unmarked full-page wrappers.
    const sync = () => {
      const marked = wrapper.querySelector<HTMLElement>('[data-fw-title-anchor]');
      if (marked) {
        registerTitleNode(marked);
        return;
      }
      const first = wrapper.firstElementChild as HTMLElement | null;
      registerTitleNode(first && isTitleSizedNode(first) ? first : null);
    };
    sync();

    if (typeof MutationObserver === 'undefined') return;
    // `subtree: true` so a masthead that streams in late (Suspense) or swaps
    // deep inside a reused route root still re-syncs; repeated syncs with an
    // unchanged node are free (`setTitleNode` bails out on identity).
    const observer = new MutationObserver(sync);
    observer.observe(wrapper, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      registerTitleNode(null);
    };
  }, [registerTitleNode]);

  return (
    <div ref={wrapperRef} className="contents">
      {children}
    </div>
  );
}
