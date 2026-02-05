'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DiscoveryMockup, CompareMockup, VideoMockup, PipelineMiniMockup } from './baseball-mockups';
import { IconArrowRight, IconSparkles, IconVideo, IconCheck } from '@/components/icons';

/**
 * BaseballHelm Product Section - Multi-Feature Showcase
 *
 * Design: Alternating feature spotlights with varied visual treatments
 * Each feature has its own unique mockup style
 */
export function BaseballHelmSection() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }
    }
  };

  return (
    <section
      id="baseballhelm"
      className="relative py-20 md:py-32 overflow-hidden scroll-mt-20"
    >
      {/* Background gradient - blue tint */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#FFFEFA] via-blue-50/30 to-[#FFFEFA]" />

      {/* Animated decorative orbs */}
      <motion.div
        className="absolute top-40 right-0 w-80 h-80 bg-gradient-to-bl from-blue-200/40 to-indigo-100/20 rounded-full blur-3xl pointer-events-none"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.4, 0.5, 0.4],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-40 -left-10 w-64 h-64 bg-gradient-to-tr from-indigo-100/30 to-transparent rounded-full blur-3xl pointer-events-none"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.3, 0.4, 0.3],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      <motion.div
        className="relative max-w-6xl mx-auto px-5 sm:px-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
      >
        {/* ===== HERO INTRO ===== */}
        <motion.div variants={itemVariants} className="text-center max-w-3xl mx-auto mb-16 md:mb-20">
          {/* Logo + Brand */}
          <motion.div
            className="flex items-center justify-center gap-3 mb-6"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <motion.div
              className="w-14 h-14 relative"
              whileHover={{ rotate: 10 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Image
                src="/helm-baseball-logo.png"
                alt="BaseballHelm"
                fill
                className="object-contain"
                sizes="56px"
              />
            </motion.div>
            <span className="text-2xl font-bold text-slate-900">BaseballHelm</span>
          </motion.div>

          {/* Headline */}
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 leading-[1.1] tracking-tight mb-6">
            Find talent.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500">
              Build champions.
            </span>
          </h2>

          {/* Subhead */}
          <p className="text-lg sm:text-xl text-slate-500 mb-8 leading-relaxed">
            The recruiting platform that turns prospects into commits.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link href="/baseball/signup" className="group w-full sm:w-auto">
              <motion.button
                className={cn(
                  "w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-4 sm:py-3.5 rounded-2xl",
                  "bg-gradient-to-r from-blue-500 to-indigo-600",
                  "text-white font-semibold shadow-lg shadow-blue-500/30",
                  "transition-all duration-200"
                )}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <IconSparkles size={20} />
                Start Recruiting Smarter
                <IconArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </Link>
            <motion.button
              className={cn(
                "w-full sm:w-auto px-7 py-4 sm:py-3.5 rounded-2xl",
                "bg-white/80 backdrop-blur-sm border border-slate-200/60",
                "text-slate-700 font-semibold shadow-sm transition-all duration-200"
              )}
              whileHover={{ scale: 1.03, backgroundColor: "rgba(255,255,255,1)" }}
              whileTap={{ scale: 0.98 }}
            >
              Request Demo
            </motion.button>
          </div>
        </motion.div>

        {/* ===== FEATURE 1: PLAYER DISCOVERY ===== */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-8 lg:gap-20 items-center mb-20 md:mb-32"
        >
          <motion.div
            className="order-2 lg:order-1"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <DiscoveryMockup />
          </motion.div>
          <div className="order-1 lg:order-2">
            <motion.span
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-100/80 backdrop-blur-sm text-blue-700 text-sm font-semibold rounded-full mb-4"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Discovery
            </motion.span>
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Find your next commit
            </h3>
            <p className="text-base sm:text-lg text-slate-500 mb-6 leading-relaxed">
              Search thousands of prospects with powerful filters. Filter by velocity,
              exit velo, academics, position, geography, and more.
            </p>
            <ul className="space-y-3">
              {['12,000+ verified prospects', 'Advanced metric filters', 'Geographic targeting', 'Academic requirements'].map((item, i) => (
                <motion.li
                  key={item}
                  className="flex items-center gap-3 text-slate-600"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  viewport={{ once: true }}
                >
                  <motion.span
                    className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600 flex items-center justify-center text-xs font-bold shadow-sm"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <IconCheck size={12} />
                  </motion.span>
                  {item}
                </motion.li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* ===== FEATURE 2: RECRUITING PIPELINE ===== */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-8 lg:gap-20 items-center mb-20 md:mb-32"
        >
          <div>
            <motion.span
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-100/80 backdrop-blur-sm text-indigo-700 text-sm font-semibold rounded-full mb-4"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              Pipeline
            </motion.span>
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Track every prospect's journey
            </h3>
            <p className="text-base sm:text-lg text-slate-500 mb-6 leading-relaxed">
              Drag-and-drop pipeline management from first contact to commitment.
              Never lose track of where each recruit stands.
            </p>
            <ul className="space-y-3">
              {['Kanban-style board', 'Custom pipeline stages', 'Activity timeline', 'Team collaboration'].map((item, i) => (
                <motion.li
                  key={item}
                  className="flex items-center gap-3 text-slate-600"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  viewport={{ once: true }}
                >
                  <motion.span
                    className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600 flex items-center justify-center text-xs font-bold shadow-sm"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <IconCheck size={12} />
                  </motion.span>
                  {item}
                </motion.li>
              ))}
            </ul>
          </div>
          <motion.div
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <PipelineMiniMockup />
          </motion.div>
        </motion.div>

        {/* ===== FEATURE 3: PLAYER COMPARISON ===== */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-8 lg:gap-20 items-center mb-20 md:mb-32"
        >
          <motion.div
            className="order-2 lg:order-1"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <CompareMockup />
          </motion.div>
          <div className="order-1 lg:order-2">
            <motion.span
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-purple-100/80 backdrop-blur-sm text-purple-700 text-sm font-semibold rounded-full mb-4"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              Compare
            </motion.span>
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Make informed decisions
            </h3>
            <p className="text-base sm:text-lg text-slate-500 mb-6 leading-relaxed">
              Put prospects side-by-side to compare stats, metrics, and fit.
              See who's the best match for your program's needs.
            </p>
            <ul className="space-y-3">
              {['Side-by-side comparison', 'Stat highlights', 'Video sync playback', 'Share with staff'].map((item, i) => (
                <motion.li
                  key={item}
                  className="flex items-center gap-3 text-slate-600"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  viewport={{ once: true }}
                >
                  <motion.span
                    className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-100 to-violet-100 text-purple-600 flex items-center justify-center text-xs font-bold shadow-sm"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <IconCheck size={12} />
                  </motion.span>
                  {item}
                </motion.li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* ===== FEATURE 4: VIDEO LIBRARY ===== */}
        <motion.div
          variants={itemVariants}
          className="relative"
          whileHover={{ scale: 1.01 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          {/* Special video section with gradient background */}
          <div className="relative bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 rounded-3xl p-6 sm:p-8 md:p-12 overflow-hidden">
            {/* Animated gradient orbs */}
            <motion.div
              className="absolute top-0 right-0 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.2, 0.3, 0.2]
              }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/15 rounded-full blur-3xl"
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.15, 0.25, 0.15]
              }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            />

            <div className="relative grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              <div>
                <motion.span
                  className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-500/20 backdrop-blur-sm text-blue-300 text-sm font-semibold rounded-full mb-4"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <motion.span
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <IconVideo size={14} />
                  </motion.span>
                  Video Library
                </motion.span>
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
                  All the film you need
                </h3>
                <p className="text-base sm:text-lg text-slate-300 mb-6 leading-relaxed">
                  Organize game film, at-bats, bullpen sessions, and highlights.
                  Tag, clip, and share videos with your staff instantly.
                </p>
                <ul className="space-y-3">
                  {['Unlimited storage', 'Smart tagging', 'Quick clips', 'Staff sharing'].map((item, i) => (
                    <motion.li
                      key={item}
                      className="flex items-center gap-3 text-slate-300"
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      viewport={{ once: true }}
                    >
                      <motion.span
                        className="w-6 h-6 rounded-full bg-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-bold"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        <IconCheck size={12} />
                      </motion.span>
                      {item}
                    </motion.li>
                  ))}
                </ul>
              </div>
              <motion.div
                whileHover={{ scale: 1.02, y: -4 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              >
                <VideoMockup />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
