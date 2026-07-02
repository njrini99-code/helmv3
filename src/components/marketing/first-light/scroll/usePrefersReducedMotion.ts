'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * SSR-safe `prefers-reduced-motion` read
 * (docs/redesign/.../03_apple_scroll_playbook.md §4.8's recommended
 * pattern) — use this INSTEAD OF framer-motion's own `useReducedMotion()`
 * in any component that branches DOM STRUCTURE (not just an animation
 * prop value) based on the result.
 *
 * Why: framer-motion's `useReducedMotion()` resolves `matchMedia`
 * synchronously on the very first render, client-side included — for a
 * real user with reduced-motion enabled, that first CLIENT render
 * disagrees with the server's motion-unaware render, and if a component
 * uses the flag to pick between two DIFFERENT JSX trees (like
 * `MaskedReveal`'s reduced-vs-animated branch), React logs a hydration
 * mismatch (confirmed 2026-07-02 via Playwright's `reducedMotion:
 * 'reduce'` emulation). `useSyncExternalStore` with a `getServerSnapshot`
 * that returns `false` is React's own sanctioned fix: the server AND the
 * first client render both resolve to `false` (structurally matching),
 * then React swaps in the real client value immediately after hydration
 * — no console error, and no build-up of the wrong DOM for more than a
 * tick. Simple prop-only variation (e.g. `transition={reduced ? {duration:0}
 * : {...}}` on an otherwise-identical `m.div`) doesn't have this problem
 * and can keep using framer-motion's `useReducedMotion()` directly (see
 * the repo-wide convention in `/golf/join`, `/golf/(auth)/demo`, etc.).
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
