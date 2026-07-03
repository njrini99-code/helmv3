'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { EASE_CINEMATIC, DURATION } from '@/lib/coachhelm/v3/motion';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat, formatStatInt } from '@/lib/utils/golf-stats-calculator-shots';
import { containerVariants, StatCard, StatRow, StatSection } from './shared-primitives';
import type { HoleFormat } from './shared-primitives';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import { yardsToDisplay, yardsLabel } from '@/lib/golf/distance-units';

export function ScoringStats({ stats, holeFormat = 'all' }: { stats: GolfStats; holeFormat?: HoleFormat }) {
  const prefersReducedMotion = useReducedMotion();
  const { distancePref } = useDistanceUnits();
  const hasBothFormats = stats.roundsPlayed18 > 0 && stats.roundsPlayed9 > 0;
  const has18 = stats.roundsPlayed18 > 0;

  // Resolve which stats to show based on format filter
  const showFormat = holeFormat === 'all'
    ? (hasBothFormats ? 'both' : has18 ? '18' : '9')
    : holeFormat;

  // Pick the right values for the selected format
  const scoringAvg = showFormat === '9' ? stats.scoringAverage9
    : showFormat === '18' ? stats.scoringAverage18
    : (has18 ? stats.scoringAverage18 : stats.scoringAverage9); // 'both' → headline uses 18
  const bestRound = showFormat === '9' ? stats.bestRound9
    : showFormat === '18' ? stats.bestRound18
    : (has18 ? stats.bestRound18 : stats.bestRound9);
  const worstRound = showFormat === '9' ? stats.worstRound9
    : showFormat === '18' ? stats.worstRound18
    : (has18 ? stats.worstRound18 : stats.worstRound9);
  const roundsCount = showFormat === '9' ? stats.roundsPlayed9
    : showFormat === '18' ? stats.roundsPlayed18
    : stats.roundsPlayed;

  // Build rounds subtitle for 'both' mode
  const roundsSubtitle = showFormat === 'both'
    ? `${stats.roundsPlayed18} (18H) / ${stats.roundsPlayed9} (9H)`
    : undefined;

  return (
    <motion.div
      className="space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Key Metrics */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={containerVariants}>
        {showFormat === 'both' ? (
          <>
            <StatCard
              label="18-Hole Avg"
              value={formatStat(stats.scoringAverage18, '', 2)}
              numericValue={stats.scoringAverage18 ?? undefined}
              decimals={2}
              highlight
              large
              index={0}
            />
            <StatCard
              label="9-Hole Avg"
              value={formatStat(stats.scoringAverage9, '', 2)}
              numericValue={stats.scoringAverage9 ?? undefined}
              decimals={2}
              index={1}
            />
            <StatCard
              label="Best 18"
              value={formatStatInt(stats.bestRound18)}
              numericValue={stats.bestRound18 ?? undefined}
              decimals={0}
              index={2}
            />
            <StatCard
              label="Best 9"
              value={formatStatInt(stats.bestRound9)}
              numericValue={stats.bestRound9 ?? undefined}
              decimals={0}
              index={3}
            />
          </>
        ) : (
          <>
            <StatCard
              label="Scoring Average"
              value={formatStat(scoringAvg, '', 2)}
              numericValue={scoringAvg ?? undefined}
              decimals={2}
              highlight
              large
              index={0}
            />
            <StatCard
              label="Best Round"
              value={formatStatInt(bestRound)}
              numericValue={bestRound ?? undefined}
              decimals={0}
              index={1}
            />
            <StatCard
              label="Worst Round"
              value={formatStatInt(worstRound)}
              numericValue={worstRound ?? undefined}
              decimals={0}
              index={2}
            />
            <StatCard
              label="Rounds Played"
              value={formatStatInt(roundsCount)}
              numericValue={roundsCount}
              decimals={0}
              index={3}
            />
          </>
        )}
      </motion.div>

      {/* Second row for 'both' mode: worst rounds + rounds played */}
      {showFormat === 'both' && (
        <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={containerVariants}>
          <StatCard
            label="Worst 18"
            value={formatStatInt(stats.worstRound18)}
            numericValue={stats.worstRound18 ?? undefined}
            decimals={0}
            index={0}
          />
          <StatCard
            label="Worst 9"
            value={formatStatInt(stats.worstRound9)}
            numericValue={stats.worstRound9 ?? undefined}
            decimals={0}
            index={1}
          />
          <StatCard
            label="Rounds Played"
            value={formatStatInt(stats.roundsPlayed)}
            numericValue={stats.roundsPlayed}
            decimals={0}
            subValue={roundsSubtitle}
            index={2}
          />
        </motion.div>
      )}

      {/* Per Round Stats — always combined across all rounds */}
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
              transition={prefersReducedMotion ? { duration: 0 } : ({ delay: idx * 0.05, duration: DURATION.short, ease: EASE_CINEMATIC })}
            >
              <div className={`text-h2 font-light tracking-[-0.025em] ${item.color} tabular-nums`}>
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
        <StatRow label="Longest Hole Out" value={stats.longestHoleOut ? `${yardsToDisplay(Math.round(stats.longestHoleOut), distancePref)} ${yardsLabel(distancePref)}` : '-'} index={5} />
      </StatSection>
    </motion.div>
  );
}
