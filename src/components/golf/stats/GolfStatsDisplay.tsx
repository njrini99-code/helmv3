'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconTrendingUp, IconTarget, IconFlag, IconGolf, IconAward, IconChartBar, IconCrosshair, IconFilter, IconChevronDown } from '@/components/icons';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat, formatStatInt } from '@/lib/utils/golf-stats-calculator-shots';
import ProgressStats from './ProgressStats';
import ShotDispersionChart from './ShotDispersionChart';

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 24,
    },
  },
};

const sectionVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 200,
      damping: 20,
    },
  },
};

const tabContentVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

// ============================================================================
// ANIMATED NUMBER HOOK
// ============================================================================

function useAnimatedNumber(value: number | null, duration: number = 800): number {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);

  useEffect(() => {
    if (value === null) {
      setDisplayValue(0);
      return;
    }

    const startValue = previousValue.current;
    const endValue = value;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentValue = startValue + (endValue - startValue) * easeOut;
      setDisplayValue(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValue.current = endValue;
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return displayValue;
}

// ============================================================================
// TYPES
// ============================================================================

type StatsCategory = 'scoring' | 'driving' | 'approach' | 'putting' | 'scrambling' | 'strokes-gained' | 'progress' | 'dispersion';

interface RoundOption {
  id: string;
  round_date: string;
  course_name: string;
  total_score: number;
  total_to_par: number;
}

interface StatsDisplayProps {
  stats: GolfStats;
  playerName?: string;
  rounds?: RoundOption[];
  selectedRoundId?: string | 'overall';
  onRoundChange?: (roundId: string | 'overall') => void;
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

function StatCard({
  label,
  value,
  subValue,
  highlight = false,
  large = false,
  numericValue,
  decimals = 1,
  animate = true,
  index = 0,
}: {
  label: string;
  value: string;
  subValue?: string;
  highlight?: boolean;
  large?: boolean;
  numericValue?: number | null;
  decimals?: number;
  animate?: boolean;
  index?: number;
}) {
  const animatedValue = useAnimatedNumber(
    animate && numericValue !== undefined ? numericValue : null,
    800
  );
  const displayValue = animate && numericValue !== undefined
    ? animatedValue.toFixed(decimals)
    : value;

  return (
    <motion.div
      variants={itemVariants}
      className={`relative glass-standard rounded-xl overflow-hidden p-4 group cursor-default`}
      whileHover={{
        scale: 1.02,
        y: -4,
        transition: { type: 'spring', stiffness: 400, damping: 20 }
      }}
      style={{ willChange: 'transform' }}
    >
      {/* Animated shine effect on hover */}
      <motion.div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        initial={{ opacity: 0.5 }}
        whileHover={{ opacity: 1 }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
        }}
      />

      {/* Subtle glow effect on hover for highlighted cards */}
      {highlight && (
        <motion.div
          className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(22, 163, 74, 0.1) 0%, transparent 70%)',
          }}
        />
      )}

      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
        {label}
      </div>
      <motion.div
        className={`font-bold ${large ? 'text-3xl' : 'text-2xl'} ${highlight ? 'text-green-600' : 'text-slate-900'} tabular-nums`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.05 }}
      >
        {displayValue}
      </motion.div>
      {subValue && (
        <motion.div
          className="text-xs text-slate-400 mt-0.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 + index * 0.05 }}
        >
          {subValue}
        </motion.div>
      )}
    </motion.div>
  );
}

function StatRow({ label, value, index = 0 }: { label: string; value: string; index?: number }) {
  return (
    <motion.div
      className="flex justify-between items-center py-2.5 border-b border-slate-100/80 last:border-0 group hover:bg-slate-50/50 transition-colors rounded px-1 -mx-1"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, type: 'spring', stiffness: 300, damping: 25 }}
    >
      <span className="text-sm text-slate-600 group-hover:text-slate-800 transition-colors">{label}</span>
      <span className="text-sm font-semibold text-slate-900 tabular-nums">{value}</span>
    </motion.div>
  );
}

