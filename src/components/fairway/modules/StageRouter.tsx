'use client';

/**
 * ============================================================================
 * Fairway · modules · StageRouter — the swappable depth panel (spec §4 stage)
 * ----------------------------------------------------------------------------
 * The stage half of the spine+stage shell (docs/design/spine-stage-mockup.html
 * `.stage` / `.stageview`): the spine never scrolls away, and clicking into a
 * BentoCell/priority row swaps the stage IN PLACE — no tabs, no page-length
 * scroll, no jump-links. The active view lives in a search param
 * (`?area=putting`, `?view=signals`, …) so every drill stays shareable.
 *
 * `StageRouter` owns the param ↔ view mapping and exposes a `useStage()`
 * context hook so any descendant (a BentoCell's `onOpen`, a DrillPanel's
 * `onBack`) can navigate the stage without prop-drilling callbacks down
 * through every intermediate component.
 *
 * Unknown or absent param → `homeKey`'s view (never a blank stage). Only the
 * ACTIVE view is mounted — the module kit is presentational/props-only, and
 * every view's ReactNode is built by the caller up front, so there's no lazy
 * data fetch to avoid; keeping inactive views unmounted just keeps the DOM
 * light. Swapping views re-keys the wrapper, replaying a ≤220ms fade+rise
 * entrance (Tailwind `fade-up` keyframe), collapsed to an instant cut under
 * `prefers-reduced-motion` via the `motion-reduce:` variant (no JS
 * matchMedia needed).
 *
 * ADDITIVE ONLY. No Supabase imports — pure props + `next/navigation`.
 * ========================================================================== */

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { StageRouterProps } from './types';

const STAGE_NAVIGATION_EVENT = 'helm:stage-navigation';

interface StageNavigationDetail {
  param: string;
  key: string;
}

/**
 * Swap a query-backed stage without asking the App Router to rerender the
 * force-dynamic server page. Every StageRouter view is already present in
 * client props, so a native history update is the correct shallow operation.
 */
export function replaceStageUrl(param: string, key: string, homeKey: string): boolean {
  if (typeof window === 'undefined') return false;
  const next = new URL(window.location.href);
  if (key === homeKey) next.searchParams.delete(param);
  else next.searchParams.set(param, key);
  const nextUrl = `${next.pathname}${next.search}${next.hash}`;

  // Do not write history for a URL that is already the current one.
  //
  // Safari throttles `replaceState` to 100 calls per 10 seconds and throws
  // `SecurityError` past that — observed once in production on 2026-08-27
  // (iOS 18.7 WKWebView, /golf/dashboard, a deep recursive render loop in the
  // stack ending at `replaceState`). This guard is NOT a claim to have found
  // that loop; it is the observation that a write which changes nothing can
  // only cost, and removing it means a re-render storm that lands on the same
  // stage stops consuming the browser's budget.
  //
  // The custom event still dispatches either way: listeners care that a stage
  // was selected, not that the address bar changed, and skipping it here would
  // make re-selecting the current stage silently do nothing.
  //
  // `null` state, not `window.history.state`: the existing state carries
  // Next's `__NA` marker, and Next's patched replaceState skips syncing its
  // router URL for any entry that has it. That left the router's canonical
  // URL on the previous stage, so a later `router.refresh()` re-fetched the
  // old query and wrote it back over the address bar. With `null`, Next
  // copies its own tree state onto the entry and syncs `useSearchParams`
  // from it without a server round trip.
  if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, '', nextUrl);
  }
  window.dispatchEvent(
    new CustomEvent<StageNavigationDetail>(STAGE_NAVIGATION_EVENT, {
      detail: { param, key },
    }),
  );
  return true;
}

/* ─────────────────────────────────────────────────────────────────────────
 * useStage() — navigate the nearest StageRouter without prop-drilling
 * ──────────────────────────────────────────────────────────────────────── */

export interface StageContextValue {
  /** Swap the stage to the view with this key (writes the search param). */
  open: (key: string) => void;
  /** Return the stage to its home view (clears the search param). */
  home: () => void;
}

const StageContext = React.createContext<StageContextValue | null>(null);

/** Read the nearest `StageRouter`'s `open`/`home` navigators. Throws outside
 *  a `StageRouter` — every consumer (BentoCell, DrillPanel back chip, …)
 *  is meant to render only inside the stage it navigates. */
