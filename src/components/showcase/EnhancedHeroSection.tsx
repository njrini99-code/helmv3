'use client'

import { useRef, useState, useEffect } from 'react'
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Sparkles, Flag, Target } from 'lucide-react'
import { NeuralNetwork } from './NeuralNetwork'

// Typewriter Effect Hook
function useTypewriter(text: string, speed = 30, delay = 0) {
  const [displayText, setDisplayText] = useState('')
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    let timeout: NodeJS.Timeout
    let currentIndex = 0

    const startTyping = () => {
      if (currentIndex < text.length) {
        setDisplayText(text.slice(0, currentIndex + 1))
        currentIndex++
        timeout = setTimeout(startTyping, speed)
      } else {
        setIsComplete(true)
      }
    }

    const initialDelay = setTimeout(startTyping, delay)

    return () => {
      clearTimeout(timeout)
      clearTimeout(initialDelay)
    }
  }, [text, speed, delay])

  return { displayText, isComplete }
}

// 3D Tilt Hook
function use3DTilt(maxTilt = 10) {
  const ref = useRef<HTMLDivElement>(null)
  const [rotateX, setRotateX] = useState(0)
  const [rotateY, setRotateY] = useState(0)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    setRotateY(((e.clientX - centerX) / (rect.width / 2)) * maxTilt)
    setRotateX(-((e.clientY - centerY) / (rect.height / 2)) * maxTilt)
  }

  const handleMouseLeave = () => {
    setRotateX(0)
    setRotateY(0)
  }

  const springRotateX = useSpring(rotateX, { stiffness: 400, damping: 30 })
  const springRotateY = useSpring(rotateY, { stiffness: 400, damping: 30 })

  return { ref, springRotateX, springRotateY, handleMouseMove, handleMouseLeave }
}

// Product Toggle Component
function ProductToggle({ 
  activeProduct, 
  setActiveProduct 
}: { 
  activeProduct: 'golf' | 'baseball'
  setActiveProduct: (p: 'golf' | 'baseball') => void 
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2 }}
      className="inline-flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl"
    >
      <button
        onClick={() => setActiveProduct('golf')}
        className={`relative px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 ${
          activeProduct === 'golf' ? 'text-white' : 'text-white/50 hover:text-white/70'
        }`}
      >
        {activeProduct === 'golf' && (
          <motion.div
            layoutId="productToggle"
            className="absolute inset-0 rounded-lg bg-gradient-to-r from-helm-green-500/30 to-emerald-500/30 border border-helm-green-500/30"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <span className="relative flex items-center gap-2">
          <Flag className="w-4 h-4" />
          GolfHelm
        </span>
      </button>
      <button
        onClick={() => setActiveProduct('baseball')}
        className={`relative px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 ${
          activeProduct === 'baseball' ? 'text-white' : 'text-white/50 hover:text-white/70'
        }`}
      >
        {activeProduct === 'baseball' && (
          <motion.div
            layoutId="productToggle"
            className="absolute inset-0 rounded-lg bg-gradient-to-r from-helm-amber-500/30 to-orange-500/30 border border-helm-amber-500/30"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <span className="relative flex items-center gap-2">
          <Target className="w-4 h-4" />
          BaseballHelm
        </span>
      </button>
    </motion.div>
  )
}

// Product Hero Card
function ProductHeroCard({ 
  product, 
  title, 
  description, 
  href,
  isActive
}: { 
  product: 'golf' | 'baseball'
  title: string
  description: string
  href: string
  isActive: boolean
}) {
  const { ref, springRotateX, springRotateY, handleMouseMove, handleMouseLeave } = use3DTilt(15)
  const isGolf = product === 'golf'

  return (
    <Link href={href} className="w-full">
      <motion.div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ 
          rotateX: springRotateX, 
          rotateY: springRotateY, 
          transformStyle: 'preserve-3d' 
        }}
        animate={{ 
          scale: isActive ? 1.05 : 0.95,
          opacity: isActive ? 1 : 0.5
        }}
        whileHover={{ scale: isActive ? 1.08 : 1 }}
        whileTap={{ scale: 0.98 }}
        className={`
          relative group w-full px-6 py-5 sm:px-8 sm:py-7 rounded-2xl cursor-pointer
          backdrop-blur-xl border transition-all duration-500
          bg-white/[0.04] border-white/[0.08]
          ${isGolf 
            ? 'hover:bg-helm-green-500/10 hover:border-helm-green-500/30 hover:shadow-[0_0_80px_rgba(16,185,129,0.2)]' 
            : 'hover:bg-helm-amber-500/10 hover:border-helm-amber-500/30 hover:shadow-[0_0_80px_rgba(245,158,11,0.2)]'
          }
        `}
      >
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.08] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        <div className="relative flex items-center gap-5" style={{ transform: 'translateZ(30px)' }}>
          <Image 
            src={isGolf ? '/helm-golf-logo.png' : '/helm-baseball-logo.png'} 
            alt={title} 
            width={56} 
            height={56} 
            className="w-12 h-12 sm:w-14 sm:h-14 drop-shadow-lg" 
          />
          <div>
            <div className="font-semibold text-white text-xl mb-1">{title}</div>
            <div className="text-sm text-white/40">{description}</div>
          </div>
          <ArrowRight className={`w-5 h-5 ml-4 transition-all duration-300 group-hover:translate-x-2 ${isGolf ? 'text-helm-green-400' : 'text-helm-amber-400'}`} />
        </div>
      </motion.div>
    </Link>
  )
}

