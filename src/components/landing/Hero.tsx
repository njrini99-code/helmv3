'use client'

import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Navigation } from './Navigation'
import { submitDemoRequest } from '@/app/actions/demo-request'

// Email capture — dark theme
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
      >
        <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-primary-600/10 border border-primary-600/20">
          <svg className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-primary-500 text-sm font-medium">You&apos;re on the list</span>
        </div>
        <p className="text-white/25 text-sm mt-3">
          We&apos;ll notify you as soon as we launch.
        </p>
      </motion.div>
    )
  }

  return (
    <div
      className="rounded-2xl border border-white/[0.15] p-5 sm:p-6"
      style={{
        background: 'rgba(255,255,255,0.07)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <p className="text-white/80 text-sm font-medium mb-3">Request a demo — see Helm in action</p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="coach@university.edu"
          required
          disabled={loading}
          className="px-5 py-3.5 rounded-xl bg-white/[0.1] border border-white/[0.18] text-white placeholder:text-white/40 focus:outline-none focus:border-primary-500/50 focus:bg-white/[0.14] focus:ring-1 focus:ring-primary-500/20 transition-all disabled:opacity-50 text-sm w-full sm:w-72"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-7 py-3.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-semibold text-sm transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0"
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
            'Request Demo'
          )}
        </button>
      </form>

      {error && (
        <p className="text-red-400 text-sm mt-3">{error}</p>
      )}
    </div>
  )
}

