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
  window.history.replaceState(
    window.history.state,
    '',
    `${next.pathname}${next.search}${next.hash}`,
  );
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

  React.useEffect(() => setActiveKey(requestedActiveKey), [requestedActiveKey]);
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
  // clicked. Skipped on first mount — that's initial page load, not a
  // stage swap, and stealing focus there would fight the page's own
  // initial-focus behavior.
  const stageViewRef = React.useRef<HTMLDivElement | null>(null);
  const hasMounted = React.useRef(false);
  React.useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    stageViewRef.current?.focus({ preventScroll: false });
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
      <div data-slot="stage" className="relative min-h-[320px]" aria-live="polite">
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
