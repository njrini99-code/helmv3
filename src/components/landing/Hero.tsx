'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'

export function Hero() {
  // Fallback: ensure content is visible even if framer-motion fails
  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])
  const containerRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start']
  })

  // Parallax effect for dashboard preview
  const y = useTransform(scrollYProgress, [0, 1], [0, 100])
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const rotateX = useTransform(scrollYProgress, [0, 1], [0, -5])

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex items-center overflow-hidden"
    >
      {/* Golden Hour Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-golden-100 via-orange-50 to-warm-cream" />

      {/* Atmospheric gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-golden-300/30 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-[500px] h-[500px] bg-orange-200/40 rounded-full blur-3xl" />

      {/* Subtle noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-32 grid lg:grid-cols-2 gap-16 items-center">
        {/* Left: Content */}
        <div>
          {/* Headline - visible immediately, animates if framer-motion works */}
          <motion.h1
            initial={isClient ? { opacity: 0, y: 30 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="font-serif text-5xl md:text-6xl lg:text-7xl text-warm-900 leading-[1.1] mb-6"
            style={{ opacity: 1 }} // CSS fallback
          >
            Where great teams{' '}
            <span className="text-golden-600">are built.</span>
          </motion.h1>

          {/* Subhead */}
          <motion.p
            initial={isClient ? { opacity: 0, y: 30 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="text-xl text-warm-600 max-w-lg mb-10 leading-relaxed"
            style={{ opacity: 1 }} // CSS fallback
          >
            A clean command center for college staffs: recruiting pipelines,
            roster planning, and athlete development.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={isClient ? { opacity: 0, y: 30 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-wrap gap-4"
            style={{ opacity: 1 }} // CSS fallback
          >
            <Link
              href="/baseball/(auth)/coach-onboarding"
              className="group px-8 py-4 rounded-2xl bg-warm-900 text-white font-medium
                         hover:bg-warm-800 transition-all duration-200
                         shadow-lg hover:shadow-xl active:scale-[0.98]
                         flex items-center gap-2"
            >
              Book a demo
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>

            <Link
              href="/baseball/signup"
              className="px-8 py-4 rounded-2xl border-2 border-warm-300 text-warm-700 font-medium
                         hover:bg-warm-100 hover:border-warm-400 transition-all duration-200
                         flex items-center gap-2"
            >
              Explore products
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Link>
          </motion.div>

          {/* Trust badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="flex flex-wrap gap-6 mt-12 text-sm text-warm-500"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-field" />
              NCAA compliant
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-golden-500" />
              Fast onboarding
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-fairway" />
              D1, D2, D3 programs
            </div>
          </motion.div>
        </div>

        {/* Right: Dashboard Preview */}
        <motion.div
          style={{ y, opacity, rotateX }}
          initial={{ opacity: 0, x: 50, rotateY: -10 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative hidden lg:block"
        >
          {/* Animated glow behind dashboard */}
          <motion.div
            animate={{
              scale: [1, 1.05, 1],
              opacity: [0.4, 0.6, 0.4],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute -inset-4 bg-gradient-to-br from-golden-400/30 to-orange-300/30 rounded-3xl blur-2xl"
          />

          {/* Dashboard mockup */}
          <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/20
                          bg-gradient-to-br from-warm-900 to-warm-800 backdrop-blur-sm">
            {/* Browser chrome */}
            <div className="bg-warm-800 px-4 py-3 flex items-center gap-2 border-b border-white/10">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-warm-700 rounded-lg px-4 py-1.5 text-sm text-warm-400 text-center max-w-md mx-auto">
                  app.helmsportslabs.com
                </div>
              </div>
            </div>

            {/* Dashboard content mockup */}
            <div className="p-8 space-y-6 min-h-[400px]">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="h-8 w-48 bg-white/10 rounded-lg mb-2" />
                  <div className="h-4 w-32 bg-white/5 rounded" />
                </div>
                <div className="h-10 w-32 bg-golden-600/30 rounded-lg" />
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="h-4 w-20 bg-white/20 rounded mb-3" />
                    <div className="h-8 w-16 bg-white/30 rounded" />
                  </div>
                ))}
              </div>

              {/* Chart placeholder */}
              <div className="h-48 rounded-2xl bg-white/5 border border-white/10 p-4 flex items-end gap-2">
                {[40, 65, 45, 80, 55, 75, 60].map((height, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-golden-500/30 to-golden-400/50 rounded-t"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Floating stat card with animation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1 }}
            whileHover={{ scale: 1.05 }}
            className="absolute -bottom-6 -left-6 px-5 py-4 rounded-2xl
                       bg-white shadow-xl border border-stone-100"
          >
            <div className="text-xs text-warm-500 mb-1">Pipeline Growth</div>
            <div className="text-2xl font-semibold text-warm-900">+24%</div>
            <div className="text-xs text-field">↑ this month</div>
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-6 h-10 rounded-full border-2 border-warm-400 flex items-start justify-center p-2"
        >
          <div className="w-1.5 h-3 rounded-full bg-warm-400" />
        </motion.div>
      </motion.div>
    </section>
  )
}
