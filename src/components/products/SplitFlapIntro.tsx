'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface SplitFlapIntroProps {
  onComplete: () => void
}

export function SplitFlapIntro({ onComplete }: SplitFlapIntroProps) {
  const [phase, setPhase] = useState<
    'tagline' | 'isolate' | 'baseball' | 'baseball-pause' | 'golf' | 'golf-pause' | 'clear' | 'sports-labs' | 'complete'
  >('tagline')

  useEffect(() => {
    // Check if intro was seen
    const hasSeenIntro = sessionStorage.getItem('helm-intro-seen')
    if (hasSeenIntro) {
      onComplete()
      return
    }

    // Precise Cinematic Timeline
    const schedule = [
      { t: 0, fn: () => setPhase('tagline') },
      { t: 2500, fn: () => setPhase('isolate') },       // "Take the... of your program" fades
      { t: 3200, fn: () => setPhase('baseball') },      // Flip to BaseballHelm
      { t: 4500, fn: () => setPhase('baseball-pause') },// Pause on BaseballHelm
      { t: 5500, fn: () => setPhase('golf') },          // Flip to GolfHelm
      { t: 6800, fn: () => setPhase('golf-pause') },    // Pause on GolfHelm
      { t: 7800, fn: () => setPhase('clear') },         // Golf flips out, just Helm
      { t: 8600, fn: () => setPhase('sports-labs') },   // Helm Sports Labs appears
      {
        t: 10500, fn: () => {
          setPhase('complete')
          sessionStorage.setItem('helm-intro-seen', 'true')
          onComplete()
        }
      }
    ]

    const timers = schedule.map(({ t, fn }) => setTimeout(fn, t))
    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  if (phase === 'complete') return null

  return (
    <div className="fixed inset-0 z-[100] bg-[#FAFAF9] flex items-center justify-center overflow-hidden font-sans">
      {/* Skip Button */}
      <motion.button
        onClick={() => {
          sessionStorage.setItem('helm-intro-seen', 'true')
          onComplete()
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute top-8 right-8 text-neutral-400 hover:text-neutral-900 text-sm font-medium tracking-wide transition-colors z-20"
      >
        Skip Intro
      </motion.button>

      {/* Main Stage */}
      <div className="relative z-10 flex flex-col items-center">

        {/* Phase 1: Tagline */}
        <AnimatePresence>
          {phase === 'tagline' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, filter: 'blur(8px)' }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-center text-neutral-900">
                Take the{' '}
                <span className="text-[#22C55E]">Helm</span>
                {' '}of your program
              </h1>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase 2+: The Sequence */}
        {/* We use a layout group to handle the shifting "Helm" position cleanly */}
        {phase !== 'tagline' && (
          <motion.div
            layout
            className="flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {/* LEFT SIDE: Baseball / Golf */}
            <div className="relative h-[80px] md:h-[100px] flex items-center justify-end" style={{ perspective: '1000px' }}>
              <AnimatePresence mode="popLayout">
                {/* Baseball Flip */}
                {(phase === 'baseball' || phase === 'baseball-pause') && (
                  <FlipText key="baseball" text="Baseball" align="right" />
                )}
                {/* Golf Flip */}
                {(phase === 'golf' || phase === 'golf-pause') && (
                  <FlipText key="golf" text="Golf" align="right" />
                )}
              </AnimatePresence>
            </div>

            {/* CENTER: Helm (The Anchor) */}
            <motion.div
              layout
              className="text-5xl md:text-7xl font-bold tracking-tight text-[#22C55E] mx-1 md:mx-4"
            >
              Helm
            </motion.div>

            {/* RIGHT SIDE: Sports Labs */}
            <div className="relative h-[80px] md:h-[100px] flex items-center justify-start overflow-hidden">
              <AnimatePresence>
                {phase === 'sports-labs' && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="text-5xl md:text-7xl font-bold tracking-tight text-neutral-900 whitespace-nowrap"
                  >
                    Sports Labs
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </div>

      {/* Subtle Noise Texture for Premium Feel */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('/noise.png')] bg-repeat" style={{ filter: 'contrast(120%)' }} />
    </div>
  )
}

/**
 * Text that flips in/out like an analog clock mechanism
 */
function FlipText({ text, align = 'left' }: { text: string; align?: 'left' | 'right' }) {
  return (
    <motion.div
      className={cn(
        "text-5xl md:text-7xl font-bold tracking-tight text-neutral-900 whitespace-nowrap origin-bottom",
        align === 'right' ? 'text-right' : 'text-left'
      )}
      initial={{ rotateX: -90, opacity: 0, y: -40 }}
      animate={{ rotateX: 0, opacity: 1, y: 0 }}
      exit={{ rotateX: 70, opacity: 0, y: 40 }}
      transition={{
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1], // Custom cubic bezier for "professional" snap
        opacity: { duration: 0.4 }
      }}
    >
      {text}
    </motion.div>
  )
}
