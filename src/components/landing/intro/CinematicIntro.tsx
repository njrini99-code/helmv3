'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { StadiumLightSequence } from './StadiumLightSequence'
import Image from 'next/image'

type Phase = 'black' | 'light1' | 'light2' | 'light3' | 'full' | 'reveal' | 'done'

interface CinematicIntroProps {
  children: React.ReactNode
}

export function CinematicIntro({ children }: CinematicIntroProps) {
  const [phase, setPhase] = useState<Phase>('black')
  const [skipIntro, setSkipIntro] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasSeen = sessionStorage.getItem('helm-intro-seen')
      if (hasSeen) {
        setPhase('done')
        setSkipIntro(true)
        return
      }
    }

    // Slower, more dramatic sequence
    const sequence: { phase: Phase; delay: number }[] = [
      { phase: 'light1', delay: 2000 },   // First light
      { phase: 'light2', delay: 3000 },   // Second light
      { phase: 'light3', delay: 4000 },   // Third light
      { phase: 'full', delay: 5000 },     // All lights on, logo appears
      { phase: 'reveal', delay: 6000 },   // Content starts fading in
      { phase: 'done', delay: 7000 },     // Complete
    ]

    const timers = sequence.map(({ phase, delay }) =>
      setTimeout(() => {
        setPhase(phase)
        if (phase === 'done') {
          sessionStorage.setItem('helm-intro-seen', 'true')
        }
      }, delay)
    )

    return () => timers.forEach(clearTimeout)
  }, [])

  const handleSkip = () => {
    setPhase('done')
    sessionStorage.setItem('helm-intro-seen', 'true')
  }

  if (skipIntro) return <>{children}</>

  const isRevealing = phase === 'reveal' || phase === 'done'
  const showLogo = ['full', 'reveal'].includes(phase)

  return (
    <div className="relative">
      {/* Intro Overlay */}
      <AnimatePresence>
        {phase !== 'done' && (
          <motion.div
            className="fixed inset-0 z-[100] bg-black"
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: 'easeInOut' }}
          >
            {/* Stadium background with brightness control */}
            <div className="absolute inset-0">
              <Image
                src="/stadium-lights-hero.jpg"
                alt=""
                fill
                className="object-cover"
                style={{
                  filter: `brightness(${
                    phase === 'black' ? 0.1
                    : phase === 'light1' ? 0.4
                    : phase === 'light2' ? 0.6
                    : phase === 'light3' ? 0.8
                    : 1
                  })`,
                  transition: 'filter 0.8s ease-out',
                }}
                priority
              />
            </div>

            {/* Dark vignette overlay - fades out as lights come on */}
            <motion.div
              className="absolute inset-0"
              animate={{
                opacity: phase === 'black' ? 0.95
                  : phase === 'light1' ? 0.7
                  : phase === 'light2' ? 0.5
                  : phase === 'light3' ? 0.35
                  : 0.2
              }}
              transition={{ duration: 0.8 }}
              style={{
                background: 'radial-gradient(ellipse at 80% 35%, transparent 20%, rgba(0,0,0,0.8) 70%, rgba(0,0,0,0.95) 100%)',
              }}
            />

            {/* Stadium Light Sequence */}
            <StadiumLightSequence phase={phase} />

            {/* Simple logo fade-in (no electricity) */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center z-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: showLogo ? 1 : 0 }}
              transition={{ duration: 1, ease: 'easeOut' }}
            >
              <div className="text-center">
                <Image
                  src="/helm-main-logo-transparent-white-trim.png"
                  alt="Helm Sports Labs"
                  width={150}
                  height={150}
                  className="w-[100px] h-[100px] md:w-[140px] md:h-[140px] mx-auto object-contain"
                  priority
                />
                <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight mt-6">
                  HELM
                </h1>
                <p className="text-sm md:text-base text-white/60 tracking-[0.3em] mt-2">
                  SPORTS LABS
                </p>
              </div>
            </motion.div>

            {/* Skip button */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              whileHover={{ opacity: 1 }}
              onClick={handleSkip}
              className="absolute bottom-8 right-8 text-white/50 text-sm hover:text-white transition-colors z-30"
            >
              Skip →
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main page content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isRevealing ? 1 : 0 }}
        transition={{ duration: 1 }}
      >
        {children}
      </motion.div>
    </div>
  )
}
