'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import {
  IconSparkles,
  IconTrendingUp,
  IconTrendingDown,
  IconUsers,
  IconTarget,
  IconChartBar,
  IconRefresh,
  IconCheck,
  IconX,
  IconInfo,
  IconChevronRight,
  IconWarning,
  IconMenu,
} from '@/components/icons';
import { useSidebar } from '@/contexts/sidebar-context';
import { getTeamInsightsSummary, dismissInsight, acknowledgeInsight } from '@/app/golf/actions/intelligence-dashboard';
import { generateTeamInsights } from '@/app/golf/actions/insights';
import { ErrorBoundary, SectionErrorFallback } from '@/components/error-boundary';
import type { PersistedInsight } from '@/lib/coachhelm/v2/services/insight-persistence';
import type { TrendAnalysis, TeamComparison } from '@/lib/coachhelm/v2/mining/stats-insight-generator';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Philosophy category for insight classification
 */
type PhilosophyCategory =
  | 'ball_striking'
  | 'short_game'
  | 'putting'
  | 'course_management'
  | 'mental_game';

interface InsightWithEnhancements extends PersistedInsight {
  trend?: TrendAnalysis;
  teamComparison?: TeamComparison;
  correlatedInsights?: string[];
  // Philosophy-weighted fields from metadata
  philosophyScore?: number;
  matchesCoachPriority?: boolean;
  priorityCategory?: PhilosophyCategory;
  strokeImpactScore?: number;
}

interface TeamInsightSummary {
  playerId: string;
  playerName: string;
  activeInsights: number;
  urgentInsights: number;
  trend: 'improving' | 'declining' | 'stable';
  topInsight?: InsightWithEnhancements;
}

interface CorrelationDiscovery {
  id: string;
  title: string;
  description: string;
  metrics: string[];
  correlation: number;
  strokeImpact: number;
  playerCount: number;
}

interface DashboardProps {
  teamId: string;
  coachId: string;
  initialInsights?: InsightWithEnhancements[];
  initialPlayerSummaries?: TeamInsightSummary[];
  initialCorrelations?: CorrelationDiscovery[];
}

type TimeScope = 'last_7_days' | 'last_30_days' | 'season' | 'all_time';
type ViewMode = 'overview' | 'trends' | 'team' | 'correlations';

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 30 }
  },
} as const;

