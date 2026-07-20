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
  const activeKey = requestedKey && knownKeys.has(requestedKey) ? requestedKey : homeKey;

  const open = React.useCallback(
    (key: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (key === homeKey) {
        next.delete(param);
      } else {
        next.set(param, key);
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams, param, homeKey],
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
            data-slot="stageview"
            data-stage-key={activeView.key}
            className={cn(
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
