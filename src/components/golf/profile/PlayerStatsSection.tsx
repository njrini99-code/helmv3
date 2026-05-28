'use client';

/**
 * PlayerStatsSection - Main orchestrator for player profile stats
 *
 * Handles:
 * - Two-phase data loading (summary → detailed)
 * - Round selector dropdown
 * - Stats caching
 * - Renders all stats subsections
 */

import { useState, useEffect, useRef, memo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  getPlayerProfileStats,
  type RoundOption,
} from '@/app/golf/actions/player-profile-stats';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { KeyMetricsGrid } from './KeyMetricsGrid';
import { GolfTabBar } from '@/components/golf/GolfTabBar';
import { Shimmer } from '@/components/ui/shimmer';
import {
  IconChevronDown,
  IconTrendingUp,
  IconTrendingDown,
  IconTarget,
  IconFlag,
  IconGolf,
  IconChartBar,
  IconAward,
} from '@/components/icons';

// Dynamic imports for charts
const ResponsiveContainer = dynamic(
  () => import('recharts').then(mod => mod.ResponsiveContainer),
  { ssr: false }
);
const ComposedChart = dynamic(
  () => import('recharts').then(mod => mod.ComposedChart),
  { ssr: false }
);
const Line = dynamic(() => import('recharts').then(mod => mod.Line), { ssr: false });
const Bar = dynamic(() => import('recharts').then(mod => mod.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false });
const BarChart = dynamic(() => import('recharts').then(mod => mod.BarChart), { ssr: false });

// ============================================================================
// TYPES
// ============================================================================

interface PlayerStatsSectionProps {
  playerId: string;
  handicap: number | null;
  initialRounds?: RoundOption[];
}

type StatsTab = 'overview' | 'scoring' | 'driving' | 'approach' | 'putting' | 'scrambling';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatScoreToPar(score: number | null): string {
  if (score === null) return '—';
  if (score === 0) return 'E';
  if (score > 0) return `+${score}`;
  return String(score);
}

// ============================================================================
// CHART COMPONENTS
// ============================================================================

function ChartSkeleton() {
  return (
    <div className="relative h-48">
      <Shimmer className="absolute inset-0 h-full rounded-xl" />
      <div className="relative h-full flex items-center justify-center">
        <span className="text-warm-400 text-sm">Loading chart...</span>
      </div>
    </div>
  );
}

const ScoringTrendMini = memo(function ScoringTrendMini({ rounds }: { rounds: RoundOption[] }) {
  if (rounds.length < 2) return null;

  const sortedRounds = [...rounds].slice(0, 10).reverse();
  const chartData = sortedRounds.map(r => ({
    date: formatDate(r.round_date),
    score: r.total_score,
    toPar: r.score_to_par,
  }));

  // Calculate trend
  const scores = sortedRounds.map(r => r.total_score).filter((s): s is number => s !== null);
  const recentHalf = scores.slice(-Math.ceil(scores.length / 2));
  const olderHalf = scores.slice(0, Math.floor(scores.length / 2));
  const recentAvg = recentHalf.length > 0 ? recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length : 0;
  const olderAvg = olderHalf.length > 0 ? olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length : 0;
  const improving = recentAvg < olderAvg;

  return (
    <div className="relative surface-matte rounded-3xl overflow-clip p-5">
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />

      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-warm-900">Scoring Trend</h3>
          <p className="text-xs text-warm-500">Last {sortedRounds.length} rounds</p>
        </div>
        {scores.length >= 4 && (
          <div className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
            improving ? 'bg-primary-50 text-primary-700' : 'bg-amber-50 text-amber-700'
          )}>
            {improving ? <IconTrendingDown size={12} /> : <IconTrendingUp size={12} />}
            {improving ? 'Improving' : 'Rising'}
          </div>
        )}
      </div>

      <Suspense fallback={<ChartSkeleton />}>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                domain={['dataMin - 2', 'dataMax + 2']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  borderRadius: '8px',
                  border: '1px solid #e7e5e4',
                  fontSize: '12px',
                }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="var(--color-primary-600)"
                strokeWidth={2}
                dot={{ fill: 'var(--color-primary-600)', strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: 'var(--color-primary-600)' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Suspense>
    </div>
  );
});

