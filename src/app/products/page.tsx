'use client';

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SmoothScroll } from "@/components/landing/SmoothScroll"
import { DashboardMockup } from "@/components/products/DashboardMockup"
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
    title: 'Recruiting Planning',
    description: 'Streamline prospect identification and communication workflows.',
  },
];

// Optimized animation variants - faster, snappier
const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const }
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 }
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

      {/* Hero Section */}
      <motion.section
        id="main-content"
        className="relative px-5 sm:px-6 py-16 md:py-24 max-w-6xl mx-auto"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <div className="relative grid md:grid-cols-2 gap-10 md:gap-12 items-center">
          {/* Text Content */}
          <motion.div variants={fadeInUp}>
            <p className="text-sm font-medium text-primary-600 tracking-wide uppercase mb-4">
              Products
            </p>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.1] text-foreground tracking-tight mb-6">
              Take the{' '}
              <span className="text-primary-600">Helm</span>
              <br />
              of your program
            </h1>

            <p className="text-lg text-muted-foreground max-w-md leading-relaxed mb-8">
              The ultimate platform to manage your team with precision and clarity.
            </p>

            {/* Product Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="#golfhelm">
                <button
                  className="w-full sm:w-auto flex items-center gap-4 px-5 py-3.5 rounded-xl
                           bg-white border border-warm-200 shadow-sm
                           hover:border-helm-green-300 hover:shadow-md active:scale-[0.98] transition-all
                           focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2"
                >
                  <div className="w-11 h-11 relative flex-shrink-0">
                    <Image
                      src="/helm-golf-logo-transparent.png"
                      alt="GolfHelm"
                      fill
                      className="object-contain"
                      sizes="44px"
                    />
                  </div>
                  <div className="text-left">
                    <span className="font-semibold text-warm-900 block text-sm">GolfHelm</span>
                    <span className="text-xs text-warm-500">Team Management</span>
                  </div>
                </button>
              </Link>

              <Link href="#baseballhelm">
                <button
                  className="w-full sm:w-auto flex items-center gap-4 px-5 py-3.5 rounded-xl
                           bg-white border border-warm-200 shadow-sm
                           hover:border-blue-300 hover:shadow-md active:scale-[0.98] transition-all
                           focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2"
                >
                  <div className="w-11 h-11 relative flex-shrink-0">
                    <Image
                      src="/helm-baseball-logo.png"
                      alt="BaseballHelm"
                      fill
                      className="object-contain"
                      sizes="44px"
                    />
                  </div>
                  <div className="text-left">
                    <span className="font-semibold text-warm-900 block text-sm">BaseballHelm</span>
                    <span className="text-xs text-warm-500">Recruiting Platform</span>
                  </div>
                </button>
              </Link>
            </div>
          </motion.div>

          {/* Dashboard Mockup */}
          <motion.div
            className="relative"
            variants={fadeInUp}
          >
            <DashboardMockup />
          </motion.div>
        </div>

        {/* Features Strip */}
        <motion.div
          className="mt-16 md:mt-20 pt-10 border-t border-warm-200"
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
      </motion.section>

      {/* GolfHelm Section */}
      <GolfHelmSection />

      {/* BaseballHelm Section */}
      <BaseballHelmSection />

      <Footer />
    </main>
  )
}
