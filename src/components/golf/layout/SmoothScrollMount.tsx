'use client';

/**
 * SmoothScrollMount — thin client wrapper that calls useSmoothScroll
 * once at the dashboard layout root.
 *
 * The hook itself opts out on `prefers-reduced-motion` + coarse-pointer
 * (mobile), so this is safe to mount globally — only desktop pointer
 * users with motion preferences enabled get the Lenis inertia.
 *
 * Why this matters for v3: Lenis turns harsh page-jump scrolls into
 * continuous spatial motion. Per the design language's "continuity of
 * perception" principle, the user should never feel a hard cut — every
 * navigational change should feel like an environmental shift, not a
 * teleport. Lenis is the cheapest way to get 80% of that feel.
 */

import { useSmoothScroll } from '@/hooks/useSmoothScroll';

export function SmoothScrollMount() {
  useSmoothScroll();
  return null;
}
