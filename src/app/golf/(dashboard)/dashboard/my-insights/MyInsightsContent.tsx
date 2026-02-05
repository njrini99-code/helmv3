'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconTarget,
  IconGolf,
  IconFlag,
  IconChartBar,
  IconSparkles,
  IconCalendar,
} from '@/components/icons';

interface PlayerStats {
  roundsPlayed: number;
  roundsAllTime: number;
  scoringAverage: number | null;
  allTimeAverage: number | null;
  bestScore: number | null;
  allTimeBest: number | null;
  avgPutts: number | null;
  girPercent: number | null;
  fwPercent: number | null;
  avgScoreToPar: number | null;
  trend: 'improving' | 'declining' | 'stable';
}

interface RecentRound {
  id: string;
  course_name: string | null;
  round_date: string;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
}

interface FocusArea {
  id: string;
  title: string;
  description: string | null;
  priority: number | null;
  area_type: string;
}

interface MyInsightsContentProps {
  playerName: string;
  playerId: string;
  handicap: number | null;
  stats: PlayerStats;
  recentRounds: RecentRound[];
  focusAreas: FocusArea[];
}

export function MyInsightsContent({
  playerName,
  handicap,
  stats,
  recentRounds,
  focusAreas,
}: MyInsightsContentProps) {
  const TrendIcon = stats.trend === 'improving' ? IconTrendingUp : stats.trend === 'declining' ? IconTrendingDown : IconMinus;
  const trendColor = stats.trend === 'improving' ? 'text-emerald-600' : stats.trend === 'declining' ? 'text-red-500' : 'text-slate-500';
  const trendBg = stats.trend === 'improving' ? 'bg-emerald-50' : stats.trend === 'declining' ? 'bg-red-50' : 'bg-slate-50';

  // Generate insights based on stats
  const insights = generateInsights(stats);

  return (
    <div className="min-h-full bg-gradient-to-br from-cream via-white to-cream">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <IconSparkles size={20} className="text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">GolfHelm</h1>
                  <p className="text-sm text-slate-500">Your Performance Insights</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-600">{playerName}</p>
              {handicap !== null && (
                <p className="text-xs text-slate-400">Handicap: {handicap.toFixed(1)}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto px-6 py-8"
      >
        {/* Performance Trend Banner */}
        <div className={cn('rounded-2xl p-6 mb-8', trendBg)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', trendBg, 'ring-2 ring-white')}>
                <TrendIcon size={24} className={trendColor} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {stats.trend === 'improving' ? 'Great Progress!' : stats.trend === 'declining' ? 'Room for Improvement' : 'Steady Performance'}
                </h2>
                <p className="text-sm text-slate-600">
                  {stats.trend === 'improving'
                    ? 'Your scores are trending down. Keep up the great work!'
                    : stats.trend === 'declining'
                      ? 'Your recent scores have been higher. Focus on your practice areas.'
                      : 'Your game has been consistent. Look for ways to improve.'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-slate-900">
                {stats.scoringAverage !== null ? stats.scoringAverage.toFixed(1) : '--'}
              </p>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Avg Score (30d)</p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Key Stats */}
          <div className="space-y-6">
            {/* Quick Stats Grid */}
            <GlassCard className="p-6">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <IconChartBar size={16} />
                Quick Stats
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <StatBox
                  label="Rounds (30d)"
                  value={stats.roundsPlayed.toString()}
                  subValue={`${stats.roundsAllTime} all-time`}
                />
                <StatBox
                  label="Best Score"
                  value={stats.bestScore?.toString() || '--'}
                  subValue={stats.allTimeBest ? `${stats.allTimeBest} best ever` : undefined}
                  highlight={stats.bestScore === stats.allTimeBest}
                />
                <StatBox
                  label="Avg Putts"
                  value={stats.avgPutts?.toFixed(1) || '--'}
                  subValue="per round"
                />
                <StatBox
                  label="Score to Par"
                  value={stats.avgScoreToPar !== null ? (stats.avgScoreToPar > 0 ? `+${stats.avgScoreToPar.toFixed(1)}` : stats.avgScoreToPar.toFixed(1)) : '--'}
                  subValue="average"
                />
              </div>
            </GlassCard>

            {/* Accuracy Stats */}
            <GlassCard className="p-6">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <IconTarget size={16} />
                Accuracy
              </h3>
              <div className="space-y-4">
                <ProgressStat
                  label="Greens in Regulation"
                  value={stats.girPercent}
                  target={50}
                />
                <ProgressStat
                  label="Fairways Hit"
                  value={stats.fwPercent}
                  target={60}
                />
              </div>
            </GlassCard>

            {/* Focus Areas */}
            {focusAreas.length > 0 && (
              <GlassCard className="p-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <IconFlag size={16} />
                  Focus Areas
                </h3>
                <div className="space-y-3">
                  {focusAreas.map((area, idx) => (
                    <div key={area.id} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{area.title}</p>
                        {area.description && (
                          <p className="text-xs text-slate-500 mt-0.5">{area.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </div>

          {/* Middle Column - Insights */}
          <div className="lg:col-span-2 space-y-6">
            {/* AI Insights */}
            <GlassCard className="p-6">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <IconSparkles size={16} className="text-emerald-600" />
                Insights & Recommendations
              </h3>
              {insights.length > 0 ? (
                <div className="space-y-4">
                  {insights.map((insight, idx) => (
                    <InsightCard key={idx} insight={insight} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <IconGolf size={32} className="text-slate-400" />
                  </div>
                  <p className="text-slate-600 font-medium">Play more rounds to unlock insights</p>
                  <p className="text-sm text-slate-400 mt-1">Complete at least 3 rounds to see personalized recommendations</p>
                </div>
              )}
            </GlassCard>

            {/* Recent Rounds */}
            <GlassCard className="p-6">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <IconCalendar size={16} />
                Recent Rounds
              </h3>
              {recentRounds.length > 0 ? (
                <div className="space-y-3">
                  {recentRounds.slice(0, 5).map((round) => (
                    <RoundRow key={round.id} round={round} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-slate-500">No rounds in the last 30 days</p>
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function StatBox({ label, value, subValue, highlight }: { label: string; value: string; subValue?: string; highlight?: boolean }) {
  return (
    <div className={cn('p-3 rounded-xl', highlight ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-slate-50')}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={cn('text-2xl font-bold', highlight ? 'text-emerald-700' : 'text-slate-900')}>{value}</p>
      {subValue && <p className="text-xs text-slate-400 mt-0.5">{subValue}</p>}
    </div>
  );
}

function ProgressStat({ label, value, target }: { label: string; value: number | null; target: number }) {
  const percent = value ?? 0;
  const isGood = percent >= target;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-slate-700">{label}</span>
        <span className={cn('text-sm font-bold', isGood ? 'text-emerald-600' : 'text-slate-600')}>
          {value !== null ? `${percent.toFixed(0)}%` : '--'}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', isGood ? 'bg-emerald-500' : 'bg-slate-400')}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <p className="text-xs text-slate-400 mt-1">Target: {target}%</p>
    </div>
  );
}

interface Insight {
  type: 'strength' | 'improvement' | 'tip';
  title: string;
  description: string;
}

function InsightCard({ insight }: { insight: Insight }) {
  const colors = {
    strength: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600' },
    improvement: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600' },
    tip: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600' },
  };
  const color = colors[insight.type];

  return (
    <div className={cn('p-4 rounded-xl border', color.bg, color.border)}>
      <div className="flex items-start gap-3">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', color.bg)}>
          {insight.type === 'strength' && <IconTrendingUp size={18} className={color.icon} />}
          {insight.type === 'improvement' && <IconTarget size={18} className={color.icon} />}
          {insight.type === 'tip' && <IconSparkles size={18} className={color.icon} />}
        </div>
        <div>
          <p className="font-semibold text-slate-800">{insight.title}</p>
          <p className="text-sm text-slate-600 mt-0.5">{insight.description}</p>
        </div>
      </div>
    </div>
  );
}

function RoundRow({ round }: { round: RecentRound }) {
  const scoreToPar = round.score_to_par ?? 0;
  const scoreColor = scoreToPar < 0 ? 'text-emerald-600' : scoreToPar === 0 ? 'text-slate-700' : 'text-red-500';
  const scoreDisplay = scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar.toString();

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
          <IconGolf size={20} className="text-emerald-600" />
        </div>
        <div>
          <p className="font-medium text-slate-800">{round.course_name || 'Unknown Course'}</p>
          <p className="text-xs text-slate-500">{new Date(round.round_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold text-slate-900">{round.total_score ?? '--'}</p>
        <p className={cn('text-xs font-semibold', scoreColor)}>{scoreDisplay}</p>
      </div>
    </div>
  );
}

function generateInsights(stats: PlayerStats): Insight[] {
  const insights: Insight[] = [];

  if (stats.roundsPlayed < 3) return insights;

  // Putting insights
  if (stats.avgPutts !== null) {
    if (stats.avgPutts <= 30) {
      insights.push({
        type: 'strength',
        title: 'Strong Putting',
        description: `Averaging ${stats.avgPutts.toFixed(1)} putts per round. Keep up the great flat stick work!`,
      });
    } else if (stats.avgPutts > 36) {
      insights.push({
        type: 'improvement',
        title: 'Putting Needs Work',
        description: `Averaging ${stats.avgPutts.toFixed(1)} putts per round. Focus on lag putting and reading greens.`,
      });
    }
  }

  // GIR insights
  if (stats.girPercent !== null) {
    if (stats.girPercent >= 50) {
      insights.push({
        type: 'strength',
        title: 'Solid Ball Striking',
        description: `Hitting ${stats.girPercent.toFixed(0)}% of greens in regulation. Your approach game is solid.`,
      });
    } else if (stats.girPercent < 30) {
      insights.push({
        type: 'improvement',
        title: 'Improve Approach Shots',
        description: `Only ${stats.girPercent.toFixed(0)}% GIR. Work on distance control with your irons.`,
      });
    }
  }

  // Fairway insights
  if (stats.fwPercent !== null) {
    if (stats.fwPercent >= 60) {
      insights.push({
        type: 'strength',
        title: 'Accurate Off the Tee',
        description: `Finding ${stats.fwPercent.toFixed(0)}% of fairways. Great driving accuracy!`,
      });
    } else if (stats.fwPercent < 40) {
      insights.push({
        type: 'improvement',
        title: 'Tee Shot Accuracy',
        description: `Only ${stats.fwPercent.toFixed(0)}% fairways hit. Consider a more controlled tee shot.`,
      });
    }
  }

  // Trend insights
  if (stats.trend === 'improving') {
    insights.push({
      type: 'tip',
      title: 'Momentum Building',
      description: 'Your scores are improving. Stay consistent with your current practice routine.',
    });
  } else if (stats.trend === 'declining') {
    insights.push({
      type: 'tip',
      title: 'Reset and Refocus',
      description: 'Your scores have been trending up. Take time to work on fundamentals.',
    });
  }

  // Best score insight
  if (stats.bestScore !== null && stats.bestScore === stats.allTimeBest) {
    insights.push({
      type: 'strength',
      title: 'Personal Best!',
      description: `You shot your all-time best of ${stats.bestScore} recently. You're playing great golf!`,
    });
  }

  return insights.slice(0, 5); // Limit to 5 insights
}
