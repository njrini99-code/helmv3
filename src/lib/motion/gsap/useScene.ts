'use client';

/**
 * ============================================================================
 * useScene — the scoping + lifecycle contract every marketing timeline uses
 * ----------------------------------------------------------------------------
 * One hook, three guarantees:
 *
 *   1. SCOPED. Every scene runs inside `gsap.context(fn, ref)`, so selector
 *      strings inside it resolve within that component's DOM only. No global
 *      `'.card'` selectors reaching across sections — the failure mode where
 *      two sections quietly animate each other's children.
 *   2. CLEANED. `ctx.revert()` on unmount kills the timelines, removes the
 *      ScrollTriggers they created, AND restores every inline style GSAP wrote.
 *      That last part is what makes React StrictMode's double-mount safe:
 *      without the revert, the second mount measures elements that the first
 *      mount left transformed, and pin spacing compounds.
 *   3. RESPONSIVE + REDUCED-MOTION AWARE. The scene body receives a
 *      `SceneContext` telling it which breakpoint it is running in and whether
 *      motion is reduced, because `gsap.matchMedia()` re-runs the body per
 *      context and reverts the previous one automatically.
 *
 * Scenes are authored as plain functions of `(ctx) => void` living next to
 * their component, never as inline effect bodies — so a section's choreography
 * can be read on its own.
 * ========================================================================== */

import { useLayoutEffect, useEffect, type RefObject } from 'react';
import { gsap } from './register';

/** Which responsive context a scene body is currently running in. */
export type SceneBreakpoint = 'desktopLarge' | 'desktop' | 'tablet' | 'mobile';

export interface SceneContext {
  /** The scene root — use for `scope`d selectors and as a ScrollTrigger trigger. */
  root: HTMLElement;
  breakpoint: SceneBreakpoint;
  /**
   * True when the user asked for reduced motion. Scene bodies must render the
   * SETTLED end state and register no scrubs, no pins, no parallax — the
   * information has to survive in full, only the choreography goes.
   */
  reduced: boolean;
  /** Convenience: tablet or mobile. */
  compact: boolean;
  /**
   * `gsap.matchMedia`'s own add()-scoped context. Anything created inside the
   * scene body is auto-reverted when the media query stops matching, so a
   * desktop pin does not survive a resize down to mobile.
   */
  mm: gsap.Context;
}

/**
 * A scene body may return a cleanup function — `gsap.matchMedia` calls it when
 * the context stops matching (a resize across a breakpoint) and on revert.
 * This is where a scene undoes anything GSAP itself cannot revert, above all
 * `SplitText.revert()`: SplitText rewrites the target's innerHTML, and leaving
 * that in place breaks text selection and re-measurement on resize.
 */
export type SceneBody = (ctx: SceneContext) => void | (() => void);

/**
 * The four responsive contexts from the plan. `matchMedia` evaluates all of
 * them, so the queries are written mutually exclusive — otherwise a 1440px
 * viewport would run both the `desktop` and `desktopLarge` bodies and register
 * two competing pins for the same section.
 */
const QUERIES: Record<SceneBreakpoint, string> = {
  desktopLarge: '(min-width: 1440px)',
  desktop: '(min-width: 1024px) and (max-width: 1439px)',
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  mobile: '(max-width: 767px)',
};

/**
 * `useLayoutEffect` on the client so a scene's initial `gsap.set()` lands
 * BEFORE paint. With a plain `useEffect` there is one painted frame of the
 * settled state before the hidden state applies — a visible flash on
 * back-navigation with restored scroll, or on a `/#hash` load. Falls back to
 * `useEffect` on the server to avoid React's SSR warning. (Same reasoning the
 * existing landing motion module documents for its own prep pass.)
 */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Register a scene against a component root.
 *
 * @param ref   The scene root. The scene does not run until this is populated.
 * @param body  The choreography. Re-created per responsive context.
 * @param deps  Extra reactive deps. Keep this EMPTY unless the DOM the scene
 *              targets genuinely changes identity — a scene that re-registers
 *              on every render will thrash ScrollTrigger's pin spacing.
 */
export function useScene(
  ref: RefObject<HTMLElement | null>,
  body: SceneBody,
  deps: React.DependencyList = [],
): void {
  useIsoLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const mm = gsap.matchMedia();

    const register = (breakpoint: SceneBreakpoint, reduced: boolean) => {
      const query = reduced
        ? `${QUERIES[breakpoint]} and (prefers-reduced-motion: reduce)`
        : `${QUERIES[breakpoint]} and (prefers-reduced-motion: no-preference)`;

      mm.add(query, (context) =>
        // Returning the scene's cleanup lets matchMedia run it on context exit.
        body({
          root,
          breakpoint,
          reduced,
          compact: breakpoint === 'tablet' || breakpoint === 'mobile',
          mm: context,
        }),
      );
    };

    (Object.keys(QUERIES) as SceneBreakpoint[]).forEach((bp) => {
      register(bp, false);
      register(bp, true);
    });

    // Reverts every timeline, every ScrollTrigger and every inline style GSAP
    // wrote across ALL contexts — the StrictMode-safe teardown.
    return () => mm.revert();
  }, deps);
}