// Character Stagger Animation
function StaggeredText({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <span className="inline-block">
      {text.split('').map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, rotateX: 90, scale: 0 }}
          animate={{ opacity: 1, rotateX: 0, scale: 1 }}
          transition={{ 
            delay: delay + i * 0.03,
            type: 'spring',
            stiffness: 200,
            damping: 15
          }}
          className="inline-block"
          style={{ transformOrigin: 'bottom' }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </span>
  )
}

export function EnhancedHeroSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeProduct, setActiveProduct] = useState<'golf' | 'baseball'>('golf')
  
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end start'] })
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95])
  const y = useTransform(scrollYProgress, [0, 0.5], [0, 100])

  // Typewriter effect for subheadline
  const { displayText: typewriterText, isComplete } = useTypewriter(
    'AI-powered team management.',
    30,
    1500
  )

  return (
    <section ref={containerRef} className="relative min-h-[100svh] md:min-h-screen overflow-hidden bg-gradient-to-b from-[#0a0a0a] via-stone-950 to-stone-950">
      {/* Neural Network Background */}
      <NeuralNetwork />
      
      {/* Gradient Orbs - Color changes based on active product */}
      <motion.div 
        animate={{ 
          background: activeProduct === 'golf' 
            ? 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)'
        }}
        transition={{ duration: 1 }}
        className="absolute top-0 left-1/4 w-[800px] h-[800px] blur-[150px]"
      />
      <motion.div 
        animate={{ 
          background: activeProduct === 'golf' 
            ? 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 70%)'
        }}
        transition={{ duration: 1 }}
        className="absolute bottom-0 right-1/4 w-[600px] h-[600px] blur-[120px]"
      />
      
      {/* Grid Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Hero Content */}
      <motion.div style={{ opacity, scale, y }} className="relative z-10 flex flex-col items-center justify-center min-h-[100svh] md:min-h-screen px-4 sm:px-6 pt-20 sm:pt-24">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full bg-white/[0.06] border border-white/[0.1] backdrop-blur-xl mb-8 sm:mb-10"
        >
          <Sparkles className="w-4 h-4 text-helm-green-400" />
          <span className="text-xs sm:text-sm font-medium text-white/80 tracking-wide">The Command Center for Championship Programs</span>
        </motion.div>

        {/* Main Headline - Line 1 with blur transition */}
        <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold text-center mb-6 leading-[0.95]">
          <motion.span
            initial={{ opacity: 0, y: 50, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="inline-block text-white"
          >
            The Operating System
          </motion.span>
          <br />
          {/* Line 2 with character stagger */}
          <span className={`inline-block text-transparent bg-clip-text bg-gradient-to-r ${
            activeProduct === 'golf' 
              ? 'from-helm-green-400 via-emerald-400 to-helm-green-500'
              : 'from-helm-amber-400 via-orange-400 to-helm-amber-500'
          } transition-all duration-500`}>
            <StaggeredText text="for Championship Programs" delay={0.5} />
          </span>
        </h1>

        {/* Subheadline with Typewriter effect */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="text-base sm:text-lg md:text-2xl text-center max-w-2xl mb-8 leading-relaxed h-[4.5rem] sm:h-16"
        >
          <span className="text-helm-green-400/80">{typewriterText}</span>
          <span className="animate-pulse">|</span>
          <AnimatePresence>
            {isComplete && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-white/50"
              >
                {' '}
                <span className="text-helm-amber-400/80">Intelligent recruiting</span> for baseball.
              </motion.span>
            )}
          </AnimatePresence>
          <br />
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: isComplete ? 1 : 0 }}
            transition={{ delay: 0.5 }}
            className="text-white/50"
          >
            Built by coaches, for coaches.
          </motion.span>
        </motion.div>

        {/* Product Toggle */}
        <ProductToggle activeProduct={activeProduct} setActiveProduct={setActiveProduct} />

        {/* Product Cards */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col md:flex-row gap-4 sm:gap-6 mt-8 sm:mt-10"
        >
          <ProductHeroCard 
            product="golf" 
            title="GolfHelm" 
            description="AI-Powered Team Management" 
            href="#golfhelm"
            isActive={activeProduct === 'golf'}
          />
          <ProductHeroCard 
            product="baseball" 
            title="BaseballHelm" 
            description="Intelligent Recruiting CRM" 
            href="#baseballhelm"
            isActive={activeProduct === 'baseball'}
          />
        </motion.div>

        {/* Decorative Line */}
        <motion.div 
          initial={{ scaleX: 0 }} 
          animate={{ scaleX: 1 }} 
          transition={{ duration: 1.2, delay: 1.8, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12 h-px w-72 bg-gradient-to-r from-transparent via-white/20 to-transparent origin-center" 
        />
        
        {/* Scroll Indicator */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 2.2 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <motion.div 
            animate={{ y: [0, 10, 0] }} 
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="w-6 h-11 rounded-full border-2 border-white/20 flex items-start justify-center p-2"
          >
            <motion.div 
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-1.5 h-3 rounded-full bg-white/50" 
            />
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  )
}