const cardHover = {
  rest: { scale: 1, y: 0 },
  hover: {
    scale: 1.01,
    y: -2,
    transition: { type: 'spring' as const, stiffness: 400, damping: 25 }
  },
} as const;

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TimeScopeSelector({
  value,
  onChange,
}: {
  value: TimeScope;
  onChange: (scope: TimeScope) => void;
}) {
  const options: { value: TimeScope; label: string }[] = [
    { value: 'last_7_days', label: '7D' },
    { value: 'last_30_days', label: '30D' },
    { value: 'season', label: 'Season' },
    { value: 'all_time', label: 'All' },
  ];

  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-warm-100/60 rounded-lg backdrop-blur-sm">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
            value === option.value
              ? 'text-warm-900'
              : 'text-warm-500 hover:text-warm-700'
          )}
        >
          {value === option.value && (
            <motion.div
              layoutId="timescope-indicator"
              className="absolute inset-0 bg-white rounded-md shadow-sm"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative z-10">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function ViewModeSelector({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const options: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
    { value: 'overview', label: 'Overview', icon: <IconChartBar size={15} /> },
    { value: 'trends', label: 'Trends', icon: <IconTrendingUp size={15} /> },
    { value: 'team', label: 'Players', icon: <IconUsers size={15} /> },
    { value: 'correlations', label: 'Patterns', icon: <IconTarget size={15} /> },
  ];

  return (
    <div className="flex items-center gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200',
            value === option.value
              ? 'text-primary-700'
              : 'text-warm-500 hover:text-warm-700 hover:bg-warm-100/50'
          )}
        >
          {value === option.value && (
            <motion.div
              layoutId="viewmode-indicator"
              className="absolute inset-0 bg-primary-50/70 rounded-lg border border-primary-200/50"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            {option.icon}
            {option.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// Premium Stat Card with micro-interactions
function StatCard({
  label,
  value,
  suffix,
  icon,
  trend,
  accent = false,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
  trend?: { value: number; direction: 'up' | 'down' | 'neutral' };
  accent?: boolean;
}) {
  return (
    <motion.div
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      whileHover="hover"
    >
      <motion.div
        variants={cardHover}
        className={cn(
          'relative overflow-hidden rounded-2xl p-5 transition-shadow duration-300',
          accent
            ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/20'
            : 'bg-white/80 backdrop-blur-sm border border-warm-200/60 shadow-sm hover:shadow-md'
        )}
      >
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative flex items-start justify-between">
          <div>
            <p className={cn(
              'text-xs font-medium uppercase tracking-wider mb-2',
              accent ? 'text-white/70' : 'text-warm-500'
            )}>
              {label}
            </p>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                'text-3xl font-semibold tabular-nums tracking-tight',
                accent ? 'text-white' : 'text-warm-900'
              )}>
                {typeof value === 'number' ? value.toLocaleString() : value}
              </span>
              {suffix && (
                <span className={cn(
                  'text-sm font-medium',
                  accent ? 'text-white/60' : 'text-warm-400'
                )}>
                  {suffix}
                </span>
              )}
            </div>
            {trend && (
              <div className={cn(
                'flex items-center gap-1 mt-2 text-xs font-medium',
                accent
                  ? trend.direction === 'up' ? 'text-white/90' : 'text-white/70'
                  : trend.direction === 'up' ? 'text-primary-600' : trend.direction === 'down' ? 'text-red-500' : 'text-warm-400'
              )}>
                {trend.direction === 'up' && <IconTrendingUp size={12} />}
                {trend.direction === 'down' && <IconTrendingDown size={12} />}
                <span>{trend.direction === 'up' ? '+' : ''}{trend.value}%</span>
              </div>
            )}
          </div>
          <div className={cn(
            'p-2.5 rounded-xl transition-transform duration-200',
            accent ? 'bg-white/10' : 'bg-warm-100/60'
          )}>
            <span className={accent ? 'text-white/80' : 'text-warm-500'}>
              {icon}
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Premium Insight Card with visual hierarchy
function InsightCard({
  insight,
  onDismiss,
  onAcknowledge,
  index = 0,
}: {
  insight: InsightWithEnhancements;
  onDismiss: (id: string) => void;
  onAcknowledge: (id: string) => void;
  index?: number;
}) {
  const priorityConfig = {
    urgent: {
      bg: 'bg-gradient-to-r from-red-50 to-orange-50/50',
      border: 'border-red-200/60',
      badge: 'bg-red-500 text-white',
      icon: <IconWarning size={14} />,
      glow: 'shadow-red-500/5',
    },
    high: {
      bg: 'bg-gradient-to-r from-amber-50/80 to-yellow-50/50',
      border: 'border-amber-200/60',
      badge: 'bg-amber-500 text-white',
      icon: <IconSparkles size={14} />,
      glow: 'shadow-amber-500/5',
    },
    medium: {
      bg: 'bg-white/90',
      border: 'border-warm-200/60',
      badge: 'bg-warm-600 text-white',
      icon: <IconInfo size={14} />,
      glow: '',
    },
    low: {
      bg: 'bg-warm-50/50',
      border: 'border-warm-200/40',
      badge: 'bg-warm-400 text-white',
      icon: <IconInfo size={14} />,
      glow: '',
    },
  };

  const config = priorityConfig[insight.priority];

  const trendIcon = insight.trend?.direction === 'improving'
    ? <IconTrendingUp size={14} className="text-primary-500" />
    : insight.trend?.direction === 'declining'
      ? <IconTrendingDown size={14} className="text-red-500" />
      : null;

  return (
    <motion.div
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
      custom={index}
      whileHover="hover"
      className="group"
    >
      <motion.div
        variants={cardHover}
        className={cn(
          'relative rounded-2xl border backdrop-blur-sm overflow-hidden transition-all duration-300',
          config.bg,
          config.border,
          config.glow && `shadow-lg ${config.glow}`
        )}
      >
        {/* Priority indicator bar */}
        <div className={cn(
          'absolute left-0 top-0 bottom-0 w-1',
          insight.priority === 'urgent' && 'bg-gradient-to-b from-red-500 to-orange-500',
          insight.priority === 'high' && 'bg-gradient-to-b from-amber-500 to-yellow-500',
          insight.priority === 'medium' && 'bg-warm-400',
          insight.priority === 'low' && 'bg-warm-300'
        )} />

        <div className="p-5 pl-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Header row */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full',
                  config.badge
                )}>
                  {config.icon}
                  {insight.priority}
                </span>
                {insight.matchesCoachPriority && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-primary-500 text-white">
                    <IconTarget size={12} />
                    Your Priority
                  </span>
                )}
                {insight.strokeImpact && insight.strokeImpact > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium text-warm-600 bg-warm-100/80 rounded-full">
                    {insight.strokeImpact.toFixed(1)} strokes/round
                  </span>
                )}
                {insight.philosophyScore !== undefined && insight.philosophyScore > 70 && (
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium text-primary-700 bg-primary-50/80 rounded-full">
                    Score: {insight.philosophyScore}
                  </span>
                )}
                {trendIcon && (
                  <span className="ml-auto">{trendIcon}</span>
                )}
              </div>

              {/* Title */}
              <h4 className="font-semibold text-warm-900 mb-1 leading-snug">
                {insight.headline}
              </h4>

              {/* Body */}
              <p className="text-sm text-warm-600 leading-relaxed line-clamp-2">
                {insight.body}
              </p>

              {/* Recommendation */}
              {insight.recommendation && (
                <div className="mt-3 flex items-start gap-2 p-2.5 rounded-xl bg-primary-50/50 border border-primary-100/50">
                  <IconChevronRight size={14} className="text-primary-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-primary-700 font-medium leading-snug">
                    {insight.recommendation}
                  </p>
                </div>
              )}

              {/* Team comparison badge */}
              {insight.teamComparison && (
                <div className="mt-3 flex items-center gap-2 text-xs text-warm-500">
                  <IconUsers size={12} />
                  <span>
                    Rank #{insight.teamComparison.playerRank} of {insight.teamComparison.teamSize}
                    <span className="text-warm-400 ml-1">
                      (top {Math.round((1 - insight.teamComparison.percentile / 100) * 100)}%)
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                onClick={() => onAcknowledge(insight.id)}
                className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                title="Acknowledge"
              >
                <IconCheck size={16} />
              </button>
              <button
                onClick={() => onDismiss(insight.id)}
                className="p-2 rounded-lg text-warm-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                title="Dismiss"
              >
                <IconX size={16} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Player Summary Card with avatar and stats
function PlayerSummaryCard({ summary, index = 0 }: { summary: TeamInsightSummary; index?: number }) {
  const trendConfig = {
    improving: {
      color: 'text-primary-600',
      bg: 'bg-primary-50',
      icon: <IconTrendingUp size={12} />,
      label: 'Improving',
    },
    declining: {
      color: 'text-red-500',
      bg: 'bg-red-50',
      icon: <IconTrendingDown size={12} />,
      label: 'Needs Focus',
    },
    stable: {
      color: 'text-warm-500',
      bg: 'bg-warm-100',
      icon: null,
      label: 'Stable',
    },
  };

  const config = trendConfig[summary.trend];
  const initials = summary.playerName.split(' ').map(n => n[0]).join('').toUpperCase();

  return (
    <motion.div
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      custom={index}
      whileHover="hover"
    >
      <motion.div
        variants={cardHover}
        className="bg-white/80 backdrop-blur-sm border border-warm-200/60 rounded-2xl p-5 hover:shadow-md transition-all duration-300"
      >
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center text-sm font-semibold',
            summary.urgentInsights > 0
              ? 'bg-gradient-to-br from-red-100 to-orange-100 text-red-700'
              : summary.trend === 'improving'
                ? 'bg-gradient-to-br from-primary-100 to-emerald-100 text-primary-700'
                : 'bg-gradient-to-br from-warm-100 to-slate-100 text-warm-600'
          )}>
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-1">
              <h4 className="font-semibold text-warm-900 truncate">{summary.playerName}</h4>
              <span className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full',
                config.bg,
                config.color
              )}>
                {config.icon}
                {config.label}
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-2xl font-semibold text-warm-900 tabular-nums">
                  {summary.activeInsights}
                </span>
                <span className="text-warm-500 ml-1">insights</span>
              </div>
              {summary.urgentInsights > 0 && (
                <div className="flex items-center gap-1 text-red-500">
                  <IconWarning size={14} />
                  <span className="font-medium">{summary.urgentInsights} urgent</span>
                </div>
              )}
            </div>

            {summary.topInsight && (
              <p className="mt-2 text-xs text-warm-500 line-clamp-1">
                Top: {summary.topInsight.headline}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Correlation Card with visual indicator
function CorrelationCard({ correlation, index = 0 }: { correlation: CorrelationDiscovery; index?: number }) {
  const strength = Math.abs(correlation.correlation);
  const isPositive = correlation.correlation > 0;

  // Visual correlation strength
  const strengthLabel = strength > 0.6 ? 'Strong' : strength > 0.4 ? 'Moderate' : 'Weak';
  const strengthColor = strength > 0.6 ? 'primary' : strength > 0.4 ? 'amber' : 'warm';

  return (
    <motion.div
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      custom={index}
      whileHover="hover"
    >
      <motion.div
        variants={cardHover}
        className="bg-white/80 backdrop-blur-sm border border-warm-200/60 rounded-2xl p-5 hover:shadow-md transition-all duration-300 overflow-hidden"
      >
        <div className="flex items-start gap-4">
          {/* Correlation visualization */}
          <div className="relative w-14 h-14 flex-shrink-0">
            {/* Background ring */}
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                className="stroke-warm-100"
                strokeWidth="3"
              />
              <motion.circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                className={cn(
                  strengthColor === 'primary' && 'stroke-primary-500',
                  strengthColor === 'amber' && 'stroke-amber-500',
                  strengthColor === 'warm' && 'stroke-warm-400'
                )}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={100}
                initial={{ strokeDashoffset: 100 }}
                animate={{ strokeDashoffset: 100 - strength * 100 }}
                transition={{ duration: 1, delay: index * 0.1, ease: 'easeOut' }}
              />
            </svg>
            {/* Center value */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-semibold text-warm-700">
                {(correlation.correlation * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                'px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full',
                strengthColor === 'primary' && 'bg-primary-100 text-primary-700',
                strengthColor === 'amber' && 'bg-amber-100 text-amber-700',
                strengthColor === 'warm' && 'bg-warm-100 text-warm-600'
              )}>
                {strengthLabel}
              </span>
              <span className="text-[10px] text-warm-400">
                {isPositive ? 'Positive' : 'Negative'} correlation
              </span>
            </div>

            <h4 className="font-semibold text-warm-900 mb-1 leading-snug">
              {correlation.title}
            </h4>

            <p className="text-sm text-warm-600 leading-relaxed line-clamp-2 mb-3">
              {correlation.description}
            </p>

            {/* Metric badges */}
            <div className="flex flex-wrap gap-1.5">
              {correlation.metrics.slice(0, 3).map((metric) => (
                <span
                  key={metric}
                  className="px-2 py-0.5 text-[10px] font-medium text-warm-600 bg-warm-100/80 rounded-md"
                >
                  {metric}
                </span>
              ))}
              {correlation.metrics.length > 3 && (
                <span className="px-2 py-0.5 text-[10px] font-medium text-warm-400">
                  +{correlation.metrics.length - 3} more
                </span>
              )}
            </div>

            {/* Impact indicator */}
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-warm-500">
                {correlation.playerCount} player{correlation.playerCount !== 1 ? 's' : ''} affected
              </span>
              <span className="font-medium text-primary-600">
                ~{correlation.strokeImpact.toFixed(1)} stroke impact
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EmptyState({
  icon,
  title,
  message,
  action
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-warm-100 to-warm-50 flex items-center justify-center mb-4">
        <span className="text-warm-400">{icon}</span>
      </div>
      <h3 className="text-lg font-semibold text-warm-900 mb-1">{title}</h3>
      <p className="text-sm text-warm-500 mb-6 max-w-sm">{message}</p>
      {action}
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CoachHelmIntelligenceDashboard({
  teamId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  coachId: _coachId,
  initialInsights = [],
  initialPlayerSummaries = [],
  initialCorrelations = [],
}: DashboardProps) {
  // Navigation
  const { toggleMobile } = useSidebar();

  // State
  const [timeScope, setTimeScope] = useState<TimeScope>('last_30_days');
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [insights, setInsights] = useState<InsightWithEnhancements[]>(initialInsights);
  const [playerSummaries, setPlayerSummaries] = useState<TeamInsightSummary[]>(initialPlayerSummaries);
  const [correlations, setCorrelations] = useState<CorrelationDiscovery[]>(initialCorrelations);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Ref to prevent concurrent refresh attempts
  const refreshInProgress = useRef(false);

  // Computed stats
  const stats = useMemo(() => ({
    total: insights.length,
    urgent: insights.filter((i) => i.priority === 'urgent').length,
    high: insights.filter((i) => i.priority === 'high').length,
    improving: insights.filter((i) => i.trend?.direction === 'improving').length,
    declining: insights.filter((i) => i.trend?.direction === 'declining').length,
    playersWithInsights: new Set(insights.map((i) => i.playerId)).size,
    avgStrokeImpact: insights.length > 0
      ? insights.reduce((sum, i) => sum + (i.strokeImpact || 0), 0) / insights.length
      : 0,
  }), [insights]);

  // Filter insights by time scope
  const filteredInsights = useMemo(() => {
    return insights.filter((insight) => {
      if (timeScope === 'all_time') return true;
      const created = new Date(insight.createdAt);
      const now = new Date();
      switch (timeScope) {
        case 'last_7_days':
          return created >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        case 'last_30_days':
          return created >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        case 'season':
          return created.getFullYear() === now.getFullYear();
        default:
          return true;
      }
    });
  }, [insights, timeScope]);

  // Sort by priority and stroke impact (default sorting)
  const sortedInsights = useMemo(() => {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return [...filteredInsights].sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return (b.strokeImpact || 0) - (a.strokeImpact || 0);
    });
  }, [filteredInsights]);

  // Extract philosophy data from metadata and enhance insights
  const insightsWithPhilosophy = useMemo(() => {
    return filteredInsights.map(insight => {
      const metadata = (insight as unknown as { metadata?: Record<string, unknown> }).metadata;
      return {
        ...insight,
        philosophyScore: (metadata?.philosophy_score as number) ?? 50,
        matchesCoachPriority: (metadata?.matches_coach_priority as boolean) ?? false,
        priorityCategory: (metadata?.priority_category as PhilosophyCategory) ?? 'ball_striking',
        strokeImpactScore: (metadata?.stroke_impact_score as number) ?? ((insight.strokeImpact || 0) * 20),
      };
    });
  }, [filteredInsights]);

  // Top insights sorted by philosophy score (matches YOUR priorities)
  const topPriorityInsights = useMemo(() => {
    return [...insightsWithPhilosophy]
      .sort((a, b) => (b.philosophyScore ?? 0) - (a.philosophyScore ?? 0))
      .slice(0, 5);
  }, [insightsWithPhilosophy]);

  // Top insights sorted by stroke impact
  const topStrokeImpactInsights = useMemo(() => {
    return [...insightsWithPhilosophy]
      .sort((a, b) => (b.strokeImpactScore ?? 0) - (a.strokeImpactScore ?? 0))
      .slice(0, 5);
  }, [insightsWithPhilosophy]);

  // Count insights that match coach priorities
  const matchesPriorityCount = useMemo(() => {
    return insightsWithPhilosophy.filter(i => i.matchesCoachPriority).length;
  }, [insightsWithPhilosophy]);

  // Handlers
  const handleRefresh = useCallback(async () => {
    // Prevent concurrent refresh attempts
    if (refreshInProgress.current || isRefreshing) return;

    refreshInProgress.current = true;
    setIsRefreshing(true);

    try {
      const result = await getTeamInsightsSummary(teamId);
      if (result.success && result.data) {
        // Map DashboardInsight to InsightWithEnhancements
        // Derive trend from insight type and metadata
        setInsights(result.data.insights.map(i => {
          // Extract trend from insight type or metadata
          let trend: TrendAnalysis | undefined;
          const metadata = (i as unknown as { metadata?: Record<string, unknown> }).metadata;
          const tone = metadata?.tone as string | undefined;

          // Determine trend direction based on insight type or tone
          if (i.insightType === 'performance_improvement' || tone === 'celebratory') {
            trend = {
              direction: 'improving',
              magnitude: metadata?.confidence ? Number(metadata.confidence) * 10 : 5,
              percentChange: metadata?.confidence ? Number(metadata.confidence) * 15 : 8,
              periodDays: 30,
              baselineValue: 75,
              currentValue: 80,
              significance: 'moderate',
            };
          } else if (i.insightType === 'performance_decline' || tone === 'cautionary' || tone === 'urgent') {
            trend = {
              direction: 'declining',
              magnitude: metadata?.confidence ? Number(metadata.confidence) * 10 : 5,
              percentChange: metadata?.confidence ? Number(metadata.confidence) * -15 : -8,
              periodDays: 30,
              baselineValue: 80,
              currentValue: 75,
              significance: 'moderate',
            };
          } else if (i.insightType === 'pattern_detected' || i.insightType === 'milestone_reached') {
            trend = {
              direction: 'stable',
              magnitude: 2,
              percentChange: 2,
              periodDays: 30,
              baselineValue: 77,
              currentValue: 78,
              significance: 'minimal',
            };
          }

          return {
            ...i,
            trend,
            teamComparison: undefined,
            correlatedInsights: undefined,
          } as InsightWithEnhancements;
        }));
        setPlayerSummaries(result.data.playerSummaries);
        setCorrelations(result.data.correlations);
      }
    } catch (error) {
      console.error('Failed to refresh dashboard:', error);
    } finally {
      setIsRefreshing(false);
      refreshInProgress.current = false;
    }
  }, [teamId, isRefreshing]);

  const handleDismiss = useCallback(async (insightId: string) => {
    // Call server action and update local state on success
    const result = await dismissInsight(insightId);
    if (result.success) {
      setInsights((prev) => prev.filter((i) => i.id !== insightId));
    }
  }, []);

  const handleAcknowledge = useCallback(async (insightId: string) => {
    // Call server action and update local state on success
    const result = await acknowledgeInsight(insightId);
    if (result.success) {
      setInsights((prev) =>
        prev.map((i) =>
          i.id === insightId ? { ...i, actionTaken: true, lifecycleState: 'confirmed' as const } : i
        )
      );
    }
  }, []);

  const handleGenerateInsights = useCallback(async () => {
    setIsLoading(true);
    try {
      // Actually generate new insights by analyzing all players
      const result = await generateTeamInsights();
      if (!result.success) {
        console.error('Failed to generate insights:', result.error);
      }
      // Refresh to show newly generated insights
      await handleRefresh();
    } catch (error) {
      console.error('Error generating insights:', error);
    } finally {
      setIsLoading(false);
    }
  }, [handleRefresh]);

  return (
    <div className="min-h-full bg-gradient-to-br from-[#FFFEFA] via-[#FEFDFB] to-[#FBF9F6]">
      {/* Subtle background texture */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.015]">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="noise" width="200" height="200" patternUnits="userSpaceOnUse">
              <filter id="noiseFilter">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
              </filter>
              <rect width="100%" height="100%" filter="url(#noiseFilter)"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#noise)"/>
        </svg>
      </div>

      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/70 backdrop-blur-xl border-b border-warm-200/60">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between py-4 md:py-5">
            <div className="flex items-center gap-3 md:gap-4">
              {/* Mobile hamburger menu */}
              <button
                onClick={toggleMobile}
                className={cn(
                  'lg:hidden p-2 -ml-2 rounded-xl',
                  'text-slate-500 hover:text-slate-700 hover:bg-slate-100/80',
                  'transition-colors duration-150 active:scale-95',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
                )}
                aria-label="Open navigation menu"
              >
                <IconMenu size={22} />
              </button>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25"
              >
                <IconSparkles size={22} className="text-white" />
              </motion.div>
              <div>
                <motion.h1
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-xl font-semibold tracking-tight text-warm-900"
                >
                  Intelligence
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-warm-500 text-sm"
                >
                  AI-powered insights for your team
                </motion.p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <TimeScopeSelector value={timeScope} onChange={setTimeScope} />

              <div className="w-px h-6 bg-warm-200/60" />

              <Button
                variant="secondary"
                onClick={handleGenerateInsights}
                isLoading={isLoading}
                disabled={isLoading || isRefreshing}
                className="gap-1.5"
              >
                <IconSparkles size={15} />
                Generate
              </Button>

              <button
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className={cn(
                  'p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-warm-100/50 transition-all',
                  isRefreshing && 'animate-spin'
                )}
              >
                <IconRefresh size={18} />
              </button>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="pb-3">
            <ViewModeSelector value={viewMode} onChange={setViewMode} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {/* Overview Tab */}
          {viewMode === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Stats Row */}
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
              >
                <StatCard
                  label="Active Insights"
                  value={stats.total}
                  icon={<IconSparkles size={20} />}
                  accent
                />
                <StatCard
                  label="Players Tracked"
                  value={stats.playersWithInsights}
                  icon={<IconUsers size={20} />}
                />
                <StatCard
                  label="Avg Stroke Impact"
                  value={stats.avgStrokeImpact.toFixed(1)}
                  suffix="/round"
                  icon={<IconTarget size={20} />}
                />
                <StatCard
                  label="Urgent + High"
                  value={stats.urgent + stats.high}
                  icon={<IconWarning size={20} />}
                  trend={stats.urgent > 0 ? { value: stats.urgent, direction: 'up' } : undefined}
                />
              </motion.div>

              {/* Main grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Insights column */}
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="lg:col-span-2 space-y-6"
                >
                  {/* Section 1: Top Insights for YOUR Priorities */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <IconTarget size={18} className="text-primary-600" />
                        <h2 className="text-lg font-semibold text-warm-900">Top Insights for YOUR Priorities</h2>
                      </div>
                      <span className="text-sm text-warm-500">{matchesPriorityCount} match your focus areas</span>
                    </div>

                    <ErrorBoundary fallback={SectionErrorFallback}>
                      <AnimatePresence mode="popLayout">
                        {topPriorityInsights.length > 0 ? (
                          topPriorityInsights.map((insight, index) => (
                            <InsightCard
                              key={`priority-${insight.id}`}
                              insight={insight}
                              onDismiss={handleDismiss}
                              onAcknowledge={handleAcknowledge}
                              index={index}
                            />
                          ))
                        ) : (
                          <div className="p-4 rounded-xl bg-warm-50/50 border border-warm-200/40 text-center">
                            <p className="text-sm text-warm-500">No insights match your priority settings yet.</p>
                          </div>
                        )}
                      </AnimatePresence>
                    </ErrorBoundary>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-warm-200/60" />
                    <span className="text-xs font-medium text-warm-400 uppercase tracking-wider">vs</span>
                    <div className="flex-1 h-px bg-warm-200/60" />
                  </div>

                  {/* Section 2: Top Insights by Stroke Impact */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <IconChartBar size={18} className="text-amber-600" />
                        <h2 className="text-lg font-semibold text-warm-900">Top Insights by Stroke Impact</h2>
                      </div>
                      <span className="text-sm text-warm-500">{stats.avgStrokeImpact.toFixed(1)} avg strokes/round</span>
                    </div>

                    <ErrorBoundary fallback={SectionErrorFallback}>
                      <AnimatePresence mode="popLayout">
                        {topStrokeImpactInsights.length > 0 ? (
                          topStrokeImpactInsights.map((insight, index) => (
                            <InsightCard
                              key={`impact-${insight.id}`}
                              insight={insight}
                              onDismiss={handleDismiss}
                              onAcknowledge={handleAcknowledge}
                              index={index}
                            />
                          ))
                        ) : (
                          <div className="p-4 rounded-xl bg-warm-50/50 border border-warm-200/40 text-center">
                            <p className="text-sm text-warm-500">No insights with stroke impact data available.</p>
                          </div>
                        )}
                      </AnimatePresence>
                    </ErrorBoundary>
                  </div>

                  {sortedInsights.length === 0 && (
                    <EmptyState
                      icon={<IconSparkles size={28} />}
                      title="No Active Insights"
                      message="Generate new insights to discover performance patterns and improvement opportunities."
                      action={
                        <Button onClick={handleGenerateInsights} isLoading={isLoading}>
                          Generate Insights
                        </Button>
                      }
                    />
                  )}
                </motion.div>

                {/* Sidebar */}
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-6"
                >
                  {/* Trend breakdown */}
                  <GlassCard className="p-5" variant="secondary">
                    <h3 className="font-semibold text-warm-900 mb-4">Trend Breakdown</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-primary-500" />
                          <span className="text-sm text-warm-600">Improving</span>
                        </div>
                        <span className="text-sm font-semibold text-warm-900 tabular-nums">
                          {stats.improving}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="text-sm text-warm-600">Declining</span>
                        </div>
                        <span className="text-sm font-semibold text-warm-900 tabular-nums">
                          {stats.declining}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-warm-300" />
                          <span className="text-sm text-warm-600">Stable</span>
                        </div>
                        <span className="text-sm font-semibold text-warm-900 tabular-nums">
                          {stats.total - stats.improving - stats.declining}
                        </span>
                      </div>
                    </div>
                  </GlassCard>

                  {/* Category breakdown */}
                  <GlassCard className="p-5" variant="secondary">
                    <h3 className="font-semibold text-warm-900 mb-4">By Category</h3>
                    <div className="space-y-2">
                      {Object.entries(
                        filteredInsights.reduce((acc, i) => {
                          const cat = i.category || 'other';
                          acc[cat] = (acc[cat] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      ).slice(0, 5).map(([category, count]) => (
                        <div key={category} className="flex items-center justify-between">
                          <span className="text-sm text-warm-600 capitalize">{category.replace(/_/g, ' ')}</span>
                          <span className="text-sm font-medium text-warm-900 tabular-nums">{count}</span>
                        </div>
                      ))}
                      {Object.keys(filteredInsights.reduce((acc, i) => {
                        const cat = i.category || 'other';
                        acc[cat] = true;
                        return acc;
                      }, {} as Record<string, boolean>)).length === 0 && (
                        <p className="text-sm text-warm-400">No categories yet</p>
                      )}
                    </div>
                  </GlassCard>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* Trends Tab */}
          {viewMode === 'trends' && (
            <motion.div
              key="trends"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-4"
              >
                <h2 className="text-lg font-semibold text-warm-900 mb-4">Performance Trends</h2>

                {filteredInsights.filter((i) => i.trend).length > 0 ? (
                  filteredInsights
                    .filter((i) => i.trend)
                    .map((insight, index) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        onDismiss={handleDismiss}
                        onAcknowledge={handleAcknowledge}
                        index={index}
                      />
                    ))
                ) : (
                  <EmptyState
                    icon={<IconTrendingUp size={28} />}
                    title="No Trend Data"
                    message="Trends require multiple rounds of data. Keep logging rounds to unlock trend analysis."
                  />
                )}
              </motion.div>
            </motion.div>
          )}

          {/* Team Tab */}
          {viewMode === 'team' && (
            <motion.div
              key="team"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <h2 className="text-lg font-semibold text-warm-900 mb-4">Team Overview</h2>

                {playerSummaries.length > 0 ? (
                  <ErrorBoundary fallback={SectionErrorFallback}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {playerSummaries.map((summary, index) => (
                        <PlayerSummaryCard key={summary.playerId} summary={summary} index={index} />
                      ))}
                    </div>
                  </ErrorBoundary>
                ) : (
                  <EmptyState
                    icon={<IconUsers size={28} />}
                    title="No Player Data"
                    message="Generate insights to see player-by-player analysis and recommendations."
                    action={
                      <Button onClick={handleGenerateInsights} isLoading={isLoading}>
                        Generate Insights
                      </Button>
                    }
                  />
                )}
              </motion.div>
            </motion.div>
          )}

          {/* Correlations Tab */}
          {viewMode === 'correlations' && (
            <motion.div
              key="correlations"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-warm-900 mb-1">Pattern Discoveries</h2>
                  <p className="text-sm text-warm-500">
                    AI-discovered correlations between golf metrics across your team
                  </p>
                </div>

                {correlations.length > 0 ? (
                  <ErrorBoundary fallback={SectionErrorFallback}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {correlations.map((correlation, index) => (
                        <CorrelationCard key={correlation.id} correlation={correlation} index={index} />
                      ))}
                    </div>
                  </ErrorBoundary>
                ) : (
                  <EmptyState
                    icon={<IconTarget size={28} />}
                    title="No Patterns Yet"
                    message="Correlations are discovered as more rounds are logged. Keep tracking to uncover hidden patterns."
                    action={
                      <Button onClick={handleGenerateInsights} isLoading={isLoading}>
                        Analyze Patterns
                      </Button>
                    }
                  />
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
