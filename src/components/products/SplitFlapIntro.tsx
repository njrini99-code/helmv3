'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion'

interface SplitFlapIntroProps {
  onComplete: () => void
}

export function SplitFlapIntro({ onComplete }: SplitFlapIntroProps) {
  const [phase, setPhase] = useState<
    'tagline' | 'helm-only' | 'baseball' | 'baseball-pause' | 'golf' | 'golf-pause' | 'sports-labs' | 'complete'
  >('tagline')

  useEffect(() => {
    // Check if intro was seen
    const hasSeenIntro = sessionStorage.getItem('helm-intro-seen')
    if (hasSeenIntro) {
      onComplete()
      return
    }

    // Timeline with slower, smoother timing
    const t1 = setTimeout(() => setPhase('helm-only'), 2500) // Show tagline 2.5s (was 1.8s)
    const t2 = setTimeout(() => setPhase('baseball'), 4000) // Helm alone 1.5s (was 1s)
    const t3 = setTimeout(() => setPhase('baseball-pause'), 5200) // Flip in 1.2s (was 0.8s)
    const t4 = setTimeout(() => setPhase('golf'), 6600) // Pause 1.4s (was 1s)
    const t5 = setTimeout(() => setPhase('golf-pause'), 7800) // Flip transition 1.2s (was 0.8s)
    const t6 = setTimeout(() => setPhase('sports-labs'), 9200) // Pause 1.4s (was 1s)
    const t7 = setTimeout(() => {
      setPhase('complete')
      sessionStorage.setItem('helm-intro-seen', 'true')
      onComplete()
    }, 11000) // Show final 1.8s (was 1.2s)

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4)
      clearTimeout(t5); clearTimeout(t6); clearTimeout(t7)
    }
  }, [onComplete])

  if (phase === 'complete') return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] bg-[#FFF8E7] flex items-center justify-center overflow-hidden"
        style={{
          willChange: 'opacity',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transform: 'translateZ(0)',
        }}
        exit={{ opacity: 0 }}
        transition={{ 
          duration: 1.2, 
          ease: [0.22, 1, 0.36, 1],
          opacity: { duration: 0.8, ease: [0.22, 1, 0.36, 1] }
        }}
      >
        {/* Skip button */}
        <motion.button
          onClick={() => {
            sessionStorage.setItem('helm-intro-seen', 'true')
            onComplete()
          }}
          className="absolute top-8 right-8 text-neutral-400 hover:text-neutral-600 text-sm font-medium transition-colors z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Skip intro →
        </motion.button>

        {/* Main animation container */}
        <div className="text-center">
          {/* PHASE 1: Full tagline */}
          {phase === 'tagline' && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ 
                type: "spring",
                stiffness: 100,
                damping: 20,
                mass: 0.8,
                opacity: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
              }}
              style={{
                willChange: 'transform, opacity',
                backfaceVisibility: 'hidden',
              }}
              className="text-5xl md:text-7xl font-bold tracking-tight"
            >
              <motion.span
                className="text-neutral-900 inline-block"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ 
                  type: "spring",
                  stiffness: 120,
                  damping: 18,
                  delay: 0.1
                }}
              >
                Take the{' '}
              </motion.span>
              <motion.span 
                className="text-[#22C55E] inline-block"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ 
                  type: "spring",
                  stiffness: 150,
                  damping: 15,
                  delay: 0.2
                }}
              >
                Helm
              </motion.span>
              <motion.span
                className="text-neutral-900 inline-block"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ 
                  type: "spring",
                  stiffness: 120,
                  damping: 18,
                  delay: 0.3
                }}
              >
                {' '}of your program
              </motion.span>
            </motion.div>
          )}

          {/* PHASE 2+: "Helm" only + split-flap display */}
          {phase !== 'tagline' && (
            <motion.div 
              className="flex items-center justify-center gap-3 md:gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ 
                type: "spring",
                stiffness: 100,
                damping: 20,
                delay: 0.2
              }}
            >
              {/* Prefix word (Baseball/Golf) with split-flap effect */}
              <div 
                className="relative h-[100px] md:h-[140px] flex items-center" 
                style={{ 
                  perspective: '1200px',
                  perspectiveOrigin: 'center center'
                }}
              >
                <AnimatePresence mode="wait">
                  {(phase === 'baseball' || phase === 'baseball-pause') && (
                    <SplitFlapWord
                      key="baseball"
                      word="Baseball"
                      entering={phase === 'baseball'}
                    />
                  )}
                  {(phase === 'golf' || phase === 'golf-pause') && (
                    <SplitFlapWord
                      key="golf"
                      word="Golf"
                      entering={phase === 'golf'}
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* "Helm" - always present in kelly green with smooth glide */}
              <motion.div
                initial={{ opacity: 0, scale: 0.85, x: -10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                transition={{ 
                  type: "spring",
                  stiffness: 200,
                  damping: 25,
                  mass: 0.5
                }}
                style={{
                  willChange: 'transform, opacity',
                  backfaceVisibility: 'hidden',
                }}
                className="text-[#22C55E] text-5xl md:text-7xl font-bold tracking-tight"
              >
                Helm
              </motion.div>

              {/* "Sports Labs" - appears last with smooth slide */}
              {phase === 'sports-labs' && (
                <motion.div
                  initial={{ opacity: 0, x: -40, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ 
                    type: "spring",
                    stiffness: 150,
                    damping: 22,
                    mass: 0.6
                  }}
                  style={{
                    willChange: 'transform, opacity',
                    backfaceVisibility: 'hidden',
                  }}
                  className="text-neutral-900 text-5xl md:text-7xl font-bold tracking-tight"
                >
                  Sports Labs
                </motion.div>
              )}
            </motion.div>
          )}
        </div>

        {/* Subtle cream texture overlay */}
        <div 
          className="absolute inset-0 opacity-[0.015] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgb(0 0 0 / 0.1) 1px, transparent 0)`,
            backgroundSize: '32px 32px'
          }}
        />
      </motion.div>
    </AnimatePresence>
  )
}

