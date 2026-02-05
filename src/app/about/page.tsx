'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight, Compass, Layers, Sparkles, Target, ChevronRight } from 'lucide-react';
import { MobileNav } from '@/components/landing/MobileNav';

const ambitions = [
  {
    icon: Target,
    title: 'Make talent visible',
    description: 'Surface athletes on merit, not connections, with trusted performance data and real context.',
    gradient: 'from-emerald-500 to-teal-500',
    bgGlow: 'bg-emerald-500/20',
  },
  {
    icon: Compass,
    title: 'Guide better decisions',
    description: 'Give coaches a clear, unbiased view of fit, readiness, and trajectory across every level.',
    gradient: 'from-blue-500 to-indigo-500',
    bgGlow: 'bg-blue-500/20',
  },
  {
    icon: Layers,
    title: 'Unify the workflow',
    description: 'Replace scattered tools with one system that connects recruiting, development, and communication.',
    gradient: 'from-violet-500 to-purple-500',
    bgGlow: 'bg-violet-500/20',
  },
];

const principles = [
  {
    icon: Sparkles,
    title: 'Clarity over noise',
    description: 'We focus on the signal that matters most to athletes and programs.',
    number: '01',
  },
  {
    icon: Target,
    title: 'Athlete-centered',
    description: 'Every workflow should help players improve, get seen, and land in the right environment.',
    number: '02',
  },
  {
    icon: Compass,
    title: 'Trust and accountability',
    description: 'We build with integrity, privacy, and long-term outcomes as the baseline.',
    number: '03',
  },
];

// Reusable animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
};

