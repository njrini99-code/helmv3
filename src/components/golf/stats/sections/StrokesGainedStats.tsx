'use client';

import { motion } from 'framer-motion';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat } from '@/lib/utils/golf-stats-calculator-shots';
import type { StatisticalStrengthWeakness } from '@/lib/golf/strokes-gained';
import { containerVariants, StatCard, StatRow, StatSection } from './shared-primitives';
import { OverviewSWCard } from './OverviewStats';

export function StrokesGainedStats({
  stats,
  statisticalStrengths,
  statisticalWeaknesses,
}: {
  stats: GolfStats;
  statisticalStrengths?: StatisticalStrengthWeakness[];
  statisticalWeaknesses?: StatisticalStrengthWeakness[];
}) {
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
          label="SG Total / Round"
          value={formatStat(stats.sgTotalPerRound, '', 2)}
          numericValue={stats.sgTotalPerRound}
          decimals={2}
          highlight
          large
          index={0}
        />
        <StatCard
          label="SG Tee / Round"
          value={formatStat(stats.sgTeePerRound, '', 2)}
          numericValue={stats.sgTeePerRound}
          decimals={2}
          index={1}
        />
        <StatCard
          label="SG Approach / Round"
          value={formatStat(stats.sgApproachPerRound, '', 2)}
          numericValue={stats.sgApproachPerRound}
          decimals={2}
          index={2}
        />
        <StatCard
          label="SG Putting / Round"
          value={formatStat(stats.sgPuttingPerRound, '', 2)}
          numericValue={stats.sgPuttingPerRound}
          decimals={2}
          index={3}
        />
      </motion.div>

      {/* Strokes Gained Overview */}
      <StatSection title="Strokes Gained Per Round (vs PGA Tour)" delay={0.1}>
        <motion.div
          className="mb-4 text-sm text-warm-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          Average strokes gained per round. Positive numbers indicate better than PGA Tour average.
        </motion.div>
        <StatRow label="Total Strokes Gained" value={formatStat(stats.sgTotalPerRound, '', 2)} index={0} />
        <StatRow label="Strokes Gained: Tee" value={formatStat(stats.sgTeePerRound, '', 2)} index={1} />
        <StatRow label="Strokes Gained: Approach" value={formatStat(stats.sgApproachPerRound, '', 2)} index={2} />
        <StatRow label="Strokes Gained: Around Green" value={formatStat(stats.sgAroundGreenPerRound, '', 2)} index={3} />
        <StatRow label="Strokes Gained: Putting" value={formatStat(stats.sgPuttingPerRound, '', 2)} index={4} />
      </StatSection>

      {/* Per Round Breakdown */}
      <StatSection title="Strokes Gained Per Round" delay={0.2}>
        <StatRow label="SG: Tee per Round" value={formatStat(stats.sgTeePerRound, '', 2)} index={0} />
        <StatRow label="SG: Approach per Round" value={formatStat(stats.sgApproachPerRound, '', 2)} index={1} />
        <StatRow label="SG: Around Green per Round" value={formatStat(stats.sgAroundGreenPerRound, '', 2)} index={2} />
        <StatRow label="SG: Putting per Round" value={formatStat(stats.sgPuttingPerRound, '', 2)} index={3} />
        <StatRow label="SG: Total per Round" value={formatStat(stats.sgTotalPerRound, '', 2)} index={4} />
      </StatSection>

      {/* Statistical Strengths & Weaknesses */}
      {(statisticalStrengths && statisticalStrengths.length > 0 || statisticalWeaknesses && statisticalWeaknesses.length > 0) && (
        <StatSection title="Strengths & Weaknesses" delay={0.25}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {statisticalStrengths && statisticalStrengths.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide mb-2">Strengths</p>
                <div className="space-y-2">
                  {statisticalStrengths.map((item, i) => (
                    <OverviewSWCard key={i} item={item} type="strength" />
                  ))}
                </div>
              </div>
            )}
            {statisticalWeaknesses && statisticalWeaknesses.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Areas to Improve</p>
                <div className="space-y-2">
                  {statisticalWeaknesses.map((item, i) => (
                    <OverviewSWCard key={i} item={item} type="weakness" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </StatSection>
      )}

      {/* Info */}
      <motion.div
        className="bg-blue-50 border border-blue-200 rounded-xl p-4 backdrop-blur-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
      >
        <div className="text-sm font-semibold text-blue-900 mb-2">What is Strokes Gained?</div>
        <div className="text-sm text-blue-800 space-y-1">
          <p>Strokes Gained measures performance relative to PGA Tour benchmarks:</p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li><strong>Tee:</strong> Driving performance from the tee</li>
            <li><strong>Approach:</strong> Shots aimed at the green from fairway, rough, or sand</li>
            <li><strong>Around Green:</strong> Shots within 30 yards of the green</li>
            <li><strong>Putting:</strong> All putts on the green</li>
          </ul>
          <p className="mt-2">A positive SG value means you performed better than the tour average for that category.</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
