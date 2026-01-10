'use client'

import { useState, useEffect } from 'react'
import { useSpring, animated } from '@react-spring/web'
import { cn } from '@/lib/utils'

interface SplitFlapIntroProps {
  onComplete: () => void
}

// Custom spring configs for cinematic feel
const springConfigs = {
  // Slow, smooth, organic movement
  gentle: { mass: 1, tension: 80, friction: 26 },
  // Slightly bouncy entrance
  wobbly: { mass: 1, tension: 120, friction: 14 },
  // Very slow, cinematic fade
  molasses: { mass: 2, tension: 40, friction: 30 },
  // Smooth slide
  smooth: { mass: 1, tension: 100, friction: 20 },
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

    // Slower, more cinematic timeline
    const schedule = [
      { t: 0, fn: () => setPhase('tagline') },
      { t: 3000, fn: () => setPhase('isolate') },       // "Take the... of your program" fades
      { t: 4000, fn: () => setPhase('baseball') },      // Flip to BaseballHelm
      { t: 5800, fn: () => setPhase('baseball-pause') },// Pause on BaseballHelm
      { t: 7000, fn: () => setPhase('golf') },          // Flip to GolfHelm
      { t: 8800, fn: () => setPhase('golf-pause') },    // Pause on GolfHelm
      { t: 10000, fn: () => setPhase('clear') },        // Golf flips out, just Helm
      { t: 11000, fn: () => setPhase('sports-labs') },  // Helm Sports Labs appears
      {
        t: 13500, fn: () => {
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
      <SkipButton onSkip={() => {
        sessionStorage.setItem('helm-intro-seen', 'true')
        onComplete()
      }} />

      {/* Main Stage */}
      <div className="relative z-10 flex flex-col items-center">

        {/* Phase 1: Tagline */}
        {phase === 'tagline' && <TaglinePhase />}

        {/* Phase 2+: The Sequence */}
        {phase !== 'tagline' && (
          <SequencePhase phase={phase} />
        )}
      </div>

      {/* Subtle Noise Texture for Premium Feel */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('/noise.png')] bg-repeat" style={{ filter: 'contrast(120%)' }} />
    </div>
  )
}

function SkipButton({ onSkip }: { onSkip: () => void }) {
  const spring = useSpring({
    from: { opacity: 0 },
    to: { opacity: 1 },
    delay: 800,
    config: springConfigs.molasses,
  })

  return (
    <animated.button
      style={spring}
      onClick={onSkip}
      className="absolute top-8 right-8 text-neutral-400 hover:text-neutral-900 text-sm font-medium tracking-wide transition-colors z-20"
    >
      Skip Intro
    </animated.button>
  )
}

function TaglinePhase() {
  const spring = useSpring({
    from: { opacity: 0, y: 30, filter: 'blur(4px)' },
    to: { opacity: 1, y: 0, filter: 'blur(0px)' },
    config: springConfigs.gentle,
  })

  return (
    <animated.div
      style={spring}
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
    >
      <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-center text-neutral-900">
        Take the{' '}
        <span className="text-[#22C55E]">Helm</span>
        {' '}of your program
      </h1>
    </animated.div>
  )
}

function SequencePhase({ phase }: { phase: string }) {
  const containerSpring = useSpring({
    from: { opacity: 0 },
    to: { opacity: 1 },
    config: springConfigs.smooth,
  })

  return (
    <animated.div
      style={containerSpring}
      className="flex items-center justify-center"
    >
      {/* LEFT SIDE: Baseball / Golf */}
      <div className="relative h-[80px] md:h-[100px] flex items-center justify-end" style={{ perspective: '1000px' }}>
        {(phase === 'baseball' || phase === 'baseball-pause') && (
          <FlipText key="baseball" text="Baseball" align="right" />
        )}
        {(phase === 'golf' || phase === 'golf-pause') && (
          <FlipText key="golf" text="Golf" align="right" />
        )}
      </div>

      {/* CENTER: Helm (The Anchor) */}
      <div className="text-5xl md:text-7xl font-bold tracking-tight text-[#22C55E] mx-1 md:mx-4">
        Helm
      </div>

      {/* RIGHT SIDE: Sports Labs */}
      <div className="relative h-[80px] md:h-[100px] flex items-center justify-start overflow-hidden">
        {phase === 'sports-labs' && <SportsLabsText />}
      </div>
    </animated.div>
  )
}

/**
 * Text that flips in with smooth spring physics
 */
function FlipText({ text, align = 'left' }: { text: string; align?: 'left' | 'right' }) {
  const spring = useSpring({
    from: {
      rotateX: -90,
      opacity: 0,
      y: -40,
      scale: 0.9,
    },
    to: {
      rotateX: 0,
      opacity: 1,
      y: 0,
      scale: 1,
    },
    config: {
      mass: 1.2,
      tension: 60,  // Lower = slower
      friction: 18, // Higher = less bouncy
    },
  })

  return (
    <animated.div
      style={{
        transform: spring.rotateX.to(r => `perspective(1000px) rotateX(${r}deg)`),
        opacity: spring.opacity,
        y: spring.y,
        scale: spring.scale,
      }}
      className={cn(
        "text-5xl md:text-7xl font-bold tracking-tight text-neutral-900 whitespace-nowrap origin-bottom",
        align === 'right' ? 'text-right' : 'text-left'
      )}
    >
      {text}
    </animated.div>
  )
}

function SportsLabsText() {
  const spring = useSpring({
    from: { opacity: 0, x: -30, filter: 'blur(4px)' },
    to: { opacity: 1, x: 0, filter: 'blur(0px)' },
    config: springConfigs.gentle,
  })

  return (
    <animated.div
      style={spring}
      className="text-5xl md:text-7xl font-bold tracking-tight text-neutral-900 whitespace-nowrap"
    >
      Sports Labs
    </animated.div>
  )
}
