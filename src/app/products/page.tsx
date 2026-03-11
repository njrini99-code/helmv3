'use client';

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SmoothScroll } from "@/components/landing/SmoothScroll"
import { HelmFlipAnimation } from "@/components/products/HelmFlipAnimation"
import { GolfHelmSection } from "@/components/products/GolfHelmSection"
import { BaseballHelmSection } from "@/components/products/BaseballHelmSection"

const features = [
  {
    title: 'Team Management',
    description: 'Centralize rosters, schedules, and player development in one place.',
  },
  {
    title: 'Comprehensive Stats',
    description: 'Track performance metrics and progress with advanced analytics.',
  },
  {
    title: 'Built-in AI',
    description: 'Analyzes trends and performance bottlenecks to sharpen your coaching.',
  },
];

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const }
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-background overflow-x-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg focus:shadow-lg">
        Skip to main content
      </a>
      <SmoothScroll />

      {/* Navigation */}
      <div className="relative z-10">
        <Navigation />
      </div>

      {/* Hero — Animation Centerpiece */}
      <section id="main-content" className="relative" style={{
        background: `
          radial-gradient(ellipse 80% 60% at 50% 60%, rgba(21, 128, 61, 0.15), transparent),
          linear-gradient(180deg, #FFFEFA 0%, #EDE8DD 100%)
        `
      }}>
        {/* Animation in contained box */}
        <div className="max-w-5xl mx-auto px-5 sm:px-6 pt-10 md:pt-14">
          <div className="rounded-2xl overflow-hidden shadow-lg">
            <HelmFlipAnimation />
          </div>
        </div>

        {/* Content below animation */}
        <motion.div
          className="relative px-5 sm:px-6 pt-7 pb-12 sm:pt-10 sm:pb-16 md:pt-14 md:pb-24 max-w-5xl mx-auto"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          {/* Tagline + CTA */}
          <motion.div className="text-center mb-8 sm:mb-12" variants={fadeInUp}>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed mb-6 sm:mb-8">
              The ultimate platform to manage your team with precision and clarity.
            </p>

            {/* Product Buttons — centered wide pills */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="#golfhelm" className="group">
                <button
                  className="w-full sm:w-56 flex items-center gap-4 px-6 py-4 rounded-2xl
                           border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.5)]
                           hover:shadow-[0_12px_40px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-all duration-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2"
                  style={{
                    background: 'radial-gradient(ellipse 80% 70% at 50% 60%, rgba(21,128,61,0.04), transparent), rgba(237,232,221,0.5)',
                    backdropFilter: 'blur(60px)',
                    WebkitBackdropFilter: 'blur(60px)',
                  }}
                >
                  <div className="w-10 h-10 relative flex-shrink-0">
                    <Image
                      src="/anim/helm-golf-icon.png"
                      alt="GolfHelm"
                      fill
                      className="object-contain"
                      sizes="40px"
                    />
                  </div>
                  <span className="font-bold text-warm-900 text-base tracking-tight">
                    GolfHelm
                  </span>
                </button>
              </Link>

              <Link href="#baseballhelm" className="group">
                <button
                  className="w-full sm:w-56 flex items-center gap-4 px-6 py-4 rounded-2xl
                           border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.5)]
                           hover:shadow-[0_12px_40px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-all duration-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2"
                  style={{
                    background: 'radial-gradient(ellipse 80% 70% at 50% 60%, rgba(21,128,61,0.04), transparent), rgba(237,232,221,0.5)',
                    backdropFilter: 'blur(60px)',
                    WebkitBackdropFilter: 'blur(60px)',
                  }}
                >
                  <div className="w-10 h-10 relative flex-shrink-0">
                    <Image
                      src="/anim/helm-baseball-icon.png"
                      alt="BaseballHelm"
                      fill
                      className="object-contain"
                      sizes="40px"
                    />
                  </div>
                  <span className="font-bold text-warm-900 text-base tracking-tight">
                    BaseballHelm
                  </span>
                </button>
              </Link>
            </div>
          </motion.div>

          {/* Features Strip */}
          <motion.div
            className="pt-10 border-t border-warm-200"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  variants={fadeInUp}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-600
                                  flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold text-warm-900 mb-1">
                        {feature.title}
                      </h3>
                      <p className="text-warm-600 text-sm leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* GolfHelm Section */}
      <GolfHelmSection />

      {/* BaseballHelm Section */}
      <BaseballHelmSection />

      <Footer />
    </main>
  )
}
