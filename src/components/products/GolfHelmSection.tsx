'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LiveRoundMockup, QualifierMockup, StatsMockup, CoachAIMockup } from './golf-mockups';
import { ArrowRight, Zap } from 'lucide-react';

/**
 * GolfHelm Product Section - Multi-Feature Showcase
 *
 * Design: Alternating feature spotlights with varied visual treatments
 * Each feature has its own unique mockup style
 */
export function GolfHelmSection() {
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
      id="golfhelm"
      className="relative py-24 md:py-32 overflow-hidden scroll-mt-20"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#FFFEFA] via-emerald-50/20 to-[#FFFEFA]" />

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
                src="/helm.transparent. golf-logo.png"
                alt="GolfHelm"
                fill
                className="object-contain"
                sizes="56px"
              />
            </div>
            <span className="text-2xl font-bold text-slate-900">GolfHelm</span>
          </div>

          {/* Headline */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 leading-[1.1] tracking-tight mb-6">
            Track every shot.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600">
              Develop every player.
            </span>
          </h2>

          {/* Subhead */}
          <p className="text-xl text-slate-500 mb-8">
            Complete team management from qualifying rounds to tournament day.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/golf/signup" className="group">
              <button className={cn(
                "flex items-center gap-2 px-6 py-3.5 rounded-full",
                "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700",
                "text-white font-semibold shadow-lg shadow-emerald-500/25",
                "transition-all duration-200"
              )}>
                <Zap className="w-5 h-5" />
                Start Free Trial
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
            <button className={cn(
              "px-6 py-3.5 rounded-full",
              "bg-white/70 hover:bg-white border border-slate-200",
              "text-slate-700 font-semibold shadow-sm transition-all duration-200"
            )}>
              Watch Demo
            </button>
          </div>
        </motion.div>

        {/* ===== FEATURE 1: LIVE ROUND TRACKING ===== */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-32"
        >
          <div className="order-2 lg:order-1">
            <LiveRoundMockup />
          </div>
          <div className="order-1 lg:order-2">
            <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-semibold rounded-full mb-4">
              Live Tracking
            </span>
            <h3 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Every shot, captured in real-time
            </h3>
            <p className="text-lg text-slate-500 mb-6 leading-relaxed">
              Players log shots from their phones during rounds. Coaches see live updates,
              hole-by-hole scores, and club selection data as it happens.
            </p>
            <ul className="space-y-3">
              {['Shot-by-shot tracking', 'Club selection & distances', 'GIR, putts, penalties', 'Works offline'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* ===== FEATURE 2: QUALIFIERS ===== */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-32"
        >
          <div>
            <span className="inline-block px-3 py-1 bg-amber-100 text-amber-700 text-sm font-semibold rounded-full mb-4">
              Qualifiers
            </span>
            <h3 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Run qualifiers like the pros
            </h3>
            <p className="text-lg text-slate-500 mb-6 leading-relaxed">
              Set up multi-round qualifiers with automatic scoring, live leaderboards,
              and transparent lineup selection. No more spreadsheet chaos.
            </p>
            <ul className="space-y-3">
              {['Multi-round events', 'Automatic leaderboards', 'Tiebreaker rules', 'Travel team selection'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <QualifierMockup />
          </div>
        </motion.div>

        {/* ===== FEATURE 3: STATS & ANALYTICS ===== */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-32"
        >
          <div className="order-2 lg:order-1">
            <StatsMockup />
          </div>
          <div className="order-1 lg:order-2">
            <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-sm font-semibold rounded-full mb-4">
              Analytics
            </span>
            <h3 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              See the trends that matter
            </h3>
            <p className="text-lg text-slate-500 mb-6 leading-relaxed">
              Track team and individual performance over time. Spot improvements,
              identify weaknesses, and make data-driven coaching decisions.
            </p>
            <ul className="space-y-3">
              {['Scoring trends', 'GIR & putting stats', 'Player comparisons', 'Season progress'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* ===== FEATURE 4: COACHHELM AI ===== */}
        <motion.div
          variants={itemVariants}
          className="relative"
        >
          {/* Special AI section with dark background */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 rounded-3xl p-8 md:p-12">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <span className="inline-block px-3 py-1 bg-emerald-500/20 text-emerald-300 text-sm font-semibold rounded-full mb-4">
                  ✨ CoachHelm AI
                </span>
                <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  Your AI coaching assistant
                </h3>
                <p className="text-lg text-slate-300 mb-6 leading-relaxed">
                  CoachHelm AI analyzes your team's data and surfaces actionable insights.
                  Spot declining performance, identify opportunities, and get personalized recommendations.
                </p>
                <ul className="space-y-3">
                  {['Performance alerts', 'Lineup suggestions', 'Practice recommendations', 'Player development tips'].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-400 flex items-center justify-center text-xs">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <CoachAIMockup />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
