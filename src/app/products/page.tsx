'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, useSpring, useMotionValue, useInView, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useSmoothScroll } from '@/hooks/useSmoothScroll'
import { Navigation } from '@/components/landing/Navigation'
import { Footer } from '@/components/landing/Footer'
import { 
  ShowcaseScrollProgress, 
  SectionTransition,
  EnhancedHeroSection,
  FeatureSplitSection,
  RosterManagementSection,
  WorkflowIntegrationSection,
  DataVisualizationSection,
  MobileExperienceSection,
  TechArchitectureSection,
  ComparisonMatrixSection,
  InteractiveDemoSection
} from '@/components/showcase'
import {
  Target, Video, MessageCircle, Flag, Calendar, Trophy,
  Brain, Sparkles, TrendingUp, Check, AlertTriangle,
  ChevronRight, GripVertical, Eye, Search, Mail, Phone, MapPin,
  Monitor, Tablet, Smartphone, Zap, Database
} from 'lucide-react'

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

function useMagneticButton(strength = 0.3, maxDistance = 150) {
  const ref = useRef<HTMLButtonElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const distance = Math.sqrt(Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2))
    
    if (distance < maxDistance) {
      x.set((e.clientX - centerX) * strength)
      y.set((e.clientY - centerY) * strength)
    } else {
      x.set(0)
      y.set(0)
    }
  }, [strength, maxDistance, x, y])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [handleMouseMove])

  return { ref, x, y }
}

// ============================================================================
// PLATFORM OVERVIEW SECTION
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
    <section ref={ref} className="relative py-20 md:py-32 bg-stone-950 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-stone-950 via-stone-900/50 to-stone-950" />
      
      <div className="relative max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 sm:mb-20"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
            Built on{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-green-400 to-emerald-400">
              Unified Architecture
            </span>
          </h2>
          <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto">
            Every piece of data connects. Every insight flows. One platform powering your entire program.
          </p>
        </motion.div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.1 }}
              className="group relative p-6 sm:p-8 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-500"
            >
              <div className="w-14 h-14 rounded-xl bg-helm-green-500/10 flex items-center justify-center mb-6 group-hover:bg-helm-green-500/20 transition-colors">
                <feature.icon className="w-7 h-7 text-helm-green-400" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">{feature.label}</h3>
              <p className="text-sm sm:text-base text-white/50">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// GOLFHELM - AI COACHING SECTION
// ============================================================================

