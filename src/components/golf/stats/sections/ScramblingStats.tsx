'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat, formatStatInt } from '@/lib/utils/golf-stats-calculator-shots';
import { containerVariants, StatCard, StatRow, StatSection } from './shared-primitives';

export function ScramblingStats({ stats }: { stats: GolfStats }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      className="space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Key Metrics */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={containerVariants}>
        <StatCard
          label="Scrambling %"
          value={formatStat(stats.scramblingPercentage, '%')}
          numericValue={stats.scramblingPercentage}
          decimals={1}
          highlight
          large
          index={0}
        />
        <StatCard
          label="Sand Save %"
          value={formatStat(stats.sandSavePercentage, '%')}
          numericValue={stats.sandSavePercentage}
          decimals={1}
          index={1}
        />
        <StatCard
          label="Scrambles Made"
          value={`${stats.scramblesMade}/${stats.scrambleAttempts}`}
          animate={false}
          index={2}
        />
        <StatCard
          label="Penalties / Round"
          value={formatStat(stats.penaltiesPerRound, '', 2)}
          numericValue={stats.penaltiesPerRound}
          decimals={2}
          index={3}
        />
      </motion.div>

      {/* Scrambling by Lie */}
      <StatSection title="Scrambling % by Lie" delay={0.1}>
        <StatRow label="From Fairway" value={formatStat(stats.scramblingPctFairway, '%')} index={0} />
        <StatRow label="From Rough" value={formatStat(stats.scramblingPctRough, '%')} index={1} />
        <StatRow label="From Sand" value={formatStat(stats.scramblingPctSand, '%')} index={2} />
      </StatSection>

      {/* Scrambling by Distance */}
      <StatSection title="Scrambling % by Distance" delay={0.15}>
        <StatRow label="0-10 yards" value={formatStat(stats.scramblingPct0_10, '%')} index={0} />
        <StatRow label="10-20 yards" value={formatStat(stats.scramblingPct10_20, '%')} index={1} />
        <StatRow label="20-30 yards" value={formatStat(stats.scramblingPct20_30, '%')} index={2} />
      </StatSection>

      {/* Around the Green Efficiency */}
      <StatSection title="Around the Green Efficiency (avg strokes to hole out)" delay={0.2}>
        <StatRow label="Overall Average" value={formatStat(stats.atgEfficiencyAvg, '', 2)} index={0} />
        <StatRow label="0-10 yards" value={formatStat(stats.atgEfficiency0_10, '', 2)} index={1} />
        <StatRow label="10-20 yards" value={formatStat(stats.atgEfficiency10_20, '', 2)} index={2} />
        <StatRow label="20-30 yards" value={formatStat(stats.atgEfficiency20_30, '', 2)} index={3} />
      </StatSection>

      {/* ATG Efficiency by Lie */}
      <StatSection title="Around the Green by Lie (avg strokes)" delay={0.25}>
        <StatRow label="From Fairway" value={formatStat(stats.atgEffFairway, '', 2)} index={0} />
        <StatRow label="From Rough" value={formatStat(stats.atgEffRough, '', 2)} index={1} />
        <StatRow label="From Sand" value={formatStat(stats.atgEffSand, '', 2)} index={2} />
      </StatSection>

      {/* ATG Efficiency Matrix (Distance x Lie) */}
      {stats.atgEffByDistanceLie && Object.keys(stats.atgEffByDistanceLie).length > 0 && (
        <StatSection title="Around the Green Efficiency Matrix (Distance × Lie)" delay={0.3} collapsible>
          <div className="overflow-x-auto">
            <motion.table
              className="w-full text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.35 })}
            >
              <thead>
                <tr className="border-b border-warm-200">
                  <th className="text-left py-2 px-2 font-medium text-warm-700">Distance</th>
                  <th className="text-center py-2 px-2 font-medium text-primary-600">Fairway</th>
                  <th className="text-center py-2 px-2 font-medium text-amber-600">Rough</th>
                  <th className="text-center py-2 px-2 font-medium text-orange-600">Sand</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: '0-10 yds', key: '0_10' },
                  { label: '10-20 yds', key: '10_20' },
                  { label: '20-30 yds', key: '20_30' },
                ].map((row, idx) => {
                  const data = stats.atgEffByDistanceLie[row.key];
                  if (!data) return null;
                  return (
                    <motion.tr
                      key={row.key}
                      className="border-b border-warm-100 last:border-0 hover:bg-warm-50/50 transition-colors"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.4 + idx * 0.03 })}
                    >
                      <td className="py-2 px-2 text-warm-600">{row.label}</td>
                      <td className="py-2 px-2 text-center text-warm-900 tabular-nums">{formatStat(data.fairway, '', 2)}</td>
                      <td className="py-2 px-2 text-center text-warm-900 tabular-nums">{formatStat(data.rough, '', 2)}</td>
                      <td className="py-2 px-2 text-center text-warm-900 tabular-nums">{formatStat(data.sand, '', 2)}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </motion.table>
          </div>
          <div className="text-xs text-warm-400 mt-2 text-center">
            Average strokes to hole out from each distance and lie combination
          </div>
        </StatSection>
      )}

      {/* Sand Saves & Penalties */}
      <StatSection title="Sand Saves & Penalties" delay={0.35}>
        <StatRow label="Sand Saves" value={`${stats.sandSavesMade} / ${stats.sandSaveAttempts}`} index={0} />
        <StatRow label="Total Penalties" value={formatStatInt(stats.totalPenalties)} index={1} />
      </StatSection>
    </motion.div>
  );
}
