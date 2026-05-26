'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'

/**
 * Mount Lenis inertial scroll. `active` lets callers route-gate it so
 * surfaces that rely on native `scrollIntoView({behavior:'smooth'})`
 * or HTML5 drag-drop (messages, shot tracking, calendar) keep native
 * scroll. Defaults to true to preserve callers that don't gate.
 *
 * Additional opt-outs: `prefers-reduced-motion` + coarse-pointer
 * (mobile) — accessibility-first + touch users keep native behavior.
 */
export function useSmoothScroll(active: boolean = true) {
  useEffect(() => {
    if (!active) return
    if (typeof window === 'undefined') return
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches
    if (prefersReducedMotion || isCoarsePointer) return

    const lenis = new Lenis({
      duration: 0.9,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1,
    })

    let rafId = 0
    function raf(time: number) {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }

    rafId = requestAnimationFrame(raf)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      lenis.destroy()
    }
  }, [active])
}
