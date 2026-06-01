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
      duration: 0.72,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: false,
      touchMultiplier: 1,
      stopInertiaOnNavigate: true,
      prevent: (node) => {
        if (node.closest('[data-lenis-prevent]')) return true
        if (node.closest('[role="dialog"], [data-radix-popper-content-wrapper]')) return true
        if (node === document.documentElement || node === document.body) return false
        const style = window.getComputedStyle(node)
        return /(auto|scroll)/.test(`${style.overflow}${style.overflowY}${style.overflowX}`)
      },
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
