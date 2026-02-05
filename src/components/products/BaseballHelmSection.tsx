'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DiscoveryMockup, CompareMockup, VideoMockup, PipelineMiniMockup } from './baseball-mockups';
import { IconArrowRight, IconSparkles, IconVideo, IconCheck } from '@/components/icons';

/**
 * BaseballHelm Product Section - Multi-Feature Showcase
 * Performance optimized - no infinite animations, minimal motion
 */
export function BaseballHelmSection() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const }
    }
  };

  return (
    <section
      id="baseballhelm"
      className="relative py-20 md:py-32 overflow-hidden scroll-mt-20"
    >
      {/* Background gradient - blue tint */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#FFFEFA] via-blue-50/30 to-[#FFFEFA]" />

      {/* Static decorative orbs - no animation for performance */}
      <div className="absolute top-40 right-0 w-80 h-80 bg-gradient-to-bl from-blue-200/40 to-indigo-100/20 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-40 -left-10 w-64 h-64 bg-gradient-to-tr from-indigo-100/30 to-transparent rounded-full blur-2xl pointer-events-none" />

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
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-14 h-14 relative">
              <Image
                src="/helm-baseball-logo.png"
                alt="BaseballHelm"
                fill
                className="object-contain"
                sizes="56px"
              />
            </div>
            <span className="text-2xl font-bold text-slate-900">BaseballHelm</span>
          </div>

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
              <button
                className={cn(
                  "w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-4 sm:py-3.5 rounded-2xl",
                  "bg-gradient-to-r from-blue-500 to-indigo-600",
                  "text-white font-semibold shadow-lg shadow-blue-500/30",
                  "active:scale-[0.98] hover:shadow-xl transition-all duration-150"
                )}
              >
                <IconSparkles size={20} />
                Start Recruiting Smarter
                <IconArrowRight size={16} className="group-hover:translate-x-1 transition-transform duration-150" />
              </button>
            </Link>
            <button
              className={cn(
                "w-full sm:w-auto px-7 py-4 sm:py-3.5 rounded-2xl",
                "bg-white/90 border border-slate-200/60",
                "text-slate-700 font-semibold shadow-sm",
                "hover:bg-white active:scale-[0.98] transition-all duration-150"
              )}
            >
              Request Demo
            </button>
          </div>
        </motion.div>

        {/* ===== FEATURE 1: PLAYER DISCOVERY ===== */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-8 lg:gap-20 items-center mb-20 md:mb-32"
        >
          <div className="order-2 lg:order-1">
            <DiscoveryMockup />
          </div>
          <div className="order-1 lg:order-2">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-100/80 text-blue-700 text-sm font-semibold rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Discovery
            </span>
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Find your next commit
            </h3>
            <p className="text-base sm:text-lg text-slate-500 mb-6 leading-relaxed">
              Search thousands of prospects with powerful filters. Filter by velocity,
              exit velo, academics, position, geography, and more.
            </p>
            <ul className="space-y-3">
              {['12,000+ verified prospects', 'Advanced metric filters', 'Geographic targeting', 'Academic requirements'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600 flex items-center justify-center text-xs font-bold shadow-sm">
                    <IconCheck size={12} />
                  </span>
                  {item}
                </li>
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
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-100/80 text-indigo-700 text-sm font-semibold rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              Pipeline
            </span>
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Track every prospect's journey
            </h3>
            <p className="text-base sm:text-lg text-slate-500 mb-6 leading-relaxed">
              Drag-and-drop pipeline management from first contact to commitment.
              Never lose track of where each recruit stands.
            </p>
            <ul className="space-y-3">
              {['Kanban-style board', 'Custom pipeline stages', 'Activity timeline', 'Team collaboration'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600 flex items-center justify-center text-xs font-bold shadow-sm">
                    <IconCheck size={12} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <PipelineMiniMockup />
          </div>
        </motion.div>

        {/* ===== FEATURE 3: PLAYER COMPARISON ===== */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-8 lg:gap-20 items-center mb-20 md:mb-32"
        >
          <div className="order-2 lg:order-1">
            <CompareMockup />
          </div>
          <div className="order-1 lg:order-2">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-purple-100/80 text-purple-700 text-sm font-semibold rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              Compare
            </span>
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Make informed decisions
            </h3>
            <p className="text-base sm:text-lg text-slate-500 mb-6 leading-relaxed">
              Put prospects side-by-side to compare stats, metrics, and fit.
              See who's the best match for your program's needs.
            </p>
            <ul className="space-y-3">
              {['Side-by-side comparison', 'Stat highlights', 'Video sync playback', 'Share with staff'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-100 to-violet-100 text-purple-600 flex items-center justify-center text-xs font-bold shadow-sm">
                    <IconCheck size={12} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* ===== FEATURE 4: VIDEO LIBRARY ===== */}
        <motion.div variants={itemVariants} className="relative">
          {/* Special video section with gradient background */}
          <div className="relative bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 rounded-3xl p-6 sm:p-8 md:p-12 overflow-hidden">
            {/* Static gradient orbs - no animation for performance */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none" />

            <div className="relative grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              <div>
                <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-500/20 text-blue-300 text-sm font-semibold rounded-full mb-4">
                  <IconVideo size={14} />
                  Video Library
                </span>
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
                  All the film you need
                </h3>
                <p className="text-base sm:text-lg text-slate-300 mb-6 leading-relaxed">
                  Organize game film, at-bats, bullpen sessions, and highlights.
                  Tag, clip, and share videos with your staff instantly.
                </p>
                <ul className="space-y-3">
                  {['Unlimited storage', 'Smart tagging', 'Quick clips', 'Staff sharing'].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-slate-300">
                      <span className="w-6 h-6 rounded-full bg-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-bold">
                        <IconCheck size={12} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <VideoMockup />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
