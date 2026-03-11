'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { DiscoveryMockup, CompareMockup, VideoMockup, PipelineMiniMockup } from './baseball-mockups';
import { IconArrowRight, IconVideo } from '@/components/icons';

/**
 * BaseballHelm Product Section - Multi-Feature Showcase
 * Clean, professional design without vibe-coded patterns
 */
export function BaseballHelmSection() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.03 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const }
    }
  };

  return (
    <section
      id="baseballhelm"
      className="relative py-14 sm:py-20 md:py-28 overflow-hidden scroll-mt-20 bg-[#F5F0E8]"
    >
      <motion.div
        className="relative max-w-5xl mx-auto px-5 sm:px-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
      >
        {/* Hero Intro */}
        <motion.div variants={itemVariants} className="text-center max-w-2xl mx-auto mb-12 sm:mb-16 md:mb-20">
          <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 mb-5 sm:mb-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 relative">
              <Image
                src="/anim/helm-baseball-icon.png"
                alt="BaseballHelm"
                fill
                className="object-contain"
                sizes="96px"
              />
            </div>
            <span className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">BaseballHelm</span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 leading-[1.1] tracking-tight mb-4 sm:mb-5">
            Find talent.
            <br />
            <span className="text-emerald-600">Build champions.</span>
          </h2>

          <p className="text-base sm:text-lg text-slate-600 mb-6 sm:mb-8 leading-relaxed">
            The recruiting platform that turns prospects into commits.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/baseball/signup">
              <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                               bg-emerald-600 text-white font-semibold
                               hover:bg-emerald-700 active:scale-[0.98] transition-all">
                Start Recruiting Smarter
                <IconArrowRight size={16} />
              </button>
            </Link>
            <button className="w-full sm:w-auto px-6 py-3 rounded-lg
                             text-slate-700 font-medium border border-slate-200
                             hover:bg-white active:scale-[0.98] transition-all">
              Request Demo
            </button>
          </div>
        </motion.div>

        {/* Feature 1: Player Discovery */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center mb-14 sm:mb-20 md:mb-28"
        >
          <div className="order-2 lg:order-1">
            <DiscoveryMockup />
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-sm font-medium text-emerald-600 uppercase tracking-wide mb-3">
              Discovery
            </p>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 tracking-tight">
              Find your next commit
            </h3>
            <p className="text-slate-600 mb-5 leading-relaxed">
              Search thousands of prospects with powerful filters. Filter by velocity,
              exit velo, academics, position, geography, and more.
            </p>
            <ul className="space-y-2">
              {['12,000+ verified prospects', 'Advanced metric filters', 'Geographic targeting', 'Academic requirements'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Feature 2: Recruiting Pipeline */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center mb-14 sm:mb-20 md:mb-28"
        >
          <div>
            <p className="text-sm font-medium text-emerald-600 uppercase tracking-wide mb-3">
              Pipeline
            </p>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 tracking-tight">
              Track every prospect's journey
            </h3>
            <p className="text-slate-600 mb-5 leading-relaxed">
              Drag-and-drop pipeline management from first contact to commitment.
              Never lose track of where each recruit stands.
            </p>
            <ul className="space-y-2">
              {['Kanban-style board', 'Custom pipeline stages', 'Activity timeline', 'Team collaboration'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <PipelineMiniMockup />
          </div>
        </motion.div>

        {/* Feature 3: Player Comparison */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center mb-14 sm:mb-20 md:mb-28"
        >
          <div className="order-2 lg:order-1">
            <CompareMockup />
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-sm font-medium text-emerald-600 uppercase tracking-wide mb-3">
              Compare
            </p>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 tracking-tight">
              Make informed decisions
            </h3>
            <p className="text-slate-600 mb-5 leading-relaxed">
              Put prospects side-by-side to compare stats, metrics, and fit.
              See who's the best match for your program's needs.
            </p>
            <ul className="space-y-2">
              {['Side-by-side comparison', 'Stat highlights', 'Video sync playback', 'Share with staff'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Feature 4: Video Library */}
        <motion.div variants={itemVariants} className="relative">
          <div className="bg-gradient-to-b from-[#0c0c10] via-[#0e0f14] to-[#0a0a0e] rounded-2xl p-5 sm:p-8 md:p-12 overflow-hidden relative">
            {/* Subtle dot grid */}
            <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-96 h-96 bg-white/[0.02] blur-[120px] rounded-full" />

            <div className="relative grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/[0.06] text-white/80 text-sm font-semibold rounded-lg ring-1 ring-white/[0.08] mb-4">
                  <IconVideo size={14} />
                  Video Library
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4 tracking-tight">
                  All the film you need
                </h3>
                <p className="text-white/40 mb-5 leading-relaxed">
                  Organize game film, at-bats, bullpen sessions, and highlights.
                  Tag, clip, and share videos with your staff instantly.
                </p>
                <ul className="space-y-2">
                  {['Unlimited storage', 'Smart tagging', 'Quick clips', 'Staff sharing'].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-white/40 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
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
