'use client'

import { useRef, useState } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronRight,
  Flag,
  Mail,
  Phone,
  Smartphone,
  Sparkles,
  Target,
  TrendingUp,
  Users
} from 'lucide-react'

export function MobileExperienceSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })
  const [activeScreen, setActiveScreen] = useState(0)

  const screens = [
    {
      id: 'round',
      title: 'Quick Round Entry',
      content: (
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="text-white font-semibold">Hole 7</div>
              <div className="text-white/40 text-xs">Par 4 • 385 yds</div>
            </div>
            <div className="text-2xl font-bold text-helm-green-400">-2</div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {['Driver', '3W', '5i', '7i'].map(club => (
              <button key={club} className="p-3 rounded-lg bg-white/[0.06] text-white/60 text-sm hover:bg-white/10">
                {club}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['Fairway', 'Green', 'Hole'].map(result => (
              <button key={result} className="p-3 rounded-lg bg-helm-green-500/10 text-helm-green-400 text-sm border border-helm-green-500/20">
                {result}
              </button>
            ))}
          </div>
        </div>
      )
    },
    {
      id: 'insights',
      title: 'AI Insights Feed',
      content: (
        <div className="p-4 space-y-3">
          {[
            { icon: AlertTriangle, title: 'Decline Alert', player: 'Marcus J.', color: 'amber' },
            { icon: TrendingUp, title: 'Surge Player', player: 'Ryan M.', color: 'green' },
            { icon: Target, title: 'Bubble Watch', player: 'Chris D.', color: 'blue' }
          ].map((insight, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04]"
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  insight.color === 'amber'
                    ? 'bg-helm-amber-500/15 text-helm-amber-400'
                    : insight.color === 'green'
                      ? 'bg-helm-green-500/15 text-helm-green-400'
                      : 'bg-blue-500/15 text-blue-400'
                }`}
              >
                <insight.icon className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="text-white text-sm font-medium">{insight.title}</div>
                <div className="text-white/40 text-xs">{insight.player}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-white/30" />
            </motion.div>
          ))}
        </div>
      )
    },
    {
      id: 'player',
      title: 'Player Quick View',
      content: (
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-stone-500 to-stone-600 flex items-center justify-center text-white font-medium">
              JT
            </div>
            <div>
              <div className="text-white font-semibold">Jake Thompson</div>
              <div className="text-helm-green-400 text-xs">#1 Qualifying</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Avg', value: '72.3' },
              { label: 'FIR', value: '68%' },
              { label: 'GIR', value: '72%' }
            ].map(stat => (
              <div key={stat.label} className="p-3 rounded-lg bg-white/[0.04] text-center">
                <div className="text-white font-semibold">{stat.value}</div>
                <div className="text-white/40 text-xs">{stat.label}</div>
              </div>
            ))}
          </div>
          <button className="w-full p-3 rounded-lg bg-helm-green-500/20 text-helm-green-400 text-sm font-medium">
            View Full Profile
          </button>
        </div>
      )
    },
    {
      id: 'pipeline',
      title: 'Prospect Card',
      content: (
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-stone-500 to-stone-600" />
            <div className="flex-1">
              <div className="text-white font-semibold">Tyler Martinez</div>
              <div className="text-white/40 text-xs">RHP • Austin HS • 2026</div>
            </div>
            <span className="px-2 py-1 rounded text-xs bg-helm-amber-500/20 text-helm-amber-400">High Priority</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="p-3 rounded-lg bg-white/[0.04]">
              <div className="text-white font-semibold">1.85</div>
              <div className="text-white/40 text-xs">ERA</div>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.04]">
              <div className="text-white font-semibold">92</div>
              <div className="text-white/40 text-xs">Velocity</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 p-2 rounded-lg bg-white/[0.06] text-white/60 text-sm flex items-center justify-center gap-2">
              <Phone className="w-4 h-4 text-white/60" />
              Call
            </button>
            <button className="flex-1 p-2 rounded-lg bg-white/[0.06] text-white/60 text-sm flex items-center justify-center gap-2">
              <Mail className="w-4 h-4 text-white/60" />
              Email
            </button>
            <button className="flex-1 p-2 rounded-lg bg-white/[0.06] text-white/60 text-sm flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4 text-white/60" />
              Schedule
            </button>
          </div>
        </div>
      )
    },
    {
      id: 'calendar',
      title: 'Calendar Day View',
      content: (
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            <div className="text-white font-semibold">Today</div>
            <div className="text-white/40 text-sm">Jan 18</div>
          </div>
          <div className="space-y-2">
            {[
              { time: '8:00 AM', event: 'Spring Qualifier R1', type: 'qualifier' },
              { time: '2:00 PM', event: 'Team Practice', type: 'practice' },
              { time: '4:30 PM', event: 'Recruit Call - Tyler M.', type: 'call' }
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04]">
                <div className="text-white/40 text-xs w-16">{item.time}</div>
                <div className={`w-1 h-8 rounded-full ${
                  item.type === 'qualifier' ? 'bg-helm-green-500' :
                  item.type === 'practice' ? 'bg-blue-500' : 'bg-helm-amber-500'
                }`} />
                <div className="text-white text-sm">{item.event}</div>
              </div>
            ))}
          </div>
        </div>
      )
    }
  ]
  const activeScreenData = screens[activeScreen] ?? screens[0]!

  // Auto-rotation removed to avoid idle motion/jitter.

  return (
    <section ref={ref} className="py-20 md:py-32 bg-stone-900 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 items-center">
          {/* iPhone Mockup */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="relative flex justify-center"
          >
            <div className="absolute -inset-20 bg-gradient-to-r from-helm-green-500/10 to-helm-amber-500/10 rounded-full blur-[100px]" />
            
            {/* iPhone Frame */}
            <div className="relative w-[240px] h-[500px] sm:w-[280px] sm:h-[580px] bg-stone-950 rounded-[50px] border-[8px] border-stone-800 shadow-2xl overflow-hidden">
              {/* Dynamic Island */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
                <motion.div
                  animate={{ width: activeScreen === 0 ? 160 : 90 }}
                  transition={{ duration: 0.3 }}
                  className="h-[28px] bg-black rounded-full flex items-center justify-center px-4"
                >
                  {activeScreen === 0 && (
                    <motion.span 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-white text-[10px] font-medium"
                    >
                      Hole 7 • -2
                    </motion.span>
                  )}
                </motion.div>
              </div>

              {/* Status Bar */}
              <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-6 sm:px-8 pt-1 z-10">
                <span className="text-white text-xs font-medium">9:41</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-2 border border-white rounded-sm">
                    <div className="w-3/4 h-full bg-white rounded-sm" />
                  </div>
                </div>
              </div>

              {/* Screen Content */}
              <div className="absolute top-12 sm:top-14 left-0 right-0 bottom-0 bg-stone-950">
                {/* App Header */}
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-helm-green-500/20 flex items-center justify-center">
                    <Flag className="w-3 h-3 text-helm-green-400" />
                  </div>
                  <span className="text-white text-sm font-medium">{activeScreenData.title}</span>
                </div>

                {/* Screen Content with Animation */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeScreen}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.3 }}
                  >
                    {activeScreenData.content}
                  </motion.div>
                </AnimatePresence>

                {/* Bottom Navigation */}
                <div className="absolute bottom-0 left-0 right-0 h-14 sm:h-16 border-t border-white/[0.06] flex items-center justify-around px-3 sm:px-4">
                  {[Flag, Sparkles, Users, Target, Calendar].map((Icon, i) => (
                    <button 
                      key={i}
                      onClick={() => setActiveScreen(i)}
                      className={`p-2 rounded-lg transition-colors ${
                        activeScreen === i ? 'text-helm-green-400' : 'text-white/30 hover:text-white/50'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  ))}
                </div>

                {/* Home Indicator */}
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-24 sm:w-32 h-1 bg-white/30 rounded-full" />
              </div>
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-helm-green-500/10 to-helm-amber-500/10 border border-white/10 mb-8">
              <Smartphone className="w-4 h-4 text-white/70" />
              <span className="text-sm font-medium text-white/80">Mobile Experience</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1]">
              Powerful{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-green-400 to-helm-amber-400">
                on the Go
              </span>
            </h2>

            <p className="text-base sm:text-lg text-white/50 mb-8 sm:mb-10 leading-relaxed max-w-xl">
              Full platform capabilities in your pocket. Enter rounds courtside, check insights 
              between holes, contact recruits from the road.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {[
                'Quick round entry with autocomplete',
                'Voice notes and dictation',
                'Offline mode with sync',
                'GPS course distances',
                'Push notifications for alerts',
                'Native camera integration'
              ].map((feature, i) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, y: 10 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.08 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-5 h-5 rounded-full flex items-center justify-center bg-helm-green-500/20">
                    <Check className="w-3 h-3 text-helm-green-400" />
                  </div>
                  <span className="text-white/70 text-sm">{feature}</span>
                </motion.div>
              ))}
            </div>

            {/* Screen Indicators */}
            <div className="flex gap-2 mt-10">
              {screens.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveScreen(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    activeScreen === i ? 'w-6 bg-helm-green-500' : 'bg-white/20 hover:bg-white/40'
                  }`}
                />
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
