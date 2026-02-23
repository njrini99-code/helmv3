'use client';

import { motion } from 'framer-motion';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat, formatStatInt } from '@/lib/utils/golf-stats-calculator-shots';
import { containerVariants, StatCard, StatRow, StatSection } from './shared-primitives';

export function ScoringStats({ stats }: { stats: GolfStats }) {
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
          label="Scoring Average"
          value={formatStat(stats.scoringAverage, '', 2)}
          numericValue={stats.scoringAverage}
          decimals={2}
          highlight
          large
          index={0}
        />
        <StatCard
          label="Best Round"
          value={formatStatInt(stats.bestRound)}
          numericValue={stats.bestRound}
          decimals={0}
          index={1}
        />
        <StatCard
          label="Worst Round"
          value={formatStatInt(stats.worstRound)}
          numericValue={stats.worstRound}
          decimals={0}
          index={2}
        />
        <StatCard
          label="Rounds Played"
          value={formatStatInt(stats.roundsPlayed)}
          numericValue={stats.roundsPlayed}
          decimals={0}
          index={3}
        />
      </motion.div>

      {/* Per Round Stats */}
      <StatSection title="Per Round Averages" delay={0.1}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { value: stats.eaglesPerRound, label: 'Eagles', bg: 'bg-yellow-50', color: 'text-yellow-600' },
            { value: stats.birdiesPerRound, label: 'Birdies', bg: 'bg-red-50', color: 'text-red-500' },
            { value: stats.parsPerRound, label: 'Pars', bg: 'bg-warm-50', color: 'text-warm-700' },
            { value: stats.bogeysPerRound, label: 'Bogeys', bg: 'bg-orange-50', color: 'text-orange-600' },
            { value: stats.doublePlusPerRound, label: 'Double+', bg: 'bg-red-100', color: 'text-red-700' },
          ].map((item, idx) => (
            <motion.div
              key={item.label}
              className={`text-center p-3 ${item.bg} rounded-lg hover:scale-105 transition-transform cursor-default`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05, type: 'spring', stiffness: 300 }}
            >
              <div className={`text-2xl font-bold ${item.color} tabular-nums`}>
                {formatStat(item.value, '', 2)}
              </div>
              <div className="text-xs text-warm-500">{item.label}</div>
            </motion.div>
          ))}
        </div>
      </StatSection>

      {/* Totals */}
      <StatSection title="Career Totals" delay={0.2}>
        <StatRow label="Total Birdies" value={formatStatInt(stats.totalBirdies)} index={0} />
        <StatRow label="Total Eagles" value={formatStatInt(stats.totalEagles)} index={1} />
        <StatRow label="Total Pars" value={formatStatInt(stats.totalPars)} index={2} />
        <StatRow label="Total Bogeys" value={formatStatInt(stats.totalBogeys)} index={3} />
        <StatRow label="Double Bogey+" value={formatStatInt(stats.totalDoublePlus)} index={4} />
      </StatSection>

      {/* By Round Type */}
      <StatSection title="Scoring by Round Type" delay={0.3}>
        <StatRow label="Practice Rounds" value={`${formatStat(stats.practiceScoringAvg, '', 2)} (${stats.practiceRounds} rounds)`} index={0} />
        <StatRow label="Qualifying Rounds" value={`${formatStat(stats.qualifyingScoringAvg, '', 2)} (${stats.qualifyingRounds} rounds)`} index={1} />
        <StatRow label="Tournament Rounds" value={`${formatStat(stats.tournamentScoringAvg, '', 2)} (${stats.tournamentRounds} rounds)`} index={2} />
      </StatSection>

      {/* Streaks */}
      <StatSection title="Streaks & Records" delay={0.4}>
        <StatRow label="Most Birdies in a Round" value={formatStatInt(stats.mostBirdiesRound)} index={0} />
        <StatRow label="Most Birdies in a Row" value={formatStatInt(stats.mostBirdiesRow)} index={1} />
        <StatRow label="Most Pars in a Row" value={formatStatInt(stats.mostParsRow)} index={2} />
        <StatRow label="Current No 3-Putt Streak" value={`${formatStatInt(stats.currentNo3PuttStreak)} holes`} index={3} />
        <StatRow label="Longest No 3-Putt Streak" value={`${formatStatInt(stats.longestNo3PuttStreak)} holes`} index={4} />
        <StatRow label="Longest Hole Out" value={stats.longestHoleOut ? `${Math.round(stats.longestHoleOut)} yards` : '-'} index={5} />
      </StatSection>
    </motion.div>
  );
}