function StatSection({
  title,
  children,
  delay = 0,
  collapsible = false,
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
  collapsible?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <motion.div
      className="relative glass-standard rounded-2xl overflow-hidden mb-4 group"
      variants={sectionVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
      whileHover={{ boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
    >
      {/* Animated shine effect */}
      <motion.div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        initial={{ opacity: 0.5, scaleX: 0.8 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ delay: delay + 0.1, duration: 0.5 }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
        }}
      />

      <div
        className={`p-4 ${collapsible ? 'cursor-pointer' : ''}`}
        onClick={() => collapsible && setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
            {title}
          </h3>
          {collapsible && (
            <motion.div
              animate={{ rotate: isOpen ? 0 : -90 }}
              transition={{ duration: 0.2 }}
            >
              <IconChevronDown size={16} className="text-slate-400" />
            </motion.div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ============================================================================
// CATEGORY COMPONENTS
// ============================================================================

function ScoringStats({ stats }: { stats: GolfStats }) {
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
            { value: stats.parsPerRound, label: 'Pars', bg: 'bg-slate-50', color: 'text-slate-700' },
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
              <div className="text-xs text-slate-500">{item.label}</div>
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
        <StatRow label="Longest Hole Out" value={stats.longestHoleOut ? `${stats.longestHoleOut} feet` : '-'} index={5} />
      </StatSection>
    </motion.div>
  );
}

function DrivingStats({ stats }: { stats: GolfStats }) {
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
            <div className="text-3xl font-bold text-blue-600 tabular-nums">{formatStat(stats.missLeftPct, '%')}</div>
            <div className="text-sm text-slate-500">← Left</div>
          </motion.div>
          <motion.div
            className="w-px h-12 bg-slate-200"
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
            <div className="text-sm text-slate-500">Right →</div>
          </motion.div>
        </div>
        <motion.div
          className="text-center text-xs text-slate-400"
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

function ApproachStats({ stats }: { stats: GolfStats }) {
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
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-2 font-semibold text-slate-700">Distance</th>
                <th className="text-center py-2 px-2 font-semibold text-green-600">Fairway</th>
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
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.55 + idx * 0.03 }}
                >
                  <td className="py-2 px-2 text-slate-600">{row.label}</td>
                  <td className="py-2 px-2 text-center text-slate-900 tabular-nums">{formatStat(row.data.fairway, '', 2)}</td>
                  <td className="py-2 px-2 text-center text-slate-900 tabular-nums">{formatStat(row.data.rough, '', 2)}</td>
                  <td className="py-2 px-2 text-center text-slate-900 tabular-nums">{formatStat(row.data.sand, '', 2)}</td>
                </motion.tr>
              ))}
            </tbody>
          </motion.table>
        </div>
      </StatSection>
    </motion.div>
  );
}

function PuttingStats({ stats }: { stats: GolfStats }) {
  const [selectedBreak, setSelectedBreak] = useState<'left_to_right' | 'right_to_left' | 'straight' | 'multiple' | null>(null);

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
          label="Putts / Round"
          value={formatStat(stats.puttsPerRound, '', 1)}
          numericValue={stats.puttsPerRound}
          decimals={1}
          highlight
          large
          index={0}
        />
        <StatCard
          label="Putts / GIR"
          value={formatStat(stats.puttsPerGir, '', 2)}
          numericValue={stats.puttsPerGir}
          decimals={2}
          index={1}
        />
        <StatCard
          label="3-Putts / Round"
          value={formatStat(stats.threePuttsPerRound, '', 2)}
          numericValue={stats.threePuttsPerRound}
          decimals={2}
          index={2}
        />
        <StatCard
          label="1-Putts Total"
          value={formatStatInt(stats.onePuttsTotal)}
          numericValue={stats.onePuttsTotal}
          decimals={0}
          index={3}
        />
      </motion.div>

      {/* Make % by Distance */}
      <StatSection title="Make % by Distance" delay={0.1}>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-4">
          {[
            { range: '0-3 ft', value: stats.puttMakePct0_3, bg: 'bg-green-50', color: 'text-green-600' },
            { range: '3-5 ft', value: stats.puttMakePct3_5, bg: 'bg-green-50', color: 'text-green-600' },
            { range: '5-10 ft', value: stats.puttMakePct5_10, bg: 'bg-yellow-50', color: 'text-yellow-600' },
            { range: '10-15 ft', value: stats.puttMakePct10_15, bg: 'bg-orange-50', color: 'text-orange-600' },
            { range: '15-20 ft', value: stats.puttMakePct15_20, bg: 'bg-red-50', color: 'text-red-600' },
          ].map((item, idx) => (
            <motion.div
              key={item.range}
              className={`text-center p-2 ${item.bg} rounded-lg hover:scale-105 transition-transform cursor-default`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 + idx * 0.04, type: 'spring', stiffness: 300 }}
            >
              <div className={`text-lg font-bold ${item.color} tabular-nums`}>{formatStat(item.value, '%', 0)}</div>
              <div className="text-xs text-slate-500">{item.range}</div>
            </motion.div>
          ))}
        </div>
        <StatRow label="20-25 feet" value={formatStat(stats.puttMakePct20_25, '%')} index={0} />
        <StatRow label="25-30 feet" value={formatStat(stats.puttMakePct25_30, '%')} index={1} />
        <StatRow label="30-35 feet" value={formatStat(stats.puttMakePct30_35, '%')} index={2} />
        <StatRow label="35+ feet" value={formatStat(stats.puttMakePct35Plus, '%')} index={3} />
      </StatSection>

      {/* Putting Proximity */}
      <StatSection title="First Putt Leave (avg feet remaining)">
        <StatRow label="From 0-5 feet" value={stats.puttProximity0_5 ? `${stats.puttProximity0_5.toFixed(1)}'` : '-'} />
        <StatRow label="From 5-10 feet" value={stats.puttProximity5_10 ? `${stats.puttProximity5_10.toFixed(1)}'` : '-'} />
        <StatRow label="From 10-15 feet" value={stats.puttProximity10_15 ? `${stats.puttProximity10_15.toFixed(1)}'` : '-'} />
        <StatRow label="From 15-20 feet" value={stats.puttProximity15_20 ? `${stats.puttProximity15_20.toFixed(1)}'` : '-'} />
        <StatRow label="From 20+ feet" value={stats.puttProximity20Plus ? `${stats.puttProximity20Plus.toFixed(1)}'` : '-'} />
      </StatSection>

      {/* Putting Efficiency */}
      <StatSection title="Putting Efficiency (avg putts to hole out)">
        <StatRow label="0-5 feet" value={formatStat(stats.puttEff0_5, '', 2)} />
        <StatRow label="5-10 feet" value={formatStat(stats.puttEff5_10, '', 2)} />
        <StatRow label="10-15 feet" value={formatStat(stats.puttEff10_15, '', 2)} />
        <StatRow label="15-20 feet" value={formatStat(stats.puttEff15_20, '', 2)} />
        <StatRow label="20-25 feet" value={formatStat(stats.puttEff20_25, '', 2)} />
        <StatRow label="25-30 feet" value={formatStat(stats.puttEff25_30, '', 2)} />
        <StatRow label="30-35 feet" value={formatStat(stats.puttEff30_35, '', 2)} />
        <StatRow label="35+ feet" value={formatStat(stats.puttEff35Plus, '', 2)} />
      </StatSection>

      {/* Miss Direction */}
      <StatSection title="Putt Miss Direction" delay={0.3}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 py-4">
          {[
            { label: 'Short', value: stats.puttMissShortPct, bg: 'bg-slate-50', color: 'text-slate-700' },
            { label: 'Long', value: stats.puttMissLongPct, bg: 'bg-slate-50', color: 'text-slate-700' },
            { label: 'Left', value: stats.puttMissLeftPct, bg: 'bg-slate-50', color: 'text-slate-700' },
            { label: 'Right', value: stats.puttMissRightPct, bg: 'bg-slate-50', color: 'text-slate-700' },
            { label: 'Low (amateur)', value: stats.puttMissLowPct, bg: 'bg-blue-50', color: 'text-blue-700' },
            { label: 'High (pro)', value: stats.puttMissHighPct, bg: 'bg-purple-50', color: 'text-purple-700' },
          ].map((item, idx) => (
            <motion.div
              key={item.label}
              className={`text-center p-2 ${item.bg} rounded-lg hover:scale-105 transition-transform cursor-default`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.35 + idx * 0.04, type: 'spring', stiffness: 300 }}
            >
              <div className={`text-xl font-bold ${item.color} tabular-nums`}>{formatStat(item.value, '%', 0)}</div>
              <div className="text-xs text-slate-500">{item.label}</div>
            </motion.div>
          ))}
        </div>
      </StatSection>

      {/* Putting by Break Type */}
      <StatSection title="Putting by Break Type">
        {/* Break Type Toggle */}
        <div className="flex flex-wrap gap-2 mb-4">
          {([
            { key: 'left_to_right', label: 'L → R' },
            { key: 'right_to_left', label: 'R → L' },
            { key: 'straight', label: 'Straight' },
            { key: 'multiple', label: 'Multiple' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSelectedBreak(selectedBreak === key ? null : key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedBreak === key
                  ? 'bg-green-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {selectedBreak ? (
          <div className="space-y-4">
            {/* Make % by Distance for Selected Break */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">
                Make % by Distance - {selectedBreak === 'left_to_right' ? 'Left to Right' :
                                      selectedBreak === 'right_to_left' ? 'Right to Left' :
                                      selectedBreak === 'straight' ? 'Straight' : 'Multiple Breaks'}
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-2">
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-green-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct0_3, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">0-3 ft</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-green-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct3_5, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">3-5 ft</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-yellow-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct5_10, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">5-10 ft</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-orange-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct10_15, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">10-15 ft</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-red-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct15_20, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">15-20 ft</div>
                </div>
              </div>
              <div className="space-y-1 mt-2">
                <StatRow label="20-25 feet" value={formatStat(stats.puttingByBreak[selectedBreak].makePct20_25, '%')} />
                <StatRow label="25-30 feet" value={formatStat(stats.puttingByBreak[selectedBreak].makePct25_30, '%')} />
                <StatRow label="30-35 feet" value={formatStat(stats.puttingByBreak[selectedBreak].makePct30_35, '%')} />
                <StatRow label="35+ feet" value={formatStat(stats.puttingByBreak[selectedBreak].makePct35Plus, '%')} />
                <StatRow label="Overall Make %" value={formatStat(stats.puttingByBreak[selectedBreak].overallMakePct, '%')} />
              </div>
            </div>

            {/* Miss Direction for Selected Break */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">Miss Direction</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-slate-700">
                    {formatStat(stats.puttingByBreak[selectedBreak].missShortPct, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">Short</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-blue-700">
                    {formatStat(stats.puttingByBreak[selectedBreak].missLowPct, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">Low</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-purple-700">
                    {formatStat(stats.puttingByBreak[selectedBreak].missHighPct, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">High</div>
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-500 italic">
              Total putts with this break: {stats.puttingByBreak[selectedBreak].totalPutts}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500 text-center py-4">
            Select a break type above to view detailed statistics
          </div>
        )}
      </StatSection>

      {/* Totals */}
      <StatSection title="Totals" delay={0.4}>
        <StatRow label="Total Putts" value={formatStatInt(stats.totalPutts)} index={0} />
        <StatRow label="Total 3-Putts" value={formatStatInt(stats.threePuttsTotal)} index={1} />
        <StatRow label="Putts per Hole" value={formatStat(stats.puttsPerHole, '', 2)} index={2} />
      </StatSection>
    </motion.div>
  );
}

function ScramblingStats({ stats }: { stats: GolfStats }) {
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

      {/* Sand Saves & Penalties */}
      <StatSection title="Sand Saves & Penalties" delay={0.3}>
        <StatRow label="Sand Saves" value={`${stats.sandSavesMade} / ${stats.sandSaveAttempts}`} index={0} />
        <StatRow label="Total Penalties" value={formatStatInt(stats.totalPenalties)} index={1} />
      </StatSection>
    </motion.div>
  );
}

function StrokesGainedStats({ stats }: { stats: GolfStats }) {
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
      <StatSection title="Strokes Gained Overview (vs PGA Tour)" delay={0.1}>
        <motion.div
          className="mb-4 text-sm text-slate-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          Positive numbers indicate better than PGA Tour average. Negative numbers indicate worse than tour average.
        </motion.div>
        <StatRow label="Total Strokes Gained" value={formatStat(stats.strokesGainedTotal, '', 2)} index={0} />
        <StatRow label="Strokes Gained: Tee" value={formatStat(stats.strokesGainedTee, '', 2)} index={1} />
        <StatRow label="Strokes Gained: Approach" value={formatStat(stats.strokesGainedApproach, '', 2)} index={2} />
        <StatRow label="Strokes Gained: Around Green" value={formatStat(stats.strokesGainedAroundGreen, '', 2)} index={3} />
        <StatRow label="Strokes Gained: Putting" value={formatStat(stats.strokesGainedPutting, '', 2)} index={4} />
      </StatSection>

      {/* Per Round Breakdown */}
      <StatSection title="Strokes Gained Per Round" delay={0.2}>
        <StatRow label="SG: Tee per Round" value={formatStat(stats.sgTeePerRound, '', 2)} index={0} />
        <StatRow label="SG: Approach per Round" value={formatStat(stats.sgApproachPerRound, '', 2)} index={1} />
        <StatRow label="SG: Around Green per Round" value={formatStat(stats.sgAroundGreenPerRound, '', 2)} index={2} />
        <StatRow label="SG: Putting per Round" value={formatStat(stats.sgPuttingPerRound, '', 2)} index={3} />
        <StatRow label="SG: Total per Round" value={formatStat(stats.sgTotalPerRound, '', 2)} index={4} />
      </StatSection>

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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function GolfStatsDisplay({
  stats,
  playerName,
  rounds = [],
  selectedRoundId = 'overall',
  onRoundChange
}: StatsDisplayProps) {
  const [activeCategory, setActiveCategory] = useState<StatsCategory>('scoring');
  const [showFilters, setShowFilters] = useState(false);

  const categories: { id: StatsCategory; label: string; icon: React.ReactNode; description: string }[] = [
    { id: 'progress', label: 'Progress', icon: <IconChartBar size={16} />, description: 'Track improvement over time' },
    { id: 'dispersion', label: 'Spray Charts', icon: <IconCrosshair size={16} />, description: 'Visualize shot patterns' },
    { id: 'scoring', label: 'Scoring', icon: <IconAward size={16} />, description: 'Score breakdown and trends' },
    { id: 'driving', label: 'Driving', icon: <IconGolf size={16} />, description: 'Tee shot performance' },
    { id: 'approach', label: 'Approach', icon: <IconTarget size={16} />, description: 'Green in regulation stats' },
    { id: 'putting', label: 'Putting', icon: <IconFlag size={16} />, description: 'Putting efficiency by distance' },
    { id: 'scrambling', label: 'Scrambling', icon: <IconTrendingUp size={16} />, description: 'Short game recovery' },
    { id: 'strokes-gained', label: 'Strokes Gained', icon: <IconChartBar size={16} />, description: 'Tour-level comparison' },
  ];

  const formatRoundDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header with animation */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <motion.h1
                className="text-2xl font-bold text-slate-900"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
              >
                {playerName ? `${playerName}'s Stats` : 'My Stats'}
              </motion.h1>
              <motion.p
                className="text-slate-500 text-sm mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {stats.roundsPlayed} rounds • {stats.holesPlayed} holes
              </motion.p>
            </div>

            {/* Round Selector & Filter Controls */}
            <div className="flex items-center gap-3">
              {/* Filter Toggle */}
              <motion.button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2.5 rounded-lg border transition-all ${
                  showFilters
                    ? 'bg-green-50 border-green-200 text-green-600'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-green-300 hover:text-green-600'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Filter options"
              >
                <IconFilter size={18} />
              </motion.button>

              {/* Round Selector */}
              {onRoundChange && rounds.length > 0 && (
                <motion.div
                  className="min-w-[200px]"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">
                    View Stats
                  </label>
                  <select
                    value={selectedRoundId}
                    onChange={(e) => onRoundChange(e.target.value as string | 'overall')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 bg-white hover:border-green-300 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none transition-all"
                  >
                    <option value="overall">Overall Stats</option>
                    <optgroup label="Individual Rounds">
                      {rounds.map(round => (
                        <option key={round.id} value={round.id}>
                          {formatRoundDate(round.round_date)} • {round.course_name} ({round.total_score})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </motion.div>
              )}
            </div>
          </div>

          {/* Filter Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                className="glass-standard rounded-xl p-4 mb-4"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">Quick Filters</h3>
                  <button
                    onClick={() => setShowFilters(false)}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['Last 5 Rounds', 'Last 10 Rounds', 'Tournaments Only', 'Practice Only', 'This Month', 'This Year'].map((filter, idx) => (
                    <motion.button
                      key={filter}
                      className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-full text-slate-600 hover:border-green-300 hover:bg-green-50 hover:text-green-700 transition-all"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {filter}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Category Pills with enhanced animation */}
        <motion.div
          className="flex gap-2 overflow-x-auto pb-4 mb-4 -mx-4 px-4 scrollbar-hide"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {categories.map((cat, idx) => (
            <motion.button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? 'bg-green-600 text-white shadow-lg shadow-green-600/25'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-green-300 hover:shadow-md'
              }`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + idx * 0.03 }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Active indicator pulse */}
              {activeCategory === cat.id && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-green-400"
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.3 }}
                  style={{ zIndex: -1, opacity: 0.3 }}
                />
              )}
              {cat.icon}
              {cat.label}
            </motion.button>
          ))}
        </motion.div>

        {/* Category Description */}
        <AnimatePresence mode="wait">
          <motion.p
            key={activeCategory}
            className="text-sm text-slate-500 mb-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            {categories.find(c => c.id === activeCategory)?.description}
          </motion.p>
        </AnimatePresence>

        {/* Stats Content with AnimatePresence for tab transitions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            variants={tabContentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {activeCategory === 'progress' && <ProgressStats stats={stats} rounds={rounds} />}
            {activeCategory === 'dispersion' && <ShotDispersionChart stats={stats} />}
            {activeCategory === 'scoring' && <ScoringStats stats={stats} />}
            {activeCategory === 'driving' && <DrivingStats stats={stats} />}
            {activeCategory === 'approach' && <ApproachStats stats={stats} />}
            {activeCategory === 'putting' && <PuttingStats stats={stats} />}
            {activeCategory === 'scrambling' && <ScramblingStats stats={stats} />}
            {activeCategory === 'strokes-gained' && <StrokesGainedStats stats={stats} />}
          </motion.div>
        </AnimatePresence>

        {/* Empty State */}
        {stats.roundsPlayed === 0 && (
          <motion.div
            className="text-center py-16"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
          >
            <motion.div
              className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4"
              animate={{
                boxShadow: [
                  '0 0 0 0 rgba(22, 163, 74, 0)',
                  '0 0 0 20px rgba(22, 163, 74, 0.1)',
                  '0 0 0 0 rgba(22, 163, 74, 0)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <IconGolf size={40} className="text-slate-300" />
            </motion.div>
            <motion.h2
              className="text-lg font-semibold text-slate-900 mb-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              No Stats Yet
            </motion.h2>
            <motion.p
              className="text-slate-500 max-w-sm mx-auto"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              Complete rounds with shot tracking to see your detailed statistics here.
            </motion.p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
