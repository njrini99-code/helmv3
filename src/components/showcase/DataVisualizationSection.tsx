'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { BarChart3, TrendingUp, Users } from 'lucide-react'

export function DataVisualizationSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })

  // Performance trend data
  const trendData = [
    { date: 'Sep 1', score: 74.5 },
    { date: 'Sep 15', score: 73.2 },
    { date: 'Oct 1', score: 72.8 },
    { date: 'Oct 15', score: 71.4 },
    { date: 'Nov 1', score: 70.9 }
  ]

  // Strokes gained data
  const strokesGained = [
    { name: 'Off Tee', value: 0.8 },
    { name: 'Approach', value: -0.3 },
    { name: 'Around Green', value: 0.5 },
    { name: 'Putting', value: -0.2 }
  ]

  // Pipeline funnel data
  const funnelData = [
    { name: 'Watchlist', count: 142, percent: 100 },
    { name: 'Contacted', count: 87, percent: 61 },
    { name: 'High Priority', count: 34, percent: 24 },
    { name: 'Offers', count: 12, percent: 8 },
    { name: 'Committed', count: 4, percent: 3 }
  ]

  return (
    <section ref={ref} className="py-20 md:py-32 bg-gradient-to-b from-stone-950 to-stone-900">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-12 sm:mb-20"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
            Intelligence Made{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-green-400 to-helm-amber-400">
              Visual
            </span>
          </h2>
          <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto">
            Data transforms into actionable insights through beautiful, interactive visualizations.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Performance Trend */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.1 }}
            className="bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.08] p-5 sm:p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-helm-green-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-helm-green-400" />
              </div>
              <div>
                <div className="text-white font-semibold">Performance Trend</div>
                <div className="text-white/40 text-sm">Jake Thompson</div>
              </div>
            </div>

            {/* Line chart visualization */}
            <div className="relative h-32 sm:h-40 mb-4">
              <svg className="w-full h-full" viewBox="0 0 200 80">
                {/* Grid lines */}
                {[0, 1, 2, 3].map((i) => (
                  <line key={i} x1="0" y1={i * 20 + 10} x2="200" y2={i * 20 + 10} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                ))}
                
                {/* Gradient fill */}
                <defs>
                  <linearGradient id="trendGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                
                {/* Area fill */}
                <motion.path
                  initial={{ opacity: 0 }}
                  animate={isInView ? { opacity: 1 } : {}}
                  transition={{ delay: 0.5 }}
                  d={`M 10,${80 - ((74.5 - 70) / 5) * 70} 
                      L 50,${80 - ((73.2 - 70) / 5) * 70} 
                      L 90,${80 - ((72.8 - 70) / 5) * 70} 
                      L 130,${80 - ((71.4 - 70) / 5) * 70} 
                      L 170,${80 - ((70.9 - 70) / 5) * 70}
                      L 170,80 L 10,80 Z`}
                  fill="url(#trendGradient)"
                />
                
                {/* Line */}
                <motion.path
                  initial={{ pathLength: 0 }}
                  animate={isInView ? { pathLength: 1 } : {}}
                  transition={{ duration: 1.5, delay: 0.3 }}
                  d={`M 10,${80 - ((74.5 - 70) / 5) * 70} 
                      L 50,${80 - ((73.2 - 70) / 5) * 70} 
                      L 90,${80 - ((72.8 - 70) / 5) * 70} 
                      L 130,${80 - ((71.4 - 70) / 5) * 70} 
                      L 170,${80 - ((70.9 - 70) / 5) * 70}`}
                  fill="none"
                  stroke="rgb(16, 185, 129)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                
                {/* Data points */}
                {trendData.map((point, i) => (
                  <motion.circle
                    key={i}
                    initial={{ scale: 0 }}
                    animate={isInView ? { scale: 1 } : {}}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    cx={10 + i * 40}
                    cy={80 - ((point.score - 70) / 5) * 70}
                    r="4"
                    fill="rgb(16, 185, 129)"
                  />
                ))}
              </svg>
            </div>

            <div className="flex justify-between text-xs text-white/40">
              {trendData.map((point) => (
                <span key={point.date}>{point.date.split(' ')[0]}</span>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-white/[0.06] flex justify-between items-center">
              <span className="text-white/50 text-sm">Improvement</span>
              <span className="text-helm-green-400 font-semibold">-3.6 strokes</span>
            </div>
          </motion.div>

          {/* Strokes Gained */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.2 }}
            className="bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.08] p-5 sm:p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-white font-semibold">Strokes Gained</div>
                <div className="text-white/40 text-sm">vs D1 Average</div>
              </div>
            </div>

            <div className="space-y-4">
              {strokesGained.map((category, i) => (
                <motion.div
                  key={category.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.3 + i * 0.1 }}
                >
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-white/60">{category.name}</span>
                    <span className={category.value >= 0 ? 'text-helm-green-400' : 'text-red-400'}>
                      {category.value >= 0 ? '+' : ''}{category.value.toFixed(1)}
                    </span>
                  </div>
                  <div className="relative h-3 bg-white/[0.05] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={isInView ? { width: `${Math.abs(category.value) / 2 * 100}%` } : {}}
                      transition={{ duration: 0.8, delay: 0.4 + i * 0.1 }}
                      className={`absolute h-full rounded-full ${
                        category.value >= 0 ? 'bg-helm-green-500 right-1/2' : 'bg-red-500 left-1/2'
                      }`}
                      style={{ 
                        transformOrigin: category.value >= 0 ? 'right' : 'left',
                        [category.value >= 0 ? 'right' : 'left']: '50%'
                      }}
                    />
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.06] flex justify-between items-center">
              <span className="text-white/50 text-sm">Total SG</span>
              <span className="text-helm-green-400 font-semibold">+0.8</span>
            </div>
          </motion.div>

          {/* Pipeline Funnel */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3 }}
            className="bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.08] p-5 sm:p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-helm-amber-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-helm-amber-400" />
              </div>
              <div>
                <div className="text-white font-semibold">Recruiting Funnel</div>
                <div className="text-white/40 text-sm">Class of 2025</div>
              </div>
            </div>

            <div className="space-y-2">
              {funnelData.map((stage, i) => {
                const nextStage = funnelData[i + 1]
                return (
                  <motion.div
                    key={stage.name}
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={isInView ? { opacity: 1, scaleX: 1 } : {}}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
                    style={{ originX: 0.5 }}
                    className="relative"
                  >
                    <div 
                      className="h-10 rounded-lg flex items-center justify-between px-4 transition-all"
                      style={{ 
                        width: `${stage.percent}%`,
                        marginLeft: `${(100 - stage.percent) / 2}%`,
                        background: `rgba(245, 158, 11, ${0.1 + (1 - i / funnelData.length) * 0.2})`
                      }}
                    >
                      <span className="text-white text-sm font-medium truncate">{stage.name}</span>
                      <span className="text-helm-amber-400 text-sm font-semibold">{stage.count}</span>
                    </div>
                    {nextStage && (
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-white/30 text-xs">
                        ↓ {Math.round((nextStage.count / stage.count) * 100)}%
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.06] flex justify-between items-center">
              <span className="text-white/50 text-sm">Conversion Rate</span>
              <span className="text-helm-amber-400 font-semibold">2.8%</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
