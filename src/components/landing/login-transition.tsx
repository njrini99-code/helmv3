'use client'

/**
 * Landing → Login transition.
 *
 * A quick cream fade that masks the flash when navigating from the dark landing
 * hero to the cream (#FFFEFA) login page. Intentionally minimal — no splash, no
 * logo — just a fast cover so the route change reads smooth instead of glitchy.
 *
 * Zero initial-load footprint: this mounts NOTHING until "Log in" is actually
 * clicked (only a window-event listener), and uses a plain CSS opacity
 * transition — no framer/LazyMotion provider competing with the landing's own
 * animations on first paint.
 *
 * Decoupled via a window CustomEvent so the desktop nav and the mobile menu both
 * trigger it. Links keep their real `href` so ⌘/middle-click and no-JS navigate
 * normally.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

const EVENT = 'helm:login-transition'
const TARGET = '/golf/login'
const CREAM = '#FFFEFA' // matches the login page background → seamless

/** Fire the transition. Returns false (so the caller does NOT preventDefault)
 *  for modified / non-left clicks, preserving native new-tab behavior. */
export function requestLoginTransition(e?: React.MouseEvent<HTMLElement>): boolean {
  if (typeof window === 'undefined') return false
  if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return false
  e?.preventDefault()
  window.dispatchEvent(new CustomEvent(EVENT))
  return true
}

export function LoginTransitionOverlay() {
  const router = useRouter()
  const [active, setActive] = useState(false) // portal mounted only once requested
  const [shown, setShown] = useState(false) // drives the CSS opacity transition
  const [instant, setInstant] = useState(false) // reduced-motion → no fade
  const navigatedRef = useRef(false)

  const go = useCallback(() => {
    if (navigatedRef.current) return
    navigatedRef.current = true
    router.push(TARGET)
  }, [router])

  useEffect(() => {
    const timers: number[] = []
    let raf1 = 0
    let raf2 = 0
    const onRequest = () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      navigatedRef.current = false
      setInstant(reduce)
      setActive(true)
      try { router.prefetch(TARGET) } catch { /* best-effort */ }
      if (reduce) {
        setShown(true)
      } else {
        // Two rAFs so the element paints at opacity 0 before transitioning to 1.
        raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setShown(true)) })
      }
      // Navigate just after the cream cover is up; safety call backs it up.
      timers.push(window.setTimeout(go, reduce ? 80 : 230))
      timers.push(window.setTimeout(go, 800))
    }
    window.addEventListener(EVENT, onRequest)
    return () => {
      window.removeEventListener(EVENT, onRequest)
      timers.forEach((t) => window.clearTimeout(t))
      if (raf1) cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [go, router])

  if (!active) return null

  return createPortal(
    <div
      role="presentation"
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        backgroundColor: CREAM,
        opacity: shown ? 1 : 0,
        transition: instant ? 'none' : 'opacity 200ms ease-out',
        pointerEvents: 'none',
      }}
    />,
    document.body,
  )
}
