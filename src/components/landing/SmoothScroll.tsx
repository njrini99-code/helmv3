'use client'

import { useSmoothScroll } from '@/hooks/useSmoothScroll'

/**
 * Mounts Lenis inertial scroll for a marketing page. Pass `anchors` on pages
 * with in-page section links (e.g. Products) to also smooth-scroll hash clicks.
 */
export function SmoothScroll({ anchors = false }: { anchors?: boolean }) {
  useSmoothScroll(true, { anchors })
  return null
}