const ScoreDistribution = memo(function ScoreDistribution({ stats }: { stats: GolfStats }) {
  const distribution = [
    { name: 'Eagles', count: stats.totalEagles, color: '#059669' },
    { name: 'Birdies', count: stats.totalBirdies, color: 'var(--color-primary-600)' },
    { name: 'Pars', count: stats.totalPars, color: '#78716c' },
    { name: 'Bogeys', count: stats.totalBogeys, color: '#f59e0b' },
    { name: 'Doubles+', count: stats.totalDoublePlus, color: '#ef4444' },
  ].filter(d => d.count > 0);

  const total = distribution.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return null;

  return (
    <div className="relative surface-matte rounded-3xl overflow-clip p-5">
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />

      <div className="mb-4">
        <h3 className="text-sm font-medium text-warm-900">Score Distribution</h3>
        <p className="text-xs text-warm-500">{total} holes played</p>
      </div>

      <Suspense fallback={<ChartSkeleton />}>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distribution} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: '#78716c' }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  borderRadius: '8px',
                  border: '1px solid #e7e5e4',
                  fontSize: '12px',
                }}
                formatter={(value) => {
                  const numValue = Number(value);
                  return [`${numValue} (${((numValue / total) * 100).toFixed(0)}%)`, 'Count'];
                }}
              />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                fill="var(--color-primary-600)"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Suspense>
    </div>
  );
});

// ============================================================================
// DETAILED STATS TABS
// ============================================================================

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-warm-100 last:border-0">
      <span className="text-sm text-warm-600">{label}</span>
      <span className={cn('text-sm font-medium tabular-nums', highlight ? 'text-primary-600' : 'text-warm-900')}>
        {value}
      </span>
    </div>
  );
}

