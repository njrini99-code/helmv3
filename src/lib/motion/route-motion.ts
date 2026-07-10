'use client';

/**
 * ============================================================================
 * useRouteRevealMotion — Doctrine Rule 9 (docs/MOBILE_DOCTRINE.md)
 * ----------------------------------------------------------------------------
 * "Tab switches are instant — no cross-fade between bottom-tab roots; motion
 * is reserved for forward/detail pushes." Every dashboard `template.tsx`
 * (golf, baseball coach, baseball player, Bridge) previously ran ONE 280ms
 * opacity cross-fade on every navigation, so a lateral tab swap (Home → Team)
 * dissolved the whole viewport exactly like a forward push into a detail leaf
 * — the "not native, laggy SPA" tell. This hook is the single shared
 * classifier + timing table every template calls into.
 *
 * THE CORE GOTCHA this hook is built around: a `template.tsx` remounts a
 * fresh component instance on EVERY navigation (that is its defining
 * semantic vs `layout.tsx`). No `useRef`/`useState` inside a template can
 * ever remember the previous route — it is wiped on every nav. So
 * classification MUST depend only on the CURRENT pathname:
 *
 *   "forward/detail push" ⇔ "the current route is NOT a registered
 *   navigation destination" (bottom-tab root, rail item, hub sub-tab, hub
 *   landing). Every real destination is a declared href in a product's nav
 *   registry; every dynamic detail leaf (/roster/[id], /rounds/[id]/review,
 *   /players/[id]) is absent from it, so it classifies as a push with no
 *   history/direction tracking ever required. Back-navigation from a detail
 *   to its root is therefore automatically instant (the root IS registered)
 *   and forward into a detail reveals — the native mental model, for free.
 *
 * This hook renders no motion component itself — it returns PROPS ONLY, so
 * it stays engine-agnostic: golf's template consumes the shell's own
 * LazyMotion, while baseball/Bridge templates self-mount `LazyMotion`. Every
 * caller passes a STABLE, module-level classifier function (e.g.
 * `isGolfLateralDestination`) — never an inline closure — so no template
 * introduces referential churn into anything it renders.
 * ========================================================================== */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useReducedMotion, type Transition } from 'framer-motion';

// --fw-ease-glide = cubic-bezier(0.16, 1, 0.3, 1) — the iOS out-quint used
// system-wide for DropdownMenu / Tooltip / Popover / Sheet / Tabs / the
// canonical Fairway RouteTransition. --fw-dur-fast = 0.18s: faster than the
// old 280ms glide so even a genuine push reads as a crisp native reveal, not
// a dissolve.
const GLIDE: Transition['ease'] = [0.16, 1, 0.3, 1];
const FAST_DURATION = 0.18;

export interface RouteRevealMotion {
  /** Stable per-navigation React key for the content column's keyed `m.div`. */
  routeKey: string;
  /** `false` (no entrance keyframe) for every INSTANT case; an opacity-0
   *  starting point only for a genuine forward/detail push. */
  initial: false | { opacity: 0 };
  animate: { opacity: 1 };
  transition: Transition;
}

const INSTANT: Pick<RouteRevealMotion, 'initial' | 'animate' | 'transition'> = {
  initial: false,
  animate: { opacity: 1 },
  transition: { duration: 0 },
};

// Module-level singleton — this is a SINGLE flag for the lifetime of the
// browser tab's JS module (a fresh page load re-executes the module, so this
// starts `false` again), and it is only ever flipped by a CLIENT `useEffect`.
// SSR-safe: the server render never runs an effect, so it always computes
// `false` here; the first CLIENT render (before hydration's effects flush)
// reads the exact same fresh-module `false` — server and first-client-paint
// output are therefore identical, with no hydration mismatch. It survives a
// template's per-navigation REMOUNT (the reason a local ref/state cannot do
// this job) because the module itself — not the component instance — is
// where the flag lives.
let didFirstPaintThisSession = false;

/**
 * Doctrine Rule 9 — classify the CURRENT route and return the motion props
 * for the content column's keyed `m.div`. `isLateralDestination` must be a
 * stable, module-level pure function (one of `isGolfLateralDestination` /
 * `isBaseballLateralDestination` / `isBridgeLateralDestination`).
 *
 * Decision table (first match wins):
 *   1. reduced-motion              → INSTANT (no motion anywhere, ever)
 *   2. first paint of the session  → INSTANT (never fight hydration/skeleton)
 *   3. current path is a registered lateral destination → INSTANT
 *   4. otherwise (a detail push)   → opacity 0→1, 0.18s, --fw-ease-glide
 */
export function useRouteRevealMotion(
  isLateralDestination: (pathname: string) => boolean,
): RouteRevealMotion {
  const pathname = usePathname() ?? '';
  const prefersReducedMotion = useReducedMotion();

  // Snapshot "is this the first paint of the session" ONCE per mounted
  // instance (a lazy ref initializer, evaluated only on this instance's
  // FIRST render). The next navigation remounts a brand-new instance, which
  // re-reads the module flag fresh — that is how the classification stays
  // correct across remounts without ever comparing "previous vs next" route.
  const isFirstPaintRef = useRef<boolean | undefined>(undefined);
  if (isFirstPaintRef.current === undefined) {
    isFirstPaintRef.current = !didFirstPaintThisSession;
  }

  useEffect(() => {
    didFirstPaintThisSession = true;
  }, []);

  const instant =
    Boolean(prefersReducedMotion) || isFirstPaintRef.current || isLateralDestination(pathname);

  if (instant) {
    return { routeKey: pathname, ...INSTANT };
  }

  return {
    routeKey: pathname,
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: FAST_DURATION, ease: GLIDE },
  };
}
