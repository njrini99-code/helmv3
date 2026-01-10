'use client'

import { useState } from 'react'
import { SplitFlapIntro } from '@/components/products/SplitFlapIntro'
import { Navigation } from '@/components/landing/Navigation'
import { Footer } from '@/components/landing/Footer'
import { Check } from 'lucide-react'
import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import Link from 'next/link'

// Import all your section components here
// (I'll include the essentials - you can add the rest)

function HeroSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  return (
    <section ref={ref} className="relative pt-32 pb-24 md:pt-44 md:pb-36 bg-gradient-to-b from-[#FFF8E7] to-[#FFFCF5] overflow-hidden">
      <div className="absolute inset-0 opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(0 0 0 / 0.1) 1px, transparent 0)`,
          backgroundSize: '48px 48px'
        }} />
      </div>

      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-helm-green-500/8 rounded-full blur-3xl" />
      
      <div className="relative max-w-7xl mx-auto px-6 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="text-center max-w-5xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border-2 border-helm-green-500/20 shadow-sm mb-8">
            <div className="w-2 h-2 rounded-full bg-helm-green-500 animate-pulse" />
            <span className="text-sm font-semibold text-neutral-800 tracking-wide">Two Products, One Platform</span>
          </div>

          <h1 className="text-6xl sm:text-7xl md:text-8xl font-bold text-neutral-900 mb-8 tracking-tight leading-[0.95]">
            Built for the sports{' '}
            <span className="text-helm-green-600">you coach</span>
          </h1>

          <p className="text-2xl md:text-3xl text-neutral-700 font-medium mb-16 leading-relaxed max-w-3xl mx-auto">
            GolfHelm for college golf teams. BaseballHelm for recruiting. 
            Both powered by the same unified platform.
          </p>

          <div className="flex flex-col sm:flex-row gap-5 justify-center mb-20">
            <Link href="#golfhelm">
              <motion.button
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="px-10 py-5 rounded-2xl bg-helm-green-600 text-white text-lg font-bold shadow-xl shadow-helm-green-600/30 hover:bg-helm-green-700 hover:shadow-2xl hover:shadow-helm-green-600/40 transition-all duration-500"
              >
                Explore GolfHelm
              </motion.button>
            </Link>
            <Link href="#baseballhelm">
              <motion.button
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="px-10 py-5 rounded-2xl bg-white text-neutral-900 text-lg font-bold border-2 border-neutral-300 hover:border-helm-green-500 hover:shadow-xl transition-all duration-500"
              >
                Explore BaseballHelm
              </motion.button>
            </Link>
          </div>

          <div className="flex flex-wrap justify-center gap-10 text-base text-neutral-600 font-medium">
            {['14-day free trial', 'No credit card required', 'Cancel anytime'].map(item => (
              <span key={item} className="flex items-center gap-2.5">
                <Check className="w-5 h-5 text-helm-green-600" strokeWidth={3} />
                {item}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// Main component
export default function ProductsPage() {
  const [introComplete, setIntroComplete] = useState(false)

  return (
    <>
      {/* Cinematic intro */}
      {!introComplete && (
        <SplitFlapIntro onComplete={() => setIntroComplete(true)} />
      )}

      {/* Main content - only shows after intro */}
      {introComplete && (
        <main className="relative min-h-screen bg-white">
          <div className="fixed top-0 left-0 right-0 z-50">
            <Navigation />
          </div>
          
          <HeroSection />
          
          {/* Add your other sections here */}
          {/* <PlatformOverviewSection />
          <CoachHelmAISection />
          <ShotTrackingSection />
          <RecruitingPipelineSection />
          <DeviceEcosystemSection />
          <FinalCTASection /> */}
          
          <Footer />
        </main>
      )}
    </>
  )
}