// Split-flap individual word component with realistic 3D flip
function SplitFlapWord({ word, entering }: { word: string; entering: boolean }) {
  return (
    <motion.div
      className="text-neutral-900 text-5xl md:text-7xl font-bold tracking-tight whitespace-nowrap relative"
      style={{
        transformStyle: 'preserve-3d',
        transformOrigin: 'center center',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        willChange: 'transform, opacity, filter',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
      initial={{
        rotateX: entering ? -90 : 0,
        opacity: entering ? 0 : 1,
        y: entering ? -30 : 0,
        scale: entering ? 0.8 : 1,
        filter: entering ? 'blur(4px)' : 'blur(0px)',
      }}
      animate={{
        rotateX: entering ? 0 : 90,
        opacity: entering ? 1 : 0,
        y: entering ? 0 : 30,
        scale: entering ? 1 : 0.8,
        filter: entering ? 'blur(0px)' : 'blur(4px)',
      }}
      exit={{
        rotateX: 90,
        opacity: 0,
        y: 30,
        scale: 0.8,
        filter: 'blur(4px)',
      }}
      transition={{
        type: "spring",
        stiffness: entering ? 180 : 150,
        damping: entering ? 20 : 18,
        mass: 0.7,
        opacity: {
          duration: entering ? 0.4 : 0.3,
          ease: [0.22, 1, 0.36, 1]
        },
        filter: {
          duration: 0.3,
          ease: [0.22, 1, 0.36, 1]
        }
      }}
    >
      {/* Add subtle shadow for depth during flip */}
      <motion.div
        className="absolute inset-0 bg-black/5 rounded-lg"
        style={{
          transform: 'translateZ(-10px)',
          filter: 'blur(2px)',
        }}
        animate={{
          opacity: entering ? 0.3 : 0,
        }}
        transition={{
          duration: 0.4,
          ease: [0.22, 1, 0.36, 1]
        }}
      />
      <span className="relative z-10">{word}</span>
    </motion.div>
  )
}
