'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { submitDemoRequest } from '@/app/actions/demo-request'

interface MobileNavProps {
  isProductsPage?: boolean
}

const navLinks = [
  { name: 'Home', href: '/', description: 'Back to homepage' },
  { name: 'About', href: '/about', description: 'Our story & mission' },
  { name: 'Products', href: '/products', description: 'BaseballHelm & GolfHelm' },
  { name: 'Log in', href: '/golf/login', description: 'Access your account' },
]

// Optimized easing - fast out, slow in (snappy feel)
const snappyEase = [0.32, 0.72, 0, 1] as const

// Fast overlay animation - GPU accelerated opacity + transform only
const overlayVariants = {
  closed: {
    opacity: 0,
    transition: { duration: 0.2, ease: snappyEase },
  },
  open: {
    opacity: 1,
    transition: { duration: 0.25, ease: snappyEase },
  },
}

// Content slide animation
const contentVariants = {
  closed: {
    opacity: 0,
    y: 20,
    transition: { duration: 0.15 },
  },
  open: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: snappyEase, delay: 0.05 },
  },
}

export function MobileNav({ isProductsPage = false }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showDemoForm, setShowDemoForm] = useState(false)
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
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

  const handleBackToHome = () => {
    setIsOpen(false)
  }

  return (
    <>
      {/* Hamburger button - lightweight, no backdrop-blur */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`md:hidden relative z-50 w-12 h-12 flex items-center justify-center
                   rounded-2xl transition-all duration-200 active:scale-95
                   ${isOpen
                     ? 'bg-white shadow-lg'
                     : isProductsPage
                       ? 'bg-white/95 border border-warm-200/60 shadow-md'
                       : 'bg-white/15 border border-white/25 shadow-md'
                   }`}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        <div className="w-5 h-4 relative flex flex-col justify-center items-center">
          {/* Top line - CSS transition for performance */}
          <span
            className={`absolute h-[2px] rounded-full transition-all duration-200 ease-out
              ${isOpen ? 'bg-warm-800 rotate-45 w-full' : isProductsPage ? 'bg-warm-800 -tranwarm-y-1.5 w-full' : 'bg-white -tranwarm-y-1.5 w-full'}`}
          />
          {/* Middle line */}
          <span
            className={`absolute h-[2px] rounded-full transition-all duration-150 ease-out
              ${isOpen ? 'bg-warm-800 opacity-0 scale-x-0' : isProductsPage ? 'bg-warm-800 opacity-100 w-full' : 'bg-white opacity-100 w-full'}`}
          />
          {/* Bottom line */}
          <span
            className={`absolute h-[2px] rounded-full transition-all duration-200 ease-out
              ${isOpen ? 'bg-warm-800 -rotate-45 w-full' : isProductsPage ? 'bg-warm-800 tranwarm-y-1.5 w-full' : 'bg-white tranwarm-y-1.5 w-full'}`}
          />
        </div>
      </button>

      {/* Full-screen overlay - simple opacity fade */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={overlayVariants}
            className="fixed inset-0 z-40 bg-[#FAFAF8]"
            style={{ willChange: 'opacity' }}
          >
            {/* Static gradient background - no animation */}
            <div className="absolute inset-0 bg-gradient-to-b from-white via-[#FAFAF8] to-green-50/30 pointer-events-none" />

            {/* Static decorative orbs - no blur animation, reduced blur */}
            <div className="absolute top-24 right-0 w-72 h-72 rounded-full bg-gradient-to-br from-green-100/60 to-transparent blur-2xl pointer-events-none" />
            <div className="absolute bottom-32 -left-12 w-56 h-56 rounded-full bg-gradient-to-tr from-amber-100/50 to-transparent blur-2xl pointer-events-none" />

            <motion.nav
              variants={contentVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className="relative h-full flex flex-col px-7 pt-24 pb-10 safe-area-inset"
              style={{ willChange: 'opacity, transform' }}
            >
              {/* Logo header */}
              <div className="mb-12">
                <div className="flex items-center gap-4">
                  <Image
                    src="/Helm-Logo-New-Main.png"
                    alt="Helm"
                    width={48}
                    height={48}
                    className="w-12 h-12 object-contain"
                  />
                  <div>
                    <span className="block text-warm-900 font-semibold text-xl tracking-tight">
                      Helm Sports Labs
                    </span>
                    <span className="block text-warm-500 text-sm font-medium mt-0.5">
                      Recruiting Intelligence
                    </span>
                  </div>
                </div>
              </div>

              {/* Navigation Links - simple stagger with CSS */}
              <div className="flex-1">
                <div className="space-y-1">
                  {navLinks.map((link, i) => (
                    <Link
                      key={link.name}
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                      className="group flex items-center justify-between py-5 px-5 -mx-5 rounded-2xl
                                 hover:bg-white/80 active:bg-white active:scale-[0.98] transition-all duration-150"
                      style={{
                        animationDelay: `${i * 40}ms`,
                      }}
                    >
                      <div className="flex-1">
                        <span className="block text-[1.75rem] font-semibold text-warm-900 tracking-tight
                                       group-hover:text-green-600 transition-colors duration-150">
                          {link.name}
                        </span>
                        <span className="block text-base text-warm-500 mt-1 font-normal">
                          {link.description}
                        </span>
                      </div>
                      <svg
                        className="w-6 h-6 text-warm-300 group-hover:text-green-500 group-hover:tranwarm-x-1 transition-all duration-150"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>

              {/* CTA Section */}
              <div className="pt-8 border-t border-warm-200/60">
                <AnimatePresence mode="wait">
                  {!showDemoForm && !submitted && (
                    <motion.div
                      key="cta-button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      <button
                        onClick={() => setShowDemoForm(true)}
                        className="w-full py-4 rounded-2xl bg-warm-900 text-white text-center
                                   font-semibold text-lg shadow-lg active:scale-[0.98] transition-transform duration-150"
                      >
                        Book a Demo
                      </button>
                      <p className="text-center text-base text-warm-500 font-medium">
                        Get early access to BaseballHelm or GolfHelm
                      </p>
                    </motion.div>
                  )}

                  {showDemoForm && !submitted && (
                    <motion.form
                      key="demo-form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      onSubmit={handleDemoSubmit}
                      className="space-y-5"
                    >
                      <div>
                        <label htmlFor="mobile-email" className="block text-base font-semibold text-warm-700 mb-2.5">
                          Enter your email
                        </label>
                        <input
                          id="mobile-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                          autoFocus
                          className="w-full px-5 py-4 rounded-xl border border-warm-200
                                   bg-white text-warm-900 placeholder:text-warm-400 text-base
                                   focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500
                                   transition-colors duration-150"
                        />
                      </div>
                      {error && (
                        <p className="text-base text-red-600 font-medium">{error}</p>
                      )}
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setShowDemoForm(false)}
                          className="flex-1 py-4 rounded-xl border border-warm-200
                                   text-warm-600 font-semibold text-base
                                   active:scale-[0.98] transition-transform duration-150"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmitting || !email.trim()}
                          className="flex-1 py-4 rounded-xl bg-green-600 text-white
                                   font-semibold text-base shadow-md
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   active:scale-[0.98] transition-transform duration-150"
                        >
                          {isSubmitting ? 'Submitting...' : 'Submit'}
                        </button>
                      </div>
                    </motion.form>
                  )}

                  {submitted && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className="text-center space-y-6"
                    >
                      <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                        <svg
                          className="w-8 h-8 text-green-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-2xl font-semibold text-warm-900 mb-2">Thanks!</h3>
                        <p className="text-base text-warm-600 font-medium">
                          One of our team members will reach out to you shortly.
                        </p>
                      </div>
                      <button
                        onClick={handleBackToHome}
                        className="w-full py-4 rounded-2xl bg-warm-100 text-warm-900
                                 font-semibold text-base active:scale-[0.98] transition-transform duration-150"
                      >
                        Back to Home
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
