'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface CinematicIntroProps {
  onComplete: () => void
}

export function CinematicIntro({ onComplete }: CinematicIntroProps) {
  const [phase, setPhase] = useState<'tagline' | 'fade' | 'reveal' | 'complete'>('tagline')

  useEffect(() => {
    // Check if user has seen intro before
    const hasSeenIntro = sessionStorage.getItem('products-intro-seen')
    
    if (hasSeenIntro) {
      onComplete()
      return
    }

    // Timeline
    const timer1 = setTimeout(() => setPhase('fade'), 2000) // Show tagline for 2s
    const timer2 = setTimeout(() => setPhase('reveal'), 3000) // Fade out tagline
    const timer3 = setTimeout(() => {
      setPhase('complete')
      sessionStorage.setItem('products-intro-seen', 'true')
      onComplete()
    }, 4500) // Complete animation

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
    }
  }, [onComplete])

  if (phase === 'complete') return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8 }}
      >
        {/* Tagline Phase */}
        {phase === 'tagline' && (
          <motion.div
            className="text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
              <span className="text-white">Built for the sports </span>
              <span className="text-helm-green-500">you coach</span>
            </h1>
          </motion.div>
        )}

        {/* Fade Phase - "you coach" fades, setup for reveal */}
        {phase === 'fade' && (
          <motion.div
            className="text-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
              <span className="text-white opacity-0">Built for the sports </span>
              <span className="text-helm-green-500">you coach</span>
            </h1>
          </motion.div>
        )}

        {/* Reveal Phase - "Helm" moves up, products appear */}
        {phase === 'reveal' && (
          <motion.div
            className="text-center space-y-8"
            initial={{ y: 0 }}
            animate={{ y: -50 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* "Helm" stays in green */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <span className="text-helm-green-500 text-5xl md:text-7xl font-bold tracking-tight">
                Helm
              </span>
            </motion.div>

            {/* Products slide in from sides */}
            <motion.div
              className="flex items-center justify-center gap-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {/* BaseballHelm */}
              <motion.div
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="text-center"
              >
                <div className="text-[#FFF8E7] text-3xl md:text-4xl font-bold tracking-tight">
                  Baseball
                </div>
                <div className="text-amber-500 text-xs md:text-sm font-semibold mt-1 tracking-wide">
                  Recruiting
                </div>
              </motion.div>

              <div className="w-px h-16 bg-neutral-700" />

              {/* GolfHelm */}
              <motion.div
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="text-center"
              >
                <div className="text-[#FFF8E7] text-3xl md:text-4xl font-bold tracking-tight">
                  Golf
                </div>
                <div className="text-helm-green-500 text-xs md:text-sm font-semibold mt-1 tracking-wide">
                  Team Management
                </div>
              </motion.div>
            </motion.div>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="text-neutral-400 text-lg md:text-xl"
            >
              Two products. One platform.
            </motion.p>
          </motion.div>
        )}

        {/* Skip button */}
        <motion.button
          onClick={() => {
            sessionStorage.setItem('products-intro-seen', 'true')
            onComplete()
          }}
          className="absolute bottom-8 right-8 text-neutral-500 hover:text-white text-sm transition-colors"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          Skip intro →
        </motion.button>
      </motion.div>
    </AnimatePresence>
  )
}
