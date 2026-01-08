'use client'
import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import Link from 'next/link'

export function FinalCTA() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })
  return (
    <section ref={ref} className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-golden-100 via-orange-100 to-amber-200" />
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-golden-300/30 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-300/30 rounded-full blur-3xl" />
      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <motion.h2 initial={{ opacity: 0, y: 30 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="font-serif text-4xl md:text-5xl lg:text-6xl text-warm-900 mb-6">Ready to focus on what matters?</motion.h2>
        <motion.p initial={{ opacity: 0, y: 30 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.1 }} className="text-xl text-warm-700 mb-10">Join coaches who are building better programs with Helm.</motion.p>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.2 }}>
          <Link href="/baseball/coach-onboarding" className="inline-flex items-center gap-2 px-10 py-5 rounded-2xl bg-warm-900 text-white text-lg font-medium hover:bg-warm-800 transition-all duration-200 shadow-xl hover:shadow-2xl active:scale-[0.98]">Get started free<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg></Link>
        </motion.div>
      </div>
    </section>
  )
}