export function Hero() {
  const [enableParallax, setEnableParallax] = useState(false)
  const shouldReduceMotion = useReducedMotion()

  const containerRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start']
  })

  useEffect(() => {
    if (shouldReduceMotion) {
      setEnableParallax(false)
      return
    }
    setEnableParallax(!window.matchMedia('(pointer: coarse)').matches)
  }, [shouldReduceMotion])

  const textY = useTransform(scrollYProgress, [0, 1], [0, enableParallax ? -60 : 0])
  const mockupY = useTransform(scrollYProgress, [0, 1], [0, enableParallax ? 40 : 0])
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, enableParallax ? 0 : 1])

  return (
    <section
      ref={containerRef}
      className="relative min-h-[100svh] min-h-[-webkit-fill-available] md:min-h-screen overflow-hidden bg-stone-950"
    >
      {/* Background image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/hero-golf.jpg"
          alt=""
          fill
          className="object-cover"
          priority
          fetchPriority="high"
          quality={72}
          sizes="100vw"
        />
      </div>

      {/* Overlay — narrow left-side gradient for text readability only */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background: `
            linear-gradient(
              to right,
              rgba(0,0,0,0.7) 0%,
              rgba(0,0,0,0.4) 30%,
              transparent 50%
            )
          `,
        }}
      />
      {/* Mobile overlay — light, just enough for text readability */}
      <div
        className="absolute inset-0 z-[1] lg:hidden"
        style={{
          background: `
            linear-gradient(
              to bottom,
              rgba(0,0,0,0.3) 0%,
              rgba(0,0,0,0.1) 50%,
              transparent 100%
            )
          `,
        }}
      />

      {/* Navigation — renders over the hero image, scrolls away */}
      <div className="relative z-30">
        <Navigation />
      </div>

      {/* Main Content */}
      <motion.div
        style={{ opacity }}
        className="relative z-20 max-w-[90rem] mx-auto px-6 lg:px-14 xl:px-20"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 items-center min-h-[calc(100svh-64px)] min-h-[calc(-webkit-fill-available-64px)] md:min-h-[calc(100vh-64px)] gap-0 lg:gap-4">

          {/* ─── Left: Typography + CTA ─── */}
          <motion.div
            style={{ y: textY }}
            className="pt-10 sm:pt-16 lg:pt-0 pb-8 lg:pb-0"
          >
            {/* Eyebrow */}
            <div
              className="flex items-center gap-4 mb-5 lg:mb-8"
            >
              <div className="w-8 h-px bg-primary-600/70" />
              <span className="text-primary-500/70 tracking-[0.25em] uppercase text-[11px] font-medium">
                College Golf Intelligence
              </span>
            </div>

            {/* Headline */}
            <h1
              className="font-serif text-[clamp(2.75rem,5.5vw,5.5rem)] text-white leading-[0.93] tracking-tightest"
            >
              Command
              <br />
              <span className="italic text-primary-500">every angle</span>
              <br />
              of your program
            </h1>

            {/* Subtitle */}
            <p
              className="text-white text-[15px] lg:text-lg mt-5 lg:mt-7 max-w-md leading-relaxed"
            >
              The platform built for college golf coaches who demand
              clarity, precision, and a competitive edge.
            </p>

            {/* Email CTA */}
            <div
              className="mt-7 lg:mt-10"
            >
              <EmailCapture />
            </div>

            {/* Explore GolfHelm pill */}
            <div
              className="mt-7 lg:mt-10"
            >
              <Link href="/products#golfhelm" className="group inline-flex">
                <div
                  className="flex items-center gap-3 px-5 py-3 rounded-full border border-white/[0.1] hover:border-white/[0.18] transition-all duration-200 group-hover:scale-[1.02] group-active:scale-[0.98]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                  }}
                >
                  <Image
                    src="/anim/helm-golf-icon.png"
                    alt=""
                    width={28}
                    height={28}
                    className="w-7 h-7 object-contain"
                  />
                  <span className="text-white/70 text-sm font-medium tracking-tight group-hover:text-white/90 transition-colors">
                    Explore GolfHelm
                  </span>
                  <svg className="w-4 h-4 text-white/30 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            </div>
          </motion.div>

          {/* ─── Right: Dashboard in premium browser frame ─── */}
          <motion.div
            style={{ y: mockupY }}
            className="relative pb-16 lg:pb-0 hidden lg:block"
          >
            <div className="lg:-mr-[25%]">
              {/* Browser frame — desktop only */}
              <div
                className="relative z-10 rounded-2xl overflow-hidden max-h-[70vh] border border-white/[0.08]"
              >
                {/* Title bar — dark chrome */}
                <div className="bg-[#161616] px-4 py-3 flex items-center border-b border-white/[0.04]">
                  {/* Traffic lights */}
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.2)]" />
                    <div className="w-3 h-3 rounded-full bg-[#febc2e] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.2)]" />
                    <div className="w-3 h-3 rounded-full bg-[#28c840] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.2)]" />
                  </div>

                  {/* Tabs area */}
                  <div className="flex items-center gap-1 ml-6">
                    {/* Active tab */}
                    <div className="flex items-center gap-2 bg-[#252525] rounded-lg px-3.5 py-1.5 border border-white/[0.04]">
                      <Image
                        src="/Helm-Logo-New-Main.png"
                        alt=""
                        width={14}
                        height={14}
                        className="w-3.5 h-3.5 object-contain"
                      />
                      <span className="text-[11px] text-white/60 font-medium">Dashboard | GolfHelm</span>
                      <span className="text-white/20 text-[10px] ml-1">&#x2715;</span>
                    </div>
                    {/* New tab button */}
                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-white/15 hover:bg-white/[0.04] text-xs">+</div>
                  </div>
                </div>

                {/* URL bar */}
                <div className="bg-[#161616] px-4 py-2 flex items-center gap-3 border-b border-white/[0.04]">
                  {/* Nav arrows */}
                  <div className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    <svg className="w-3.5 h-3.5 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {/* Address bar */}
                  <div className="flex-1 bg-[#0e0e0e] rounded-lg px-3.5 py-1.5 flex items-center gap-2 border border-white/[0.04]">
                    <svg className="w-3 h-3 text-primary-600/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-[11px] text-white/30 tracking-wide">helmsportslabs.com/golf/dashboard</span>
                  </div>
                  {/* Action icons */}
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <svg className="w-3.5 h-3.5 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </div>
                </div>

                {/* Dashboard screenshot */}
                <Image
                  src="/dashboard-screenshot.jpg"
                  alt="GolfHelm Dashboard"
                  width={2880}
                  height={1621}
                  className="w-full h-auto block"
                  fetchPriority="low"
                  loading="eager"
                  quality={95}
                />
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        style={{ opacity }}
        className="absolute bottom-8 pb-safe left-1/2 -translate-x-1/2 z-20 hidden md:flex flex-col items-center gap-2 transition-opacity duration-700 ease-out"
      >
        <span className="text-white/15 text-[10px] tracking-[0.3em] uppercase font-medium">
          Scroll
        </span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="w-px h-8 bg-gradient-to-b from-white/15 to-transparent"
        />
      </motion.div>
    </section>
  )
}
