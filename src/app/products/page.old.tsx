'use client'

import { useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import Link from 'next/link'
import { Navigation } from '@/components/landing/Navigation'
import { Footer } from '@/components/landing/Footer'
import { 
  Target, Flag, Trophy,
  Brain, Sparkles, TrendingUp, Check, ChevronRight,
  ArrowRight,
  Monitor, Tablet, Smartphone, Zap, Database, GripVertical
} from 'lucide-react'

// ============================================================================
// DESIGN PHILOSOPHY
// ============================================================================
// 
// Premium SaaS aesthetic inspired by Linear, Stripe, Vercel:
// - Cream/neutral backgrounds (warm, professional)
// - Helm green as strategic accent
// - Subtle animations (not overwhelming)
// - Clean typography with excellent contrast
// - Glassmorphism only where it makes sense
// - Product screenshots front and center
// - Trust through clarity, not mystery
//
// ============================================================================

// ============================================================================
// HERO SECTION - Clean, Direct, Professional
// ============================================================================

function HeroSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  return (
    <section ref={ref} className="relative pt-32 pb-20 md:pt-40 md:pb-32 bg-gradient-to-b from-neutral-50 to-white overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(0 0 0 / 0.15) 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* Subtle gradient accent - not overwhelming */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-helm-green-500/5 rounded-full blur-3xl" />
      
      <div className="relative max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-4xl mx-auto"
        >
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-green-50 border border-helm-green-200/50 mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-helm-green-500 animate-pulse" />
            <span className="text-sm font-medium text-helm-green-700">Two Products, One Platform</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-neutral-900 mb-6 tracking-tight leading-[1.1]">
            Built for the sports{' '}
            <span className="text-helm-green-600">you coach</span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-neutral-600 mb-12 leading-relaxed max-w-2xl mx-auto">
            GolfHelm for college golf teams. BaseballHelm for recruiting. 
            Both powered by the same unified platform.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link href="#golfhelm">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-8 py-4 rounded-xl bg-helm-green-600 text-white font-semibold shadow-lg shadow-helm-green-600/25 hover:bg-helm-green-700 transition-colors"
              >
                Explore GolfHelm
              </motion.button>
            </Link>
            <Link href="#baseballhelm">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-8 py-4 rounded-xl bg-white text-neutral-900 font-semibold border-2 border-neutral-200 hover:border-neutral-300 transition-colors"
              >
                Explore BaseballHelm
              </motion.button>
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap justify-center gap-8 text-sm text-neutral-500">
            {['14-day free trial', 'No credit card required', 'Cancel anytime'].map(item => (
              <span key={item} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-helm-green-600" />
                {item}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ============================================================================
// PLATFORM OVERVIEW - Clean Card Grid
// ============================================================================

function PlatformOverviewSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-20%' })

  const features = [
    { icon: Database, label: 'Unified Data', description: 'Every stat, every interaction—connected' },
    { icon: Brain, label: 'AI Intelligence', description: 'Learns your coaching philosophy' },
    { icon: Monitor, label: 'Any Device', description: 'Desktop, tablet, or mobile—always in sync' },
    { icon: Zap, label: 'Real-time', description: 'Instant updates across your program' }
  ]

  return (
    <section ref={ref} className="py-20 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-4">
            Built on unified architecture
          </h2>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            One platform powering your entire program. Every piece of data connects.
          </p>
        </motion.div>

        {/* Feature Grid - Clean cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.1 }}
              className="group p-8 rounded-2xl bg-neutral-50 border border-neutral-200 hover:border-helm-green-300 hover:shadow-lg hover:shadow-helm-green-600/5 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-helm-green-100 flex items-center justify-center mb-6 group-hover:bg-helm-green-600 transition-colors duration-300">
                <feature.icon className="w-6 h-6 text-helm-green-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">{feature.label}</h3>
              <p className="text-neutral-600">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// GOLFHELM - AI COACHING SECTION (Light, Modern)
// ============================================================================

function CoachHelmAISection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })
  const [activeInsight, setActiveInsight] = useState(0)

  const insights = [
    {
      type: 'alert',
      color: 'amber',
      title: 'Scoring Decline Detected',
      player: 'Marcus Johnson',
      message: 'Scoring average increased 2.3 strokes over last 4 rounds. Primary issue: approach shots from 125-150 yards.'
    },
    {
      type: 'surge',
      color: 'green',
      title: 'Surge Player Alert',
      player: 'Jake Thompson',
      message: 'Improved 3.1 strokes in last 3 weeks. Now in position #4 for travel roster.'
    },
    {
      type: 'pattern',
      color: 'purple',
      title: 'Pattern Detected',
      player: 'Team-wide',
      message: 'Back nine scoring average 1.8 strokes higher than front nine.'
    }
  ]

  return (
    <section ref={ref} id="golfhelm" className="py-20 md:py-32 bg-gradient-to-b from-neutral-50 to-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            {/* Product Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-green-50 border border-helm-green-200/50 mb-6">
              <Brain className="w-4 h-4 text-helm-green-600" />
              <span className="text-sm font-medium text-helm-green-700">GolfHelm • CoachHelm AI</span>
            </div>

            <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-4 leading-tight">
              Intelligence that never sleeps
            </h2>

            <p className="text-lg text-neutral-600 mb-8 leading-relaxed">
              CoachHelm AI continuously monitors your roster, detecting patterns you'd miss in spreadsheets. 
              Get alerted to scoring declines, surge players, and qualifying position changes.
            </p>

            {/* Feature list - simple checks */}
            <div className="space-y-3 mb-8">
              {[
                'Alert sensitivity: Aggressive, Balanced, or Conservative',
                'Pattern detection across multiple rounds and players',
                'Qualifying position tracking with bubble alerts',
                'Practice recommendations based on performance gaps'
              ].map((feature, i) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                  className="flex items-start gap-3"
                >
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-helm-green-100 flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3 text-helm-green-600" />
                  </div>
                  <span className="text-neutral-700">{feature}</span>
                </motion.div>
              ))}
            </div>

            <Link href="/golf/signup">
              <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-helm-green-600 text-white font-semibold hover:bg-helm-green-700 transition-colors">
                Get Started with GolfHelm
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </motion.div>

          {/* AI Insights Visual - Clean, Light UI */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            {/* Subtle glow */}
            <div className="absolute -inset-4 bg-helm-green-500/10 rounded-3xl blur-2xl" />
            
            <div className="relative bg-white rounded-2xl border border-neutral-200 shadow-xl overflow-hidden">
              {/* Header */}
              <div className="px-6 py-5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-helm-green-500 to-helm-green-600 flex items-center justify-center shadow-sm">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-neutral-900 font-semibold">CoachHelm Insights</div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-helm-green-500 animate-pulse" />
                      <span className="text-helm-green-600">Live • 3 new insights</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Insights */}
              <div className="p-6 space-y-3 min-h-[400px]">
                {insights.map((insight, i) => (
                  <motion.div
                    key={insight.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ 
                      opacity: activeInsight === i ? 1 : 0.5, 
                      y: 0 
                    }}
                    transition={{ duration: 0.3 }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      activeInsight === i 
                        ? 'bg-neutral-50 border-neutral-300 shadow-sm' 
                        : 'bg-white border-neutral-200 hover:bg-neutral-50'
                    }`}
                    onClick={() => setActiveInsight(i)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                        insight.color === 'amber' ? 'bg-amber-100 text-amber-600' :
                        insight.color === 'green' ? 'bg-helm-green-100 text-helm-green-600' :
                        'bg-purple-100 text-purple-600'
                      }`}>
                        {insight.type === 'alert' && <TrendingUp className="w-5 h-5" />}
                        {insight.type === 'surge' && <Trophy className="w-5 h-5" />}
                        {insight.type === 'pattern' && <Brain className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-neutral-900 font-medium">{insight.title}</span>
                          <span className="text-neutral-500 text-sm">• {insight.player}</span>
                        </div>
                        {activeInsight === i && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                          >
                            <p className="text-neutral-600 text-sm mb-3 leading-relaxed">{insight.message}</p>
                            <button className="text-helm-green-600 text-sm font-medium flex items-center gap-1 hover:gap-2 transition-all">
                              View Analysis <ChevronRight className="w-4 h-4" />
                            </button>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// SHOT TRACKING SECTION
// ============================================================================

function ShotTrackingSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })

  const shots = [
    { num: 1, type: 'Tee Shot', club: 'Driver', distance: 285, result: 'Fairway' },
    { num: 2, type: 'Approach', club: '8 Iron', distance: 135, result: 'Green' },
    { num: 3, type: 'Putt', club: 'Putter', distance: 12, result: 'Hole' }
  ]

  return (
    <section ref={ref} className="py-20 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Visual First */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="relative order-2 lg:order-1"
          >
            <div className="absolute -inset-4 bg-helm-green-500/10 rounded-3xl blur-2xl" />
            
            <div className="relative bg-white rounded-2xl border border-neutral-200 shadow-xl overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-neutral-900 font-semibold text-lg">Oak Hill Country Club</div>
                    <div className="text-neutral-500 text-sm">Hole 7 of 18 • In Progress</div>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-bold text-helm-green-600">-3</div>
                    <div className="text-neutral-500 text-xs">Thru 7</div>
                  </div>
                </div>
                
                {/* Mini stats */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'FW', value: '10/14' },
                    { label: 'GIR', value: '13/18' },
                    { label: 'Putts', value: 28 },
                    { label: 'Drive', value: '278 yds' }
                  ].map((stat) => (
                    <div key={stat.label} className="text-center bg-white rounded-lg py-2 border border-neutral-200">
                      <div className="text-neutral-900 font-medium text-sm">{stat.value}</div>
                      <div className="text-neutral-500 text-xs">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shot timeline */}
              <div className="p-6 space-y-2">
                {shots.map((shot) => (
                  <div
                    key={shot.num}
                    className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 hover:border-helm-green-300 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-lg bg-helm-green-100 text-helm-green-600 flex items-center justify-center text-sm font-medium">
                        {shot.num}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-900 font-medium">{shot.club}</span>
                          <span className="text-neutral-400">•</span>
                          <span className="text-neutral-600 text-sm">{shot.type}</span>
                        </div>
                        <div className="text-neutral-500 text-xs">{shot.distance} {shot.type === 'Putt' ? 'ft' : 'yds'}</div>
                      </div>
                      <div className="px-3 py-1 rounded-lg text-xs font-medium bg-helm-green-100 text-helm-green-700">
                        {shot.result}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="order-1 lg:order-2"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-green-50 border border-helm-green-200/50 mb-6">
              <Flag className="w-4 h-4 text-helm-green-600" />
              <span className="text-sm font-medium text-helm-green-700">GolfHelm • Shot Tracking</span>
            </div>

            <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-4 leading-tight">
              From tee to trophy
            </h2>

            <p className="text-lg text-neutral-600 mb-8 leading-relaxed">
              Track every shot during the round with comprehensive details: club, lie, distance, result, 
              and miss tendencies. The complete picture that powers AI pattern detection.
            </p>

            <div className="space-y-3">
              {[
                'Shot-by-shot entry with autocomplete clubs',
                'Automatic fairway hit, GIR, and scrambling calculation',
                'Strokes gained analysis across all categories',
                'Round-over-round trend visualization'
              ].map((feature, i) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: 20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                  className="flex items-start gap-3"
                >
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-helm-green-100 flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3 text-helm-green-600" />
                  </div>
                  <span className="text-neutral-700">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// BASEBALLHELM - RECRUITING PIPELINE
// ============================================================================

function RecruitingPipelineSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })

  const columns = [
    { id: 'watchlist', title: 'Watchlist', count: 24 },
    { id: 'high_priority', title: 'High Priority', count: 12 },
    { id: 'offer_extended', title: 'Offer Extended', count: 6 },
    { id: 'committed', title: 'Committed', count: 3 }
  ]

  const samplePlayers = [
    { name: 'Tyler Martinez', position: 'RHP', year: '2026', school: 'Austin HS' },
    { name: 'Jordan Lee', position: 'SS', year: '2025', school: 'Dallas Prep' }
  ]

  return (
    <section ref={ref} id="baseballhelm" className="py-20 md:py-32 bg-gradient-to-b from-neutral-50 to-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="absolute -inset-4 bg-amber-500/10 rounded-3xl blur-2xl" />
            
            <div className="relative bg-white rounded-2xl border border-neutral-200 shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
                <div>
                  <div className="text-neutral-900 font-semibold text-lg">Recruiting Pipeline</div>
                  <div className="text-neutral-500 text-sm">45 prospects • Class of 2025-2026</div>
                </div>
                <button className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors">
                  + Add Prospect
                </button>
              </div>

              <div className="p-6 overflow-x-auto">
                <div className="flex gap-3 min-w-[700px]">
                  {columns.map((col, colIdx) => (
                    <div key={col.id} className="flex-1 bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-neutral-700 text-sm font-medium">{col.title}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
                          {col.count}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        {colIdx === 0 && samplePlayers.map((player) => (
                          <div
                            key={player.name}
                            className="bg-white rounded-lg p-3 border border-neutral-200 hover:border-amber-300 transition-colors cursor-grab"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <GripVertical className="w-3 h-3 text-neutral-400" />
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-300 to-neutral-400" />
                              <div className="flex-1">
                                <div className="text-neutral-900 text-sm font-medium">{player.name}</div>
                                <div className="text-neutral-500 text-xs">{player.school}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">{player.position}</span>
                              <span className="text-neutral-500 text-xs">{player.year}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200/50 mb-6">
              <Target className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700">BaseballHelm • Recruiting CRM</span>
            </div>

            <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-4 leading-tight">
              Never lose a prospect
            </h2>

            <p className="text-lg text-neutral-600 mb-8 leading-relaxed">
              Visual kanban boards that let you track every prospect from first contact to commitment. 
              Drag and drop between stages, add notes, set reminders, and never let a recruit slip 
              through the cracks.
            </p>

            <div className="space-y-3 mb-8">
              {[
                'Drag-and-drop pipeline management',
                'Filter by position, grad year, or location',
                'Activity timeline for every interaction',
                'Scholarship allocation planning'
              ].map((feature, i) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: 20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                  className="flex items-start gap-3"
                >
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3 text-amber-600" />
                  </div>
                  <span className="text-neutral-700">{feature}</span>
                </motion.div>
              ))}
            </div>

            <Link href="/baseball/signup">
              <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors">
                Get Started with BaseballHelm
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// DEVICE ECOSYSTEM - Clean Grid
// ============================================================================

function DeviceEcosystemSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })

  const devices = [
    { icon: Monitor, label: 'Desktop', description: 'Deep analysis and planning' },
    { icon: Tablet, label: 'Tablet', description: 'Sideline and tournament use' },
    { icon: Smartphone, label: 'Mobile', description: 'Quick updates anywhere' }
  ]

  return (
    <section ref={ref} className="py-20 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-4">
            Your command center, everywhere
          </h2>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            Sideline tablet for live round entry. Desktop for deep analysis. Mobile for on-the-go updates.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {devices.map((device, i) => (
            <motion.div
              key={device.label}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
              className="group text-center p-8 rounded-2xl bg-neutral-50 border border-neutral-200 hover:border-helm-green-300 hover:shadow-lg hover:shadow-helm-green-600/5 transition-all duration-300"
            >
              <div className="w-16 h-16 rounded-2xl mx-auto mb-6 bg-helm-green-100 flex items-center justify-center group-hover:bg-helm-green-600 transition-colors duration-300">
                <device.icon className="w-8 h-8 text-helm-green-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <h3 className="text-xl font-semibold text-neutral-900 mb-2">{device.label}</h3>
              <p className="text-neutral-600">{device.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// FINAL CTA - Clean, Direct
// ============================================================================

function FinalCTASection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gradient-to-b from-neutral-50 to-white">
      {/* Subtle gradient accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-helm-green-500/10 rounded-full blur-3xl" />

      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 40 }} 
          animate={isInView ? { opacity: 1, y: 0 } : {}} 
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-5xl md:text-6xl font-bold text-neutral-900 mb-6 leading-tight">
            Stop managing.
            <br />
            <span className="text-helm-green-600">Start building.</span>
          </h2>
          
          <p className="text-xl text-neutral-600 mb-12 max-w-xl mx-auto">
            The platform that grows with your program.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12">
            <Link href="/golf/signup">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-8 py-4 rounded-xl bg-helm-green-600 text-white font-semibold shadow-lg shadow-helm-green-600/25 hover:bg-helm-green-700 transition-colors"
              >
                Start with GolfHelm
              </motion.button>
            </Link>
            <Link href="/baseball/signup">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-8 py-4 rounded-xl bg-amber-600 text-white font-semibold shadow-lg shadow-amber-600/25 hover:bg-amber-700 transition-colors"
              >
                Start with BaseballHelm
              </motion.button>
            </Link>
          </div>

          <div className="flex flex-wrap justify-center gap-8 text-sm text-neutral-500">
            {['14-day free trial', 'No credit card required', 'Cancel anytime'].map(item => (
              <span key={item} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-helm-green-600" />
                {item}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ProductsPageRedesign() {
  return (
    <main className="relative min-h-screen bg-white">
      {/* Navigation */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <Navigation />
      </div>
      
      {/* Sections */}
      <HeroSection />
      <PlatformOverviewSection />
      <CoachHelmAISection />
      <ShotTrackingSection />
      <RecruitingPipelineSection />
      <DeviceEcosystemSection />
      <FinalCTASection />
      
      <Footer />
    </main>
  )
}