function StatsTabContent({ tab, stats }: { tab: StatsTab; stats: GolfStats }) {
  switch (tab) {
    case 'scoring':
      return (
        <div className="space-y-1">
          <StatRow label="Scoring Average" value={stats.scoringAverage?.toFixed(1) ?? '—'} highlight />
          <StatRow label="Best Round" value={stats.bestRound?.toString() ?? '—'} />
          <StatRow label="Worst Round" value={stats.worstRound?.toString() ?? '—'} />
          <StatRow label="GIR % (Par 3s)" value={stats.girPctPar3 !== null ? `${stats.girPctPar3.toFixed(0)}%` : '—'} />
          <StatRow label="GIR % (Par 4s)" value={stats.girPctPar4 !== null ? `${stats.girPctPar4.toFixed(0)}%` : '—'} />
          <StatRow label="GIR % (Par 5s)" value={stats.girPctPar5 !== null ? `${stats.girPctPar5.toFixed(0)}%` : '—'} />
          <StatRow label="Best Birdie Streak" value={stats.mostBirdiesRow?.toString() ?? '—'} />
          <StatRow label="Best Par Streak" value={stats.mostParsRow?.toString() ?? '—'} />
        </div>
      );

    case 'driving':
      return (
        <div className="space-y-1">
          <StatRow label="Fairway %" value={stats.fairwayPercentage !== null ? `${stats.fairwayPercentage.toFixed(0)}%` : '—'} highlight />
          <StatRow label="Driver Fairway %" value={stats.fairwayPctDriver !== null ? `${stats.fairwayPctDriver.toFixed(0)}%` : '—'} />
          <StatRow label="Driving Distance (avg)" value={stats.drivingDistanceAvg !== null ? `${stats.drivingDistanceAvg.toFixed(0)} yds` : '—'} />
          <StatRow label="Miss Left %" value={stats.missLeftPct !== null ? `${stats.missLeftPct.toFixed(0)}%` : '—'} />
          <StatRow label="Miss Right %" value={stats.missRightPct !== null ? `${stats.missRightPct.toFixed(0)}%` : '—'} />
        </div>
      );

    case 'approach':
      return (
        <div className="space-y-1">
          <StatRow label="GIR %" value={stats.girPercentage !== null ? `${stats.girPercentage.toFixed(0)}%` : '—'} highlight />
          <StatRow label="GIR from Fairway" value={stats.girPctFromFairway !== null ? `${stats.girPctFromFairway.toFixed(0)}%` : '—'} />
          <StatRow label="GIR from Rough" value={stats.girPctFromRough !== null ? `${stats.girPctFromRough.toFixed(0)}%` : '—'} />
          <StatRow label="Approach Proximity (avg)" value={stats.approachProximityAvg !== null ? `${stats.approachProximityAvg.toFixed(0)} ft` : '—'} />
          <StatRow label="Proximity 125-150 yds" value={stats.approachProx125_150 !== null ? `${stats.approachProx125_150.toFixed(0)} ft` : '—'} />
          <StatRow label="Proximity 175-200 yds" value={stats.approachProx175_200 !== null ? `${stats.approachProx175_200.toFixed(0)} ft` : '—'} />
        </div>
      );

    case 'putting':
      return (
        <div className="space-y-1">
          <StatRow label="Putts / Round" value={stats.puttsPerRound?.toFixed(1) ?? '—'} highlight />
          <StatRow label="Putts / GIR" value={stats.puttsPerGir?.toFixed(2) ?? '—'} />
          <StatRow label="1-Putts" value={stats.onePuttsTotal?.toString() ?? '—'} />
          <StatRow label="3-Putts" value={stats.threePuttsTotal?.toString() ?? '—'} />
          <StatRow label="Make % (3-5 ft)" value={stats.puttMakePct3_5 !== null ? `${stats.puttMakePct3_5.toFixed(0)}%` : '—'} />
          <StatRow label="Make % (5-10 ft)" value={stats.puttMakePct5_10 !== null ? `${stats.puttMakePct5_10.toFixed(0)}%` : '—'} />
          <StatRow label="Make % (10-15 ft)" value={stats.puttMakePct10_15 !== null ? `${stats.puttMakePct10_15.toFixed(0)}%` : '—'} />
        </div>
      );

    case 'scrambling':
      return (
        <div className="space-y-1">
          <StatRow label="Scrambling %" value={stats.scramblingPercentage !== null ? `${stats.scramblingPercentage.toFixed(0)}%` : '—'} highlight />
          <StatRow label="Sand Save %" value={stats.sandSavePercentage !== null ? `${stats.sandSavePercentage.toFixed(0)}%` : '—'} />
          <StatRow label="Scrambles Made" value={`${stats.scramblesMade}/${stats.scrambleAttempts}`} />
          <StatRow label="Sand Saves Made" value={`${stats.sandSavesMade}/${stats.sandSaveAttempts}`} />
          <StatRow label="Scrambling from Rough" value={stats.scramblingPctRough !== null ? `${stats.scramblingPctRough.toFixed(0)}%` : '—'} />
        </div>
      );

    default:
      return null;
  }
}

const DetailedStatsTabs = memo(function DetailedStatsTabs({ stats }: { stats: GolfStats }) {
  const [activeTab, setActiveTab] = useState<StatsTab>('scoring');

  const tabs: { id: StatsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'scoring', label: 'Scoring', icon: <IconAward size={14} /> },
    { id: 'driving', label: 'Driving', icon: <IconGolf size={14} /> },
    { id: 'approach', label: 'Approach', icon: <IconTarget size={14} /> },
    { id: 'putting', label: 'Putting', icon: <IconFlag size={14} /> },
    { id: 'scrambling', label: 'Scrambling', icon: <IconChartBar size={14} /> },
  ];

  return (
    <div className="relative surface-matte rounded-3xl overflow-clip">
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />

      {/* Tab Navigation */}
      <div className="border-b border-warm-100 p-2">
        <GolfTabBar
          tabs={tabs}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Detailed player stats"
          scrollable
          compact
          className="-mx-2 px-2"
        />
      </div>

      {/* Tab Content */}
      <div className="p-5">
        <StatsTabContent tab={activeTab} stats={stats} />
      </div>
    </div>
  );
});

// ============================================================================
// EMPTY STATE
// ============================================================================

