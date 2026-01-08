'use client'

import { motion, useScroll, useSpring } from 'framer-motion'

export function ShowcaseScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  })

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 origin-left z-50"
      style={{ 
        scaleX,
        background: 'linear-gradient(90deg, oklch(0.65 0.19 150), oklch(0.70 0.17 150), oklch(0.70 0.18 45))'
      }}
    />
  )
}
