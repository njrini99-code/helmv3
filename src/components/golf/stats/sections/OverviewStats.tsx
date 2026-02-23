'use client';

import { motion } from 'framer-motion';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat } from '@/lib/utils/golf-stats-calculator-shots';
import type { StatisticalStrengthWeakness } from '@/lib/golf/strokes-gained';
import { containerVariants, sectionVariants, StatCard } from './shared-primitives';
import type { PlayerProfile, TrendAnalysisResponse } from './types';

// ============================================================================
// STRENGTH/WEAKNESS CARD (shared between Overview and SG tabs)
// ============================================================================

export function OverviewSWCard({
  item,
  type,
}: {
  item: StatisticalStrengthWeakness;
  type: 'strength' | 'weakness';
}) {
  const isStrength = type === 'strength';
  const impactAbs = Math.abs(item.strokeImpact);
  const impactStr = `${isStrength ? '+' : '-'}${impactAbs.toFixed(1)}`;

  return (
    <motion.div
      className={`rounded-xl p-3.5 border ${
        isStrength
          ? 'bg-primary-50/60 border-primary-200/60'
          : 'bg-red-50/50 border-red-200/60'
      }`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-warm-900 truncate">{item.label}</p>
          <p className="text-xs text-warm-600 mt-0.5">{item.detail}</p>
        </div>
        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${
          isStrength
            ? 'bg-primary-100 text-primary-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {impactStr}
        </span>
      </div>
      {!isStrength && item.recommendation && (
        <p className="text-xs text-warm-500 mt-2 pt-2 border-t border-red-200/40 italic">
          {item.recommendation}
        </p>
      )}
    </motion.div>
  );
}

// ============================================================================
// OVERVIEW STATS COMPONENT (Player Dashboard)
// ============================================================================

export function OverviewStats({
  stats,
  playerName,
  playerProfile,
  trendData,
  statisticalStrengths,
  statisticalWeaknesses,
}: {
  stats: GolfStats;
  playerName?: string;
  playerProfile?: PlayerProfile;
  trendData?: TrendAnalysisResponse | null;
  statisticalStrengths?: StatisticalStrengthWeakness[];
  statisticalWeaknesses?: StatisticalStrengthWeakness[];
}) {
  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Player Header Card */}
      <motion.div
        variants={sectionVariants}
        className="relative glass-standard rounded-2xl overflow-hidden p-6"
      >
        <div className="flex items-start gap-5">
          {/* Player Avatar */}
          <div className="flex-shrink-0">
            {playerProfile?.avatarUrl ? (
              <img
                src={playerProfile.avatarUrl}
                alt={playerName || 'Player'}
                className="w-20 h-20 rounded-2xl object-cover ring-1 ring-warm-200 shadow-lg"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-warm-100 to-warm-200 flex items-center justify-center ring-1 ring-warm-200 shadow-lg">
                <span className="text-warm-500 font-bold text-2xl">
                  {playerName?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                </span>
              </div>
            )}
          </div>

          {/* Player Info */}
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-warm-900 truncate">
              {playerName || 'Player'}
            </h2>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {playerProfile?.gradYear && (
                <span className="px-2.5 py-1 text-xs font-medium bg-warm-100 text-warm-600 rounded-full">
                  Class of {playerProfile.gradYear}
                </span>
              )}
              {playerProfile?.handicap !== null && playerProfile?.handicap !== undefined && (
                <span className="px-2.5 py-1 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                  {playerProfile.handicap > 0 ? '+' : ''}{playerProfile.handicap} HCP
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-warm-200/60">
          <div className="text-center">
            <div className="text-2xl font-bold text-warm-900 tabular-nums">
              {stats.roundsPlayed}
            </div>
            <div className="text-xs text-warm-500 mt-0.5">Rounds</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary-600 tabular-nums">
              {stats.scoringAverage !== null ? stats.scoringAverage.toFixed(1) : '--'}
            </div>
            <div className="text-xs text-warm-500 mt-0.5">Scoring Avg</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-warm-900 tabular-nums">
              {stats.bestRound || '--'}
            </div>
            <div className="text-xs text-warm-500 mt-0.5">Best Round</div>
          </div>
        </div>
      </motion.div>

      {/* Key Performance Metrics */}
      <motion.div variants={sectionVariants}>
        <h3 className="text-sm font-bold text-warm-700 uppercase tracking-wide mb-3">
          Performance Overview
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="GIR %"
            value={formatStat(stats.girPercentage, '%', 1)}
            numericValue={stats.girPercentage}
            highlight={stats.girPercentage !== null && stats.girPercentage >= 50}
            animate
          />
          <StatCard
            label="Fairways"
            value={formatStat(stats.fairwayPercentage, '%', 1)}
            numericValue={stats.fairwayPercentage}
            highlight={stats.fairwayPercentage !== null && stats.fairwayPercentage >= 60}
            animate
          />
          <StatCard
            label="Putts/Rnd"
            value={formatStat(stats.puttsPerRound, '', 1)}
            numericValue={stats.puttsPerRound}
            highlight={stats.puttsPerRound !== null && stats.puttsPerRound < 30}
            animate
          />
          <StatCard
            label="Scrambling"
            value={formatStat(stats.scramblingPercentage, '%', 1)}
            numericValue={stats.scramblingPercentage}
            highlight={stats.scramblingPercentage !== null && stats.scramblingPercentage >= 50}
            animate
          />
        </div>
      </motion.div>

      {/* Strokes Gained Summary */}
      {stats.strokesGainedTotal !== null && (
        <motion.div variants={sectionVariants}>
          <h3 className="text-sm font-bold text-warm-700 uppercase tracking-wide mb-3">
            Strokes Gained
          </h3>
          <div className="glass-standard rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-warm-600">Total</span>
              <span className={`text-xl font-bold tabular-nums ${stats.strokesGainedTotal >= 0 ? 'text-primary-600' : 'text-red-500'}`}>
                {stats.strokesGainedTotal >= 0 ? '+' : ''}{stats.strokesGainedTotal.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Tee', value: stats.strokesGainedTee },
                { label: 'Approach', value: stats.strokesGainedApproach },
                { label: 'Around Green', value: stats.strokesGainedAroundGreen },
                { label: 'Putting', value: stats.strokesGainedPutting },
              ].map(sg => (
                <div key={sg.label} className="text-center p-2 rounded-lg bg-warm-50/80">
                  <div className={`text-sm font-bold tabular-nums ${sg.value !== null && sg.value >= 0 ? 'text-primary-600' : 'text-red-500'}`}>
                    {sg.value !== null ? (sg.value >= 0 ? '+' : '') + sg.value.toFixed(2) : '--'}
                  </div>
                  <div className="text-xs text-warm-500 mt-0.5">{sg.label}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Statistical Strengths & Weaknesses */}
      {(statisticalStrengths && statisticalStrengths.length > 0 || statisticalWeaknesses && statisticalWeaknesses.length > 0) && (
        <motion.div variants={sectionVariants}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Strengths */}
            {statisticalStrengths && statisticalStrengths.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-warm-700 uppercase tracking-wide mb-3">
                  Top Strengths
                </h3>
                <div className="space-y-2">
                  {statisticalStrengths.map((item, i) => (
                    <OverviewSWCard key={i} item={item} type="strength" />
                  ))}
                </div>
              </div>
            )}
            {/* Weaknesses */}
            {statisticalWeaknesses && statisticalWeaknesses.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-warm-700 uppercase tracking-wide mb-3">
                  Areas to Improve
                </h3>
                <div className="space-y-2">
                  {statisticalWeaknesses.map((item, i) => (
                    <OverviewSWCard key={i} item={item} type="weakness" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Personal Bests */}
      {trendData?.personalBests && (
        <motion.div variants={sectionVariants}>
          <h3 className="text-sm font-bold text-warm-700 uppercase tracking-wide mb-3">
            Personal Records
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {trendData.personalBests.bestScore && (
              <div className="glass-standard rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-600 tabular-nums">
                  {trendData.personalBests.bestScore.value}
                </div>
                <div className="text-xs text-warm-500 mt-1">Best Score</div>
                <div className="text-xs text-warm-400 mt-0.5 truncate">
                  {trendData.personalBests.bestScore.course}
                </div>
              </div>
            )}
            {trendData.personalBests.bestToPar && (
              <div className="glass-standard rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-600 tabular-nums">
                  {trendData.personalBests.bestToPar.value > 0 ? '+' : ''}{trendData.personalBests.bestToPar.value}
                </div>
                <div className="text-xs text-warm-500 mt-1">Best to Par</div>
                <div className="text-xs text-warm-400 mt-0.5 truncate">
                  {trendData.personalBests.bestToPar.course}
                </div>
              </div>
            )}
            {trendData.personalBests.bestGir && (
              <div className="glass-standard rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-600 tabular-nums">
                  {trendData.personalBests.bestGir.value}%
                </div>
                <div className="text-xs text-warm-500 mt-1">Best GIR</div>
                <div className="text-xs text-warm-400 mt-0.5 truncate">
                  {trendData.personalBests.bestGir.course}
                </div>
              </div>
            )}
            {trendData.personalBests.lowestPutts && (
              <div className="glass-standard rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-600 tabular-nums">
                  {trendData.personalBests.lowestPutts.value}
                </div>
                <div className="text-xs text-warm-500 mt-1">Lowest Putts</div>
                <div className="text-xs text-warm-400 mt-0.5 truncate">
                  {trendData.personalBests.lowestPutts.course}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Recent Trend */}
      {trendData?.periodComparison && (
        <motion.div variants={sectionVariants}>
          <h3 className="text-sm font-bold text-warm-700 uppercase tracking-wide mb-3">
            Recent Form (Last 30 Days)
          </h3>
          <div className="glass-standard rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-lg font-bold text-warm-900 tabular-nums">
                  {trendData.periodComparison.last30Days.roundCount}
                </div>
                <div className="text-xs text-warm-500">Rounds</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-warm-900 tabular-nums">
                  {trendData.periodComparison.last30Days.scoringAvg?.toFixed(1) || '--'}
                </div>
                <div className="text-xs text-warm-500">Avg Score</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-warm-900 tabular-nums">
                  {trendData.periodComparison.last30Days.girPct?.toFixed(0) || '--'}%
                </div>
                <div className="text-xs text-warm-500">GIR</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-warm-900 tabular-nums">
                  {trendData.periodComparison.last30Days.puttsPerRound?.toFixed(1) || '--'}
                </div>
                <div className="text-xs text-warm-500">Putts/Rnd</div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
