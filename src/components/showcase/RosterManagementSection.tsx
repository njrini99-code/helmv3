'use client'

import { useRef, useState } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { Users, TrendingUp, TrendingDown, Check, Mail, BarChart3, Calendar } from 'lucide-react'

interface Player {
  name: string
  year: string
  avg: number
  trend: number
  position: number
  travelStatus: 'Locked' | 'Bubble' | 'Out'
  status: 'active' | 'alert' | 'surge'
  lastRound: { date: string; score: number; course: string }
}

export function RosterManagementSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null)

  const roster: Player[] = [
    { name: 'Jake Thompson', year: 'Junior', avg: 72.3, trend: -1.2, position: 1, travelStatus: 'Locked', status: 'active', lastRound: { date: 'Jan 12', score: 71, course: 'Oak Hill' } },
    { name: 'Marcus Johnson', year: 'Senior', avg: 73.8, trend: 2.1, position: 4, travelStatus: 'Bubble', status: 'alert', lastRound: { date: 'Jan 12', score: 76, course: 'Oak Hill' } },
    { name: 'Ryan Miller', year: 'Sophomore', avg: 73.2, trend: -0.8, position: 3, travelStatus: 'Locked', status: 'surge', lastRound: { date: 'Jan 12', score: 72, course: 'Oak Hill' } },
    { name: 'Chris Davis', year: 'Freshman', avg: 74.5, trend: 0.3, position: 5, travelStatus: 'Bubble', status: 'active', lastRound: { date: 'Jan 12', score: 74, course: 'Oak Hill' } },
    { name: 'Tyler Wilson', year: 'Junior', avg: 75.1, trend: 1.5, position: 6, travelStatus: 'Out', status: 'alert', lastRound: { date: 'Jan 12', score: 77, course: 'Oak Hill' } }
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
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-green-500/10 border border-helm-green-500/20 mb-8">
              <Users className="w-4 h-4 text-helm-green-400" />
              <span className="text-sm font-medium text-helm-green-400">GolfHelm • Roster</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1]">
              Your Roster{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-green-400 to-emerald-400">
                at a Glance
              </span>
            </h2>

            <p className="text-base sm:text-lg text-white/50 mb-8 sm:mb-10 leading-relaxed max-w-xl">
              Complete team overview with real-time qualifying positions, travel roster status, and 
              performance trends. Spot issues before they become problems.
            </p>

            <div className="space-y-4">
              {[
                'Qualifying position tracking with automatic updates',
                'Travel roster bubble alerts',
                'Performance trend indicators',
                'Practice attendance monitoring',
                'Individual player dashboards',
                'Batch actions: message, schedule, export'
              ].map((feature, i) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.08 }}
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

          {/* Visual - Roster Table */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute -inset-8 bg-helm-green-500/10 rounded-3xl blur-3xl" />
            
            <div className="relative bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden">
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div>
                  <div className="text-white font-semibold text-base sm:text-lg">Team Roster</div>
                  <div className="text-white/40 text-sm">Spring 2025 • 5 players</div>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded-lg bg-white/[0.04] text-white/50 text-xs sm:text-sm hover:bg-white/[0.08] transition-colors">
                    Filter
                  </button>
                  <button className="px-3 py-1.5 rounded-lg bg-helm-green-500/10 text-helm-green-400 text-xs sm:text-sm hover:bg-helm-green-500/20 transition-colors">
                    Export
                  </button>
                </div>
              </div>

              {/* Table Header */}
              <div className="hidden md:grid px-4 sm:px-6 py-3 border-b border-white/[0.04] grid-cols-12 gap-4 text-white/40 text-xs font-medium">
                <div className="col-span-4">Player</div>
                <div className="col-span-2 text-center">Avg</div>
                <div className="col-span-2 text-center">Position</div>
                <div className="col-span-2 text-center">Status</div>
                <div className="col-span-2 text-center">Actions</div>
              </div>

              {/* Player Rows */}
              <div className="divide-y divide-white/[0.04]">
                {roster.map((player, i) => (
                  <motion.div
                    key={player.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ delay: 0.4 + i * 0.08 }}
                    onClick={() => setExpandedPlayer(expandedPlayer === player.name ? null : player.name)}
                    className={`px-4 sm:px-6 py-4 cursor-pointer transition-all
                      ${player.status === 'alert' ? 'bg-amber-500/5 hover:bg-amber-500/10' :
                        player.status === 'surge' ? 'bg-helm-green-500/5 hover:bg-helm-green-500/10' :
                        'hover:bg-white/[0.03]'
                      }
                    `}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center">
                      {/* Player */}
                      <div className="md:col-span-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-stone-500 to-stone-600 flex items-center justify-center text-white text-sm font-medium">
                          {player.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <div className="text-white font-medium">{player.name}</div>
                          <div className="text-white/40 text-xs">{player.year}</div>
                        </div>
                      </div>

                      {/* Average */}
                      <div className="md:col-span-2 md:text-center">
                        <div className="text-white/40 text-[10px] uppercase tracking-wide md:hidden">Average</div>
                        <div className="text-white font-medium">{player.avg.toFixed(1)}</div>
                        <div className={`text-xs flex items-center gap-1 md:justify-center
                          ${player.trend < 0 ? 'text-helm-green-400' : player.trend > 0 ? 'text-red-400' : 'text-white/40'}`}>
                          {player.trend < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                          {Math.abs(player.trend).toFixed(1)}
                        </div>
                      </div>

                      {/* Position */}
                      <div className="md:col-span-2 md:text-center">
                        <div className="text-white/40 text-[10px] uppercase tracking-wide md:hidden">Position</div>
                        <span className="text-white font-medium">#{player.position}</span>
                      </div>

                      {/* Travel Status */}
                      <div className="md:col-span-2 md:text-center">
                        <div className="text-white/40 text-[10px] uppercase tracking-wide md:hidden">Status</div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium
                          ${player.travelStatus === 'Locked' ? 'bg-helm-green-500/20 text-helm-green-400' :
                            player.travelStatus === 'Bubble' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                          {player.travelStatus}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="md:col-span-2 flex flex-col gap-2 md:items-center">
                        <div className="text-white/40 text-[10px] uppercase tracking-wide sm:hidden">Actions</div>
                        <div className="flex gap-2 md:justify-center">
                          <button className="p-1.5 rounded-lg bg-white/[0.04] text-white/40 hover:text-white transition-colors">
                            <BarChart3 className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 rounded-lg bg-white/[0.04] text-white/40 hover:text-white transition-colors">
                            <Mail className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 rounded-lg bg-white/[0.04] text-white/40 hover:text-white transition-colors">
                            <Calendar className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    <AnimatePresence>
                      {expandedPlayer === player.name && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 pt-4 border-t border-white/[0.06]"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-3 rounded-lg bg-white/[0.03]">
                              <div className="text-white/40 text-xs mb-1">Last Round</div>
                              <div className="text-white font-medium">{player.lastRound.score}</div>
                              <div className="text-white/40 text-xs">{player.lastRound.date} • {player.lastRound.course}</div>
                            </div>
                            <div className="p-3 rounded-lg bg-white/[0.03]">
                              <div className="text-white/40 text-xs mb-1">Practice</div>
                              <div className="text-white font-medium">92%</div>
                              <div className="text-white/40 text-xs">Attendance rate</div>
                            </div>
                            <div className="p-3 rounded-lg bg-white/[0.03]">
                              <div className="text-white/40 text-xs mb-1">Trend</div>
                              <div className={`font-medium ${player.trend < 0 ? 'text-helm-green-400' : 'text-red-400'}`}>
                                {player.trend < 0 ? 'Improving' : 'Declining'}
                              </div>
                              <div className="text-white/40 text-xs">Last 5 rounds</div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
