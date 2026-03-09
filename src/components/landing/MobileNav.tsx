'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { submitDemoRequest } from '@/app/actions/demo-request'

interface MobileNavProps {
  isProductsPage?: boolean
}

const navLinks = [
  { name: 'Home', href: '/', tag: '01' },
  { name: 'About', href: '/about', tag: '02' },
  { name: 'Products', href: '/products', tag: '03' },
  { name: 'Log in', href: '/golf/login', tag: '04' },
]

// Snappy expo curve — fast in, clean settle
const expo = [0.16, 1, 0.3, 1] as const

// Panel: fast slide, no wobble
const panelVariants = {
  closed: {
    x: '100%',
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] as const },
  },
  open: {
    x: 0,
    transition: { duration: 0.35, ease: expo },
  },
}

// Backdrop fade — instant on, delayed off
const backdropVariants = {
  closed: {
    opacity: 0,
    transition: { duration: 0.15, delay: 0.05 },
  },
  open: {
    opacity: 1,
    transition: { duration: 0.15 },
  },
}

// Staggered nav links — tight timing
const linkContainerVariants = {
  closed: {
    transition: { duration: 0.08 },
  },
  open: {
    transition: { staggerChildren: 0.04, delayChildren: 0.12 },
  },
}

const linkVariants = {
  closed: {
    opacity: 0,
    y: 12,
    filter: 'blur(4px)',
    transition: { duration: 0.08 },
  },
  open: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.35, ease: expo },
  },
}

// CTA section entrance
const ctaVariants = {
  closed: {
    opacity: 0,
    y: 8,
    transition: { duration: 0.08 },
  },
  open: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: expo, delay: 0.3 },
  },
}

