'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'

export function CustomCursor() {
  const [isPointer, setIsPointer] = useState(false)
  const [isHidden, setIsHidden] = useState(true)
  const [isClicking, setIsClicking] = useState(false)
  const lastTargetRef = useRef<EventTarget | null>(null)
  const isPointerRef = useRef(false)

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const dotX = useSpring(x, { stiffness: 500, damping: 28 })
  const dotY = useSpring(y, { stiffness: 500, damping: 28 })
  const ringX = useSpring(x, { stiffness: 150, damping: 15 })
  const ringY = useSpring(y, { stiffness: 150, damping: 15 })
  const dotOffsetX = useTransform(dotX, (value) => value - 8)
  const dotOffsetY = useTransform(dotY, (value) => value - 8)
  const ringOffsetX = useTransform(ringX, (value) => value - 20)
  const ringOffsetY = useTransform(ringY, (value) => value - 20)

  useEffect(() => {
    // Only show custom cursor on desktop
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches) {
      setIsHidden(false)
    }

    const moveCursor = (e: MouseEvent) => {
      x.set(e.clientX)
      y.set(e.clientY)

      const target = e.target as HTMLElement | null
      if (!target || target === lastTargetRef.current) return
      lastTargetRef.current = target

      let isInteractive = false
      if (target.closest) {
        isInteractive = Boolean(
          target.closest('a,button') ||
          target.getAttribute('role') === 'button' ||
          target.classList.contains('cursor-pointer')
        )
      }

      if (!isInteractive) {
        isInteractive = window.getComputedStyle(target).cursor === 'pointer'
      }

      if (isInteractive !== isPointerRef.current) {
        isPointerRef.current = isInteractive
        setIsPointer(isInteractive)
      }
    }

    const handleMouseDown = () => setIsClicking(true)
    const handleMouseUp = () => setIsClicking(false)
    const handleMouseLeave = () => setIsHidden(true)
    const handleMouseEnter = () => setIsHidden(false)

    window.addEventListener('mousemove', moveCursor)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    document.body.addEventListener('mouseleave', handleMouseLeave)
    document.body.addEventListener('mouseenter', handleMouseEnter)

    return () => {
      window.removeEventListener('mousemove', moveCursor)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.removeEventListener('mouseleave', handleMouseLeave)
      document.body.removeEventListener('mouseenter', handleMouseEnter)
    }
  }, [x, y])

  if (isHidden) return null

  return (
    <>
      {/* Main cursor dot */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] mix-blend-difference"
        style={{ x: dotOffsetX, y: dotOffsetY }}
        animate={{
          scale: isClicking ? 0.8 : isPointer ? 1.5 : 1,
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      >
        <div className="w-4 h-4 rounded-full bg-white" />
      </motion.div>
      
      {/* Trailing ring */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9998]"
        style={{ x: ringOffsetX, y: ringOffsetY }}
        animate={{
          scale: isPointer ? 1.3 : 1,
          opacity: isPointer ? 0.8 : 0.4,
        }}
        transition={{ type: 'spring', stiffness: 150, damping: 15 }}
      >
        <div className="w-10 h-10 rounded-full border-2 border-white/40" />
      </motion.div>
    </>
  )
}