export function useStage(): StageContextValue {
  const ctx = React.useContext(StageContext);
  if (!ctx) {
    throw new Error('useStage() must be used within a <StageRouter>.');
  }
  return ctx;
}

/* ─────────────────────────────────────────────────────────────────────────
 * StageRouter
 * ──────────────────────────────────────────────────────────────────────── */

export function StageRouter({ param, homeKey, views }: StageRouterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedKey = searchParams.get(param);
  const knownKeys = React.useMemo(() => new Set(views.map((v) => v.key)), [views]);
  // Unknown/absent param → homeKey. Never render a blank stage.
  const requestedActiveKey = requestedKey && knownKeys.has(requestedKey) ? requestedKey : homeKey;
  const [activeKey, setActiveKey] = React.useState(requestedActiveKey);

  React.useEffect(() => {
    // Next applies a replaceState sync inside a transition, so after two
    // quick taps the hook snapshot can briefly still name the FIRST stage
    // while the address bar (and local state) already show the second.
    // Adopting that trailing snapshot would flash the old stage back for a
    // frame. Only follow the hook when it agrees with the live URL.
    if (typeof window !== 'undefined') {
      const liveKey = new URLSearchParams(window.location.search).get(param);
      const liveActiveKey = liveKey && knownKeys.has(liveKey) ? liveKey : homeKey;
      if (liveActiveKey !== requestedActiveKey) return;
    }
    setActiveKey(requestedActiveKey);
    // Keyed on the resolved snapshot only; param/homeKey/knownKeys are stable
    // for a mounted stage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedActiveKey]);
  React.useEffect(() => {
    const onStageNavigation = (event: Event) => {
      const detail = (event as CustomEvent<StageNavigationDetail>).detail;
      if (detail?.param !== param) return;
      setActiveKey(knownKeys.has(detail.key) ? detail.key : homeKey);
    };
    window.addEventListener(STAGE_NAVIGATION_EVENT, onStageNavigation);
    return () => window.removeEventListener(STAGE_NAVIGATION_EVENT, onStageNavigation);
  }, [homeKey, knownKeys, param]);

  // Focus management: when the stage swaps to a new view (via open()/home()),
  // move focus onto the new view's container so keyboard/AT users land in
  // the fresh content instead of staying stranded on whatever trigger they
  // clicked. This focus move IS the announcement — the stage is deliberately
  // not an `aria-live` region too, or every swap was read out twice (once
  // as a live-region update of the whole new view, once on focus). Skipped on first mount — that's initial page load, not a
  // stage swap.
  //
  // `preventScroll: true` is load-bearing. Focusing a container that starts
  // below the fold makes the browser scroll it into view, and `activeKey`
  // also settles when the search params resolve AFTER hydration — so a plain
  // page load fired this effect and dumped players partway down the page
  // (CoachHelm landed 34% down; Game Profile 161px in). Focus should move;
  // the page should not.
  const stageViewRef = React.useRef<HTMLDivElement | null>(null);
  const hasMounted = React.useRef(false);
  React.useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    stageViewRef.current?.focus({ preventScroll: true });
  }, [activeKey]);

  const open = React.useCallback(
    (key: string) => {
      const nextKey = knownKeys.has(key) ? key : homeKey;
      setActiveKey(nextKey);
      if (!replaceStageUrl(param, nextKey, homeKey)) {
        const next = new URLSearchParams(searchParams.toString());
        if (nextKey === homeKey) next.delete(param);
        else next.set(param, nextKey);
        const qs = next.toString();
        router.replace(qs ? `?${qs}` : '?', { scroll: false });
      }
    },
    [router, searchParams, param, homeKey, knownKeys],
  );

  const home = React.useCallback(() => open(homeKey), [open, homeKey]);

  const contextValue = React.useMemo<StageContextValue>(() => ({ open, home }), [open, home]);

  const activeView = views.find((v) => v.key === activeKey) ?? views.find((v) => v.key === homeKey);

  return (
    <StageContext.Provider value={contextValue}>
      <div data-slot="stage" className="relative min-h-[320px]">
        {activeView ? (
          <div
            key={activeView.key}
            ref={stageViewRef}
            tabIndex={-1}
            data-slot="stageview"
            data-stage-key={activeView.key}
            className={cn(
              'outline-none',
              'motion-safe:animate-[fade-up_220ms_ease-out]',
              'motion-reduce:animate-none',
            )}
          >
            {activeView.node}
          </div>
        ) : null}
      </div>
    </StageContext.Provider>
  );
}