export function MobileNav({ isProductsPage = false }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showDemoForm, setShowDemoForm] = useState(false)
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  // Lock body scroll when menu is open — proper iOS handling
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

  // Reset form state when menu closes
  useEffect(() => {
    if (!isOpen) {
      setShowDemoForm(false)
      setEmail('')
      setSubmitted(false)
      setError('')
    }
  }, [isOpen])

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

  const emailInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!showDemoForm) return
    const timer = setTimeout(() => emailInputRef.current?.focus(), 250)
    return () => clearTimeout(timer)
  }, [showDemoForm])

  const handleBackToHome = () => {
    setIsOpen(false)
  }

  return (
    <>
      {/* Hamburger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`md:hidden relative z-50 w-11 h-11 flex items-center justify-center
                   rounded-xl transition-[background-color,box-shadow] duration-150 active:scale-90
                   ${isOpen
                     ? 'bg-transparent'
                     : isProductsPage
                       ? 'bg-warm-900/5 backdrop-blur-sm'
                       : 'bg-white/10 backdrop-blur-sm'
                   }`}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        <div className="w-[18px] h-3.5 relative flex flex-col justify-center items-center">
          <span
            className={`absolute h-[1.5px] rounded-full transition-[color,transform] duration-200 ease-out
              ${isOpen ? 'bg-warm-500 rotate-45 w-full' : isProductsPage ? 'bg-warm-800 -translate-y-[5px] w-full' : 'bg-white -translate-y-[5px] w-full'}`}
          />
          <span
            className={`absolute h-[1.5px] rounded-full transition-[color,opacity,transform] duration-150 ease-out
              ${isOpen ? 'bg-warm-500 opacity-0 scale-x-0' : isProductsPage ? 'bg-warm-800 opacity-100 w-3/4 -translate-x-[2px]' : 'bg-white opacity-100 w-3/4 -translate-x-[2px]'}`}
          />
          <span
            className={`absolute h-[1.5px] rounded-full transition-[color,transform] duration-200 ease-out
              ${isOpen ? 'bg-warm-500 -rotate-45 w-full' : isProductsPage ? 'bg-warm-800 translate-y-[5px] w-full' : 'bg-white translate-y-[5px] w-full'}`}
          />
        </div>
      </button>

      {/* Slide panel overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="mobile-nav-backdrop"
            initial="closed"
            animate="open"
            exit="closed"
            variants={backdropVariants}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="mobile-nav-panel"
            initial="closed"
            animate="open"
            exit="closed"
            variants={panelVariants}
            className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-[340px] bg-[#FAFAF9] shadow-[-8px_0_40px_rgba(0,0,0,0.08)]"
            style={{ willChange: 'transform' }}
          >
              {/* Subtle left edge line */}
              <div className="absolute top-0 left-0 bottom-0 w-px bg-warm-200/60" />

              <nav
                className="relative h-full flex flex-col px-6 overflow-y-auto overscroll-contain"
                style={{
                  paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                  paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {/* Top bar: logo + close */}
                <div className="flex items-center justify-between py-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <Image
                      src="/Helm-Logo-New-Main.png"
                      alt="Helm"
                      width={28}
                      height={28}
                      className="w-7 h-7 object-contain"
                    />
                    <span className="text-warm-900 font-semibold text-sm tracking-tight uppercase">
                      Helm
                    </span>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full
                               hover:bg-warm-100 active:bg-warm-200/70
                               transition-colors duration-100"
                    aria-label="Close menu"
                  >
                    <svg className="w-[18px] h-[18px] text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Navigation Links — staggered entrance */}
                <motion.div
                  className="flex-1 pt-6"
                  variants={linkContainerVariants}
                  initial="closed"
                  animate="open"
                  exit="closed"
                >
                  <div className="space-y-0">
                    {navLinks.map((link) => (
                      <motion.div key={link.name} variants={linkVariants}>
                        <Link
                          href={link.href}
                          onClick={() => setIsOpen(false)}
                          className="group flex items-center gap-5 py-5 border-b border-warm-100/80
                                     active:opacity-60 transition-opacity duration-75"
                        >
                          <span className="text-[10px] font-mono text-warm-300/80 tabular-nums select-none mt-1">
                            {link.tag}
                          </span>
                          <span className="flex-1 font-serif text-[22px] text-warm-800 tracking-[-0.01em]">
                            {link.name}
                          </span>
                          <svg
                            className="w-4 h-4 text-warm-200 group-active:translate-x-1 transition-transform duration-100"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16m-6-6 6 6-6 6" />
                          </svg>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                {/* CTA Section */}
                <motion.div
                  className="pt-8 pb-2 shrink-0"
                  variants={ctaVariants}
                  initial="closed"
                  animate="open"
                  exit="closed"
                >
                  <AnimatePresence mode="wait">
                    {!showDemoForm && !submitted && (
                      <motion.div
                        key="cta-button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.1 } }}
                        transition={{ duration: 0.15 }}
                        className="space-y-3"
                      >
                        <button
                          onClick={() => setShowDemoForm(true)}
                          className="w-full py-3.5 rounded-xl bg-warm-900 text-white text-center
                                     font-medium text-sm tracking-wide uppercase
                                     active:scale-[0.97] transition-transform duration-100"
                        >
                          Book a Demo
                        </button>
                        <p className="text-center text-xs text-warm-400">
                          BaseballHelm & GolfHelm early access
                        </p>
                      </motion.div>
                    )}

                    {showDemoForm && !submitted && (
                      <motion.form
                        key="demo-form"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.1 } }}
                        transition={{ duration: 0.2, ease: expo }}
                        onSubmit={handleDemoSubmit}
                        className="space-y-4"
                      >
                        <div>
                          <label htmlFor="mobile-email" className="block text-[13px] font-medium text-warm-500 mb-2">
                            Your email
                          </label>
                          <input
                            ref={emailInputRef}
                            id="mobile-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            className="w-full px-4 py-3 rounded-lg border border-warm-200 bg-white
                                     text-warm-900 placeholder:text-warm-300 text-[15px]
                                     focus:outline-none focus:ring-2 focus:ring-warm-900/10 focus:border-warm-400
                                     transition-[border-color,box-shadow] duration-150"
                          />
                        </div>
                        {error && (
                          <p className="text-[13px] text-red-600 font-medium">{error}</p>
                        )}
                        <div className="flex gap-2.5">
                          <button
                            type="button"
                            onClick={() => setShowDemoForm(false)}
                            className="flex-1 py-3 rounded-lg border border-warm-200
                                     text-warm-500 font-medium text-[14px]
                                     active:scale-[0.97] transition-transform duration-100"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmitting || !email.trim()}
                            className="flex-1 py-3 rounded-lg bg-warm-900 text-white
                                     font-semibold text-[14px]
                                     disabled:opacity-40 disabled:cursor-not-allowed
                                     active:scale-[0.97] transition-transform duration-100"
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
                      </motion.form>
                    )}

                    {submitted && (
                      <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.25, ease: expo }}
                        className="text-center space-y-5 py-2"
                      >
                        <div className="w-12 h-12 mx-auto rounded-full bg-primary-500/10 flex items-center justify-center">
                          <svg
                            className="w-5 h-5 text-primary-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-serif text-xl text-warm-900 mb-1">You&apos;re in</h3>
                          <p className="text-sm text-warm-500">
                            We&apos;ll reach out shortly.
                          </p>
                        </div>
                        <button
                          onClick={handleBackToHome}
                          className="w-full py-3 rounded-xl bg-warm-100 text-warm-700
                                   font-medium text-[14px] active:scale-[0.97] transition-transform duration-100"
                        >
                          Back to Home
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </nav>
            </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
