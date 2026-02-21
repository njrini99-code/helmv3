'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { MobileNav } from '@/components/landing/MobileNav';

const ambitions = [
  {
    title: 'Make talent visible',
    description: 'Surface athletes on merit, not connections, with trusted performance data and real context.',
  },
  {
    title: 'Guide better decisions',
    description: 'Give coaches a clear, unbiased view of fit, readiness, and trajectory across every level.',
  },
  {
    title: 'Unify the workflow',
    description: 'Replace scattered tools with one system that connects recruiting, development, and communication.',
  },
];

const principles = [
  {
    title: 'Clarity over noise',
    description: 'We focus on the signal that matters most to athletes and programs.',
  },
  {
    title: 'Athlete-centered',
    description: 'Every workflow should help players improve, get seen, and land in the right environment.',
  },
  {
    title: 'Trust and accountability',
    description: 'We build with integrity, privacy, and long-term outcomes as the baseline.',
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

export default function AboutPage() {
  const heroRef = useRef(null);

  return (
    <div className="min-h-screen bg-[#FAFAF8] overflow-x-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg focus:shadow-lg">
        Skip to main content
      </a>
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="absolute inset-0 bg-[#FAFAF8]/90 backdrop-blur-md border-b border-warm-200/50" />
        <div className="relative max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/Helm-Logo-New-Main.png"
              alt="Helm Sports Labs"
              width={36}
              height={36}
              className="w-9 h-9 object-contain"
            />
            <span className="font-semibold text-warm-900 text-base tracking-tight">
              Helm Sports Labs
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/"
              className="px-4 py-2 text-warm-500 hover:text-warm-900 rounded-lg transition-colors text-sm font-medium"
            >
              Home
            </Link>
            <Link
              href="/products"
              className="px-4 py-2 text-warm-500 hover:text-warm-900 rounded-lg transition-colors text-sm font-medium"
            >
              Products
            </Link>
            <span className="px-4 py-2 text-warm-900 text-sm font-medium">
              About
            </span>
            <Link
              href="/golf/login"
              className="ml-3 px-5 py-2 bg-warm-900 text-white font-medium rounded-lg
                       hover:bg-warm-800 active:scale-[0.98] transition-all text-sm"
            >
              Sign In
            </Link>
          </nav>

          {/* Mobile Nav */}
          <div className="md:hidden">
            <MobileNav isProductsPage />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section
        id="main-content"
        ref={heroRef}
        className="relative pt-28 pb-16 md:pt-36 md:pb-20 px-5"
      >
        <motion.div
          className="relative max-w-3xl mx-auto text-center"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <motion.p
            variants={fadeInUp}
            className="text-sm font-medium text-primary-600 tracking-wide uppercase mb-4"
          >
            Our Mission
          </motion.p>

          <motion.h1
            variants={fadeInUp}
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-warm-900 tracking-tight leading-[1.1] mb-6"
          >
            Build a recruiting system athletes can trust
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="text-lg text-warm-600 leading-relaxed max-w-2xl mx-auto"
          >
            Recruiting should reward talent, effort, and fit. We're creating the platform
            that gives athletes visibility and gives coaches the confidence to make the right call.
          </motion.p>
        </motion.div>
      </section>

      {/* Why Section */}
      <section className="py-16 md:py-20 px-5">
        <motion.div
          className="max-w-5xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-start">
            <motion.div variants={fadeInUp}>
              <p className="text-sm font-medium text-warm-500 uppercase tracking-wide mb-3">
                The Problem
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-warm-900 mb-6 tracking-tight">
                Why we exist
              </h2>
              <p className="text-lg text-warm-600 leading-relaxed mb-5">
                The recruiting process is fragmented. Athletes have to prove themselves
                across disconnected platforms, and coaches are forced to make decisions
                without a complete picture of performance or potential.
              </p>
              <p className="text-lg text-warm-600 leading-relaxed">
                Helm exists to bring transparency and structure to that journey, so the
                right athletes and programs can find each other with confidence.
              </p>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              className="relative"
            >
              <div className="bg-white rounded-2xl border border-warm-200 p-8 shadow-sm">
                <div className="flex items-center gap-4 mb-5">
                  <Image
                    src="/Helm-Logo-New-Main.png"
                    alt="Helm Sports Labs"
                    width={44}
                    height={44}
                    className="w-11 h-11 object-contain"
                  />
                  <div>
                    <p className="text-xs font-medium text-warm-500 uppercase tracking-wide">Our Belief</p>
                    <p className="text-lg font-semibold text-warm-900">Opportunity should be earned</p>
                  </div>
                </div>
                <p className="text-warm-600 leading-relaxed">
                  We're building a recruiting system that values consistency, growth, and fit—
                  giving every athlete a real chance to be discovered.
                </p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Ambitions Section */}
      <section className="py-16 md:py-20 px-5 bg-white">
        <motion.div
          className="max-w-5xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeInUp} className="text-center mb-12">
            <p className="text-sm font-medium text-warm-500 uppercase tracking-wide mb-3">
              What We're Building
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-warm-900 mb-4 tracking-tight">
              Our ambitions
            </h2>
            <p className="text-lg text-warm-600 max-w-xl mx-auto">
              A modern platform that aligns athlete development with recruiting outcomes.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {ambitions.map((item, index) => (
              <motion.div
                key={item.title}
                variants={fadeInUp}
                className="group"
              >
                <div className="h-full bg-[#FAFAF8] rounded-xl p-6 border border-warm-100
                              hover:border-warm-200 hover:shadow-sm transition-all duration-200">
                  <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-600
                                flex items-center justify-center text-sm font-semibold mb-4">
                    {index + 1}
                  </div>
                  <h3 className="font-semibold text-warm-900 text-lg mb-2">
                    {item.title}
                  </h3>
                  <p className="text-warm-600 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Principles Section */}
      <section className="py-16 md:py-20 px-5">
        <motion.div
          className="max-w-5xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeInUp} className="text-center mb-12">
            <p className="text-sm font-medium text-warm-500 uppercase tracking-wide mb-3">
              How We Work
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-warm-900 mb-4 tracking-tight">
              Our principles
            </h2>
            <p className="text-lg text-warm-600 max-w-xl mx-auto">
              Values that keep us honest and focused on outcomes.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {principles.map((item) => (
              <motion.div
                key={item.title}
                variants={fadeInUp}
                className="group"
              >
                <div className="h-full bg-white rounded-xl p-6 border border-warm-200
                              hover:border-primary-200 hover:shadow-sm transition-all duration-200">
                  <div className="w-1 h-8 bg-primary-500 rounded-full mb-4" />
                  <h3 className="font-semibold text-warm-900 text-lg mb-2">
                    {item.title}
                  </h3>
                  <p className="text-warm-600 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-20 px-5">
        <motion.div
          className="max-w-3xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeInUp}
        >
          <div className="bg-warm-900 rounded-2xl p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 tracking-tight">
              Ready to get started?
            </h2>
            <p className="text-warm-400 text-lg mb-8 max-w-lg mx-auto">
              Start building a clearer recruiting process for your program or your athletes.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/golf/signup">
                <button
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3
                           bg-white text-warm-900 font-semibold rounded-lg
                           hover:bg-warm-100 active:scale-[0.98] transition-all"
                >
                  Create Free Account
                  <ArrowRight size={18} />
                </button>
              </Link>
              <Link href="/#demo">
                <button
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3
                           text-white font-medium rounded-lg border border-white/20
                           hover:bg-white/10 active:scale-[0.98] transition-all"
                >
                  Request Demo
                </button>
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-5 border-t border-warm-200">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Image
                src="/Helm-Logo-New-Main.png"
                alt="Helm Sports Labs"
                width={28}
                height={28}
                className="w-7 h-7 object-contain"
              />
              <span className="text-sm font-medium text-warm-600">
                Helm Sports Labs
              </span>
            </div>

            <p className="text-warm-500 text-sm">
              © {new Date().getFullYear()} Helm Sports Labs. All rights reserved.
            </p>

            <div className="flex items-center gap-6">
              {['Privacy', 'Terms'].map((item) => (
                <Link
                  key={item}
                  href={`/${item.toLowerCase()}`}
                  className="text-warm-500 hover:text-warm-900 text-sm transition-colors"
                >
                  {item}
                </Link>
              ))}
              <a
                href="mailto:support@helmsportslab.com"
                className="text-warm-500 hover:text-warm-900 text-sm transition-colors"
              >
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
