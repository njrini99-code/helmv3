'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'

export interface SmoothScrollOptions {
  /**
   * Smooth-scroll same-page hash links (`<a href="#section">`). When Lenis is
   * active it uses `lenis.scrollTo`; on mobile / reduced-motion (where Lenis is
   * skipped) it falls back to native `scrollIntoView`, so anchor jumps stay
   * buttery everywhere without hijacking wheel scroll where we don't want to.
   */
  anchors?: boolean
}

/**
 * Mount Lenis inertial scroll. `active` lets callers route-gate it so
 * surfaces that rely on native `scrollIntoView({behavior:'smooth'})`
 * or HTML5 drag-drop (messages, shot tracking, calendar) keep native
 * scroll. Defaults to true to preserve callers that don't gate.
 *
 * Additional opt-outs: `prefers-reduced-motion` + coarse-pointer
 * (mobile) — accessibility-first + touch users keep native behavior.
 */
export function useSmoothScroll(active: boolean = true, options?: SmoothScrollOptions) {
  const anchors = options?.anchors ?? false

  useEffect(() => {
    if (!active) return
    if (typeof window === 'undefined') return
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches

    let lenis: Lenis | undefined
    let rafId = 0

    // Inertial wheel scroll — desktop, motion-OK only. Touch + reduced-motion
    // keep their (already smooth / intentionally instant) native behavior.
    if (!prefersReducedMotion && !isCoarsePointer) {
      lenis = new Lenis({
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

      const raf = (time: number) => {
        lenis?.raf(time)
        rafId = requestAnimationFrame(raf)
      }
      rafId = requestAnimationFrame(raf)
    }

    // Smooth in-page anchor navigation (opt-in), routed through Lenis when it's
    // running, native smooth scroll otherwise. Delegated so it covers CTAs and
    // nav links without per-link wiring.
    let onAnchorClick: ((e: MouseEvent) => void) | undefined
    if (anchors) {
      onAnchorClick = (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        const link = (e.target as HTMLElement | null)?.closest('a[href^="#"]') as HTMLAnchorElement | null
        if (!link) return
        const raw = link.getAttribute('href')
        if (!raw || raw === '#') return
        const el = document.getElementById(decodeURIComponent(raw.slice(1)))
        if (!el) return
        e.preventDefault()
        if (lenis) {
          lenis.scrollTo(el, { offset: -80 })
        } else {
          el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' })
        }
        if (typeof history !== 'undefined' && history.replaceState) {
          history.replaceState(null, '', raw)
        }
        // preventDefault() above suppresses the browser's native fragment
        // navigation, which would have moved focus to the target — without
        // this, keyboard/AT users' focus stays on the link and Tab resumes
        // from the top of the page instead of the section they navigated to.
        if (!(el instanceof HTMLElement)) return
        if (!el.hasAttribute('tabindex') && !el.matches('a, button, input, select, textarea, [contenteditable]')) {
          el.setAttribute('tabindex', '-1')
        }
        el.focus({ preventScroll: true })
      }
      document.addEventListener('click', onAnchorClick)
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      lenis?.destroy()
      if (onAnchorClick) document.removeEventListener('click', onAnchorClick)
    }
  }, [active, anchors])
}
