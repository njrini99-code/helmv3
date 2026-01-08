'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false)
  useEffect(() => { if (isOpen) { document.body.style.overflow = 'hidden' } else { document.body.style.overflow = 'unset' }; return () => { document.body.style.overflow = 'unset' } }, [isOpen])

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} className="md:hidden relative z-50 w-10 h-10 flex items-center justify-center" aria-label={isOpen ? 'Close menu' : 'Open menu'}>
        <div className="w-6 h-5 relative flex flex-col justify-between">
          <motion.span animate={isOpen ? { rotate: 45, y: 8 } : { rotate: 0, y: 0 }} className="w-full h-0.5 bg-warm-900 origin-left transition-all" />
          <motion.span animate={isOpen ? { opacity: 0 } : { opacity: 1 }} className="w-full h-0.5 bg-warm-900 transition-all" />
          <motion.span animate={isOpen ? { rotate: -45, y: -8 } : { rotate: 0, y: 0 }} className="w-full h-0.5 bg-warm-900 origin-left transition-all" />
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="fixed inset-0 z-40 bg-warm-cream">
            <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-bl from-golden-100 to-transparent" />
            <nav className="relative h-full flex flex-col justify-center px-8">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-8">
                {[{ name: 'BaseballHelm', href: '/baseball/signup' }, { name: 'GolfHelm', href: '/golf/signup' }, { name: 'About', href: '/about' }].map((link, i) => (
                  <motion.div key={link.name} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
                    <Link href={link.href} onClick={() => setIsOpen(false)} className="block font-serif text-4xl text-warm-900 hover:text-golden-600 transition-colors">{link.name}</Link>
                  </motion.div>
                ))}
                <div className="pt-8 border-t border-warm-200 mt-8 space-y-6">
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
                    <p className="text-warm-500 text-sm mb-3">Baseball</p>
                    <div className="flex gap-4"><Link href="/baseball/login" onClick={() => setIsOpen(false)} className="text-xl text-warm-700 hover:text-golden-600 transition-colors">Log in</Link><Link href="/baseball/signup" onClick={() => setIsOpen(false)} className="text-xl text-warm-700 hover:text-golden-600 transition-colors">Sign up</Link></div>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                    <p className="text-warm-500 text-sm mb-3">Golf</p>
                    <div className="flex gap-4"><Link href="/golf/login" onClick={() => setIsOpen(false)} className="text-xl text-warm-700 hover:text-golden-600 transition-colors">Log in</Link><Link href="/golf/signup" onClick={() => setIsOpen(false)} className="text-xl text-warm-700 hover:text-golden-600 transition-colors">Sign up</Link></div>
                  </motion.div>
                </div>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="absolute bottom-12 left-8 right-8">
                <Link href="/baseball/coach-onboarding" onClick={() => setIsOpen(false)} className="block w-full py-4 rounded-xl bg-warm-900 text-white text-center font-medium hover:bg-warm-800 transition-colors">Book a demo</Link>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