function NoStatsPlaceholder() {
  return (
    <div className="relative surface-matte rounded-3xl overflow-clip p-12 text-center">
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />
      <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
        <IconTarget size={28} className="text-warm-400" />
      </div>
      <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em] mb-2">No Stats Available</h3>
      <p className="text-sm text-warm-500 max-w-sm mx-auto">
        Complete rounds with shot-by-shot tracking to see detailed statistics and spray charts.
      </p>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const PlayerStatsSection = memo(function PlayerStatsSection({
  playerId,
  handicap,
  initialRounds = [],
}: PlayerStatsSectionProps) {
  const [stats, setStats] = useState<GolfStats | null>(null);
  const [rounds, setRounds] = useState<RoundOption[]>(initialRounds);
  const [selectedRoundId, setSelectedRoundId] = useState<string | 'overall'>('overall');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cache stats by round ID
  const statsCache = useRef<Map<string, GolfStats>>(new Map());

  // Load stats on mount and when round selection changes
  useEffect(() => {
    async function loadStats() {
      const cacheKey = `${playerId}-${selectedRoundId}`;

      // Check cache first
      if (statsCache.current.has(cacheKey)) {
        setStats(statsCache.current.get(cacheKey)!);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const result = await getPlayerProfileStats(playerId, selectedRoundId);

      if (!result.success) {
        setError(result.error || 'Failed to load stats');
        setLoading(false);
        return;
      }

      // Update rounds list if we got new data
      if (result.rounds.length > 0) {
        setRounds(result.rounds);
      }

      // Cache and set stats
      if (result.stats) {
        statsCache.current.set(cacheKey, result.stats);
      }
      setStats(result.stats);
      setLoading(false);
    }

    loadStats();
  }, [playerId, selectedRoundId]);

  // Get selected round info for display
  const selectedRound = selectedRoundId !== 'overall'
    ? rounds.find(r => r.id === selectedRoundId)
    : null;

  return (
    <div className="space-y-6">
      {/* Section Header with Round Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Performance Stats</h2>
          <p className="text-sm text-warm-500">
            {selectedRoundId === 'overall'
              ? `Overall statistics from ${rounds.length} rounds`
              : selectedRound
                ? `${selectedRound.course_name || 'Round'} • ${new Date(selectedRound.round_date).toLocaleDateString()}`
                : 'Select a round'}
          </p>
        </div>

        {/* Round Selector Dropdown */}
        {rounds.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 px-4 py-2 bg-white border border-warm-200 rounded-lg text-sm font-medium text-warm-700 hover:bg-warm-50 active:bg-warm-100 transition-colors data-[state=open]:bg-warm-50"
                aria-label="Select round"
              >
                {selectedRoundId === 'overall' ? 'Overall' : 'Single Round'}
                <IconChevronDown size={16} className="transition-transform data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-auto">
              <DropdownMenuItem
                selected={selectedRoundId === 'overall'}
                onSelect={() => setSelectedRoundId('overall')}
              >
                Overall (All Rounds)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {rounds.slice(0, 15).map(round => (
                <DropdownMenuItem
                  key={round.id}
                  selected={selectedRoundId === round.id}
                  onSelect={() => setSelectedRoundId(round.id)}
                  className="flex-col items-start gap-0.5"
                >
                  <div className="font-medium">{round.course_name || 'Round'}</div>
                  <div className="text-xs text-warm-500 flex items-center gap-2">
                    <span>{new Date(round.round_date).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>{round.total_score} ({formatScoreToPar(round.score_to_par)})</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Key Metrics Grid */}
      <KeyMetricsGrid
        stats={stats}
        handicap={handicap}
        loading={loading}
      />

      {/* No Stats Placeholder */}
      {!loading && !stats && <NoStatsPlaceholder />}

      {/* Stats Content (when loaded) */}
      {!loading && stats && stats.holesPlayed > 0 && (
        <>
          {/* Trends Section */}
          {rounds.length >= 2 && selectedRoundId === 'overall' && (
            <div>
              <h3 className="text-[15px] font-medium text-warm-900 tracking-[-0.005em] mb-3">Performance Trends</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ScoringTrendMini rounds={rounds} />
                <ScoreDistribution stats={stats} />
              </div>
            </div>
          )}

          {/* Detailed Stats Tabs */}
          <div>
            <h3 className="text-[15px] font-medium text-warm-900 tracking-[-0.005em] mb-3">Detailed Statistics</h3>
            <DetailedStatsTabs stats={stats} />
          </div>
        </>
      )}
    </div>
  );
});
