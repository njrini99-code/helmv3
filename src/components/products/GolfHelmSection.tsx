'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { LiveRoundMockup, QualifierMockup, StatsMockup, CoachAIMockup } from './golf-mockups';
import { IconArrowRight, IconSparkles } from '@/components/icons';

/**
 * GolfHelm Product Section - Multi-Feature Showcase
 * Clean, professional design without vibe-coded patterns
 */
export function GolfHelmSection() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.05 }
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
      id="golfhelm"
      className="relative py-20 md:py-28 overflow-hidden scroll-mt-20 bg-white"
    >
      <motion.div
        className="relative max-w-5xl mx-auto px-5 sm:px-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
      >
        {/* Hero Intro */}
        <motion.div variants={itemVariants} className="text-center max-w-2xl mx-auto mb-16 md:mb-20">
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="w-12 h-12 relative">
              <Image
                src="/helm-golf-logo-transparent.png"
                alt="GolfHelm"
                fill
                className="object-contain"
                sizes="48px"
              />
            </div>
            <span className="text-xl font-bold text-slate-900">GolfHelm</span>
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 leading-[1.1] tracking-tight mb-5">
            Track every shot.
            <br />
            <span className="text-emerald-600">Develop every player.</span>
          </h2>

          <p className="text-lg text-slate-600 mb-8 leading-relaxed">
            Complete team management from qualifying rounds to tournament day.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/golf/signup">
              <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                               bg-emerald-600 text-white font-semibold
                               hover:bg-emerald-700 active:scale-[0.98] transition-all">
                Start Free Trial
                <IconArrowRight size={16} />
              </button>
            </Link>
            <button className="w-full sm:w-auto px-6 py-3 rounded-lg
                             text-slate-700 font-medium border border-slate-200
                             hover:bg-slate-50 active:scale-[0.98] transition-all">
              Watch Demo
            </button>
          </div>
        </motion.div>

        {/* Feature 1: Live Round Tracking */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center mb-20 md:mb-28"
        >
          <div className="order-2 lg:order-1">
            <LiveRoundMockup />
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-sm font-medium text-emerald-600 uppercase tracking-wide mb-3">
              Live Tracking
            </p>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 tracking-tight">
              Every shot, captured in real-time
            </h3>
            <p className="text-slate-600 mb-5 leading-relaxed">
              Players log shots from their phones during rounds. Coaches see live updates,
              hole-by-hole scores, and club selection data as it happens.
            </p>
            <ul className="space-y-2">
              {['Shot-by-shot tracking', 'Club selection & distances', 'GIR, putts, penalties', 'Works offline'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Feature 2: Qualifiers */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center mb-20 md:mb-28"
        >
          <div>
            <p className="text-sm font-medium text-amber-600 uppercase tracking-wide mb-3">
              Qualifiers
            </p>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 tracking-tight">
              Run qualifiers like the pros
            </h3>
            <p className="text-slate-600 mb-5 leading-relaxed">
              Set up multi-round qualifiers with automatic scoring, live leaderboards,
              and transparent lineup selection. No more spreadsheet chaos.
            </p>
            <ul className="space-y-2">
              {['Multi-round events', 'Automatic leaderboards', 'Tiebreaker rules', 'Travel team selection'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <QualifierMockup />
          </div>
        </motion.div>

        {/* Feature 3: Stats & Analytics */}
        <motion.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center mb-20 md:mb-28"
        >
          <div className="order-2 lg:order-1">
            <StatsMockup />
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-sm font-medium text-blue-600 uppercase tracking-wide mb-3">
              Analytics
            </p>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 tracking-tight">
              See the trends that matter
            </h3>
            <p className="text-slate-600 mb-5 leading-relaxed">
              Track team and individual performance over time. Spot improvements,
              identify weaknesses, and make data-driven coaching decisions.
            </p>
            <ul className="space-y-2">
              {['Scoring trends', 'GIR & putting stats', 'Player comparisons', 'Season progress'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Feature 4: CoachHelm AI */}
        <motion.div variants={itemVariants} className="relative">
          <div className="bg-slate-900 rounded-2xl p-8 md:p-10 overflow-hidden">
            <div className="relative grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 text-emerald-400 text-sm font-medium rounded-md mb-4">
                  <IconSparkles size={14} />
                  CoachHelm AI
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4 tracking-tight">
                  Your AI coaching assistant
                </h3>
                <p className="text-slate-400 mb-5 leading-relaxed">
                  CoachHelm AI analyzes your team's data and surfaces actionable insights.
                  Spot declining performance, identify opportunities, and get personalized recommendations.
                </p>
                <ul className="space-y-2">
                  {['Performance alerts', 'Lineup suggestions', 'Practice recommendations', 'Player development tips'].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-slate-400 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
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
