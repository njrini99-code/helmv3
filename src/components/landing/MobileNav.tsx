'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { m, LazyMotion, domAnimation, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { submitDemoRequest } from '@/app/actions/demo-request'

const navLinks = [
  { name: 'Home', href: '/' },
  { name: 'About', href: '/about' },
  { name: 'Products', href: '/products' },
  { name: 'Log in', href: '/golf/login' },
]

// Smooth spring-like ease — no bounce, no jank
const smooth = [0.32, 0.72, 0, 1] as const

export function MobileNav({ isDarkBg = false }: { isDarkBg?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showDemoForm, setShowDemoForm] = useState(false)
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const emailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])

  const close = useCallback(() => setIsOpen(false), [])

  // Lock body scroll — proper iOS handling
  useEffect(() => {
    if (!isOpen) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [isOpen])

  // Reset form when menu closes
  useEffect(() => {
    if (!isOpen) {
      setShowDemoForm(false)
      setEmail('')
      setSubmitted(false)
      setError('')
    }
  }, [isOpen])

  // Auto-focus email input
  useEffect(() => {
    if (!showDemoForm) return
    const timer = setTimeout(() => emailInputRef.current?.focus(), 300)
    return () => clearTimeout(timer)
  }, [showDemoForm])

  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setIsSubmitting(true)
    setError('')
    try {
      const result = await submitDemoRequest(email.trim())
      if (result.success) {
        setSubmitted(true)
      } else {
        setError(result.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <LazyMotion features={domAnimation}>
      {/* Hamburger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`md:hidden relative z-toast w-10 h-10 flex items-center justify-center
                   rounded-xl transition-all duration-200 active:scale-90
                   ${isOpen ? 'bg-transparent' : isDarkBg ? 'bg-white/10' : 'bg-warm-900/5'}`}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        <div className="w-[18px] h-3.5 relative flex flex-col justify-center items-center">
          <span
            className={`absolute h-[1.5px] rounded-full transition-all duration-300 ease-out
              ${isOpen
                ? 'bg-warm-700 rotate-45 w-full'
                : `${isDarkBg ? 'bg-white' : 'bg-warm-800'} -translate-y-[5px] w-full`
              }`}
          />
          <span
            className={`absolute h-[1.5px] rounded-full transition-all duration-200 ease-out
              ${isOpen
                ? 'bg-warm-700 opacity-0 scale-x-0'
                : `${isDarkBg ? 'bg-white' : 'bg-warm-800'} opacity-100 w-3/4 -translate-x-[2px]`
              }`}
          />
          <span
            className={`absolute h-[1.5px] rounded-full transition-all duration-300 ease-out
              ${isOpen
                ? 'bg-warm-700 -rotate-45 w-full'
                : `${isDarkBg ? 'bg-white' : 'bg-warm-800'} translate-y-[5px] w-full`
              }`}
          />
        </div>
      </button>

      {/* Full-screen overlay — portaled to body to escape backdrop-filter containing block */}
      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            <m.div
              key="mobile-nav-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: smooth }}
              className="fixed inset-0 z-tooltip md:hidden bg-[#ECE5D6]"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {/* Gradient enhancement layer */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `
                    radial-gradient(ellipse 90% 50% at 50% 30%, rgba(21, 128, 61, 0.1), transparent),
                    linear-gradient(180deg, #F7F5F2 0%, #ECE5D6 50%, #EDE8DD 100%)
                  `,
                }}
              />
              {/* Subtle top glow */}
              <div
                className="absolute top-0 left-0 right-0 h-[40vh] pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(21, 128, 61, 0.06), transparent)',
                }}
              />

              {/* Close button */}
              <button
                onClick={close}
                className="absolute top-4 right-5 z-10 w-10 h-10 flex items-center justify-center rounded-xl
                           active:scale-90 transition-transform duration-150"
                style={{ top: 'max(env(safe-area-inset-top, 16px), 16px)' }}
                aria-label="Close menu"
              >
                <svg className="w-6 h-6 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <nav
                className="relative h-full flex flex-col px-7"
                style={{
                  paddingTop: 'calc(max(env(safe-area-inset-top, 0px), 12px) + 64px)',
                  paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)',
                }}
              >
                {/* Navigation links */}
                <div className="flex-1 flex flex-col justify-center -mt-8">
                  <m.div
                    initial="closed"
                    animate="open"
                    exit="closed"
                    variants={{
                      closed: { transition: { duration: 0.15 } },
                      open: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
                    }}
                    className="space-y-1"
                  >
                    {navLinks.map((link) => (
                      <m.div
                        key={link.name}
                        variants={{
                          closed: {
                            opacity: 0,
                            y: 20,
                            transition: { duration: 0.12 },
                          },
                          open: {
                            opacity: 1,
                            y: 0,
                            transition: { duration: 0.5, ease: smooth },
                          },
                        }}
                      >
                        <Link
                          href={link.href}
                          onClick={close}
                          className="group flex items-center justify-between py-4
                                     active:opacity-60 transition-opacity duration-100"
                        >
                          <span className="text-[28px] font-semibold tracking-tight text-warm-900">
                            {link.name}
                          </span>
                          <svg
                            className="w-5 h-5 text-warm-300 group-active:translate-x-1 transition-transform duration-150"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </m.div>
                    ))}
                  </m.div>
                </div>

                {/* Bottom CTA */}
                <m.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: smooth, delay: 0.35 }}
                  className="shrink-0 pb-4"
                >
                  <AnimatePresence mode="wait">
                    {!showDemoForm && !submitted && (
                      <m.div
                        key="cta"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}
                        className="space-y-3"
                      >
                        <button
                          onClick={() => setShowDemoForm(true)}
                          className="w-full py-4 rounded-2xl text-white font-semibold text-[15px] tracking-wide
                                     active:scale-[0.98] transition-transform duration-150"
                          style={{
                            background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)',
                          }}
                        >
                          Get Early Access
                        </button>
                        <p className="text-center text-xs text-warm-400 tracking-wide">
                          BaseballHelm & GolfHelm
                        </p>
                      </m.div>
                    )}

                    {showDemoForm && !submitted && (
                      <m.form
                        key="form"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}
                        transition={{ duration: 0.3, ease: smooth }}
                        onSubmit={handleDemoSubmit}
                        className="rounded-2xl p-5 space-y-4"
                        style={{
                          background: 'rgba(255,255,255,0.6)',
                          backdropFilter: 'blur(40px)',
                          WebkitBackdropFilter: 'blur(40px)',
                          border: '1px solid rgba(255,255,255,0.7)',
                          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                        }}
                      >
                        <div>
                          <label htmlFor="mobile-email" className="block text-[13px] font-medium text-warm-600 mb-2">
                            Email address
                          </label>
                          <input
                            ref={emailInputRef}
                            id="mobile-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            className="w-full px-4 py-3.5 rounded-xl border border-warm-200/80 bg-cream-100/82
                                     text-warm-900 placeholder:text-warm-300 text-[15px]
                                     focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600/30
                                     transition-all duration-200"
                          />
                        </div>
                        {error && (
                          <p className="text-[13px] text-red-600 font-medium">{error}</p>
                        )}
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setShowDemoForm(false)}
                            className="flex-1 py-3.5 rounded-xl border border-warm-200
                                     text-warm-500 font-medium text-[14px]
                                     active:scale-[0.98] transition-all duration-150"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmitting || !email.trim()}
                            className="flex-1 py-3.5 rounded-xl text-white font-semibold text-[14px]
                                     disabled:opacity-40 disabled:cursor-not-allowed
                                     active:scale-[0.98] transition-all duration-150"
                            style={{
                              background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)',
                            }}
                          >
                            {isSubmitting ? (
                              <span className="inline-flex items-center gap-2">
                                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
                                </svg>
                                Sending
                              </span>
                            ) : 'Submit'}
                          </button>
                        </div>
                      </m.form>
                    )}

                    {submitted && (
                      <m.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, ease: smooth }}
                        className="text-center space-y-4 py-2"
                      >
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-primary-500/10 flex items-center justify-center">
                          <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-warm-900 mb-1">You&apos;re in</h3>
                          <p className="text-sm text-warm-500">We&apos;ll reach out shortly.</p>
                        </div>
                        <button
                          onClick={close}
                          className="w-full py-3.5 rounded-xl bg-warm-100 text-warm-700
                                   font-medium text-[14px] active:scale-[0.98] transition-transform duration-150"
                        >
                          Back to Home
                        </button>
                      </m.div>
                    )}
                  </AnimatePresence>
                </m.div>

                {/* Logo at very bottom */}
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.45 }}
                  className="shrink-0 flex items-center justify-center gap-2.5 pb-2 pt-3 border-t border-warm-200/50"
                >
                  <Image
                    src="/Helm-Logo-New-Main.png"
                    alt="Helm"
                    width={24}
                    height={24}
                    className="w-6 h-6 object-contain opacity-40"
                  />
                  <span className="text-xs text-warm-400 tracking-wide">Helm Sports Labs</span>
                </m.div>
              </nav>
            </m.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </LazyMotion>
  )
}
