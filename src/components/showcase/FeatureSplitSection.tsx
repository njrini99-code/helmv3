'use client'

import { motion } from 'framer-motion'
import { Brain, Flag, BarChart3, Calendar, Target, Search, MessageCircle, DollarSign } from 'lucide-react'

export function FeatureSplitSection() {
  const golfFeatures = [
    { icon: Brain, label: 'AI Coaching Intelligence', desc: 'CoachHelm AI analyzes performance' },
    { icon: Flag, label: 'Shot-by-Shot Tracking', desc: 'Every shot, every round' },
    { icon: BarChart3, label: 'Team Performance', desc: 'Data-driven development' },
    { icon: Calendar, label: 'Calendar & Planning', desc: 'Practice, qualifiers, tournaments' }
  ]

  const baseballFeatures = [
    { icon: Target, label: 'Recruiting Pipeline', desc: 'Visual workflow management' },
    { icon: Search, label: 'Player Discovery', desc: 'Find your next prospect' },
    { icon: MessageCircle, label: 'Communication Hub', desc: 'Track every interaction' },
    { icon: DollarSign, label: 'Scholarship Management', desc: 'Budget and offers tracked' }
  ]

  return (
    <section className="relative py-20 md:py-32 bg-stone-950 overflow-hidden">
      {/* Center Text - One Platform */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4">
          One Platform
        </h2>
        <p className="text-xl sm:text-2xl text-white/50">Two Specializations</p>
      </motion.div>

      {/* Split Container */}
      <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto px-6">
        {/* Left Side - GolfHelm */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="flex-1 relative p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-helm-green-950/30 to-stone-900/50 border border-helm-green-500/10"
        >
          <div className="max-w-md mx-auto">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-xl bg-helm-green-500/20 flex items-center justify-center">
                  <Flag className="w-6 h-6 text-helm-green-400" />
                </div>
                <div>
                  <div className="text-xl font-semibold text-white">GolfHelm</div>
                  <div className="text-sm text-helm-green-400">Team Management</div>
                </div>
              </div>

            <div className="space-y-4">
              {golfFeatures.map((feature, i) => (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  viewport={{ once: true }}
                  className="group flex items-start gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-helm-green-500/10 hover:border-helm-green-500/20 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-helm-green-500/10 flex items-center justify-center group-hover:bg-helm-green-500/20 transition-colors">
                    <feature.icon className="w-5 h-5 text-helm-green-400" />
                  </div>
                  <div>
                    <div className="text-white font-medium">{feature.label}</div>
                    <div className="text-white/40 text-sm">{feature.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Right Side - BaseballHelm */}
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="flex-1 relative p-6 sm:p-8 rounded-2xl bg-gradient-to-bl from-helm-amber-950/30 to-stone-900/50 border border-helm-amber-500/10"
        >
          <div className="max-w-md mx-auto">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-xl bg-helm-amber-500/20 flex items-center justify-center">
                  <Target className="w-6 h-6 text-helm-amber-400" />
                </div>
                <div>
                  <div className="text-xl font-semibold text-white">BaseballHelm</div>
                  <div className="text-sm text-helm-amber-400">Recruiting CRM</div>
                </div>
              </div>

            <div className="space-y-4">
              {baseballFeatures.map((feature, i) => (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  viewport={{ once: true }}
                  className="group flex items-start gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-helm-amber-500/10 hover:border-helm-amber-500/20 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-helm-amber-500/10 flex items-center justify-center group-hover:bg-helm-amber-500/20 transition-colors">
                    <feature.icon className="w-5 h-5 text-helm-amber-400" />
                  </div>
                  <div>
                    <div className="text-white font-medium">{feature.label}</div>
                    <div className="text-white/40 text-sm">{feature.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
