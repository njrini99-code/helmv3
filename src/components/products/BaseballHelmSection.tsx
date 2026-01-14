'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DiscoveryMockup, CompareMockup, VideoMockup, PipelineMiniMockup } from './baseball-mockups';
import { ArrowRight, Sparkles } from 'lucide-react';

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
      transition: { staggerChildren: 0.15, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const }
    }
  };

  return (
    <section
      id="baseballhelm"
      className="relative py-24 md:py-32 overflow-hidden scroll-mt-20"
    >
      {/* Background gradient - blue tint */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#FFFEFA] via-blue-50/30 to-[#FFFEFA]" />

      <motion.div
        className="relative max-w-6xl mx-auto px-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
      >
        {/* ===== HERO INTRO ===== */}
        <motion.div variants={itemVariants} className="text-center max-w-3xl mx-auto mb-20">
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
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 leading-[1.1] tracking-tight mb-6">
            Find talent.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              Build champions.
            </span>
          </h2>

          {/* Subhead */}
          <p className="text-xl text-slate-500 mb-8">
            The recruiting platform that turns prospects into commits.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/baseball/signup" className="group">
              <button className={cn(
                "flex items-center gap-2 px-6 py-3.5 rounded-full",
                "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700",
                "text-white font-semibold shadow-lg shadow-blue-500/25",
                "transition-all duration-200"
              )}>
                <Sparkles className="w-5 h-5" />
                Start Recruiting Smarter
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
            <button className={cn(
              "px-6 py-3.5 rounded-full",
              "bg-white/70 hover:bg-white border border-slate-200",
              "text-slate-700 font-semibold shadow-sm transition-all duration-200"
            )}>
              Request Demo
            </button>
          </div>
        </motion.div>

        {/* ===== FEATURE 1: PLAYER DISCOVERY ===== */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-32"
        >
          <div className="order-2 lg:order-1">
            <DiscoveryMockup />
          </div>
          <div className="order-1 lg:order-2">
            <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-sm font-semibold rounded-full mb-4">
              Discovery
            </span>
            <h3 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Find your next commit
            </h3>
            <p className="text-lg text-slate-500 mb-6 leading-relaxed">
              Search thousands of prospects with powerful filters. Filter by velocity,
              exit velo, academics, position, geography, and more.
            </p>
            <ul className="space-y-3">
              {['12,000+ verified prospects', 'Advanced metric filters', 'Geographic targeting', 'Academic requirements'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* ===== FEATURE 2: RECRUITING PIPELINE ===== */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-32"
        >
          <div>
            <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 text-sm font-semibold rounded-full mb-4">
              Pipeline
            </span>
            <h3 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Track every prospect's journey
            </h3>
            <p className="text-lg text-slate-500 mb-6 leading-relaxed">
              Drag-and-drop pipeline management from first contact to commitment.
              Never lose track of where each recruit stands.
            </p>
            <ul className="space-y-3">
              {['Kanban-style board', 'Custom pipeline stages', 'Activity timeline', 'Team collaboration'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">✓</span>
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
          className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-32"
        >
          <div className="order-2 lg:order-1">
            <CompareMockup />
          </div>
          <div className="order-1 lg:order-2">
            <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-sm font-semibold rounded-full mb-4">
              Compare
            </span>
            <h3 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Make informed decisions
            </h3>
            <p className="text-lg text-slate-500 mb-6 leading-relaxed">
              Put prospects side-by-side to compare stats, metrics, and fit.
              See who's the best match for your program's needs.
            </p>
            <ul className="space-y-3">
              {['Side-by-side comparison', 'Stat highlights', 'Video sync playback', 'Share with staff'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* ===== FEATURE 4: VIDEO LIBRARY ===== */}
        <motion.div
          variants={itemVariants}
          className="relative"
        >
          {/* Special video section with gradient background */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 rounded-3xl p-8 md:p-12">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-300 text-sm font-semibold rounded-full mb-4">
                  🎬 Video Library
                </span>
                <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  All the film you need
                </h3>
                <p className="text-lg text-slate-300 mb-6 leading-relaxed">
                  Organize game film, at-bats, bullpen sessions, and highlights.
                  Tag, clip, and share videos with your staff instantly.
                </p>
                <ul className="space-y-3">
                  {['Unlimited storage', 'Smart tagging', 'Quick clips', 'Staff sharing'].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-blue-500/30 text-blue-400 flex items-center justify-center text-xs">✓</span>
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
