'use client';

import { useState, useRef, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconTrendingUp, IconTarget, IconFlag, IconGolf, IconAward, IconChartBar, IconCrosshair, IconFilter, IconChevronDown, IconDownload, IconPrinter, IconHome } from '@/components/icons';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat, formatStatInt } from '@/lib/utils/golf-stats-calculator-shots';
import type { StatisticalStrengthWeakness } from '@/lib/golf/strokes-gained';
import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';
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

// useAnimatedNumber is imported from @/hooks/useAnimatedNumber

// ============================================================================
// SPARKLINE COMPONENT
// ============================================================================

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showDots?: boolean;
  lowerIsBetter?: boolean;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  color: _color = '#16A34A',
  showDots = false,
  lowerIsBetter = false,
}: SparklineProps) {
  const instanceId = useId();
  if (!data || data.length < 2) return null;

  const padding = 2;
  const actualWidth = width - padding * 2;
  const actualHeight = height - padding * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Calculate points
  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * actualWidth;
    const y = padding + actualHeight - ((value - min) / range) * actualHeight;
    return { x, y, value };
  });

  // Create path
  const pathD = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  // Determine trend color
  const first = data[0];
  const last = data[data.length - 1];

  // Safety check (should never happen after length check above, but TypeScript needs this)
  if (first === undefined || last === undefined) return null;

  const isImproving = lowerIsBetter ? last < first : last > first;
  const trendColor = isImproving ? '#16A34A' : last === first ? '#94A3B8' : '#DC2626';

  // Get first and last points (guaranteed to exist since data.length >= 2)
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  if (!firstPoint || !lastPoint) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      {/* Gradient fill */}
      <defs>
        <linearGradient id={`sparkGradient-${instanceId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={trendColor} stopOpacity={0.3} />
          <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path
        d={`${pathD} L ${lastPoint.x} ${height} L ${firstPoint.x} ${height} Z`}
        fill={`url(#sparkGradient-${instanceId})`}
      />

      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke={trendColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {showDots && (
        <>
          <circle
            cx={firstPoint.x}
            cy={firstPoint.y}
            r={2}
            fill="white"
            stroke={trendColor}
            strokeWidth={1}
          />
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={2.5}
            fill={trendColor}
            stroke="white"
            strokeWidth={1}
          />
        </>
      )}
    </svg>
  );
}

// ============================================================================
// TYPES
// ============================================================================

type StatsCategory = 'overview' | 'scoring' | 'driving' | 'approach' | 'putting' | 'scrambling' | 'strokes-gained' | 'progress' | 'dispersion' | 'analysis';

interface RoundOption {
  id: string;
  round_date: string;
  course_name: string;
  total_score: number;
  total_to_par: number;
}

// Filter types
interface StatsFilter {
  preset?: 'last5' | 'last10' | 'last20' | 'tournaments' | 'practice' | 'thisMonth' | 'thisYear' | 'custom';
  startDate?: string;
  endDate?: string;
  courseName?: string;
  roundType?: 'practice' | 'qualifier' | 'tournament';
  season?: number;
}

interface FilterOptions {
  courses: string[];
  seasons: number[];
  roundTypes: string[];
}

interface CourseStats {
  courseName: string;
  roundCount: number;
  scoringAverage: number | null;
  bestRound: number | null;
  girPct: number | null;
  fairwayPct: number | null;
  puttsPerRound: number | null;
  lastPlayed: string;
}

interface CourseBreakdownResponse {
  courses: CourseStats[];
  bestCourse: string | null;
  worstCourse: string | null;
}

interface HoleAnalysis {
  holeNumber: number;
  par: number;
  averageScore: number;
  averageToPar: number;
  timesPlayed: number;
  birdieOrBetter: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  trend: 'improving' | 'declining' | 'stable';
}

interface WorstHoleResponse {
  holes: HoleAnalysis[];
  worstHoles: HoleAnalysis[];
  bestHoles: HoleAnalysis[];
  par3Average: number | null;
  par4Average: number | null;
  par5Average: number | null;
  closingHolesAverage: number | null;
}

interface PersonalBest {
  value: number;
  date: string;
  course: string;
}

interface PeriodStats {
  roundCount: number;
  scoringAvg: number | null;
  girPct: number | null;
  fairwayPct: number | null;
  puttsPerRound: number | null;
}

interface TrendAnalysisResponse {
  rounds: Array<{
    id: string;
    date: string;
    score: number;
    toPar: number;
    courseName: string;
    roundType: string | null;
    girPct: number | null;
    fairwayPct: number | null;
    putts: number | null;
    scrambling: number | null;
  }>;
  trends: {
    score: Array<{ date: string; value: number; roundId: string; courseName: string }>;
    gir: Array<{ date: string; value: number; roundId: string; courseName: string }>;
    fairway: Array<{ date: string; value: number; roundId: string; courseName: string }>;
    putts: Array<{ date: string; value: number; roundId: string; courseName: string }>;
  };
  rollingAverages: {
    score5: (number | null)[];
    score10: (number | null)[];
    score20: (number | null)[];
  };
  periodComparison: {
    last30Days: PeriodStats;
    previous30Days: PeriodStats;
  };
  personalBests: {
    bestScore: PersonalBest | null;
    bestToPar: PersonalBest | null;
    bestGir: PersonalBest | null;
    lowestPutts: PersonalBest | null;
  };
}

// Player profile for coach view
interface PlayerProfile {
  avatarUrl?: string | null;
  gradYear?: number | null;
  handicap?: number | null;
  roundsPlayed?: number;
  scoringAverage?: number | null;
  bestRound?: number | null;
}

interface StatsDisplayProps {
  stats: GolfStats;
  playerName?: string;
  // Player profile (for coach view dashboard header)
  playerProfile?: PlayerProfile;
  isCoachView?: boolean;
  rounds?: RoundOption[];
  selectedRoundId?: string | 'overall';
  onRoundChange?: (roundId: string | 'overall') => void;
  // Filter props
  activeFilter?: StatsFilter | null;
  onFilterChange?: (filter: StatsFilter | null) => void;
  filterOptions?: FilterOptions | null;
  // Analytics props
  courseBreakdown?: CourseBreakdownResponse | null;
  worstHoleData?: WorstHoleResponse | null;
  trendData?: TrendAnalysisResponse | null;
  // Statistical strengths/weaknesses
  statisticalStrengths?: StatisticalStrengthWeakness[];
  statisticalWeaknesses?: StatisticalStrengthWeakness[];
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
  trend,
  comparisonValue,
  comparisonLabel,
  sparklineData,
  sparklineLowerIsBetter,
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
  trend?: 'improving' | 'declining' | 'stable';
  comparisonValue?: number | null;
  comparisonLabel?: string;
  sparklineData?: number[];
  sparklineLowerIsBetter?: boolean;
}) {
  const animatedValue = useAnimatedNumber(
    animate && numericValue !== undefined ? numericValue : null,
    800
  );
  const displayValue = animate && numericValue !== undefined
    ? animatedValue.toFixed(decimals)
    : value;

  // Get trend indicator styling
  const getTrendStyles = () => {
    if (!trend) return null;
    switch (trend) {
      case 'improving':
        return { icon: '↑', color: 'text-green-500', bg: 'bg-green-50' };
      case 'declining':
        return { icon: '↓', color: 'text-red-500', bg: 'bg-red-50' };
      case 'stable':
        return { icon: '→', color: 'text-slate-500', bg: 'bg-slate-50' };
    }
  };
  const trendStyles = getTrendStyles();

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

      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          {label}
        </span>
        {trendStyles && (
          <motion.span
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${trendStyles.bg} ${trendStyles.color}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            {trendStyles.icon}
          </motion.span>
        )}
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
      {comparisonValue !== undefined && comparisonValue !== null && (
        <motion.div
          className="flex items-center gap-1 mt-1.5 text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-slate-400">{comparisonLabel || 'vs team'}:</span>
          <span className={comparisonValue > 0 ? 'text-red-500' : comparisonValue < 0 ? 'text-green-500' : 'text-slate-500'}>
            {comparisonValue > 0 ? '+' : ''}{comparisonValue.toFixed(1)}
          </span>
        </motion.div>
      )}
      {/* Sparkline */}
      {sparklineData && sparklineData.length >= 3 && (
        <motion.div
          className="mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Sparkline
            data={sparklineData}
            width={70}
            height={20}
            showDots
            lowerIsBetter={sparklineLowerIsBetter}
          />
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
        <StatRow label="Longest Hole Out" value={stats.longestHoleOut ? `${Math.round(stats.longestHoleOut)} yards` : '-'} index={5} />
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
                <div className={`text-xl font-bold ${item.color} tabular-nums`}>{formatStat(item.value, '%', 0)}</div>
                <div className="text-xs text-slate-500">{item.label}</div>
              </motion.div>
            ))}
          </div>

          {/* Compound miss directions - more detailed pattern analysis */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-sm font-medium text-slate-700 mb-3">Compound Miss Patterns</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: 'Short-Left', value: stats.approachMissShortLeftPct, icon: '↙' },
                { label: 'Short-Right', value: stats.approachMissShortRightPct, icon: '↘' },
                { label: 'Long-Left', value: stats.approachMissLongLeftPct, icon: '↖' },
                { label: 'Long-Right', value: stats.approachMissLongRightPct, icon: '↗' },
              ].map((item, idx) => (
                <motion.div
                  key={item.label}
                  className="text-center p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-default"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + idx * 0.04 }}
                >
                  <div className="text-lg font-bold text-slate-700 tabular-nums">
                    <span className="text-slate-400 mr-1">{item.icon}</span>
                    {formatStat(item.value, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">{item.label}</div>
                </motion.div>
              ))}
            </div>
            <div className="text-xs text-slate-400 mt-2 text-center">
              Based on {stats.approachMissTotal} missed greens
            </div>
          </div>
        </StatSection>
      )}
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

      {/* ATG Efficiency Matrix (Distance x Lie) */}
      {stats.atgEffByDistanceLie && Object.keys(stats.atgEffByDistanceLie).length > 0 && (
        <StatSection title="Around the Green Efficiency Matrix (Distance × Lie)" delay={0.3} collapsible>
          <div className="overflow-x-auto">
            <motion.table
              className="w-full text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
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
                  { label: '0-10 yds', key: '0_10' },
                  { label: '10-20 yds', key: '10_20' },
                  { label: '20-30 yds', key: '20_30' },
                ].map((row, idx) => {
                  const data = stats.atgEffByDistanceLie[row.key];
                  if (!data) return null;
                  return (
                    <motion.tr
                      key={row.key}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + idx * 0.03 }}
                    >
                      <td className="py-2 px-2 text-slate-600">{row.label}</td>
                      <td className="py-2 px-2 text-center text-slate-900 tabular-nums">{formatStat(data.fairway, '', 2)}</td>
                      <td className="py-2 px-2 text-center text-slate-900 tabular-nums">{formatStat(data.rough, '', 2)}</td>
                      <td className="py-2 px-2 text-center text-slate-900 tabular-nums">{formatStat(data.sand, '', 2)}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </motion.table>
          </div>
          <div className="text-xs text-slate-400 mt-2 text-center">
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

function StrokesGainedStats({
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

      {/* Statistical Strengths & Weaknesses */}
      {(statisticalStrengths && statisticalStrengths.length > 0 || statisticalWeaknesses && statisticalWeaknesses.length > 0) && (
        <StatSection title="Strengths & Weaknesses" delay={0.25}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {statisticalStrengths && statisticalStrengths.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Strengths</p>
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

// ============================================================================
// STRENGTH/WEAKNESS CARD (shared between Overview and SG tabs)
// ============================================================================

function OverviewSWCard({
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
          ? 'bg-green-50/60 border-green-200/60'
          : 'bg-red-50/50 border-red-200/60'
      }`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{item.label}</p>
          <p className="text-xs text-slate-600 mt-0.5">{item.detail}</p>
        </div>
        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${
          isStrength
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {impactStr}
        </span>
      </div>
      {!isStrength && item.recommendation && (
        <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-red-200/40 italic">
          {item.recommendation}
        </p>
      )}
    </motion.div>
  );
}

// ============================================================================
// OVERVIEW STATS COMPONENT (Player Dashboard)
// ============================================================================

function OverviewStats({
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
                className="w-20 h-20 rounded-2xl object-cover ring-1 ring-slate-200 shadow-lg"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center ring-1 ring-slate-200 shadow-lg">
                <span className="text-slate-500 font-bold text-2xl">
                  {playerName?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                </span>
              </div>
            )}
          </div>

          {/* Player Info */}
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 truncate">
              {playerName || 'Player'}
            </h2>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {playerProfile?.gradYear && (
                <span className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-full">
                  Class of {playerProfile.gradYear}
                </span>
              )}
              {playerProfile?.handicap !== null && playerProfile?.handicap !== undefined && (
                <span className="px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                  {playerProfile.handicap > 0 ? '+' : ''}{playerProfile.handicap} HCP
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-slate-200/60">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {stats.roundsPlayed}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Rounds</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 tabular-nums">
              {stats.scoringAverage !== null ? stats.scoringAverage.toFixed(1) : '--'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Scoring Avg</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {stats.bestRound || '--'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Best Round</div>
          </div>
        </div>
      </motion.div>

      {/* Key Performance Metrics */}
      <motion.div variants={sectionVariants}>
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">
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
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">
            Strokes Gained
          </h3>
          <div className="glass-standard rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-slate-600">Total</span>
              <span className={`text-xl font-bold tabular-nums ${stats.strokesGainedTotal >= 0 ? 'text-green-600' : 'text-red-500'}`}>
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
                <div key={sg.label} className="text-center p-2 rounded-lg bg-slate-50/80">
                  <div className={`text-sm font-bold tabular-nums ${sg.value !== null && sg.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {sg.value !== null ? (sg.value >= 0 ? '+' : '') + sg.value.toFixed(2) : '--'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{sg.label}</div>
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
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">
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
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">
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
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">
            Personal Records
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {trendData.personalBests.bestScore && (
              <div className="glass-standard rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-600 tabular-nums">
                  {trendData.personalBests.bestScore.value}
                </div>
                <div className="text-xs text-slate-500 mt-1">Best Score</div>
                <div className="text-xs text-slate-400 mt-0.5 truncate">
                  {trendData.personalBests.bestScore.course}
                </div>
              </div>
            )}
            {trendData.personalBests.bestToPar && (
              <div className="glass-standard rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-600 tabular-nums">
                  {trendData.personalBests.bestToPar.value > 0 ? '+' : ''}{trendData.personalBests.bestToPar.value}
                </div>
                <div className="text-xs text-slate-500 mt-1">Best to Par</div>
                <div className="text-xs text-slate-400 mt-0.5 truncate">
                  {trendData.personalBests.bestToPar.course}
                </div>
              </div>
            )}
            {trendData.personalBests.bestGir && (
              <div className="glass-standard rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-600 tabular-nums">
                  {trendData.personalBests.bestGir.value}%
                </div>
                <div className="text-xs text-slate-500 mt-1">Best GIR</div>
                <div className="text-xs text-slate-400 mt-0.5 truncate">
                  {trendData.personalBests.bestGir.course}
                </div>
              </div>
            )}
            {trendData.personalBests.lowestPutts && (
              <div className="glass-standard rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-600 tabular-nums">
                  {trendData.personalBests.lowestPutts.value}
                </div>
                <div className="text-xs text-slate-500 mt-1">Lowest Putts</div>
                <div className="text-xs text-slate-400 mt-0.5 truncate">
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
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">
            Recent Form (Last 30 Days)
          </h3>
          <div className="glass-standard rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-lg font-bold text-slate-900 tabular-nums">
                  {trendData.periodComparison.last30Days.roundCount}
                </div>
                <div className="text-xs text-slate-500">Rounds</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-900 tabular-nums">
                  {trendData.periodComparison.last30Days.scoringAvg?.toFixed(1) || '--'}
                </div>
                <div className="text-xs text-slate-500">Avg Score</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-900 tabular-nums">
                  {trendData.periodComparison.last30Days.girPct?.toFixed(0) || '--'}%
                </div>
                <div className="text-xs text-slate-500">GIR</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-900 tabular-nums">
                  {trendData.periodComparison.last30Days.puttsPerRound?.toFixed(1) || '--'}
                </div>
                <div className="text-xs text-slate-500">Putts/Rnd</div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================================================
// ANALYSIS STATS COMPONENT (Course & Hole Breakdown)
// ============================================================================

function AnalysisStats({
  worstHoleData,
  courseBreakdown,
  trendData,
}: {
  worstHoleData?: WorstHoleResponse | null;
  courseBreakdown?: CourseBreakdownResponse | null;
  trendData?: TrendAnalysisResponse | null;
}) {
  // Helper to format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Calculate trend direction from period comparison
  const getTrend = (current: number | null, previous: number | null, lowerIsBetter = true): 'improving' | 'declining' | 'stable' => {
    if (current === null || previous === null) return 'stable';
    const diff = current - previous;
    if (Math.abs(diff) < 0.5) return 'stable';
    if (lowerIsBetter) {
      return diff < 0 ? 'improving' : 'declining';
    }
    return diff > 0 ? 'improving' : 'declining';
  };

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Personal Bests */}
      {trendData?.personalBests && (
        <StatSection title="Personal Records" delay={0}>
          <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={containerVariants}>
            {trendData.personalBests.bestScore && (
              <motion.div
                className="p-4 rounded-xl bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
              >
                <div className="text-xs text-amber-600 font-medium mb-1">Best Score</div>
                <div className="text-2xl font-bold text-amber-700">{trendData.personalBests.bestScore.value}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {formatDate(trendData.personalBests.bestScore.date)}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {trendData.personalBests.bestScore.course}
                </div>
              </motion.div>
            )}
            {trendData.personalBests.bestToPar && (
              <motion.div
                className="p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 }}
              >
                <div className="text-xs text-green-600 font-medium mb-1">Best vs Par</div>
                <div className="text-2xl font-bold text-green-700">
                  {trendData.personalBests.bestToPar.value > 0 ? '+' : ''}{trendData.personalBests.bestToPar.value}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {formatDate(trendData.personalBests.bestToPar.date)}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {trendData.personalBests.bestToPar.course}
                </div>
              </motion.div>
            )}
            {trendData.personalBests.bestGir && (
              <motion.div
                className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="text-xs text-blue-600 font-medium mb-1">Best GIR %</div>
                <div className="text-2xl font-bold text-blue-700">{trendData.personalBests.bestGir.value}%</div>
                <div className="text-xs text-slate-500 mt-1">
                  {formatDate(trendData.personalBests.bestGir.date)}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {trendData.personalBests.bestGir.course}
                </div>
              </motion.div>
            )}
            {trendData.personalBests.lowestPutts && (
              <motion.div
                className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 }}
              >
                <div className="text-xs text-purple-600 font-medium mb-1">Fewest Putts</div>
                <div className="text-2xl font-bold text-purple-700">{trendData.personalBests.lowestPutts.value}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {formatDate(trendData.personalBests.lowestPutts.date)}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {trendData.personalBests.lowestPutts.course}
                </div>
              </motion.div>
            )}
          </motion.div>
        </StatSection>
      )}

      {/* Period Comparison - Last 30 Days vs Previous */}
      {trendData?.periodComparison && trendData.periodComparison.last30Days.roundCount > 0 && (
        <StatSection title="Last 30 Days vs Previous 30 Days" delay={0.1}>
          <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={containerVariants}>
            <StatCard
              label="Scoring Avg"
              value={trendData.periodComparison.last30Days.scoringAvg?.toFixed(1) || '--'}
              numericValue={trendData.periodComparison.last30Days.scoringAvg}
              decimals={1}
              trend={getTrend(
                trendData.periodComparison.last30Days.scoringAvg,
                trendData.periodComparison.previous30Days.scoringAvg,
                true
              )}
              comparisonValue={
                trendData.periodComparison.last30Days.scoringAvg && trendData.periodComparison.previous30Days.scoringAvg
                  ? trendData.periodComparison.last30Days.scoringAvg - trendData.periodComparison.previous30Days.scoringAvg
                  : null
              }
              comparisonLabel="vs prev"
              index={0}
              sparklineData={trendData.trends.score.slice(-10).map(t => t.value)}
              sparklineLowerIsBetter={true}
            />
            <StatCard
              label="GIR %"
              value={trendData.periodComparison.last30Days.girPct !== null ? `${trendData.periodComparison.last30Days.girPct}%` : '--'}
              numericValue={trendData.periodComparison.last30Days.girPct}
              decimals={0}
              trend={getTrend(
                trendData.periodComparison.last30Days.girPct,
                trendData.periodComparison.previous30Days.girPct,
                false
              )}
              comparisonValue={
                trendData.periodComparison.last30Days.girPct !== null && trendData.periodComparison.previous30Days.girPct !== null
                  ? trendData.periodComparison.last30Days.girPct - trendData.periodComparison.previous30Days.girPct
                  : null
              }
              comparisonLabel="vs prev"
              index={1}
              sparklineData={trendData.trends.gir.slice(-10).map(t => t.value)}
              sparklineLowerIsBetter={false}
            />
            <StatCard
              label="Fairway %"
              value={trendData.periodComparison.last30Days.fairwayPct !== null ? `${trendData.periodComparison.last30Days.fairwayPct}%` : '--'}
              numericValue={trendData.periodComparison.last30Days.fairwayPct}
              decimals={0}
              trend={getTrend(
                trendData.periodComparison.last30Days.fairwayPct,
                trendData.periodComparison.previous30Days.fairwayPct,
                false
              )}
              comparisonValue={
                trendData.periodComparison.last30Days.fairwayPct !== null && trendData.periodComparison.previous30Days.fairwayPct !== null
                  ? trendData.periodComparison.last30Days.fairwayPct - trendData.periodComparison.previous30Days.fairwayPct
                  : null
              }
              comparisonLabel="vs prev"
              index={2}
              sparklineData={trendData.trends.fairway.slice(-10).map(t => t.value)}
              sparklineLowerIsBetter={false}
            />
            <StatCard
              label="Putts/Rd"
              value={trendData.periodComparison.last30Days.puttsPerRound?.toFixed(1) || '--'}
              numericValue={trendData.periodComparison.last30Days.puttsPerRound}
              decimals={1}
              trend={getTrend(
                trendData.periodComparison.last30Days.puttsPerRound,
                trendData.periodComparison.previous30Days.puttsPerRound,
                true
              )}
              comparisonValue={
                trendData.periodComparison.last30Days.puttsPerRound && trendData.periodComparison.previous30Days.puttsPerRound
                  ? trendData.periodComparison.last30Days.puttsPerRound - trendData.periodComparison.previous30Days.puttsPerRound
                  : null
              }
              comparisonLabel="vs prev"
              index={3}
              sparklineData={trendData.trends.putts.slice(-10).map(t => t.value)}
              sparklineLowerIsBetter={true}
            />
          </motion.div>
          <motion.p
            className="text-xs text-slate-400 mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {trendData.periodComparison.last30Days.roundCount} rounds in last 30 days
            {trendData.periodComparison.previous30Days.roundCount > 0 && (
              <> • {trendData.periodComparison.previous30Days.roundCount} in previous 30 days</>
            )}
          </motion.p>
        </StatSection>
      )}

      {/* Hole Performance Summary */}
      {worstHoleData && worstHoleData.holes.length > 0 && (
        <>
          {/* Par Type Performance */}
          <StatSection title="Performance by Par Type" delay={0}>
            <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={containerVariants}>
              <StatCard
                label="Par 3s"
                value={worstHoleData.par3Average !== null ? `${worstHoleData.par3Average > 0 ? '+' : ''}${worstHoleData.par3Average.toFixed(2)}` : '--'}
                subValue="avg to par"
                highlight={worstHoleData.par3Average !== null && worstHoleData.par3Average < 0}
                index={0}
              />
              <StatCard
                label="Par 4s"
                value={worstHoleData.par4Average !== null ? `${worstHoleData.par4Average > 0 ? '+' : ''}${worstHoleData.par4Average.toFixed(2)}` : '--'}
                subValue="avg to par"
                highlight={worstHoleData.par4Average !== null && worstHoleData.par4Average < 0}
                index={1}
              />
              <StatCard
                label="Par 5s"
                value={worstHoleData.par5Average !== null ? `${worstHoleData.par5Average > 0 ? '+' : ''}${worstHoleData.par5Average.toFixed(2)}` : '--'}
                subValue="avg to par"
                highlight={worstHoleData.par5Average !== null && worstHoleData.par5Average < 0}
                index={2}
              />
              <StatCard
                label="Closing (16-18)"
                value={worstHoleData.closingHolesAverage !== null ? `${worstHoleData.closingHolesAverage > 0 ? '+' : ''}${worstHoleData.closingHolesAverage.toFixed(2)}` : '--'}
                subValue="avg to par"
                highlight={worstHoleData.closingHolesAverage !== null && worstHoleData.closingHolesAverage < 0}
                index={3}
              />
            </motion.div>
          </StatSection>

          {/* Worst & Best Holes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Worst Holes */}
            <StatSection title="Areas to Improve (Worst Holes)" delay={0.1}>
              {worstHoleData.worstHoles.map((hole, idx) => (
                <motion.div
                  key={hole.holeNumber}
                  className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                      <span className="text-sm font-bold text-red-600">#{hole.holeNumber}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">Par {hole.par}</p>
                      <p className="text-xs text-slate-500">{hole.timesPlayed} rounds</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">
                      +{hole.averageToPar.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-400">avg {hole.averageScore.toFixed(1)}</p>
                  </div>
                </motion.div>
              ))}
            </StatSection>

            {/* Best Holes */}
            <StatSection title="Strengths (Best Holes)" delay={0.15}>
              {worstHoleData.bestHoles.map((hole, idx) => (
                <motion.div
                  key={hole.holeNumber}
                  className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                      <span className="text-sm font-bold text-green-600">#{hole.holeNumber}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">Par {hole.par}</p>
                      <p className="text-xs text-slate-500">{hole.timesPlayed} rounds</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">
                      {hole.averageToPar > 0 ? '+' : ''}{hole.averageToPar.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-400">avg {hole.averageScore.toFixed(1)}</p>
                  </div>
                </motion.div>
              ))}
            </StatSection>
          </div>

          {/* Full Hole-by-Hole Breakdown */}
          <StatSection title="All Holes Performance" delay={0.2} collapsible>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {worstHoleData.holes.map((hole, idx) => (
                <motion.div
                  key={hole.holeNumber}
                  className={`p-3 rounded-lg text-center ${
                    hole.averageToPar <= -0.1 ? 'bg-green-50 border border-green-200' :
                    hole.averageToPar >= 0.3 ? 'bg-red-50 border border-red-200' :
                    'bg-slate-50 border border-slate-200'
                  }`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.02 }}
                >
                  <div className="text-xs text-slate-500">Hole {hole.holeNumber}</div>
                  <div className={`text-sm font-bold ${
                    hole.averageToPar <= -0.1 ? 'text-green-600' :
                    hole.averageToPar >= 0.3 ? 'text-red-600' :
                    'text-slate-700'
                  }`}>
                    {hole.averageToPar > 0 ? '+' : ''}{hole.averageToPar.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400">Par {hole.par}</div>
                  {hole.trend !== 'stable' && (
                    <span className={`text-xs ${hole.trend === 'improving' ? 'text-green-500' : 'text-red-500'}`}>
                      {hole.trend === 'improving' ? '↑' : '↓'}
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
          </StatSection>
        </>
      )}

      {/* Course Breakdown */}
      {courseBreakdown && courseBreakdown.courses.length > 0 && (
        <StatSection title="Performance by Course" delay={0.25}>
          <div className="space-y-2">
            {courseBreakdown.courses.slice(0, 10).map((course, idx) => (
              <motion.div
                key={course.courseName}
                className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-slate-50 transition-colors"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    course.courseName === courseBreakdown.bestCourse ? 'bg-green-100' :
                    course.courseName === courseBreakdown.worstCourse ? 'bg-red-100' :
                    'bg-slate-100'
                  }`}>
                    <span className={`text-xs font-bold ${
                      course.courseName === courseBreakdown.bestCourse ? 'text-green-600' :
                      course.courseName === courseBreakdown.worstCourse ? 'text-red-600' :
                      'text-slate-500'
                    }`}>
                      {idx + 1}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{course.courseName}</p>
                    <p className="text-xs text-slate-500">{course.roundCount} rounds</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center hidden md:block">
                    <p className="text-xs text-slate-400">Avg Score</p>
                    <p className="text-sm font-semibold text-slate-700">{course.scoringAverage?.toFixed(1) || '--'}</p>
                  </div>
                  <div className="text-center hidden md:block">
                    <p className="text-xs text-slate-400">Best</p>
                    <p className="text-sm font-semibold text-green-600">{course.bestRound || '--'}</p>
                  </div>
                  <div className="text-center hidden md:block">
                    <p className="text-xs text-slate-400">GIR%</p>
                    <p className="text-sm font-semibold text-slate-700">{course.girPct !== null ? `${course.girPct}%` : '--'}</p>
                  </div>
                  <div className="text-center md:hidden">
                    <p className="text-sm font-bold text-slate-800">{course.scoringAverage?.toFixed(1) || '--'}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </StatSection>
      )}

      {/* Empty State */}
      {(!worstHoleData || worstHoleData.holes.length === 0) && (!courseBreakdown || courseBreakdown.courses.length === 0) && (
        <motion.div
          className="text-center py-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <IconTarget size={28} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Analysis Data Loading</h3>
          <p className="text-sm text-slate-500">Hole and course breakdown will appear here once data is loaded.</p>
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function GolfStatsDisplay({
  stats,
  playerName,
  playerProfile,
  isCoachView = false,
  rounds = [],
  selectedRoundId = 'overall',
  onRoundChange,
  activeFilter,
  onFilterChange,
  filterOptions,
  courseBreakdown,
  worstHoleData,
  trendData,
  statisticalStrengths,
  statisticalWeaknesses,
}: StatsDisplayProps) {
  // Default to overview tab when coach is viewing a player
  const [activeCategory, setActiveCategory] = useState<StatsCategory>(isCoachView ? 'overview' : 'scoring');
  const [showFilters, setShowFilters] = useState(false);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Generate export summary data
  const getExportSummary = () => {
    const summary = {
      // Scoring
      avgScore: stats.scoringAverage,
      bestRound: stats.bestRound,
      worstRound: stats.worstRound,
      roundsPlayed: stats.roundsPlayed,
      holesPlayed: stats.holesPlayed,
      // Performance
      girPct: stats.girPercentage,
      fairwayPct: stats.fairwayPercentage,
      avgPutts: stats.puttsPerRound,
      scramblingPct: stats.scramblingPercentage,
      // Strokes Gained (if available)
      sgTotal: stats.strokesGainedTotal,
      sgTee: stats.strokesGainedTee,
      sgApproach: stats.strokesGainedApproach,
      sgAroundGreen: stats.strokesGainedAroundGreen,
      sgPutting: stats.strokesGainedPutting,
    };
    return summary;
  };

  // Export to PDF using html2canvas and jsPDF
  const handleExportPDF = async () => {
    if (isExporting) return;

    setIsExporting(true);
    try {
      // Dynamically import to avoid SSR issues
      const [html2canvas, { jsPDF }] = await Promise.all([
        import('html2canvas').then(m => m.default),
        import('jspdf'),
      ]);

      // Create a temporary export-friendly element
      const exportDiv = document.createElement('div');
      exportDiv.style.position = 'absolute';
      exportDiv.style.left = '-9999px';
      exportDiv.style.width = '800px';
      exportDiv.style.padding = '40px';
      exportDiv.style.backgroundColor = '#ffffff';
      exportDiv.style.fontFamily = 'Inter, system-ui, sans-serif';

      const summary = getExportSummary();
      const exportDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      exportDiv.innerHTML = `
        <div style="margin-bottom: 32px;">
          <h1 style="font-size: 28px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0;">
            ${playerName || 'Golf'} Stats Report
          </h1>
          <p style="font-size: 14px; color: #64748b; margin: 0;">
            Generated on ${exportDate} • ${stats.roundsPlayed} rounds • ${stats.holesPlayed} holes
          </p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px;">
          <div style="background: #f8fafc; border-radius: 12px; padding: 20px;">
            <h2 style="font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px 0;">
              Scoring Overview
            </h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <div style="font-size: 28px; font-weight: 700; color: #16a34a;">${formatStat(summary.avgScore, '', 1)}</div>
                <div style="font-size: 12px; color: #64748b;">Scoring Avg</div>
              </div>
              <div>
                <div style="font-size: 28px; font-weight: 700; color: #0f172a;">${summary.bestRound || '-'}</div>
                <div style="font-size: 12px; color: #64748b;">Best Round</div>
              </div>
              <div>
                <div style="font-size: 20px; font-weight: 600; color: #0f172a;">${summary.worstRound || '-'}</div>
                <div style="font-size: 12px; color: #64748b;">Worst Round</div>
              </div>
              <div>
                <div style="font-size: 20px; font-weight: 600; color: #0f172a;">${stats.roundsPlayed}</div>
                <div style="font-size: 12px; color: #64748b;">Rounds Played</div>
              </div>
            </div>
          </div>

          <div style="background: #f8fafc; border-radius: 12px; padding: 20px;">
            <h2 style="font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px 0;">
              Performance Metrics
            </h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <div style="font-size: 28px; font-weight: 700; color: #16a34a;">${formatStat(summary.girPct, '%', 1)}</div>
                <div style="font-size: 12px; color: #64748b;">GIR %</div>
              </div>
              <div>
                <div style="font-size: 28px; font-weight: 700; color: #0f172a;">${formatStat(summary.fairwayPct, '%', 1)}</div>
                <div style="font-size: 12px; color: #64748b;">Fairways Hit</div>
              </div>
              <div>
                <div style="font-size: 20px; font-weight: 600; color: #0f172a;">${formatStat(summary.avgPutts, '', 1)}</div>
                <div style="font-size: 12px; color: #64748b;">Putts/Round</div>
              </div>
              <div>
                <div style="font-size: 20px; font-weight: 600; color: #0f172a;">${formatStat(summary.scramblingPct, '%', 1)}</div>
                <div style="font-size: 12px; color: #64748b;">Scrambling</div>
              </div>
            </div>
          </div>
        </div>

        ${summary.sgTotal !== null ? `
        <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
          <h2 style="font-size: 14px; font-weight: 600; color: #166534; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px 0;">
            Strokes Gained Analysis
          </h2>
          <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;">
            <div style="text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: ${(summary.sgTotal || 0) >= 0 ? '#16a34a' : '#dc2626'};">
                ${(summary.sgTotal || 0) >= 0 ? '+' : ''}${formatStat(summary.sgTotal, '', 2)}
              </div>
              <div style="font-size: 11px; color: #64748b;">Total</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 18px; font-weight: 600; color: ${(summary.sgTee || 0) >= 0 ? '#16a34a' : '#dc2626'};">
                ${(summary.sgTee || 0) >= 0 ? '+' : ''}${formatStat(summary.sgTee, '', 2)}
              </div>
              <div style="font-size: 11px; color: #64748b;">Tee</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 18px; font-weight: 600; color: ${(summary.sgApproach || 0) >= 0 ? '#16a34a' : '#dc2626'};">
                ${(summary.sgApproach || 0) >= 0 ? '+' : ''}${formatStat(summary.sgApproach, '', 2)}
              </div>
              <div style="font-size: 11px; color: #64748b;">Approach</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 18px; font-weight: 600; color: ${(summary.sgAroundGreen || 0) >= 0 ? '#16a34a' : '#dc2626'};">
                ${(summary.sgAroundGreen || 0) >= 0 ? '+' : ''}${formatStat(summary.sgAroundGreen, '', 2)}
              </div>
              <div style="font-size: 11px; color: #64748b;">Around Green</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 18px; font-weight: 600; color: ${(summary.sgPutting || 0) >= 0 ? '#16a34a' : '#dc2626'};">
                ${(summary.sgPutting || 0) >= 0 ? '+' : ''}${formatStat(summary.sgPutting, '', 2)}
              </div>
              <div style="font-size: 11px; color: #64748b;">Putting</div>
            </div>
          </div>
        </div>
        ` : ''}

        ${trendData?.personalBests ? `
        <div style="background: #fef3c7; border-radius: 12px; padding: 20px;">
          <h2 style="font-size: 14px; font-weight: 600; color: #92400e; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px 0;">
            Personal Records
          </h2>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
            ${trendData.personalBests.bestScore ? `
            <div style="text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: #92400e;">${trendData.personalBests.bestScore.value}</div>
              <div style="font-size: 11px; color: #92400e;">Best Score</div>
            </div>
            ` : ''}
            ${trendData.personalBests.bestToPar ? `
            <div style="text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: #92400e;">
                ${trendData.personalBests.bestToPar.value > 0 ? '+' : ''}${trendData.personalBests.bestToPar.value}
              </div>
              <div style="font-size: 11px; color: #92400e;">Best to Par</div>
            </div>
            ` : ''}
            ${trendData.personalBests.bestGir ? `
            <div style="text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: #92400e;">${trendData.personalBests.bestGir.value}%</div>
              <div style="font-size: 11px; color: #92400e;">Best GIR</div>
            </div>
            ` : ''}
            ${trendData.personalBests.lowestPutts ? `
            <div style="text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: #92400e;">${trendData.personalBests.lowestPutts.value}</div>
              <div style="font-size: 11px; color: #92400e;">Lowest Putts</div>
            </div>
            ` : ''}
          </div>
        </div>
        ` : ''}

        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
            Generated by GolfHelm • helm.app
          </p>
        </div>
      `;

      document.body.appendChild(exportDiv);

      const canvas = await html2canvas(exportDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      document.body.removeChild(exportDiv);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2],
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`${playerName || 'Golf'}-Stats-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Print functionality
  const handlePrint = () => {
    window.print();
  };

  // Filter presets configuration
  const filterPresets: { label: string; filter: StatsFilter }[] = [
    { label: 'Last 5 Rounds', filter: { preset: 'last5' } },
    { label: 'Last 10 Rounds', filter: { preset: 'last10' } },
    { label: 'Tournaments Only', filter: { preset: 'tournaments' } },
    { label: 'Practice Only', filter: { preset: 'practice' } },
    { label: 'This Month', filter: { preset: 'thisMonth' } },
    { label: 'This Year', filter: { preset: 'thisYear' } },
  ];

  // Check if a filter is active
  const isFilterActive = (filter: StatsFilter) => {
    if (!activeFilter) return false;
    return JSON.stringify(filter) === JSON.stringify(activeFilter);
  };

  // Handle filter click
  const handleFilterClick = (filter: StatsFilter) => {
    if (isFilterActive(filter)) {
      // Toggle off
      onFilterChange?.(null);
    } else {
      onFilterChange?.(filter);
    }
  };

  // Handle course filter
  const handleCourseFilter = (courseName: string) => {
    if (activeFilter?.courseName === courseName) {
      onFilterChange?.(null);
    } else {
      onFilterChange?.({ courseName });
    }
    setShowCourseDropdown(false);
  };

  // Clear all filters
  const clearFilters = () => {
    onFilterChange?.(null);
  };

  // Get active filter label
  const getActiveFilterLabel = (): string | null => {
    if (!activeFilter) return null;
    if (activeFilter.courseName) return activeFilter.courseName;
    const preset = filterPresets.find(p => isFilterActive(p.filter));
    return preset?.label || null;
  };

  const categories: { id: StatsCategory; label: string; icon: React.ReactNode; description: string }[] = [
    { id: 'overview', label: 'Overview', icon: <IconHome size={16} />, description: 'Player dashboard summary' },
    { id: 'progress', label: 'Progress', icon: <IconChartBar size={16} />, description: 'Track improvement over time' },
    { id: 'dispersion', label: 'Spray Charts', icon: <IconCrosshair size={16} />, description: 'Visualize shot patterns' },
    { id: 'scoring', label: 'Scoring', icon: <IconAward size={16} />, description: 'Score breakdown and trends' },
    { id: 'driving', label: 'Driving', icon: <IconGolf size={16} />, description: 'Tee shot performance' },
    { id: 'approach', label: 'Approach', icon: <IconTarget size={16} />, description: 'Green in regulation stats' },
    { id: 'putting', label: 'Putting', icon: <IconFlag size={16} />, description: 'Putting efficiency by distance' },
    { id: 'scrambling', label: 'Scrambling', icon: <IconTrendingUp size={16} />, description: 'Short game recovery' },
    { id: 'strokes-gained', label: 'Strokes Gained', icon: <IconChartBar size={16} />, description: 'Tour-level comparison' },
    { id: 'analysis', label: 'Analysis', icon: <IconTarget size={16} />, description: 'Course & hole analysis' },
  ];

  const formatRoundDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-full bg-transparent print:bg-white">
      <div ref={contentRef} className="max-w-4xl mx-auto px-4 py-6 print:max-w-none print:px-8">

        {/* Header with animation */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          {/* Mobile: Stack vertically, Desktop: Side by side */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <motion.h1
                className="text-xl sm:text-2xl font-bold text-slate-900 truncate"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
              >
                {playerName ? `${playerName}'s Stats` : 'My Stats'}
              </motion.h1>
              <motion.p
                className="text-slate-500 text-xs sm:text-sm mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {stats.roundsPlayed} rounds • {stats.holesPlayed} holes
              </motion.p>
            </div>

            {/* Round Selector & Filter Controls - Full width on mobile */}
            <div className="flex items-center gap-1.5 sm:gap-2 print:hidden flex-shrink-0">
              {/* Export PDF Button */}
              <motion.button
                onClick={handleExportPDF}
                disabled={isExporting}
                className={`p-2.5 rounded-lg border transition-all ${
                  isExporting
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-green-300 hover:text-green-600'
                }`}
                whileHover={isExporting ? {} : { scale: 1.05 }}
                whileTap={isExporting ? {} : { scale: 0.95 }}
                title="Export as PDF"
              >
                {isExporting ? (
                  <motion.div
                    className="h-[18px] w-[18px] border-2 border-slate-300 border-t-green-500 rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                ) : (
                  <IconDownload size={18} />
                )}
              </motion.button>

              {/* Print Button */}
              <motion.button
                onClick={handlePrint}
                className="p-2.5 rounded-lg border bg-white border-slate-200 text-slate-500 hover:border-green-300 hover:text-green-600 transition-all"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Print stats"
              >
                <IconPrinter size={18} />
              </motion.button>

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

              {/* Round Selector - Compact on mobile */}
              {onRoundChange && rounds.length > 0 && (
                <motion.div
                  className="flex-1 min-w-[100px] sm:min-w-[200px] max-w-[200px] sm:max-w-none"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <label className="hidden sm:block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
                    View Stats
                  </label>
                  <select
                    value={selectedRoundId}
                    onChange={(e) => onRoundChange(e.target.value as string | 'overall')}
                    className="w-full px-2 sm:px-3 py-2 rounded-lg border border-slate-200 text-xs sm:text-sm font-medium text-slate-700 bg-white hover:border-green-300 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none transition-all"
                  >
                    <option value="overall">Overall</option>
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

          {/* Active Filter Indicator */}
          {activeFilter && (
            <motion.div
              className="flex items-center gap-2 mb-3"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="text-xs text-slate-500">Filtered by:</span>
              <span className="px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                {getActiveFilterLabel()}
              </span>
              <button
                onClick={clearFilters}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              >
                Clear
              </button>
            </motion.div>
          )}

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

                {/* Preset Filters */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {filterPresets.map((preset, idx) => (
                    <motion.button
                      key={preset.label}
                      onClick={() => handleFilterClick(preset.filter)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                        isFilterActive(preset.filter)
                          ? 'bg-green-600 text-white border border-green-600'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-green-300 hover:bg-green-50 hover:text-green-700'
                      }`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {preset.label}
                    </motion.button>
                  ))}
                </div>

                {/* Course Filter Dropdown */}
                {filterOptions && filterOptions.courses.length > 0 && (
                  <div className="relative">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">
                      Filter by Course
                    </label>
                    <button
                      onClick={() => setShowCourseDropdown(!showCourseDropdown)}
                      className={`w-full px-3 py-2 rounded-lg border text-sm font-medium text-left flex items-center justify-between transition-all ${
                        activeFilter?.courseName
                          ? 'bg-green-50 border-green-300 text-green-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-green-300'
                      }`}
                    >
                      <span>{activeFilter?.courseName || 'All Courses'}</span>
                      <IconChevronDown size={16} className={`transition-transform ${showCourseDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {showCourseDropdown && (
                        <motion.div
                          className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-slate-200 shadow-lg z-20 max-h-48 overflow-y-auto"
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                        >
                          <button
                            onClick={() => { onFilterChange?.(null); setShowCourseDropdown(false); }}
                            className="w-full px-3 py-2 text-sm text-left hover:bg-slate-50 text-slate-600"
                          >
                            All Courses
                          </button>
                          {filterOptions.courses.map(course => (
                            <button
                              key={course}
                              onClick={() => handleCourseFilter(course)}
                              className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                                activeFilter?.courseName === course
                                  ? 'bg-green-50 text-green-700'
                                  : 'hover:bg-slate-50 text-slate-600'
                              }`}
                            >
                              {course}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Category Pills with enhanced animation */}
        <motion.div
          className="pills-scroll pb-4 mb-4 -mx-4 px-4"
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
            {activeCategory === 'overview' && (
              <OverviewStats
                stats={stats}
                playerName={playerName}
                playerProfile={playerProfile}
                trendData={trendData}
                statisticalStrengths={statisticalStrengths}
                statisticalWeaknesses={statisticalWeaknesses}
              />
            )}
            {activeCategory === 'progress' && <ProgressStats stats={stats} rounds={rounds} />}
            {activeCategory === 'dispersion' && <ShotDispersionChart stats={stats} />}
            {activeCategory === 'scoring' && <ScoringStats stats={stats} />}
            {activeCategory === 'driving' && <DrivingStats stats={stats} />}
            {activeCategory === 'approach' && <ApproachStats stats={stats} />}
            {activeCategory === 'putting' && <PuttingStats stats={stats} />}
            {activeCategory === 'scrambling' && <ScramblingStats stats={stats} />}
            {activeCategory === 'strokes-gained' && (
              <StrokesGainedStats
                stats={stats}
                statisticalStrengths={statisticalStrengths}
                statisticalWeaknesses={statisticalWeaknesses}
              />
            )}
            {activeCategory === 'analysis' && (
              <AnalysisStats
                worstHoleData={worstHoleData}
                courseBreakdown={courseBreakdown}
                trendData={trendData}
              />
            )}
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