function CoachHelmAISection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })
  const [activeInsight, setActiveInsight] = useState(0)

  const insights = [
    {
      type: 'alert',
      icon: AlertTriangle,
      color: 'amber',
      title: 'Scoring Decline Detected',
      player: 'Marcus Johnson',
      message: 'Scoring average increased 2.3 strokes over last 4 rounds. Primary issue: approach shots from 125-150 yards.',
      action: 'View Analysis'
    },
    {
      type: 'surge',
      icon: TrendingUp,
      color: 'green',
      title: 'Surge Player Alert',
      player: 'Jake Thompson',
      message: 'Improved 3.1 strokes in last 3 weeks. Now in position #4 for travel roster. Consider for upcoming qualifier.',
      action: 'View Profile'
    },
    {
      type: 'pattern',
      icon: Brain,
      color: 'purple',
      title: 'Pattern Detected',
      player: 'Team-wide',
      message: 'Back nine scoring average 1.8 strokes higher than front nine. 4 of 6 players showing this trend.',
      action: 'See Details'
    },
    {
      type: 'bubble',
      icon: Target,
      color: 'blue',
      title: 'Bubble Watch',
      player: 'Ryan Miller',
      message: 'Currently #5, only 0.4 strokes behind #4. Next qualifier could determine travel roster spot.',
      action: 'Compare Players'
    }
  ]

  // Auto-rotation removed to avoid idle motion/jitter.

  return (
    <section ref={ref} id="golfhelm" className="py-20 md:py-32 bg-gradient-to-b from-stone-950 to-stone-900 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-green-500/10 border border-helm-green-500/20 mb-8">
              <Brain className="w-4 h-4 text-helm-green-400" />
              <span className="text-sm font-medium text-helm-green-400">GolfHelm • CoachHelm AI</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1]">
              Intelligence That{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-green-400 to-emerald-400">
                Never Sleeps
              </span>
            </h2>

            <p className="text-base sm:text-lg text-white/50 mb-8 sm:mb-10 leading-relaxed max-w-xl">
              CoachHelm AI continuously monitors your roster, detecting patterns you&apos;d miss in spreadsheets. 
              Get alerted to scoring declines, surge players, and qualifying position changes—all calibrated 
              to your coaching style.
            </p>

            <div className="space-y-4">
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
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-4"
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-helm-green-500/20">
                    <Check className="w-3.5 h-3.5 text-helm-green-400" />
                  </div>
                  <span className="text-sm sm:text-base text-white/70">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* AI Insights Feed Visual */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            {/* Glow effect */}
            <div className="absolute -inset-8 bg-helm-green-500/10 rounded-3xl blur-3xl" />
            
            <div className="relative bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden">
              {/* Header */}
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-helm-green-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-helm-green-500/30">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-white font-semibold text-lg">CoachHelm Insights</div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-helm-green-500 animate-pulse" />
                      <span className="text-helm-green-400 text-sm">Live • 4 new insights</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Insights */}
              <div className="p-5 space-y-3 min-h-[420px]">
                {insights.map((insight, i) => (
                  <motion.div
                    key={insight.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ 
                      opacity: activeInsight === i ? 1 : 0.4, 
                      y: 0, 
                      scale: activeInsight === i ? 1 : 0.98 
                    }}
                    transition={{ duration: 0.4 }}
                    className={`p-5 rounded-xl border transition-all cursor-pointer
                      ${activeInsight === i 
                        ? 'bg-white/[0.06] border-white/[0.15]' 
                        : 'bg-transparent border-transparent hover:bg-white/[0.03]'
                      }`}
                    onClick={() => setActiveInsight(i)}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0
                        ${insight.color === 'amber' ? 'bg-amber-500/20 text-amber-400' :
                          insight.color === 'green' ? 'bg-helm-green-500/20 text-helm-green-400' :
                          insight.color === 'purple' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                        <insight.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-medium">{insight.title}</span>
                          <span className="text-white/30 text-sm">• {insight.player}</span>
                        </div>
                        <AnimatePresence mode="wait">
                          {activeInsight === i && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                            >
                              <p className="text-white/50 text-sm mb-3 leading-relaxed">{insight.message}</p>
                              <button className="text-helm-green-400 text-sm font-medium flex items-center gap-1 hover:gap-2 transition-all group">
                                {insight.action} 
                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
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
  const [activeShot, setActiveShot] = useState(2)

  const shots = [
    { num: 1, type: 'Tee Shot', club: 'Driver', lie: 'Tee Box', distance: 285, result: 'Fairway', toHole: 140 },
    { num: 2, type: 'Approach', club: '8 Iron', lie: 'Fairway', distance: 135, result: 'Green', toHole: 12 },
    { num: 3, type: 'Putt', club: 'Putter', lie: 'Green', distance: 12, result: 'Hole', toHole: 0, puttBreak: 'Left to Right' }
  ]

  const roundSummary = { score: '-3', fairways: '10/14', gir: '13/18', putts: 28, driving: '278 yds' }

  return (
    <section ref={ref} className="py-20 md:py-32 bg-stone-900">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 items-center">
          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="relative order-2 lg:order-1"
          >
            <div className="absolute -inset-8 bg-helm-green-500/10 rounded-3xl blur-3xl" />
            
            <div className="relative bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden">
              {/* Header */}
              <div className="px-4 sm:px-6 py-4 border-b border-white/[0.06]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-white font-semibold text-lg">Oak Hill Country Club</div>
                    <div className="text-white/40 text-sm flex items-center gap-2">
                      <span>Hole 7 of 18</span>
                      <span className="w-1 h-1 rounded-full bg-white/30" />
                      <span className="text-helm-green-400">In Progress</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl sm:text-4xl font-bold text-helm-green-400">{roundSummary.score}</div>
                    <div className="text-white/40 text-xs">Thru 7</div>
                  </div>
                </div>
                
                {/* Mini stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'FW', value: roundSummary.fairways },
                    { label: 'GIR', value: roundSummary.gir },
                    { label: 'Putts', value: roundSummary.putts },
                    { label: 'Drive', value: roundSummary.driving }
                  ].map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={isInView ? { opacity: 1, y: 0 } : {}}
                      transition={{ delay: 0.3 + i * 0.05 }}
                      className="text-center bg-white/[0.04] rounded-lg py-2 sm:py-2.5"
                    >
                      <div className="text-white font-medium">{stat.value}</div>
                      <div className="text-white/40 text-[10px]">{stat.label}</div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Shot timeline */}
              <div className="p-5 space-y-2">
                {shots.map((shot, i) => (
                  <motion.div
                    key={shot.num}
                    initial={{ opacity: 0, x: -20 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    onClick={() => setActiveShot(i)}
                    className={`p-4 rounded-xl cursor-pointer transition-all
                      ${activeShot === i 
                        ? 'bg-helm-green-500/10 border border-helm-green-500/30' 
                        : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.04]'
                      }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium
                        ${activeShot === i ? 'bg-helm-green-500/20 text-helm-green-400' : 'bg-white/10 text-white/60'}`}>
                        {shot.num}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{shot.club}</span>
                          <span className="text-white/30">•</span>
                          <span className="text-white/50 text-sm">{shot.type}</span>
                        </div>
                        <div className="text-white/40 text-xs">From {shot.lie} • {shot.distance} {shot.type === 'Putt' ? 'ft' : 'yds'}</div>
                      </div>
                      <div className={`px-3 py-1 rounded-lg text-xs font-medium
                        ${shot.result === 'Fairway' ? 'bg-helm-green-500/20 text-helm-green-400' :
                          shot.result === 'Green' ? 'bg-blue-500/20 text-blue-400' :
                          shot.result === 'Hole' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-white/60'
                        }`}>
                        {shot.result}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="order-1 lg:order-2"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-green-500/10 border border-helm-green-500/20 mb-8">
              <Flag className="w-4 h-4 text-helm-green-400" />
              <span className="text-sm font-medium text-helm-green-400">GolfHelm • Shot Tracking</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1]">
              From Tee{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-green-400 to-emerald-400">
                to Trophy
              </span>
            </h2>

            <p className="text-base sm:text-lg text-white/50 mb-8 sm:mb-10 leading-relaxed max-w-xl">
              Track every shot during the round with comprehensive details: club, lie, distance, result, 
              and miss tendencies. The complete picture that powers AI pattern detection.
            </p>

            <div className="space-y-4">
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
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-4"
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-helm-green-500/20">
                    <Check className="w-3.5 h-3.5 text-helm-green-400" />
                  </div>
                  <span className="text-sm sm:text-base text-white/70">{feature}</span>
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
// CALENDAR SECTION  
// ============================================================================

function CalendarSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })

  const upcomingEvents = [
    { date: 'Mon, Jan 18', title: 'Spring Qualifier Round 1', type: 'qualifier', location: 'Oak Hill CC', players: 8 },
    { date: 'Tue, Jan 19', title: 'Spring Qualifier Round 2', type: 'qualifier', location: 'Oak Hill CC', players: 8 },
    { date: 'Thu, Jan 21', title: 'Short Game Practice', type: 'practice', location: 'Practice Facility', players: 12 },
    { date: 'Sat, Jan 23', title: 'Tournament Travel', type: 'travel', location: 'SEC Championship', players: 5 }
  ]

  return (
    <section ref={ref} className="py-20 md:py-32 bg-gradient-to-b from-stone-900 to-stone-950">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-green-500/10 border border-helm-green-500/20 mb-8">
              <Calendar className="w-4 h-4 text-helm-green-400" />
              <span className="text-sm font-medium text-helm-green-400">GolfHelm • Scheduling</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1]">
              Your Program&apos;s{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-green-400 to-emerald-400">
                Command Center
              </span>
            </h2>

            <p className="text-base sm:text-lg text-white/50 mb-8 sm:mb-10 leading-relaxed max-w-xl">
              Schedule practices, qualifiers, and tournaments in one unified calendar. Track player 
              availability, manage travel rosters, and keep your entire program synchronized.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Practice Planning', desc: 'Schedule & track attendance' },
                { label: 'Qualifier Events', desc: 'Multi-round competitions' },
                { label: 'Travel Management', desc: 'Roster & logistics' },
                { label: 'Player Availability', desc: 'RSVP & conflicts' }
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                  className="p-4 sm:p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                >
                  <div className="text-white font-medium mb-1">{item.label}</div>
                  <div className="text-white/40 text-sm sm:text-base">{item.desc}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute -inset-8 bg-helm-green-500/10 rounded-3xl blur-3xl" />
            
            <div className="relative bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-white/[0.06]">
                <div className="text-white font-semibold text-lg">January 2025</div>
                <div className="text-white/40 text-sm">4 events this week</div>
              </div>

              <div className="p-4 sm:p-5 space-y-3">
                {upcomingEvents.map((event, i) => (
                  <motion.div
                    key={event.title}
                    initial={{ opacity: 0, x: -10 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.4, delay: 0.5 + i * 0.1 }}
                    className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors cursor-pointer"
                  >
                    <div className={`w-11 h-11 rounded-lg flex items-center justify-center
                      ${event.type === 'qualifier' ? 'bg-helm-green-500/20 text-helm-green-400' :
                        event.type === 'practice' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-purple-500/20 text-purple-400'}`}>
                      {event.type === 'qualifier' ? <Trophy className="w-5 h-5" /> :
                       event.type === 'practice' ? <Flag className="w-5 h-5" /> :
                       <MapPin className="w-5 h-5" />}
                    </div>
                    <div className="flex-1">
                      <div className="text-white font-medium">{event.title}</div>
                      <div className="text-white/40 text-sm">{event.date} • {event.location}</div>
                    </div>
                    <div className="text-white/30 text-sm">{event.players} players</div>
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
// BASEBALLHELM - RECRUITING PIPELINE
// ============================================================================

function RecruitingPipelineSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })

  const columns = [
    { id: 'watchlist', title: 'Watchlist', count: 24, color: 'slate' },
    { id: 'high_priority', title: 'High Priority', count: 12, color: 'blue' },
    { id: 'offer_extended', title: 'Offer Extended', count: 6, color: 'amber' },
    { id: 'committed', title: 'Committed', count: 3, color: 'green' }
  ]

  const samplePlayers = [
    { name: 'Tyler Martinez', position: 'RHP', year: '2026', school: 'Austin HS' },
    { name: 'Jordan Lee', position: 'SS', year: '2025', school: 'Dallas Prep' },
    { name: 'Chris Brown', position: 'OF', year: '2026', school: 'Houston Acad' }
  ]

  return (
    <section ref={ref} id="baseballhelm" className="py-20 md:py-32 bg-stone-950 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 items-center">
          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="absolute -inset-8 bg-helm-amber-500/10 rounded-3xl blur-3xl" />
            
            <div className="relative bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
                <div>
                  <div className="text-white font-semibold text-lg">Recruiting Pipeline</div>
                  <div className="text-white/40 text-sm">45 prospects • Class of 2025-2026</div>
                </div>
                <button className="px-3 sm:px-4 py-2 rounded-lg bg-helm-amber-500/10 text-helm-amber-400 text-xs sm:text-sm font-medium hover:bg-helm-amber-500/20 transition-colors">
                  + Add Prospect
                </button>
              </div>

              <div className="p-4 sm:p-5 overflow-x-auto">
                <div className="flex gap-3 min-w-[700px]">
                  {columns.map((col, colIdx) => (
                    <motion.div
                      key={col.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={isInView ? { opacity: 1, y: 0 } : {}}
                      transition={{ duration: 0.5, delay: 0.2 + colIdx * 0.1 }}
                      className="flex-1 bg-white/[0.02] rounded-xl p-3"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-white/60 text-sm font-medium">{col.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full
                          ${col.color === 'green' ? 'bg-helm-green-500/20 text-helm-green-400' :
                            col.color === 'amber' ? 'bg-helm-amber-500/20 text-helm-amber-400' :
                            col.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-white/10 text-white/60'
                          }`}>
                          {col.count}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        {colIdx === 0 && samplePlayers.map((player, i) => (
                          <motion.div
                            key={player.name}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={isInView ? { opacity: 1, scale: 1 } : {}}
                            transition={{ duration: 0.3, delay: 0.4 + i * 0.1 }}
                            className="bg-white/[0.04] rounded-lg p-3 cursor-grab hover:bg-white/[0.06] transition-colors border border-transparent hover:border-white/10"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <GripVertical className="w-3 h-3 text-white/20" />
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-stone-500 to-stone-600" />
                              <div className="flex-1">
                                <div className="text-white text-sm font-medium">{player.name}</div>
                                <div className="text-white/40 text-xs">{player.school}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-xs bg-helm-amber-500/20 text-helm-amber-400">{player.position}</span>
                              <span className="text-white/40 text-xs">{player.year}</span>
                            </div>
                          </motion.div>
                        ))}
                        {colIdx > 0 && Array.from({ length: Math.min(col.count, 2) }).map((_, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={isInView ? { opacity: 1, scale: 1 } : {}}
                            transition={{ duration: 0.3, delay: 0.5 + colIdx * 0.1 + i * 0.05 }}
                            className="bg-white/[0.04] rounded-lg p-3"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-stone-600/50" />
                              <div className="flex-1">
                                <div className="h-3 w-20 bg-white/15 rounded" />
                                <div className="h-2 w-14 bg-white/10 rounded mt-1.5" />
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-amber-500/10 border border-helm-amber-500/20 mb-8">
              <Target className="w-4 h-4 text-helm-amber-400" />
              <span className="text-sm font-medium text-helm-amber-400">BaseballHelm • Recruiting CRM</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1]">
              Never Lose{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-amber-400 to-orange-400">
                a Prospect
              </span>
            </h2>

            <p className="text-base sm:text-lg text-white/50 mb-8 sm:mb-10 leading-relaxed max-w-xl">
              Visual kanban boards that let you track every prospect from first contact to commitment. 
              Drag and drop between stages, add notes, set reminders, and never let a recruit slip 
              through the cracks.
            </p>

            <div className="space-y-4">
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
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-4"
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-helm-amber-500/20">
                    <Check className="w-3.5 h-3.5 text-helm-amber-400" />
                  </div>
                  <span className="text-sm sm:text-base text-white/70">{feature}</span>
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
// PLAYER DISCOVERY SECTION
// ============================================================================

function PlayerDiscoverySection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })

  const players = [
    { name: 'Marcus Williams', position: 'RHP', school: 'Dallas Christian', year: '2025', stat1: '1.85 ERA', stat2: '92 mph', watched: false },
    { name: 'Jake Anderson', position: 'SS', school: 'Austin Academy', year: '2026', stat1: '.425 AVG', stat2: '12 HR', watched: true },
    { name: 'Tyler Johnson', position: 'C', school: 'Houston Prep', year: '2025', stat1: '.380 AVG', stat2: '1.92 pop', watched: false },
    { name: 'Chris Martinez', position: 'OF', school: 'San Antonio HS', year: '2026', stat1: '.398 AVG', stat2: '24 SB', watched: true }
  ]

  return (
    <section ref={ref} className="py-20 md:py-32 bg-stone-900">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="order-2 lg:order-1"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-amber-500/10 border border-helm-amber-500/20 mb-8">
              <Search className="w-4 h-4 text-helm-amber-400" />
              <span className="text-sm font-medium text-helm-amber-400">BaseballHelm • Discovery</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1]">
              Find Your{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-amber-400 to-orange-400">
                Next Star
              </span>
            </h2>

            <p className="text-base sm:text-lg text-white/50 mb-8 sm:mb-10 leading-relaxed max-w-xl">
              Search the entire player database by position, location, grad year, and stats. 
              Save players to your watchlist with one click. Get notified when players update 
              their profiles or add new videos.
            </p>

            <div className="space-y-4">
              {[
                'Advanced filtering by position, year, state',
                'One-click add to watchlist',
                'Player profile previews',
                'Video highlight integration'
              ].map((feature, i) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-4"
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-helm-amber-500/20">
                    <Check className="w-3.5 h-3.5 text-helm-amber-400" />
                  </div>
                  <span className="text-sm sm:text-base text-white/70">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative order-1 lg:order-2"
          >
            <div className="absolute -inset-8 bg-helm-amber-500/10 rounded-3xl blur-3xl" />
            
            <div className="relative bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden">
              {/* Search header */}
              <div className="px-4 sm:px-6 py-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-3 bg-white/[0.04] rounded-lg px-4 py-3">
                  <Search className="w-4 h-4 text-white/40" />
                  <span className="text-white/40 text-sm">Search by name, position, school...</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {['Position', 'Grad Year', 'State', 'Stats'].map(filter => (
                    <button key={filter} className="px-3 py-1.5 rounded-lg bg-white/[0.04] text-white/50 text-xs sm:text-sm hover:bg-white/[0.08] transition-colors">
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Results */}
              <div className="divide-y divide-white/[0.04]">
                {players.map((player, i) => (
                  <motion.div
                    key={player.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.4, delay: 0.4 + i * 0.1 }}
                    className="px-4 sm:px-6 py-4 flex items-center gap-4 hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-stone-500 to-stone-600" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{player.name}</span>
                        <span className="px-2 py-0.5 rounded text-xs bg-helm-amber-500/20 text-helm-amber-400">{player.position}</span>
                      </div>
                      <div className="text-white/40 text-sm">{player.school} • Class of {player.year}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-white">{player.stat1}</div>
                      <div className="text-white/40">{player.stat2}</div>
                    </div>
                    <button
                      type="button"
                      aria-label={player.watched ? 'Remove from watchlist' : 'Add to watchlist'}
                      aria-pressed={player.watched}
                      className={`p-3 rounded-lg transition-colors ${player.watched ? 'bg-helm-amber-500/20 text-helm-amber-400' : 'bg-white/[0.04] text-white/40 hover:text-helm-amber-400'}`}
                    >
                      <Eye className="w-5 h-5" />
                    </button>
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
// COMMUNICATION SECTION
// ============================================================================

function CommunicationSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })

  const activities = [
    { date: 'Today', action: 'Sent follow-up email', type: 'email', detail: 'Re: Campus visit scheduling' },
    { date: 'Dec 15', action: 'Phone call - 12 min', type: 'call', detail: 'Discussed program, academics' },
    { date: 'Dec 10', action: 'Added to watchlist', type: 'add', detail: 'From Showcase event' },
    { date: 'Dec 8', action: 'Watched highlight reel', type: 'video', detail: 'Fall scrimmage footage' }
  ]

  return (
    <section ref={ref} className="py-20 md:py-32 bg-gradient-to-b from-stone-900 to-stone-950">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 items-center">
          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="absolute -inset-8 bg-helm-amber-500/10 rounded-3xl blur-3xl" />
            
            <div className="relative bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
                <div>
                  <div className="text-white font-semibold text-lg">Tyler Martinez</div>
                  <div className="text-white/40 text-sm">RHP • Dallas Christian • 2026</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label="Call recruit"
                    className="p-3 rounded-lg bg-white/[0.04] text-white/50 hover:text-white transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Email recruit"
                    className="p-3 rounded-lg bg-white/[0.04] text-white/50 hover:text-white transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                <div className="text-white/40 text-sm mb-5">Activity Timeline</div>
                <div className="space-y-4">
                  {activities.map((activity, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                      className="flex gap-4"
                    >
                      <div className="flex flex-col items-center">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center
                          ${activity.type === 'email' ? 'bg-blue-500/20 text-blue-400' :
                            activity.type === 'call' ? 'bg-helm-green-500/20 text-helm-green-400' :
                            activity.type === 'add' ? 'bg-helm-amber-500/20 text-helm-amber-400' :
                            'bg-purple-500/20 text-purple-400'
                          }`}>
                          {activity.type === 'email' && <Mail className="w-4 h-4" />}
                          {activity.type === 'call' && <Phone className="w-4 h-4" />}
                          {activity.type === 'add' && <Eye className="w-4 h-4" />}
                          {activity.type === 'video' && <Video className="w-4 h-4" />}
                        </div>
                        {i < activities.length - 1 && <div className="w-px h-10 bg-white/10 mt-2" />}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-medium">{activity.action}</span>
                          <span className="text-white/30 text-xs">{activity.date}</span>
                        </div>
                        <p className="text-white/50 text-sm">{activity.detail}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-amber-500/10 border border-helm-amber-500/20 mb-8">
              <MessageCircle className="w-4 h-4 text-helm-amber-400" />
              <span className="text-sm font-medium text-helm-amber-400">BaseballHelm • Communication</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1]">
              Every Touch Point{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-amber-400 to-orange-400">
                Tracked
              </span>
            </h2>

            <p className="text-base sm:text-lg text-white/50 mb-8 sm:mb-10 leading-relaxed max-w-xl">
              Track every email, call, and campus visit in one searchable timeline. Know exactly 
              when you last contacted a prospect and what was discussed. Set follow-up reminders 
              so no conversation goes cold.
            </p>

            <div className="space-y-4">
              {[
                'Complete interaction history',
                'Email and call logging',
                'Campus visit scheduling',
                'Follow-up reminders'
              ].map((feature, i) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: 20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-4"
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-helm-amber-500/20">
                    <Check className="w-3.5 h-3.5 text-helm-amber-400" />
                  </div>
                  <span className="text-sm sm:text-base text-white/70">{feature}</span>
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
// DEVICE ECOSYSTEM SECTION
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
    <section ref={ref} className="py-20 md:py-32 bg-stone-950 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 sm:mb-20"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
            Your Command Center,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-green-400 via-emerald-400 to-helm-amber-400">
              Everywhere
            </span>
          </h2>
          <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto">
            Sideline tablet for live round entry. Desktop for deep analysis. Mobile for on-the-go updates. 
            Always in sync, always up to date.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {devices.map((device, i) => (
            <motion.div
              key={device.label}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
              className="group text-center p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-500"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl mx-auto mb-6 bg-gradient-to-br from-helm-green-500/20 to-helm-amber-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                <device.icon className="w-8 h-8 sm:w-10 sm:h-10 text-white/70" />
              </div>
              <h3 className="text-xl sm:text-2xl font-semibold text-white mb-2">{device.label}</h3>
              <p className="text-sm sm:text-base text-white/50">{device.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// FINAL CTA
// ============================================================================

function MagneticButton({ children, href, variant }: { children: React.ReactNode; href: string; variant: 'golf' | 'baseball' }) {
  const { ref, x, y } = useMagneticButton(0.35, 100)
  const springX = useSpring(x, { stiffness: 300, damping: 20 })
  const springY = useSpring(y, { stiffness: 300, damping: 20 })
  const isGolf = variant === 'golf'

  return (
    <Link href={href}>
      <motion.button
        ref={ref}
        style={{ x: springX, y: springY }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`
          relative px-12 py-6 rounded-2xl font-semibold text-lg text-white transition-all duration-500
          ${isGolf 
            ? 'bg-gradient-to-r from-helm-green-500 to-emerald-600 hover:shadow-[0_0_60px_rgba(16,185,129,0.4)]' 
            : 'bg-gradient-to-r from-helm-amber-500 to-orange-600 hover:shadow-[0_0_60px_rgba(245,158,11,0.4)]'
          }
        `}
      >
        <span className="relative z-10">{children}</span>
      </motion.button>
    </Link>
  )
}

function FinalCTASection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  return (
    <section ref={ref} className="relative py-24 sm:py-32 md:py-40 overflow-hidden bg-stone-950">
      {/* Animated background gradient */}
      <motion.div
        animate={{ 
          background: [
            'radial-gradient(circle at 20% 50%, rgba(16,185,129,0.15) 0%, transparent 50%)',
            'radial-gradient(circle at 80% 50%, rgba(245,158,11,0.15) 0%, transparent 50%)',
            'radial-gradient(circle at 50% 80%, rgba(139,92,246,0.1) 0%, transparent 50%)',
            'radial-gradient(circle at 20% 50%, rgba(16,185,129,0.15) 0%, transparent 50%)'
          ] 
        }}
        transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
        className="absolute inset-0"
      />

      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 40 }} 
          animate={isInView ? { opacity: 1, y: 0 } : {}} 
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-8 leading-[1.1]">
            Stop Managing.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-green-400 via-emerald-400 to-helm-amber-400">
              Start Building.
            </span>
          </h2>
          
          <p className="text-base sm:text-lg md:text-2xl text-white/40 mb-10 sm:mb-16 max-w-xl mx-auto">
            The platform that grows with your program.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6 mb-12 sm:mb-16">
            <MagneticButton href="/golf/signup" variant="golf">Start with GolfHelm</MagneticButton>
            <MagneticButton href="/baseball/signup" variant="baseball">Start with BaseballHelm</MagneticButton>
          </div>

          <motion.div 
            initial={{ opacity: 0 }} 
            animate={isInView ? { opacity: 1 } : {}} 
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-wrap justify-center gap-4 sm:gap-8 text-sm text-white/40"
          >
            {['14-day free trial', 'No credit card required', 'Cancel anytime'].map(item => (
              <span key={item} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-helm-green-500" />
                {item}
              </span>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ProductsPage() {
  useSmoothScroll()

  return (
    <main className="relative min-h-screen bg-stone-950 text-white">
      {/* Global UI */}
      <ShowcaseScrollProgress />
      
      {/* Navigation */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <Navigation />
      </div>
      
      {/* Section 1: Enhanced Hero with Typewriter & Product Toggle */}
      <EnhancedHeroSection />
      
      {/* Section 2: Platform Overview */}
      <PlatformOverviewSection />
      
      <SectionTransition variant="gradient" />
      
      {/* Section 3: Feature Split - Two Sides, One Platform */}
      <FeatureSplitSection />
      
      <SectionTransition variant="fog" />
      
      {/* Section 4A: GolfHelm - AI Coaching */}
      <CoachHelmAISection />
      
      {/* Section 4B: Shot Tracking */}
      <ShotTrackingSection />
      
      {/* Section 4C: Calendar */}
      <CalendarSection />
      
      {/* Section 4D: Roster Management */}
      <RosterManagementSection />
      
      <SectionTransition variant="gradient" />
      
      {/* Section 5A: BaseballHelm - Recruiting Pipeline */}
      <RecruitingPipelineSection />
      
      {/* Section 5B: Player Discovery */}
      <PlayerDiscoverySection />
      
      {/* Section 5C: Communication Timeline */}
      <CommunicationSection />
      
      <SectionTransition variant="fog" />
      
      {/* Section 6: Workflow Integration */}
      <WorkflowIntegrationSection />
      
      {/* Section 7: Device Ecosystem */}
      <DeviceEcosystemSection />
      
      <SectionTransition />
      
      {/* Section 8: Data Visualization Showcase */}
      <DataVisualizationSection />
      
      {/* Section 9: Mobile Experience */}
      <MobileExperienceSection />
      
      <SectionTransition variant="gradient" />
      
      {/* Section 10: Technical Architecture */}
      <TechArchitectureSection />
      
      {/* Section 11: Comparison Matrix */}
      <ComparisonMatrixSection />
      
      <SectionTransition variant="fog" />
      
      {/* Section 12: Interactive Demo */}
      <InteractiveDemoSection />
      
      {/* Section 13: Final CTA */}
      <FinalCTASection />
      
      <Footer />
    </main>
  )
}
