'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Flag, Calendar, Users, MessageCircle, Brain, AlertTriangle, TrendingUp, Target, Lightbulb, Bell, Mail, Layout, ArrowDown } from 'lucide-react'

export function WorkflowIntegrationSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })

  const inputSources = [
    { icon: Flag, label: 'Round Entry', color: 'green' },
    { icon: Calendar, label: 'Schedule', color: 'blue' },
    { icon: Users, label: 'Roster', color: 'purple' },
    { icon: MessageCircle, label: 'Contacts', color: 'amber' }
  ]

  const insights = [
    { icon: AlertTriangle, label: 'Performance Alerts', color: 'amber' },
    { icon: TrendingUp, label: 'Surge Detection', color: 'green' },
    { icon: Target, label: 'Roster Position', color: 'blue' },
    { icon: Lightbulb, label: 'Practice Focus', color: 'purple' }
  ]

  const outputs = [
    { icon: Bell, label: 'Notifications', color: 'green' },
    { icon: Mail, label: 'Daily Digest', color: 'blue' },
    { icon: Layout, label: 'Dashboard', color: 'purple' },
    { icon: Calendar, label: 'Calendar', color: 'amber' }
  ]

  return (
    <section ref={ref} className="relative py-20 md:py-32 bg-gradient-to-b from-stone-950 via-stone-900 to-stone-950 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-helm-green-500/10 rounded-full blur-[150px]" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 sm:mb-20"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4">
            How It All{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-green-400 to-helm-amber-400">
              Flows
            </span>
          </h2>
          <p className="text-base sm:text-lg text-white/50">Data in → Intelligence → Action out</p>
        </motion.div>

        {/* Workflow Diagram */}
        <div className="space-y-12">
          {/* Phase 1: Data Sources */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.2 }}
          >
            <div className="text-center mb-6">
              <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 text-sm">Data Collection</span>
            </div>
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
              {inputSources.map((source, i) => (
                <motion.div
                  key={source.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={isInView ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="flex flex-col items-center gap-2"
                >
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center
                    ${source.color === 'green' ? 'bg-helm-green-500/20 text-helm-green-400' :
                      source.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                      source.color === 'purple' ? 'bg-purple-500/20 text-purple-400' :
                      'bg-helm-amber-500/20 text-helm-amber-400'
                    }`}>
                    <source.icon className="w-6 h-6 sm:w-7 sm:h-7" />
                  </div>
                  <span className="text-white/50 text-xs font-medium">{source.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Arrow Down */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.5 }}
            className="flex justify-center"
          >
            <ArrowDown className="w-6 h-6 text-white/20" />
          </motion.div>

          {/* Phase 2: AI Brain */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.6 }}
            className="flex flex-col items-center"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-helm-green-500/30 to-helm-amber-500/30 blur-xl" />
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-stone-900 flex items-center justify-center border border-white/10">
                <Brain className="w-12 h-12 sm:w-14 sm:h-14 text-helm-green-400" />
              </div>
            </div>
            <span className="mt-4 text-white font-semibold text-lg">CoachHelm AI</span>
            <span className="text-white/40 text-sm">Processing & Pattern Recognition</span>
          </motion.div>

          {/* Arrow Down */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.8 }}
            className="flex justify-center"
          >
            <ArrowDown className="w-6 h-6 text-white/20" />
          </motion.div>

          {/* Phase 3: Insights */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.9 }}
          >
            <div className="text-center mb-6">
              <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 text-sm">Generated Insights</span>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {insights.map((insight, i) => (
                <motion.div
                  key={insight.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 1 + i * 0.1 }}
                  className={`px-4 py-2 rounded-full flex items-center gap-2 border
                    ${insight.color === 'amber' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                      insight.color === 'green' ? 'bg-helm-green-500/10 border-helm-green-500/30 text-helm-green-400' :
                      insight.color === 'blue' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                      'bg-purple-500/10 border-purple-500/30 text-purple-400'
                    }`}
                >
                  <insight.icon className="w-4 h-4" />
                  <span className="text-xs sm:text-sm font-medium">{insight.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Arrow Down */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 1.2 }}
            className="flex justify-center"
          >
            <ArrowDown className="w-6 h-6 text-white/20" />
          </motion.div>

          {/* Phase 4: Outputs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 1.3 }}
          >
            <div className="text-center mb-6">
              <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 text-sm">Delivered To You</span>
            </div>
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
              {outputs.map((output, i) => (
                <motion.div
                  key={output.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={isInView ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: 1.4 + i * 0.1 }}
                  className="flex flex-col items-center gap-2"
                >
                  <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center
                    ${output.color === 'green' ? 'bg-helm-green-500/20 text-helm-green-400' :
                      output.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                      output.color === 'purple' ? 'bg-purple-500/20 text-purple-400' :
                      'bg-helm-amber-500/20 text-helm-amber-400'
                    }`}>
                    <output.icon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="text-white/40 text-xs">{output.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