export default function AboutPage() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });

  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, 50]);

  return (
    <div className="min-h-screen bg-[#FAFAF8] overflow-x-hidden">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="absolute inset-0 bg-[#FAFAF8]/80 backdrop-blur-xl border-b border-slate-200/40" />
        <div className="relative max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <motion.div
              whileHover={{ rotate: -5 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Image
                src="/Helm-Logo-New-Main.png"
                alt="Helm Sports Labs"
                width={36}
                height={36}
                className="w-9 h-9 object-contain"
                style={{ mixBlendMode: 'multiply' }}
              />
            </motion.div>
            <span className="font-semibold text-slate-900 text-base tracking-tight">
              Helm Sports Labs
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/"
              className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 rounded-xl transition-all text-sm font-medium"
            >
              Home
            </Link>
            <Link
              href="/products"
              className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 rounded-xl transition-all text-sm font-medium"
            >
              Products
            </Link>
            <span className="px-4 py-2 text-slate-900 bg-slate-100/80 rounded-xl text-sm font-medium">
              About
            </span>
            <Link
              href="/golf/login"
              className="ml-2 px-5 py-2.5 bg-slate-900 text-white font-medium rounded-xl
                       hover:bg-slate-800 active:scale-[0.98] transition-all text-sm"
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
      <motion.section
        ref={heroRef}
        style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
        className="relative pt-28 pb-16 md:pt-36 md:pb-24 px-5"
      >
        {/* Decorative gradient orbs */}
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-gradient-to-br from-green-200/40 to-emerald-100/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-72 h-72 bg-gradient-to-br from-blue-100/30 to-transparent rounded-full blur-3xl pointer-events-none" />

        <motion.div
          className="relative max-w-4xl mx-auto text-center"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <motion.div
            variants={fadeInUp}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full
                     bg-white/90 backdrop-blur-sm border border-slate-200/60
                     shadow-[0_2px_12px_rgba(0,0,0,0.04)] mb-6"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs uppercase tracking-[0.15em] text-slate-600 font-semibold">
              Why Helm Exists
            </span>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 tracking-tight leading-[1.1] mb-6"
          >
            Build a recruiting system
            <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 via-emerald-500 to-teal-500">
              {' '}athletes can trust
            </span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto"
          >
            Recruiting should reward talent, effort, and fit. We&apos;re creating the platform
            that gives athletes visibility and gives coaches the confidence to make the right call.
          </motion.p>
        </motion.div>
      </motion.section>

      {/* Why Section */}
      <section className="py-16 md:py-24 px-5">
        <motion.div
          className="max-w-6xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-start">
            <motion.div variants={fadeInUp}>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold mb-4 block">
                The Problem
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6 tracking-tight">Why</h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-5">
                The recruiting process is fragmented. Athletes have to prove themselves
                across disconnected platforms, and coaches are forced to make decisions
                without a complete picture of performance or potential.
              </p>
              <p className="text-lg text-slate-600 leading-relaxed">
                Helm exists to bring transparency and structure to that journey, so the
                right athletes and programs can find each other with confidence.
              </p>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="relative"
            >
              {/* Card with 3D effect */}
              <div className="relative rounded-3xl overflow-hidden">
                {/* Glass border effect */}
                <div className="absolute inset-0 rounded-3xl border border-white/60 z-10 pointer-events-none" />

                {/* Card content */}
                <div className="relative bg-gradient-to-br from-white via-slate-50/80 to-green-50/40
                              backdrop-blur-xl p-7 md:p-9
                              shadow-[0_8px_40px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-4 mb-6">
                    <motion.div
                      whileHover={{ rotate: 10, scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    >
                      <Image
                        src="/Helm-Logo-New-Main.png"
                        alt="Helm Sports Labs"
                        width={48}
                        height={48}
                        className="w-12 h-12 object-contain"
                        style={{ mixBlendMode: 'multiply' }}
                      />
                    </motion.div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Our Why</p>
                      <p className="text-lg font-semibold text-slate-900">Opportunity should be earned</p>
                    </div>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    We&apos;re building a recruiting system that values consistency, growth, and fit,
                    giving every athlete a real chance to be discovered.
                  </p>

                  {/* Decorative elements */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-green-100/50 to-transparent rounded-bl-full" />
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Ambitions Section */}
      <section className="py-16 md:py-24 px-5 bg-white">
        <motion.div
          className="max-w-6xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeInUp} className="text-center mb-12 md:mb-16">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold mb-4 block">
              Our Mission
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              What we want to accomplish
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              A single, modern platform that aligns athlete development with recruiting outcomes.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-5">
            {ambitions.map((item, index) => (
              <motion.div
                key={item.title}
                variants={fadeInUp}
                whileHover={{ y: -6, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="group relative cursor-pointer"
              >
                {/* Glow effect on hover */}
                <div className={`absolute inset-0 ${item.bgGlow} rounded-3xl blur-2xl opacity-0
                               group-hover:opacity-60 transition-opacity duration-500`} />

                <div className="relative bg-[#FAFAF8] rounded-2xl p-6 md:p-7
                              border border-slate-200/60
                              group-hover:border-slate-300/80 group-hover:shadow-xl
                              transition-all duration-300">
                  {/* Icon with gradient background */}
                  <motion.div
                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.gradient}
                              flex items-center justify-center mb-5 shadow-lg`}
                    whileHover={{ rotate: -5 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <item.icon size={24} className="text-white" strokeWidth={2} />
                  </motion.div>

                  <h3 className="font-semibold text-slate-900 text-lg mb-2 group-hover:text-transparent
                               group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:${item.gradient}
                               transition-all">
                    {item.title}
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    {item.description}
                  </p>

                  {/* Arrow indicator */}
                  <motion.div
                    className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100
                              transition-opacity duration-200"
                    initial={{ x: -10 }}
                    whileHover={{ x: 0 }}
                  >
                    <ChevronRight size={20} className="text-slate-400" />
                  </motion.div>

                  {/* Card number */}
                  <span className="absolute top-6 right-6 text-5xl font-bold text-slate-100
                                 group-hover:text-slate-200 transition-colors">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Principles Section */}
      <section className="py-16 md:py-24 px-5">
        <motion.div
          className="max-w-6xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeInUp} className="text-center mb-12 md:mb-16">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold mb-4 block">
              Our Values
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              How we build
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Principles that keep us honest and focused on outcomes.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-5">
            {principles.map((item) => (
              <motion.div
                key={item.title}
                variants={fadeInUp}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="group relative"
              >
                <div className="relative bg-white rounded-2xl p-6 md:p-7
                              border border-slate-200/60 overflow-hidden
                              group-hover:border-green-200 group-hover:shadow-lg
                              transition-all duration-300">
                  {/* Large number background */}
                  <span className="absolute -top-4 -right-2 text-8xl font-bold text-slate-100/80
                                 group-hover:text-green-100 transition-colors duration-300 select-none">
                    {item.number}
                  </span>

                  <div className="relative">
                    {/* Icon */}
                    <motion.div
                      className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50
                               border border-green-100 flex items-center justify-center mb-5
                               group-hover:from-green-100 group-hover:to-emerald-100
                               transition-colors duration-300"
                      whileHover={{ rotate: 5 }}
                      transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    >
                      <item.icon size={22} className="text-green-600" />
                    </motion.div>

                    <h3 className="font-semibold text-slate-900 text-lg mb-2
                                 group-hover:text-green-700 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-slate-600 text-sm leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 px-5">
        <motion.div
          className="max-w-4xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeInUp}
        >
          <motion.div
            className="relative rounded-3xl overflow-hidden"
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />

            {/* Animated gradient orbs */}
            <motion.div
              className="absolute top-0 right-0 w-96 h-96 bg-green-500/15 rounded-full blur-3xl"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.15, 0.25, 0.15]
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.div
              className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.1, 0.2, 0.1]
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 1
              }}
            />

            {/* Content */}
            <div className="relative p-8 md:p-14 text-center">
              <motion.h2
                className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                Ready to get started?
              </motion.h2>
              <motion.p
                className="text-slate-400 text-lg mb-8 max-w-xl mx-auto"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Start building a clearer recruiting process for your program or your athletes.
              </motion.p>

              <motion.div
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Link href="/golf/signup">
                  <motion.button
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4
                             bg-gradient-to-r from-green-500 to-emerald-600
                             text-white font-semibold rounded-2xl
                             shadow-lg shadow-green-500/30"
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    Create Free Account
                    <ArrowRight size={20} />
                  </motion.button>
                </Link>
                <Link href="/#demo">
                  <motion.button
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4
                             bg-white/10 backdrop-blur-sm border border-white/20
                             text-white font-semibold rounded-2xl"
                    whileHover={{ scale: 1.03, backgroundColor: "rgba(255,255,255,0.2)" }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    Request Demo
                  </motion.button>
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-5 border-t border-slate-200/60">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <motion.div
              className="flex items-center gap-3"
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Image
                src="/Helm-Logo-New-Main.png"
                alt="Helm Sports Labs"
                width={32}
                height={32}
                className="w-8 h-8 object-contain"
                style={{ mixBlendMode: 'multiply' }}
              />
              <span className="text-sm font-medium text-slate-600">
                Helm Sports Labs
              </span>
            </motion.div>

            <p className="text-slate-500 text-sm">
              © {new Date().getFullYear()} Helm Sports Labs. All rights reserved.
            </p>

            <div className="flex items-center gap-6">
              {['Privacy', 'Terms', 'Help'].map((item) => (
                <Link
                  key={item}
                  href={`/${item.toLowerCase()}`}
                  className="text-slate-500 hover:text-slate-900 text-sm transition-colors"
                >
                  {item}
                </Link>
              ))}
              <a
                href="mailto:support@helmsportslab.com"
                className="text-slate-500 hover:text-slate-900 text-sm transition-colors"
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
