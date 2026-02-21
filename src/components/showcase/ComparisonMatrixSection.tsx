'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Check, X, ArrowRight, Table, Trophy } from 'lucide-react'

export function ComparisonMatrixSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })

  const comparisons = [
    {
      feature: 'Shot Tracking',
      spreadsheet: 'Manual entry, prone to errors',
      helm: 'Guided entry with validation'
    },
    {
      feature: 'Pattern Detection',
      spreadsheet: 'Manual analysis required',
      helm: 'Automatic AI detection'
    },
    {
      feature: 'Qualifying Positions',
      spreadsheet: 'Manual calculation',
      helm: 'Real-time auto-calculation'
    },
    {
      feature: 'Calendar Integration',
      spreadsheet: 'No integration',
      helm: 'Full sync with Google/iCal'
    },
    {
      feature: 'Mobile Access',
      spreadsheet: 'Poor mobile experience',
      helm: 'Native mobile apps'
    },
    {
      feature: 'Recruiting Pipeline',
      spreadsheet: 'Static lists',
      helm: 'Visual kanban workflow'
    },
    {
      feature: 'Communication Tracking',
      spreadsheet: 'Not possible',
      helm: 'Complete timeline'
    },
    {
      feature: 'Team Collaboration',
      spreadsheet: 'Version conflicts',
      helm: 'Real-time sync'
    }
  ]

  return (
    <section ref={ref} className="py-20 md:py-32 bg-stone-950">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
            Why Helm vs{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white/40 to-white/20">
              Spreadsheets
            </span>
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-white/50 max-w-2xl mx-auto">
            See how a purpose-built platform compares to cobbled-together spreadsheets.
          </p>
        </motion.div>

        {/* Comparison Table */}
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-red-500/5 via-transparent to-helm-primary-500/5 rounded-3xl" />
          
          <div className="relative bg-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden">
            {/* Header */}
            <div className="hidden md:grid grid-cols-3 gap-4 p-6 border-b border-white/[0.06]">
              <div className="text-white/40 font-medium">Feature</div>
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <Table className="w-4 h-4 text-red-300" />
                  <span className="text-red-400 font-medium">Spreadsheets</span>
                </div>
              </div>
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-helm-primary-500/10 border border-helm-primary-500/20">
                  <Trophy className="w-4 h-4 text-helm-primary-300" />
                  <span className="text-helm-primary-400 font-medium">Helm</span>
                </div>
              </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-white/[0.04]">
              {comparisons.map((row, i) => (
                <motion.div
                  key={row.feature}
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 p-5 md:p-6 hover:bg-white/[0.02] transition-colors group"
                >
                  {/* Feature */}
                  <div className="flex items-center justify-between md:justify-start">
                    <span className="text-white font-medium">{row.feature}</span>
                  </div>

                  {/* Spreadsheet */}
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-center md:gap-2 rounded-lg md:rounded-none bg-white/[0.02] md:bg-transparent border border-white/[0.04] md:border-0 px-4 py-3 md:p-0">
                    <span className="text-xs uppercase tracking-wide text-white/40 md:hidden">Spreadsheets</span>
                    <div className="flex items-center gap-2 text-red-400/80">
                      <X className="w-4 h-4" />
                      <span className="text-sm text-white/50 md:text-white/40">{row.spreadsheet}</span>
                    </div>
                  </div>

                  {/* Helm */}
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-center md:gap-2 rounded-lg md:rounded-none bg-white/[0.02] md:bg-transparent border border-white/[0.04] md:border-0 px-4 py-3 md:p-0">
                    <span className="text-xs uppercase tracking-wide text-white/40 md:hidden">Helm</span>
                    <div className="flex items-center gap-2 text-helm-primary-400">
                      <Check className="w-4 h-4" />
                      <span className="text-sm text-white/70">{row.helm}</span>
                    </div>
                  </div>

                  {/* Arrow indicator on hover */}
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    whileHover={{ opacity: 1, x: 0 }}
                    className="absolute right-4 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block"
                  >
                    <ArrowRight className="w-4 h-4 text-helm-primary-400" />
                  </motion.div>
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-6 bg-gradient-to-r from-transparent via-helm-primary-500/5 to-transparent border-t border-white/[0.06]">
              <div className="flex items-center justify-center gap-8 text-sm">
                <div className="flex items-center gap-2 text-red-400/60">
                  <X className="w-4 h-4" />
                  <span>Limited or manual</span>
                </div>
                <div className="flex items-center gap-2 text-helm-primary-400">
                  <Check className="w-4 h-4" />
                  <span>Built-in & automatic</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6 }}
          className="text-center mt-12"
        >
          <p className="text-white/50 mb-4">
            Ready to leave spreadsheets behind?
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <a 
              href="#" 
              className="px-6 py-3 rounded-xl bg-helm-primary-500/10 border border-helm-primary-500/20 text-helm-primary-400 font-medium hover:bg-helm-primary-500/20 transition-colors"
            >
              Try GolfHelm Free
            </a>
            <a 
              href="#" 
              className="px-6 py-3 rounded-xl bg-helm-amber-500/10 border border-helm-amber-500/20 text-helm-amber-400 font-medium hover:bg-helm-amber-500/20 transition-colors"
            >
              Try BaseballHelm Free
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
