'use client'

import { useRef, useState } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { Play, ChevronRight, Flag, Calendar, BarChart3, Users, Brain, Sparkles } from 'lucide-react'

export function InteractiveDemoSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })
  const [mode, setMode] = useState<'tour' | 'explore'>('tour')
  const [tourStep, setTourStep] = useState(0)
  const [activeTab, setActiveTab] = useState('dashboard')

  const tourSteps = [
    {
      title: 'Dashboard Overview',
      description: 'Your command center shows real-time insights, upcoming events, and team performance at a glance.',
      highlight: 'dashboard'
    },
    {
      title: 'AI Insights',
      description: 'CoachHelm AI continuously monitors your team and surfaces actionable alerts.',
      highlight: 'insights'
    },
    {
      title: 'Calendar',
      description: 'Schedule practices, qualifiers, and tournaments with player availability tracking.',
      highlight: 'calendar'
    },
    {
      title: 'Performance',
      description: 'Track strokes gained, scoring trends, and individual player analytics.',
      highlight: 'performance'
    }
  ]

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'insights', label: 'Insights', icon: Sparkles },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'roster', label: 'Roster', icon: Users },
    { id: 'performance', label: 'Performance', icon: BarChart3 }
  ]
  const activeStep = tourSteps[tourStep] ?? tourSteps[0]

  const renderDemoContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 sm:p-6">
            <div className="col-span-1 sm:col-span-2 space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-center gap-3 mb-4">
                  <Sparkles className="w-5 h-5 text-helm-primary-400" />
                  <span className="text-white font-medium">Latest Insights</span>
                </div>
                <div className="space-y-2">
                  {['Scoring decline detected: Marcus J.', 'Surge player alert: Ryan M.', 'Qualifier tomorrow: 6 players'].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-white/60 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-helm-primary-500" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-center gap-3 mb-4">
                  <Calendar className="w-5 h-5 text-blue-400" />
                  <span className="text-white font-medium">This Week</span>
                </div>
                <div className="space-y-2">
                  {['Mon: Spring Qualifier R1', 'Wed: Team Practice', 'Fri: Conference Match'].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-white/60 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <div className="text-white/40 text-xs mb-1">Team Average</div>
                <div className="text-2xl font-bold text-white">72.8</div>
                <div className="text-helm-primary-400 text-xs">↓ 1.2 this month</div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <div className="text-white/40 text-xs mb-1">Next Event</div>
                <div className="text-white font-medium">Spring Qualifier</div>
                <div className="text-white/40 text-xs">Monday 8:00 AM</div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <div className="text-white/40 text-xs mb-1">Active Players</div>
                <div className="text-2xl font-bold text-white">12</div>
                <div className="text-white/40 text-xs">8 travel roster</div>
              </div>
            </div>
          </div>
        )
      case 'insights':
        return (
          <div className="p-4 sm:p-6 space-y-4">
            {[
              { type: 'alert', title: 'Scoring Decline', player: 'Marcus Johnson', desc: '+2.3 strokes over 4 rounds' },
              { type: 'surge', title: 'Surge Player', player: 'Ryan Miller', desc: '-1.8 strokes improvement' },
              { type: 'pattern', title: 'Pattern Detected', player: 'Team-wide', desc: 'Back nine struggles' }
            ].map((insight, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-start gap-4"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  insight.type === 'alert' ? 'bg-amber-500/20 text-amber-400' :
                  insight.type === 'surge' ? 'bg-helm-primary-500/20 text-helm-primary-400' :
                  'bg-purple-500/20 text-purple-400'
                }`}>
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-white font-medium">{insight.title}</div>
                  <div className="text-white/40 text-sm">{insight.player} • {insight.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        )
      default:
        return (
          <div className="p-4 sm:p-6 flex items-center justify-center h-48 sm:h-64 text-white/40">
            <p>Click tabs to explore different features</p>
          </div>
        )
    }
  }

  return (
    <section ref={ref} className="py-20 md:py-32 bg-stone-900 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-10 sm:mb-12"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
            See It in{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-primary-400 to-helm-amber-400">
              Action
            </span>
          </h2>
          <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto mb-6 sm:mb-8">
            Experience the platform before you sign up. Take a guided tour or explore freely.
          </p>

          {/* Mode Toggle */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <button
              onClick={() => setMode('tour')}
              className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                mode === 'tour' ? 'bg-helm-primary-500 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              <Play className="w-4 h-4 inline mr-2" />
              Guided Tour
            </button>
            <button
              onClick={() => setMode('explore')}
              className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                mode === 'explore' ? 'bg-helm-primary-500 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              Explore Freely
            </button>
          </div>
        </motion.div>

        {/* Demo Container */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2 }}
          className="relative"
        >
          <div className="absolute -inset-4 bg-gradient-to-r from-helm-primary-500/10 to-helm-amber-500/10 rounded-3xl blur-3xl" />
          
          <div className="relative bg-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden">
            {/* Demo Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-helm-primary-500/20 flex items-center justify-center">
                  <Flag className="w-4 h-4 text-helm-primary-400" />
                </div>
                <span className="text-white font-medium">GolfHelm Demo</span>
                <span className="px-2 py-0.5 rounded text-xs bg-helm-primary-500/20 text-helm-primary-400">Interactive</span>
              </div>
              
              {mode === 'tour' && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
                  <span className="text-white/40 text-xs sm:text-sm">Step {tourStep + 1} of {tourSteps.length}</span>
                  <button
                    onClick={() => setTourStep(prev => (prev + 1) % tourSteps.length)}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg bg-helm-primary-500/20 text-helm-primary-400 text-xs sm:text-sm font-medium hover:bg-helm-primary-500/30 transition-colors flex items-center justify-center gap-2"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="px-4 sm:px-6 py-3 border-b border-white/[0.04] flex flex-wrap gap-2">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-2 transition-all ${
                    activeTab === tab.id 
                      ? 'bg-helm-primary-500/20 text-helm-primary-400' 
                      : 'text-white/40 hover:text-white hover:bg-white/[0.04]'
                  } ${mode === 'tour' && activeStep?.highlight === tab.id ? 'ring-2 ring-helm-primary-500/50' : ''}`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Demo Content */}
            <div className="min-h-[320px] sm:min-h-[400px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {renderDemoContent()}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Tour Tooltip */}
            {mode === 'tour' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-4 left-4 right-4 p-3 sm:p-4 rounded-xl bg-stone-900/95 border border-helm-primary-500/30 backdrop-blur-sm"
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-helm-primary-500/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-helm-primary-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-semibold mb-1">{activeStep?.title}</div>
                    <p className="text-white/60 text-xs sm:text-sm">{activeStep?.description}</p>
                  </div>
                  <div className="flex gap-1">
                    {tourSteps.map((_, i) => (
                      <div 
                        key={i}
                        className={`w-2 h-2 rounded-full ${i === tourStep ? 'bg-helm-primary-500' : 'bg-white/20'}`}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
