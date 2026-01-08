'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useMotionValue, useSpring } from 'framer-motion'

export function useMagneticButton(strength = 0.4, maxDistance = 150) {
  const ref = useRef<HTMLButtonElement | HTMLAnchorElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  
  const springX = useSpring(x, { stiffness: 300, damping: 20 })
  const springY = useSpring(y, { stiffness: 300, damping: 20 })

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!ref.current) return
    
    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    
    const distanceX = e.clientX - centerX
    const distanceY = e.clientY - centerY
    const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2)
    
    if (distance < maxDistance) {
      x.set(distanceX * strength)
      y.set(distanceY * strength)
    } else {
      x.set(0)
      y.set(0)
    }
  }, [strength, maxDistance, x, y])

  const handleMouseLeave = useCallback(() => {
    x.set(0)
    y.set(0)
  }, [x, y])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const parent = element.parentElement || document.body
    parent.addEventListener('mousemove', handleMouseMove)
    element.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      parent.removeEventListener('mousemove', handleMouseMove)
      element.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [handleMouseMove, handleMouseLeave])

  return { ref, x: springX, y: springY }
}
