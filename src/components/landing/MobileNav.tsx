'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'

interface MobileNavProps {
  isProductsPage?: boolean
}

const navLinks = [
  { name: 'Home', href: '/', description: 'Back to homepage' },
  { name: 'About', href: '/about', description: 'Our story & mission' },
  { name: 'Products', href: '/products', description: 'BaseballHelm & GolfHelm' },
]

export function MobileNav({ isProductsPage = false }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)

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

  return (
    <>
      {/* Hamburger button - floating pill style */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`md:hidden relative z-50 w-11 h-11 flex items-center justify-center
                   rounded-full backdrop-blur-2xl transition-all duration-300
                   ${isOpen
                     ? 'bg-[#FFFEFA] shadow-lg'
                     : isProductsPage
                       ? 'bg-white/80 border border-neutral-200/50 shadow-[0_2px_20px_rgba(0,0,0,0.1)]'
                       : 'bg-white/[0.08] border border-white/[0.12] shadow-[0_2px_20px_rgba(0,0,0,0.15)]'
                   }`}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        <div className="w-5 h-4 relative flex flex-col justify-between">
          <motion.span
            animate={isOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`w-full h-[2px] rounded-full origin-left ${
              isOpen ? 'bg-slate-900' : isProductsPage ? 'bg-neutral-900' : 'bg-white'
            }`}
          />
          <motion.span
            animate={isOpen ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.2 }}
            className={`w-full h-[2px] rounded-full ${
              isOpen ? 'bg-slate-900' : isProductsPage ? 'bg-neutral-900' : 'bg-white'
            }`}
          />
          <motion.span
            animate={isOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`w-full h-[2px] rounded-full origin-left ${
              isOpen ? 'bg-slate-900' : isProductsPage ? 'bg-neutral-900' : 'bg-white'
            }`}
          />
        </div>
      </button>

      {/* Full-screen overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-[#FFFEFA]"
          >
            {/* Subtle gradient accent */}
            <div className="absolute inset-0 bg-gradient-to-br from-green-50/30 via-transparent to-amber-50/20 pointer-events-none" />

            {/* Decorative circles */}
            <div className="absolute top-20 right-8 w-64 h-64 rounded-full bg-green-100/20 blur-3xl pointer-events-none" />
            <div className="absolute bottom-32 left-4 w-48 h-48 rounded-full bg-amber-100/30 blur-3xl pointer-events-none" />

            <nav className="relative h-full flex flex-col px-8 pt-24 pb-8">
              {/* Logo at top */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-12"
              >
                <div className="flex items-center gap-3">
                  <Image
                    src="/Helm-Logo-New-Main.png"
                    alt="Helm"
                    width={48}
                    height={48}
                    className="w-12 h-12 object-contain"
                  />
                  <span className="text-slate-900 font-semibold text-lg tracking-tight">
                    Helm Sports Labs
                  </span>
                </div>
              </motion.div>

              {/* Navigation Links */}
              <div className="flex-1 flex flex-col justify-center -mt-16">
                <div className="space-y-2">
                  {navLinks.map((link, i) => (
                    <motion.div
                      key={link.name}
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
                    >
                      <Link
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className="group block py-4 border-b border-slate-200/60"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="block text-3xl font-medium text-slate-900 tracking-tight group-hover:text-green-600 transition-colors">
                              {link.name}
                            </span>
                            <span className="block text-sm text-slate-500 mt-1 font-normal">
                              {link.description}
                            </span>
                          </div>
                          <motion.svg
                            className="w-6 h-6 text-slate-400 group-hover:text-green-600 group-hover:translate-x-1 transition-all"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                          </motion.svg>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* CTA at bottom */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
                className="space-y-4"
              >
                <Link
                  href="/baseball/coach-onboarding"
                  onClick={() => setIsOpen(false)}
                  className="block w-full py-4 rounded-2xl bg-slate-900 text-white text-center font-medium text-lg
                             shadow-lg shadow-slate-900/20 active:scale-[0.98] transition-transform"
                >
                  Book a Demo
                </Link>
                <p className="text-center text-sm text-slate-500">
                  Get early access to BaseballHelm or GolfHelm
                </p>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
