'use client';

import { motion } from 'framer-motion';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat } from '@/lib/utils/golf-stats-calculator-shots';
import { containerVariants, StatCard, StatRow, StatSection } from './shared-primitives';

export function ApproachStats({ stats }: { stats: GolfStats }) {
  return (
    <motion.div
      className="space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* GIR Stats - MOVED FROM DRIVING */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={containerVariants}>
        <StatCard
          label="GIR %"
          value={formatStat(stats.girPercentage, '%')}
          numericValue={stats.girPercentage}
          decimals={1}
          highlight
          large
          index={0}
        />
        <StatCard
          label="GIR / Round"
          value={formatStat(stats.girPerRound, '', 1)}
          numericValue={stats.girPerRound}
          decimals={1}
          index={1}
        />
        <StatCard
          label="Total GIR"
          value={`${stats.girTotal}/${stats.girOpportunities}`}
          animate={false}
          index={2}
        />
        <StatCard
          label="Approach Proximity"
          value={stats.approachProximityAvg ? `${Math.round(stats.approachProximityAvg)}'` : '-'}
          numericValue={stats.approachProximityAvg}
          decimals={0}
          index={3}
        />
      </motion.div>

      {/* GIR % by Par Type */}
      <StatSection title="GIR % by Hole Type" delay={0.1}>
        <StatRow label="Par 3s" value={formatStat(stats.girPctPar3, '%')} index={0} />
        <StatRow label="Par 4s" value={formatStat(stats.girPctPar4, '%')} index={1} />
        <StatRow label="Par 5s" value={formatStat(stats.girPctPar5, '%')} index={2} />
      </StatSection>

      {/* GIR % by Distance */}
      <StatSection title="GIR % by Approach Distance" delay={0.15} collapsible>
        <StatRow label="50-75 yards" value={formatStat(stats.girPct50_75, '%')} index={0} />
        <StatRow label="75-100 yards" value={formatStat(stats.girPct75_100, '%')} index={1} />
        <StatRow label="100-125 yards" value={formatStat(stats.girPct100_125, '%')} index={2} />
        <StatRow label="125-150 yards" value={formatStat(stats.girPct125_150, '%')} index={3} />
        <StatRow label="150-175 yards" value={formatStat(stats.girPct150_175, '%')} index={4} />
        <StatRow label="175-200 yards" value={formatStat(stats.girPct175_200, '%')} index={5} />
        <StatRow label="200-225 yards" value={formatStat(stats.girPct200_225, '%')} index={6} />
        <StatRow label="225+ yards" value={formatStat(stats.girPct225Plus, '%')} index={7} />
      </StatSection>

      {/* GIR % by Lie */}
      <StatSection title="GIR % by Lie" delay={0.2}>
        <StatRow label="From Fairway" value={formatStat(stats.girPctFromFairway, '%')} index={0} />
        <StatRow label="From Rough" value={formatStat(stats.girPctFromRough, '%')} index={1} />
        <StatRow label="From Sand" value={formatStat(stats.girPctFromSand, '%')} index={2} />
      </StatSection>

      {/* Proximity Split */}
      <StatSection title="Proximity Analysis" delay={0.25}>
        <StatRow
          label="Avg Proximity (All)"
          value={stats.approachProximityAvg ? `${Math.round(stats.approachProximityAvg)}'` : '-'}
          index={0}
        />
        <StatRow
          label="When Hit Green"
          value={stats.approachProximityWhenHitGreen ? `${Math.round(stats.approachProximityWhenHitGreen)}'` : '-'}
          index={1}
        />
        <StatRow
          label="When Missed Green"
          value={stats.approachProximityWhenMissedGreen ? `${Math.round(stats.approachProximityWhenMissedGreen)}'` : '-'}
          index={2}
        />
      </StatSection>

      {/* Proximity by Hole Type */}
      <StatSection title="Proximity by Hole Type (feet)" delay={0.3}>
        <StatRow label="Par 3s" value={stats.approachProximityPar3 ? `${Math.round(stats.approachProximityPar3)}'` : '-'} index={0} />
        <StatRow label="Par 4s" value={stats.approachProximityPar4 ? `${Math.round(stats.approachProximityPar4)}'` : '-'} index={1} />
        <StatRow label="Par 5s" value={stats.approachProximityPar5 ? `${Math.round(stats.approachProximityPar5)}'` : '-'} index={2} />
      </StatSection>

      {/* Proximity by Lie */}
      <StatSection title="Proximity by Lie (feet)" delay={0.35} collapsible>
        <StatRow label="From Fairway" value={stats.approachProximityFairway ? `${Math.round(stats.approachProximityFairway)}'` : '-'} index={0} />
        <StatRow label="From Rough" value={stats.approachProximityRough ? `${Math.round(stats.approachProximityRough)}'` : '-'} index={1} />
        <StatRow label="From Sand" value={stats.approachProximitySand ? `${Math.round(stats.approachProximitySand)}'` : '-'} index={2} />
      </StatSection>

      {/* Proximity by Distance */}
      <StatSection title="Proximity by Distance (feet from hole)" delay={0.4} collapsible>
        <StatRow label="30-75 yards" value={stats.approachProx30_75 ? `${Math.round(stats.approachProx30_75)}'` : '-'} index={0} />
        <StatRow label="75-100 yards" value={stats.approachProx75_100 ? `${Math.round(stats.approachProx75_100)}'` : '-'} index={1} />
        <StatRow label="100-125 yards" value={stats.approachProx100_125 ? `${Math.round(stats.approachProx100_125)}'` : '-'} index={2} />
        <StatRow label="125-150 yards" value={stats.approachProx125_150 ? `${Math.round(stats.approachProx125_150)}'` : '-'} index={3} />
        <StatRow label="150-175 yards" value={stats.approachProx150_175 ? `${Math.round(stats.approachProx150_175)}'` : '-'} index={4} />
        <StatRow label="175-200 yards" value={stats.approachProx175_200 ? `${Math.round(stats.approachProx175_200)}'` : '-'} index={5} />
        <StatRow label="200-225 yards" value={stats.approachProx200_225 ? `${Math.round(stats.approachProx200_225)}'` : '-'} index={6} />
        <StatRow label="225+ yards" value={stats.approachProx225Plus ? `${Math.round(stats.approachProx225Plus)}'` : '-'} index={7} />
      </StatSection>

      {/* Approach Efficiency by Lie */}
      <StatSection title="Approach Efficiency (avg strokes to hole out) by Lie" delay={0.45} collapsible>
        <div className="overflow-x-auto">
          <motion.table
            className="w-full text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <thead>
              <tr className="border-b border-warm-200">
                <th className="text-left py-2 px-2 font-semibold text-warm-700">Distance</th>
                <th className="text-center py-2 px-2 font-semibold text-primary-600">Fairway</th>
                <th className="text-center py-2 px-2 font-semibold text-amber-600">Rough</th>
                <th className="text-center py-2 px-2 font-semibold text-orange-600">Sand</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: '30-75 yds', data: stats.approachEff30_75 },
                { label: '75-100 yds', data: stats.approachEff75_100 },
                { label: '100-125 yds', data: stats.approachEff100_125 },
                { label: '125-150 yds', data: stats.approachEff125_150 },
                { label: '150-175 yds', data: stats.approachEff150_175 },
                { label: '175-200 yds', data: stats.approachEff175_200 },
                { label: '200-225 yds', data: stats.approachEff200_225 },
                { label: '225+ yds', data: stats.approachEff225Plus },
              ].map((row, idx) => (
                <motion.tr
                  key={row.label}
                  className="border-b border-warm-100 last:border-0 hover:bg-warm-50/50 transition-colors"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.55 + idx * 0.03 }}
                >
                  <td className="py-2 px-2 text-warm-600">{row.label}</td>
                  <td className="py-2 px-2 text-center text-warm-900 tabular-nums">{formatStat(row.data.fairway, '', 2)}</td>
                  <td className="py-2 px-2 text-center text-warm-900 tabular-nums">{formatStat(row.data.rough, '', 2)}</td>
                  <td className="py-2 px-2 text-center text-warm-900 tabular-nums">{formatStat(row.data.sand, '', 2)}</td>
                </motion.tr>
              ))}
            </tbody>
          </motion.table>
        </div>
      </StatSection>

      {/* Approach Miss Direction (when missing green) */}
      {stats.approachMissTotal > 0 && (
        <StatSection title="Miss Direction Pattern (when missing green)" delay={0.5} collapsible>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            {[
              { label: 'Short', value: stats.approachMissShortPct, bg: 'bg-blue-50', color: 'text-blue-600' },
              { label: 'Long', value: stats.approachMissLongPct, bg: 'bg-purple-50', color: 'text-purple-600' },
              { label: 'Left', value: stats.approachMissLeftPct, bg: 'bg-red-50', color: 'text-red-600' },
              { label: 'Right', value: stats.approachMissRightPct, bg: 'bg-orange-50', color: 'text-orange-600' },
            ].map((item, idx) => (
              <motion.div
                key={item.label}
                className={`text-center p-3 ${item.bg} rounded-lg hover:scale-105 transition-transform cursor-default`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.55 + idx * 0.04, type: 'spring', stiffness: 300 }}
              >
                <div className={`text-[20px] font-medium tracking-[-0.012em] ${item.color} tabular-nums`}>{formatStat(item.value, '%', 0)}</div>
                <div className="text-xs text-warm-500">{item.label}</div>
              </motion.div>
            ))}
          </div>

          {/* Compound miss directions - more detailed pattern analysis */}
          <div className="mt-4 pt-4 border-t border-warm-100">
            <div className="text-sm font-medium text-warm-700 mb-3">Compound Miss Patterns</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: 'Short-Left', value: stats.approachMissShortLeftPct, icon: '↙' },
                { label: 'Short-Right', value: stats.approachMissShortRightPct, icon: '↘' },
                { label: 'Long-Left', value: stats.approachMissLongLeftPct, icon: '↖' },
                { label: 'Long-Right', value: stats.approachMissLongRightPct, icon: '↗' },
              ].map((item, idx) => (
                <motion.div
                  key={item.label}
                  className="text-center p-2 bg-warm-50 rounded-lg hover:bg-warm-100 active:bg-warm-200 transition-colors cursor-default"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + idx * 0.04 }}
                >
                  <div className="text-[17px] font-medium tracking-[-0.005em] text-warm-700 tabular-nums">
                    <span className="text-warm-400 mr-1">{item.icon}</span>
                    {formatStat(item.value, '%', 0)}
                  </div>
                  <div className="text-xs text-warm-500">{item.label}</div>
                </motion.div>
              ))}
            </div>
            <div className="text-xs text-warm-400 mt-2 text-center">
              Based on {stats.approachMissTotal} missed greens
            </div>
          </div>
        </StatSection>
      )}
    </motion.div>
  );
}
