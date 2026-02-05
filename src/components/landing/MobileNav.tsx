'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
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

// Premium spring config for buttery animations
const springConfig = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
}

// Overlay animation variants
const overlayVariants = {
  closed: {
    clipPath: 'circle(0% at calc(100% - 42px) 42px)',
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 40,
      delay: 0.1,
    },
  },
  open: {
    clipPath: 'circle(150% at calc(100% - 42px) 42px)',
    transition: {
      type: 'spring' as const,
      stiffness: 200,
      damping: 40,
    },
  },
}

// Stagger container for nav items
const navContainerVariants = {
  closed: {
    transition: {
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
  open: {
    transition: {
      delayChildren: 0.2,
      staggerChildren: 0.07,
    },
  },
}

// Individual nav item animation
const navItemVariants = {
  closed: {
    opacity: 0,
    y: 20,
    scale: 0.95,
    transition: {
      duration: 0.2,
    },
  },
  open: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 24,
    },
  },
}

export function MobileNav({ isProductsPage = false }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showDemoForm, setShowDemoForm] = useState(false)
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const controls = useAnimation()

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

  // Trigger button animation on toggle
  useEffect(() => {
    if (isOpen) {
      controls.start({
        scale: [1, 0.9, 1],
        transition: { duration: 0.3 },
      })
    }
  }, [isOpen, controls])

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
      {/* Hamburger button - premium glass morphism */}
      <motion.button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        animate={controls}
        whileTap={{ scale: 0.92 }}
        className={`md:hidden relative z-50 w-12 h-12 flex items-center justify-center
                   rounded-2xl backdrop-blur-2xl transition-all duration-500
                   ${isOpen
                     ? 'bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-slate-100'
                     : isProductsPage
                       ? 'bg-white/90 border border-slate-200/60 shadow-[0_4px_24px_rgba(0,0,0,0.08)]'
                       : 'bg-white/10 border border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.12)]'
                   }`}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        <div className="w-5 h-4 relative flex flex-col justify-center items-center">
          {/* Top line */}
          <motion.span
            animate={isOpen
              ? { rotate: 45, y: 0, width: '100%' }
              : { rotate: 0, y: -6, width: '100%' }
            }
            transition={springConfig}
            className={`absolute h-[2px] rounded-full ${
              isOpen ? 'bg-slate-800' : isProductsPage ? 'bg-slate-800' : 'bg-white'
            }`}
            style={{ width: '100%' }}
          />
          {/* Middle line */}
          <motion.span
            animate={isOpen
              ? { opacity: 0, scaleX: 0.3 }
              : { opacity: 1, scaleX: 1 }
            }
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className={`absolute h-[2px] rounded-full ${
              isOpen ? 'bg-slate-800' : isProductsPage ? 'bg-slate-800' : 'bg-white'
            }`}
            style={{ width: '100%' }}
          />
          {/* Bottom line */}
          <motion.span
            animate={isOpen
              ? { rotate: -45, y: 0, width: '100%' }
              : { rotate: 0, y: 6, width: '100%' }
            }
            transition={springConfig}
            className={`absolute h-[2px] rounded-full ${
              isOpen ? 'bg-slate-800' : isProductsPage ? 'bg-slate-800' : 'bg-white'
            }`}
            style={{ width: '100%' }}
          />
        </div>
      </motion.button>

      {/* Full-screen overlay with clip-path reveal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={overlayVariants}
            className="fixed inset-0 z-40 bg-[#FAFAF8]"
          >
            {/* Refined gradient background */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="absolute inset-0 bg-gradient-to-b from-white via-[#FAFAF8] to-green-50/30 pointer-events-none"
            />

            {/* Animated decorative orbs */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.6, ease: 'easeOut' }}
              className="absolute top-24 right-0 w-80 h-80 rounded-full bg-gradient-to-br from-green-100/50 to-transparent blur-3xl pointer-events-none"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.6, ease: 'easeOut' }}
              className="absolute bottom-32 -left-16 w-64 h-64 rounded-full bg-gradient-to-tr from-amber-100/40 to-transparent blur-3xl pointer-events-none"
            />

            <nav className="relative h-full flex flex-col px-7 pt-24 pb-10 safe-area-inset">
              {/* Logo header with refined animation */}
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.15, ...springConfig }}
                className="mb-12"
              >
                <div className="flex items-center gap-4">
                  <motion.div
                    initial={{ opacity: 0, rotate: -10 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                  >
                    <Image
                      src="/Helm-Logo-New-Main.png"
                      alt="Helm"
                      width={48}
                      height={48}
                      className="w-12 h-12 object-contain"
                    />
                  </motion.div>
                  <div>
                    <span className="block text-slate-900 font-semibold text-xl tracking-tight">
                      Helm Sports Labs
                    </span>
                    <span className="block text-slate-500 text-sm font-medium mt-0.5">
                      Recruiting Intelligence
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* Navigation Links with stagger */}
              <motion.div
                className="flex-1"
                variants={navContainerVariants}
                initial="closed"
                animate="open"
                exit="closed"
              >
                <div className="space-y-2">
                  {navLinks.map((link, i) => (
                    <motion.div
                      key={link.name}
                      variants={navItemVariants}
                      custom={i}
                    >
                      <Link
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className="group flex items-center justify-between py-5 px-5 -mx-5 rounded-2xl
                                   hover:bg-white/80 active:bg-white active:scale-[0.98] transition-all duration-200"
                      >
                        <div className="flex-1">
                          <span className="block text-[1.75rem] font-semibold text-slate-900 tracking-tight
                                         group-hover:text-green-600 transition-colors duration-200">
                            {link.name}
                          </span>
                          <span className="block text-base text-slate-500 mt-1 font-normal">
                            {link.description}
                          </span>
                        </div>
                        <motion.svg
                          className="w-6 h-6 text-slate-300 group-hover:text-green-500 transition-colors duration-200"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          whileHover={{ x: 4 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </motion.svg>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* CTA Section with premium animation */}
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.45, ...springConfig }}
                className="pt-8 border-t border-slate-200/60"
              >
                <AnimatePresence mode="wait">
                  {!showDemoForm && !submitted && (
                    <motion.div
                      key="cta-button"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12, scale: 0.95 }}
                      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                      className="space-y-4"
                    >
                      <motion.button
                        onClick={() => setShowDemoForm(true)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full py-4.5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900
                                   text-white text-center font-semibold text-lg
                                   shadow-[0_8px_32px_rgba(0,0,0,0.2)]
                                   transition-all duration-300"
                        style={{ paddingTop: '1.125rem', paddingBottom: '1.125rem' }}
                      >
                        Book a Demo
                      </motion.button>
                      <p className="text-center text-base text-slate-500 font-medium">
                        Get early access to BaseballHelm or GolfHelm
                      </p>
                    </motion.div>
                  )}

                  {showDemoForm && !submitted && (
                    <motion.form
                      key="demo-form"
                      initial={{ opacity: 0, y: 12, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -12, scale: 0.95 }}
                      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                      onSubmit={handleDemoSubmit}
                      className="space-y-5"
                    >
                      <div>
                        <label htmlFor="mobile-email" className="block text-base font-semibold text-slate-700 mb-2.5">
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
                          className="w-full px-5 py-4 rounded-xl border border-slate-200
                                   bg-white text-slate-900 placeholder:text-slate-400 text-base
                                   focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500
                                   transition-all duration-200"
                        />
                      </div>
                      {error && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-base text-red-600 font-medium"
                        >
                          {error}
                        </motion.p>
                      )}
                      <div className="flex gap-3">
                        <motion.button
                          type="button"
                          onClick={() => setShowDemoForm(false)}
                          whileTap={{ scale: 0.98 }}
                          className="flex-1 py-4 rounded-xl border border-slate-200
                                   text-slate-600 font-semibold text-base
                                   hover:bg-slate-50 transition-all duration-200"
                        >
                          Cancel
                        </motion.button>
                        <motion.button
                          type="submit"
                          disabled={isSubmitting || !email.trim()}
                          whileTap={{ scale: 0.98 }}
                          className="flex-1 py-4 rounded-xl bg-green-600 text-white
                                   font-semibold text-base shadow-lg shadow-green-600/25
                                   hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed
                                   transition-all duration-200"
                        >
                          {isSubmitting ? 'Submitting...' : 'Submit'}
                        </motion.button>
                      </div>
                    </motion.form>
                  )}

                  {submitted && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                      className="text-center space-y-6"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 20 }}
                        className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center"
                      >
                        <motion.svg
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: 1, opacity: 1 }}
                          transition={{ delay: 0.3, duration: 0.4 }}
                          className="w-8 h-8 text-green-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </motion.svg>
                      </motion.div>
                      <div>
                        <h3 className="text-2xl font-semibold text-slate-900 mb-2">Thanks!</h3>
                        <p className="text-base text-slate-600 font-medium">
                          One of our team members will reach out to you shortly.
                        </p>
                      </div>
                      <motion.button
                        onClick={handleBackToHome}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full py-4 rounded-2xl bg-slate-100 text-slate-900
                                 font-semibold text-base hover:bg-slate-200
                                 transition-all duration-200"
                      >
                        Back to Home
                      </motion.button>
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
