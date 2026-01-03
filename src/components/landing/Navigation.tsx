'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { MobileNav } from './MobileNav'

export function Navigation() {
  const [showLoginDropdown, setShowLoginDropdown] = useState(false)
  const [showSignupDropdown, setShowSignupDropdown] = useState(false)

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 bg-transparent"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Top bar with centered navigation links and auth buttons */}
      <div className="flex items-center pt-4 pb-2 max-w-7xl mx-auto px-6">
        {/* Left spacer */}
        <div className="flex-1" />

        {/* Centered navigation links */}
        <div className="hidden md:flex items-center gap-12">
          <Link
            href="/baseball/signup"
            className="text-stone-700 hover:text-stone-900 transition-colors font-medium text-lg tracking-wide"
          >
            BaseballHelm
          </Link>
          <Link
            href="/golf/signup"
            className="text-stone-700 hover:text-stone-900 transition-colors font-medium text-lg tracking-wide"
          >
            GolfHelm
          </Link>
          <Link
            href="/about"
            className="text-stone-700 hover:text-stone-900 transition-colors font-medium text-lg tracking-wide"
          >
            About
          </Link>
        </div>

        {/* Auth buttons - right side */}
        <div className="flex-1 flex justify-end">
          <div className="hidden md:flex items-center gap-3">
          {/* Login Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowLoginDropdown(!showLoginDropdown)
                setShowSignupDropdown(false)
              }}
              className="px-4 py-2 text-stone-700 hover:text-stone-900 font-medium transition-colors"
            >
              Log in
            </button>
            <AnimatePresence>
              {showLoginDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-stone-200 overflow-hidden z-[60]"
                  onMouseLeave={() => setShowLoginDropdown(false)}
                >
                  <Link
                    href="/baseball/login"
                    className="block px-4 py-3 text-stone-700 hover:bg-amber-50 hover:text-amber-900 transition-colors"
                  >
                    Baseball Login
                  </Link>
                  <Link
                    href="/golf/login"
                    className="block px-4 py-3 text-stone-700 hover:bg-green-50 hover:text-green-900 transition-colors border-t border-stone-100"
                  >
                    Golf Login
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sign Up Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSignupDropdown(!showSignupDropdown)
                setShowLoginDropdown(false)
              }}
              className="px-5 py-2 rounded-full bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors shadow-sm"
            >
              Sign up
            </button>
            <AnimatePresence>
              {showSignupDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-stone-200 overflow-hidden z-[60]"
                  onMouseLeave={() => setShowSignupDropdown(false)}
                >
                  <Link
                    href="/baseball/signup"
                    className="block px-4 py-3 text-stone-700 hover:bg-amber-50 hover:text-amber-900 transition-colors"
                  >
                    Baseball Sign up
                  </Link>
                  <Link
                    href="/golf/signup"
                    className="block px-4 py-3 text-stone-700 hover:bg-green-50 hover:text-green-900 transition-colors border-t border-stone-100"
                  >
                    Golf Sign up
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        </div>
      </div>

      {/* Logo and CTA row */}
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Logo - large and prominent */}
        <Link href="/" className="group relative flex items-center">
          {/* Subtle ambient glow on hover */}
          <div className="absolute -inset-6 bg-gradient-to-r from-amber-400/10 to-golden-400/10
                          rounded-3xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          <Image
            src="/Helm-Logo-New-Main.png"
            alt="Helm Sports Labs"
            width={500}
            height={200}
            className="relative h-[180px] w-auto group-hover:scale-[1.02] transition-transform duration-300"
            priority
            unoptimized
          />
        </Link>

        {/* CTA Button */}
        <Link
          href="/baseball/(auth)/coach-onboarding"
          className="hidden md:inline-flex px-6 py-3 rounded-full bg-amber-500 text-white font-semibold text-lg
                     hover:bg-amber-600 transition-all duration-200
                     shadow-md shadow-amber-500/20 hover:shadow-lg hover:shadow-amber-500/30 
                     active:scale-[0.98]"
        >
          Book a demo
        </Link>

        {/* Mobile Nav */}
        <MobileNav />
      </div>
    </nav>
  )
}
