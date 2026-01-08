'use client'

import { motion, useScroll, useInView, AnimatePresence, useMotionValueEvent, useTransform, type MotionValue } from 'framer-motion'
import { useRef, useState } from 'react'

// Feature data with icons
const features = [
  {
    title: 'Recruiting Pipeline',
    description: 'Visual kanban boards for every prospect. Track, organize, and never lose a lead.',
    icon: '📊',
    gradient: 'from-blue-500 to-cyan-400',
  },
  {
    title: 'Analytics Dashboard',
    description: 'Performance insights at a glance. Data-driven decisions made simple.',
    icon: '📈',
    gradient: 'from-violet-500 to-purple-400',
  },
  {
    title: 'Team Calendar',
    description: 'Schedule everything in one place. Sync with your entire coaching staff.',
    icon: '📅',
    gradient: 'from-amber-500 to-orange-400',
  },
  {
    title: 'Communication Hub',
    description: 'Stay connected with your team. Messages, updates, and notifications unified.',
    icon: '💬',
    gradient: 'from-emerald-500 to-green-400',
  },
]

// Animated letter with particles
function AnimatedLetter({
  letter,
  index,
  isVisible,
  isExploding,
}: {
  letter: string
  index: number
  isVisible: boolean
  isExploding: boolean
}) {
  const delay = index * 0.04

  const [particles] = useState(() =>
    Array.from({ length: 10 }, (_, i) => ({
      id: i,
      angle: (360 / 10) * i + (Math.random() - 0.5) * 36,
      distance: 100 + Math.random() * 150,
      size: 4 + Math.random() * 6,
    }))
  )

  return (
    <span className="relative inline-block">
      {isExploding && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {particles.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-full bg-amber-400"
              style={{ width: p.size, height: p.size }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: Math.cos(p.angle * Math.PI / 180) * p.distance,
                y: Math.sin(p.angle * Math.PI / 180) * p.distance,
                opacity: 0,
                scale: 0.3,
              }}
              transition={{
                duration: 1.2,
                delay: delay + p.id * 0.02,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          ))}
        </span>
      )}

      <motion.span
        className="relative text-stone-800 font-serif font-medium"
        initial={{ opacity: 0, y: 40 }}
        animate={{
          opacity: isVisible ? (isExploding ? 0 : 1) : 0,
          y: isVisible ? 0 : 40,
          scale: isExploding ? 0 : 1,
        }}
        transition={{
          opacity: { duration: isExploding ? 0.6 : 0.5, delay },
          y: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] },
          scale: { duration: 0.6, delay },
        }}
      >
        {letter === ' ' ? '\u00A0' : letter}
      </motion.span>
    </span>
  )
}

// Premium transition variants
const cardVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
    scale: 0.8,
    rotateY: direction > 0 ? 45 : -45,
    filter: 'blur(10px)',
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    rotateY: 0,
    filter: 'blur(0px)',
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
    scale: 0.8,
    rotateY: direction < 0 ? 45 : -45,
    filter: 'blur(10px)',
  }),
}

