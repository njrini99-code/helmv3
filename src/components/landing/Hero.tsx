'use client'

import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import { Navigation } from './Navigation'
import { submitDemoRequest } from '@/app/actions/demo-request'

// Email capture form
function EmailCapture() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    setError('')

    const result = await submitDemoRequest(email)

    if (result.success) {
      setSubmitted(true)
    } else {
      setError(result.error || 'Something went wrong. Please try again.')
    }

    setLoading(false)
  }

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 text-center"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-green-500/20 text-helm-green-400">
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
          disabled={loading}
          className="flex-1 px-5 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:border-helm-green-500/50 focus:ring-2 focus:ring-helm-green-500/20 transition-all disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 rounded-xl bg-helm-green-600 hover:bg-helm-green-500 text-white font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Sending...
            </span>
          ) : (
            'Notify Me'
          )}
        </button>
      </form>

      {error && (
        <p className="text-red-400 text-sm mt-3">{error}</p>
      )}
    </div>
  )
}

export function Hero({ useVideoBackground = false }: { useVideoBackground?: boolean }) {
  const [isClient, setIsClient] = useState(false)
  const shouldReduceMotion = useReducedMotion()
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
          initial={shouldReduceMotion ? false : isClient ? { opacity: 0, y: 24, scale: 0.97 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
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
                initial={shouldReduceMotion ? false : isClient ? { opacity: 0, y: 16 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-white text-center leading-tight"
              >
                Where great teams
                <br />
                <span className="text-helm-green-400">are built.</span>
              </motion.h1>

              {/* Subhead - smaller, muted */}
              <motion.p
                initial={shouldReduceMotion ? false : isClient ? { opacity: 0, y: 16 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                className="mt-5 text-base sm:text-lg md:text-xl text-white/60 text-center max-w-lg mx-auto"
              >
                The command center for college sports. Recruiting, roster management, and athlete development—unified.
              </motion.p>

              {/* Email Capture */}
              <motion.div
                initial={shouldReduceMotion ? false : isClient ? { opacity: 0, y: 16 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
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
        transition={{ delay: 0.7 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
      >
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
          className="w-6 h-10 rounded-full border-2 border-white/30 flex items-start justify-center p-2"
        >
          <div className="w-1.5 h-3 rounded-full bg-white/40" />
        </motion.div>
      </motion.div>
    </section>
  )
}
