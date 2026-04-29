'use client';

import { motion } from 'framer-motion';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat, formatStatInt } from '@/lib/utils/golf-stats-calculator-shots';
import { containerVariants, StatCard, StatRow, StatSection } from './shared-primitives';

export function DrivingStats({ stats }: { stats: GolfStats }) {
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
          label="Driving Distance"
          value={stats.drivingDistanceAvg ? `${Math.round(stats.drivingDistanceAvg)}` : '-'}
          numericValue={stats.drivingDistanceAvg}
          decimals={0}
          subValue="yards avg"
          highlight
          large
          index={0}
        />
        <StatCard
          label="Driver Only"
          value={stats.drivingDistanceDriverOnly ? `${Math.round(stats.drivingDistanceDriverOnly)}` : '-'}
          numericValue={stats.drivingDistanceDriverOnly}
          decimals={0}
          subValue="yards avg"
          index={1}
        />
        <StatCard
          label="Fairway %"
          value={formatStat(stats.fairwayPercentage, '%')}
          numericValue={stats.fairwayPercentage}
          decimals={1}
          index={2}
        />
        <StatCard
          label="Fairways/Round"
          value={formatStat(stats.fairwaysHitPerRound, '', 1)}
          numericValue={stats.fairwaysHitPerRound}
          decimals={1}
          index={3}
        />
      </motion.div>

      {/* Fairway by Hole Type */}
      <StatSection title="Fairway % by Hole Type" delay={0.1}>
        <StatRow label="Par 4s" value={formatStat(stats.fairwayPctPar4, '%')} index={0} />
        <StatRow label="Par 5s" value={formatStat(stats.fairwayPctPar5, '%')} index={1} />
      </StatSection>

      {/* Fairway by Club */}
      <StatSection title="Fairway % by Club" delay={0.15}>
        <StatRow label="With Driver" value={formatStat(stats.fairwayPctDriver, '%')} index={0} />
        <StatRow label="Without Driver" value={formatStat(stats.fairwayPctNonDriver, '%')} index={1} />
      </StatSection>

      {/* Miss Direction */}
      <StatSection title="Miss Direction (when missing fairway)" delay={0.2}>
        <div className="flex items-center justify-center gap-8 py-4">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25, type: 'spring' }}
          >
            <div className="text-[32px] md:text-[36px] font-light text-blue-700 tabular-nums tracking-[-0.025em]">{formatStat(stats.missLeftPct, '%')}</div>
            <div className="text-sm text-warm-500">← Left</div>
          </motion.div>
          <motion.div
            className="w-px h-12 bg-warm-200"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
          />
          <motion.div
            className="text-center"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25, type: 'spring' }}
          >
            <div className="text-3xl font-bold text-orange-600 tabular-nums">{formatStat(stats.missRightPct, '%')}</div>
            <div className="text-sm text-warm-500">Right →</div>
          </motion.div>
        </div>
        <motion.div
          className="text-center text-xs text-warm-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {stats.missLeftCount} left / {stats.missRightCount} right
        </motion.div>
      </StatSection>

      {/* Totals */}
      <StatSection title="Totals" delay={0.25}>
        <StatRow label="Fairways Hit" value={`${stats.fairwaysHit} / ${stats.fairwayOpportunities}`} index={0} />
        <StatRow label="Holes Played" value={formatStatInt(stats.holesPlayed)} index={1} />
      </StatSection>
    </motion.div>
  );
}
