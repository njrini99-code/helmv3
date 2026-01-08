'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import { Navigation } from './Navigation'

// Email capture form
function EmailCapture() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email) {
      // TODO: Integrate with email service
      setSubmitted(true)
    }
  }

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 text-center"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 text-emerald-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>You&apos;re on the list!</span>
        </div>
        <p className="text-white/40 text-sm mt-3">
          We&apos;ll notify you as soon as we launch.
        </p>
      </motion.div>
    )
  }

  return (
    <div className="mt-8 text-center">
      <p className="text-white/60 text-base sm:text-lg mb-4">
        Be first to know when we launch
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          required
          className="flex-1 px-5 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
        />
        <button
          type="submit"
          className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors whitespace-nowrap"
        >
          Notify Me
        </button>
      </form>
    </div>
  )
}

export function Hero({ useVideoBackground = false }: { useVideoBackground?: boolean }) {
  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])

  const containerRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start']
  })

  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const showStaticBackground = !useVideoBackground

  return (
    <section
      ref={containerRef}
      className={`relative min-h-[100svh] md:min-h-screen overflow-hidden ${showStaticBackground ? 'bg-stone-950' : 'bg-transparent'}`}
    >
      {showStaticBackground && (
        <>
          {/* Background image - z-0 */}
          <div className="absolute inset-0 z-0">
            <Image
              src="/stadium-lights-hero.avif"
              alt="Stadium atmosphere"
              fill
              className="object-cover"
              priority
            />
          </div>

          {/* Background gradient overlay for depth - z-2 */}
          <div
            className="absolute inset-0 z-[2]"
            style={{
              background: `
                linear-gradient(
                  110deg,
                  rgba(0,0,0,0.7) 0%,
                  rgba(0,0,0,0.5) 40%,
                  rgba(0,0,0,0.3) 70%,
                  rgba(0,0,0,0.2) 100%
                )
              `,
            }}
          />

          {/* Light rays from stadium lights - z-5 */}
          <div className="absolute inset-0 pointer-events-none z-[5]">
            {/* Main light cone */}
            <div
              className="absolute inset-0"
              style={{
                background: `
                  conic-gradient(
                    from -80deg at 92% 12%,
                    transparent 0deg,
                    rgba(255, 250, 220, 0.12) 15deg,
                    rgba(255, 245, 200, 0.08) 35deg,
                    rgba(255, 240, 180, 0.04) 55deg,
                    transparent 75deg
                  )
                `,
              }}
            />

            {/* Secondary softer wash */}
            <div
              className="absolute inset-0"
              style={{
                background: `
                  radial-gradient(
                    ellipse 100% 80% at 80% 20%,
                    rgba(255, 250, 230, 0.08) 0%,
                    rgba(255, 245, 210, 0.04) 30%,
                    transparent 60%
                  )
                `,
              }}
            />
          </div>
        </>
      )}


      {/* Navigation - z-30 */}
      <div className="relative z-30">
        <Navigation />
      </div>

      {/* Main Content - z-20 */}
      <div className="relative z-20 flex items-center justify-center min-h-[calc(100svh-80px)] md:min-h-[calc(100vh-80px)] px-4 sm:px-6 py-10 md:py-12">
        <motion.div
          style={{ opacity }}
          initial={isClient ? { opacity: 0, y: 40, scale: 0.95 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Premium Glass Card with warm edge from light */}
          <div
            className="relative backdrop-blur-2xl rounded-3xl p-6 sm:p-8 md:p-12 lg:p-16 max-w-2xl mx-auto"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
              border: '1px solid rgba(255,255,255,0.05)',
              boxShadow: `
                4px 0 30px rgba(255,245,200,0.03),
                0 0 80px rgba(255,250,220,0.03),
                0 25px 50px -12px rgba(0,0,0,0.5),
                inset 1px 0 0 rgba(255,250,220,0.05),
                inset 0 1px 1px rgba(255,255,255,0.05)
              `,
            }}
          >
            {/* Inner shine effect */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/[0.03] via-transparent to-transparent pointer-events-none" />

            {/* Content */}
            <div className="relative z-10">
              {/* Main headline - BIG and dominant */}
              <motion.h1
                initial={isClient ? { opacity: 0, y: 20 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-white text-center leading-tight"
              >
                Where great teams
                <br />
                <span className="text-emerald-400">are built.</span>
              </motion.h1>

              {/* Subhead - smaller, muted */}
              <motion.p
                initial={isClient ? { opacity: 0, y: 20 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="mt-5 text-base sm:text-lg md:text-xl text-white/60 text-center max-w-lg mx-auto"
              >
                The command center for college sports. Recruiting, roster management, and athlete development—unified.
              </motion.p>

              {/* Email Capture */}
              <motion.div
                initial={isClient ? { opacity: 0, y: 20 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
              >
                <EmailCapture />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-6 h-10 rounded-full border-2 border-white/30 flex items-start justify-center p-2"
        >
          <div className="w-1.5 h-3 rounded-full bg-white/40" />
        </motion.div>
      </motion.div>
    </section>
  )
}