// Scroll-controlled Feature Carousel
function FeatureCarousel({
  activeIndex,
  direction,
  progress,
}: {
  activeIndex: number
  direction: number
  progress: MotionValue<number>
}) {
  // Calculate progress within current feature for micro-animations
  const clampedProgress = useTransform(progress, (value) => {
    const featureProgress = (value - 0.25 - (activeIndex * 0.15)) / 0.15
    return Math.max(0, Math.min(1, featureProgress))
  })

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
      {/* Browser Window */}
      <motion.div
        className="rounded-2xl overflow-hidden shadow-2xl bg-stone-900"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Title bar */}
        <div className="bg-stone-800 px-4 py-2.5 flex items-center gap-3 border-b border-stone-700/50">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="bg-stone-700/60 rounded-lg px-4 py-1 flex items-center gap-2">
              <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span className="text-stone-400 text-sm">app.helmsportslabs.com</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          className="relative h-[280px] sm:h-[320px] bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900"
          style={{ perspective: '1200px' }}
        >
          {/* Dynamic gradient background based on active feature */}
          <motion.div
            className={`absolute inset-0 opacity-20 bg-gradient-to-br ${features[activeIndex]?.gradient}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            transition={{ duration: 0.5 }}
            key={activeIndex}
          />

          {/* Animated glow */}
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full blur-[80px]"
            animate={{
              background: [
                'radial-gradient(circle, rgba(251,191,36,0.2) 0%, transparent 70%)',
                'radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)',
                'radial-gradient(circle, rgba(34,197,94,0.2) 0%, transparent 70%)',
              ][activeIndex % 3],
              scale: [1, 1.1, 1],
            }}
            transition={{ duration: 2, ease: 'easeInOut' }}
          />

          {/* Feature content with 3D transitions */}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={activeIndex}
              custom={direction}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                duration: 0.6,
                ease: [0.16, 1, 0.3, 1],
                opacity: { duration: 0.4 },
              }}
              className="absolute inset-0 flex items-center justify-center p-8"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="text-center">
                {/* Animated icon */}
                <motion.div
                  className={`w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${features[activeIndex]?.gradient} flex items-center justify-center shadow-2xl`}
                  initial={{ scale: 0.5, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    duration: 0.6,
                    ease: [0.16, 1, 0.3, 1],
                    delay: 0.1,
                  }}
                >
                  <span className="text-3xl">{features[activeIndex]?.icon}</span>
                </motion.div>

                {/* Title with stagger */}
                <motion.h3
                  className="text-xl sm:text-2xl md:text-3xl font-semibold text-white mb-3"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  {features[activeIndex]?.title}
                </motion.h3>

                {/* Description */}
                <motion.p
                  className="text-sm sm:text-base md:text-lg text-stone-400 max-w-md mx-auto leading-relaxed"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                >
                  {features[activeIndex]?.description}
                </motion.p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Feature number indicator */}
          <div className="absolute bottom-4 left-4 text-stone-600 font-mono text-sm">
            {String(activeIndex + 1).padStart(2, '0')} / {String(features.length).padStart(2, '0')}
          </div>
        </div>
      </motion.div>

      {/* Title below browser */}
      <div className="mt-8 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <h4 className="text-xl sm:text-2xl md:text-3xl font-semibold text-stone-900 mb-2">
              {features[activeIndex]?.title}
            </h4>
            <p className="text-base sm:text-lg text-stone-500 max-w-lg mx-auto">
              {features[activeIndex]?.description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-3 mt-8">
        {features.map((_feature, i) => (
          <div
            key={i}
            className="relative"
          >
            {/* Active indicator ring */}
            {i === activeIndex && (
              <motion.div
                layoutId="activeRing"
                className="absolute -inset-2 rounded-full border-2 border-amber-400"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}

            {/* Dot */}
            <motion.div
              className={`
                w-3 h-3 rounded-full transition-all duration-300
                ${i === activeIndex
                  ? 'bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.6)]'
                  : i < activeIndex
                    ? 'bg-amber-400/50'
                    : 'bg-stone-300'
                }
              `}
              animate={{
                scale: i === activeIndex ? 1.2 : 1,
              }}
              transition={{ duration: 0.3 }}
            />

            {/* Progress fill for current dot */}
            {i === activeIndex && (
              <motion.div
                className="absolute inset-0 rounded-full bg-amber-300 origin-left"
                style={{
                  scaleX: clampedProgress,
                  opacity: 0.5,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Scroll hint */}
      <motion.div
        className="mt-8 flex justify-center"
        animate={{ opacity: activeIndex < features.length - 1 ? 0.6 : 0 }}
      >
        <div className="flex flex-col items-center gap-2 text-stone-400">
          <span className="text-sm">Scroll to explore</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

export function Features() {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  const textInView = useInView(textRef, { once: false, amount: 0.5 })

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  // States
  const [isExploding, setIsExploding] = useState(false)
  const [showCarousel, setShowCarousel] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [direction, setDirection] = useState(0)

  const isExplodingRef = useRef(false)
  const showCarouselRef = useRef(false)
  const activeIndexRef = useRef(0)

  // Update phases and carousel index based on scroll progress
  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    let nextExploding = false
    let nextShowCarousel = false
    let nextIndex = activeIndexRef.current

    // Phase thresholds
    // 0-10%: Text visible
    // 10-22%: Explosion
    // 22-75%: Carousel (split into 4 features, ~13% each)
    // 75%+: Exit / continue to next section
    if (value < 0.10) {
      nextExploding = false
      nextShowCarousel = false
      nextIndex = 0
    } else if (value < 0.22) {
      nextExploding = true
      nextShowCarousel = false
      nextIndex = 0
    } else if (value < 0.75) {
      nextExploding = false
      nextShowCarousel = true

      // Calculate which feature to show
      // 22% to 75% = 53% scroll range for 4 features
      // Each feature gets ~13% of scroll
      const carouselProgress = (value - 0.22) / 0.53
      nextIndex = Math.min(
        features.length - 1,
        Math.floor(carouselProgress * features.length)
      )
    } else {
      // 75%+ - keep showing last feature as we scroll out
      nextExploding = false
      nextShowCarousel = true
      nextIndex = features.length - 1
    }

    if (nextExploding !== isExplodingRef.current) {
      isExplodingRef.current = nextExploding
      setIsExploding(nextExploding)
    }

    if (nextShowCarousel !== showCarouselRef.current) {
      showCarouselRef.current = nextShowCarousel
      setShowCarousel(nextShowCarousel)
    }

    if (nextIndex !== activeIndexRef.current) {
      setDirection(nextIndex > activeIndexRef.current ? 1 : -1)
      activeIndexRef.current = nextIndex
      setActiveIndex(nextIndex)
    }
  })

  const text = 'Premium Features'
  const letters = text.split('')

  return (
    <>
      {/* 
        Scroll Runway Container
        Height = 250vh for snappier carousel control
      */}
      <div
        ref={containerRef}
        className="relative bg-gradient-to-b from-[#FFFBF5] via-amber-50/20 to-[#FFFBF5] h-[210vh] sm:h-[230vh] md:h-[250vh]"
      >
        {/* Sticky Wrapper */}
        <div
          className="sticky top-0 h-screen w-full flex items-center justify-center"
          style={{ overflow: 'clip' }}
        >
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#FFFBF5] via-amber-50/20 to-[#FFFBF5]" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px]
                          bg-amber-200/30 rounded-full blur-[100px] pointer-events-none" />

          {/* TEXT PHASE */}
          <div
            ref={textRef}
            className={`
              absolute inset-0 flex flex-col items-center justify-center px-6 z-10
              transition-all duration-500 ease-out
              ${showCarousel ? 'opacity-0 pointer-events-none' : 'opacity-100'}
            `}
          >
            <div className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl tracking-tight text-center">
              {letters.map((letter, i) => (
                <AnimatedLetter
                  key={i}
                  letter={letter}
                  index={i}
                  isVisible={textInView}
                  isExploding={isExploding}
                />
              ))}
            </div>

            <motion.p
              className="mt-6 text-base sm:text-lg md:text-xl text-stone-500 text-center max-w-md"
              initial={{ opacity: 0, y: 20 }}
              animate={{
                opacity: textInView && !isExploding && !showCarousel ? 1 : 0,
                y: textInView ? 0 : 20,
              }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              Everything you need to run a modern program
            </motion.p>

            <motion.div
              className="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
              animate={{ opacity: textInView && !isExploding && !showCarousel ? 0.6 : 0 }}
              transition={{ duration: 0.4, delay: 1 }}
            >
              <span className="text-sm text-stone-400">Keep scrolling</span>
              <motion.div
                className="w-6 h-10 rounded-full border-2 border-stone-300/50 flex justify-center pt-2"
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
              </motion.div>
            </motion.div>
          </div>

          {/* CAROUSEL PHASE */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: showCarousel ? 1 : 0 }}
            transition={{ duration: 0.5 }}
            style={{ pointerEvents: showCarousel ? 'auto' : 'none' }}
          >
            <FeatureCarousel
              activeIndex={activeIndex}
              direction={direction}
              progress={scrollYProgress}
            />
          </motion.div>
        </div>
      </div>
    </>
  )
}
